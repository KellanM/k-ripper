"""Generate the K-Scope Milestone-0 device patchers as .maxpat JSON, then wrap
the main patch into a loadable .amxd via kripper/make_amxd.py.

ROUND (corrected): real SPECTRUM analysis into a Jitter matrix, using the
verified pattern (Cycling74 Tutorial 27 / jit.poke~ ref):
    cycle~ 440 -> *~ 0.3 -> pfft~ kscope_fft 2048 4
      inside subpatch: fftin~ -> cartopol~ (magnitude) -> jit.poke~ kscope_spec 1 0
                       fftin~ sync (0..1) -> *~ 1024 -> jit.poke~ x-coord (bin)
    qmetro -> jit.matrix kscope_spec 1 float32 1024 -> jit.3m -> log min/mean/max
KEY FIXES vs the failing rounds:
  - jit.poke~ PLANE is 0 (a 1-plane matrix only has plane 0; plane 1 = nowhere).
  - fftin~ sync ramp is normalized 0..1; multiply by FFTsize/2 to get the bin.
No GL yet — that's the next round once max() reads non-zero.

NOTE: matrix name is hard-coded for a single test instance; per the M4L
named-matrix collision gotcha it must become per-instance unique before shipping.

Usage:  python kscope/build_m0.py
"""
from __future__ import annotations
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
APPVERSION = {"major": 8, "minor": 6, "revision": 0, "architecture": "x64", "modernui": 1}


def box(bid, text, x, y, w, numin, numout, outtype=None, extra=None):
    b = {"id": bid, "maxclass": "newobj", "numinlets": numin, "numoutlets": numout,
         "patching_rect": [float(x), float(y), float(w), 22.0], "text": text}
    if outtype is not None:
        b["outlettype"] = outtype
    if extra:
        b.update(extra)
    return {"box": b}


def uiobj(bid, maxclass, x, y, w, h, numin, numout, outtype=None, extra=None):
    b = {"id": bid, "maxclass": maxclass, "numinlets": numin, "numoutlets": numout,
         "patching_rect": [float(x), float(y), float(w), float(h)]}
    if outtype is not None:
        b["outlettype"] = outtype
    if extra:
        b.update(extra)
    return {"box": b}


def line(src, so, dst, di):
    return {"patchline": {"source": [src, so], "destination": [dst, di]}}


def patcher(boxes, lines, present=False, devicewidth=300.0, desc=""):
    return {"patcher": {
        "fileversion": 1, "appversion": APPVERSION, "classnamespace": "box",
        "rect": [100.0, 100.0, 720.0, 520.0], "openinpresentation": 1 if present else 0,
        "default_fontsize": 12.0, "default_fontface": 0, "default_fontname": "Arial",
        "gridonopen": 1, "gridsize": [15.0, 15.0], "gridsnaponopen": 1,
        "objectsnaponopen": 1, "statusbarvisible": 2, "toolbarvisible": 1,
        "lefttoolbarpinned": 0, "toptoolbarpinned": 0, "righttoolbarpinned": 0,
        "bottomtoolbarpinned": 0, "toolbars_unpinned_last_save": 0, "tallnewobj": 0,
        "boxanimatetime": 200, "enablehscroll": 1, "enablevscroll": 1,
        "devicewidth": devicewidth, "description": desc, "digest": "", "tags": "",
        "style": "", "subpatcher_template": "", "assistshowspatchername": 0,
        "boxes": boxes, "lines": lines, "dependency_cache": [], "autosave": 0,
    }}


def build_fft_subpatch():
    boxes = [
        box("f-in", "fftin~ 1", 30, 30, 60, 1, 3, ["signal", "signal", "signal"]),
        box("f-c2p", "cartopol~", 30, 90, 80, 2, 2, ["signal", "signal"]),
        box("f-gain", "*~ 60", 30, 120, 60, 2, 1, ["signal"]),  # amplify for a visible texture
        box("f-binmul", "*~ 1024", 200, 60, 70, 2, 1, ["signal"]),  # sync 0..1 -> bin 0..1024
        box("f-poke", "jit.poke~ kscope_spec 1 0", 30, 160, 180, 2, 0),  # PLANE 0
    ]
    lines = [
        line("f-in", 0, "f-c2p", 0),     # real -> cartopol L
        line("f-in", 1, "f-c2p", 1),     # imag -> cartopol R
        line("f-c2p", 0, "f-gain", 0),   # magnitude -> amplify
        line("f-gain", 0, "f-poke", 0),  # -> poke value (left inlet)
        line("f-in", 2, "f-binmul", 0),  # sync ramp -> scale
        line("f-binmul", 0, "f-poke", 1),  # bin index -> poke x-coord
    ]
    return patcher(boxes, lines)


