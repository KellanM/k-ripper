// End-to-end key-detection efficacy check (opt-in).
//
//   KRIPPER_AUDIO=1 node --test test
//
// Off by default (shells out to bundled ffmpeg + the vendored NNLS chroma,
// absent on the CI runner). When enabled, it synthesizes triads of known key
// and asserts the real pipeline — ffmpeg decode → chroma(nnls) → averaged
// frames → detectKeyFromChroma — recovers them. Guards against a chroma/profile
// change silently wrecking accuracy.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { ffmpegAnalysisArgs, detectKeyFromChroma } from "../kripper/lib.mjs";

const ENABLED = process.env.KRIPPER_AUDIO === "1";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function findFfmpeg() {
  const bin = path.join(__dirname, "..", "kripper", "bin");
  for (const name of ["ffmpeg.exe", "ffmpeg-x64", "ffmpeg-arm64", "ffmpeg"]) {
    const p = path.join(bin, name);
    if (fs.existsSync(p)) return p;
  }
  return "ffmpeg";
}

// Triads (root-position) as summed sine partials -> a clear key.
const TRIADS = {
  "C":  [261.63, 329.63, 392.00],  // C major  -> 8B
  "Am": [440.00, 523.25, 659.25],  // A minor  -> 8A
  "G":  [392.00, 493.88, 587.33],  // G major  -> 9B
  "Em": [329.63, 392.00, 493.88],  // E minor  -> 9A
};

function makeTriad(ffmpeg, freqs, secs, outPath) {
  const expr = "0.3*(" + freqs.map((f) => `sin(2*PI*${f}*t)`).join("+") + ")";
  const r = spawnSync(ffmpeg, [
    "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", `aevalsrc='${expr}':s=44100:d=${secs}`,
    "-y", outPath,
  ]);
  if (r.status !== 0) throw new Error(`ffmpeg triad gen failed: ${r.stderr}`);
}

async function detectKey(ffmpeg, wavPath) {
  const { default: chroma } = await import("../kripper/vendor/pitch-detection/chroma.js");
  const r = spawnSync(ffmpeg, ffmpegAnalysisArgs(wavPath), { maxBuffer: 1 << 28 });
  const b = r.stdout;
  const samples = new Float32Array(b.buffer, b.byteOffset, Math.floor(b.length / 4));
  const N = 8192;
  const acc = new Float64Array(12);
  let nf = 0;
  for (let i = 0; i + N <= samples.length; i += N) {
    const c = chroma(samples.subarray(i, i + N), { fs: 44100, method: "nnls" });
    for (let k = 0; k < 12; k++) acc[k] += c[k];
    nf++;
  }
  for (let k = 0; k < 12; k++) acc[k] /= nf;
  return detectKeyFromChroma(acc, "shaath");
}

test("key detection recovers known keys (opt-in: KRIPPER_AUDIO=1)", { skip: !ENABLED }, async () => {
  const ffmpeg = findFfmpeg();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kripper-key-"));
  try {
    for (const [truth, freqs] of Object.entries(TRIADS)) {
      const wav = path.join(tmp, `${truth}.wav`);
      makeTriad(ffmpeg, freqs, 8, wav);
      const got = await detectKey(ffmpeg, wav);
      assert.equal(got && got.label, truth, `expected ${truth}, got ${got && got.label}`);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
