> **Research artifact — 2026-06-28.** Produced by a 10-agent ultracode workflow (8 parallel deep-dives → critique → synthesis; ~773k tokens, ~19 min). Verdict: conditional GO pending the Section 7 prototype. This is research input, not an approved design.

---

# K-Scope SPINE — Feasibility & Architecture Recommendation

*Lead engineer's decision document. Audience: an experienced developer new to Max real-time graphics. Bias: reliability and real-time feasibility first, aesthetics second.*

---

## 1. VERDICT

**GO — but conditional, at 75% confidence, contingent on one prototype (Section 7).**

One-sentence reason: The `pfft~ → jit.poke~ → named float32 jit.matrix → jit.gl.texture → jit.gl.pix → jit.pworld` pipeline is the only architecture that three independent research dimensions converge on as a reliable real-time spine, and its DSP cost is provably trivial — **but every CPU/fps number in the research is secondhand (benchmarks of *other* patches), and the single most load-bearing fact — whether 60fps survives Max-for-Live's Scheduler-in-Audio-Interrupt model at the 512/1024-sample buffers live performers actually use — has never been measured on this pipeline.**

The honest framing: the *architecture* is settled and low-risk. The *target frame rate under real session load* is unproven and is the only thing that can turn this into a no-go. We de-risk it in days, not weeks, before committing to any feature work. I am explicitly **lowering the v1 commitment from "60fps guaranteed" to "60fps where headroom allows, 30fps floor everywhere"** — see Section 4 and Section 6.

---

## 2. RECOMMENDED RENDERING ARCHITECTURE

### Primary surface: Jitter GPU pipeline (`jit.gl`), display via `jit.pworld`

Dimensions 1, 2, and 6 independently converge on this and explicitly say *do not* use jweb as the animation renderer. The reasoning is decisive:

