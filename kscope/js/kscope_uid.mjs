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
