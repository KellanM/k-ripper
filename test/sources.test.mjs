// Integration test: confirm the bundled yt-dlp can still resolve a playable
// audio format from each supported source. This is the source-rot canary.
//
// OPT-IN (hits the network, URLs can go stale): run with KRIPPER_NET=1, e.g.
//   KRIPPER_NET=1 node --test            (bash)
//   $env:KRIPPER_NET=1; node --test      (PowerShell)
// Skipped by default so CI stays fast and deterministic.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const NET = !!process.env.KRIPPER_NET;
const BIN = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "kripper", "bin");
const YTDLP = path.join(BIN, process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp");

// One reasonably-stable public URL per source. If one rots, the test for that
// platform fails loudly — which is exactly the signal we want.
const SOURCES = {
  soundcloud: "https://soundcloud.com/avello_music/all-of-the-lights",
  youtube:    "https://www.youtube.com/watch?v=iS2rJbg1L5k",
  bandcamp:   "https://2025.bandcamp.com/track/1",
  vimeo:      "https://vimeo.com/76979871",
};

function simulate(url) {
  return new Promise((resolve) => {
    const child = spawn(YTDLP, ["-f", "bestaudio/best", "--simulate", "--no-warnings",
      "--no-playlist", "--print", "%(ext)s", url], { windowsHide: true });
    let out = "", err = "";
    child.stdout.on("data", (b) => (out += b));
    child.stderr.on("data", (b) => (err += b));
    child.on("error", (e) => resolve({ code: -1, out, err: String(e) }));
    child.on("close", (code) => resolve({ code, out: out.trim(), err: err.trim() }));
  });
}

for (const [name, url] of Object.entries(SOURCES)) {
  test(`source: ${name} resolves a format`, { skip: NET ? false : "set KRIPPER_NET=1", timeout: 90000 }, async () => {
    assert.ok(fs.existsSync(YTDLP), "bundled yt-dlp missing — run scripts/fetch-binaries.sh");
    const r = await simulate(url);
    assert.equal(r.code, 0, `${name} failed: ${r.err.split("\n").pop()}`);
    assert.match(r.out, /\w+/, `${name} produced no format`);
  });
}
