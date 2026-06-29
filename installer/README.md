# K-Ripper distribution builds

Build pipeline for the three distribution artifacts:

| Output | Builder | Runs on |
|---|---|---|
| `dist/K-Ripper-Windows-Setup.exe` | `build-windows.bat` | Windows |
| `dist/K-Ripper-macOS.dmg` | `build-dmg.sh` (branded — primary mac download) | macOS only (uses `hdiutil`) |
| `dist/K-Ripper-macOS.zip` | `build-macos-zip.sh` (fallback) | Any OS |

## Source layout

```
SoundCloudDownloader/
├── kripper/                   # Windows-ready bundle (current dev folder)
│   ├── K-Ripper.amxd
│   ├── kripper.js, kripper.mjs, package.json
│   ├── bin/{yt-dlp,ffmpeg}.exe
│   ├── assets/icon_*.png
│   ├── install.bat / install.ps1   # raw installer (no GUI)
│   └── ...
├── kripper-mac/               # macOS-ready bundle (mirror with Mac binaries)
│   ├── K-Ripper.amxd, kripper.js, kripper.mjs, package.json
│   ├── bin/{yt-dlp,ffmpeg}    # Mach-O binaries
│   ├── assets/
│   └── install.sh
├── installer/
│   ├── kripper.iss            # Inno Setup script (Windows GUI installer)
│   ├── build-windows.bat
│   ├── build-macos-zip.sh
│   └── build-dmg.sh
└── dist/                      # Build outputs (gitignored)
```

## Windows GUI installer

1. **One-time:** install Inno Setup 6 from <https://jrsoftware.org/isdl.php>
   (or `winget install JRSoftware.InnoSetup`).
2. Double-click `installer/build-windows.bat`.
3. Output lands in `dist/K-Ripper-Windows-Setup.exe`.

The installer is ~40 MB, requires no admin rights, and drops everything
into the user's Ableton User Library by default. Standard Inno Setup
wizard look (Welcome / Destination / Ready / Progress / Done).

## macOS zip bundle

The zip contains a `K-Ripper/` folder with the device, scripts, and
binaries. Users extract anywhere and run `install.sh`.

To rebuild:

```bash
bash installer/build-macos-zip.sh        # POSIX systems with zip
# or, on Windows where `zip` isn't installed:
python -c "<<see the inline script used during the build>>"
```

The Python path is what's currently used; preserves Unix `0755` exec
perms on `install.sh` and the two binaries so they're runnable after
unzip on macOS.

## macOS DMG (primary download)

**Must run on macOS** (uses `hdiutil`, Finder AppleScript, and `SetFile`).
Built automatically by the release CI; the landing page links to it.

```bash
bash installer/build-dmg.sh
```

Produces a **branded** image — custom background + volume icon from
`installer/art/` (`dmg-bg*.png`, `kripper.icns`) — with a clean window
showing only `install.command` (support files flagged hidden). Output:
`dist/K-Ripper-macOS.dmg`. Users mount it and double-click
`install.command`; K-Ripper lands in their User Library.

## Updating the build

When `kripper/` or `kripper-mac/` change (new `.amxd`, updated scripts,
swapped icons, etc.), re-run the builders.

If you change `kripper/`, copy the cross-platform pieces (everything
except `bin/`, `install.bat`, `install.ps1`) into `kripper-mac/` before
rebuilding the Mac artifacts:

```bash
# from project root
cp kripper/K-Ripper.amxd kripper/kripper.js kripper/kripper.mjs \
   kripper/package.json kripper-mac/
cp -r kripper/assets kripper-mac/
```

## Bundle sizes (current)

| Artifact | Size |
|---|---|
| Windows installer | ~41 MB |
| macOS zip | ~59 MB |
| macOS DMG | similar to zip |

ffmpeg dominates: ~84 MB on Windows, ~77 MB on macOS (both static
builds, no external library dependencies).
