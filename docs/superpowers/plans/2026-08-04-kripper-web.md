# K-Ripper Web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A fully self-contained local web app (`kripper-web/`) that rips tracks/playlists at original fidelity via a browser UI at `http://127.0.0.1:8420`.

**Architecture:** Zero-dependency Node server (`node:http`) + static single-page UI. A Max-free engine (modeled on `kripper/kripper.mjs`) spawns copied yt-dlp/ffmpeg binaries, keeps the original stream untouched, and runs BPM/key analysis in a worker thread. A serial job queue fans events out over SSE. Spec: `docs/superpowers/specs/2026-08-04-kripper-web-design.md`.

**Tech Stack:** Node ≥18 (ES modules, `node:http`, `node:test`), vanilla HTML/CSS/JS. No npm dependencies, no build step.

## Global Constraints

- **Never modify anything under `kripper/`, `kripper-mac/`, `ableton/`, or `installer/`.** Copy from them freely; write only inside `kripper-web/`, `test/`, and `docs/`.
- No npm dependencies anywhere; `kripper-web/package.json` has `"dependencies": {}` and stays that way.
- Server binds `127.0.0.1` only. Default port `8420`, increment on `EADDRINUSE`.
- Output dir: `process.env.KRIPPER_OUTPUT || path.join(os.homedir(), "Music", "K-Ripper")`. No WAV conversion — the file yt-dlp produces is the file kept.
- Tests run with the existing runner: `npm test` (= `node --test`) from the repo root; test files live in `test/` and are named `kripper-web-*.test.mjs`.
- Event vocabulary (exact strings): `queued`, `status`, `progress`, `track`, `art`, `bpm`, `key`, `done`, `cancelled`, `error`.
- Job states (exact strings): `queued`, `running`, `done`, `error`, `cancelled`.
- All commits on the feature branch `feat/kripper-web` (created in Task 1).

---

### Task 1: Scaffold — folder, seed copies, package.json

**Files:**
- Create: `kripper-web/package.json`
- Create (by copy): `kripper-web/lib.mjs`, `kripper-web/analysis-worker.mjs`, `kripper-web/vendor/**`, `kripper-web/bin/{yt-dlp.exe,ffmpeg.exe,yt-dlp,ffmpeg-x64,ffmpeg-arm64}`, `kripper-web/public/assets/**`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `kripper-web/lib.mjs` exporting the device's pure helpers used later: `extractUrl(raw)→string|null`, `pickAudio(names)→string|null`, `pickArt(names)→string|null`, `stripExt(basename)→string`, `parseProgress(line)→number|null`, `classifyError(raw)→string`, `ffmpegAnalysisArgs(path, seconds?, rate?)→string[]`, `finalizeBpm(raw)→number|null`, `detectKeyFromChroma(chroma, profile?)→{label,camelot,confidence}|null`. Also `kripper-web/analysis-worker.mjs` accepting `workerData = { audioPath, ffmpegPath }` and posting `{type:"result", bpm, keyInfo}` / `{type:"log", msg}`.

- [ ] **Step 1: Create branch and folder structure with seed copies** (Bash tool / Git Bash):

```bash
cd /c/Qoral/Projects/Misc/SoundCloudDownloader
git checkout -b feat/kripper-web
mkdir -p kripper-web/bin kripper-web/public
cp kripper/lib.mjs kripper-web/lib.mjs
cp kripper/analysis-worker.mjs kripper-web/analysis-worker.mjs
cp -r kripper/vendor kripper-web/vendor
cp kripper/bin/yt-dlp.exe kripper/bin/ffmpeg.exe kripper-web/bin/
cp kripper-mac/bin/yt-dlp kripper-mac/bin/ffmpeg-x64 kripper-mac/bin/ffmpeg-arm64 kripper-web/bin/
cp -r kripper/assets kripper-web/public/assets
```

- [ ] **Step 2: Rename `wavPath` → `audioPath` in the copied worker**

In `kripper-web/analysis-worker.mjs` only, rename the `wavPath` identifier everywhere it appears (the `workerData` destructure and the `ffmpegAnalysisArgs(wavPath)` call):

```js
// before:  const { wavPath, ffmpegPath } = workerData;
// after:
const { audioPath, ffmpegPath } = workerData;
// …and pass audioPath to ffmpegAnalysisArgs(audioPath)
```

Also update the header comment's first line to say it analyzes any audio format ffmpeg can decode (m4a/opus/mp3/wav).

- [ ] **Step 3: Write `kripper-web/package.json`**

```json
{
  "name": "k-ripper-web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "K-Ripper Web — self-contained local web app. Node server + browser UI over bundled yt-dlp/ffmpeg.",
  "main": "server.mjs",
  "dependencies": {}
}
```

- [ ] **Step 4: Smoke-verify the copies import cleanly**

Run: `node -e "import('./kripper-web/lib.mjs').then(m => console.log(typeof m.extractUrl, typeof m.classifyError))"`
Expected: `function function`

Run: `node --test test/` — the existing suite must still pass (proves nothing in `kripper/` changed).

- [ ] **Step 5: Verify device folders untouched, then commit**

Run: `git status --porcelain kripper kripper-mac` → must print nothing.

```bash
git add kripper-web
git commit -m "feat(web): scaffold kripper-web with seed copies from the device"
```

---

### Task 2: `weblib.mjs` — web-only pure helpers

**Files:**
- Create: `kripper-web/weblib.mjs`
- Test: `test/kripper-web-weblib.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `isPlaylistUrl(url)→boolean`, `parsePlaylistEntries(stdout)→Array<{url:string,title:string|null}>`, `safeArtBasename(name)→string|null`, `uniquePath(dir, basename, existsFn)→string` (collision-free path in `dir`, using `existsFn(path)→boolean`).

- [ ] **Step 1: Write the failing tests** (`test/kripper-web-weblib.test.mjs`):

```js
// Unit tests for kripper-web's pure helpers (kripper-web/weblib.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { isPlaylistUrl, parsePlaylistEntries, safeArtBasename, uniquePath } from "../kripper-web/weblib.mjs";

test("isPlaylistUrl: soundcloud set is a playlist", () => {
  assert.equal(isPlaylistUrl("https://soundcloud.com/artist/sets/my-mix"), true);
});
test("isPlaylistUrl: soundcloud track with ?in= set context is NOT a playlist", () => {
  assert.equal(isPlaylistUrl("https://soundcloud.com/artist/track?in=artist/sets/my-mix"), false);
});
test("isPlaylistUrl: youtube playlist page is a playlist", () => {
  assert.equal(isPlaylistUrl("https://www.youtube.com/playlist?list=PLx123"), true);
});
test("isPlaylistUrl: youtube watch with list param is NOT a playlist (rip the video)", () => {
  assert.equal(isPlaylistUrl("https://www.youtube.com/watch?v=abc&list=PLx123"), false);
});
test("isPlaylistUrl: bandcamp album is a playlist", () => {
  assert.equal(isPlaylistUrl("https://artist.bandcamp.com/album/the-record"), true);
});
test("isPlaylistUrl: plain track urls are not", () => {
  assert.equal(isPlaylistUrl("https://soundcloud.com/artist/track"), false);
  assert.equal(isPlaylistUrl("https://artist.bandcamp.com/track/song"), false);
  assert.equal(isPlaylistUrl(null), false);
});

