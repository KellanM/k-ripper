// Unit tests for K-Ripper's pure logic (kripper/lib.mjs).
// Run: node --test test    (or: npm test)
//
// Cases marked "regression" reproduce real bugs that shipped to users.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractUrl, pickAudio, pickArt, stripExt, wavName,
  parseProgress, classifyError, isNewer, AUDIO_EXT,
  ffmpegAnalysisArgs, foldOctave, finalizeBpm, formatClipName,
} from "../kripper/lib.mjs";

test("extractUrl: plain url", () => {
  assert.equal(extractUrl("https://soundcloud.com/a/b"), "https://soundcloud.com/a/b");
});

test("extractUrl: regression — strips Max textedit 'text ' prefix", () => {
  // Max's textedit emits "text <url>"; this used to fail validation.
  assert.equal(extractUrl("text https://youtube.com/watch?v=x"), "https://youtube.com/watch?v=x");
});

test("extractUrl: regression — survives leading BOM / whitespace from clipboard", () => {
  assert.equal(extractUrl("﻿  https://bandcamp.com/track/1 "), "https://bandcamp.com/track/1");
});

test("extractUrl: stops at quotes/angle brackets, keeps query string", () => {
  assert.equal(extractUrl('<a href="https://x.com/p?a=1&b=2">'), "https://x.com/p?a=1&b=2");
});

test("extractUrl: no url -> null", () => {
  assert.equal(extractUrl("just some text"), null);
  assert.equal(extractUrl(""), null);
  assert.equal(extractUrl(null), null);
  assert.equal(extractUrl(undefined), null);
});

test("pickAudio: finds the audio file among mixed dir contents", () => {
  const files = [".DS_Store", "cover.jpg", "track.info.json", "Artist - Title.m4a"];
  assert.equal(pickAudio(files), "Artist - Title.m4a");
});

test("pickAudio: regression — resolves YouTube webm with fullwidth-pipe title", () => {
  // yt-dlp turns the illegal "|" into U+FF5C; reading the dir (not stdout)
  // is what fixed YouTube. The resolver must still match it.
  const files = ["Rodney Carrington - Fred ｜ Rodney Carrington.jpg",
                 "Rodney Carrington - Fred ｜ Rodney Carrington.webm"];
  assert.equal(pickAudio(files), "Rodney Carrington - Fred ｜ Rodney Carrington.webm");
});

test("pickAudio: every supported extension matches", () => {
  for (const ext of ["m4a", "webm", "mp3", "opus", "ogg", "aac", "flac", "wav", "mp4"]) {
    assert.ok(AUDIO_EXT.test(`x.${ext}`), `${ext} should match`);
    assert.equal(pickAudio([`x.${ext}`]), `x.${ext}`);
  }
});

test("pickAudio: none -> null", () => {
  assert.equal(pickAudio(["a.jpg", "b.txt"]), null);
  assert.equal(pickAudio([]), null);
  assert.equal(pickAudio(undefined), null);
});

test("pickArt: jpg and jpeg, null when absent", () => {
  assert.equal(pickArt(["t.m4a", "t.jpg"]), "t.jpg");
  assert.equal(pickArt(["t.JPEG"]), "t.JPEG");
  assert.equal(pickArt(["t.m4a", "t.png"]), null);
});

test("stripExt / wavName", () => {
  assert.equal(stripExt("Artist - Title.m4a"), "Artist - Title");
  assert.equal(wavName("Artist - Title.m4a"), "Artist - Title.wav");
  // dots inside the name are preserved (only the final ext is replaced)
  assert.equal(wavName("a.remix.v2.webm"), "a.remix.v2.wav");
  assert.equal(stripExt("a.remix.v2.webm"), "a.remix.v2");
});

test("parseProgress: percent line", () => {
  assert.equal(parseProgress("[download]  47.3% of ~1.2MiB"), 47);
  assert.equal(parseProgress("[download] 100% of 2.89MiB"), 100);
});

test("parseProgress: prefers monotonic fragment counter, clamps to 100", () => {
  assert.equal(parseProgress("[download]   6.7% of ~ 2.99MiB (frag 2/15)"), 13);
  assert.equal(parseProgress("[download] 100.0% (frag 16/15)"), 100); // overshoot clamped
});

test("parseProgress: non-progress lines -> null", () => {
  assert.equal(parseProgress("[soundcloud] Extracting URL: ..."), null);
  assert.equal(parseProgress(""), null);
});

