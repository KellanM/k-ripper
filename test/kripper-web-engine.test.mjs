// Integration-style tests for the rip pipeline with injected fake binaries.
// No network, no real yt-dlp/ffmpeg. Analysis is expected to fail gracefully
// (ffmpegPath points at nothing) and yield bpm/key "none".
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { rip, enumeratePlaylist, resolveBinPaths } from "../kripper-web/engine.mjs";

const FIXTURE = fileURLToPath(new URL("./fixtures/fake-ytdlp.mjs", import.meta.url));
const fakeOpts = (dir) => ({
  ytdlpPath: process.execPath, ytdlpPreArgs: [FIXTURE],
  ffmpegPath: path.join(dir, "no-such-ffmpeg"),
  outputDir: path.join(dir, "out"), stagingRoot: path.join(dir, "stage"),
  jobId: "test-job",
});

function tmpdir() { return fs.mkdtempSync(path.join(os.tmpdir(), "kweb-")); }
const collect = () => { const ev = []; return { ev, emit: (n, ...a) => ev.push([n, ...a]) }; };

test("rip: full happy path — original file lands in outputDir, events in order", async () => {
  const dir = tmpdir();
  const { ev, emit } = collect();
  await rip("https://fake.test/song", { ...fakeOpts(dir), emit, setCanceller: () => {} });
  const names = ev.map((e) => e[0]);
  assert.deepEqual(
    names.filter((n) => ["track", "art", "bpm", "key", "done"].includes(n)),
    ["track", "art", "bpm", "key", "done"]);
  const doneEv = ev.find((e) => e[0] === "done");
  assert.match(doneEv[1], /Fake Artist - Fake Title\.m4a$/); // original ext, no wav
  assert.ok(fs.existsSync(doneEv[1]));
  assert.equal(ev.find((e) => e[0] === "track")[1], "Fake Artist - Fake Title");
  assert.equal(ev.find((e) => e[0] === "bpm")[1], "none"); // analysis failed soft
  assert.ok(!fs.existsSync(path.join(dir, "stage", "test-job")), "staging cleaned");
});

test("rip: collision keeps both files ('(2)' suffix)", async () => {
  const dir = tmpdir();
  const outputDir = path.join(dir, "out");
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, "Fake Artist - Fake Title.m4a"), "old");
  const { ev, emit } = collect();
  await rip("https://fake.test/song", { ...fakeOpts(dir), emit, setCanceller: () => {} });
  assert.match(ev.find((e) => e[0] === "done")[1], /Fake Artist - Fake Title \(2\)\.m4a$/);
});

test("rip: yt-dlp failure emits a classified error, not a throw", async () => {
  const dir = tmpdir();
  const { ev, emit } = collect();
  await rip("https://fake.test/fail", { ...fakeOpts(dir), emit, setCanceller: () => {} });
  const err = ev.find((e) => e[0] === "error");
  assert.equal(err[1], "unavailable or private"); // classifyError of the 404
});

test("enumeratePlaylist: parses url/title pairs from the fixture", async () => {
  const entries = await enumeratePlaylist("https://fake.test/sets/x",
    { ytdlpPath: process.execPath, ytdlpPreArgs: [FIXTURE] });
  assert.deepEqual(entries, [
    { url: "https://fake.test/t1", title: "Fake One" },
    { url: "https://fake.test/t2", title: "Fake Two" },
  ]);
});

test("resolveBinPaths: returns platform-appropriate names", () => {
  const { ytdlpPath, ffmpegPath } = resolveBinPaths("/some/bin");
  if (process.platform === "win32") {
    assert.match(ytdlpPath, /yt-dlp\.exe$/); assert.match(ffmpegPath, /ffmpeg\.exe$/);
  } else {
    assert.match(ytdlpPath, /yt-dlp$/); assert.match(ffmpegPath, /ffmpeg/);
  }
});
