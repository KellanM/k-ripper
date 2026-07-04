# K-Convert Phase 2 — Receiver App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. The final task is a human in-Ableton checkpoint (also formally closes the M0 human gate) — a subagent prepares everything and stops there.

**Goal:** Turn the K-Convert core into the receiver-side v1 app: universal UID resolution via Ableton's own plugin database, the final-review follow-ups, and an Electron drag-and-drop OPEN/CHECK app in the suite's brand design.

**Architecture:** New pure module `src/uid-db.ts` reads `Live-plugins-1.db` (copy-before-open, node:sqlite built-in, graceful-empty on any failure) and slots into the UID chain as identity-map → **live-db** → JUCE-heuristic; `decideAu`/`convertProject` gain optional db params (all 35 existing tests stay green). The app is a thin Electron shell over the core: pure `reportToHtml` renderer (unit-tested), `main.ts` IPC → `convertProject`, esbuild bundles the TS (core stays TS-native for tests).

**Tech Stack:** Node ≥22.18 native TS (runtime), `node:sqlite` (built-in; lazy-loaded, degrades gracefully if absent), Electron + esbuild (devDependencies only), `@xmldom/xmldom` (still the sole runtime dep).

## Global Constraints

- Repo: `C:\Qoral\Projects\Misc\k-convert`, branch `main` (local only; GitHub still pending user consent — do not push anywhere).
- **Read-only on Ableton's files:** `Live-plugins-1.db` (+ `-wal`/`-shm` sidecars) is ALWAYS copied to a temp dir before opening; never open/lock the original (Live may be running). Delete the temp copy after reading.
- **Graceful degradation:** missing DB / old Node without `node:sqlite` / unreadable schema → empty map → the existing identity-map/heuristic chain still works. Never throw from the DB path.
- Single runtime dependency (`@xmldom/xmldom`). Electron + esbuild are devDependencies.
- Originals never modified; pointee invariant; never blob-surgery across engines; report honestly (all per spec §5/§7 — unchanged).
- ESM, explicit `.ts` import extensions, erasable TS only. Tests: `npm test` → `node --test "test/**/*.test.ts"`, TDD RED→GREEN.
- Renderer security: `contextIsolation: true`, `nodeIntegration: false`, preload `contextBridge` only. Use `webUtils.getPathForFile(file)` for dropped files (`File.path` no longer exists in current Electron).
- All device names / preset names are untrusted strings — HTML-escape before rendering.
- Brand tokens for the app UI: bg `#0f0e13`, panel line `#2a2a35`, text `#eeeef1`, muted `#8b8b97`, signal `#e8341c`, ok `#58cf7a`; fonts: `system-ui` + `ui-monospace` (no web fonts — offline app).
- DB facts (authoritative: `docs/research-ableton-plugindb.md`): path `%LocalAppData%\Ableton\Live Database\Live-plugins-1.db`; table `plugins(dev_identifier TEXT, name TEXT, vendor TEXT, …)`; `dev_identifier` = `device:vst3:<category>:<32-hex CID with dashes>`; CID → `Fields.0-3` = four **big-endian signed int32s** in group order.

## File / artifact structure

```
k-convert/
├── src/uid-db.ts               # NEW: parseDevIdentifier, defaultLiveDbPath, loadLiveDbUids
├── src/uid.ts                  # MODIFY: resolveUid gains dbUid param + "live-db" source
├── src/tiers.ts                # MODIFY: decideAu gains dbUids param
├── src/inventory.ts            # MODIFY: export normName (currently private `norm`)
├── src/convert.ts              # MODIFY: liveDb option, uidSource in detail, uniqueFxpPath
├── app/report-html.ts          # NEW: pure ReportLine[] -> HTML (unit-tested)
├── app/main.ts, app/preload.ts # NEW: Electron main + preload
├── app/renderer/index.html, app/renderer/ui.ts   # NEW: drag-drop UI
├── scripts/build-app.mjs       # NEW: esbuild bundling
├── test/uid-db.test.ts, test/report-html.test.ts # NEW
├── test/{uid,tiers,convert}.test.ts               # MODIFY: chain/suffix tests
└── PHASE2-RESULTS section appended to M0-RESULTS.md (Task 6)
```

---

### Task 0: Hygiene + toolchain

**Files:**
- Modify: `package.json`, `.gitignore`

- [ ] **Step 1: package.json fields** (fixes final-review hygiene findings)

