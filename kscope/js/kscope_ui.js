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

function paint() {
    var w = box.rect[2] - box.rect[0];
    var h = box.rect[3] - box.rect[1];
    var pts = [];
    for (var px = 0; px <= w; px += 2) {
        var freq = FMIN * Math.pow(FMAX / FMIN, px / w);
        var mag = readbin(Math.round(freq / BINHZ));
        var db = 20 * Math.log(Math.max(mag, 1e-7)) / Math.LN10;
        var v = (db + 90) / 90;
        if (v < 0) v = 0; if (v > 1) v = 1;
        pts.push([px, h - v * h]);
    }
    with (mgraphics) {
        set_source_rgba(0.055, 0.055, 0.075, 1.0);
        rectangle(0, 0, w, h); fill();

        set_source_rgba(1, 1, 1, 0.06);
        set_line_width(1);
        var grids = [100, 1000, 10000];
        for (var g = 0; g < grids.length; g++) {
            var gx = w * Math.log(grids[g] / FMIN) / Math.log(FMAX / FMIN);
            move_to(gx, 0); line_to(gx, h); stroke();
        }

        if (pts.length > 1) {
            move_to(0, h);
            for (var i = 0; i < pts.length; i++) line_to(pts[i][0], pts[i][1]);
            line_to(w, h); close_path();
            set_source_rgba(0.91, 0.20, 0.11, 0.88);
            fill();
            set_source_rgba(1.0, 0.45, 0.30, 0.95);
            set_line_width(1.5);
            move_to(pts[0][0], pts[0][1]);
            for (var j = 1; j < pts.length; j++) line_to(pts[j][0], pts[j][1]);
            stroke();
        }
    }
}

function bang() { mgraphics.redraw(); }

function dbg() {
    post("[kscope] ui max=" + lastMax.toFixed(5) +
         " size=" + (box.rect[2] - box.rect[0]) + "x" + (box.rect[3] - box.rect[1]) + "\n");
}