def build_main():
    boxes = [
        uiobj("o-title", "comment", 20, 20, 200, 20, 1, 0,
              extra={"text": "K-SCOPE M0", "presentation": 1,
                     "presentation_rect": [10.0, 8.0, 160.0, 20.0], "fontsize": 13.0, "fontface": 1}),
        uiobj("o-hint", "comment", 20, 44, 300, 20, 1, 0,
              extra={"text": "spine test - console [kscope] max should be > 0",
                     "presentation": 1, "presentation_rect": [10.0, 30.0, 300.0, 20.0]}),
        box("o-in", "plugin~", 20, 90, 80, 0, 2, ["signal", "signal"]),
        box("o-out", "plugout~", 20, 340, 80, 2, 0),
        box("o-osc", "cycle~ 440", 440, 80, 80, 2, 1, ["signal"]),
        box("o-amp", "*~ 0.3", 440, 110, 60, 2, 1, ["signal"]),
        box("o-pfft", "pfft~ kscope_fft 2048 4", 440, 150, 170, 1, 1, ["signal"]),
        box("o-mtx", "jit.matrix kscope_spec 1 float32 1024", 200, 150, 250, 1, 2, ["jit_matrix", ""]),
        uiobj("o-tgl", "toggle", 200, 90, 24, 24, 1, 1, [""],
              extra={"presentation": 1, "presentation_rect": [180.0, 6.0, 24.0, 24.0]}),
        box("o-lb", "loadbang", 340, 60, 70, 0, 1, ["bang"]),
        box("o-qm", "qmetro 1000", 200, 120, 90, 1, 1, ["bang"]),
        box("o-3m", "jit.3m", 200, 190, 60, 1, 3, ["", "", ""]),
        box("o-pmin", "prepend min", 150, 230, 70, 1, 1, [""]),
        box("o-pmean", "prepend mean", 230, 230, 80, 1, 1, [""]),
        box("o-pmax", "prepend max", 320, 230, 70, 1, 1, [""]),
        box("o-snap", "snapshot~ 1000", 20, 200, 100, 1, 1, ["float"]),
        box("o-prein", "prepend in", 20, 240, 70, 1, 1, [""]),
        box("o-log", "js kscope_log.js", 150, 290, 130, 1, 0),
        # --- GPU display chain (Round 2a: no shader yet) ---
        box("o-trig", "t b b", 320, 120, 50, 1, 2, ["bang", "bang"]),
        box("o-tex", "jit.gl.texture kscope_ctx", 440, 210, 180, 1, 1, ["jit_gl_texture"]),
        box("o-plane", "jit.gl.videoplane kscope_ctx @transform_reset 2", 440, 250, 300, 1, 1, [""]),
        box("o-world", "jit.pworld kscope_ctx", 440, 300, 170, 1, 1, [""],
            extra={"presentation": 1, "presentation_rect": [10.0, 55.0, 280.0, 150.0]}),
    ]
    lines = [
        line("o-in", 0, "o-out", 0),     # L passthrough
        line("o-in", 1, "o-out", 1),     # R passthrough
        line("o-osc", 0, "o-amp", 0),    # internal 440Hz tone
        line("o-amp", 0, "o-pfft", 0),   # analyze the tone
        line("o-lb", 0, "o-tgl", 0),     # autostart qmetro
        line("o-tgl", 0, "o-qm", 0),
        line("o-qm", 0, "o-trig", 0),     # sequence: update matrix, THEN render
        line("o-trig", 1, "o-mtx", 0),    # right (fires first) -> bang the matrix
        line("o-trig", 0, "o-world", 0),  # left (fires second) -> render the GL context
        line("o-mtx", 0, "o-3m", 0),      # matrix -> min/mean/max (console)
        line("o-mtx", 0, "o-tex", 0),     # matrix -> GPU texture
        line("o-tex", 0, "o-plane", 0),   # texture -> videoplane (in the context)
        line("o-3m", 0, "o-pmin", 0),
        line("o-3m", 1, "o-pmean", 0),
        line("o-3m", 2, "o-pmax", 0),
        line("o-pmin", 0, "o-log", 0),
        line("o-pmean", 0, "o-log", 0),
        line("o-pmax", 0, "o-log", 0),
        line("o-amp", 0, "o-snap", 0),   # tone level probe
        line("o-snap", 0, "o-prein", 0),
        line("o-prein", 0, "o-log", 0),
    ]
    return patcher(boxes, lines, present=True, desc="K-Scope M0 spine test (spectrum -> matrix)")


def main():
    (HERE / "K-Scope-M0.maxpat").write_text(json.dumps(build_main(), indent=1), encoding="utf-8")
    (HERE / "kscope_fft.maxpat").write_text(json.dumps(build_fft_subpatch(), indent=1), encoding="utf-8")
    print("wrote K-Scope-M0.maxpat + kscope_fft.maxpat")
    r = subprocess.run(
        [sys.executable, str(ROOT / "kripper" / "make_amxd.py"),
         str(HERE / "K-Scope-M0.maxpat"), str(HERE / "K-Scope-M0.amxd"), "audio_effect"],
        capture_output=True, text=True)
    sys.stdout.write(r.stdout)
    sys.stderr.write(r.stderr)
    return r.returncode


if __name__ == "__main__":
    sys.exit(main())