```bash
cd C:/Qoral/Projects/Misc/k-convert
npm pkg set main="dist-app/main.cjs" description="Mac↔Windows Ableton project handoff — check & convert AU devices to VST3 (K-Convert)" author="Kellan Mythen" "engines.node=>=22.18"
```

- [ ] **Step 2: devDependencies**

```bash
npm install -D electron esbuild
```
(Confirm `dependencies` still lists only `@xmldom/xmldom`.)

- [ ] **Step 3: verify node:sqlite + warning behavior**

Run: `node -e "const {DatabaseSync}=require('node:sqlite'); console.log('sqlite ok')"`
Expected: `sqlite ok`. **If an `ExperimentalWarning` is printed**, set the test script to suppress just that noise:
`npm pkg set scripts.test="node --disable-warning=ExperimentalWarning --test \"test/**/*.test.ts\""`
(If no warning, leave the script unchanged.)

- [ ] **Step 4: .gitignore** — append a line: `dist-app/`

- [ ] **Step 5: `npm test` (35/35 still green) → Commit**

```bash
git add -A && git commit -m "chore: engines/metadata, electron+esbuild devDeps, dist-app ignore"
```

---

### Task 1: `src/uid-db.ts` — Live plugin-DB reader

**Files:**
- Create: `src/uid-db.ts`
- Test: `test/uid-db.test.ts`

**Interfaces:**
- Produces: `type Uid = [number, number, number, number]` · `parseDevIdentifier(devId: string): Uid | null` (null unless `device:vst3:` prefixed with a valid 32-hex CID) · `defaultLiveDbPath(): string | null` (win32: `%LocalAppData%\Ableton\Live Database\Live-plugins-1.db`; other platforms null for now) · `loadLiveDbUids(dbPath?: string): Map<string, Uid>` — keys are **normName-normalized** plugin names; copy-before-open (incl. `-wal`/`-shm` sidecars when present); empty Map on ANY failure (missing file, no node:sqlite, bad schema).
- Consumes: `normName` from `src/inventory.ts` (exported in this task's Step 0 change? No — inventory export happens in Task 2; to keep this task self-contained, `uid-db.ts` defines its own private `norm` identical to inventory's; Task 2 consolidates).

- [ ] **Step 1: Failing tests**

`test/uid-db.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, existsSync, cpSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { parseDevIdentifier, loadLiveDbUids, defaultLiveDbPath } from "../src/uid-db.ts";

const SHAPER_ID = "device:vst3:audiofx:abcdef01-9182-faeb-4361-626c43474c33";
const SERUM2_ID = "device:vst3:instr:56534558-6673-5073-6572-756d20320000";

test("parseDevIdentifier: big-endian int32 groups, ground-truth exact", () => {
  assert.deepEqual(parseDevIdentifier(SHAPER_ID), [-1412567295, -1853687061, 1130455660, 1128746035]);
  assert.deepEqual(parseDevIdentifier(SERUM2_ID), [1448297816, 1718833267, 1701999981, 540147712]);
});

test("parseDevIdentifier: rejects non-vst3 and malformed ids", () => {
  assert.equal(parseDevIdentifier("device:audioUnit:aumu:whatever"), null);
  assert.equal(parseDevIdentifier("device:vst3:instr:zz-not-hex"), null);
  assert.equal(parseDevIdentifier("device:vst3:instr:abcdef01"), null); // too short
  assert.equal(parseDevIdentifier(""), null);
});

test("loadLiveDbUids: reads a fixture DB, skips non-vst3 rows, never touches original", async (t) => {
  let DatabaseSync: any;
  try { ({ DatabaseSync } = await import("node:sqlite")); }
  catch { t.skip("node:sqlite unavailable"); return; }

  const dir = mkdtempSync(join(tmpdir(), "kc-livedb-"));
  const dbPath = join(dir, "Live-plugins-1.db");
  const db = new DatabaseSync(dbPath);
  db.exec(`CREATE TABLE plugins (plugin_id INTEGER PRIMARY KEY, module_id INTEGER,
           dev_identifier TEXT, name TEXT, vendor TEXT);`);
  db.exec(`INSERT INTO plugins VALUES
    (76, 75, '${SHAPER_ID}', 'ShaperBox 3', 'Cableguys'),
    (1, 1, '${SERUM2_ID}', 'Serum 2', 'Xfer Records'),
    (99, 9, 'device:audioUnit:aumu:xxxx', 'Mac Thing', 'X');`);
  db.close();

  const uids = loadLiveDbUids(dbPath);
  assert.deepEqual(uids.get("shaperbox 3"), [-1412567295, -1853687061, 1130455660, 1128746035]);
  assert.deepEqual(uids.get("serum 2"), [1448297816, 1718833267, 1701999981, 540147712]);
  assert.equal(uids.get("mac thing"), undefined);       // non-vst3 skipped
  assert.ok(existsSync(dbPath));                          // original untouched
});

test("loadLiveDbUids: missing file / garbage file -> empty Map, no throw", () => {
  assert.equal(loadLiveDbUids("C:/nope/definitely-missing.db").size, 0);
});

test("opt-in: real Live DB resolves ground truths (KCONVERT_LIVEDB=1)",
  { skip: process.env.KCONVERT_LIVEDB !== "1" }, () => {
  const p = defaultLiveDbPath();
  assert.ok(p && existsSync(p));
  const uids = loadLiveDbUids(p!);
  assert.deepEqual(uids.get("shaperbox 3"), [-1412567295, -1853687061, 1130455660, 1128746035]);
  assert.deepEqual(uids.get("serum 2"), [1448297816, 1718833267, 1701999981, 540147712]);
});
```

