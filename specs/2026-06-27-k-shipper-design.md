# K-Shipper — design spec

- **Date:** 2026-06-27
- **Status:** Approved design, pre-implementation
- **Author:** Kellan Mythen (with Claude)
- **Relation:** Sibling device to **K-Ripper**. K-Ripper *rips audio in* from the web; K-Shipper *ships finished masters out* to release destinations. Together they form the two ends of "in and out of Ableton."

> Spec location note: this lives in `specs/` (repo root) rather than the
> brainstorming-skill default `docs/superpowers/specs/`, because this repo's
> `docs/` is the published GitHub Pages site (k-ripper.app) and specs should
> not be publicly served.

---

## 1. Problem & motivation

Ableton has **no release/distribution tooling**. The moment a track is finished, the producer leaves Live for a multi-app slog that repeats on every release: export a master → loudness-check/normalize → convert formats → tag metadata + artwork → hand off to a distributor / Bandcamp / SoundCloud. Most of this is fiddly, error-prone (true-peak clipping on lossy encode is a classic miss), and breaks flow.

K-Shipper collapses the **first, universal step** of that slog — *preparing a finished master for delivery* — into one in-Live action, using the exact K-Ripper formula: a Max for Live device driving a **bundled ffmpeg** via a Node-for-Max engine, fully offline, nothing to install or upload.

## 2. Job-to-be-done

> "I just finished a master. Give me clean, correctly-loud, properly-tagged delivery files I can hand to a distributor or Bandcamp — without leaving Live and without fighting export settings."

**Audience:** the same electronic producers/DJs as K-Ripper. The device cross-promotes with K-Ripper and shares the k-ripper.app channel and brand.

## 3. Scope

### v1 (this spec)
Drop a finished master → produce **distributor/Bandcamp-ready deliverables**:
- A **24-bit WAV** and a **FLAC**, both loudness-handled and metadata/artwork-tagged.
- **Loudness:** measure integrated LUFS + true peak; normalize to an **adjustable target (default −14 LUFS)** with a **−1 dBTP true-peak ceiling**; the target can be changed or normalization disabled ("preserve loudness, peak-safe only"). Measured values are always reported back to the user.
- **Metadata + artwork** embedded.

