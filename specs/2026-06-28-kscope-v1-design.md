# K-Scope — v1 design spec

- **Date:** 2026-06-28
- **Status:** Approved design direction, pre-implementation
- **Companion:** [`2026-06-28-kscope-spine-research.md`](./2026-06-28-kscope-spine-research.md) — the 10-agent feasibility research this spec is built on. Deep rationale for every architecture call lives there; this spec states the decisions.
- **Relation:** Third device in the suite (K-Ripper rips in, K-Shipper [shelved] ships out, **K-Scope sees**). Extends the oscilloscope motif already in the brand.

---

## 1. Overview

**K-Scope is an all-in-one real-time mix-analysis device for Ableton Live** — a beautiful spectrum analyzer plus a complete meter set, in one device, with reference-curve matching and (later) frequency-collision detection. It exists because Ableton's stock Spectrum is basic and free SPAN, while excellent, is *just* a spectrum: it shows data, never a *target*, never *collisions*, and you still open three other plugins for metering. K-Scope's wedge is **reference matching + all-in-one metering + a perceptually-honest display**, with a roadmap of academic techniques absent from every consumer analyzer (§12).

**The hard part is the spine** — real-time FFT + GPU visualization at an adaptive 30–60fps inside Live — which is a brand-new engineering domain for us (the K-Ripper Node/binary stack gives nothing reusable). The research (companion doc) settled the architecture and reduced the project to a single measurable risk, gated by a prototype (§9).

## 2. Job-to-be-done & audience

> "While I'm mixing, I want one device that shows me — honestly and beautifully — what my mix actually looks like spectrally, how loud it is by every meter that matters, and how it compares to a reference — without opening four plugins or leaving the flow."

**Audience:** the same electronic producers/DJs as K-Ripper, **optimizing for the mixing/mastering context** (per the product decision): large buffer sizes (256–1024), CPU-heavy sessions, maximum stability over raw frame rate.

## 3. Goals / non-goals

**Goals (v1):** a rock-stable, perceptually-honest real-time spectrum; a complete meter set (LUFS / true-peak / correlation / dynamic range); reference-curve overlay; a polished, readable, FabFilter-class look; near-zero impact on the DAW; cross-platform (Win + Apple Silicon).

**Non-goals:** not an EQ or corrective tool (it analyzes, it does not process the audio — it passes audio through untouched); not a mastering processor; guaranteed 60fps is **explicitly not promised** (adaptive 30–60, 30 floor).

## 4. Scope

### v1 — the spine (gated by §9, build first)
- **Real-time spectrum display** with the full perceptual pipeline (§6).
- **All-in-one meters:** integrated/short-term/momentary **LUFS**, **true-peak (dBTP)**, **stereo correlation**, **dynamic range / LRA** — via Max 9 native `loudness~`.

### v1 — first feature on the validated spine
- **Reference-curve overlay:** load a reference audio file (or a K-Ripper rip), compute its long-term average spectrum (LTAS), and overlay it — as a **±1σ variance band**, not a rigid line (§8). Low-risk; rides the LTAS the spine already computes.