test("parsePlaylistEntries: url<TAB>title lines", () => {
  const out = "https://soundcloud.com/a/t1\tTrack One\nhttps://soundcloud.com/a/t2\tTrack Two\n";
  assert.deepEqual(parsePlaylistEntries(out), [
    { url: "https://soundcloud.com/a/t1", title: "Track One" },
    { url: "https://soundcloud.com/a/t2", title: "Track Two" },
  ]);
});
test("parsePlaylistEntries: skips blank lines and NA titles, tolerates CRLF", () => {
  const out = "https://x.com/1\tNA\r\n\r\nhttps://x.com/2\tOk\r\n";
  assert.deepEqual(parsePlaylistEntries(out), [
    { url: "https://x.com/1", title: null },
    { url: "https://x.com/2", title: "Ok" },
  ]);
});
test("parsePlaylistEntries: skips non-url lines (yt-dlp noise)", () => {
  assert.deepEqual(parsePlaylistEntries("[soundcloud] resolving\nhttps://x.com/1\tT\n"), [
    { url: "https://x.com/1", title: "T" },
  ]);
});

test("safeArtBasename: accepts a plain jpg basename", () => {
  assert.equal(safeArtBasename("Artist - Title.jpg"), "Artist - Title.jpg");
});
test("safeArtBasename: rejects traversal, separators, non-jpg, empty", () => {
  assert.equal(safeArtBasename("../secret.jpg"), null);
  assert.equal(safeArtBasename("a/b.jpg"), null);
  assert.equal(safeArtBasename("a\\b.jpg"), null);
  assert.equal(safeArtBasename("evil.exe"), null);
  assert.equal(safeArtBasename(""), null);
  assert.equal(safeArtBasename(null), null);
});