- [ ] **Step 2: Run — FAIL** (`ERR_MODULE_NOT_FOUND`)

- [ ] **Step 3: Implement**

`src/uid-db.ts`:
```ts
// Universal UID source: Ableton's own plugin-scan DB (see docs/research-
// ableton-plugindb.md). Best-effort by design: any failure yields an empty
// map and the identity-map/JUCE chain carries on. ALWAYS copies the DB (and
// WAL sidecars) before opening — Live may hold the original.
import { copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";

export type Uid = [number, number, number, number];

const PREFIX = "device:vst3:";

export function parseDevIdentifier(devId: string): Uid | null {
  if (!devId || !devId.startsWith(PREFIX)) return null;
  const cid = devId.slice(devId.lastIndexOf(":") + 1).replace(/-/g, "");
  if (!/^[0-9a-fA-F]{32}$/.test(cid)) return null;
  const b = Buffer.from(cid, "hex");
  return [b.readInt32BE(0), b.readInt32BE(4), b.readInt32BE(8), b.readInt32BE(12)];
}

export function defaultLiveDbPath(): string | null {
  if (process.platform !== "win32" || !process.env.LOCALAPPDATA) return null;
  return join(process.env.LOCALAPPDATA, "Ableton", "Live Database", "Live-plugins-1.db");
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

export function loadLiveDbUids(dbPath?: string): Map<string, Uid> {
  const out = new Map<string, Uid>();
  const src = dbPath ?? defaultLiveDbPath();
  if (!src || !existsSync(src)) return out;

  let tmp: string | null = null;
  try {
    // Lazy require so Node builds without node:sqlite degrade gracefully.
    const { DatabaseSync } = require("node:sqlite");
    tmp = mkdtempSync(join(tmpdir(), "kc-livedb-copy-"));
    const copy = join(tmp, basename(src));
    copyFileSync(src, copy);
    for (const ext of ["-wal", "-shm"]) {           // recent scans live in the WAL
      if (existsSync(src + ext)) copyFileSync(src + ext, copy + ext);
    }
    const db = new DatabaseSync(copy);
    try {
      const rows = db.prepare("SELECT dev_identifier, name FROM plugins").all() as
        { dev_identifier: string | null; name: string | null }[];
      for (const r of rows) {
        const uid = r.dev_identifier ? parseDevIdentifier(r.dev_identifier) : null;
        if (uid && r.name) out.set(norm(r.name), uid);
      }
    } finally { db.close(); }
  } catch { out.clear(); }                           // any failure -> empty, never throw
  finally { if (tmp) { try { rmSync(tmp, { recursive: true, force: true }); } catch {} } }
  return out;
}
```
NOTE: `require` inside ESM — add at top: `import { createRequire } from "node:module"; const require = createRequire(import.meta.url);`

- [ ] **Step 4: Run — PASS** (`npm test`; also run once with `KCONVERT_LIVEDB=1 npm test` on this machine and record the opt-in result in the report)

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: Live plugin-DB UID reader (copy-before-open, graceful-empty)"`

---

### Task 2: Wire live-db into the resolution chain

**Files:**
- Modify: `src/inventory.ts` (export `normName`), `src/uid.ts`, `src/tiers.ts`
- Test: `test/uid.test.ts`, `test/tiers.test.ts` (additions)

