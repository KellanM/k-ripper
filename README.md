<h1 align="center">K-Ripper</h1>

<p align="center">Rip audio from a URL straight into an Ableton Live track.</p>

<p align="center">
  <a href="https://github.com/KellanM/k-ripper/releases/latest"><b>⬇ Download the latest release</b></a>
</p>

---

K-Ripper is a [Max for Live](https://www.ableton.com/en/live/max-for-live/)
audio-effect device. Drop it on an audio track, paste (or copy) a link, hit
**RIP**, and the track lands in the next empty clip slot — no browser, no
sketchy download sites, no leaving Ableton.

## Install

**You need Ableton Live 11 or 12 with Max for Live** (included in Suite).

| Platform | Download | Then |
|----------|----------|------|
| **Windows** | `K-Ripper-Windows-Setup.exe` | Double-click. SmartScreen may warn (unsigned) → **More info → Run anyway**. |
| **macOS** | `K-Ripper-macOS.zip` | Unzip, double-click `install.command`. Gatekeeper may warn → **System Settings → Privacy & Security → Open Anyway**. |

Both are on the [**Releases**](https://github.com/KellanM/k-ripper/releases/latest)
page. After installing, open Live → browser → **User Library → Audio Effects →
Max Audio Effect → K-Ripper** → drag onto an audio track.

## Use

1. Copy a track URL to your clipboard (or type one into the field)
2. Click **RIP**
3. The clip appears in the first empty Session slot, warp off, ready to play.
   Click **RIP** again mid-download to cancel.

Ripped WAVs (plus cover art) are saved to `~/Music/K-Ripper`.

## Supported sources

SoundCloud · YouTube · Bandcamp · Mixcloud · TikTok · Twitch · Vimeo · Reddit

…and ~1700 other sites under the hood via
[yt-dlp](https://github.com/yt-dlp/yt-dlp). DRM-protected platforms (Spotify,
Apple Music) are **not** supported and can't be. Login-gated content
(Instagram, private/subscriber tracks) won't download without cookies.

## How it works

```
K-Ripper.amxd  (Max for Live device on an audio track)
 ├─ kripper.js   — Max JS → Live Object Model (drops the clip)
 └─ kripper.mjs  — Node-for-Max engine
       ├─ yt-dlp   (bundled) — downloads best audio from the URL
       └─ ffmpeg   (bundled) — converts to WAV (Live's clip API needs it)
```

No separate app or backend runs — the device spawns the bundled binaries
directly. yt-dlp self-updates in the background so site support stays current.

## Legal / personal use

K-Ripper is a tool, provided free for **personal use**. Use it only with
content you have the right to download, and respect the terms of service of the
sources you rip from and applicable copyright law. Don't redistribute, sell, or
re-upload audio you don't own.

## Building from source

The bundled binaries are not committed (too large). After cloning:

```bash
bash scripts/fetch-binaries.sh        # downloads yt-dlp + ffmpeg into */bin
python kripper/make_amxd.py kripper/K-Ripper.maxpat kripper/K-Ripper.amxd audio_effect
```

See [RELEASING.md](RELEASING.md) for the full build-and-release process.

## License

K-Ripper's own code is [MIT](LICENSE). Bundled binaries retain their own
licenses (FFmpeg = GPL, yt-dlp = Unlicense) — see
[kripper/LICENSES.txt](kripper/LICENSES.txt).