test("uniquePath: returns dir/base when free, ' (2)' style when taken", () => {
  const taken = new Set(["/out/a.m4a", "/out/a (2).m4a"]);
  const exists = (p) => taken.has(p.replace(/\\/g, "/"));
  assert.equal(uniquePath("/out", "b.m4a", exists).replace(/\\/g, "/"), "/out/b.m4a");
  assert.equal(uniquePath("/out", "a.m4a", exists).replace(/\\/g, "/"), "/out/a (3).m4a");
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/kripper-web-weblib.test.mjs`
Expected: FAIL — cannot find module `kripper-web/weblib.mjs`.

- [ ] **Step 3: Implement `kripper-web/weblib.mjs`**

```js
// K-Ripper Web — pure, side-effect-free helpers specific to the web app.
// Companion to lib.mjs (copied from the device); same testing philosophy.

import path from "path";

// Playlist detection is a URL-shape heuristic, not a network probe, so single
// tracks start instantly. Only unambiguous container URLs count:
//   soundcloud.com/<user>/sets/<set>        (but ?in=… track context does not)
//   youtube.com/playlist?list=…             (watch?v=…&list=… rips the video)
//   <artist>.bandcamp.com/album/…
export function isPlaylistUrl(url) {
  let u;
  try { u = new URL(String(url)); } catch { return false; }
  const host = u.hostname.toLowerCase();
  const p = u.pathname;
  if (/(^|\.)soundcloud\.com$/.test(host)) return /^\/[^/]+\/sets\/[^/]+/.test(p);
  if (/(^|\.)(youtube\.com|music\.youtube\.com)$/.test(host)) return p === "/playlist" && u.searchParams.has("list");
  if (/\.bandcamp\.com$/.test(host)) return /^\/album\//.test(p);
  return false;
}

// Parse `yt-dlp --flat-playlist --print "%(url)s\t%(title)s"` stdout.
// Non-URL lines are extractor noise; "NA" means yt-dlp had no title.
export function parsePlaylistEntries(stdout) {
  const entries = [];
  for (const line of String(stdout || "").split(/\r?\n/)) {
    const [url, ...rest] = line.split("\t");
    if (!/^https?:\/\//i.test(url || "")) continue;
    const title = rest.join("\t").trim();
    entries.push({ url: url.trim(), title: title && title !== "NA" ? title : null });
  }
  return entries;
}

// Validate a client-supplied art filename: plain JPG basename only. Anything
// else (separators, traversal, other extensions) is rejected — this is the
// guard that keeps GET /api/art?file= from reading outside the output dir.
export function safeArtBasename(name) {
  const s = String(name || "");
  if (!s || /[/\\\0]/.test(s) || s.includes("..")) return null;
  if (!/\.jpe?g$/i.test(s)) return null;
  return s;
}

// First free path for basename in dir: "a.m4a", then "a (2).m4a", "a (3).m4a"…
// existsFn is injected so this stays pure/testable (fs.existsSync in prod).
export function uniquePath(dir, basename, existsFn) {
  const ext = path.extname(basename);
  const stem = basename.slice(0, basename.length - ext.length);
  let candidate = path.join(dir, basename);
  for (let n = 2; existsFn(candidate); n++) {
    candidate = path.join(dir, `${stem} (${n})${ext}`);
  }
  return candidate;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `node --test test/kripper-web-weblib.test.mjs` → all PASS. Then `npm test` → full suite PASS.

- [ ] **Step 5: Commit**

```bash
git add kripper-web/weblib.mjs test/kripper-web-weblib.test.mjs
git commit -m "feat(web): pure helpers — playlist detection/parsing, art-name guard, unique paths"
```

---

### Task 3: `queue.mjs` — serial job queue

**Files:**
- Create: `kripper-web/queue.mjs`
- Test: `test/kripper-web-queue.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: `class RipQueue extends EventEmitter`. Constructor `new RipQueue(runJob)` where `runJob(job, api)→Promise<void>`; `api = { emit(name, ...args), setCanceller(fn) }`. Methods: `add({url, title})→job`, `cancel(id)→boolean`, `jobs()→job[]`, `get(id)→job|undefined`. Job shape: `{ id:string, url:string, title:string|null, state:"queued"|"running"|"done"|"error"|"cancelled", progress:number, artFile:string|null, audioPath:string|null, bpm:number|null, key:string|null, error:string|null }`. Queue emits `"job"` events: `(jobId, eventName, args[])` — every state change and every `api.emit` from `runJob`. The queue mirrors well-known events into job fields: `progress`→`job.progress`, `track`→`job.title`, `art`→`job.artFile`, `bpm`→`job.bpm`, `key`→`job.key` (joined args, e.g. `"8A Am"`), `done`→`job.audioPath` + state `done`, `error`→`job.error` + state `error`, `cancelled`→state `cancelled`.

- [ ] **Step 1: Write the failing tests** (`test/kripper-web-queue.test.mjs`):

```js
// Tests for the serial rip queue. runJob is injected, so no processes spawn.
import { test } from "node:test";
import assert from "node:assert/strict";
import { RipQueue } from "../kripper-web/queue.mjs";

const tick = () => new Promise((r) => setImmediate(r));

test("runs jobs serially in FIFO order", async () => {
  const order = [];
  let release;
  const gate = new Promise((r) => { release = r; });
  const q = new RipQueue(async (job, api) => {
    order.push(`start:${job.url}`);
    if (job.url === "u1") await gate;
    api.emit("done", `/out/${job.url}.m4a`);
    order.push(`end:${job.url}`);
  });
  q.add({ url: "u1", title: null });
  q.add({ url: "u2", title: null });
  await tick();
  assert.deepEqual(order, ["start:u1"]); // u2 must wait
  release();
  await tick(); await tick();
  assert.deepEqual(order, ["start:u1", "end:u1", "start:u2", "end:u2"]);
});

test("mirrors events into job fields and forwards them", async () => {
  const seen = [];
  const q = new RipQueue(async (job, api) => {
    api.emit("track", "Artist - Title");
    api.emit("progress", 42);
    api.emit("bpm", 174);
    api.emit("key", "8A", "Am");
    api.emit("done", "/out/x.m4a");
  });
  q.on("job", (id, name, args) => seen.push(name));
  const job = q.add({ url: "u", title: null });
  await tick(); await tick();
  assert.equal(job.title, "Artist - Title");
  assert.equal(job.progress, 42);
  assert.equal(job.bpm, 174);
  assert.equal(job.key, "8A Am");
  assert.equal(job.audioPath, "/out/x.m4a");
  assert.equal(job.state, "done");
  assert.ok(seen.includes("queued") && seen.includes("done"));
});

test("a failing job marks error and does not block the next", async () => {
  const q = new RipQueue(async (job, api) => {
    if (job.url === "bad") throw new Error("boom");
    api.emit("done", "/out/ok.m4a");
  });
  const bad = q.add({ url: "bad", title: null });
  const good = q.add({ url: "good", title: null });
  await tick(); await tick(); await tick();
  assert.equal(bad.state, "error");
  assert.equal(bad.error, "boom");
  assert.equal(good.state, "done");
});

test("cancel of a queued job removes it from execution", async () => {
  let ran = 0;
  let release;
  const gate = new Promise((r) => { release = r; });
  const q = new RipQueue(async (job, api) => { ran++; await gate; api.emit("done", "/x"); });
  q.add({ url: "u1", title: null });
  const j2 = q.add({ url: "u2", title: null });
  await tick();
  assert.equal(q.cancel(j2.id), true);
  assert.equal(j2.state, "cancelled");
  release();
  await tick(); await tick();
  assert.equal(ran, 1); // u2 never ran
});

test("cancel of the running job invokes the registered canceller", async () => {
  let cancelled = false;
  const q = new RipQueue(async (job, api) => {
    api.setCanceller(() => { cancelled = true; api.emit("cancelled"); });
    await new Promise(() => {}); // hangs until cancelled path resolves the test
  });
  const j = q.add({ url: "u", title: null });
  await tick();
  q.cancel(j.id);
  await tick();
  assert.equal(cancelled, true);
  assert.equal(j.state, "cancelled");
});

test("unknown id cancel returns false; jobs() lists newest last", async () => {
  const q = new RipQueue(async (job, api) => api.emit("done", "/x"));
  const a = q.add({ url: "a", title: null });
  const b = q.add({ url: "b", title: null });
  assert.equal(q.cancel("nope"), false);
  assert.deepEqual(q.jobs().map((j) => j.id), [a.id, b.id]);
  assert.equal(q.get(a.id), a);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/kripper-web-queue.test.mjs` → FAIL (module not found).

- [ ] **Step 3: Implement `kripper-web/queue.mjs`**

```js
// K-Ripper Web — serial job queue. One rip at a time (kind to CDNs, matches
// the device), each job fully independent: a failure or cancel never touches
// its neighbours. All observable activity flows out as "job" events so the
// SSE layer is a dumb pipe.

import { EventEmitter } from "events";
import { randomUUID } from "crypto";

export class RipQueue extends EventEmitter {
  constructor(runJob) {
    super();
    this.runJob = runJob;
    this._jobs = [];        // insertion order — doubles as history
    this._running = null;   // job currently executing
    this._cancellers = new Map(); // jobId -> fn registered by runJob
  }

  jobs() { return this._jobs; }
  get(id) { return this._jobs.find((j) => j.id === id); }

  add({ url, title }) {
    const job = {
      id: randomUUID(), url, title: title || null,
      state: "queued", progress: 0,
      artFile: null, audioPath: null, bpm: null, key: null, error: null,
    };
    this._jobs.push(job);
    this._forward(job, "queued", []);
    queueMicrotask(() => this._pump());
    return job;
  }

  cancel(id) {
    const job = this.get(id);
    if (!job) return false;
    if (job.state === "queued") {
      job.state = "cancelled";
      this._forward(job, "cancelled", []);
      return true;
    }
    if (job.state === "running") {
      const kill = this._cancellers.get(id);
      if (kill) { try { kill(); } catch {} }
      // State flips to cancelled when the runJob emits `cancelled` (or, if it
      // throws after the kill, in the error path below).
      job._cancelRequested = true;
      return true;
    }
    return false; // already finished
  }

  _forward(job, name, args) {
    // Mirror well-known events into job fields so GET /api/jobs is complete.
    if (name === "progress") job.progress = Number(args[0]) || 0;
    else if (name === "track") job.title = String(args[0]);
    else if (name === "art") job.artFile = String(args[0]);
    else if (name === "bpm") job.bpm = args[0] === "none" ? null : Number(args[0]);
    else if (name === "key") job.key = args[0] === "none" ? null : args.join(" ");
    else if (name === "done") { job.audioPath = String(args[0]); job.state = "done"; job.progress = 100; }
    else if (name === "error") { job.error = String(args[0]); job.state = "error"; }
    else if (name === "cancelled") job.state = "cancelled";
    this.emit("job", job.id, name, args);
  }

  _pump() {
    if (this._running) return;
    const next = this._jobs.find((j) => j.state === "queued");
    if (!next) return;
    this._running = next;
    next.state = "running";
    this._forward(next, "status", ["starting..."]);
    const api = {
      emit: (name, ...args) => this._forward(next, name, args),
      setCanceller: (fn) => this._cancellers.set(next.id, fn),
    };
    Promise.resolve()
      .then(() => this.runJob(next, api))
      .catch((e) => {
        if (next.state === "running") {
          this._forward(next, next._cancelRequested ? "cancelled" : "error",
            next._cancelRequested ? [] : [e && e.message ? e.message : String(e)]);
        }
      })
      .finally(() => {
        if (next.state === "running") this._forward(next, "error", ["job ended without result"]);
        this._cancellers.delete(next.id);
        this._running = null;
        queueMicrotask(() => this._pump());
      });
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `node --test test/kripper-web-queue.test.mjs` → PASS (the hanging-promise test relies on the canceller flipping state — it must not time out). Then `npm test`.

- [ ] **Step 5: Commit**

```bash
git add kripper-web/queue.mjs test/kripper-web-queue.test.mjs
git commit -m "feat(web): serial rip queue with event mirroring and cancellation"
```

---

### Task 4: `engine.mjs` — the rip pipeline

**Files:**
- Create: `kripper-web/engine.mjs`
- Create: `test/fixtures/fake-ytdlp.mjs`
- Test: `test/kripper-web-engine.test.mjs`

**Interfaces:**
- Consumes: from `kripper-web/lib.mjs` — `pickAudio`, `pickArt`, `stripExt`, `parseProgress`, `classifyError`; from `kripper-web/weblib.mjs` — `uniquePath`, `parsePlaylistEntries`.
- Produces:
  - `resolveBinPaths(binDir)→{ ytdlpPath, ffmpegPath }` (per-platform, mirrors the device's `resolveFfmpeg`).
  - `rip(url, opts)→Promise<void>` with `opts = { emit, setCanceller, outputDir, stagingRoot, jobId, ytdlpPath, ffmpegPath, ytdlpPreArgs?: string[] }`. Emits the event vocabulary; resolves after emitting `done`/`cancelled`, rejects only on unexpected internal errors (caller converts via `classifyError`). `ytdlpPreArgs` exists so tests can inject `ytdlpPath = process.execPath, ytdlpPreArgs = [fixtureScript]`.
  - `enumeratePlaylist(url, { ytdlpPath, ytdlpPreArgs? })→Promise<Array<{url,title}>>` — runs `--flat-playlist --print "%(url)s\t%(title)s" --no-warnings`, 60 s timeout.

- [ ] **Step 1: Write the fake yt-dlp fixture** (`test/fixtures/fake-ytdlp.mjs`):

```js
// Stand-in for yt-dlp in engine tests. Reads the -o output template to find
// the staging dir, emits realistic progress lines, writes a fake .m4a + .jpg.
// Invoked as: node fake-ytdlp.mjs <real yt-dlp args...>
import fs from "fs";
import path from "path";

const args = process.argv.slice(2);

// Playlist enumeration runs have no -o, so this branch must come first.
if (args.includes("--flat-playlist")) {
  process.stdout.write("https://fake.test/t1\tFake One\nhttps://fake.test/t2\tFake Two\n");
  process.exit(0);
}

const oIdx = args.indexOf("-o");
if (oIdx === -1) { console.error("fake-ytdlp: no -o"); process.exit(2); }
const stageDir = path.dirname(args[oIdx + 1]);
const url = args[args.length - 1];
if (/fail/.test(url)) { console.error("ERROR: [fake] video: HTTP Error 404: Not Found"); process.exit(1); }

console.log("[download]  10.0% of 1.00MiB");
console.log("[download] 100.0% of 1.00MiB");
fs.writeFileSync(path.join(stageDir, "Fake Artist - Fake Title.m4a"), "not-really-audio");
fs.writeFileSync(path.join(stageDir, "Fake Artist - Fake Title.jpg"), "not-really-a-jpg");
process.exit(0);
```

- [ ] **Step 2: Write the failing engine tests** (`test/kripper-web-engine.test.mjs`):

```js
// Integration-style tests for the rip pipeline with injected fake binaries.
// No network, no real yt-dlp/ffmpeg. Analysis is expected to fail gracefully
// (ffmpegPath points at nothing) and yield bpm/key "none".
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { rip, enumeratePlaylist, resolveBinPaths } from "../kripper-web/engine.mjs";

const FIXTURE = fileURLToPath(new URL("./fixtures/fake-ytdlp.mjs", import.meta.url));
const fakeOpts = (dir) => ({
  ytdlpPath: process.execPath, ytdlpPreArgs: [FIXTURE],
  ffmpegPath: path.join(dir, "no-such-ffmpeg"),
  outputDir: path.join(dir, "out"), stagingRoot: path.join(dir, "stage"),
  jobId: "test-job",
});

function tmpdir() { return fs.mkdtempSync(path.join(os.tmpdir(), "kweb-")); }
const collect = () => { const ev = []; return { ev, emit: (n, ...a) => ev.push([n, ...a]) }; };

test("rip: full happy path — original file lands in outputDir, events in order", async () => {
  const dir = tmpdir();
  const { ev, emit } = collect();
  await rip("https://fake.test/song", { ...fakeOpts(dir), emit, setCanceller: () => {} });
  const names = ev.map((e) => e[0]);
  assert.deepEqual(
    names.filter((n) => ["track", "art", "bpm", "key", "done"].includes(n)),
    ["track", "art", "bpm", "key", "done"]);
  const doneEv = ev.find((e) => e[0] === "done");
  assert.match(doneEv[1], /Fake Artist - Fake Title\.m4a$/); // original ext, no wav
  assert.ok(fs.existsSync(doneEv[1]));
  assert.equal(ev.find((e) => e[0] === "track")[1], "Fake Artist - Fake Title");
  assert.equal(ev.find((e) => e[0] === "bpm")[1], "none"); // analysis failed soft
  assert.ok(!fs.existsSync(path.join(dir, "stage", "test-job")), "staging cleaned");
});

test("rip: collision keeps both files ('(2)' suffix)", async () => {
  const dir = tmpdir();
  const outputDir = path.join(dir, "out");
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, "Fake Artist - Fake Title.m4a"), "old");
  const { ev, emit } = collect();
  await rip("https://fake.test/song", { ...fakeOpts(dir), emit, setCanceller: () => {} });
  assert.match(ev.find((e) => e[0] === "done")[1], /Fake Artist - Fake Title \(2\)\.m4a$/);
});

test("rip: yt-dlp failure emits a classified error, not a throw", async () => {
  const dir = tmpdir();
  const { ev, emit } = collect();
  await rip("https://fake.test/fail", { ...fakeOpts(dir), emit, setCanceller: () => {} });
  const err = ev.find((e) => e[0] === "error");
  assert.equal(err[1], "unavailable or private"); // classifyError of the 404
});

test("enumeratePlaylist: parses url/title pairs from the fixture", async () => {
  const entries = await enumeratePlaylist("https://fake.test/sets/x",
    { ytdlpPath: process.execPath, ytdlpPreArgs: [FIXTURE] });
  assert.deepEqual(entries, [
    { url: "https://fake.test/t1", title: "Fake One" },
    { url: "https://fake.test/t2", title: "Fake Two" },
  ]);
});

test("resolveBinPaths: returns platform-appropriate names", () => {
  const { ytdlpPath, ffmpegPath } = resolveBinPaths("/some/bin");
  if (process.platform === "win32") {
    assert.match(ytdlpPath, /yt-dlp\.exe$/); assert.match(ffmpegPath, /ffmpeg\.exe$/);
  } else {
    assert.match(ytdlpPath, /yt-dlp$/); assert.match(ffmpegPath, /ffmpeg/);
  }
});
```

- [ ] **Step 3: Run to verify failure**

Run: `node --test test/kripper-web-engine.test.mjs` → FAIL (module not found).

- [ ] **Step 4: Implement `kripper-web/engine.mjs`**

Model on `kripper/kripper.mjs` (`runYtdlp`, `killTree`, `runAnalysis`) with these deltas: no Max, no clipboard, no WAV conversion, per-job staging under `stagingRoot/<jobId>/`, collision-safe move into `outputDir`, injectable binary paths + `ytdlpPreArgs`, cancellation via `setCanceller`.

```js
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
```

Note: `emit("art", basename)` sends the **basename** (not an absolute path) — the server serves it via `/api/art` and the localStorage-restore path needs basenames (spec §API).

- [ ] **Step 5: Run tests to verify pass**

Run: `node --test test/kripper-web-engine.test.mjs` → PASS. Then `npm test` → full suite PASS.

- [ ] **Step 6: Commit**

```bash
git add kripper-web/engine.mjs test/kripper-web-engine.test.mjs test/fixtures/fake-ytdlp.mjs
git commit -m "feat(web): Max-free rip pipeline — original fidelity, per-job staging, injectable binaries"
```

---

### Task 5: `server.mjs` — HTTP server, routes, SSE

**Files:**
- Create: `kripper-web/server.mjs`
- Test: `test/kripper-web-server.test.mjs`

**Interfaces:**
- Consumes: `RipQueue` (Task 3), `rip`/`enumeratePlaylist`/`resolveBinPaths` (Task 4), `extractUrl`/`classifyError` (lib), `isPlaylistUrl`/`safeArtBasename` (weblib).
- Produces: `createApp({ queue, enumerate, isPlaylist, outputDir, publicDir })→http.Server` (exported for tests; all deps injectable). Running `node server.mjs` wires real deps, listens on `127.0.0.1` starting at port `8420` (increment on `EADDRINUSE`, max 20 tries), prints `K-Ripper Web → http://127.0.0.1:<port>`, and with `--open` launches the default browser at that URL.

- [ ] **Step 1: Write the failing tests** (`test/kripper-web-server.test.mjs`):

```js
// Route tests against a live server on an ephemeral port with a stub queue.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { EventEmitter } from "events";
import { createApp } from "../kripper-web/server.mjs";

function stubQueue() {
  const q = new EventEmitter();
  q._jobs = [];
  q.jobs = () => q._jobs;
  q.get = (id) => q._jobs.find((j) => j.id === id);
  q.add = ({ url, title }) => {
    const job = { id: `j${q._jobs.length + 1}`, url, title: title || null, state: "queued",
      progress: 0, artFile: null, audioPath: null, bpm: null, key: null, error: null };
    q._jobs.push(job); return job;
  };
  q.cancel = (id) => Boolean(q.get(id));
  return q;
}

async function startApp(overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kweb-srv-"));
  const publicDir = path.join(dir, "public");
  fs.mkdirSync(publicDir);
  fs.writeFileSync(path.join(publicDir, "index.html"), "<h1>kweb</h1>");
  const queue = overrides.queue || stubQueue();
  const app = createApp({
    queue, outputDir: dir, publicDir,
    enumerate: overrides.enumerate || (async () => []),
    isPlaylist: overrides.isPlaylist || (() => false),
  });
  await new Promise((r) => app.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${app.address().port}`;
  return { app, base, queue, dir };
}

test("GET / serves index.html", async () => {
  const { app, base } = await startApp();
  const res = await fetch(base + "/");
  assert.equal(res.status, 200);
  assert.match(await res.text(), /kweb/);
  app.close();
});

test("POST /api/rip queues a single job and returns it", async () => {
  const { app, base, queue } = await startApp();
  const res = await fetch(base + "/api/rip", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "check out https://soundcloud.com/a/t !" }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.jobs.length, 1);
  assert.equal(queue.jobs()[0].url, "https://soundcloud.com/a/t"); // extractUrl applied
  app.close();
});

test("POST /api/rip expands playlists into one job per entry", async () => {
  const { app, base, queue } = await startApp({
    isPlaylist: () => true,
    enumerate: async () => [{ url: "https://x/1", title: "One" }, { url: "https://x/2", title: "Two" }],
  });
  const res = await fetch(base + "/api/rip", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "https://soundcloud.com/a/sets/s" }),
  });
  const body = await res.json();
  assert.equal(body.jobs.length, 2);
  assert.equal(queue.jobs()[1].title, "Two");
  app.close();
});

test("POST /api/rip with no url in input → 400 with error json", async () => {
  const { app, base } = await startApp();
  const res = await fetch(base + "/api/rip", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "no link here" }),
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, "no URL found");
  app.close();
});

test("GET /api/jobs returns the queue", async () => {
  const { app, base, queue } = await startApp();
  queue.add({ url: "https://x/1" });
  const body = await (await fetch(base + "/api/jobs")).json();
  assert.equal(body.jobs.length, 1);
  app.close();
});

test("GET /api/art rejects traversal and non-jpg", async () => {
  const { app, base } = await startApp();
  for (const bad of ["..%2Fsecret.jpg", "a%5Cb.jpg", "x.exe"]) {
    const res = await fetch(`${base}/api/art?file=${bad}`);
    assert.equal(res.status, 400, bad);
  }
  app.close();
});

test("GET /api/art serves a jpg from outputDir by basename", async () => {
  const { app, base, dir } = await startApp();
  fs.writeFileSync(path.join(dir, "cover.jpg"), "jpgbytes");
  const res = await fetch(base + "/api/art?file=cover.jpg");
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/jpeg");
  app.close();
});

test("POST /api/reveal only accepts finished jobs", async () => {
  const { app, base, queue } = await startApp();
  const j = queue.add({ url: "https://x/1" });        // state: queued
  let res = await fetch(base + "/api/reveal", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: j.id }),
  });
  assert.equal(res.status, 409);
  res = await fetch(base + "/api/reveal", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: "unknown" }),
  });
  assert.equal(res.status, 404);
  app.close();
});

