# K-Ripper

Rip audio from any URL straight into an Ableton Live audio track. Bundled
binaries, no Python, no separate backend — install and drop the device on
a track.

## What's in this folder

```
kripper/                       # Windows bundle
├── K-Ripper.amxd              ← the device (drag into Live)
├── kripper.js                 ← Max for Live JS (Live API integration)
├── kripper.mjs                ← Node engine (drives the bundled binaries)
├── package.json
├── bin/
│   ├── yt-dlp.exe             ← URL extractor / downloader
│   └── ffmpeg.exe             ← WAV conversion
├── assets/                    ← UI icons
├── install.bat / install.ps1  ← simple installer (no GUI)
├── make_amxd.py               ← .maxpat → .amxd converter (dev tool)
├── gen_icons.py               ← icon renderer (dev tool)
└── K-Ripper.maxpat            ← editable patcher source
```

The macOS bundle (`../kripper-mac/`) mirrors this with Mach-O binaries —
`bin/yt-dlp` (universal) plus `bin/ffmpeg-x64` and `bin/ffmpeg-arm64`;
the engine picks the right ffmpeg for the machine at runtime.

## Requirements

- Ableton Live 11 or 12 with **Max for Live** (ships with Suite)
- That's it — Max bundles its own Node.js runtime for `node.script`,
  and yt-dlp/ffmpeg are included.

## Install

- **Windows:** run `dist/K-Ripper-Windows-Setup.exe` (GUI wizard), or
  double-click `install.bat` in this folder.
- **macOS:** unzip `dist/K-Ripper-macOS.zip`, double-click
  `install.command`.

Then in Live: **User Library → Audio Effects → Max Audio Effect →
K-Ripper** → drag onto an audio track.

## Use

1. Copy a track URL to your clipboard (or paste one into the URL field)
2. Click **RIP**
3. Status walks through fetching → ripping → converting → `✓ slot N`.
   The clip lands in the first empty Session slot of the device's track,
   warp off, ready to play.

Ripped WAVs are saved to **`~/Music/K-Ripper`** (override with the
`KRIPPER_OUTPUT` environment variable).

## What it supports

Anything yt-dlp supports — SoundCloud, YouTube, Bandcamp, Mixcloud,
TikTok, Instagram, Twitch, Vimeo, Reddit, and ~1700 other sites. DRM
platforms (Spotify, Apple Music) are not supported and can't be.

The bundled yt-dlp self-updates in the background each time the device
loads, so site extractors stay current without reinstalling.

## Troubleshooting

- **`error: unavailable or private`** — the track is subscriber-only,
  region-locked, or deleted. Full detail prints in the Max Console
  (Window → Max Console with the device's Max editor open).
- **`error: engine missing — reinstall`** — `bin/` binaries are gone
  (antivirus quarantine is the usual culprit for yt-dlp.exe). Re-run
  the installer and whitelist the folder if it recurs.
- **No sound through the device** — the patcher's `plugin~ → plugout~`
  pair relays track audio; if it was deleted in editing, re-add it.
- **Clip never appears** — the device needs an *audio* track with at
  least one empty Session clip slot.
- **Device missing from Live's browser** — your User Library may be in
  a custom location (Live: Preferences → Library); re-run the installer
  and point it there.

## Developing

Edit `K-Ripper.maxpat` in Max, then regenerate the device:

```
python make_amxd.py K-Ripper.maxpat K-Ripper.amxd audio_effect
```

`kripper.js` (autowatch) and `kripper.mjs` (@watch) hot-reload when the
files change on disk. Rebuild distribution artifacts per
`../installer/README.md`.
