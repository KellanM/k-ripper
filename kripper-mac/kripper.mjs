// K-Ripper — Node for Max bridge.
// Spawns bundled yt-dlp and ffmpeg directly; no separate backend.
//
// Message contract (from Max):
//   rip <url>           — url == "_USE_CLIPBOARD_" reads from system clipboard
//   cancel              — abort the in-flight rip
// Outlet messages (to Max):
//   status <text>       human-friendly progress
//   progress <0..100>   integer percent
//   track <name>        resolved track name, as soon as it's known
//   art <absPath>       cover art JPG, once downloaded
//   source <url>        the URL actually being ripped (for icon highlight)
//   bpm <int|none>      detected tempo, sent just before `done` (none = unknown)
//   done <absPath>      final WAV path to load into a clip slot
//   cancelled           rip aborted by the user (not an error)
//   error <text>        short, friendly failure reason (full detail in console)
//
// WAV conversion is forced — Live's create_audio_clip rejects .m4a.

import Max from "max-api";
import { spawn, exec } from "child_process";
import { promisify } from "util";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import path from "path";
import fs from "fs";
import os from "os";
import { AUDIO_EXT, extractUrl, pickAudio, pickArt, stripExt, wavName, parseProgress, classifyError, isNewer, ffmpegAnalysisArgs, finalizeBpm } from "./lib.mjs";

// music-tempo is a CommonJS module vendored under ./vendor (no npm install at
// runtime — the device ships self-contained). createRequire lets this ESM
// engine pull it in.
const require = createRequire(import.meta.url);
let MusicTempo = null;
try {
  MusicTempo = require("./vendor/music-tempo/MusicTempo.js");
} catch (e) {
  // Tempo detection is a nice-to-have; a missing/broken vendor dir must never
  // stop the device from ripping. Rips just won't carry a BPM label.
  Max.post(`[k-ripper] tempo detection unavailable: ${e && e.message ? e.message : e}`);
}

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Layout: <device-root>/kripper.mjs and <device-root>/bin/<binaries>
const ROOT = __dirname;
const BIN = path.join(ROOT, "bin");

const YTDLP = path.join(BIN, process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp");

function resolveFfmpeg() {
  if (process.platform === "win32") return path.join(BIN, "ffmpeg.exe");
  if (process.platform === "darwin") {
    // Per-arch builds: Apple Silicon Max runs natively (process.arch=arm64),
    // Intel or Rosetta Max reports x64 — and the x64 build works under both.
    const archSpecific = path.join(BIN, process.arch === "arm64" ? "ffmpeg-arm64" : "ffmpeg-x64");
    if (fs.existsSync(archSpecific)) return archSpecific;
  }
  return path.join(BIN, "ffmpeg"); // legacy single-binary layout
}
const FFMPEG = resolveFfmpeg();

// Rips land in ~/Music/K-Ripper — NOT inside the device folder. Keeps the
// User Library clean, survives reinstall/uninstall, and Live sets that
// reference ripped clips don't break when K-Ripper is updated or removed.
const DOWNLOADS = process.env.KRIPPER_OUTPUT || path.join(os.homedir(), "Music", "K-Ripper");

const YTDLP_TIMEOUT_MS = 30 * 60 * 1000; // 30 min — covers multi-hour DJ sets
const FFMPEG_TIMEOUT_MS = 10 * 60 * 1000;

// Build version. Bump this together with the installer's MyAppVersion.
const KRIPPER_VERSION = "0.4.0";

// Update check: on load, the device fetches a tiny JSON manifest and, if a
// newer version is published, nudges the user in the status line. This is how
// fixes reach people after install — without it, every shipped bug is
// permanent. Fire-and-forget: never blocks, never fails a rip, silent offline.
//
// SET THIS once the GitHub repo exists. Point it at a RAW file URL, e.g.
//   https://raw.githubusercontent.com/<you>/k-ripper/main/version.json
// Manifest shape: { "version": "0.4.0", "url": "https://.../releases/latest" }
// Until it's a real URL (or if the host is unreachable) the check no-ops.
const UPDATE_MANIFEST_URL = process.env.KRIPPER_UPDATE_URL ||
  "https://raw.githubusercontent.com/KellanM/k-ripper/main/version.json";

let busy = false;
let updatePromise = null;
let currentChild = null;
let cancelRequested = false;

// yt-dlp is a PyInstaller bundle: the spawned process is a launcher whose
// child does the real work. child.kill() only kills the launcher and the
// orphan keeps the stdio pipes open, so 'close' never fires and the rip
// hangs. Always kill the whole tree.
function killTree(child) {
  if (!child) return;
  if (process.platform === "win32") {
    try {
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true });
    } catch {
      try { child.kill(); } catch {}
    }
  } else {
    // POSIX: children are spawned detached so the negative pid kills the group.
    try { process.kill(-child.pid, "SIGKILL"); } catch {
      try { child.kill("SIGKILL"); } catch {}
    }
  }
}