test("GET /api/events is an SSE stream that forwards queue events", async () => {
  const { app, base, queue } = await startApp();
  const res = await fetch(base + "/api/events");
  assert.equal(res.headers.get("content-type"), "text/event-stream");
  const reader = res.body.getReader();
  queue.emit("job", "j1", "progress", [42]);
  const { value } = await reader.read();
  const text = new TextDecoder().decode(value);
  assert.match(text, /"job":"j1"/);
  assert.match(text, /"event":"progress"/);
  reader.cancel();
  app.close();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/kripper-web-server.test.mjs` → FAIL (module not found).

- [ ] **Step 3: Implement `kripper-web/server.mjs`**

```js
// K-Ripper Web — zero-dependency HTTP server. Localhost only.
// createApp() takes injected deps so routes are testable without spawning
// yt-dlp; the run-as-main block at the bottom wires the real engine.

import http from "http";
import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { extractUrl } from "./lib.mjs";
import { isPlaylistUrl, safeArtBasename } from "./weblib.mjs";
import { RipQueue } from "./queue.mjs";
import { rip, enumeratePlaylist, resolveBinPaths } from "./engine.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIME = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript",
  ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon" };

function json(res, code, obj) {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on("end", () => { try { resolve(JSON.parse(data || "{}")); } catch { resolve({}); } });
  });
}