test("classifyError: maps the common failures", () => {
  assert.equal(classifyError("ERROR: [soundcloud] HTTP Error 404: Not Found"), "unavailable or private");
  assert.equal(classifyError("HTTP Error 403: Forbidden"), "access denied");
  assert.equal(classifyError("getaddrinfo ENOTFOUND api-v2.soundcloud.com"), "network error");
  assert.equal(classifyError("ERROR: Unsupported URL: https://x"), "unsupported site");
  assert.equal(classifyError("spawn ENOENT"), "engine missing — reinstall");
});

test("classifyError: regression — Windows file-lock code maps to friendly message", () => {
  // ffmpeg EACCES surfaces as this giant unsigned exit code on Windows.
  assert.equal(classifyError("ffmpeg exit 4294967283"), "file in use by Live — remove old clip");
});

test("classifyError: trims yt-dlp prefix noise, caps length", () => {
  const out = classifyError("ERROR: [bandcamp] track123: Some unusual failure happened here");
  assert.ok(!out.startsWith("ERROR"));
  assert.ok(out.length <= 60);
});

test("isNewer: version comparison incl. the 0.3.10 vs 0.3.2 trap", () => {
  assert.equal(isNewer("0.3.3", "0.3.2"), true);
  assert.equal(isNewer("0.3.2", "0.3.2"), false);
  assert.equal(isNewer("0.3.1", "0.3.2"), false);
  assert.equal(isNewer("0.3.10", "0.3.2"), true);   // numeric, not string compare
  assert.equal(isNewer("0.3.2", "0.3.10"), false);
  assert.equal(isNewer("0.4", "0.3.9"), true);       // missing component = 0
  assert.equal(isNewer("1.0.0", "0.9.9"), true);
});

// ---- tempo (BPM) detection helpers ------------------------------------

test("ffmpegAnalysisArgs: locks 44.1kHz mono f32 — the rate must NOT be lowered", () => {
  // music-tempo assumes 44100; a lower rate octave-shifts the result (a 90 BPM
  // track read as 180 at 22.05kHz). This test guards that regression.
  const args = ffmpegAnalysisArgs("/tmp/x.wav");
  assert.deepEqual(args, [
    "-v", "error", "-t", "150", "-i", "/tmp/x.wav",
    "-ac", "1", "-ar", "44100", "-f", "f32le", "-",
  ]);
  // window length is configurable, rate/channels stay fixed
  const short = ffmpegAnalysisArgs("a.wav", 60);
  assert.equal(short[3], "60");
  assert.equal(short[short.indexOf("-ar") + 1], "44100");
  assert.equal(short[short.indexOf("-ac") + 1], "1");
});

test("foldOctave: keeps common electronic tempos intact", () => {
  for (const bpm of [90, 124, 128, 132, 140, 174]) {
    assert.equal(foldOctave(bpm), bpm); // all already inside [70,180)
  }
});

test("foldOctave: pulls octave-error outliers back into the musical band", () => {
  assert.equal(foldOctave(35), 70);   // half-time doubled up
  assert.equal(foldOctave(200), 100); // double-time halved down
  assert.equal(foldOctave(60), 120);
  assert.equal(foldOctave(180), 90);  // hi bound is exclusive
});

test("foldOctave / finalizeBpm: junk input -> null", () => {
  for (const bad of [0, -5, NaN, Infinity, null, undefined, "x"]) {
    assert.equal(foldOctave(bad), null);
    assert.equal(finalizeBpm(bad), null);
  }
});

test("finalizeBpm: folds then rounds to an integer", () => {
  assert.equal(finalizeBpm(127.6), 128);
  assert.equal(finalizeBpm(174.2), 174);
  assert.equal(finalizeBpm(63.4), 127); // 63.4*2 = 126.8 -> 127
});

test("formatClipName: appends BPM, degrades gracefully", () => {
  assert.equal(formatClipName("Artist - Title", 128), "Artist - Title · 128 BPM");
  assert.equal(formatClipName("Artist - Title", 127.6), "Artist - Title · 128 BPM");
  assert.equal(formatClipName("Artist - Title", null), "Artist - Title"); // unknown tempo
  assert.equal(formatClipName("Artist - Title", 0), "Artist - Title");
  assert.equal(formatClipName("", 128), "128 BPM"); // no name, still useful
});
