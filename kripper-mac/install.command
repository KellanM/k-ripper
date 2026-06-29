#!/bin/bash
# K-Ripper :: macOS installer
# Copies the device + bundled binaries into Ableton's User Library.
# No Python, no separate backend. Double-click to run.

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo -e "${RED}K-Ripper${NC}  ::  macOS installer"
echo "================================"

# Find the folder this script lives in
SRC="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Report machine architecture (we bundle ffmpeg for both)
ARCH="$(uname -m)"
echo ""
echo -e "${CYAN}[1/3]${NC} Detected Mac: $ARCH"

# Locate Ableton User Library (Live's default on macOS is in ~/Music)
echo ""
echo -e "${CYAN}[2/3]${NC} Locating Ableton User Library..."

CANDIDATES=(
  "$HOME/Music/Ableton/User Library"
  "$HOME/Documents/Ableton/User Library"
)
USER_LIB=""
for c in "${CANDIDATES[@]}"; do
  if [ -d "$c" ]; then
    USER_LIB="$c"
    break
  fi
done

if [ -z "$USER_LIB" ]; then
  echo -e "      ${YELLOW}Default location not found.${NC}"
  echo "      (If you moved your User Library, check Live's Preferences > Library.)"
  read -p "      Enter full path to your Ableton User Library: " USER_LIB
  if [ ! -d "$USER_LIB" ]; then
    echo -e "${RED}ERROR:${NC} Path does not exist: $USER_LIB"
    exit 1
  fi
fi
echo "      $USER_LIB"

# Verify bundled files
for f in K-Ripper.amxd kripper.js kripper.mjs lib.mjs package.json vendor/music-tempo/MusicTempo.js vendor/pitch-detection/chroma.js bin/yt-dlp bin/ffmpeg-x64 bin/ffmpeg-arm64; do
  if [ ! -f "$SRC/$f" ]; then
    echo -e "${RED}ERROR:${NC} Missing: $SRC/$f"
    echo "      The zip may not have extracted completely — re-extract and retry."
    exit 1
  fi
done

# Install
echo ""
echo -e "${CYAN}[3/3]${NC} Installing K-Ripper into User Library..."
DEST="$USER_LIB/Presets/Audio Effects/Max Audio Effect/K-Ripper"
mkdir -p "$DEST"

cp "$SRC/K-Ripper.amxd" "$DEST/"
cp "$SRC/kripper.js" "$DEST/"
cp "$SRC/kripper.mjs" "$DEST/"
cp "$SRC/lib.mjs" "$DEST/"
cp "$SRC/package.json" "$DEST/"

rm -rf "$DEST/bin"
cp -R "$SRC/bin" "$DEST/"
rm -rf "$DEST/assets"
cp -R "$SRC/assets" "$DEST/"
rm -rf "$DEST/vendor"
cp -R "$SRC/vendor" "$DEST/"

# Make binaries executable and strip macOS Gatekeeper quarantine flags from
# everything we installed (recursive — covers binaries, scripts, assets).
chmod +x "$DEST/bin/yt-dlp" "$DEST/bin/ffmpeg-x64" "$DEST/bin/ffmpeg-arm64"
xattr -dr com.apple.quarantine "$DEST" 2>/dev/null || true

echo "      Installed to: $DEST"

# Done
echo ""
echo "================================"
echo -e "${GREEN}K-Ripper installed.${NC}"
echo ""
echo -e "${CYAN}To use:${NC}"
echo "  1. Open Ableton Live (restart it if it was already running)"
echo "  2. In the browser, navigate to:"
echo "       User Library -> Audio Effects -> Max Audio Effect -> K-Ripper"
echo "  3. Drag K-Ripper onto any audio track"
echo "  4. Copy a track URL to your clipboard, click RIP"
echo ""
echo "Ripped audio is saved to: ~/Music/K-Ripper"
echo ""
echo "Press any key to exit..."
read -n 1 -s
