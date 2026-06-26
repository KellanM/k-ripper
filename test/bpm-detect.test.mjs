// End-to-end tempo-detection efficacy check (opt-in).
//
//   KRIPPER_AUDIO=1 node --test test
//
// Off by default: it shells out to the bundled ffmpeg and runs the vendored
// music-tempo analyzer, neither of which exists on the unit-test CI runner
// (binaries are gitignored). When enabled, it synthesizes click tracks at known
// tempos and asserts the *real* pipeline — ffmpegAnalysisArgs -> ffmpeg decode
// -> music-tempo -> finalizeBpm — recovers them. This is what guards against a
// library/flag change silently wrecking accuracy.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { ffmpegAnalysisArgs, finalizeBpm } from "../kripper/lib.mjs";

const ENABLED = process.env.KRIPPER_AUDIO === "1";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function findFfmpeg() {
  const bin = path.join(__dirname, "..", "kripper", "bin");
  for (const name of ["ffmpeg.exe", "ffmpeg-x64", "ffmpeg-arm64", "ffmpeg"]) {
    const p = path.join(bin, name);
    if (fs.existsSync(p)) return p;
  }
  return "ffmpeg"; // fall back to a system install
}

function loadMusicTempo() {
  const require = createRequire(import.meta.url);
  return require("../kripper/vendor/music-tempo/MusicTempo.js");
}

// Synthesize a clean 1kHz click every beat at `bpm` for `secs` seconds.
function makeClick(ffmpeg, bpm, secs, outPath) {
  const beat = 60 / bpm;
  const expr = `0.6*sin(2*PI*1000*t)*lt(mod(t,${beat}),0.02)`;
  const r = spawnSync(ffmpeg, [
    "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", `aevalsrc='${expr}':s=44100:d=${secs}`,
    "-y", outPath,
  ]);
  if (r.status !== 0) throw new Error(`ffmpeg click gen failed: ${r.stderr}`);
}

function detect(ffmpeg, MusicTempo, wavPath) {
  const r = spawnSync(ffmpeg, ffmpegAnalysisArgs(wavPath), { maxBuffer: 1 << 28 });
  const b = r.stdout;
  const samples = new Float32Array(b.buffer, b.byteOffset, Math.floor(b.length / 4));
  const mt = new MusicTempo(Array.from(samples));
  return finalizeBpm(mt.tempo);
}

test("BPM detection recovers known tempos (opt-in: KRIPPER_AUDIO=1)", { skip: !ENABLED }, () => {
  const ffmpeg = findFfmpeg();
  const MusicTempo = loadMusicTempo();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kripper-bpm-"));
  try {
    for (const bpm of [90, 124, 128, 174]) {
      const wav = path.join(tmp, `click_${bpm}.wav`);
      makeClick(ffmpeg, bpm, 30, wav);
      const got = detect(ffmpeg, MusicTempo, wav);
      // Allow ±1 for rounding; octave-folding keeps these in band.
      assert.ok(Math.abs(got - bpm) <= 1, `expected ~${bpm}, got ${got}`);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
