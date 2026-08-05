# K-Ripper Web — Design Spec

**Date:** 2026-08-04
**Status:** Approved design, pending implementation plan

## Summary

A standalone local web app version of the K-Ripper Max for Live device. A
zero-dependency Node server (reusing the repo's bundled yt-dlp/ffmpeg and
existing analysis code) serves a browser UI at `http://127.0.0.1:8420`.
Users paste a URL (track, or a playlist/set), and files download at the
highest available fidelity — the **original stream, untouched** (no
transcoding). Finished files land in `~/Music/K-Ripper`, with BPM/key
analysis, cover art, and a queue/history UI.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Deployment | Local app: Node server + browser UI at localhost. No hosting. |
| Fidelity | Original stream kept untouched (`bestaudio`, no WAV conversion). |
| File delivery | Saved server-side to `~/Music/K-Ripper` + reveal-in-folder button. No browser download. |
| Features (v1) | Playlist/set support, download queue + session history, cover art + metadata display, BPM + key analysis. |
| Packaging | Double-click launcher (`.bat` / `.command`) that starts the server and opens the browser. Windows + macOS. |
| Stack | Vanilla Node (`node:http`) + hand-written static UI. No frameworks, no build step, no npm dependencies. |

## Architecture

### Shared engine, two frontends

The rip pipeline is extracted from `kripper/kripper.mjs` into a new
**`kripper/engine.mjs`** — a Max-free module:

```
engine.rip(url, { emit, outputDir, ytdlpPath, ffmpegPath, convertToWav: false })
  → Promise<{ audioPath, artPath, bpm, keyInfo }>
```

- `emit(event, ...args)` receives the existing event vocabulary:
  `status`, `progress`, `track`, `art`, `bpm`, `key`, `done`, `cancelled`,
  `error` — identical semantics to today's Max outlets.
- The engine owns: yt-dlp spawn + args (retries, concurrent fragments,
  `--no-playlist` per job, thumbnail conversion), staging-dir resolution,
  kill-tree cancellation, timeouts, optional WAV conversion (used by the
  device, skipped by the web app), and the analysis worker
  (`analysis-worker.mjs` in a worker thread with `execArgv: []`).
- `kripper/kripper.mjs` becomes a thin Max adapter: clipboard reading,
  `Max.addHandler`/`Max.outlet` forwarding, yt-dlp self-update, and the
  version manifest check. Behavior of the device must be unchanged.
- `kripper-web/` imports `engine.mjs`, `lib.mjs`, `analysis-worker.mjs`,
  `vendor/`, and spawns the binaries in `kripper/bin/` (or `kripper-mac/bin/`
  on macOS) — nothing is duplicated.
- The device installer file-set gains one file (`engine.mjs`) on both
  platforms (see `packaging-m4l-installers` skill when releasing).

### Analysis on original formats

`analysis-worker.mjs` already decodes its input via ffmpeg
(`ffmpegAnalysisArgs`), which is format-agnostic — it accepts the original
m4a/opus/mp3 directly. The `wavPath` workerData name is renamed to
`audioPath`; no pipeline change.

## Web server — `kripper-web/server.mjs`

Plain `node:http`, **bound to 127.0.0.1 only** (never LAN-exposed).
Default port **8420**; if taken, increment until a free port is found and
open the browser at the actual port.

### API

| Route | Behavior |
|---|---|
| `POST /api/rip` `{url}` | Extract URL (`extractUrl`). If it's a playlist/set, enumerate entries with `yt-dlp --flat-playlist --print` and enqueue one job per track; otherwise enqueue one job. Returns `{ jobs: [{id, url, title?}] }`. |
| `GET /api/events` | SSE stream. Events: `queued`, `status`, `progress`, `track`, `art`, `bpm`, `key`, `done`, `cancelled`, `error` — each tagged with its job id. |
| `GET /api/jobs` | Current queue + this-session history (in-memory). |
| `POST /api/jobs/:id/cancel` | Cancels a queued job (removes it) or the running job (kill-tree, same as device). |
| `POST /api/reveal` `{id}` | Opens the OS file manager with the finished file selected (`explorer /select,` on Windows, `open -R` on macOS). Only accepts ids of finished jobs — never arbitrary paths. |
| `GET /api/art/:id` | Serves the job's cover-art JPG. For history rows restored from `localStorage` after a server restart (job id unknown to the server), the UI instead requests `GET /api/art?file=<basename>`, which serves only plain basenames resolved strictly inside the output dir (no traversal); if the file is gone, the row shows a placeholder. |
| `GET /` + static | Serves `kripper-web/public/`. |