**Interfaces:**
- `inventory.ts`: rename private `norm` → exported `normName(s: string): string` (update internal use).
- `uid.ts`: `resolveUid(entry, auManufacturer, auSubtype, hasJuceState, dbUid?: [number,number,number,number] | null)` → order **identity-map → live-db → juce-heuristic**; source union gains `"live-db"`.
- `tiers.ts`: `decideAu(state, inventory, dbUids?: Map<string, [number,number,number,number]>)` — computes `dbUid` by `normName(targetName)` (and `normName(entry.vst3Name)` when an entry exists), passes to `resolveUid`. Update the row-4 comment: with live-db, `swap/default-state` is now reachable for arbitrary installed non-JUCE plugins.

- [ ] **Step 1: Failing tests**

Append to `test/uid.test.ts`:
```ts
test("resolveUid: live-db slots between identity map and heuristic", () => {
  const dbUid: [number, number, number, number] = [1, 2, 3, 4];
  // no entry, db hit, no juce -> live-db
  assert.deepEqual(resolveUid(null, 9, 9, false, dbUid), { uid: dbUid, source: "live-db" });
  // identity map still wins over db
  const serum = lookupIdentity(1483109208, 1481000274)!;
  assert.equal(resolveUid(serum, 1481000274, 1483109208, false, dbUid)!.source, "identity-map");
  // db wins over heuristic even when juce evidence exists
  assert.equal(resolveUid(null, 1130455660, 1128746035, true, dbUid)!.source, "live-db");
  // nothing at all -> null
  assert.equal(resolveUid(null, 9, 9, false, null), null);
});
```

Append to `test/tiers.test.ts`:
```ts
test("db-resolved unknown plugin + installed -> swap/default-state via live-db", () => {
  const mystery: PlistDict = { name: "MysteryPlug", manufacturer: 1, subtype: 2, type: 1635083896, data: Buffer.from("xx") };
  const dbUids = new Map([["mysteryplug", [11, 22, 33, 44] as [number, number, number, number]]]);
  const v = decideAu(mystery, [{ name: "MysteryPlug", path: "z" }], dbUids);
  assert.equal(v.tier, "swap");
  assert.equal(v.stateAction, "default-state");
  assert.equal(v.uidSource, "live-db");
  assert.deepEqual(v.uid, [11, 22, 33, 44]);
});
```

- [ ] **Step 2: Run — FAIL** (arity/behavior) · **Step 3: Implement** the three modifications:

`src/inventory.ts`: `export const normName = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();` (replace the private `norm`, update `inventoryHas`).

`src/uid.ts` — replace `resolveUid` with:
```ts
export function resolveUid(
  entry: IdentityEntry | null, auManufacturer: number, auSubtype: number,
  hasJuceState: boolean, dbUid?: [number, number, number, number] | null,
): { uid: [number, number, number, number]; source: "identity-map" | "live-db" | "juce-heuristic" } | null {
  if (entry?.uid) return { uid: entry.uid, source: "identity-map" };
  if (dbUid) return { uid: dbUid, source: "live-db" };        // Live's own scan DB — verified byte-exact
  if (hasJuceState) return { uid: juceVst3Uid(auManufacturer, auSubtype), source: "juce-heuristic" };
  return null; // report honestly — never guess a UID
}
```

`src/tiers.ts` — signature `decideAu(state: PlistDict | null, inventory: InventoryEntry[], dbUids?: Map<string, [number, number, number, number]>)`; before the resolveUid call:
```ts
  const dbUid = dbUids?.get(normName(targetName))
    ?? (entry ? dbUids?.get(normName(entry.vst3Name)) : undefined) ?? null;
  const resolved = resolveUid(entry, codes.manufacturer, codes.subtype, hasJuce, dbUid);
```
(import `normName` from `./inventory.ts`; keep `inventoryHas` unchanged; update the row-4 comment to note live-db makes it reachable.)

- [ ] **Step 4: Run — ALL PASS** (existing 35 + new; MysteryPlug freeze test from Task 9 still passes because it passes no dbUids) · **Step 5: Commit** `git add -A && git commit -m "feat: live-db in UID chain (identity-map > live-db > juce-heuristic)"`

---

### Task 3: `convert.ts` — DB option + fxp uniquifying

**Files:**
- Modify: `src/convert.ts`
- Test: `test/convert.test.ts` (additions)

**Interfaces:**
- `convertProject(alsPath, opts: { outDir; vst3Dirs?; write?; liveDb?: string | false })` — `false` disables; string = explicit path; undefined = `defaultLiveDbPath()` best-effort. Swap report lines gain ` [uid:<source>]` suffix in `detail`.
- `uniqueFxpPath(dir: string, safeName: string): string` — exported; returns `<name>.fxp`, or `<name> (2).fxp`, `(3)`… skipping existing files.

