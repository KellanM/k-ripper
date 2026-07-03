# K-Convert — v1 design spec

- **Date:** 2026-07-03
- **Status:** Approved design, pre-implementation
- **Working name:** **K-Convert** (user's pick; backup if the "converts plugins!" misread ever bites: *K-Port*). Tagline promises the outcome, never binary conversion: **"Send an Ableton project to anyone. It opens."**
- **Relation:** Fourth product in the suite (K-Ripper rips in · K-Scope sees · K-Convert hands off). Free, under the k-ripper.app umbrella. Gets its **own repo** at build time; this spec lives in the suite workshop repo.

> **Discovery spike (validated 2026-07-02):** working prototype at
> `C:\Production\Tracks\ReferenceProject\convert_prototype.py`, proven on a real
> Mac project ("AU TEST.als") opened in Windows Live 12.4.2. All hard technical
> claims in this spec were demonstrated there; see §10 for the fact base.

---

## 1. Problem

Mac↔Windows Ableton collaboration breaks silently: Mac users naturally load **AU** builds of their plugins, and the project arrives on Windows full of ghost devices. Conversion of the AU *binaries* is physically impossible (Mach-O + Apple frameworks; established during scoping — the wrapper/VM/emulation routes are all dead ends, and network proxies like AudioGridder only serve synchronous sessions). The handoff problem also includes **plugins the receiver doesn't own**, and **assets referenced inside plugin state** (e.g. Serum noise samples) that Ableton's *Collect All and Save* can never gather because Live cannot see inside plugin state.

What **does** cross the OS boundary: VST3 state for the same plugin, vendor-native preset files, audio renders, and plain files. K-Convert is built entirely on those.

## 2. Job-to-be-done

> "I'm sending my project to a collaborator on the other OS. Make it open on their machine — devices loaded, settings intact, assets present — or tell both of us exactly what to do about the parts that can't."

**Audience:** Ableton producers collaborating across platforms. Non-technical on at least one end — the tool must be install-and-drag simple on both.

## 3. Product shape (decisions locked)

- **Two-sided** — one cross-platform desktop app, two modes; each use recruits the counterparty (inherent viral loop).
- **Desktop app** — drag-and-drop GUI; operates on *saved* project files outside Live (no editing-while-packing hazards; receiver can fix a project before ever opening Live).
- **Free** — suite pattern; two-sided adoption dies behind a paywall. Door open for a later pro tier.
- **Ableton-only, Live 12 first** (templates versioned per Live major; 11 follow-up).
- **v1 direction focus: Mac → Windows** (the validated path). The checker/manifest tiers are direction-agnostic from day one; Windows→Mac is mostly "plugins you don't own" + assets, which those tiers already cover.

## 4. The two modes

### PACK (sender — the high-fidelity path)
Drop a saved project → K-Convert:
1. Parses the `.als` (gzip XML) → full per-track device inventory.
2. **Swaps AU devices → the same plugin's locally-installed VST3** (same-engine transplant: JUCE = byte-copy; others = same-plugin state formats). This is the fidelity unlock — done on the sender's machine where both formats of the plugin exist, then VST3 state crosses the OS boundary for free.
3. **Mines plugin state for external asset references** (registry-based, §6) and copies the files into the bundle.
4. **Verifies** Ableton samples are collected (prompts "run Collect All and Save first" if not — we verify Live's job, we don't rebuild it).
5. Emits a **handoff bundle**: converted `.als` copy + `assets/` + `manifest.json` + human-readable `README` report. **Originals are never modified.**

### OPEN / CHECK (receiver — the safety net)
Drop an incoming project or bundle → K-Convert:
1. **Compat report** against the local plugin inventory (VST3/VST2 folder scans; AU scan on Mac).
2. **Converts remaining AU devices donor-lessly** where the receiver owns the plugin (gated by M0, §8).
3. **Installs bundled assets** to their proper homes (e.g. Serum `Noises/` path), or stages them with per-file instructions.
4. **Tiered verdict per device** (§5), including an auto-drafted "please freeze tracks N+M and resend" message for the freeze tier (freezing needs Live; we generate the ask, not the freeze).

## 5. The tier engine (shared core rulebook)

Encoded exactly as validated:

| Case | Action | Fidelity |
|---|---|---|
| Same plugin + same major version exists on target | Device swap + state transplant | Full (proven: ShaperBox 3, preset intact) |
| JUCE-family plugin | `jucePluginState` **byte-copy** into VST3 `ProcessorState` | Full (byte-identical, proven) |
| Version crossing (e.g. Serum 1 → Serum 2) | **Never blob surgery.** Extract vendor-native preset (e.g. `.fxp` from `vstdata`) + route through the vendor's own importer; prefer native preset files over DAW-state chunks | Vendor-importer fidelity (proven via drag-import) |
| Plugin not owned on target | *Install tier* (link if purchasable) / *substitute tier* (same-category plugin owned, manual, e.g. KClip3 → kHs Clipper) / *freeze tier* (auto-drafted resend request) | Degraded, honestly reported |
| Unknown state format | Report honestly; no silent guessing | n/a |

**Plugin identity matching** must be smarter than names: VST3 class UIDs, AU type/subtype/manufacturer fourCCs, version/family awareness (the Serum-vs-Serum2 trap is the canonical test case). Ships with a small cross-format identity map, extensible.

## 6. Asset-manifest registry

Per-plugin extractors that mine decompressed plugin state for external file references. **v1 ships Serum** (zlib state → string-mine paths like `/SB_NOISES/… .wav`; proven to name the exact missing file). Unknown plugins report "references external files we can't identify yet." Registry is data-driven so new extractors are additions, not rewrites. Never silently wrong: everything is reported.

## 7. Architecture

- **Core = pure TypeScript/Node library** (port of the ~150-line Python prototype): gzip/XML/zlib/plist parsing, device surgery, tier engine, asset registry. **No side effects in core; unit-tested with `node:test`** (suite discipline). Includes regression tests for every Live invariant we've hit (pointee-id allocation, below).
- **Shell = Electron** drag-and-drop app, brand design system (we ship 80MB binaries already; Electron's weight is acceptable, and it reuses our proven web-design chops).
- **Device-XML skeletons = versioned templates per Live major** (Live 12.4's `PluginDevice`/`Vst3PluginInfo` structure captured; 11.x variant later).
- **Live-invariant safety:** all writes go to a **copy**; pointee-space IDs (`AutomationTarget`, `ModulationTarget`, `Pointee`) are allocated **from** `LiveSet/NextPointeeId` and the counter is bumped past them (violation = "document is corrupt"; learned live, now a permanent unit test). Live's loader errors are precise — treat them as a validation dialogue.
- **Bundle format:** plain folder/zip — `project-converted.als`, `assets/`, `manifest.json`, `README.txt`. Moves over whatever channel collaborators already use; **no cloud component.**

## 8. Milestone 0 — donor-less conversion (HARD GATE)

The prototype cheated once: VST3 UIDs + device skeletons came from a hand-made **donor set**. A product cannot ask users for that. M0 researches + prototypes donor-less operation:

- **UID sources**, in preference order: Ableton's own plugin-scan database (location/format = the research); VST3 bundle `moduleinfo.json` (SDK ≥ 3.7.2); the **JUCE UID prediction heuristic** (VST3 `Fields.2/3` = the AU's manufacturer/subtype fourCCs, `Fields.0` = `0xABCDEF01` — observed and confirmed on real data) as fallback; per-plugin identity map as last resort.
- **Skeleton source:** versioned templates (validated: a template harvested once per Live version works — the donor proved the transplant; M0 proves we can *generate* what the donor provided).
- **Pass criteria:** convert `AU TEST.als` → opens in Live 12.4 with ShaperBox editable + state intact, **with no donor file present**.
- Feature/UI work **blocks** on M0 passing (same discipline as K-Scope's spine gate).

## 9. Out of scope for v1

Other DAWs · generic (non-registry) asset mining · auto-freeze (requires Live; we draft the request instead) · VST2 as a *target* (VST2 sources are read fine) · version-crossing *auto*-import (we extract + route to vendor importers) · any cloud/account anything.

## 10. Validated fact base (from the 2026-07-02 spike)

1. `.als` = gzip XML; AU devices = `AuPluginDevice` with state as hex `Buffer` → **plist** (keys seen: `jucePluginState`, `vstdata`, `data`, plus type/subtype/manufacturer fourCCs). Live 12.4 VST3 devices = `PluginDevice` + `Vst3PluginInfo`, state as hex text in `Preset/Vst3Preset/ProcessorState`.
2. **JUCE transplant is a direct byte copy** — AU `jucePluginState` == VST3 `ProcessorState` (same `#zip#\0`+zlib container). Proven byte-identical and confirmed working in Live (ShaperBox 3, "Bubble Adder" preset survived).
3. **Serum 1 `vstdata` is a complete `.fxp`** (`CcnK`/`FPCh`, fxID `XfsX`); Serum 2 state is a different format (`XferJson\0` + JSON) → cross-engine blob surgery impossible; the extracted `.fxp` imports into Serum 2 via **drag-onto-plugin-window** (both original and `numPrograms`-corrected variants worked).
4. **Plugin-internal assets are real and findable:** string-mining Serum's decompressed state yielded the exact missing noise file path; Ableton's Collect All can never see these.
5. **`NextPointeeId` invariant** (§7) — violating it = "document is corrupt"; fix validated.
6. Full receiver flow (parse → flag → swap → transplant → open in Live) proven end-to-end on real collaborator data.

## 11. Testing

- **Unit (`node --test`, CI):** als parse/write round-trip, plist/state extraction, tier-engine decisions, identity matching (incl. Serum/Serum2 trap), pointee-id invariants, fxp extraction/header, asset-path mining.
- **Fixture projects:** the AU TEST set (with friend's permission) + synthetic fixtures per Live version.
- **In-Live acceptance per milestone:** converted sets must open clean in real Ableton (Windows now; Mac side when hardware is available — same constraint as K-Scope).

## 12. Distribution

Free; own GitHub repo + releases; installers via the proven CI machine (Electron builders replace Inno/DMG specifics as needed); a **suite section on k-ripper.app** with cross-promotion from K-Ripper. macOS build requires the same Mac-validation gate as the rest of the suite (no Apple hardware on hand — friend's Mac is the current test bench, which is fitting for this product).

## 13. Decisions log

- Two-sided (PACK/OPEN) · desktop app · free — *(user)*
- Name **K-Convert** — *(user; K-Port reserved as fallback)*
- Node/TS core + Electron shell; templates per Live major — *(recommended, approved with design)*
- v1 = Mac→Win focus; Serum-only asset registry; M0 donor-less gate blocks features — *(design)*

## 14. Open questions (plan-time, non-blocking)

- Ableton plugin-DB format/location (M0 research determines the primary UID source).
- Bundle naming/extension (`.kconvert` folder vs plain zip).
- Whether PACK also pre-extracts version-crossing presets (e.g. always emit `.fxp` alongside) — leaning yes, it's cheap.
- Repo name (`k-convert`) and whether the suite site becomes a shared landing for all products.
