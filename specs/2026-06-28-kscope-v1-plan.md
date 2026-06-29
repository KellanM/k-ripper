# K-Scope Milestone 0 — Spine-Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: this milestone is a hands-on Max-for-Live build measured inside Ableton; it is NOT pure-code TDD. Steps use checkbox (`- [ ]`) syntax. The "tests" are gate measurements taken in a running Live set — record results, don't fake assertions. No subagent or headless runner can execute the Max/Ableton steps; they are performed at the machine running Ableton (artifacts authored here, assembled + measured there).

**Goal:** Prove (or kill) the K-Scope GPU-spectral spine — `pfft~ → jit.poke~ → named float32 jit.matrix → jit.gl.texture → jit.gl.pix → jit.pworld` — inside a loaded Ableton Live set, by building one minimal device and measuring 7 gates, yielding a go/no-go on the architecture before any feature code.

**Architecture:** A minimal `.amxd` audio-effect device that computes a 2048-pt FFT in `pfft~`, writes magnitudes into a per-instance-named float32 Jitter matrix from the audio thread (`jit.poke~`), uploads it to a GPU texture each `qmetro` tick, colormaps it in a `jit.gl.pix` fragment shader as a scrolling spectrogram, and displays it via `jit.pworld`. A built-in sweep/-60dB test source and an fps/CPU readout drive the gate measurements.

**Tech Stack:** Max 9 (Jitter, gen/`jit.gl.pix`, `v8ui`/`js`), Ableton Live 11/12 with Max for Live, no external binaries.

**Why a spectrogram (not the spectrum curve) for M0:** it is the most minimal display that exercises the *exact* risky path (audio-thread matrix write → texture upload → float sampling in a fragment shader → display) with **no geometry**, so it isolates the spine from the `jit.gl.mesh` concerns, and it is the cleanest way to see gate-D float-precision banding. The spectrum *curve* is Milestone 1, after the spine passes.

## Global Constraints

Copied verbatim from the spec (`specs/2026-06-28-kscope-v1-design.md`); every task inherits these:

- **Frame rate:** adaptive 30–60fps; **30fps hard floor**; use **`qmetro`, never `metro`**, for the render trigger.
- **Per-instance unique names** on **both** the `jit.matrix` and the `jit.pworld` GL context — triple-dash prefix + a per-instance uid (e.g. `---kscope_spec_<uid>`, `---kscope_ctx_<uid>`). A named matrix/context is global within a Live set and will cross-contaminate instances otherwise.
- **`jit.gl.mesh`, never `jit.gl.graph`** for any geometry.
- **Window-closed throttle:** when the device window is hidden, stop the `qmetro`, the texture upload, AND the analysis.
- **No bundled binaries** — pure Max/Jitter/gen/JS.
- **Test targets:** a Windows laptop with a hybrid Intel/discrete GPU **and** an Apple Silicon Mac; inside a **~16-track** Live set; at buffer sizes **256 / 512 / 1024**; with the window **open and closed**; and with **1 and 3** simultaneous instances.
- **Visual bar:** FabFilter-class (HiDPI/Retina must look crisp, not pixel-doubled).
- **Analysis:** 2048-pt FFT, Hann window, 4× overlap (75%).

---

## File / artifact structure

All under a new `kscope/` device folder (sibling to `kripper/`):

- `kscope/K-Scope-M0.maxpat` — the prototype patcher (assembled in Max; this plan specifies its object graph).
- `kscope/K-Scope-M0.amxd` — frozen device for loading in Live (produced from the `.maxpat`).
- `kscope/gen/kscope_spectrogram.gendsp` — the `jit.gl.pix` colormap + log-freq shader (authored here, §Task 3).
- `kscope/js/kscope_uid.js` — per-instance uid + window-visibility throttle logic (authored here, §Task 4; the one genuinely unit-testable piece).
- `kscope/js/kscope_probe.js` — the fps/CPU/gate readout helper that posts a single status line to the Max console (§Task 5).
- `test/kscope.test.mjs` — node:test unit tests for the pure JS in `kscope_uid.js` (§Task 4).
- `kscope/M0-RESULTS.md` — the recorded gate results + go/no-go (§Task 7).

