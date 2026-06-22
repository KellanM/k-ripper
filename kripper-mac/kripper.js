// K-Ripper — Max for Live JS.
// Orchestrates the device UI and drops finished audio into the parent track's
// first empty clip slot via the Live Object Model.
//
// Inlet 0:
//   url <symbol>      store URL (from textedit -> tosymbol -> prepend url)
//   rip / bang        trigger ripping; cancels if a rip is in flight
//   progress <int>    download percent (from kripper.mjs)
//   status <symbol>   status text from engine
//   track <symbol>    resolved track name from engine
//   source <symbol>   URL actually being ripped (lights the platform icon)
//   done <symbol>     final file path from engine -> load into clip
//   cancelled         rip aborted by user
//   reset             engine (re)started -> snap UI to idle
//   update <version>  newer build published -> status-line nudge
//   error <symbol>    failure reason
//
// Outlet 0:  to node.script: rip <url> | cancel
//
// UI elements addressed by scripting name (no wiring required):
//   kr_status    comment — status line
//   kr_dot       panel   — colored state indicator
//   kr_track     comment — resolved track name
//   kr_rip       live.text — RIP/CANCEL button
//   kr_ic_*      fpic    — platform icons (dim/lit swap)

autowatch = 1;
inlets = 1;
outlets = 1;

var currentUrl = "";
var ripping = false;

var IDLE_TEXT = "ready";
var MAX_STATUS_CHARS = 34; // what fits in the bbox; full text goes to console
var MAX_TRACK_CHARS = 58;  // track bbox stops short of the cover art

// Color palette (RGBA, floats 0–1) for the status dot.
var DOT_IDLE    = [0.373, 0.796, 0.306, 1.0]; // muted green
var DOT_WORKING = [1.000, 0.690, 0.130, 1.0]; // amber
var DOT_OK      = [0.295, 0.882, 0.395, 1.0]; // bright green
var DOT_ERROR   = [0.945, 0.305, 0.305, 1.0]; // soft red
var DOT_UPDATE  = [0.310, 0.620, 0.965, 1.0]; // blue — update available

// Status row layout: text bbox right-aligned to x=404 (matches RIP button
// right edge). Dot follows the visible text, sitting just to its left.
var STATUS_RIGHT = 404;
var STATUS_BBOX_LEFT = 210;
var STATUS_BBOX_WIDTH = STATUS_RIGHT - STATUS_BBOX_LEFT;
var STATUS_DOT_Y = 24;
var DOT_GAP = 12;
var CHAR_W = 5.4; // Lucida Sans Unicode 10pt rough avg per character

// Platform icon varnames, URL patterns, and asset basenames.
var PLATFORMS = [
    ["kr_ic_sc", /soundcloud\.com/i,          "icon_sc"],
    ["kr_ic_yt", /youtube\.com|youtu\.be/i,   "icon_yt"],
    ["kr_ic_bc", /bandcamp\.com/i,            "icon_bc"],
    ["kr_ic_mc", /mixcloud\.com/i,            "icon_mc"],
    ["kr_ic_tt", /tiktok\.com/i,              "icon_tt"],
    ["kr_ic_tw", /twitch\.tv/i,               "icon_tw"],
    ["kr_ic_vm", /vimeo\.com/i,               "icon_vm"],
    ["kr_ic_rd", /reddit\.com|redd\.it/i,     "icon_rd"]
];

function named(name) {
    try { return this.patcher.getnamed(name); } catch (e) { return null; }
}

function setStatus(text) {
    text = String(text);
    if (text.length > MAX_STATUS_CHARS) {
        text = text.slice(0, MAX_STATUS_CHARS - 1) + "…";
    }
    var target = named("kr_status");
    if (target) target.message("set", text);
    else post("[k-ripper] " + text + "\n");
    positionDot(text);
}

function positionDot(text) {
    var s = String(text || "");
    var textWidth = Math.min(STATUS_BBOX_WIDTH, s.length * CHAR_W);
    var textLeftEdge = STATUS_RIGHT - textWidth;
    var dotX = Math.max(STATUS_BBOX_LEFT - 16, textLeftEdge - DOT_GAP - 8);
    var dot = named("kr_dot");
    if (dot) dot.message("presentation_rect", dotX, STATUS_DOT_Y, 8, 8);
}

function setDot(rgba) {
    var dot = named("kr_dot");
    if (dot) dot.message("bgcolor", rgba[0], rgba[1], rgba[2], rgba[3]);
}

function setTrack(text) {
    text = String(text || "");
    if (text.length > MAX_TRACK_CHARS) {
        text = text.slice(0, MAX_TRACK_CHARS - 1) + "…";
    }
    var t = named("kr_track");
    if (t) t.message("set", text || " ");
}

function setButton(label) {
    var b = named("kr_rip");
    if (b) {
        b.message("text", label);
        b.message("texton", label);
    }
}

function resetIcons() {
    for (var i = 0; i < PLATFORMS.length; i++) {
        var ic = named(PLATFORMS[i][0]);
        if (ic) ic.message("pic", "assets/" + PLATFORMS[i][2] + ".png");
    }
}

