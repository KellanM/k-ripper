// K-Scope M0 fps probe — posts measured render fps once per second to the Max
// console for gate-B reads. Bang it on every rendered frame; send "report" from
// a [metro 1000].
//
// Inlet messages: bang (one rendered frame), reset, report

autowatch = 1;
inlets = 1;

var frames = 0;

function bang() { frames++; }
function reset() { frames = 0; }
function report() {
    post("[kscope] fps=" + frames + "\n");
    frames = 0;
}