- [ ] **Step 1: Failing tests** — append to `test/convert.test.ts`:
```ts
import { uniqueFxpPath } from "../src/convert.ts";

test("uniqueFxpPath: suffixes when files exist", () => {
  const dir = mkdtempSync(join(tmpdir(), "kc-fxp-"));
  assert.equal(uniqueFxpPath(dir, "A"), join(dir, "A.fxp"));
  writeFileSync(join(dir, "A.fxp"), "");
  writeFileSync(join(dir, "A (2).fxp"), "");
  assert.equal(uniqueFxpPath(dir, "A"), join(dir, "A (3).fxp"));
});

test("convertProject: dbUids from opts.liveDb reach the tier engine", async (t) => {
  let DatabaseSync: any;
  try { ({ DatabaseSync } = await import("node:sqlite")); } catch { t.skip("no node:sqlite"); return; }
  // fixture DB exposing MysteryPlug's uid
  const dbdir = mkdtempSync(join(tmpdir(), "kc-cdb-"));
  const dbPath = join(dbdir, "Live-plugins-1.db");
  const db = new DatabaseSync(dbPath);
  db.exec("CREATE TABLE plugins (dev_identifier TEXT, name TEXT);");
  db.exec("INSERT INTO plugins VALUES ('device:vst3:audiofx:00000001-0000-0002-0000-000300000004','MysteryPlug');");
  db.close();
  // project with a MysteryPlug AU (plain state, not JUCE)
  const AU = `<?xml version="1.0"?><plist version="1.0"><dict>
   <key>name</key><string>P</string><key>manufacturer</key><integer>1</integer>
   <key>subtype</key><integer>2</integer><key>type</key><integer>1635083896</integer>
   <key>data</key><data>eHg=</data></dict></plist>`;
  const INNER2 = `<MidiTrack Id="8"><Name><EffectiveName Value="T" /></Name>
   <DeviceChain><DeviceChain><Devices>
   <AuPluginDevice Id="0"><PluginDesc><AuPluginInfo><Name Value="MysteryPlug" />
   <Preset><AuPreset><Buffer>${plistHex(AU)}</Buffer></AuPreset></Preset>
   </AuPluginInfo></PluginDesc></AuPluginDevice></Devices></DeviceChain></DeviceChain></MidiTrack>`;
  const dir = mkdtempSync(join(tmpdir(), "kc-conv2-"));
  const src = join(dir, "p.als");
  writeFileSync(src, synthAls(INNER2));
  const inv = mkdtempSync(join(tmpdir(), "kc-inv2-"));
  writeFileSync(join(inv, "MysteryPlug.vst3"), "");

  const res = convertProject(src, { outDir: dir, vst3Dirs: [inv], write: true, liveDb: dbPath });
  assert.equal(res.report[0].tier, "swap");
  assert.equal(res.report[0].stateAction, "default-state");
  assert.match(res.report[0].detail, /\[uid:live-db\]/);
});

test("convertProject: liveDb:false skips the DB (Mystery freezes)", () => {
  const dir = mkdtempSync(join(tmpdir(), "kc-conv3-"));
  const src = join(dir, "p.als");
  writeFileSync(src, synthAls(INNER));       // the existing ShaperBox INNER fixture
  const res = convertProject(src, { outDir: dir, vst3Dirs: [], write: false, liveDb: false });
  assert.equal(res.report[0].tier, "freeze"); // unchanged behavior with empty inventory
});
```

- [ ] **Step 2: FAIL** · **Step 3: Implement** in `src/convert.ts`:
```ts
import { existsSync } from "node:fs";
import { loadLiveDbUids } from "./uid-db.ts";
// … in convertProject:
  const dbUids = opts.liveDb === false ? undefined
    : loadLiveDbUids(typeof opts.liveDb === "string" ? opts.liveDb : undefined);
  // … pass to the tier engine:
  const verdict = decideAu(state, inventory, dbUids);
  // … after computing detail for swap rows:
  if (verdict.uidSource) detail += ` [uid:${verdict.uidSource}]`;

export function uniqueFxpPath(dir: string, safeName: string): string {
  let p = join(dir, `${safeName}.fxp`);
  for (let n = 2; existsSync(p); n++) p = join(dir, `${safeName} (${n}).fxp`);
  return p;
}
// … replace the direct join(...) for the fxp write with: const p = uniqueFxpPath(opts.outDir, safeName);
```
(mkdir the outDir before `uniqueFxpPath` is used for writes.)

