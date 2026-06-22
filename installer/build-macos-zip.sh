#!/bin/bash
# Bundle kripper-mac/ as a zip for distribution.
# Runs on any OS that has zip available.

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"
SRC="$PROJECT_ROOT/kripper-mac"
DIST="$PROJECT_ROOT/dist"

if [ ! -d "$SRC" ]; then
    echo "ERROR: $SRC not found"
    exit 1
fi

if [ ! -f "$SRC/bin/yt-dlp" ] || [ ! -f "$SRC/bin/ffmpeg-x64" ] || [ ! -f "$SRC/bin/ffmpeg-arm64" ]; then
    echo "ERROR: macOS binaries missing in $SRC/bin/ (need yt-dlp, ffmpeg-x64, ffmpeg-arm64)"
    exit 1
fi

mkdir -p "$DIST"

# Stage a renamed top-level folder so the zip extracts to "K-Ripper/"
STAGING=$(mktemp -d)
trap "rm -rf $STAGING" EXIT
cp -R "$SRC" "$STAGING/K-Ripper"

# Ensure install.command is executable inside the bundle
chmod +x "$STAGING/K-Ripper/install.command"
chmod +x "$STAGING/K-Ripper/bin/yt-dlp"
chmod +x "$STAGING/K-Ripper/bin/ffmpeg-x64"
chmod +x "$STAGING/K-Ripper/bin/ffmpeg-arm64"

OUT="$DIST/K-Ripper-macOS.zip"
rm -f "$OUT"
(cd "$STAGING" && zip -qr "$OUT" "K-Ripper")

SIZE=$(du -m "$OUT" | cut -f1)
echo "Built: $OUT (${SIZE} MB)"