export function createApp({ queue, enumerate, isPlaylist, outputDir, publicDir }) {
  const sseClients = new Set();
  queue.on("job", (jobId, event, args) => {
    const line = `data: ${JSON.stringify({ job: jobId, event, args })}\n\n`;
    for (const res of sseClients) res.write(line);
  });

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://127.0.0.1");
      const route = `${req.method} ${url.pathname}`;

      if (route === "POST /api/rip") {
        const { url: raw } = await readBody(req);
        const target = extractUrl(raw);
        if (!target) return json(res, 400, { error: "no URL found" });
        let jobs;
        if (isPlaylist(target)) {
          let entries;
          try { entries = await enumerate(target); }
          catch (e) { return json(res, 502, { error: "couldn't read playlist" }); }
          if (!entries.length) return json(res, 400, { error: "playlist is empty" });
          jobs = entries.map((e) => queue.add({ url: e.url, title: e.title }));
        } else {
          jobs = [queue.add({ url: target, title: null })];
        }
        return json(res, 200, { jobs: jobs.map((j) => ({ id: j.id, url: j.url, title: j.title })) });
      }

      if (route === "GET /api/jobs") return json(res, 200, { jobs: queue.jobs() });

      if (req.method === "POST" && /^\/api\/jobs\/[^/]+\/cancel$/.test(url.pathname)) {
        const id = url.pathname.split("/")[3];
        return queue.cancel(id) ? json(res, 200, { ok: true }) : json(res, 404, { error: "unknown job" });
      }

      if (route === "POST /api/reveal") {
        const { id } = await readBody(req);
        const job = queue.get(String(id));
        if (!job) return json(res, 404, { error: "unknown job" });
        if (job.state !== "done" || !job.audioPath) return json(res, 409, { error: "job not finished" });
        if (process.platform === "win32") spawn("explorer", ["/select,", job.audioPath], { windowsHide: true });
        else if (process.platform === "darwin") spawn("open", ["-R", job.audioPath]);
        else spawn("xdg-open", [path.dirname(job.audioPath)]);
        return json(res, 200, { ok: true });
      }

      if (route === "GET /api/art") {
        const name = safeArtBasename(url.searchParams.get("file"));
        if (!name) return json(res, 400, { error: "bad art name" });
        const p = path.join(outputDir, name);
        if (!fs.existsSync(p)) return json(res, 404, { error: "no art" });
        res.writeHead(200, { "content-type": "image/jpeg" });
        return fs.createReadStream(p).pipe(res);
      }

      if (route === "GET /api/events") {
        res.writeHead(200, { "content-type": "text/event-stream",
          "cache-control": "no-store", connection: "keep-alive" });
        res.write(": connected\n\n");
        sseClients.add(res);
        req.on("close", () => sseClients.delete(res));
        return;
      }

      if (req.method === "GET") { // static files
        let rel = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
        const p = path.normalize(path.join(publicDir, rel));
        if (!p.startsWith(path.normalize(publicDir + path.sep)) && p !== path.normalize(path.join(publicDir, "index.html")))
          return json(res, 404, { error: "not found" });
        if (!fs.existsSync(p) || !fs.statSync(p).isFile()) return json(res, 404, { error: "not found" });
        res.writeHead(200, { "content-type": MIME[path.extname(p).toLowerCase()] || "application/octet-stream" });
        return fs.createReadStream(p).pipe(res);
      }

      json(res, 404, { error: "not found" });
    } catch (e) {
      try { json(res, 500, { error: String(e && e.message || e) }); } catch {}
    }
  });
}