- **It is the only surface with no process boundary.** Everything stays in-process. The data never leaves Max's memory space; the "bridge" is a texture upload, not an IPC serialization.
- **All per-pixel work runs as a GPU fragment shader** (`jit.gl.pix`, which compiles a gen patcher to GLSL). Colormap, log-frequency remap, gradient fills, glow, reference-curve overlay, and masking-zone highlights cost essentially nothing additional on the GPU once the magnitude texture is uploaded ([Cycling74 spectrogram tool](https://cycling74.com/tools/spectrogram-application); [jit.gl.pix tutorial](https://cycling74.com/tutorials/my-favorite-object-jit-gl-pix)).
- **The CPU only does an O(FFT-size) column write and a small texture upload per frame** — a 1024-bin float32 column is ~4KB. This is the only path with community-confirmed sustained 60fps spectrograms in a real session (Dimension 6; the documented case of CPU dropping from 105% to 15% by moving from `lcd`/`jsui` to the GL path).

**Concrete object chain:**
```
[pfft~ 2048, 4 overlaps]
  inside: fftin~ → cartopol~ → jit.poke~ → [jit.matrix Nx1 1 float32 ---kscope_spec_<id>]
[qmetro] → bang → [jit.gl.texture] ← matrix
        → [jit.gl.pix @file kscope_display.genexpr]  (log map, dB→color LUT, ref overlay)
        → [jit.gl.videoplane] inside [jit.pworld ---kscope_ctx_<id>]
```

Two non-negotiable M4L details the research surfaces:
1. **Name the GL context with a triple-dash prefix** (`---kscope_ctx`) or it collides across device instances (Dimensions 1, 2).
2. **Use `jit.gl.mesh`, never `jit.gl.graph`**, for any bar-style geometry — `jit.gl.graph` spiked one user's CPU to 115% on audio-sized data (Dimension 1).

### Tradeoffs (stated honestly)

- **Setup complexity is the real cost:** ~20–30 interconnected objects vs. ~5 for a `jsui` curve. This is a learning-curve tax, not a runtime tax.
- **macOS runs OpenGL via Apple's Metal translation layer** (deprecated since 2018, currently stable on macOS 14/15). This is a multi-year strategic risk, not a v1 risk (Section 6, R5).
- **Aesthetic gap is unproven for this surface.** The critique is correct: every piece of "FabFilter-class look" evidence in the research is on the *rejected* Canvas/web side. `jit.gl.pix` shaders can absolutely produce gradients, glow, and smooth curves, but **crisp anti-aliased text/labels and HiDPI/Retina sharpness of `jit.pworld` inside an M4L window are undemonstrated.** Mitigation below.

### The renderer split for v1

- **`jit.gl` (GPU):** the spectrum, the spectrogram, the reference-curve overlay, the masking heatmap — everything that animates at high rate.
- **`v8ui` (Max 9, mgraphics/Cairo on CPU):** the meter *chrome* — LUFS numeral, true-peak bar, correlation arc, DR readout, axis labels, frequency grid, and **all text**. These redraw at ≤10Hz and `v8ui`'s per-call cost is irrelevant there. This also neatly sidesteps the unproven GL-text-quality concern: render crisp Cairo text on a `v8ui` layer composited over the GL view. (Dimensions 1, 4, 6 all endorse this split.)
- **`jweb`: not in the spine.** Reserved only for an optional later settings/HTML panel that does not animate.

### Named fallback renderer

**`v8ui` with mgraphics path-drawing** is the named fallback for the *entire* display if the GL prototype fails its gates. Draw the spectrum as a single `moveTo/lineTo/fill` chain (not 512 `fillRect` calls), cap redraw at `qmetro 30` (33fps), disable FSAA (`nofsaa`). This is identical on Windows/macOS, needs no GL context management, and is confirmed feasible at 30–40fps. It gives up gradients-at-60fps and the GPU-free overlay compositing, but it *cannot* fail the way GL can (no context conflicts, no float-texture precision question, no SIAI texture-upload contention of the same magnitude). It is the safety net, and we keep the meter chrome on it regardless.

---

## 3. RECOMMENDED AUDIO → RENDERER DATA BRIDGE

### Plumbing: signal-domain write, GPU-domain read — never the message domain at frame rate

Inside `pfft~`: `fftin~` gives bin-index / real / imaginary signal outlets; `cartopol~` → magnitude; **`jit.poke~` writes magnitude into a named float32 `jit.matrix` using the bin-index ramp as the x-coordinate.** This entire write path is signal-domain and runs **in the audio thread with zero message overhead, zero allocation, zero mutex** (Dimension 2, the canonical pattern from [Jitter Tutorial 27](https://docs.cycling74.com/max8/tutorials/jitterchapter27)).

A 2048-pt FFT at 44.1kHz with 4× overlap produces spectral frames at ~86fps — always fresher than a 60fps (or 30fps) read. A `qmetro` bangs the texture upload + render.

### Hard rules the research makes explicit — what NOT to do

- **Do NOT** route spectral data through Max lists/dicts at frame rate. `framesnap~`/`snapshot~` at 60fps floods the scheduler queue and hits the M4L ~20-instance `snapshot~` limit (Dimension 2). Stay in the signal domain.
- **Do NOT** use `jweb` as the bridge for the spectrum: CEF is a separate OS process; 1024 floats serialized to JSON every 16.7ms caps at ~30–40Hz before queue saturation (Dimensions 1, 7). The in-process matrix path has none of this.

### Threading reality (the critique's #1 point, promoted to a first-class constraint)

In M4L, **Scheduler-in-Audio-Interrupt means the `qmetro` bang, the `jit.poke~` writes, and the matrix→texture upload all run on the same thread as audio.** GPU offload accelerates *rasterization*, not this per-frame *scheduling/upload* work. Consequences we design around:

- **Use `qmetro`, never `metro`,** for the render trigger. Under load `qmetro` throttles gracefully (drops frames) instead of spiking CPU (Dimension 2).
- **Frame rate is buffer-size-bound.** At 256 samples (~5.8ms service interval) 60fps is feasible; at 512 (~11.6ms) it is tight; at 1024 (~23ms) 60fps is *not* reliably achievable and 30–40fps is the ceiling (Dimension 2). This is exactly why Section 4 sets a 30fps floor.

### The two concurrency unknowns — treated as gating, not footnotes

The critique is right that these are load-bearing and currently assumed-solved:

1. **Torn frames:** `jit.poke~` (audio thread) writes while the GL context reads the matrix for upload. The concurrency semantics are *undefined* in Cycling74's public API. In practice writes outpace reads and tears are sub-pixel/imperceptible for a *display* — but this is **untested for the reference-curve comparison feature**, where two spectra must align frame-accurately. **Mitigation:** for the display, accept it (and verify in the prototype). For the precision reference feature, implement a soft double-buffer — two matrices, alternate writes per FFT frame via a signal-domain counter, swap the active name once per render frame.
2. **Float precision:** whether `jit.gl.pix` samples a float32 matrix at full 32-bit or quantizes to 8-bit char is **unverified** and would cause visible low-level banding on a magnitude display. **This must be a pass/fail check in the prototype** (Section 7, gate D). Joshua Kit Clayton confirmed float32 *survives* GPU round-trips via `jit.gl.slab`'s texture path; we must confirm it for `jit.gl.pix` specifically.

### Multi-instance hazard (gap the critique caught)

A *named* global `jit.matrix` is **global within a Live set** (Dimension 5 exploits exactly this for cross-device masking IPC). Two K-Scope instances sharing the literal name `kscope_spec` would collide and cross-contaminate. **The matrix name must carry a per-instance unique suffix** (derive from the device's path or a generated UUID), exactly as the GL context already requires the triple-dash convention. This is a known pattern but the research only flagged it for the *context*, not the *matrix* — we apply it to both.

### Metering bridge (separate, low-rate, clean)

LUFS / true-peak / LRA / correlation do **not** go through the spectral path. Use Max 9's native **`loudness~`** (EBU R128: momentary/short-term/integrated LUFS, LRA, sample + true-peak dBTP) with `interval` ~100ms, `defer` its message output to the main thread, update the `v8ui` chrome at ≤10Hz (Dimension 2). This is purpose-built, free, and removes any need to hand-roll LUFS in `pfft~`.

---

## 4. RECOMMENDED DSP / ANALYSIS PIPELINE

### v1 DEFAULT (build this, ship this)

**Transform:** Standard STFT via `pfft~`, **2048-point, Hann window, 4× overlap (75%)**. (I deliberately choose 2048 over 8192 for v1: it produces fresh frames at ~86fps with lower per-frame `jit.poke~` cost, protecting the SIAI thread budget. 8192 is a quality toggle for later, not the default.) FFT compute is never the bottleneck — even 10 parallel 4096-pt FFTs cost <0.5ms (Dimension 3); the bottleneck is thread scheduling and rendering, which is why transform *choice* is not where we spend risk budget in v1.

**Perceptual display scaling — the five-stage pipeline (Dimension 4), all of it v1:**

1. **Log-frequency axis** via a precomputed bin→pixel-column LUT (20Hz–20kHz). Per-frame cost O(pixels), not O(bins). With **max-aggregation** within each column (preserves narrow low-freq peaks, suppresses HF inter-bin noise).
2. **Spectral tilt, +4.5 dB/octave default, pivot 1kHz**, as a pre-baked per-bin gain multiply. This is the FabFilter Pro-Q 4 / Voxengo SPAN default and makes a balanced modern mix read visually flat. Expose a 0–6 dB/oct knob with a Modern(4.5)/Classic(3)/Flat(0) preset switch.
3. **Asymmetric per-bin temporal IIR smoothing:** fast attack (~10ms), slow release (~200ms). One multiply-add per bin per frame.
4. **Log-symmetric 1/6-octave frequency-domain smoothing** (Tylka-Boren method, so symmetric features stay symmetric on the log axis). User-switchable to 1/12-oct or off for a "fast/transient" mode.
5. **Three-phase peak-hold:** hold (1.5s default) → gravity-accelerated fall (~15 dB/s) → fade. Plus an infinite-hold freeze for reference capture.

This pipeline alone produces a display competitive with the best commercial analyzers, at an *estimated* (see caveat) 2–4% CPU (Dimension 4).

**Apply ordering decision (resolving an open question):** tilt and frequency-smoothing **after** temporal smoothing, to avoid over-amplifying brief treble transients before they are smoothed.

### Optional / v2 (do NOT build for launch)

- **Time-frequency reassignment** — *deferred to v2, demoted from the research's Priority-1.* This is the report's most important DSP call, and I am **overriding Dimension 3's "build it first."** Reasons: (a) Dimension 4 independently judges reassignment "marginal benefit, real cost" on full-mix material (it shines on sparse/tonal content, not dense mixes); (b) Dimension 3's own open question admits the `t·h(t)` window-centering convention is **unverified and may differ between Max 8 and Max 9** — a feasibility prerequisite is unresolved; (c) "microseconds" counts only FFT butterflies, ignoring the O(N) scatter-accumulate, the Gen~/js implementation, and the per-frame data bridge on the single SIAI thread; (d) consumer tools (Tritik Visu, gFractor) shipped it in 2026, so it is becoming table stakes anyway — the differentiation argument is weakening. Build the *spine* first; reassignment becomes a toggleable spectrogram-panel mode in v2, where its visual payoff is real.
- **Multitaper smoothing (K=3–5 DPSS)** — the *lowest-risk* differentiator and the one I'd add *first* after v1 ships. K parallel `pfft~` with precomputed DPSS tapers, averaged. No phase estimation, no redistribution, no instability — just a visibly more *stable, trustworthy* spectrum. DPSS sequences baked offline via `scipy.signal.windows.dpss`.
- **True CQT / log-frequency-native bins** (rt-cqt C++ external) — v2+; gives genuine 7× finer bass resolution but needs a cross-platform external build.
- **Synchrosqueezing (FSST), superlets, MUSIC/ESPRIT, chirplet** — research/v3 only. Superlets and subspace methods are CPU-prohibitive for full-spectrum real-time in M4L; FSST shares the reassignment codebase but adds phase-stability risk on broadband material.

---

## 5. DIFFERENTIATORS FROM ACADEMIA (ranked)

Ranked by *(payoff × low real-time risk)* for K-Scope specifically:

1. **Multitaper (DPSS) spectrum smoothing** — *Why it wins:* a rock-stable, low-variance spectrum that looks trustworthy rather than jittery; absent from every consumer analyzer. *Risk: LOW* — K parallel `pfft~` + average, no numerical instability (Dimension 3).
2. **Asymmetric upward-spread masking shadow in the collision view** — *Why it wins:* renders *which* track is the aggressor (low-freq maskers cast a strong upward shadow, +25 dB/Bark vs −17 down); every competitor shows masking symmetrically and wrongly. *Risk: LOW* — it's a display choice over the MPEG Model 1 spreading function already being computed (Dimension 6).
3. **Masked-Unmasked Ratio (MUR) per critical band** — *Why it wins:* a 0–1 "Track B retains X% of its solo audibility" score is instantly actionable and unique among shipping tools. *Risk: MEDIUM* — needs partial-loudness; ships cheaply only if the loudness model is already running (Dimension 6).
4. **Variance-band reference display (iZotope-style ±1σ envelope, not a single line)** — *Why it wins:* shows an acceptable *range* of spectral shapes, not a rigid target; far more usable than a single reference curve. *Risk: LOW* — pure display layer over the LTAS the reference feature already computes (Dimension 5).
5. **Transient vs. steady-state collision decomposition** (Parker & Fenton 2021, ρ=0.838 with subjective clarity) — *Why it wins:* distinguishes "snare transient hitting the vocal consonant" from "pad steadily masking the guitar." *Risk: MEDIUM-HIGH* — needs sliding spectral-median separation and a frame buffer; v2 feature (Dimension 6).
6. **True CQT log-native bins** — *Why it wins:* resolves individual bass harmonics that STFT-log-interpolation merges. *Risk: MEDIUM* — requires a cross-platform C++ external (Dimension 3).
7. **Level-adaptive equal-loudness (ISO 226:2023) weighting** — *Why it wins:* the display predicts what's heard at the *actual* monitoring level. *Risk: MEDIUM* — needs slow LUFS-driven contour interpolation; can disorient if not heavily time-averaged (Dimension 4).

Top three are the v1.x roadmap; they reuse infrastructure the spine already builds and carry low real-time risk.

---

## 6. TOP RISKS + MITIGATIONS

| # | Risk | Severity | Mitigation |
|---|------|----------|------------|
| **R1** | **60fps unreachable under SIAI at 512/1024-sample buffers** (the headline target may be physically impossible in the live-performance use case) | **Critical** | **Reframe v1 target to "adaptive: 60fps where buffer/CPU allow, 30fps floor."** `qmetro`-driven render auto-throttles. Decouple analysis (86fps in audio thread) from display rate. **Gate this in the prototype (Section 7).** |
| **R2** | **Float32 matrix silently quantized to 8-bit through `jit.gl.pix`** → magnitude banding | High | Verify in prototype with a −60dB tone + slow sweep (gate D). Fallback: `jit.gl.slab` (confirmed float32-clean) instead of `jit.gl.pix`. |
| **R3** | **Torn frames on concurrent matrix write/read**, esp. for reference comparison | Medium | Accept for display (verify imperceptible); soft double-buffer for the precision reference feature. |
| **R4** | **Multi-instance name collisions** (global matrix + GL context) and VRAM/context exhaustion with several K-Scope instances | Medium | Per-instance unique suffix on *both* matrix and context names. Test 3+ instances in one set. |
| **R5** | **macOS OpenGL→Metal layer deprecated**; Apple could remove it | Medium (long-term) | No v1 action; track Cycling74's Metal/Vulkan migration. `v8ui` fallback path is Metal-independent. |
| **R6** | **Wasted CPU/GPU/battery when device window is closed** (Live doesn't render closed GUIs) | Medium | Detect window visibility; stop the `qmetro` and texture upload when hidden. Pause analysis too. Spec this into the spine from day one. |
| **R7** | **HiDPI/Retina sharpness + crisp text on the GL path unproven** (the aesthetic constraint that justified the whole effort) | Medium | Render text/labels on the `v8ui` chrome layer (Cairo, crisp), composited over GL. Verify `jit.pworld` pixel density on a 4K/Retina M4L window in the prototype. |
| **R8** | **Integrated-GPU performance** (cited 15fps on Intel HD — contradicts the "trivial on integrated graphics" claim) | Medium | Adaptive frame-rate + bin-count reduction as graceful degradation; the `v8ui` 30fps fallback covers worst case. Test on hybrid-GPU Windows laptop. |
| **R9** | **All CPU/fps figures are secondhand estimates** | High (epistemic) | The prototype replaces every estimate with a measured number before commitment. |

---

## 7. THE DE-RISKING PROTOTYPE

**Build exactly one minimal end-to-end device. Do not build any feature, any reassignment, any reference curve, or any jweb experiment until this passes.** (This mirrors and endorses the critique's "cheapest validating prototype.")

### What to build (~20–30 objects, a few days)

A real **`.amxd` audio-effect device** (frozen, loaded *in Ableton Live* — **never** test only in the Max editor; behavior differs and editor-only testing is the classic invalidating shortcut):

```
pfft~ (2048, 4 overlaps)
  → fftin~ → cartopol~ → jit.poke~
  → jit.matrix Nx1 float32 (per-instance unique name)
qmetro → jit.gl.texture → jit.gl.pix (log-freq map + dB→color LUT)
       → jit.gl.videoplane in jit.pworld (triple-dash per-instance context)
```
No tilt knob, no smoothing UI, no meters — just the raw GPU spectrum and the colormap shader. Add only: a slow sine sweep generator and a −60dB test tone path for gate D.

### Test matrix

- **Two machines:** a mid-range Windows laptop with hybrid Intel/NVIDIA GPU, **and** an Apple Silicon Mac.
- **Inside a real Live set loaded with ~16 tracks of plugins.**
- **Three buffer sizes:** 256, 512, 1024 samples.
- **Window open AND closed** (for R6).
- **One and three** simultaneous device instances (for R4).

### What to measure

| Gate | Measure | PASS criteria |
|------|---------|---------------|
| **A — CPU contention** | Live CPU-meter delta, device window open vs. closed, under 16-track load | < ~5% added CPU with window open on both machines at 512 buffer; near-zero added when window closed (proves R6 throttle works) |
| **B — fps vs. buffer** | Sustained fps under session load at 256 / 512 / 1024 | **≥ 60fps at 256; ≥ 45fps at 512; ≥ 30fps at 1024**, on *both* machines. Below 30fps at 1024 on the Windows laptop = **investigate before proceeding** (likely forces the adaptive-rate design or `v8ui` fallback) |
| **C — Audio integrity** | Xruns / dropouts during heavy spectrum motion (white noise, fast transients) | **Zero** audible dropouts at 512 buffer under load on both machines |
| **D — Float precision** | Visual check: slow sweep + −60dB tone | Smooth low-level gradient, **no visible 8-bit banding**. Fail → switch `jit.gl.pix` → `jit.gl.slab` and re-test |
| **E — Tearing** | Visual check during rapid spectral change | Tears imperceptible at normal viewing. Fail → double-buffer required for v1, not just reference feature |
| **F — Multi-instance** | 3 instances in one set | No name collision (no cross-contamination of displays), no stutter, no VRAM exhaustion |
| **G — HiDPI/text** | `jit.pworld` on a Retina/4K window; a few `v8ui` text labels composited over it | Spectrum sharp (not pixel-doubled); composited Cairo text crisp |

### Decision rule

- **All gates pass → GO**, commit to the `jit.gl` spine, begin v1 feature build. Confidence rises from 75% to ~95%.
- **B fails only at 1024 → GO with adaptive frame-rate** (60/45/30 tiered) as a hard v1 requirement, not a stretch goal.
- **A or C fails (audio dropouts / CPU starvation) → STOP.** Fall back to the `v8ui` 30fps mgraphics spine and re-scope the visual ambition. This is the no-go branch and it is better to discover it now than after building reassignment, CQT, and reference curves on a broken foundation.
- **D fails → trivially fixable** (slab swap); not a spine-killer.

---

## 8. OPEN QUESTIONS FOR THE USER

1. **Frame-rate commitment:** Are you comfortable shipping v1 with an **adaptive 30–60fps** display (60 where headroom allows, 30 floor at large buffers) rather than a guaranteed 60fps? The research strongly suggests guaranteed 60fps in a loaded live session at 512+ buffers is not safely promisable. *(This shapes the entire spine.)*

2. **Primary use-context:** Is K-Scope aimed mainly at **mixing/mastering** (large buffers, 256–1024, CPU-heavy sessions — favors a 30fps-floor, max-stability design) or **live performance** (where smoothness matters but sessions may be lighter)? This sets the buffer-size we optimize against.

3. **Tilt default:** Ship **4.5 dB/oct** (FabFilter/SPAN modern default) as the out-of-box look, with a Modern/Classic/Flat switch — confirm?

4. **Aesthetic bar:** Is "FabFilter Pro-Q-class" the explicit visual target? If so, gate G (HiDPI + composited text) becomes a hard prototype requirement and may justify more `v8ui` chrome investment than currently scoped.

5. **macOS OpenGL longevity:** Are you willing to accept the (currently stable, multi-year-horizon) risk that Apple removes the OpenGL→Metal layer, with the `v8ui` Cairo path as the platform-independent insurance — or do you want a Metal contingency budgeted now?

6. **Reference & masking timeline:** I've sequenced reference-curve overlay and frequency-masking as **post-v1**. Confirm the v1 SPINE scope is **spectrum + meter set only**, with reference/masking riding on the validated spine afterward?

7. **Differentiation appetite:** Of the Section 5 shortlist, **multitaper smoothing** is the cheapest, lowest-risk standout and my recommended first differentiator after launch. Does that match your product positioning, or do you want a flashier (higher-risk) headline feature like reassignment despite its 2026 commoditization?