- [ ] **Step 4: ALL PASS** · **Step 5: Commit** `git add -A && git commit -m "feat: liveDb option in convertProject + uid-source reporting + fxp suffixing"`

---

### Task 4: `app/report-html.ts` — pure report renderer

**Files:**
- Create: `app/report-html.ts`
- Test: `test/report-html.test.ts`

**Interfaces:**
- Produces: `reportToHtml(report: ReportLine[], outPath: string | null, presets: { name: string; path: string }[]): string` — full inner-HTML for the results pane; per-tier badge colors (swap `#58cf7a`, substitute `#ffb021`, freeze `#f14e4e`, unknown `#8b8b97`); ALL dynamic strings HTML-escaped; when `outPath` set, a "converted →" line; presets listed with paths. `escapeHtml(s: string): string` also exported.

- [ ] **Step 1: Failing tests**

`test/report-html.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { reportToHtml, escapeHtml } from "../app/report-html.ts";

const LINES = [
  { track: "1-Serum", device: "Serum", tier: "swap" as const, stateAction: "extract-fxp" as const, detail: "version crossing" },
  { track: "3-MIDI", device: "<Evil & Co>", tier: "freeze" as const, stateAction: "none" as const, detail: "not installed" },
];

test("escapeHtml: neutralizes markup", () => {
  assert.equal(escapeHtml(`<b a="x">&`), "&lt;b a=&quot;x&quot;&gt;&amp;");
});

test("reportToHtml: one row per line, tier colors, escaping, outPath + presets", () => {
  const html = reportToHtml(LINES, "C:\\out\\p-win.als", [{ name: "P", path: "C:\\out\\P.fxp" }]);
  assert.match(html, /SWAP/);
  assert.match(html, /#58cf7a/);                 // swap badge color
  assert.match(html, /#f14e4e/);                 // freeze badge color
  assert.ok(html.includes("&lt;Evil &amp; Co&gt;"));      // escaped device name
  assert.ok(!html.includes("<Evil"));            // raw markup never present
  assert.match(html, /p-win\.als/);
  assert.match(html, /P\.fxp/);
});

test("reportToHtml: check-only (no outPath) has no converted line", () => {
  const html = reportToHtml(LINES, null, []);
  assert.ok(!/converted/i.test(html));
});
```

- [ ] **Step 2: FAIL** · **Step 3: Implement**

`app/report-html.ts`:
```ts
import type { ReportLine } from "../src/convert.ts";

const TIER_COLORS: Record<string, string> = {
  swap: "#58cf7a", substitute: "#ffb021", freeze: "#f14e4e", unknown: "#8b8b97",
};

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function reportToHtml(
  report: ReportLine[], outPath: string | null, presets: { name: string; path: string }[],
): string {
  const rows = report.map((l) => {
    const c = TIER_COLORS[l.tier] ?? TIER_COLORS.unknown;
    return `<div class="row">
      <span class="badge" style="background:${c}1a;color:${c};border:1px solid ${c}55">${escapeHtml(l.tier.toUpperCase())}</span>
      <span class="trk">${escapeHtml(l.track)}</span>
      <span class="dev">${escapeHtml(l.device)}</span>
      <span class="det">${escapeHtml(l.detail)}</span>
    </div>`;
  }).join("");
  const out = outPath
    ? `<div class="done">converted &rarr; <code>${escapeHtml(outPath)}</code></div>` : "";
  const pres = presets.map((p) =>
    `<div class="preset">preset: <code>${escapeHtml(p.path)}</code></div>`).join("");
  return rows + out + pres;
}
```

- [ ] **Step 4: PASS** · **Step 5: Commit** `git add -A && git commit -m "feat: pure HTML report renderer (escaped, tier-colored)"`

---

### Task 5: Electron shell + esbuild build

**Files:**
- Create: `app/main.ts`, `app/preload.ts`, `app/renderer/index.html`, `app/renderer/ui.ts`, `scripts/build-app.mjs`
- Modify: `package.json` (scripts)

**Interfaces:**
- Preload exposes `window.kconvert = { pathFor(file: File): string; check(p: string): Promise<ConvertResult>; convert(p: string): Promise<ConvertResult> }`.
- Main handles `kc:check` / `kc:convert` by calling `convertProject(alsPath, { outDir: join(dirname(alsPath), "K-Convert-out"), write: false|true })`.
- npm scripts: `app:build` → `node scripts/build-app.mjs`; `app` → `npm run app:build && electron .`.

