// Tests for the serial rip queue. runJob is injected, so no processes spawn.
import { test } from "node:test";
import assert from "node:assert/strict";
import { RipQueue } from "../kripper-web/queue.mjs";

const tick = () => new Promise((r) => setImmediate(r));

test("runs jobs serially in FIFO order", async () => {
  const order = [];
  let release;
  const gate = new Promise((r) => { release = r; });
  const q = new RipQueue(async (job, api) => {
    order.push(`start:${job.url}`);
    if (job.url === "u1") await gate;
    api.emit("done", `/out/${job.url}.m4a`);
    order.push(`end:${job.url}`);
  });
  q.add({ url: "u1", title: null });
  q.add({ url: "u2", title: null });
  await tick();
  assert.deepEqual(order, ["start:u1"]); // u2 must wait
  release();
  await tick(); await tick();
  assert.deepEqual(order, ["start:u1", "end:u1", "start:u2", "end:u2"]);
});

test("mirrors events into job fields and forwards them", async () => {
  const seen = [];
  const q = new RipQueue(async (job, api) => {
    api.emit("track", "Artist - Title");
    api.emit("progress", 42);
    api.emit("bpm", 174);
    api.emit("key", "8A", "Am");
    api.emit("done", "/out/x.m4a");
  });
  q.on("job", (id, name, args) => seen.push(name));
  const job = q.add({ url: "u", title: null });
  await tick(); await tick();
  assert.equal(job.title, "Artist - Title");
  assert.equal(job.progress, 42);
  assert.equal(job.bpm, 174);
  assert.equal(job.key, "8A Am");
  assert.equal(job.audioPath, "/out/x.m4a");
  assert.equal(job.state, "done");
  assert.ok(seen.includes("queued") && seen.includes("done"));
});

test("a failing job marks error and does not block the next", async () => {
  const q = new RipQueue(async (job, api) => {
    if (job.url === "bad") throw new Error("boom");
    api.emit("done", "/out/ok.m4a");
  });
  const bad = q.add({ url: "bad", title: null });
  const good = q.add({ url: "good", title: null });
  await tick(); await tick(); await tick();
  assert.equal(bad.state, "error");
  assert.equal(bad.error, "boom");
  assert.equal(good.state, "done");
});

test("cancel of a queued job removes it from execution", async () => {
  let ran = 0;
  let release;
  const gate = new Promise((r) => { release = r; });
  const q = new RipQueue(async (job, api) => { ran++; await gate; api.emit("done", "/x"); });
  q.add({ url: "u1", title: null });
  const j2 = q.add({ url: "u2", title: null });
  await tick();
  assert.equal(q.cancel(j2.id), true);
  assert.equal(j2.state, "cancelled");
  release();
  await tick(); await tick();
  assert.equal(ran, 1); // u2 never ran
});

test("cancel of the running job invokes the registered canceller", async () => {
  let cancelled = false;
  const q = new RipQueue(async (job, api) => {
    api.setCanceller(() => { cancelled = true; api.emit("cancelled"); });
    await new Promise(() => {}); // hangs until cancelled path resolves the test
  });
  const j = q.add({ url: "u", title: null });
  await tick();
  q.cancel(j.id);
  await tick();
  assert.equal(cancelled, true);
  assert.equal(j.state, "cancelled");
});

test("unknown id cancel returns false; jobs() lists newest last", async () => {
  const q = new RipQueue(async (job, api) => api.emit("done", "/x"));
  const a = q.add({ url: "a", title: null });
  const b = q.add({ url: "b", title: null });
  assert.equal(q.cancel("nope"), false);
  assert.deepEqual(q.jobs().map((j) => j.id), [a.id, b.id]);
  assert.equal(q.get(a.id), a);
});
