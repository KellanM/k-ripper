#!/bin/bash
# Build a branded K-Ripper.dmg from kripper-mac/.
# RUNS ON macOS ONLY (uses hdiutil / Finder AppleScript / SetFile).
#
# Produces a DMG whose window shows a branded background (installer/art/) with
# only install.command visible — all support files are flagged hidden — plus a
# custom volume icon. Output: ../dist/K-Ripper-macOS.dmg

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"
SRC="$PROJECT_ROOT/kripper-mac"
ART="$SCRIPT_DIR/art"
DIST="$PROJECT_ROOT/dist"
VOLNAME="K-Ripper"
OUT="$DIST/K-Ripper-macOS.dmg"

if [ "$(uname)" != "Darwin" ]; then
    echo "ERROR: This script must run on macOS (hdiutil/Finder are macOS-only)."
    exit 1
fi
for f in "$SRC/install.command" "$SRC/bin/yt-dlp" "$SRC/bin/ffmpeg-x64" "$SRC/bin/ffmpeg-arm64"; do
    [ -f "$f" ] || { echo "ERROR: missing $f"; exit 1; }
done
for a in dmg-bg.png dmg-bg@2x.png kripper.icns; do
    [ -f "$ART/$a" ] || { echo "ERROR: missing art $ART/$a"; exit 1; }
done

mkdir -p "$DIST"

# --- stage the bundle --------------------------------------------------------
STAGING=$(mktemp -d)
TMPDMG=$(mktemp -u).dmg
trap 'rm -rf "$STAGING" "$TMPDMG"' EXIT

cp -R "$SRC/"* "$STAGING/"
chmod +x "$STAGING/install.command" "$STAGING/bin/yt-dlp" "$STAGING/bin/ffmpeg-x64" "$STAGING/bin/ffmpeg-arm64"

# Retina-aware background: combine 1x + 2x into a single multi-rep TIFF.
tiffutil -cathidpicheck "$ART/dmg-bg.png" "$ART/dmg-bg@2x.png" -out "$STAGING/.bg.tiff"

# --- create a writable image, mount, and dress it up -------------------------
SIZE_MB=$(( $(du -sm "$STAGING" | cut -f1) + 40 ))
# A size-based create makes a read/write (UDRW) image by default; passing
# -format here would (confusingly) demand a -srcfolder, so we omit it.
hdiutil create -size ${SIZE_MB}m -fs HFS+ -volname "$VOLNAME" -ov "$TMPDMG" >/dev/null

DEVICE=$(hdiutil attach -readwrite -noverify -noautoopen "$TMPDMG" | egrep '^/dev/' | sed 1q | awk '{print $1}')
VOL="/Volumes/$VOLNAME"
# settle the mount
sleep 2

ditto "$STAGING/" "$VOL/"

# Volume icon (custom-icon bit on the volume root).
cp "$ART/kripper.icns" "$VOL/.VolumeIcon.icns"
SetFile -a C "$VOL"

# Background folder.
mkdir -p "$VOL/.background"
mv "$VOL/.bg.tiff" "$VOL/.background/bg.tiff"

# Hide everything except install.command so the window is clean.
for item in "$VOL"/*; do
    name="$(basename "$item")"
    [ "$name" = "install.command" ] && continue
    chflags hidden "$item" 2>/dev/null || true
done

# Finder window layout: 600x420, single icon over the background's arrow target.
osascript <<OSA
tell application "Finder"
  tell disk "$VOLNAME"
    open
    set current view of container window to icon view
    set toolbar visible of container window to false
    set statusbar visible of container window to false
    set the bounds of container window to {200, 120, 800, 540}
    set theViewOptions to the icon view options of container window
    set arrangement of theViewOptions to not arranged
    set icon size of theViewOptions to 110
    set background picture of theViewOptions to file ".background:bg.tiff"
    set position of item "install.command" of container window to {446, 200}
    update without registering applications
    delay 1
    close
  end tell
end tell
OSA

sync
hdiutil detach "$DEVICE" >/dev/null

# --- finalize: compress to a read-only distributable image -------------------
rm -f "$OUT"
hdiutil convert "$TMPDMG" -format UDZO -imagekey zlib-level=9 -o "$OUT" >/dev/null

SIZE=$(du -m "$OUT" | cut -f1)
echo "Built: $OUT (${SIZE} MB)"