- [ ] **Step 1: `scripts/build-app.mjs`**
```js
import { build } from "esbuild";
import { mkdirSync, copyFileSync } from "node:fs";

mkdirSync("dist-app", { recursive: true });
const common = { bundle: true, sourcemap: false, logLevel: "info" };
await build({ ...common, entryPoints: ["app/main.ts"], platform: "node", format: "cjs", external: ["electron", "node:sqlite"], outfile: "dist-app/main.cjs" });
await build({ ...common, entryPoints: ["app/preload.ts"], platform: "node", format: "cjs", external: ["electron"], outfile: "dist-app/preload.cjs" });
await build({ ...common, entryPoints: ["app/renderer/ui.ts"], platform: "browser", format: "iife", outfile: "dist-app/renderer.js" });
copyFileSync("app/renderer/index.html", "dist-app/index.html");
console.log("app built -> dist-app/");
```

- [ ] **Step 2: `app/main.ts`**
```ts
import { app, BrowserWindow, ipcMain } from "electron";
import { join, dirname } from "node:path";
import { convertProject } from "../src/convert.ts";

function outDirFor(alsPath: string) { return join(dirname(alsPath), "K-Convert-out"); }

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 920, height: 660, backgroundColor: "#0f0e13",
    title: "K-Convert",
    webPreferences: { preload: join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false },
  });
  win.removeMenu();
  win.loadFile(join(__dirname, "index.html"));
});

ipcMain.handle("kc:check", (_e, p: string) =>
  convertProject(p, { outDir: outDirFor(p), write: false }));
ipcMain.handle("kc:convert", (_e, p: string) =>
  convertProject(p, { outDir: outDirFor(p), write: true }));

app.on("window-all-closed", () => app.quit());
```

- [ ] **Step 3: `app/preload.ts`**
```ts
import { contextBridge, ipcRenderer, webUtils } from "electron";

contextBridge.exposeInMainWorld("kconvert", {
  pathFor: (file: File) => webUtils.getPathForFile(file),   // File.path is gone in modern Electron
  check: (p: string) => ipcRenderer.invoke("kc:check", p),
  convert: (p: string) => ipcRenderer.invoke("kc:convert", p),
});
```

- [ ] **Step 4: `app/renderer/index.html`** (brand shell; no external resources)
```html
<!doctype html>
<html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'unsafe-inline'">
<title>K-Convert</title>
<style>
  * { box-sizing: border-box; margin: 0; }
  body { background:#0f0e13; color:#eeeef1; font-family:system-ui,sans-serif; padding:24px; }
  h1 { font-size:18px; letter-spacing:.04em; }
  h1 .mk { color:#e8341c; }
  .sub { color:#8b8b97; font-family:ui-monospace,monospace; font-size:12px; margin-top:4px; }
  #drop { margin-top:18px; border:1.5px dashed #2a2a35; border-radius:14px; padding:44px 20px;
          text-align:center; color:#8b8b97; font-family:ui-monospace,monospace; transition:border-color .15s; }
  #drop.hot { border-color:#e8341c; color:#eeeef1; }
  #actions { margin-top:14px; display:none; gap:10px; }
  button { background:#e8341c; color:#fff; border:0; border-radius:9px; padding:10px 22px;
           font-weight:700; font-size:13px; cursor:pointer; }
  button:disabled { opacity:.5; cursor:default; }
  #report { margin-top:18px; font-family:ui-monospace,monospace; font-size:12.5px; line-height:1.55; }
  .row { display:flex; gap:10px; padding:7px 10px; border-bottom:1px solid #1c1b23; align-items:baseline; }
  .badge { font-size:10px; font-weight:700; letter-spacing:.08em; padding:2px 8px; border-radius:99px; }
  .trk { color:#8b8b97; min-width:80px; } .dev { font-weight:700; min-width:110px; }
  .det { color:#8b8b97; } .done, .preset { margin-top:10px; color:#58cf7a; }
  code { color:#eeeef1; }
</style></head>
<body>
  <h1><span class="mk">&#9654;</span> K-CONVERT</h1>
  <div class="sub">drop an Ableton .als &mdash; see what won't load &mdash; convert what can be converted</div>
  <div id="drop">drop project here</div>
  <div id="actions"><button id="convertBtn">CONVERT</button></div>
  <div id="report"></div>
  <script src="renderer.js"></script>
</body></html>
```