// ---- run as main ------------------------------------------------------
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const outputDir = process.env.KRIPPER_OUTPUT || path.join(os.homedir(), "Music", "K-Ripper");
  const stagingRoot = path.join(outputDir, ".staging");
  const { ytdlpPath, ffmpegPath } = resolveBinPaths(path.join(__dirname, "bin"));
  if (!fs.existsSync(ytdlpPath) || !fs.existsSync(ffmpegPath)) {
    console.error("engine missing — bin/ binaries not found (antivirus quarantine?)");
    process.exit(1);
  }
  const queue = new RipQueue((job, api) => rip(job.url, {
    emit: api.emit, setCanceller: api.setCanceller,
    outputDir, stagingRoot, jobId: job.id, ytdlpPath, ffmpegPath,
  }));
  const app = createApp({
    queue, outputDir, publicDir: path.join(__dirname, "public"),
    enumerate: (u) => enumeratePlaylist(u, { ytdlpPath }),
    isPlaylist: isPlaylistUrl,
  });

  // Fire-and-forget yt-dlp self-update, same rationale as the device.
  try { spawn(ytdlpPath, ["-U"], { windowsHide: true }).on("error", () => {}); } catch {}

  let port = 8420;
  const tryListen = (attempt) => {
    app.once("error", (e) => {
      if (e.code === "EADDRINUSE" && attempt < 20) { port++; tryListen(attempt + 1); }
      else { console.error(`cannot listen: ${e.message}`); process.exit(1); }
    });
    app.listen(port, "127.0.0.1", () => {
      const url = `http://127.0.0.1:${port}`;
      console.log(`K-Ripper Web → ${url}   (rips land in ${outputDir})`);
      if (process.argv.includes("--open")) {
        const opener = process.platform === "win32" ? ["cmd", ["/c", "start", "", url]]
          : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
        try { spawn(opener[0], opener[1], { windowsHide: true }).on("error", () => {}); } catch {}
      }
    });
  };
  tryListen(0);
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `node --test test/kripper-web-server.test.mjs` → PASS. Then `npm test` → full suite PASS.

- [ ] **Step 5: Manual sanity boot**

Run: `node kripper-web/server.mjs` → prints `K-Ripper Web → http://127.0.0.1:8420`. `curl http://127.0.0.1:8420/api/jobs` → `{"jobs":[]}`. Ctrl-C.

- [ ] **Step 6: Commit**

```bash
git add kripper-web/server.mjs test/kripper-web-server.test.mjs
git commit -m "feat(web): http server — rip/jobs/cancel/reveal/art routes + SSE, port fallback"
```

---

### Task 6: UI — `public/index.html`, `style.css`, `app.js`

**Files:**
- Create: `kripper-web/public/index.html`, `kripper-web/public/style.css`, `kripper-web/public/app.js`

