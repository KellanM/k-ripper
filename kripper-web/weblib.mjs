// K-Ripper Web — pure, side-effect-free helpers specific to the web app.
// Companion to lib.mjs (copied from the device); same testing philosophy.

import path from "path";

// Playlist detection is a URL-shape heuristic, not a network probe, so single
// tracks start instantly. Only unambiguous container URLs count:
//   soundcloud.com/<user>/sets/<set>        (but ?in=… track context does not)
//   youtube.com/playlist?list=…             (watch?v=…&list=… rips the video)
//   <artist>.bandcamp.com/album/…
export function isPlaylistUrl(url) {
  let u;
  try { u = new URL(String(url)); } catch { return false; }
  const host = u.hostname.toLowerCase();
  const p = u.pathname;
  if (/(^|\.)soundcloud\.com$/.test(host)) return /^\/[^/]+\/sets\/[^/]+/.test(p);
  if (/(^|\.)(youtube\.com|music\.youtube\.com)$/.test(host)) return p === "/playlist" && u.searchParams.has("list");
  if (/\.bandcamp\.com$/.test(host)) return /^\/album\//.test(p);
  return false;
}

// Parse `yt-dlp --flat-playlist --print "%(url)s\t%(title)s"` stdout.
// Non-URL lines are extractor noise; "NA" means yt-dlp had no title.
export function parsePlaylistEntries(stdout) {
  const entries = [];
  for (const line of String(stdout || "").split(/\r?\n/)) {
    const [url, ...rest] = line.split("\t");
    if (!/^https?:\/\//i.test(url || "")) continue;
    const title = rest.join("\t").trim();
    entries.push({ url: url.trim(), title: title && title !== "NA" ? title : null });
  }
  return entries;
}

// Validate a client-supplied art filename: plain JPG basename only. Anything
// else (separators, traversal, other extensions) is rejected — this is the
// guard that keeps GET /api/art?file= from reading outside the output dir.
export function safeArtBasename(name) {
  const s = String(name || "");
  if (!s || /[/\\\0]/.test(s) || s.includes("..")) return null;
  if (!/\.jpe?g$/i.test(s)) return null;
  return s;
}

// First free path for basename in dir: "a.m4a", then "a (2).m4a", "a (3).m4a"…
// existsFn is injected so this stays pure/testable (fs.existsSync in prod).
export function uniquePath(dir, basename, existsFn) {
  const ext = path.extname(basename);
  const stem = basename.slice(0, basename.length - ext.length);
  let candidate = path.join(dir, basename);
  for (let n = 2; existsFn(candidate); n++) {
    candidate = path.join(dir, `${stem} (${n})${ext}`);
  }
  return candidate;
}
