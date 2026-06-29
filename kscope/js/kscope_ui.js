// K-Scope M0 — spectrum display (jsui / mgraphics, CPU draw).
// Reads the named Jitter matrix "kscope_spec" that jit.poke~ fills with FFT
// magnitudes, and draws a log-frequency filled spectrum in the brand palette.
// This is the spec's sanctioned fallback renderer; it is authorable + self-
// debuggable (post() -> MaxPlug.log), unlike the GL path.

autowatch = 1;
mgraphics.init();
mgraphics.relative_coords = 0;
mgraphics.autofill = 0;

var NBINS = 1024;          // FFT 2048 -> 1024 magnitude bins
var BINHZ = 44100 / 2048;  // Hz per bin
var FMIN = 20, FMAX = 20000;
var spec = new JitterMatrix("kscope_spec");
var lastMax = 0;

function readbin(b) {
    if (b < 0) b = 0;
    if (b >= NBINS) b = NBINS - 1;
    var c;
    try { c = spec.getcell(b); } catch (e) { return 0; }
    if (c === null || c === undefined) return 0;
    if (c instanceof Array) return c[c.length - 1];
    return c;
}

function paint() {
    var w = box.rect[2] - box.rect[0];
    var h = box.rect[3] - box.rect[1];

    // precompute the spectrum polyline (log-freq X, dB Y)
    var pts = [];
    var mx = 0;
    for (var px = 0; px <= w; px += 2) {
        var freq = FMIN * Math.pow(FMAX / FMIN, px / w);
        var mag = readbin(Math.round(freq / BINHZ));
        if (mag > mx) mx = mag;
        var db = 20 * Math.log(Math.max(mag, 1e-7)) / Math.LN10;
        var v = (db + 90) / 90;
        if (v < 0) v = 0; if (v > 1) v = 1;
        pts.push([px, h - v * h]);
    }
    lastMax = mx;

    with (mgraphics) {
        // background
        set_source_rgba(0.055, 0.055, 0.075, 1.0);
        rectangle(0, 0, w, h); fill();

        // frequency grid (100 / 1k / 10k)
        set_source_rgba(1, 1, 1, 0.06);
        set_line_width(1);
        var grids = [100, 1000, 10000];
        for (var g = 0; g < grids.length; g++) {
            var gx = w * Math.log(grids[g] / FMIN) / Math.log(FMAX / FMIN);
            move_to(gx, 0); line_to(gx, h); stroke();
        }

        if (pts.length > 1) {
            // filled body (signal red)
            move_to(0, h);
            for (var i = 0; i < pts.length; i++) line_to(pts[i][0], pts[i][1]);
            line_to(w, h); close_path();
            set_source_rgba(0.91, 0.20, 0.11, 0.88);
            fill();
            // brighter top edge
            set_source_rgba(1.0, 0.45, 0.30, 0.95);
            set_line_width(1.5);
            move_to(pts[0][0], pts[0][1]);
            for (var j = 1; j < pts.length; j++) line_to(pts[j][0], pts[j][1]);
            stroke();
        }
    }
}

function bang() { mgraphics.redraw(); }

// throttled debug (driven by a separate metro -> "dbg")
function dbg() {
    post("[kscope] ui max=" + lastMax.toFixed(5) +
         " size=" + (box.rect[2] - box.rect[0]) + "x" + (box.rect[3] - box.rect[1]) + "\n");
}
