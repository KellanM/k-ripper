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
