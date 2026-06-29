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
