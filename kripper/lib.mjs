// K-Ripper — pure, side-effect-free helpers shared by the engine and the tests.
//
// kripper.mjs imports `max-api` and runs side effects (spawns, the rip handler)
// the moment it loads, so its logic can't be imported into a test. These
// functions have no max-api / fs / spawn dependency, so the bug-prone bits
// (URL parsing, version compare, the audio-from-directory resolution that fixed
// the YouTube break, progress + error parsing) can be unit-tested in isolation.

export const AUDIO_EXT = /\.(m4a|webm|mp3|opus|ogg|aac|flac|wav|mp4)$/i;

// Pull the first http(s) URL out of arbitrary text. The clipboard can carry a
// "text " prefix from Max's textedit, a leading BOM, or trailing junk — grab
// the URL regardless. Returns the URL string, or null if there isn't one.
export function extractUrl(raw) {
  const m = String(raw || "").match(/https?:\/\/[^\s"'<>]+/i);
  return m ? m[0] : null;
}

// Pick the produced audio / cover-art filename from a directory listing.
// The staging dir holds exactly one rip, so the first match is unambiguous.
export function pickAudio(names) {
  return (names || []).find((f) => AUDIO_EXT.test(f)) || null;
}
export function pickArt(names) {
  return (names || []).find((f) => /\.jpe?g$/i.test(f)) || null;
}

// Strip the extension for a display name; derive the WAV sibling name.
export function stripExt(basename) {
  return String(basename).replace(/\.[^.]+$/, "");
}
export function wavName(basename) {
  return String(basename).replace(/\.[^.\\/]+$/, ".wav");
}

// Parse a yt-dlp --newline stdout line into an integer percent (0–100), or null
// if the line carries no progress. Prefers the monotonic HLS fragment counter
// over the percent, which bounces around a moving size estimate.
export function parseProgress(line) {
  const s = String(line);
  const frag = s.match(/\(frag (\d+)\/(\d+)\)/);
  if (frag) {
    const total = parseInt(frag[2]) || 1;
    return Math.min(100, Math.floor((100 * parseInt(frag[1])) / total));
  }
  const pct = s.match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
  if (pct) return Math.floor(parseFloat(pct[1]));
  return null;
}

// Map a raw yt-dlp/ffmpeg error string to a short, friendly device message.
export function classifyError(raw) {
  const msg = String(raw || "unknown error");
  if (/HTTP Error 404|Not Found/i.test(msg)) return "unavailable or private";
  if (/HTTP Error 40[13]/i.test(msg)) return "access denied";
  if (/getaddrinfo|ENOTFOUND|Failed to resolve|Connection|timed? ?out|ETIMEDOUT|ECONNRESET/i.test(msg)) return "network error";
  if (/Unsupported URL/i.test(msg)) return "unsupported site";
  if (/ENOENT/i.test(msg)) return "engine missing — reinstall";
  // ffmpeg exits with EACCES (-13, shown by Windows as 4294967283) when the
  // output file is locked — usually a WAV currently loaded in a Live clip.
  if (/Permission denied|EACCES|EBUSY|exit 4294967283/i.test(msg)) return "file in use by Live — remove old clip";
  // Trim yt-dlp's "ERROR: [site] id:" prefix noise for everything else.
  return msg.replace(/^ERROR:\s*(\[[^\]]*\]\s*)?([\w-]+:\s*)?/, "").slice(0, 60);
}

// True if dotted version `remote` is newer than `local` (numeric, component-wise;
// missing components are 0, so "0.4" > "0.3.9" and "0.3.10" > "0.3.2").
export function isNewer(remote, local) {
  const r = String(remote).split(".").map((n) => parseInt(n) || 0);
  const l = String(local).split(".").map((n) => parseInt(n) || 0);
  for (let i = 0; i < Math.max(r.length, l.length); i++) {
    const a = r[i] || 0, b = l[i] || 0;
    if (a !== b) return a > b;
  }
  return false;
}