### v2+ (deferred, architecture leaves room)
- **Frequency-masking / collision detection** between two tracks (needs inter-instance shared-spectra architecture).
- **Multitaper "stable mode"** (§12 #1 — cheapest differentiator; could land as early v1.x).
- Reassignment/CQT/level-adaptive-loudness display modes (§12, higher risk).

### Frame-rate stance (decided)
**Adaptive 30–60fps**, `qmetro`-throttled: 60 where buffer/CPU headroom allows, **30fps hard floor**. Analysis runs faster (≈86fps spectral frames in the audio thread) and is decoupled from display rate. Optimized for the mixing case (stable at 512–1024 buffers) over peak smoothness.

## 5. Architecture

Full rationale in the research doc §2–3. Decisions:

### Rendering: Jitter GPU pipeline (in-process, no process boundary)
```
[pfft~ 2048, 4 overlaps]
  fftin~ → cartopol~ → jit.poke~ → [jit.matrix N×1 1 float32  ---kscope_spec_<uid>]
[qmetro] → [jit.gl.texture] ← matrix
        → [jit.gl.pix @file kscope_display.genexpr]   // log-freq map, dB→color LUT, tilt, ref overlay
        → [jit.gl.videoplane] in [jit.pworld ---kscope_ctx_<uid>]
```
- **`jweb` is rejected** for animation (separate Chromium process; serialization caps ~30–40fps). Reserved only for a possible non-animating settings panel later.
- **All per-pixel work is a GPU fragment shader** (`jit.gl.pix`); CPU only does an O(FFT-size) column write + small texture upload per frame.
- **`jit.gl.mesh`, never `jit.gl.graph`** for any geometry (graph spikes CPU on audio-sized data).

### Renderer split
- **GPU (`jit.gl`):** everything that animates fast — spectrum, reference overlay, (later) masking heatmap.
- **`v8ui` (Cairo, CPU, ≤10Hz redraw):** all **text + meter chrome** — LUFS numerals, TP bar, correlation arc, DR readout, axis labels, frequency grid — composited over the GL view. Sidesteps GL's weak text rendering and gives crisp HiDPI labels.
- **Meters bridge:** native `loudness~` (EBU R128), `interval` ~100ms, `defer` to main thread, update `v8ui` at ≤10Hz. Never routed through the spectral path.

### Data bridge & threading (the load-bearing constraints)
- **Signal-domain write, GPU-domain read — never the message domain at frame rate.** `jit.poke~` writes magnitudes in the audio thread (zero alloc, zero mutex). No `snapshot~`/lists/dicts at frame rate; no `jweb` bridge.
- **Scheduler-in-Audio-Interrupt:** the `qmetro` bang, pokes, and texture upload share the audio thread → use `qmetro` (graceful throttle) **never** `metro`; frame rate is buffer-bound (this is *why* the floor is 30fps).
- **Per-instance unique names on BOTH the matrix and the GL context** (triple-dash + a uid derived from device path/UUID) — a named global matrix is set-global and will cross-contaminate instances otherwise.
- **Window-closed throttle:** detect device-window visibility; stop `qmetro` + texture upload (and pause analysis) when hidden. Spec'd into the spine from day one.

### Fallback renderer (named)
**`v8ui` + mgraphics path-drawing** for the *entire* display if the GL gates fail: single `moveTo/lineTo/fill` chain, `qmetro 30`, `nofsaa`. Identical Win/Mac, no GL context management, confirmed 30–40fps. Gives up 60fps gradients but cannot fail the way GL can. The meter chrome stays on `v8ui` regardless.

## 6. DSP / analysis pipeline (v1 default)

**Transform:** standard STFT via `pfft~`, **2048-pt, Hann, 4× overlap (75%)** → fresh frames ≈86fps. (8192 is a later quality toggle; FFT cost is never the bottleneck — thread scheduling + rendering are.)

**Perceptual display — five stages, all v1** (research §4):
1. **Log-frequency axis** (20Hz–20kHz) via a precomputed bin→pixel-column LUT with **max-aggregation** per column (preserves narrow LF peaks, suppresses HF noise).
2. **Spectral tilt** — default **+4.5 dB/oct, pivot 1kHz** (Modern), as a pre-baked per-bin gain. Preset switch **Modern (4.5) / Classic (3) / Flat (0)**, plus a 0–6 dB/oct knob.
3. **Asymmetric temporal IIR smoothing** per bin — fast attack (~10ms), slow release (~200ms).
4. **Log-symmetric ⅙-octave frequency smoothing** (Tylka-Boren). Switchable ¹⁄₁₂-oct / off for a "fast" mode.
5. **Three-phase peak-hold** — hold (1.5s) → gravity fall (~15 dB/s) → fade; plus infinite-hold freeze (also used for reference capture).

**Apply order (decided):** tilt + frequency-smoothing **after** temporal smoothing (avoid over-amplifying brief treble transients pre-smoothing).

## 7. UI / display

- **Main view:** the spectrum (filled gradient + glow, GPU-shaded), frequency grid + dB scale (v8ui), peak-hold trace.
- **Meter strip:** LUFS (M/S/I), true-peak dBTP, correlation, DR/LRA — compact, readable, v8ui.
- **Controls:** tilt preset/knob; smoothing (slow/fast/off); peak-hold on/off + infinite freeze; reference: load file + show/hide; (later) multitaper "stable" toggle.
- **Look:** matches the K-Ripper device + k-ripper.app brand (dark device, signal-red accents, oscilloscope DNA). **FabFilter-class is the explicit visual bar** → HiDPI sharpness + crisp composited text is a hard prototype gate (§9, gate G).

## 8. Reference-overlay feature (v1, on validated spine)

- **Capture:** load a reference audio file (drag/browse — or a K-Ripper rip, suite synergy); compute its **LTAS** (long-term average power spectrum over the file, smoothed) once, offline; store the curve. Also support "freeze current" (infinite-hold) to snapshot your own mix as a reference.
- **Display:** overlay the reference as a **±1σ variance band** (an acceptable *range* of spectral shapes), not a single line — research §5 ranks this a low-risk differentiator over a rigid target. Your live spectrum reads against the band; deviation is visually obvious.
- **Math:** dB-domain difference of tilt-matched LTAS curves; per-band deviation. Pure, testable (§13).
- **Concurrency note:** if a precise frame-aligned comparison is ever needed, double-buffer the matrix (research §3); for the band overlay, the reference is static so this is moot.

## 9. Spine-validation prototype (HARD GATE — before any feature code)

Per the research, build **one minimal device** (raw GPU spectrum + colormap shader + a sweep/-60dB-tone test path; **no** meters, tilt, smoothing, or reference) and validate it **loaded in a real Live set** (never editor-only).

**Test matrix:** Windows laptop w/ hybrid GPU **and** Apple Silicon Mac; inside a ~16-track session; buffers 256 / 512 / 1024; window open & closed; 1 and 3 instances.

**Gates (pass/fail):**

| Gate | Measure | PASS |
|---|---|---|
| A — CPU | Live CPU delta, window open vs closed, under load | <~5% added (open) @512; ~0 when closed |
| B — fps | sustained fps @256/512/1024 | ≥60@256, ≥45@512, ≥30@1024 on **both** machines |
| C — audio | xruns/dropouts under heavy motion | **zero** @512 under load |
| D — float | −60dB tone + slow sweep | no 8-bit banding (fail → swap `jit.gl.pix`→`jit.gl.slab`) |
| E — tearing | rapid spectral change | imperceptible (fail → double-buffer) |
| F — multi-instance | 3 in one set | no name collision, no stutter, no VRAM exhaustion |
| G — HiDPI/text | `jit.pworld` + v8ui text on Retina/4K | spectrum sharp; composited text crisp |

**Decision rule:** all pass → commit to GL spine (~95% confidence), build v1. **B fails only @1024** → proceed with adaptive-rate as a hard requirement (already our stance). **A or C fails (audio starvation)** → fall back to the `v8ui` 30fps spine and re-scope visual ambition. D → trivial fix.

> Because the product decision was "spec first," this section is the bridge: implementation begins with this prototype, and feature work is **blocked** until the gates pass. The plan (writing-plans) will sequence it as Milestone 0.

## 10. Performance & resource management

Adaptive `qmetro` frame-rate; analysis decoupled from display; **window-closed full throttle**; per-instance unique resource names; integrated-GPU graceful degradation (reduce bins/fps); `v8ui` fallback as worst-case floor. These are spine requirements, not optimizations-for-later.

## 11. Risks & mitigations (condensed; full table in research §6)

- **R1 — 60fps under SIAI at 512/1024 unproven (critical):** adaptive-rate design + prototype gate B.
- **R2 — float32→8-bit quantization through `jit.gl.pix`:** gate D; fallback `jit.gl.slab`.
- **R3 — torn frames:** accept for display (verify), double-buffer if precision needed.
- **R4 — multi-instance name collisions / VRAM:** per-instance uids on matrix + context; gate F.
- **R5 — macOS OpenGL→Metal deprecation (long-term):** no v1 action; `v8ui` path is Metal-independent insurance.
- **R7 — HiDPI/text quality (the aesthetic bar):** v8ui Cairo text layer; gate G.
- **R8 — integrated-GPU perf:** adaptive degradation; test hybrid-GPU laptop.

## 12. Differentiators roadmap (academia → product)

Ranked by payoff × low risk (research §5):
1. **Multitaper (DPSS) smoothing** — stable, trustworthy, low-variance spectrum; absent from all consumer analyzers. **First differentiator (v1.x "stable mode").** Low risk: K parallel `pfft~` + average.
2. **Asymmetric masking shadow** (which track is the aggressor) — **v2**, with masking.
3. **Variance-band reference** — **shipped in v1** (§8).
4. Transient-vs-steady collision decomposition; true CQT; level-adaptive equal-loudness — v2/v3.

## 13. Testing

- **Unit (`node --test`, CI):** all pure math in a `lib`-style module — log-freq bin→pixel LUT construction, tilt-curve generation, IIR/peak-hold coefficient math, LTAS averaging + dB-difference, variance-band computation, loudness/`loudness~` value formatting. (The DSP-in-Max isn't unit-testable, but the *parameter math* feeding it is.)
- **In-Ableton gates (§9):** the prototype's 7 measured gates, then per-feature smoke tests — read via the Max console log (same loop as K-Ripper's Seg.BPM probe).

## 14. Distribution

**Lightest device in the suite — no bundled binaries at all.** K-Scope is pure Max/Jitter/gen + JS; no ffmpeg, no yt-dlp. The installer/CI machine (Inno + branded DMG + Releases + version-check + k-ripper.app) is reused only to place the `.amxd` + JS/gen/asset files into the User Library. Under the k-ripper.app suite umbrella.

## 15. Decisions log

- **Frame rate:** adaptive 30–60fps, 30 floor. *(user)*
- **Use context:** mixing/mastering — optimize stability at 256–1024 buffers. *(user)*
- **Renderer:** Jitter GPU (`jit.gl`) spine + `v8ui` chrome/text; `jweb` rejected for animation; `v8ui` mgraphics as fallback. *(research)*
- **Bridge:** signal-domain `jit.poke~` → named per-instance float32 matrix; `qmetro` render. *(research)*
- **Transform:** 2048 Hann 4× STFT; 5-stage perceptual pipeline; tilt 4.5 Modern default. *(research)*
- **Meters:** native `loudness~`. *(research)*
- **v1 scope:** spectrum + meters (gated spine) + reference variance-band overlay; masking → v2. *(user + research)*
- **First differentiator:** multitaper smoothing (v1.x). *(research)*
- **Reassignment:** deferred to v2 (overrode the DSP agent's "build first"). *(research)*
- **Build order:** prototype/gates (Milestone 0) before feature code, despite "spec first." *(research discipline)*

## 16. Remaining open questions (non-blocking, for plan time)

- Exact uid scheme for per-instance matrix/context names (device path hash vs generated UUID).
- Reference-file ingestion path (drag-on-device vs file picker vs reuse a K-Ripper rip folder).
- Whether multitaper ships in v1 proper or strictly v1.x.
- macOS Metal contingency: track only, or budget a spike now (leaning track-only).