**Interfaces:**
- Consumes: the HTTP API from Task 5 exactly as specified there (`POST /api/rip {url}` → `{jobs:[…]}`; `GET /api/jobs` → `{jobs:[…]}` with the Task 3 job shape; SSE `data: {job, event, args}`; `GET /api/art?file=<basename>`; `POST /api/jobs/:id/cancel`; `POST /api/reveal {id}`).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write `index.html`**

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>K-Ripper Web</title>
<link rel="stylesheet" href="style.css">
<link rel="icon" href="assets/icon_sc_lit.png">
</head>
<body>
<main>
  <header>
    <img class="logo" src="assets/bubbles.png" alt="">
    <h1>K-RIPPER <span>WEB</span></h1>
    <p class="tag">paste a link · get the original file · highest fidelity</p>
  </header>

  <form id="rip-form">
    <input id="url" type="text" placeholder="https://soundcloud.com/… (track, set, or playlist)"
           autocomplete="off" spellcheck="false" autofocus>
    <button id="rip-btn" type="submit">RIP</button>
  </form>
  <p id="notice" hidden></p>

  <section id="jobs"></section>

  <template id="row-template">
    <article class="job">
      <img class="art" src="" alt="" loading="lazy">
      <div class="meta">
        <div class="title">…</div>
        <div class="sub">
          <span class="status"></span>
          <span class="badge bpm" hidden></span>
          <span class="badge key" hidden></span>
        </div>
        <progress max="100" value="0"></progress>
      </div>
      <div class="actions">
        <button class="reveal" title="Show in folder" hidden>📂</button>
        <button class="cancel" title="Cancel">✕</button>
      </div>
    </article>
  </template>
</main>
<div id="offline" hidden>server stopped — relaunch K-Ripper Web</div>
<script src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write `style.css`** (k-ripper brand: dark, uses the copied `assets/bg.png`)

```css
* { box-sizing: border-box; margin: 0; }
body {
  min-height: 100vh; color: #eef2f5; font: 15px/1.45 "Segoe UI", system-ui, sans-serif;
  background: #0b0f14 url("assets/bg.png") center/cover fixed no-repeat;
}
main { max-width: 760px; margin: 0 auto; padding: 40px 20px 80px; }
header { text-align: center; margin-bottom: 28px; }
.logo { width: 72px; opacity: .9; }
h1 { font-size: 34px; letter-spacing: .18em; margin-top: 8px; }
h1 span { color: #35e0a1; }
.tag { color: #8ea0ad; margin-top: 4px; }
#rip-form { display: flex; gap: 10px; }
#url {
  flex: 1; padding: 13px 16px; border-radius: 10px; border: 1px solid #2a3742;
  background: rgba(10, 16, 22, .85); color: inherit; font-size: 15px;
}
#url:focus { outline: none; border-color: #35e0a1; }
#rip-btn {
  padding: 13px 28px; border: 0; border-radius: 10px; cursor: pointer;
  background: #35e0a1; color: #04130c; font-weight: 700; letter-spacing: .08em;
}
#rip-btn:disabled { opacity: .5; cursor: wait; }
#notice { margin-top: 10px; color: #ffb454; }
#jobs { margin-top: 26px; display: flex; flex-direction: column; gap: 10px; }
.job {
  display: flex; gap: 14px; align-items: center; padding: 12px 14px;
  background: rgba(13, 20, 27, .88); border: 1px solid #1d2933; border-radius: 12px;
}
.job .art { width: 56px; height: 56px; border-radius: 8px; object-fit: cover; background: #131c24; }
.job .meta { flex: 1; min-width: 0; }
.job .title { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.job .sub { display: flex; gap: 8px; align-items: center; color: #8ea0ad; font-size: 13px; margin: 3px 0 6px; }
.badge {
  padding: 1px 8px; border-radius: 999px; font-size: 12px; font-weight: 700;
  background: #14251f; color: #35e0a1; border: 1px solid #1f4436;
}
progress { width: 100%; height: 6px; accent-color: #35e0a1; }
.job.done progress, .job.error progress, .job.cancelled progress { display: none; }
.job.error .status { color: #ff6b6b; }
.job.cancelled { opacity: .55; }
.actions button {
  border: 0; background: transparent; color: #8ea0ad; cursor: pointer; font-size: 17px; padding: 6px;
}
.actions button:hover { color: #eef2f5; }
#offline {
  position: fixed; inset: auto 0 0 0; padding: 12px; text-align: center;
  background: #7a1f1f; color: #ffe3e3; font-weight: 600;
}
```

- [ ] **Step 3: Write `app.js`**

```js
// K-Ripper Web UI. All live state arrives over SSE; /api/jobs is the resync
// source on load/reconnect. Finished jobs are mirrored to localStorage so
// history survives refresh and server restarts (art by basename).
const $ = (sel, el = document) => el.querySelector(sel);
const jobsEl = $("#jobs");
const rows = new Map();       // jobId -> row element
const HISTORY_KEY = "kripper-web-history-v1";

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch { return []; }
}
function saveToHistory(job) {
  const h = loadHistory().filter((j) => j.id !== job.id);
  h.unshift({ id: job.id, title: job.title, artFile: job.artFile, bpm: job.bpm,
              key: job.key, audioPath: job.audioPath, state: "done" });
  localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(0, 200)));
}

function row(job) {
  let el = rows.get(job.id);
  if (el) return el;
  el = $("#row-template").content.firstElementChild.cloneNode(true);
  el.dataset.id = job.id;
  $(".cancel", el).onclick = () => fetch(`/api/jobs/${job.id}/cancel`, { method: "POST" });
  $(".reveal", el).onclick = () => fetch("/api/reveal", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: job.id }),
  });
  rows.set(job.id, el);
  jobsEl.prepend(el);
  return el;
}

function render(job, live = true) {
  const el = row(job);
  el.className = `job ${job.state}`;
  $(".title", el).textContent = job.title || job.url || "…";
  $(".status", el).textContent = job.statusText ||
    ({ queued: "queued", running: "ripping…", done: "done — original file saved",
       error: job.error || "error", cancelled: "cancelled" }[job.state] || "");
  $("progress", el).value = job.progress || 0;
  if (job.artFile) $(".art", el).src = `/api/art?file=${encodeURIComponent(job.artFile)}`;
  const bpmB = $(".badge.bpm", el), keyB = $(".badge.key", el);
  if (job.bpm) { bpmB.hidden = false; bpmB.textContent = `${job.bpm} BPM`; }
  if (job.key) { keyB.hidden = false; keyB.textContent = job.key; }
  $(".reveal", el).hidden = !(job.state === "done" && live);
  $(".cancel", el).hidden = !(job.state === "queued" || job.state === "running");
}

const known = new Map();      // jobId -> job object (client-side mirror)

function applyEvent(id, event, args) {
  const job = known.get(id) || { id, state: "queued", progress: 0 };
  known.set(id, job);
  if (event === "status") job.statusText = args[0];
  else if (event === "progress") { job.progress = args[0]; job.state = "running"; job.statusText = null; }
  else if (event === "track") job.title = args[0];
  else if (event === "art") job.artFile = args[0];
  else if (event === "bpm") job.bpm = args[0] === "none" ? null : args[0];
  else if (event === "key") job.key = args[0] === "none" ? null : args.join(" ");
  else if (event === "done") { job.state = "done"; job.audioPath = args[0]; job.statusText = null; saveToHistory(job); }
  else if (event === "error") { job.state = "error"; job.error = args[0]; }
  else if (event === "cancelled") job.state = "cancelled";
  else if (event === "queued") job.state = "queued";
  render(job);
}

async function resync() {
  const { jobs } = await (await fetch("/api/jobs")).json();
  const liveIds = new Set(jobs.map((j) => j.id));
  for (const j of jobs) { known.set(j.id, { ...known.get(j.id), ...j }); render(known.get(j.id)); }
  for (const h of loadHistory()) if (!liveIds.has(h.id) && !known.has(h.id)) {
    known.set(h.id, h); render(h, /*live=*/false); // reveal needs a live job — hide it
  }
}

function connect() {
  const es = new EventSource("/api/events");
  es.onopen = () => { $("#offline").hidden = true; resync(); };
  es.onmessage = (m) => { const { job, event, args } = JSON.parse(m.data); applyEvent(job, event, args); };
  es.onerror = () => { $("#offline").hidden = false; };
}

$("#rip-form").onsubmit = async (e) => {
  e.preventDefault();
  const input = $("#url"), btn = $("#rip-btn"), notice = $("#notice");
  const url = input.value.trim();
  if (!url) return;
  btn.disabled = true; notice.hidden = true;
  try {
    const res = await fetch("/api/rip", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const body = await res.json();
    if (!res.ok) { notice.textContent = body.error || "failed"; notice.hidden = false; }
    else {
      if (body.jobs.length > 1) { notice.textContent = `queuing ${body.jobs.length} tracks…`; notice.hidden = false; }
      input.value = "";
    }
  } catch { notice.textContent = "server unreachable"; notice.hidden = false; }
  btn.disabled = false;
};

connect();
```

