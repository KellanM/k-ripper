// K-Scope M0 — spectrum display (jsui / mgraphics, CPU draw).
// Receives the FFT-magnitude matrix as a jit_matrix message, caches + lightly
// smooths it, and draws a filled log-frequency spectrum with a SPAN-style dB
// grid in the brand palette.

autowatch = 1;
mgraphics.init();
mgraphics.relative_coords = 0;
mgraphics.autofill = 0;

var NBINS = 1024;
var BINHZ = 44100 / 2048;
var FMIN = 20, FMAX = 20000;
var DB_TOP = 0, DB_BOT = -96;      // SPAN-style vertical range
var SMOOTH = 0.5;                  // temporal smoothing (0 = none)

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
        bins[i] = bins[i] * SMOOTH + v * (1 - SMOOTH);
        if (bins[i] > mx) mx = bins[i];
    }
    lastMax = mx;
    mgraphics.redraw();
}

function magToDb(mag) { return 20 * Math.log(Math.max(mag, 1e-7)) / Math.LN10; }
function dbToY(db, h) {
    var t = (db - DB_BOT) / (DB_TOP - DB_BOT);   // 0..1 bottom..top
    if (t < 0) t = 0; if (t > 1) t = 1;
    return h - t * h;
}
function freqToX(f, w) { return w * Math.log(f / FMIN) / Math.log(FMAX / FMIN); }

function paint() {
    var w = box.rect[2] - box.rect[0];
    var h = box.rect[3] - box.rect[1];
    with (mgraphics) {
        // background
        set_source_rgba(0.05, 0.05, 0.07, 1.0);
        rectangle(0, 0, w, h); fill();

        // horizontal dB grid + labels (every 12 dB)
        select_font_face("Arial");
        set_font_size(9);
        for (var db = DB_TOP; db >= DB_BOT; db -= 12) {
            var gy = dbToY(db, h);
            set_source_rgba(1, 1, 1, 0.07);
            rectangle(0, gy, w, 1); fill();
            try {
                set_source_rgba(1, 1, 1, 0.30);
                move_to(4, gy + 9);
                text_path(db + "");
                fill();
            } catch (e) {}
        }

        // vertical frequency grid + labels
        var fmarks = [[100, "100"], [1000, "1k"], [10000, "10k"]];
        for (var fi = 0; fi < fmarks.length; fi++) {
            var gx = freqToX(fmarks[fi][0], w);
            set_source_rgba(1, 1, 1, 0.07);
            rectangle(gx, 0, 1, h); fill();
            try {
                set_source_rgba(1, 1, 1, 0.30);
                move_to(gx + 3, h - 4);
                text_path(fmarks[fi][1]);
                fill();
            } catch (e) {}
        }

        // filled spectrum (1px resolution -> reads as a smooth curve)
        set_source_rgba(0.91, 0.22, 0.12, 0.85);
        for (var px = 0; px < w; px += 1) {
            var freq = FMIN * Math.pow(FMAX / FMIN, px / w);
            var y = dbToY(magToDb(readbin(Math.round(freq / BINHZ))), h);
            if (y < h - 0.5) { rectangle(px, y, 1, h - y); fill(); }
        }
    }
}

function readbin(b) {
    if (b < 0) b = 0;
    if (b >= NBINS) b = NBINS - 1;
    return bins[b];
}

function bang() { mgraphics.redraw(); }
function dbg() { post("[kscope] max=" + lastMax.toFixed(5) + "\n"); }