const SPAWN_OPTS = { windowsHide: true, detached: process.platform !== "win32" };

function friendlyError(raw) {
  Max.post(`[k-ripper] error detail: ${String(raw || "unknown error")}`);
  return classifyError(raw);
}

function ensureDownloadsDir() {
  fs.mkdirSync(DOWNLOADS, { recursive: true });
}

async function readClipboard() {
  let cmd;
  if (process.platform === "win32") {
    cmd = 'powershell -NoProfile -Command "Get-Clipboard -Raw"';
  } else if (process.platform === "darwin") {
    cmd = "pbpaste";
  } else {
    cmd = "xclip -selection clipboard -o";
  }
  const { stdout } = await execAsync(cmd);
  return stdout.trim();
}

// Download into an empty staging dir and resolve the produced file from the
// filesystem — NOT from yt-dlp's stdout. yt-dlp's --print after_move:filepath
// only fires when a "move" happens (HLS/remux, e.g. SoundCloud) and stays
// silent for direct single-file downloads (e.g. YouTube), and any path it
// does print can be mangled by Windows console encoding when the title has
// non-ASCII chars (YouTube turns "|" into the fullwidth U+FF5C). Reading the
// directory sidesteps both problems and works for every site.
//
// Resolves { audio, art } absolute paths (art may be null).
function runYtdlp(url, stageDir) {
  return new Promise((resolve, reject) => {
    fs.rmSync(stageDir, { recursive: true, force: true });
    fs.mkdirSync(stageDir, { recursive: true });

    const args = [
      "-f", "bestaudio/best",
      "-o", path.join(stageDir, "%(uploader)s - %(title)s.%(ext)s"),
      "--no-warnings",
      "--newline",
      "--ffmpeg-location", FFMPEG,
      // Resilience: SoundCloud's CDN throws transient 404s under bursts.
      "--retries", "5",
      "--extractor-retries", "3",
      "--retry-sleep", "2",
      "--socket-timeout", "20",
      // Parallel HLS fragments — ~3-4x faster on long sets.
      "--concurrent-fragments", "4",
      // One paste = one track. Playlist/set URLs rip only the linked item.
      "--no-playlist",
      // Cover art for the device display; JPG because Max's fpic can't webp.
      "--write-thumbnail",
      "--convert-thumbnails", "jpg",
      url,
    ];
    const child = spawn(YTDLP, args, SPAWN_OPTS);
    currentChild = child;

    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
    }, YTDLP_TIMEOUT_MS);

    child.stdout.on("data", (buf) => {
      for (const line of buf.toString().split(/\r?\n/)) {
        if (!line.trim()) continue;
        const p = parseProgress(line);
        if (p !== null) Max.outlet("progress", p);
      }
    });
    child.stderr.on("data", (buf) => { stderr += buf.toString(); });

    child.on("error", (e) => {
      clearTimeout(timer);
      if (currentChild === child) currentChild = null;
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (currentChild === child) currentChild = null;
      if (timedOut) { reject(new Error("download timed out")); return; }
      if (code !== 0) {
        const msg = stderr.split(/\r?\n/).filter(Boolean).pop() || `yt-dlp exit ${code}`;
        reject(new Error(msg));
        return;
      }
      // The staging dir was empty; the produced audio file is unambiguous.
      let files;
      try { files = fs.readdirSync(stageDir); } catch { files = []; }
      const audioName = pickAudio(files);
      if (!audioName) { reject(new Error("no audio file produced")); return; }
      const jpgName = pickArt(files);
      resolve({
        audio: path.join(stageDir, audioName),
        art: jpgName ? path.join(stageDir, jpgName) : null,
      });
    });
  });
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG, args, SPAWN_OPTS);
    currentChild = child;
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
    }, FFMPEG_TIMEOUT_MS);

    child.stderr.on("data", (buf) => { stderr += buf.toString(); });
    child.on("error", (e) => {
      clearTimeout(timer);
      if (currentChild === child) currentChild = null;
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (currentChild === child) currentChild = null;
      if (timedOut) {
        reject(new Error("conversion timed out"));
      } else if (code !== 0) {
        reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-200)}`));
      } else {
        resolve();
      }
    });
  });
}

// Convert the staged source to a WAV in destDir, keeping the source basename.
async function convertToWav(srcPath, destDir) {
  const wavPath = path.join(destDir, wavName(path.basename(srcPath)));
  if (fs.existsSync(wavPath)) {
    try {
      // Could be a stale partial from a cancelled run — rebuild fresh.
      fs.unlinkSync(wavPath);
    } catch {
      // Locked: Live has it loaded in a clip right now, which also means
      // it's a complete previous conversion of this same source. Reuse it
      // instead of failing on the overwrite (ffmpeg would exit EACCES).
      Max.post("[k-ripper] existing WAV is loaded in Live — reusing it");
      return wavPath;
    }
  }
  await runFfmpeg(["-y", "-i", srcPath, "-c:a", "pcm_s16le", wavPath]);
  return wavPath;
}

// Decode a window of the finished WAV to mono 44.1kHz float PCM and run tempo
// detection on it. Best-effort: any failure (no analyzer, decode error, too
// little audio, no confident tempo) resolves to null so the rip still
// completes — the clip just won't carry a BPM label. Never throws.
function detectBpm(wavPath) {
  return new Promise((resolve) => {
    if (!MusicTempo) { resolve(null); return; }
    const args = ffmpegAnalysisArgs(wavPath);
    let child;
    try {
      child = spawn(FFMPEG, args, { windowsHide: true, detached: process.platform !== "win32" });
    } catch { resolve(null); return; }
    currentChild = child;

    const chunks = [];
    let bytes = 0;
    let done = false;
    const finish = (val) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (currentChild === child) currentChild = null;
      resolve(val);
    };
    // Hard ceiling so a pathological decode can't wedge the device.
    const timer = setTimeout(() => { killTree(child); finish(null); }, 60 * 1000);

    child.stdout.on("data", (b) => { chunks.push(b); bytes += b.length; });
    child.stderr.on("data", () => {});
    child.on("error", () => finish(null));
    child.on("close", () => {
      // Need a few seconds of audio to trust a tempo at all.
      if (bytes < 44100 * 4 * 5) { finish(null); return; }
      try {
        const buf = Buffer.concat(chunks, bytes);
        const samples = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.length / 4));
        const mt = new MusicTempo(Array.from(samples));
        finish(finalizeBpm(mt && mt.tempo));
      } catch (e) {
        Max.post(`[k-ripper] tempo analysis failed: ${e && e.message ? e.message : e}`);
        finish(null);
      }
    });
  });
}

const STAGE_DIR = path.join(DOWNLOADS, ".staging");

Max.addHandler("rip", async (rawUrl) => {
  if (busy) {
    Max.outlet("status", "already ripping — hang on");
    return;
  }
  busy = true;
  try {
    if (!fs.existsSync(YTDLP) || !fs.existsSync(FFMPEG)) {
      Max.outlet("error", "engine missing — reinstall");
      return;
    }
    // If a startup self-update is mid-flight, let it finish first so we
    // never spawn a binary that's being replaced.
    if (updatePromise) {
      await updatePromise;
      updatePromise = null;
    }
    ensureDownloadsDir();

    // Resolve URL: explicit -> clipboard fallback -> validate
    let urlStr = typeof rawUrl === "string" ? rawUrl.trim() : "";
    if (!urlStr || urlStr === "_USE_CLIPBOARD_") {
      urlStr = (await readClipboard()).trim();
    }
    const url = extractUrl(urlStr);
    if (!url) {
      Max.post(`[k-ripper] no URL in input: ${JSON.stringify(urlStr.slice(0, 80))}`);
      Max.outlet("error", "no URL found");
      return;
    }
    Max.post(`rip: ${url}`);
    Max.outlet("source", url);

    Max.outlet("status", "fetching source...");
    const { audio, art } = await runYtdlp(url, STAGE_DIR);
    if (cancelRequested) {
      Max.outlet("cancelled");
      return;
    }
    Max.outlet("track", stripExt(path.basename(audio)));

    // Move cover art into the final folder so its path is stable for display.
    if (art) {
      try {
        const artFinal = path.join(DOWNLOADS, path.basename(art));
        fs.copyFileSync(art, artFinal);
        Max.outlet("art", path.resolve(artFinal));
      } catch {}
    }

    Max.outlet("status", "converting...");
    const outPath = await convertToWav(audio, DOWNLOADS);
    if (cancelRequested) {
      Max.outlet("cancelled");
      return;
    }

    // Detect tempo so the clip lands labeled with its BPM. Best-effort and
    // quick (~1-2s); never blocks the result — on failure bpm is just "none".
    Max.outlet("status", "analyzing tempo...");
    const bpm = await detectBpm(outPath);
    if (cancelRequested) {
      Max.outlet("cancelled");
      return;
    }
    Max.outlet("bpm", bpm == null ? "none" : bpm);

    Max.outlet("done", path.resolve(outPath));
  } catch (e) {
    if (cancelRequested) {
      Max.outlet("cancelled");
    } else {
      Max.outlet("error", friendlyError(e && e.message ? e.message : e));
    }
  } finally {
    // Always clear the staging dir — it only holds one rip's intermediates.
    try { fs.rmSync(STAGE_DIR, { recursive: true, force: true }); } catch {}
    busy = false;
    cancelRequested = false;
    currentChild = null;
  }
});

Max.addHandler("cancel", () => {
  if (!busy) return;
  cancelRequested = true;
  killTree(currentChild);
});

Max.addHandler("ping", () => {
  Max.outlet("status", `K-Ripper ready (yt-dlp at ${YTDLP})`);
});

// Fire-and-forget self-update at load: extractors rot as platforms change
// their APIs, and yt-dlp ships fixes near-daily. Never blocks or fails a rip.
function selfUpdateYtdlp() {
  if (!fs.existsSync(YTDLP)) return;
  try {
    const child = spawn(YTDLP, ["-U"], { windowsHide: true });
    let out = "";
    child.stdout.on("data", (b) => { out += b.toString(); });
    child.on("error", () => {});
    updatePromise = new Promise((resolve) => {
      child.on("close", (code) => {
        const last = out.trim().split(/\r?\n/).pop() || "";
        Max.post(`yt-dlp self-update: ${code === 0 ? (last || "ok") : "skipped (non-fatal)"}`);
        resolve();
      });
    });
  } catch {
    // never fatal
  }
}
selfUpdateYtdlp();

// Fire-and-forget update check. Any failure (offline, placeholder URL still
// set, malformed JSON) is swallowed — the device works regardless.
async function checkForUpdate() {
  if (/REPLACE_ME/.test(UPDATE_MANIFEST_URL)) return; // not configured yet
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(UPDATE_MANIFEST_URL, { signal: ctrl.signal, cache: "no-store" });
    clearTimeout(t);
    if (!res.ok) return;
    const manifest = await res.json();
    if (manifest && manifest.version && isNewer(manifest.version, KRIPPER_VERSION)) {
      Max.outlet("update", String(manifest.version));
      if (manifest.url) Max.post(`K-Ripper ${manifest.version} available: ${manifest.url}`);
    }
  } catch {
    // never fatal
  }
}
checkForUpdate();

Max.outlet("reset");
Max.post(`K-Ripper v${KRIPPER_VERSION} engine online. ffmpeg: ${path.basename(FFMPEG)} | output: ${DOWNLOADS}`);