### Queue semantics

- Jobs run **serially** — one yt-dlp process at a time (matches the device;
  kind to SoundCloud's CDN; keeps progress reporting unambiguous).
- Playlist expansion happens at enqueue time; each track is an independent
  job with its own row, progress, analysis, and error state.
- A failed job never affects the rest of the queue.
- Queue and history are in-memory for the server's lifetime; the UI
  additionally persists finished-job metadata (title, path, bpm/key, art
  reference) to `localStorage` so history survives a page refresh.

### Output

- Files land in `~/Music/K-Ripper` (same `KRIPPER_OUTPUT` env override as
  the device), staged in `.staging/<job-id>/` during download so concurrent
  state is impossible to corrupt; staging dirs are cleaned per job.
- **No WAV conversion** — the file yt-dlp produces is the file kept.

## UI — `kripper-web/public/`

Single static page (`index.html` + `style.css` + `app.js`), no build step,
reusing the k-ripper brand assets (`kripper/assets/`).

- **Header:** paste box + RIP button. Pasting a URL and pressing Enter
  also submits. Playlist URLs show a "queuing N tracks…" interstitial.
- **Queue/history list:** one row per job — cover art thumbnail, title,
  uploader, progress bar, status text, BPM badge and Camelot key badge
  (appear when analysis lands), reveal-in-folder button, cancel button
  (while queued/running).
- All live updates arrive over the SSE stream; the page re-syncs from
  `GET /api/jobs` on load/reconnect.
- Server-unreachable state (user closed the terminal window) shows a
  clear "server stopped — relaunch K-Ripper Web" banner.

## Launcher & packaging

- `kripper-web/Start K-Ripper Web.bat` (Windows) and
  `kripper-web/Start K-Ripper Web.command` (macOS):
  1. Check `node` is on PATH and ≥ v18 (needs `fetch`, worker threads,
     ES modules). If missing: friendly message pointing at nodejs.org,
     and exit without a stack trace.
  2. Start `server.mjs`.
  3. Open the default browser at the served URL.
- The web app requires a system Node install — Max's embedded Node runtime
  is not available outside Live. This is documented in `kripper-web/README.md`.
- No installer work in v1; the folder runs in place from the repo/release
  zip. (Inno Setup / DMG integration can come later if wanted.)

## Error handling

- Per-job errors go through the existing `classifyError` and render in the
  job's row; full detail logs to the server console.
- Engine timeouts unchanged: 30 min yt-dlp, 120 s analysis ceiling.
- The server process never exits on job failure; unhandled route errors
  return JSON `{error}` with a 4xx/5xx status.
- yt-dlp self-update runs at server start (fire-and-forget, same as device).

## Testing

- New pure helpers get unit tests alongside the existing `lib.mjs` test
  style: playlist-enumeration output parsing, queue state transitions
  (queued → running → done/cancelled/error), port-fallback logic.
- Engine extraction is regression-checked by loading the M4L device in
  Live after the refactor and performing a full rip — behavior must be
  identical (status flow, clip lands, BPM/key shown).
- Manual smoke of the web app: single track, SoundCloud set, cancel
  mid-download, invalid URL, server restart with history present.

## Out of scope (v1)

- Hosting / multi-user / auth of any kind.
- Browser-download delivery of files.
- Format conversion options (WAV/FLAC selector).
- Electron packaging or a bundled Node runtime.
- Device installer changes beyond adding `engine.mjs` to the file set.

## Risks

- **Engine refactor touches the shipped device.** The next device release
  must include `engine.mjs` in the installer file set and pass the
  regression check above.
- **System Node dependency** is a new install requirement the device never
  had; mitigated by the launcher's version check and README note.
- Playlist rips of huge sets are long-running by nature; serial queue +
  per-job progress keeps this legible, but there is no resume-after-server-
  restart in v1.
