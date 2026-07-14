// Regression test for the 2026-07-13 crash: analysis must run OFF the main
// thread. A blocked event loop starves Node for Max's socket keepalive and the
// engine dies before `done` (clip never lands). This test asserts BOTH halves:
// the worker produces correct results AND the calling thread's event loop
// keeps ticking while it works.
//
//   KRIPPER_AUDIO=1 node --test test
//
// Opt-in like the other audio tests (needs the bundled ffmpeg).

import { test } from "node:test";
import assert from "node:assert/strict";
import { Worker } from "node:worker_threads";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";

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

test("analysis worker: correct results, event loop never blocked (opt-in: KRIPPER_AUDIO=1)",
  { skip: !ENABLED }, async () => {
  const ffmpeg = findFfmpeg();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kripper-worker-"));
  const wav = path.join(tmp, "click124.wav");
  try {
    const beat = 60 / 124;
    const gen = spawnSync(ffmpeg, [
      "-hide_banner", "-loglevel", "error",
      "-f", "lavfi", "-i", `aevalsrc='0.6*sin(2*PI*1000*t)*lt(mod(t,${beat}),0.02)':s=44100:d=30`,
      "-y", wav,
    ]);
    assert.equal(gen.status, 0, `click gen failed: ${gen.stderr}`);

    // Heartbeat on THIS thread — the whole point of the worker architecture.
    let ticks = 0;
    const iv = setInterval(() => ticks++, 25);

    const result = await new Promise((resolve, reject) => {
      const w = new Worker(new URL("../kripper/analysis-worker.mjs", import.meta.url), {
        workerData: { wavPath: wav, ffmpegPath: ffmpeg },
      });
      const t = setTimeout(() => { w.terminate(); reject(new Error("worker timeout")); }, 60_000);
      w.on("message", (m) => {
        if (m && m.type === "result") { clearTimeout(t); resolve(m); w.terminate(); }
      });
      w.on("error", (e) => { clearTimeout(t); reject(e); });
    });
    clearInterval(iv);

    assert.ok(result.bpm !== null && Math.abs(result.bpm - 124) <= 1,
      `expected ~124 BPM, got ${result.bpm}`);
    // A synchronous in-process analysis would freeze this loop (~0 ticks).
    assert.ok(ticks >= 20, `event loop starved during analysis (ticks=${ticks})`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