function highlightSource(url) {
    for (var i = 0; i < PLATFORMS.length; i++) {
        if (PLATFORMS[i][1].test(url)) {
            var ic = named(PLATFORMS[i][0]);
            if (ic) ic.message("pic", "assets/" + PLATFORMS[i][2] + "_lit.png");
            return;
        }
    }
}

function finishRip() {
    ripping = false;
    setButton("RIP");
}

// ---- messages from the patcher UI ------------------------------------

// textedit outputs with a "text" selector prefix; strip it.
function url() {
    var args = Array.prototype.slice.call(arguments);
    if (args.length && String(args[0]) === "text") args.shift();
    currentUrl = args.join(" ").trim();
    // Don't stomp live status mid-rip; the URL is stored either way.
    if (!ripping) setStatus(currentUrl ? "url ready · hit RIP" : IDLE_TEXT);
}

function rip() {
    if (ripping) {
        setStatus("cancelling...");
        outlet(0, "cancel");
        return;
    }
    ripping = true;
    setButton("CANCEL");
    setTrack("");
    resetIcons();
    var a = named("kr_art");
    if (a) a.message("hidden", 1);
    var u = currentUrl || "_USE_CLIPBOARD_";
    setStatus(currentUrl ? "ripping..." : "reading clipboard...");
    setDot(DOT_WORKING);
    outlet(0, "rip", u);
}

function bang() { rip(); }

// Defensive: if anything sends raw ints, fire only on press.
function msg_int(n) {
    if (n == 1) rip();
}

// ---- messages from the engine (kripper.mjs) ---------------------------

function status(s) {
    setStatus(String(s));
}

function progress(pct) {
    setStatus("ripping " + pct + "%");
    setDot(DOT_WORKING);
}

function track() {
    setTrack(Array.prototype.slice.call(arguments).join(" "));
}

function art() {
    var p = Array.prototype.slice.call(arguments).join(" ");
    var a = named("kr_art");
    if (!a || !p) return;
    a.message("pic", p);
    a.message("hidden", 0);
}

function source() {
    highlightSource(Array.prototype.slice.call(arguments).join(" "));
}

function cancelled() {
    finishRip();
    setStatus("cancelled");
    setDot(DOT_IDLE);
}

// Engine (re)started — snap the UI back to idle no matter what state it
// was stuck in (e.g. a rip was in flight when the script reloaded).
function reset() {
    finishRip();
    setStatus(IDLE_TEXT);
    setDot(DOT_IDLE);
}

// A newer build is published. Gentle, non-blocking nudge in the status line
// (blue dot) — replaced the moment the user types a URL or rips. Full URL is
// logged to the Max console by the engine.
function update() {
    var v = Array.prototype.slice.call(arguments).join(" ");
    if (ripping) return; // never interrupt a rip
    setStatus("update available · v" + v);
    setDot(DOT_UPDATE);
}

function error() {
    var msg = Array.prototype.slice.call(arguments).join(" ");
    post("[k-ripper] error: " + msg + "\n");
    finishRip();
    setStatus("error: " + msg);
    setDot(DOT_ERROR);
}

function done() {
    var p = Array.prototype.slice.call(arguments).join(" ");
    finishRip();
    if (!p) {
        setStatus("error: empty file path");
        setDot(DOT_ERROR);
        return;
    }
    setStatus("loading into track...");
    loadIntoParentTrack(p);
}

function loadIntoParentTrack(filePath) {
    try {
        var device = new LiveAPI(null, "this_device");
        var trackPath = String(device.unquotedpath);
        trackPath = trackPath.replace(/ devices \d+(?: chains \d+(?: devices \d+)*)*$/, "");

        var track = new LiveAPI(null, trackPath);
        if (track.id == 0) {
            setStatus("error: parent track not found");
            setDot(DOT_ERROR);
            return;
        }

        var hasAudio = track.get("has_audio_input");
        if (!hasAudio || hasAudio[0] != 1) {
            setStatus("error: place on an audio track");
            setDot(DOT_ERROR);
            return;
        }

        var numSlots = track.getcount("clip_slots");
        for (var i = 0; i < numSlots; i++) {
            var slot = new LiveAPI(null, trackPath + " clip_slots " + i);
            var hasClip = slot.get("has_clip");
            if (hasClip && hasClip[0] == 0) {
                slot.call("create_audio_clip", filePath);
                // Disable warp so songs play at native tempo.
                try {
                    var clip = new LiveAPI(null, trackPath + " clip_slots " + i + " clip");
                    clip.set("warping", 0);
                } catch (e) {}
                setStatus("✓ slot " + (i + 1));
                setDot(DOT_OK);
                return;
            }
        }
        setStatus("no empty slots on this track");
        setDot(DOT_ERROR);
    } catch (e) {
        setStatus("API error: " + (e && e.message ? e.message : e));
        setDot(DOT_ERROR);
    }
}

setStatus(IDLE_TEXT);
setDot(DOT_IDLE);
setTrack("");
