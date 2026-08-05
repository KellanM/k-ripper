// Route tests against a live server on an ephemeral port with a stub queue.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { EventEmitter } from "events";
import { createApp } from "../kripper-web/server.mjs";

function stubQueue() {
  const q = new EventEmitter();
  q._jobs = [];
  q.jobs = () => q._jobs;
  q.get = (id) => q._jobs.find((j) => j.id === id);
  q.add = ({ url, title }) => {
    const job = { id: `j${q._jobs.length + 1}`, url, title: title || null, state: "queued",
      progress: 0, artFile: null, audioPath: null, bpm: null, key: null, error: null };
    q._jobs.push(job); return job;
  };
  q.cancel = (id) => Boolean(q.get(id));
  return q;
}

async function startApp(overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kweb-srv-"));
  const publicDir = path.join(dir, "public");
  fs.mkdirSync(publicDir);
  fs.writeFileSync(path.join(publicDir, "index.html"), "<h1>kweb</h1>");
  const queue = overrides.queue || stubQueue();
  const app = createApp({
    queue, outputDir: dir, publicDir,
    enumerate: overrides.enumerate || (async () => []),
    isPlaylist: overrides.isPlaylist || (() => false),
  });
  await new Promise((r) => app.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${app.address().port}`;
  return { app, base, queue, dir };
}

test("GET / serves index.html", async () => {
  const { app, base } = await startApp();
  const res = await fetch(base + "/");
  assert.equal(res.status, 200);
  assert.match(await res.text(), /kweb/);
  app.close();
});

test("POST /api/rip queues a single job and returns it", async () => {
  const { app, base, queue } = await startApp();
  const res = await fetch(base + "/api/rip", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "check out https://soundcloud.com/a/t !" }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.jobs.length, 1);
  assert.equal(queue.jobs()[0].url, "https://soundcloud.com/a/t"); // extractUrl applied
  app.close();
});

test("POST /api/rip expands playlists into one job per entry", async () => {
  const { app, base, queue } = await startApp({
    isPlaylist: () => true,
    enumerate: async () => [{ url: "https://x/1", title: "One" }, { url: "https://x/2", title: "Two" }],
  });
  const res = await fetch(base + "/api/rip", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "https://soundcloud.com/a/sets/s" }),
  });
  const body = await res.json();
  assert.equal(body.jobs.length, 2);
  assert.equal(queue.jobs()[1].title, "Two");
  app.close();
});

test("POST /api/rip with no url in input → 400 with error json", async () => {
  const { app, base } = await startApp();
  const res = await fetch(base + "/api/rip", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "no link here" }),
  });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, "no URL found");
  app.close();
});

test("GET /api/jobs returns the queue", async () => {
  const { app, base, queue } = await startApp();
  queue.add({ url: "https://x/1" });
  const body = await (await fetch(base + "/api/jobs")).json();
  assert.equal(body.jobs.length, 1);
  app.close();
});

test("GET /api/art rejects traversal and non-jpg", async () => {
  const { app, base } = await startApp();
  for (const bad of ["..%2Fsecret.jpg", "a%5Cb.jpg", "x.exe"]) {
    const res = await fetch(`${base}/api/art?file=${bad}`);
    assert.equal(res.status, 400, bad);
  }
  app.close();
});

test("GET /api/art serves a jpg from outputDir by basename", async () => {
  const { app, base, dir } = await startApp();
  fs.writeFileSync(path.join(dir, "cover.jpg"), "jpgbytes");
  const res = await fetch(base + "/api/art?file=cover.jpg");
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "image/jpeg");
  app.close();
});

test("POST /api/reveal only accepts finished jobs", async () => {
  const { app, base, queue } = await startApp();
  const j = queue.add({ url: "https://x/1" });        // state: queued
  let res = await fetch(base + "/api/reveal", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: j.id }),
  });
  assert.equal(res.status, 409);
  res = await fetch(base + "/api/reveal", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ id: "unknown" }),
  });
  assert.equal(res.status, 404);
  app.close();
});

test("GET /api/events is an SSE stream that forwards queue events", async () => {
  const { app, base, queue } = await startApp();
  const res = await fetch(base + "/api/events");
  assert.equal(res.headers.get("content-type"), "text/event-stream");
  const reader = res.body.getReader();
  queue.emit("job", "j1", "progress", [42]);
  // The ": connected\n\n" ping and the job event are separate writes and may
  // arrive as separate chunks (chunked transfer encoding, no guaranteed
  // coalescing) — accumulate reads instead of assuming a single read has
  // both, or an unlucky chunk boundary makes this test flaky/hang.
  const decoder = new TextDecoder();
  let text = "";
  while (!text.includes('"job":"j1"')) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  assert.match(text, /"job":"j1"/);
  assert.match(text, /"event":"progress"/);
  reader.cancel();
  app.close();
});