- [ ] **Step 4: Verify in a browser**

Run: `node kripper-web/server.mjs --open` → browser opens; page renders with brand styling, empty list, no console errors. Paste garbage text → "no URL found" notice appears. Ctrl-C the server → red "server stopped" banner appears. Restart → banner clears.

- [ ] **Step 5: Commit**

```bash
git add kripper-web/public
git commit -m "feat(web): browser UI — paste box, live queue rows, art, BPM/key badges, offline banner"
```

---

### Task 7: Launchers, README, end-to-end smoke

**Files:**
- Create: `kripper-web/Start K-Ripper Web.bat`, `kripper-web/Start K-Ripper Web.command`, `kripper-web/README.md`

**Interfaces:**
- Consumes: `server.mjs --open` (Task 5).
- Produces: nothing (terminal task).

- [ ] **Step 1: Write `Start K-Ripper Web.bat`**

```bat
@echo off
title K-Ripper Web
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   K-Ripper Web needs Node.js ^(v18 or newer^).
  echo   Install it from https://nodejs.org and run this again.
  echo.
  pause
  exit /b 1
)
for /f "delims=v. tokens=1,2" %%a in ('node -v') do set NODE_MAJOR=%%a
if %NODE_MAJOR% LSS 18 (
  echo   Your Node.js is too old ^(need v18+^). Update at https://nodejs.org
  pause
  exit /b 1
)
node server.mjs --open
pause
```

- [ ] **Step 2: Write `Start K-Ripper Web.command`**

```bash
#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo
  echo "  K-Ripper Web needs Node.js (v18 or newer)."
  echo "  Install it from https://nodejs.org and run this again."
  echo
  read -r -p "press enter to close"
  exit 1
fi
MAJOR=$(node -v | sed 's/^v\([0-9]*\).*/\1/')
if [ "$MAJOR" -lt 18 ]; then
  echo "  Your Node.js is too old (need v18+). Update at https://nodejs.org"
  read -r -p "press enter to close"
  exit 1
fi
chmod +x bin/yt-dlp bin/ffmpeg-x64 bin/ffmpeg-arm64 2>/dev/null
exec node server.mjs --open
```

Then: `git update-index --chmod=+x "kripper-web/Start K-Ripper Web.command"` so it's executable when checked out on macOS.

- [ ] **Step 3: Write `kripper-web/README.md`**

```markdown
# K-Ripper Web

Standalone local web app version of K-Ripper. Paste a track / set / playlist
URL, get the **original audio file at the highest available fidelity** — no
transcoding — saved to `~/Music/K-Ripper`, with BPM + key detection and
cover art in a live queue UI.

Fully self-contained: this folder has its own yt-dlp/ffmpeg binaries and
analysis code. The Max for Live device (`../kripper/`) is untouched and
independent.

## Requirements

- Node.js **v18+** (https://nodejs.org) — the only prerequisite.

## Run

- **Windows:** double-click `Start K-Ripper Web.bat`
- **macOS:** double-click `Start K-Ripper Web.command`

Your browser opens at `http://127.0.0.1:8420` (next free port if taken).
The server binds localhost only — nothing is exposed to your network.

## Use

1. Paste a URL (SoundCloud / YouTube / Bandcamp / ~1700 other sites; DRM
   platforms like Spotify are not supported and can't be).
2. Press **RIP**. Sets/playlists expand to one queue row per track.
3. Files land in `~/Music/K-Ripper` (override with the `KRIPPER_OUTPUT`
   env var). 📂 on a finished row reveals the file.

## Notes

- Downloads keep the platform's original stream (m4a/opus/mp3 — sometimes
  lossless where uploaders allow it). Nothing is re-encoded.
- Queue history persists in your browser; the files themselves are always
  on disk regardless.
- yt-dlp self-updates in the background at each launch.
```

- [ ] **Step 4: End-to-end smoke (manual, real network)**

Launch via the `.bat`. Verify each:
1. Single SoundCloud track URL → row appears, progress climbs, art + BPM/key badges land, file exists in `~/Music/K-Ripper` with original extension (`.m4a`/`.opus`), 📂 reveals it in Explorer.
2. A SoundCloud `/sets/` URL → "queuing N tracks…" notice, N rows, rips proceed serially.
3. Cancel a running rip → row goes cancelled, next job starts.
4. Paste text with no URL → error notice, no row.
5. Refresh mid-rip → resync shows current state. Stop server, relaunch → history rows still render (art included), reveal hidden on restored rows.

Record any deviation as a bug and fix before proceeding.

- [ ] **Step 5: Final checks and commit**

Run: `npm test` → full suite PASS.
Run: `git status --porcelain kripper kripper-mac ableton installer` → must print nothing.

```bash
git add kripper-web/README.md "kripper-web/Start K-Ripper Web.bat" "kripper-web/Start K-Ripper Web.command"
git update-index --chmod=+x "kripper-web/Start K-Ripper Web.command"
git commit -m "feat(web): launchers with Node version check + README"
```

Then merge per the finishing-a-development-branch skill (PR to `main`).
