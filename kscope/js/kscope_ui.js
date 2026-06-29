// K-Scope M0 — spectrum display (jsui / mgraphics, CPU draw).
// Receives the FFT-magnitude matrix as a jit_matrix message (push model) and
// caches it into bins[]; draws a log-frequency filled spectrum in the brand
// palette. Push (vs creating a JitterMatrix at load) avoids the named-matrix
// timing/binding collision that read back all zeros.

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

// Called when the patch sends the named matrix to this jsui's inlet.
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

var paintCount = 0;
var paintMaxV = 0;

function paint() {
    paintCount++;
    var w = box.rect[2] - box.rect[0];
    var h = box.rect[3] - box.rect[1];
    try {
        with (mgraphics) {
            // background
            set_source_rgba(0.055, 0.055, 0.075, 1.0);
            rectangle(0, 0, w, h); fill();

            // VERSION MARKER (unconditional): magenta bar = THIS build is running
            set_source_rgba(0.95, 0.10, 0.80, 1.0);
            rectangle(w * 0.5 - 3, 0, 6, h); fill();

            // frequency grid
            set_source_rgba(1, 1, 1, 0.06);
            var grids = [100, 1000, 10000];
            for (var g = 0; g < grids.length; g++) {
                var gx = w * Math.log(grids[g] / FMIN) / Math.log(FMAX / FMIN);
                rectangle(gx, 0, 1, h); fill();
            }

            // spectrum as vertical bars (rectangle fill is proven to render)
            set_source_rgba(0.91, 0.22, 0.12, 0.95);
            var step = 3;
            var pmax = 0;
            for (var px = 0; px < w; px += step) {
                var freq = FMIN * Math.pow(FMAX / FMIN, px / w);
                var mag = readbin(Math.round(freq / BINHZ));
                var db = 20 * Math.log(Math.max(mag, 1e-7)) / Math.LN10;
                var v = (db + 80) / 60;   // -80..-20 dB -> 0..1
                if (v < 0) v = 0; if (v > 1) v = 1;
                if (v > pmax) pmax = v;
                var bh = v * h;
                if (bh > 0.5) { rectangle(px, h - bh, step - 0.6, bh); fill(); }
            }
            paintMaxV = pmax;
        }
    } catch (e) {
        post("[kscope] paint error: " + e.message + "\n");
    }
}

function bang() { mgraphics.redraw(); }

function dbg() {
    post("[kscope] ui jmMax=" + lastMax.toFixed(5) +
         " bins5=" + (bins[5] || 0).toFixed(5) +
         " bins10=" + (bins[10] || 0).toFixed(5) +
         " paintMaxV=" + paintMaxV.toFixed(3) +
         " paints=" + paintCount + "\n");
}
