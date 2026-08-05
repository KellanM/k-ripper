// Unit tests for kripper-web's pure helpers (kripper-web/weblib.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { isPlaylistUrl, parsePlaylistEntries, safeArtBasename, uniquePath } from "../kripper-web/weblib.mjs";

test("isPlaylistUrl: soundcloud set is a playlist", () => {
  assert.equal(isPlaylistUrl("https://soundcloud.com/artist/sets/my-mix"), true);
});
test("isPlaylistUrl: soundcloud track with ?in= set context is NOT a playlist", () => {
  assert.equal(isPlaylistUrl("https://soundcloud.com/artist/track?in=artist/sets/my-mix"), false);
});
test("isPlaylistUrl: youtube playlist page is a playlist", () => {
  assert.equal(isPlaylistUrl("https://www.youtube.com/playlist?list=PLx123"), true);
});
test("isPlaylistUrl: youtube watch with list param is NOT a playlist (rip the video)", () => {
  assert.equal(isPlaylistUrl("https://www.youtube.com/watch?v=abc&list=PLx123"), false);
});
test("isPlaylistUrl: bandcamp album is a playlist", () => {
  assert.equal(isPlaylistUrl("https://artist.bandcamp.com/album/the-record"), true);
});
test("isPlaylistUrl: plain track urls are not", () => {
  assert.equal(isPlaylistUrl("https://soundcloud.com/artist/track"), false);
  assert.equal(isPlaylistUrl("https://artist.bandcamp.com/track/song"), false);
  assert.equal(isPlaylistUrl(null), false);
});

test("parsePlaylistEntries: url<TAB>title lines", () => {
  const out = "https://soundcloud.com/a/t1\tTrack One\nhttps://soundcloud.com/a/t2\tTrack Two\n";
  assert.deepEqual(parsePlaylistEntries(out), [
    { url: "https://soundcloud.com/a/t1", title: "Track One" },
    { url: "https://soundcloud.com/a/t2", title: "Track Two" },
  ]);
});
test("parsePlaylistEntries: skips blank lines and NA titles, tolerates CRLF", () => {
  const out = "https://x.com/1\tNA\r\n\r\nhttps://x.com/2\tOk\r\n";
  assert.deepEqual(parsePlaylistEntries(out), [
    { url: "https://x.com/1", title: null },
    { url: "https://x.com/2", title: "Ok" },
  ]);
});
test("parsePlaylistEntries: skips non-url lines (yt-dlp noise)", () => {
  assert.deepEqual(parsePlaylistEntries("[soundcloud] resolving\nhttps://x.com/1\tT\n"), [
    { url: "https://x.com/1", title: "T" },
  ]);
});

test("safeArtBasename: accepts a plain jpg basename", () => {
  assert.equal(safeArtBasename("Artist - Title.jpg"), "Artist - Title.jpg");
});
test("safeArtBasename: rejects traversal, separators, non-jpg, empty", () => {
  assert.equal(safeArtBasename("../secret.jpg"), null);
  assert.equal(safeArtBasename("a/b.jpg"), null);
  assert.equal(safeArtBasename("a\\b.jpg"), null);
  assert.equal(safeArtBasename("evil.exe"), null);
  assert.equal(safeArtBasename(""), null);
  assert.equal(safeArtBasename(null), null);
});

test("uniquePath: returns dir/base when free, ' (2)' style when taken", () => {
  const taken = new Set(["/out/a.m4a", "/out/a (2).m4a"]);
  const exists = (p) => taken.has(p.replace(/\\/g, "/"));
  assert.equal(uniquePath("/out", "b.m4a", exists).replace(/\\/g, "/"), "/out/b.m4a");
  assert.equal(uniquePath("/out", "a.m4a", exists).replace(/\\/g, "/"), "/out/a (3).m4a");
});
