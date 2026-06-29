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
var DB_TOP = 6, DB_BOT = -90;      // SPAN/FabFilter-style vertical range
var SMOOTH = 0.8;                  // temporal smoothing (higher = calmer)
var FFTREF = 512;                  // 0 dBFS magnitude for 2048-pt Hann pfft~ (N/4)
var TILT = 4.5;                    // +4.5 dB/oct @ 1kHz (SPAN/FabFilter default)

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

// magnitude -> dBFS (calibrated: 0 dBFS sine = N/4 magnitude for Hann pfft~)
function magToDb(mag) { return 20 * Math.log(Math.max(mag, 1e-9) / FFTREF) / Math.LN10; }
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
        for (var db = 0; db >= DB_BOT; db -= 12) {
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

        // build the spectrum polyline (log-freq X, tilted dBFS Y, bin-interpolated)
        var pts = [];
        for (var px = 0; px <= w; px += 1) {
            var freq = FMIN * Math.pow(FMAX / FMIN, px / w);
            var binF = freq / BINHZ;
            var b0 = Math.floor(binF), frac = binF - b0;
            var mag = readbin(b0) * (1 - frac) + readbin(b0 + 1) * frac;  // interpolate
            var dbfs = magToDb(mag);
            var dbDisp = dbfs + TILT * Math.log(freq / 1000) / Math.LN2;  // +4.5 dB/oct tilt
            pts.push([px, dbToY(dbDisp, h)]);
        }

        // light frequency smoothing of the curve (moving average over pixels)
        var R = 3, sy = [];
        for (var p = 0; p < pts.length; p++) {
            var acc = 0, cnt = 0;
            for (var q = -R; q <= R; q++) {
                var idx = p + q;
                if (idx >= 0 && idx < pts.length) { acc += pts[idx][1]; cnt++; }
            }
            sy.push(acc / cnt);
        }
        for (var p2 = 0; p2 < pts.length; p2++) pts[p2][1] = sy[p2];

        // filled area under the curve
        move_to(0, h);
        for (var i = 0; i < pts.length; i++) line_to(pts[i][0], pts[i][1]);
        line_to(w, h); close_path();
        set_source_rgba(0.91, 0.22, 0.12, 0.55);
        fill();

        // bright curve outline on top
        set_source_rgba(1.0, 0.42, 0.28, 0.95);
        set_line_width(1.5);
        move_to(pts[0][0], pts[0][1]);
        for (var j = 1; j < pts.length; j++) line_to(pts[j][0], pts[j][1]);
        stroke();
    }
}

function readbin(b) {
    if (b < 0) b = 0;
    if (b >= NBINS) b = NBINS - 1;
    return bins[b];
}

function bang() { mgraphics.redraw(); }
function dbg() { post("[kscope] max=" + lastMax.toFixed(5) + "\n"); }
