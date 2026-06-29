// K-Scope Max `js` wrapper — runs inside Max's js object (not Node).
// Mirrors kscope_uid.mjs (the unit-tested source of truth), derives the seed
// from the device's LiveAPI path, and outputs the two per-instance resource
// names + a render-gate flag (visible AND dsp-on).
//
// Outlets: 0 = matrix name, 1 = context name, 2 = render-gate flag (0/1)
// Inlet messages: bang (recompute names), visibility <0|1>, dsp <0|1>

autowatch = 1;
outlets = 3;

var FNV = 2166136261;
function makeUid(seed) {
    var h = FNV >>> 0, s = String(seed || "");
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
    return (h >>> 0).toString(36);
}

var uid = "x", visible = 1, dspOn = 0;

function bang() {
    try {
        var d = new LiveAPI(null, "this_device");
        uid = makeUid(String(d.unquotedpath));
    } catch (e) {}
    outlet(0, "---kscope_spec_" + uid);
    outlet(1, "---kscope_ctx_" + uid);
    gate();
}

function visibility(v) { visible = (v != 0) ? 1 : 0; gate(); }
function dsp(v) { dspOn = (v != 0) ? 1 : 0; gate(); }
function gate() { outlet(2, (visible && dspOn) ? 1 : 0); }
