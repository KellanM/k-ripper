// K-Scope M0 console logger. Uses the Max js post() which mirrors to
// MaxPlug.log, so the magnitude readout is readable off-machine (unlike the
// [print] object, which only hits the live Max Console).
autowatch = 1;
inlets = 1;

function msg_float(v) { post("[kscope] mag " + v + "\n"); }
function msg_int(v) { post("[kscope] mag " + v + "\n"); }
function list() { post("[kscope] mag " + arrayfromargs(arguments).join(" ") + "\n"); }
function anything() { post("[kscope] " + messagename + " " + arrayfromargs(arguments).join(" ") + "\n"); }
