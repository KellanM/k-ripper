// K-Ripper — analysis worker (tempo + key), run OFF the main thread.
//
// Why this exists (root-caused 2026-07-13): the analysis is several seconds of
// synchronous DSP. Run on the main thread it blocks Node's event loop, which
// starves Node for Max's socket keepalive; Max declares the child dead and
// tears the connection down, the bpm/key/done outlets emitted after the block
// go nowhere, and max-api exits the process (code 2) — so the clip never
// lands. In a worker the main loop stays responsive and the socket stays up.
//
// The worker is self-contained: no max-api. It decodes the analysis window
// with the bundled ffmpeg, runs music-tempo + NNLS-chroma key detection, and
// posts { type: "result", bpm, keyInfo }. Human-readable diagnostics are
// posted as { type: "log", msg } for the main thread to forward to Max.
// Best-effort throughout: any failure yields nulls, never a throw upward.

import { parentPort, workerData } from "worker_threads";
import { spawnSync } from "child_process";
import { createRequire } from "module";
import { ffmpegAnalysisArgs, finalizeBpm, detectKeyFromChroma } from "./lib.mjs";

const require = createRequire(import.meta.url);

function log(msg) {
  try { parentPort.postMessage({ type: "log", msg }); } catch {}
}

async function main() {
  const { wavPath, ffmpegPath } = workerData;

  // Decode a bounded window to mono 44.1kHz float PCM (blocking is fine here —
  // this is the worker thread, not the event loop that talks to Max).
  let samples = null;
  try {
    const r = spawnSync(ffmpegPath, ffmpegAnalysisArgs(wavPath), { maxBuffer: 1 << 28, windowsHide: true });
    const b = r.stdout;
    if (b && b.length >= 44100 * 4 * 5) {
      samples = new Float32Array(b.buffer, b.byteOffset, Math.floor(b.length / 4));
    }
  } catch (e) {
    log(`analysis decode failed: ${e && e.message ? e.message : e}`);
  }

  let bpm = null;
  if (samples) {
    try {
      const MusicTempo = require("./vendor/music-tempo/MusicTempo.js");
      const mt = new MusicTempo(Array.from(samples));
      bpm = finalizeBpm(mt && mt.tempo);
    } catch (e) {
      log(`tempo analysis failed: ${e && e.message ? e.message : e}`);
    }
  }

  let keyInfo = null;
  if (samples && samples.length >= 8192) {
    try {
      const { default: chroma } = await import("./vendor/pitch-detection/chroma.js");
      const N = 8192;
      const total = Math.floor(samples.length / N);
      const step = N * Math.max(1, Math.ceil(total / 300));
      const acc = new Float64Array(12);
      let nf = 0;
      for (let i = 0; i + N <= samples.length; i += step) {
        const c = chroma(samples.subarray(i, i + N), { fs: 44100, method: "nnls" });
        for (let k = 0; k < 12; k++) acc[k] += c[k];
        nf++;
      }
      if (nf > 0) {
        for (let k = 0; k < 12; k++) acc[k] /= nf;
        const r = detectKeyFromChroma(acc, "shaath");
        keyInfo = r && r.confidence >= 0.55 ? r : null;
      }
    } catch (e) {
      log(`key analysis failed: ${e && e.message ? e.message : e}`);
    }
  }

  parentPort.postMessage({ type: "result", bpm, keyInfo });
}

main();
