# Releasing K-Ripper

## Tests

Run before cutting a release (CI also runs them on every push/PR):

```bash
node --test            # unit tests for the engine logic (kripper/lib.mjs)
KRIPPER_NET=1 node --test   # + source-rot integration check (hits the network)
```


Every release ships two installers and updates the version manifest so
installed devices notice the update.

## Version bumps (keep these three in sync)

1. `kripper/kripper.mjs` → `KRIPPER_VERSION`
2. `installer/kripper.iss` → `MyAppVersion`
3. `version.json` → `version`

## Build artifacts

Bundled binaries are gitignored. Populate them first:

```bash
bash scripts/fetch-binaries.sh
```

Then mirror the cross-platform device files into the Mac bundle and build:

```bash
# regenerate the device from the patcher
python kripper/make_amxd.py kripper/K-Ripper.maxpat kripper/K-Ripper.amxd audio_effect

# mirror device + scripts into the Mac bundle (everything except bin/)
cp kripper/K-Ripper.amxd kripper/kripper.js kripper/kripper.mjs kripper/analysis-worker.mjs kripper/lib.mjs \
   kripper/package.json kripper/LICENSES.txt kripper-mac/
rm -rf kripper-mac/assets kripper-mac/vendor
cp -r kripper/assets kripper/vendor kripper-mac/   # vendor = music-tempo + pitch-detection

# Windows installer (Inno Setup)
"$LOCALAPPDATA/Programs/Inno Setup 6/ISCC.exe" installer/kripper.iss

# macOS zip — built via Python (Windows has no `zip`); see installer/README.md
# macOS dmg — installer/build-dmg.sh, must run on a Mac
```

Outputs land in `dist/`.

## Cut the release

```bash
git tag v0.3.2
git push origin v0.3.2
gh release create v0.3.2 \
  dist/K-Ripper-Windows-Setup.exe \
  dist/K-Ripper-macOS.dmg \
  dist/K-Ripper-macOS.zip \
  --title "K-Ripper v0.3.2" --notes "..."
```

Then commit the bumped `version.json` to `main` — that's what the update-check
reads, so installed devices will surface the new version on next load.

## Automated builds

`.github/workflows/release.yml` fetches binaries, builds both installers on
native runners, and attaches them to the release when you push a `v*` tag.
The manual steps above are the fallback / local path.
