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

// ---- tempo (BPM) detection helpers ------------------------------------
//
// The engine decodes a window of the finished WAV to mono 44.1kHz float PCM and
// hands it to the bundled `music-tempo` (Beatroot algorithm). These pure helpers
// build the ffmpeg args and post-process the raw tempo — the parts worth testing
// without spawning ffmpeg or pulling in the analyzer.

// ffmpeg args to decode an analysis window to raw mono f32 PCM on stdout.
// music-tempo hardcodes a 44.1kHz assumption — feeding any other sample rate
// throws the BPM off by an octave (validated: a 90 BPM track read as 180 at
// 22.05kHz), so the rate is fixed at 44100 and must not be "optimized" lower.
// We cap the window (default 150s) so memory + analysis time stay bounded on
// multi-hour DJ sets; no seek, so short tracks still yield samples.
export function ffmpegAnalysisArgs(wavPath, seconds = 150, sampleRate = 44100) {
  return [
    "-v", "error",
    "-t", String(seconds),
    "-i", String(wavPath),
    "-ac", "1",
    "-ar", String(sampleRate),
    "-f", "f32le",
    "-",
  ];
}

// Fold a raw tempo into a musical band to tame octave errors — every detector
// (music-tempo, aubio, all of them) periodically reports half/double the true
// tempo. [70,180) keeps the common electronic range intact (house 124, techno
// 132, trance 140, DnB 174) while pulling a stray 35 up to 70 or 200 down to
// 100. Returns null for non-finite / non-positive input.
export function foldOctave(bpm, lo = 70, hi = 180) {
  let b = Number(bpm);
  if (!isFinite(b) || b <= 0) return null;
  while (b < lo) b *= 2;
  while (b >= hi) b /= 2;
  return b;
}

// Turn a raw detected tempo into the integer BPM shown on the clip, or null if
// detection produced nothing usable.
export function finalizeBpm(rawTempo, lo = 70, hi = 180) {
  const folded = foldOctave(rawTempo, lo, hi);
  return folded == null ? null : Math.round(folded);
}

// Clip name with the detected tempo and key appended (whichever are known).
// Mirrored in kripper.js for the Max-side clip rename. e.g.
//   "Artist - Title · 174 BPM · Am 8A"
export function formatClipName(base, bpm, key, camelot) {
  let name = String(base == null ? "" : base).trim();
  const n = Number(bpm);
  if (bpm != null && isFinite(n) && n > 0) {
    const seg = `${Math.round(n)} BPM`;
    name = name ? `${name} · ${seg}` : seg;
  }
  if (key && camelot) {
    const seg = `${key} ${camelot}`;
    name = name ? `${name} · ${seg}` : seg;
  }
  return name;
}

// ---- musical key detection helpers ------------------------------------
//
// The engine extracts a 12-D chroma (pitch-class profile) from the WAV via the
// vendored NNLS chroma; these pure helpers turn that into a key label + Camelot
// code by Krumhansl-Schmuckler correlation. Default profile is Sha'ath's (tuned
// on electronic music, as used by KeyFinder) — better for our audience than the
// classic Krumhansl-Kessler set.

export const KEY_NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export const KEY_PROFILES = {
  // Krumhansl & Kessler (1982) — original probe-tone ratings.
  kk: { major: [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
        minor: [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17] },
  // Temperley (2001) — stronger than KK on common-practice tonal music.
  temperley: { major: [5.0, 2.0, 3.5, 2.0, 4.5, 4.0, 2.0, 4.5, 2.0, 3.5, 1.5, 4.0],
               minor: [5.0, 2.0, 3.5, 4.5, 2.0, 4.0, 2.0, 4.5, 3.5, 2.0, 1.5, 4.0] },
  // Sha'ath (2011), as used in KeyFinder — tuned on electronic music. Default.
  shaath: { major: [6.6, 2.0, 3.5, 2.3, 4.6, 4.0, 2.5, 5.2, 2.4, 3.7, 2.3, 3.4],
            minor: [6.5, 2.7, 3.5, 5.4, 2.6, 3.5, 2.5, 5.2, 4.0, 2.7, 4.3, 3.2] },
};

// Camelot (harmonic-mixing) code per key. Outer ring B = major, inner A = minor.
// 8B = C major, 8A = A minor; adjacent numbers / same-number A↔B are mixable.
export const KEY_TO_CAMELOT = {
  C: "8B", "C#": "3B", D: "10B", "D#": "5B", E: "12B", F: "7B",
  "F#": "2B", G: "9B", "G#": "4B", A: "11B", "A#": "6B", B: "1B",
  Cm: "5A", "C#m": "12A", Dm: "7A", "D#m": "2A", Em: "9A", Fm: "4A",
  "F#m": "11A", Gm: "6A", "G#m": "1A", Am: "8A", "A#m": "3A", Bm: "10A",
};

function rotateProfile(arr, r) {
  const out = new Array(12);
  for (let i = 0; i < 12; i++) out[i] = arr[(i - r + 12) % 12];
  return out;
}

function keyPearson(a, b) {
  let ma = 0, mb = 0;
  for (let i = 0; i < 12; i++) { ma += a[i]; mb += b[i]; }
  ma /= 12; mb /= 12;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < 12; i++) {
    const ax = a[i] - ma, bx = b[i] - mb;
    num += ax * bx; da += ax * ax; db += bx * bx;
  }
  const d = Math.sqrt(da * db);
  return d === 0 ? 0 : num / d;
}

// Krumhansl-Schmuckler: correlate the chroma against all 24 rotated major/minor
// profiles; the best correlation is the key. Returns {label, camelot,
// confidence} or null if the chroma is empty/degenerate.
export function detectKeyFromChroma(chroma, profileName = "shaath") {
  if (!chroma || chroma.length < 12) return null;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += chroma[i];
  if (!(sum > 0)) return null;
  const prof = KEY_PROFILES[profileName] || KEY_PROFILES.shaath;
  let best = null;
  for (let r = 0; r < 12; r++) {
    const maj = keyPearson(chroma, rotateProfile(prof.major, r));
    const min = keyPearson(chroma, rotateProfile(prof.minor, r));
    if (!best || maj > best.confidence) best = { label: KEY_NOTE_NAMES[r], confidence: maj };
    if (min > best.confidence) best = { label: KEY_NOTE_NAMES[r] + "m", confidence: min };
  }
  return { label: best.label, camelot: KEY_TO_CAMELOT[best.label] || null, confidence: best.confidence };
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