Each task ends with an independently checkable deliverable.

---

### Task 0: Scaffold the device folder + uid module skeleton

**Files:**
- Create: `kscope/` (folder), `kscope/README.md`, `kscope/gen/`, `kscope/js/`

**Interfaces:**
- Produces: the `kscope/` tree that all later tasks write into.

- [ ] **Step 1: Create the folder + a one-paragraph README**

`kscope/README.md`:
```markdown
# K-Scope (Milestone 0)

Spine-validation prototype for the K-Scope mix-analysis device. See
`specs/2026-06-28-kscope-v1-design.md` (design) and
`specs/2026-06-28-kscope-spine-research.md` (feasibility research).
M0 proves the GPU-spectral spine in Ableton against 7 gates before any
feature work. Pure Max/Jitter/gen — no bundled binaries.
```

- [ ] **Step 2: Commit**

```bash
git add kscope/README.md
git commit -m "kscope: scaffold M0 device folder"
```

---

### Task 1: Per-instance uid + window-visibility throttle (the unit-testable core)

This is the one piece with real pure logic, so it gets real node:test coverage. It produces the unique resource-name suffix (so multi-instance gate F passes) and the visibility gate (so gate A's window-closed throttle works).

**Files:**
- Create: `kscope/js/kscope_uid.mjs` (pure helpers), `kscope/js/kscope_uid.js` (Max `js` wrapper that calls them)
- Test: `test/kscope.test.mjs`

**Interfaces:**
- Produces:
  - `makeUid(seed: string) -> string` — deterministic short alphanumeric id from a seed (e.g. the device's `unique` path), safe for use inside a Max symbol (no spaces/special chars).
  - `resourceNames(uid: string) -> { matrix: string, context: string }` — returns `{ matrix: "---kscope_spec_<uid>", context: "---kscope_ctx_<uid>" }`.
  - `shouldRender(visible: boolean, dspOn: boolean) -> boolean` — true only when both the device window is visible and audio is running.

- [ ] **Step 1: Write the failing tests**

`test/kscope.test.mjs`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { makeUid, resourceNames, shouldRender } from "../kscope/js/kscope_uid.mjs";

test("makeUid: deterministic, symbol-safe, non-empty", () => {
  const a = makeUid("live_set tracks 3 devices 1");
  assert.equal(a, makeUid("live_set tracks 3 devices 1")); // deterministic
  assert.match(a, /^[a-z0-9]{6,}$/);                        // symbol-safe
  assert.notEqual(a, makeUid("live_set tracks 4 devices 1")); // distinct seeds differ
});

test("resourceNames: triple-dash prefixed, uid-suffixed, distinct", () => {
  const n = resourceNames("abc123");
  assert.equal(n.matrix, "---kscope_spec_abc123");
  assert.equal(n.context, "---kscope_ctx_abc123");
  assert.notEqual(n.matrix, n.context);
});

test("shouldRender: only when visible AND dsp on", () => {
  assert.equal(shouldRender(true, true), true);
  assert.equal(shouldRender(false, true), false); // window closed -> throttle
  assert.equal(shouldRender(true, false), false); // dsp off -> throttle
  assert.equal(shouldRender(false, false), false);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/kscope.test.mjs`
Expected: FAIL — `Cannot find module '../kscope/js/kscope_uid.mjs'`.

- [ ] **Step 3: Write the minimal implementation**

`kscope/js/kscope_uid.mjs`:
```js
// Pure helpers for K-Scope per-instance resource naming + render gating.
// Kept framework-free so they unit-test under node:test; the Max `js` wrapper
// (kscope_uid.js) imports nothing and re-implements the same tiny logic against
// the LiveAPI device path. These are the source of truth + the test target.

// Deterministic, symbol-safe short id from an arbitrary seed string.
export function makeUid(seed) {
  let h = 2166136261 >>> 0;                 // FNV-1a
  const s = String(seed == null ? "" : seed);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(36).padStart(6, "0");
}

export function resourceNames(uid) {
  const u = String(uid || "x");
  return { matrix: "---kscope_spec_" + u, context: "---kscope_ctx_" + u };
}

export function shouldRender(visible, dspOn) {
  return Boolean(visible) && Boolean(dspOn);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test test/kscope.test.mjs`
Expected: PASS — 3 tests.

- [ ] **Step 5: Write the Max `js` wrapper (verified in Max, not node)**

`kscope/js/kscope_uid.js` — runs in Max's `js` object; mirrors the pure logic, derives the seed from the device's LiveAPI `unquotedpath`, and outputs the two names + a render-gate flag. (Verified in Task 4 in-Max, not here.)
```js
autowatch = 1;
outlets = 3; // 0: matrix name, 1: context name, 2: render-gate flag (0/1)

var FNV = 2166136261;
function makeUid(seed) {
  var h = FNV >>> 0, s = String(seed || "");
  for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
  return (h >>> 0).toString(36);
}
var uid = "x", visible = 1, dspOn = 0;
function bang() {
  try { var d = new LiveAPI(null, "this_device"); uid = makeUid(String(d.unquotedpath)); } catch (e) {}
  outlet(0, "---kscope_spec_" + uid);
  outlet(1, "---kscope_ctx_" + uid);
  gate();
}
function visibility(v) { visible = (v != 0) ? 1 : 0; gate(); }
function dsp(v) { dspOn = (v != 0) ? 1 : 0; gate(); }
function gate() { outlet(2, (visible && dspOn) ? 1 : 0); }
```

- [ ] **Step 6: Commit**

```bash
git add kscope/js/kscope_uid.mjs kscope/js/kscope_uid.js test/kscope.test.mjs
git commit -m "kscope: per-instance uid + render-gate helpers (unit-tested)"
```

---

### Task 2: The colormap + log-frequency `gen` shader

**Files:**
- Create: `kscope/gen/kscope_spectrogram.gendsp`

**Interfaces:**
- Consumes: a 1×N (or N×1) float32 texture — the current FFT-magnitude column, linear power, written by Task 4's matrix.
- Produces: a `jit.gl.pix` patch named `kscope_spectrogram` that maps magnitude→dB→color with a log-frequency vertical axis, suitable for a scrolling spectrogram. **Float32 sampling correctness here is gate D.**

- [ ] **Step 1: Author the shader (gen / `jit.gl.pix` codebox)**

`kscope/gen/kscope_spectrogram.gendsp` — codebox contents (gen `pix` domain; `norm` coords 0..1; samples the magnitude texture on a log-mapped vertical coordinate, converts to dB, normalises to a floor/ceiling, applies an inferno-like colormap):
```
// jit.gl.pix codebox — K-Scope M0 spectrogram colormap
// in1 = magnitude texture (1 x Nbins, float32, linear power)
// Params: dbFloor (-100), dbCeil (0), fLogMin (log2(20)), fLogMax (log2(20000))
Param dbFloor(-100.);
Param dbCeil(0.);
Param flow(4.3219);   // log2(20)
Param fhigh(14.2877); // log2(20000)

// vertical axis = log frequency
ylog = mix(flow, fhigh, norm.y);
fnorm = (pow(2., ylog) - 20.) / (20000. - 20.);   // back to 0..1 linear bin coord
mag = sample(in1, vec(fnorm, 0.)).r;              // float32 magnitude (power)
db = 10. * log10(max(mag, 1e-9));
v = clamp((db - dbFloor) / (dbCeil - dbFloor), 0., 1.);

// compact inferno-ish colormap (no texture LUT needed for M0)
r = clamp(1.6*v - 0.2, 0., 1.);
g = clamp(2.0*v*v - 0.1, 0., 1.);
b = clamp(0.9 - 1.3*abs(v-0.35), 0., 1.) + 0.15*v;
out1 = vec(r, g, b, 1.);
```

- [ ] **Step 2: Verify in Max (deferred to Task 6 in-Ableton)**

The shader is verified visually as part of gate D (no banding on a −60dB tone). No standalone test — `gen` cannot run headless.

- [ ] **Step 3: Commit**

```bash
git add kscope/gen/kscope_spectrogram.gendsp
git commit -m "kscope: gen spectrogram colormap + log-freq shader (gate D target)"
```

---

### Task 3: The `pfft~` analysis subpatch (audio-thread FFT → matrix write)

**Files:**
- Create: `kscope/K-Scope-M0.maxpat` (begin it here — the audio + analysis half)

**Interfaces:**
- Consumes: device audio input (left channel for M0), the matrix name from Task 1 (`---kscope_spec_<uid>`).
- Produces: continuous float32 magnitude columns written into the named matrix from the audio thread, with zero message-domain traffic.

- [ ] **Step 1: Build the patch skeleton + the `pfft~` wrapper**

In Max, build `kscope/K-Scope-M0.maxpat` with this audio-side graph (M0 = mono, left channel):
```
[plugin~] (L) ─┐
               ├─► [pfft~ kscope_fft 2048 4]      // 2048 window, 4x overlap
[plugin~] (L) ─┘            │
                            └─► [plugout~]         // pass audio through untouched

inside [pfft~ kscope_fft]:
  [fftin~ 1]
    │real ─┐
    │imag ─┤► [cartopol~] ─► (magnitude signal)
    └──────┘
  // bin index ramp 0..(N/2-1) for the x-write coordinate:
  [fftin~ 1] ──(index outlet, 3rd)──► (bin index signal)
  [jit.poke~ ---kscope_spec_<uid> 1 1]   // dim, planecount; x = bin index, val = magnitude
```
The matrix name is set by Task 1's `js` outlet 0 (sent to `jit.poke~` as a `set` message / scripting). For M0 you may hardcode a single instance's name first, then wire the uid in Task 4.

- [ ] **Step 2: Create the target matrix**

Add a `[jit.matrix ---kscope_spec_<uid> 1 float32 1024 1]` (1024 = N/2 bins) in the top-level patch so the named matrix exists before `jit.poke~` writes.

- [ ] **Step 3: Verify (in Max)**

Add a temporary `[jit.print]` banged occasionally; confirm the matrix fills with changing magnitude values when audio plays. (Sanity only — full verification is the gates.)

- [ ] **Step 4: Commit**

```bash
git add kscope/K-Scope-M0.maxpat
git commit -m "kscope: pfft~ analysis -> jit.poke~ named float32 matrix"
```

---

### Task 4: The GPU render chain + per-instance naming + visibility throttle

**Files:**
- Modify: `kscope/K-Scope-M0.maxpat` (add the graphics half + wiring)

**Interfaces:**
- Consumes: the named matrix (Task 3), the uid/name/gate outlets (Task 1's `kscope_uid.js`).
- Produces: a scrolling spectrogram on screen, throttled when the window is closed or DSP is off.

- [ ] **Step 1: Build the render chain**

Add to the patch:
```
[js kscope_uid.js]
  out0 (matrix name) ─► [prepend set] ─► [jit.poke~] and [jit.matrix] (retarget names)
  out1 (context name) ─► (jit.pworld @name argument via scripting)
  out2 (render gate 0/1) ─► [gate] before the qmetro bang

[qmetro 16] ─(gated)─► [t b b]
  ├─► [jit.gl.texture ---kscope_ctx_<uid>] ← (jit.matrix, the spectrogram history)
  └─► (bang the jit.gl.pix → render)

[jit.gl.pix ---kscope_ctx_<uid> @file kscope_spectrogram.gendsp]
  ─► [jit.gl.videoplane ---kscope_ctx_<uid> @transform_reset 2]
       inside ─► [jit.pworld ---kscope_ctx_<uid> @fsaa 1]
```
Scrolling: keep a 2D history matrix (`Nbins × width`), shift one column per frame and write the newest magnitude column at the edge (classic spectrogram scroll), then texture+display it. (One `jit.matrix` op per frame; cost is O(width·Nbins) upload, fine.)

- [ ] **Step 2: Wire the visibility throttle**

Use `[thispatcher]`/`[js]` to detect the device window open/close (Max `js` `onresize`/patcher visibility, or the M4L `live.thisdevice` "showing" message) → send `visibility 1/0` into `kscope_uid.js`; route `dsp~`/`[dspstate~]` → `dsp 1/0`. The gate outlet (out2) opens/closes the `qmetro` bang path. Confirm: closing the device window stops rendering (CPU drops); opening resumes.

- [ ] **Step 3: Use `qmetro` not `metro`; mesh not graph**

Confirm the render trigger is `qmetro 16` (not `metro`). The M0 spectrogram uses only textures + `jit.gl.videoplane` (no geometry), so `jit.gl.graph`/`jit.gl.mesh` does not arise — note this for M1 when the spectrum curve adds geometry (must be `jit.gl.mesh`).

- [ ] **Step 4: Verify (in Max)**

Play audio: a scrolling colormapped spectrogram appears, updates smoothly, and stops when the window is closed. Open 3 copies in one patch (temporary) → confirm the uid makes each use distinct matrix/context names (no shared/cross-contaminated display).

- [ ] **Step 5: Commit**

```bash
git add kscope/K-Scope-M0.maxpat
git commit -m "kscope: jit.gl render chain, per-instance naming, visibility throttle"
```

---

### Task 5: Test source + gate-probe readout

**Files:**
- Create: `kscope/js/kscope_probe.js`
- Modify: `kscope/K-Scope-M0.maxpat`

**Interfaces:**
- Produces: a built-in **slow sine sweep** + a **−60dB steady tone** path (for gate D), and a one-line console readout of measured fps + the M4L CPU hint, posted ~1/sec.

- [ ] **Step 1: Add the test source**

Add (switchable, M0-only): `[cycle~]` driven by a slow `[line~]` 20→20000 Hz over ~20s for the sweep; and a `[cycle~ 1000]` scaled to −60dB (`* 0.001`) for the precision tone. Route either into the `pfft~` input via a `[selector~]`.

- [ ] **Step 2: Add the fps probe**

`kscope/js/kscope_probe.js`:
```js
// Posts measured render fps once per second to the Max console for gate reads.
autowatch = 1;
inlets = 1;   // bang on every rendered frame
var frames = 0;
function bang() { frames++; }
function reset() { frames = 0; }
// driven by a [metro 1000] -> "report"
function report() {
  post("[kscope] fps=" + frames + "\n");
  frames = 0;
}
```
Wire: the `qmetro`'s post-render bang → `[js kscope_probe.js]` (bang); a separate `[metro 1000]` → `report`. (CPU is read from Live's own CPU meter during the gate, not from JS.)

- [ ] **Step 3: Verify (in Max)**

Console prints `[kscope] fps=NN` each second; with the sweep running you can read the sustained fps directly.

- [ ] **Step 4: Commit**

```bash
git add kscope/js/kscope_probe.js kscope/K-Scope-M0.maxpat
git commit -m "kscope: M0 test source (sweep + -60dB tone) and fps probe"
```

---

### Task 6: Freeze to `.amxd` and deploy to the User Library

**Files:**
- Create: `kscope/K-Scope-M0.amxd`

- [ ] **Step 1: Save as an Audio Effect device + freeze**

In Max for Live: save the patch as `K-Scope-M0.amxd` (Audio Effect), **Freeze** the device (bundles `kscope_uid.js`, `kscope_probe.js`, and `kscope_spectrogram.gendsp`).

- [ ] **Step 2: Deploy to the local User Library install path**

```bash
DEST="$HOME/Documents/Ableton/User Library/Presets/Audio Effects/Max Audio Effect"
cp kscope/K-Scope-M0.amxd "$DEST/"
```
(macOS: `$HOME/Music/Ableton/User Library/...`.)

- [ ] **Step 3: Verify**

In Ableton: drag K-Scope-M0 onto an audio track playing material → the spectrogram renders. **Test loaded in Ableton, never editor-only** (M4L behaviour differs).

- [ ] **Step 4: Commit**

```bash
git add kscope/K-Scope-M0.amxd
git commit -m "kscope: freeze M0 device for in-Ableton gate testing"
```

---

### Task 7: Run the 7 gates and record the go/no-go

**Files:**
- Create: `kscope/M0-RESULTS.md`

**Interfaces:**
- Produces: the measured gate table on both machines and the architecture decision.

- [ ] **Step 1: Run the gate matrix**

In a **~16-track** Live set, on **Windows (hybrid GPU)** and **Apple Silicon**, at buffers **256 / 512 / 1024**, window **open & closed**, **1 and 3** instances, record:

| Gate | Measure | PASS criteria |
|---|---|---|
| A — CPU | Live CPU-meter delta, window open vs closed, under 16-track load | <~5% added (open) @512; ~0 added when window closed |
| B — fps | sustained `[kscope] fps=` under load @256/512/1024 | ≥60@256, ≥45@512, ≥30@1024 on **both** machines |
| C — audio | xruns/dropouts during heavy spectral motion (white noise/transients) | **zero** @512 under load on both |
| D — float | −60dB tone + slow sweep | smooth low-level gradient, **no 8-bit banding** |
| E — tearing | rapid spectral change | tears imperceptible at normal viewing |
| F — multi-instance | 3 instances in one set | no name collision, no stutter, no VRAM exhaustion |
| G — HiDPI/text | `jit.pworld` on a Retina/4K window | spectrum sharp (not pixel-doubled) |

- [ ] **Step 2: Record results + apply the decision rule**

`kscope/M0-RESULTS.md`: the filled table per machine/buffer, plus the verdict using the rule:
- **All pass → GO** (commit to the `jit.gl` spine; confidence ~95%); proceed to plan Milestone 1.
- **B fails only @1024 → GO** with adaptive-rate as a hard requirement (already the stance).
- **A or C fails (audio starvation) → STOP**; fall back to the `v8ui` 30fps mgraphics spine and re-scope; re-plan M1 on that surface.
- **D fails → fix** (swap `jit.gl.pix` → `jit.gl.slab`, re-run D); not a spine-killer.
- **E fails → double-buffer the matrix** before M1.

- [ ] **Step 3: Commit**

```bash
git add kscope/M0-RESULTS.md
git commit -m "kscope: M0 gate results + spine go/no-go"
```

---

## Post-M0 roadmap (planned in detail only after gates pass)

Each becomes its own plan (its architecture depends on M0's outcome):

- **M1 — Spectrum curve + perceptual pipeline:** replace the spectrogram with the filled spectrum curve (`jit.gl.mesh`), and implement the 5-stage perceptual pipeline (log-axis LUT + max-agg, +4.5 dB/oct Modern tilt with Modern/Classic/Flat, asymmetric IIR smoothing, ⅙-oct frequency smoothing, 3-phase peak-hold). Most pipeline *parameter math* is pure-JS and TDD-able.
- **M2 — All-in-one meters:** `loudness~` (M/S/I LUFS, dBTP, LRA) + correlation, rendered on the `v8ui` chrome layer at ≤10Hz, composited over the GL view; frequency grid + dB axis + labels (gate-G text path).
- **M3 — Reference variance-band overlay:** LTAS capture of a loaded reference file (or K-Ripper rip), ±1σ band overlay shader path, dB-difference math (pure-JS, TDD-able).
- **v1.x — Multitaper "stable mode":** K parallel `pfft~` with precomputed DPSS tapers, averaged.
- **v2 — Masking/collision:** inter-instance shared-spectra architecture (named global matrices) + asymmetric masking-shadow display.

---

## Self-review

**Spec coverage (M0 scope):** the spec's spine architecture (§5), the bridge/threading constraints (§5), the prototype + all 7 gates (§9), per-instance naming (§5/R4), window-closed throttle (§5/R6), `qmetro`-not-`metro` and `mesh`-not-`graph` (§5), float-precision gate + `jit.gl.slab` fallback (§9/R2), and the no-bundled-binaries constraint (§14) are all represented in Tasks 1–7. Feature scope (§4/§6/§8) is explicitly deferred to the post-M0 roadmap by design.

**Placeholder scan:** no "TBD/handle-appropriately" steps; the gen shader, the JS, the object graphs, and the gate criteria are all concrete. The Max-patcher steps describe exact object graphs rather than code blocks because Max patches are graphs, not text — this is the faithful domain adaptation, not a placeholder.

**Type/name consistency:** `makeUid`/`resourceNames`/`shouldRender` signatures match between the test (Task 1 Step 1), the impl (Step 3), and the Max wrapper (Step 5); the matrix/context names `---kscope_spec_<uid>` / `---kscope_ctx_<uid>` are used identically across Tasks 1–5; the gen patch name `kscope_spectrogram` and file `kscope_spectrogram.gendsp` match between Tasks 2 and 4/6.
