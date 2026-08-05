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
