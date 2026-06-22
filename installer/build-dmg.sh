#!/bin/bash
# Build K-Ripper.dmg from kripper-mac/.
# RUNS ON macOS ONLY (uses hdiutil).
#
# Output: ../dist/K-Ripper.dmg

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"
SRC="$PROJECT_ROOT/kripper-mac"
DIST="$PROJECT_ROOT/dist"

if [ "$(uname)" != "Darwin" ]; then
    echo "ERROR: This script must run on macOS (hdiutil is macOS-only)."
    exit 1
fi

if [ ! -d "$SRC" ]; then
    echo "ERROR: $SRC not found"
    exit 1
fi

if [ ! -f "$SRC/bin/yt-dlp" ] || [ ! -f "$SRC/bin/ffmpeg-x64" ] || [ ! -f "$SRC/bin/ffmpeg-arm64" ]; then
    echo "ERROR: macOS binaries missing in $SRC/bin/ (need yt-dlp, ffmpeg-x64, ffmpeg-arm64)"
    exit 1
fi

mkdir -p "$DIST"

# Stage the dmg contents in a temp folder
STAGING=$(mktemp -d)
trap "rm -rf $STAGING" EXIT

cp -R "$SRC/"* "$STAGING/"

# Make install.command and binaries executable
chmod +x "$STAGING/install.command"
chmod +x "$STAGING/bin/yt-dlp"
chmod +x "$STAGING/bin/ffmpeg-x64"
chmod +x "$STAGING/bin/ffmpeg-arm64"

# Add a README so users know what to do
cat > "$STAGING/README.txt" <<'EOF'
K-Ripper for Ableton Live (macOS)
==================================

To install:

  Open Terminal and run:
    bash "/Volumes/K-Ripper/install.command"

  (or drag install.command onto a Terminal window)

That's it. K-Ripper will be added to your Ableton User Library at:
  ~/Music/Ableton/User Library/Presets/Audio Effects/Max Audio Effect/K-Ripper

After installation:
  1. Open Ableton Live (restart if it was running)
  2. Browser -> User Library -> Audio Effects -> Max Audio Effect -> K-Ripper
  3. Drag K-Ripper onto any audio track
  4. Copy a track URL, click RIP

Requirements: Ableton Live 11 or 12 with Max for Live (Suite).
EOF

# Build the dmg
OUT="$DIST/K-Ripper.dmg"
rm -f "$OUT"
hdiutil create -volname "K-Ripper" \
  -srcfolder "$STAGING" \
  -ov -format UDZO \
  "$OUT"

SIZE=$(du -m "$OUT" | cut -f1)
echo "Built: $OUT (${SIZE} MB)"