### Explicitly NOT in v1 (deferred to v2+)
- MP3 320 and other lossy encodes.
- Audiogram / waveform-over-artwork social video (ffmpeg `showwaves`/`showspectrum`).
- Per-platform loudness *variants* (a separate file tuned to each service's LUFS).
- **Direct uploads** to any platform (SoundCloud / YouTube OAuth, etc.).
- Real-time "master-tap" capture from the master bus (v1 is file-based; see §5).

These are recorded so the architecture leaves room for them, but none are built in v1.

## 4. Non-goals
- Not a mastering tool — it does not EQ, compress, or "improve" the audio. It only handles **loudness normalization + true-peak safety + format/tagging**.
- Not a distributor — it prepares files; it does not register releases or assign ISRCs.

## 5. Architecture

≈80% reused from K-Ripper. New device folder (working name `kshipper/`), same shape as `kripper/`.

| Layer | Reuse | Notes |
|---|---|---|
| `.amxd` audio-effect device | Pattern reused | Presentation-mode UI, scripting-name elements, Max JS (`shipper.js`) for UI + Live API touchpoints. |
| Node-for-Max engine `shipper.mjs` | Pattern reused from `kripper.mjs` | Spawns bundled ffmpeg (array args, no shell), message contract to/from the Max JS UI, best-effort/never-crash discipline, `killTree` cancel, timeouts. |
| Bundled **ffmpeg** | Binary reused | Does ALL processing. **No yt-dlp needed** — K-Shipper does not download — so the bundle is lighter than K-Ripper's. |
| `lib.mjs` pure helpers + `node:test` | Pattern reused | Filename/foldername sanitizing, loudnorm-JSON parsing, ffmpeg arg builders, metadata escaping — all pure + unit-tested. |
| Installer / CI / distribution | Reused wholesale | Inno (Windows) + branded DMG (macOS), GitHub Releases, version-check, CI. Same art pipeline (`installer/art/`). |

**Why file-based (not master-tap) for v1:** taking a rendered file as input mirrors K-Ripper exactly (K-Ripper *produces* a WAV from a URL; K-Shipper *consumes* a WAV and produces deliverables), requires zero Max audio-thread work, and is the lowest-risk path. Real-time capture is a v2 consideration.

### Data flow
```
master.wav (+ metadata form + artwork)
   │  (drop / browse)
   ▼
shipper.mjs ── ffmpeg pass 1: loudness scan (loudnorm print_format=json) ──► measured LUFS/TP
   │
   ├─ ffmpeg pass 2: loudnorm (linear) to target + TP ceiling ─► normalized stream
   │        (or: preserve loudness, true-peak limit only)
   │
   ├─ encode WAV (pcm_s24le) + tag metadata
   ├─ encode FLAC (+ embedded artwork) + tag metadata
   └─ write cover.jpg + loudness.txt
   ▼
<Artist> - <Title>/  ◄── output folder
```

## 6. User flow / UI

1. **Provide the master:** drag a file onto the device's drop zone, or click **Browse**. Accepts lossless inputs (WAV / AIFF / FLAC); warns (does not block) if given a lossy source.
2. **Metadata form** (compact fields in the device): Title*, Artist*, Album/Release, Year (default current), Genre, ISRC (optional), and a **cover-artwork drop**. (* required.)
3. **Loudness control:** a target-LUFS number field (default **−14**) with an **off/preserve** toggle; the −1 dBTP ceiling is always applied.
4. **SHIP** button. Status line mirrors K-Ripper's: progress, then a result like `✓ −14.0 LUFS · −1.0 dBTP · WAV+FLAC` (and the measured *input* loudness, e.g. `in: −9.2 LUFS`). The engine also posts a one-line analysis log to the Max console (à la K-Ripper).
5. **Cancel** mid-run kills the ffmpeg child (reused `killTree`).

UI styling matches the K-Ripper device + k-ripper.app brand (dark device, signal-red accents).

## 7. Processing pipeline (ffmpeg)

All ffmpeg invocations use **array args, no shell**; the input path comes from the user's own filesystem (trusted) but is still never interpolated into a shell string.

1. **Loudness scan (pass 1):**
   `loudnorm=I=<target>:TP=-1:LRA=11:print_format=json` to `-f null`; parse `input_i`, `input_tp`, `input_lra`, `input_thresh`, `target_offset` from the JSON on stderr.
2. **Normalize (pass 2):** feed the measured values back into a second `loudnorm` pass with `linear=true` (linear gain — preserves dynamics, just scales — falling back to dynamic only when linear can't hit target), `I=<target>`, `TP=-1`. **If "preserve" is selected:** skip loudness change and instead apply only a true-peak ceiling at −1 dBTP (oversampled true-peak limiting), leaving integrated loudness untouched.
3. **Encode deliverables** from the processed stream:
   - **WAV** — `pcm_s24le`, source sample rate preserved.
   - **FLAC** — 24-bit, high compression, **embedded cover art**.
4. **Tag metadata** into both (title/artist/album/date/genre/ISRC), with values safely passed as discrete args.
5. **Sidecars:** copy `cover.jpg` alongside (because WAV artwork embedding is unreliable across players, so the cover ships as a discrete file too — honest limitation), and write `loudness.txt` (measured input + output LUFS/TP, target, settings).

Exact filter chains and flags are finalized in the implementation plan; this section defines intent + the 2-pass approach.

## 8. Metadata fields (v1)

| Field | Required | Notes |
|---|---|---|
| Title | yes | Also drives output folder/file names. |
| Artist | yes | Also drives output folder name. |
| Album / Release | no | |
| Year | no | Defaults to current year. |
| Genre | no | |
| ISRC | no | For producers who already hold one; embedded if provided. |
| Cover artwork | no | Image dropped by user; embedded in FLAC, copied as `cover.jpg`. |

(Composer / label / BPM considered and deferred — not part of the minimal delivery set; easy to add later.)

## 9. Output

Default: a folder `<Artist> - <Title>/` created **next to the source master** (location configurable in the device; a fixed `~/Music/K-Shipper/` is the alternative). Contents:
```
<Artist> - <Title>/
├── <Artist> - <Title>.wav     # 24-bit, tagged
├── <Artist> - <Title>.flac    # 24-bit, tagged, embedded art
├── cover.jpg                  # if artwork provided
└── loudness.txt               # measured in/out LUFS + TP, settings
```
Artist/Title are sanitized for the filesystem (illegal characters stripped/replaced) by a pure helper. If the folder exists, files are overwritten (a finished master is re-shippable); never deletes unrelated files.

## 10. Error handling & edge cases

- **Missing required metadata** (Title/Artist) → block SHIP with a clear status message.
- **No artwork** → proceed; skip embed + `cover.jpg`.
- **Input already hotter than −1 dBTP** → the TP ceiling brings it down; reported in `loudness.txt`.
- **Lossy / unexpected input** → warn but attempt (ffmpeg decodes it); the WAV/FLAC will be honest re-encodes of lossy source.
- **ffmpeg failure / unreadable file / locked output** → friendly status message (reuse K-Ripper's `classifyError` patterns: EACCES "file in use", ENOENT "engine missing", etc.); never crash the device.
- **Cancel** mid-run → `killTree` the ffmpeg child, clean partial outputs.
- **Silent / zero-length input** → loudnorm reports −inf; surface "no audio detected", do not write deliverables.

## 11. Testing

- **Unit (`node --test`, CI):** pure helpers in `lib.mjs` — filesystem-safe name building, loudnorm-JSON parsing (incl. malformed/partial), ffmpeg arg builders (assert array shape, target/TP flags, no shell), metadata escaping, `loudness.txt` formatting.
- **Opt-in integration (`KRIPPER_AUDIO=1`-style flag):** synthesize a test tone at a known level via ffmpeg, run the full pipeline, assert the WAV+FLAC exist and the **output** measured LUFS lands within tolerance of the target and TP ≤ −1 dBTP. Mirrors K-Ripper's `bpm-detect`/`key-detect` opt-in tests (needs the bundled ffmpeg, so it's skipped on the unit-test CI runner).

## 12. Distribution

Same machine as K-Ripper: bundled ffmpeg (per-arch on macOS), Windows Inno installer + branded macOS DMG (reuse `installer/art/` pipeline), GitHub Releases with direct-download links, version-check manifest, CI build on tag. New device → new release line, but the install UX + brand are identical. Landing presence can live under the k-ripper.app umbrella (suite framing).

## 13. Decisions made (resolved during brainstorming)

- **Input model:** file-based (drop/browse), **not** real-time master-tap. *(v1)*
- **Loudness:** adjustable target (default −14 LUFS) + always-on −1 dBTP ceiling + measure/report; "preserve" toggle for peak-safe-only. **Not** hard-normalize-everything.
- **v1 outputs:** normalized, tagged **WAV + FLAC** only. MP3 / audiogram / per-platform sets / uploads deferred.
- **Name:** **K-Shipper** (suite-mate to K-Ripper).

## 14. Open questions (to confirm at plan time, non-blocking)

- Final output-location default (alongside source vs `~/Music/K-Shipper/`) — leaning alongside-source, configurable.
- Whether v1 ships a "preserve" toggle in the UI or just the editable target field with an explicit "off" value.
- Exact true-peak-limiting approach for the "preserve" path (loudnorm TP-only vs a dedicated oversampled limiter).
