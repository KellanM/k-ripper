#!/bin/bash
# Fetch the bundled binaries that are gitignored (too large to commit).
# Populates kripper/bin (Windows) and kripper-mac/bin (macOS).
#
# Used by CI and for local builds after a fresh clone. Safe to re-run.
#
#   bash scripts/fetch-binaries.sh           # fetch for both platforms
#   bash scripts/fetch-binaries.sh windows   # Windows only
#   bash scripts/fetch-binaries.sh macos     # macOS only

set -e
ROOT="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
WHICH="${1:-both}"

YTDLP_WIN="https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"
YTDLP_MAC="https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos"
FFMPEG_WIN="https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
FFMPEG_MAC_X64="https://evermeet.cx/ffmpeg/getrelease/zip"
FFMPEG_MAC_ARM="https://github.com/eugeneware/ffmpeg-static/releases/latest/download/ffmpeg-darwin-arm64"

fetch_windows() {
  echo "== Windows binaries =="
  mkdir -p "$ROOT/kripper/bin"
  curl -sL -o "$ROOT/kripper/bin/yt-dlp.exe" "$YTDLP_WIN"
  tmp="$(mktemp -d)"
  curl -sL -o "$tmp/ff.zip" "$FFMPEG_WIN"
  unzip -q -o "$tmp/ff.zip" -d "$tmp"
  # gyan zip nests ffmpeg.exe under ffmpeg-*/bin/
  find "$tmp" -name ffmpeg.exe -exec cp {} "$ROOT/kripper/bin/ffmpeg.exe" \;
  rm -rf "$tmp"
  echo "  yt-dlp.exe + ffmpeg.exe -> kripper/bin"
}

fetch_macos() {
  echo "== macOS binaries =="
  mkdir -p "$ROOT/kripper-mac/bin"
  curl -sL -o "$ROOT/kripper-mac/bin/yt-dlp" "$YTDLP_MAC"
  curl -sL -o "$ROOT/kripper-mac/bin/ffmpeg-arm64" "$FFMPEG_MAC_ARM"
  tmp="$(mktemp -d)"
  curl -sL -o "$tmp/ff.zip" "$FFMPEG_MAC_X64"
  unzip -q -o "$tmp/ff.zip" -d "$tmp"
  find "$tmp" -name ffmpeg -type f -exec cp {} "$ROOT/kripper-mac/bin/ffmpeg-x64" \;
  rm -rf "$tmp"
  chmod +x "$ROOT/kripper-mac/bin/"* 2>/dev/null || true
  echo "  yt-dlp + ffmpeg-x64 + ffmpeg-arm64 -> kripper-mac/bin"
}

case "$WHICH" in
  windows) fetch_windows ;;
  macos)   fetch_macos ;;
  both)    fetch_windows; fetch_macos ;;
  *) echo "usage: fetch-binaries.sh [windows|macos|both]"; exit 1 ;;
esac
echo "done."
