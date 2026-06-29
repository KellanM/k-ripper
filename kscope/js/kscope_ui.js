// K-Scope M0 — spectrum display (jsui / mgraphics, CPU draw; the spec's
// fallback renderer). Receives the FFT-magnitude matrix as a jit_matrix
// message, caches it into bins[], and draws a log-frequency bar spectrum in
// the brand palette.

autowatch = 1;
mgraphics.init();
mgraphics.relative_coords = 0;
mgraphics.autofill = 0;

var NBINS = 1024;          // FFT 2048 -> 1024 magnitude bins
var BINHZ = 44100 / 2048;  // Hz per bin
var FMIN = 20, FMAX = 20000;
var bins = new Array(NBINS);
for (var k = 0; k < NBINS; k++) bins[k] = 0;
var lastMax = 0;

function jit_matrix(name) {
    var m = new JitterMatrix(name);
    var d = m.dim;
    var n = (d instanceof Array) ? d[0] : d;
    if (!n || n < 1) n = NBINS;
    var mx = 0;
    for (var i = 0; i < n && i < NBINS; i++) {
        var c = m.getcell(i);
        var v = (c instanceof Array) ? c[c.length - 1] : c;
        if (typeof v !== "number") v = 0;
        bins[i] = v;
        if (v > mx) mx = v;
    }
    lastMax = mx;
    mgraphics.redraw();
}

function readbin(b) {
    if (b < 0) b = 0;
    if (b >= NBINS) b = NBINS - 1;
    return bins[b];
}

function paint() {
    var w = box.rect[2] - box.rect[0];
    var h = box.rect[3] - box.rect[1];
    with (mgraphics) {
        // background
        set_source_rgba(0.055, 0.055, 0.075, 1.0);
        rectangle(0, 0, w, h); fill();

        // frequency grid (100 / 1k / 10k)
        set_source_rgba(1, 1, 1, 0.06);
        var grids = [100, 1000, 10000];
        for (var g = 0; g < grids.length; g++) {
            var gx = w * Math.log(grids[g] / FMIN) / Math.log(FMAX / FMIN);
            rectangle(gx, 0, 1, h); fill();
        }

        // spectrum bars (log-frequency X, dB Y)
        set_source_rgba(0.91, 0.22, 0.12, 0.95);
        var step = 3;
        for (var px = 0; px < w; px += step) {
            var freq = FMIN * Math.pow(FMAX / FMIN, px / w);
            var mag = readbin(Math.round(freq / BINHZ));
            var db = 20 * Math.log(Math.max(mag, 1e-7)) / Math.LN10;
            var v = (db + 80) / 60;   // -80..-20 dB -> 0..1
            if (v < 0) v = 0; if (v > 1) v = 1;
            var bh = v * h;
            if (bh > 0.5) { rectangle(px, h - bh, step - 0.6, bh); fill(); }
        }
    }
}

function bang() { mgraphics.redraw(); }

// minimal heartbeat (driven by metro 1000 -> "dbg") to confirm input level
function dbg() { post("[kscope] max=" + lastMax.toFixed(5) + "\n"); }
