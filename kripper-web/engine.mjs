// K-Ripper Web — rip pipeline. Modeled on the device engine (kripper.mjs)
// but Max-free: events go to an injected emit(), cancellation is a canceller
// callback, and the original download is kept untouched — no WAV conversion.

import { spawn } from "child_process";
import { Worker } from "worker_threads";
import path from "path";
import fs from "fs";
import { pickAudio, pickArt, stripExt, parseProgress, classifyError } from "./lib.mjs";
import { uniquePath, parsePlaylistEntries } from "./weblib.mjs";

const YTDLP_TIMEOUT_MS = 30 * 60 * 1000; // covers multi-hour DJ sets
const ENUM_TIMEOUT_MS = 60 * 1000;
const ANALYSIS_TIMEOUT_MS = 120 * 1000;

export function resolveBinPaths(binDir) {
  if (process.platform === "win32") {
    return { ytdlpPath: path.join(binDir, "yt-dlp.exe"), ffmpegPath: path.join(binDir, "ffmpeg.exe") };
  }
  const ff = process.platform === "darwin"
    ? path.join(binDir, process.arch === "arm64" ? "ffmpeg-arm64" : "ffmpeg-x64")
    : path.join(binDir, "ffmpeg");
  return { ytdlpPath: path.join(binDir, "yt-dlp"), ffmpegPath: fs.existsSync(ff) ? ff : path.join(binDir, "ffmpeg") };
}

// yt-dlp is a PyInstaller bundle: kill the whole tree or the orphaned worker
// keeps the pipes open and 'close' never fires (same fix as the device).
function killTree(child) {
  if (!child) return;
  if (process.platform === "win32") {
    try { spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true }); }
    catch { try { child.kill(); } catch {} }
  } else {
    try { process.kill(-child.pid, "SIGKILL"); } catch { try { child.kill("SIGKILL"); } catch {} }
  }
}

const SPAWN_OPTS = { windowsHide: true, detached: process.platform !== "win32" };

function run(cmd, preArgs, args, { timeoutMs, onStdoutLine, register }) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, [...(preArgs || []), ...args], SPAWN_OPTS);
    if (register) register(child);
    let stdout = "", stderr = "", timedOut = false;
    const timer = setTimeout(() => { timedOut = true; killTree(child); }, timeoutMs);
    child.stdout.on("data", (b) => {
      const s = b.toString(); stdout += s;
      if (onStdoutLine) for (const line of s.split(/\r?\n/)) if (line.trim()) onStdoutLine(line);
    });
    child.stderr.on("data", (b) => { stderr += b.toString(); });
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) return reject(new Error("download timed out"));
      if (code !== 0) return reject(new Error(stderr.split(/\r?\n/).filter(Boolean).pop() || `exit ${code}`));
      resolve(stdout);
    });
  });
}

export async function enumeratePlaylist(url, { ytdlpPath, ytdlpPreArgs }) {
  const stdout = await run(ytdlpPath, ytdlpPreArgs, [
    "--flat-playlist", "--print", "%(url)s\t%(title)s", "--no-warnings", url,
  ], { timeoutMs: ENUM_TIMEOUT_MS });
  return parsePlaylistEntries(stdout);
}

function runAnalysis(audioPath, ffmpegPath) {
  return new Promise((resolve) => {
    let settled = false, timer = null, worker;
    const finish = (v) => { if (!settled) { settled = true; clearTimeout(timer); resolve(v); } };
    try {
      worker = new Worker(new URL("./analysis-worker.mjs", import.meta.url), {
        workerData: { audioPath, ffmpegPath },
        execArgv: [], // never inherit host loaders into the worker
      });
    } catch { return resolve({ bpm: null, keyInfo: null }); }
    timer = setTimeout(() => { try { worker.terminate(); } catch {} finish({ bpm: null, keyInfo: null }); }, ANALYSIS_TIMEOUT_MS);
    worker.on("message", (m) => {
      if (m && m.type === "result") { finish({ bpm: m.bpm ?? null, keyInfo: m.keyInfo ?? null }); try { worker.terminate(); } catch {} }
    });
    worker.on("error", () => finish({ bpm: null, keyInfo: null }));
    worker.on("exit", () => finish({ bpm: null, keyInfo: null }));
  });
}

// The full rip for one job. Emits the device vocabulary; always settles by
// emitting done/cancelled/error (never throws for expected failures).
export async function rip(url, opts) {
  const { emit, setCanceller, outputDir, stagingRoot, jobId, ytdlpPath, ffmpegPath, ytdlpPreArgs } = opts;
  const stageDir = path.join(stagingRoot, String(jobId));
  let cancelled = false;
  let child = null;
  setCanceller(() => { cancelled = true; killTree(child); });

  try {
    fs.rmSync(stageDir, { recursive: true, force: true });
    fs.mkdirSync(stageDir, { recursive: true });
    fs.mkdirSync(outputDir, { recursive: true });

    emit("status", "fetching source...");
    await run(ytdlpPath, ytdlpPreArgs, [
      "-f", "bestaudio/best",
      "-o", path.join(stageDir, "%(uploader)s - %(title)s.%(ext)s"),
      "--no-warnings", "--newline",
      "--ffmpeg-location", ffmpegPath,
      "--retries", "5", "--extractor-retries", "3", "--retry-sleep", "2",
      "--socket-timeout", "20", "--concurrent-fragments", "4",
      "--no-playlist",
      "--write-thumbnail", "--convert-thumbnails", "jpg",
      url,
    ], {
      timeoutMs: YTDLP_TIMEOUT_MS,
      onStdoutLine: (line) => { const p = parseProgress(line); if (p !== null) emit("progress", p); },
      register: (c) => { child = c; },
    });
    if (cancelled) { emit("cancelled"); return; }

    const files = fs.readdirSync(stageDir);
    const audioName = pickAudio(files);
    if (!audioName) throw new Error("no audio file produced");
    emit("track", stripExt(audioName));

    // Move the ORIGINAL file into the library — no conversion, highest fidelity.
    const finalAudio = uniquePath(outputDir, audioName, fs.existsSync);
    fs.renameSync(path.join(stageDir, audioName), finalAudio);

    const artName = pickArt(files);
    if (artName) {
      try {
        const finalArt = path.join(outputDir, path.basename(finalAudio, path.extname(finalAudio)) + ".jpg");
        fs.copyFileSync(path.join(stageDir, artName), finalArt);
        emit("art", path.basename(finalArt));
      } catch {}
    }

    emit("status", "analyzing tempo + key...");
    const { bpm, keyInfo } = await runAnalysis(finalAudio, ffmpegPath);
    if (cancelled) { emit("cancelled"); return; }
    emit("bpm", bpm == null ? "none" : bpm);
    if (keyInfo) emit("key", keyInfo.camelot, keyInfo.label); else emit("key", "none");

    emit("done", path.resolve(finalAudio));
  } catch (e) {
    if (cancelled) emit("cancelled");
    else emit("error", classifyError(e && e.message ? e.message : e));
  } finally {
    try { fs.rmSync(stageDir, { recursive: true, force: true }); } catch {}
  }
}