- [ ] **Step 5: `app/renderer/ui.ts`**
```ts
import { reportToHtml } from "../report-html.ts";

declare global {
  interface Window { kconvert: {
    pathFor(f: File): string;
    check(p: string): Promise<any>;
    convert(p: string): Promise<any>;
  }; }
}

const drop = document.getElementById("drop")!;
const actions = document.getElementById("actions")!;
const report = document.getElementById("report")!;
const btn = document.getElementById("convertBtn") as HTMLButtonElement;
let currentPath: string | null = null;

drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("hot"); });
drop.addEventListener("dragleave", () => drop.classList.remove("hot"));
drop.addEventListener("drop", async (e) => {
  e.preventDefault(); drop.classList.remove("hot");
  const f = e.dataTransfer?.files?.[0];
  if (!f || !f.name.toLowerCase().endsWith(".als")) { drop.textContent = "that wasn't an .als"; return; }
  currentPath = window.kconvert.pathFor(f);
  drop.textContent = f.name;
  const res = await window.kconvert.check(currentPath);
  report.innerHTML = reportToHtml(res.report, res.outPath, res.presets);
  actions.style.display = res.report.some((l: any) => l.tier === "swap") ? "flex" : "none";
});

btn.addEventListener("click", async () => {
  if (!currentPath) return;
  btn.disabled = true; btn.textContent = "CONVERTING…";
  const res = await window.kconvert.convert(currentPath);
  report.innerHTML = reportToHtml(res.report, res.outPath, res.presets);
  btn.disabled = false; btn.textContent = "CONVERT";
});
```

- [ ] **Step 6: scripts + build + smoke**

```bash
npm pkg set scripts.app:build="node scripts/build-app.mjs" scripts.app="npm run app:build && electron ."
npm run app:build     # expect: three bundles + index.html in dist-app/
npm test              # full suite still green
```
Manual smoke (report the observations): `npm run app` → window opens (dark, K-CONVERT header) → drop `test/fixtures/private/AU TEST.als` → three tier rows render (SWAP/SWAP/SUBSTITUTE badges) → CONVERT → "converted →" path + preset line appear → files exist under `test/fixtures/private/K-Convert-out/`. Close app.

- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat: Electron OPEN/CHECK app (drag-drop, tiered report, convert)"`

---

### Task 6: HUMAN CHECKPOINT — app-driven conversion opens in Live (closes M0 human gate)

**Files:**
- Modify: `M0-RESULTS.md` (append `## Phase 2 acceptance + M0 human gate`)

- [ ] **Step 1 (machine):** re-run the app flow fresh: delete `test/fixtures/private/K-Convert-out/`, `npm run app`, drop `AU TEST.als`, CONVERT. Verify output set exists and `node src/cli.ts check` on it reports only the KClip3 SUBSTITUTE line.
- [ ] **Step 2 (HUMAN — Kellan, in Live 12.4):** open `test/fixtures/private/K-Convert-out/AU TEST-win.als`: ShaperBox 3 editable with "Bubble Adder" · Serum 2 editable · drag the extracted `.fxp` into Serum 2 → friend's patch · KClip3 ghost on track 3 (expected). PASS/FAIL per item.
- [ ] **Step 3:** append the verdicts to `M0-RESULTS.md` under `## Phase 2 acceptance + M0 human gate` (this formally closes the M0 gate from the previous plan AND accepts phase 2). Commit: `git add -A && git commit -m "phase2: in-Live acceptance + M0 human gate closed"`.

---

## Post-phase-2 roadmap (next plan)

PACK mode (sender-side: sample verification, asset collection into a bundle, Mac-side AU→VST3 swap), bundle/manifest format, installers + suite-site distribution, GitHub repo (pending user consent), Mac validation via the collaborator.

## Self-review

**Spec coverage (phase-2 scope):** research §5-verdict → Tasks 1–3 (DB primary with identity-map routing preserved, per the "complements, does not replace" caveat — encoded as identity-map-first for *uid values* because curated uids are exact and carry routing semantics; live-db extends coverage to arbitrary plugins, making spec §5 row 4 reachable); final-review follow-ups → Task 0 (engines/metadata/main) + Task 3 (fxp suffix); spec §4 OPEN mode → Tasks 4–5; §7 brand/security constraints → Task 5 (CSP, contextIsolation, escaped rendering); M0 gate closure → Task 6.
**Placeholder scan:** none; all code complete; the only conditional step (ExperimentalWarning suppression) has its exact command.
**Type consistency:** `Uid` tuple shape consistent across uid-db/uid/tiers/convert; `resolveUid` 5-arg form matches Task 2 tests; `decideAu` 3-arg form matches Tasks 2–3; `reportToHtml(report, outPath, presets)` matches Task 5's `ui.ts` usage; `normName` exported in Task 2 and consumed in tiers.
