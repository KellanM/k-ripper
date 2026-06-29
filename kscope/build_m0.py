"""Generate the K-Scope Milestone-0 device patchers as .maxpat JSON, then wrap
the main patch into a loadable .amxd via kripper/make_amxd.py.

ROUND 1 (this version) = the ANALYSIS HALF only, to isolate risk:
    plugin~ -> plugout~ (passthrough)
    plugin~ L -> pfft~ kscope_fft 2048 4   (subpatcher writes magnitudes to a
                                            named jit.matrix via jit.poke~)
    qmetro -> jit.matrix kscope_spec -> jit.3m -> print kscope   (console readout)
No GPU/GL yet — that's Round 2 once this loads and prints live magnitudes.

Usage:  python kscope/build_m0.py
Outputs: kscope/K-Scope-M0.maxpat, kscope/kscope_fft.maxpat, kscope/K-Scope-M0.amxd
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
    b = {
        "id": bid, "maxclass": "newobj", "numinlets": numin, "numoutlets": numout,
        "patching_rect": [float(x), float(y), float(w), 22.0], "text": text,
    }
    if outtype is not None:
        b["outlettype"] = outtype
    if extra:
        b.update(extra)
    return {"box": b}


def uiobj(bid, maxclass, x, y, w, h, numin, numout, outtype=None, extra=None):
    b = {
        "id": bid, "maxclass": maxclass, "numinlets": numin, "numoutlets": numout,
        "patching_rect": [float(x), float(y), float(w), float(h)],
    }
    if outtype is not None:
        b["outlettype"] = outtype
    if extra:
        b.update(extra)
    return {"box": b}


def line(src, so, dst, di):
    return {"patchline": {"source": [src, so], "destination": [dst, di]}}


def patcher(boxes, lines, present=False, devicewidth=300.0, desc=""):
    p = {
        "fileversion": 1, "appversion": APPVERSION, "classnamespace": "box",
        "rect": [100.0, 100.0, 640.0, 480.0], "openinpresentation": 1 if present else 0,
        "default_fontsize": 12.0, "default_fontface": 0, "default_fontname": "Arial",
        "gridonopen": 1, "gridsize": [15.0, 15.0], "gridsnaponopen": 1,
        "objectsnaponopen": 1, "statusbarvisible": 2, "toolbarvisible": 1,
        "lefttoolbarpinned": 0, "toptoolbarpinned": 0, "righttoolbarpinned": 0,
        "bottomtoolbarpinned": 0, "toolbars_unpinned_last_save": 0, "tallnewobj": 0,
        "boxanimatetime": 200, "enablehscroll": 1, "enablevscroll": 1,
        "devicewidth": devicewidth, "description": desc, "digest": "", "tags": "",
        "style": "", "subpatcher_template": "", "assistshowspatchername": 0,
        "boxes": boxes, "lines": lines,
        "dependency_cache": [], "autosave": 0,
    }
    return {"patcher": p}


# ---- pfft~ subpatcher: fftin~ -> cartopol~ -> jit.poke~ named matrix ----------
def build_fft_subpatch():
    boxes = [
        box("f-in", "fftin~ 1", 30, 30, 60, 1, 3, ["signal", "signal", "signal"]),
        box("f-c2p", "cartopol~", 30, 90, 80, 2, 2, ["signal", "signal"]),
        box("f-poke", "jit.poke~ kscope_spec 1 1", 30, 150, 160, 2, 0),
    ]
    lines = [
        line("f-in", 0, "f-c2p", 0),    # real -> cartopol L
        line("f-in", 1, "f-c2p", 1),    # imag -> cartopol R
        line("f-c2p", 0, "f-poke", 0),  # magnitude -> poke value
        line("f-in", 2, "f-poke", 1),   # bin index -> poke x-coord
    ]
    return patcher(boxes, lines)


# ---- main device: passthrough + analysis + console magnitude readout ---------
def build_main():
    boxes = [
        uiobj("o-title", "comment", 20, 20, 200, 20, 1, 0,
              extra={"text": "K-SCOPE M0", "presentation": 1,
                     "presentation_rect": [10.0, 8.0, 160.0, 20.0],
                     "fontsize": 13.0, "fontface": 1}),
        uiobj("o-hint", "comment", 20, 44, 280, 20, 1, 0,
              extra={"text": "spine test - watch Max console for [kscope] mag",
                     "presentation": 1, "presentation_rect": [10.0, 30.0, 280.0, 20.0]}),
        box("o-in", "plugin~", 20, 90, 80, 0, 2, ["signal", "signal"]),
        box("o-out", "plugout~", 20, 320, 80, 2, 0),
        box("o-osc", "cycle~ 440", 440, 90, 80, 2, 1, ["signal"]),
        box("o-amp", "*~ 0.3", 440, 120, 60, 2, 1, ["signal"]),
        # jit.catch~ captures the signal into its own matrix (no named-matrix
        # sharing) — the standard self-contained audio->matrix bridge.
        box("o-catch", "jit.catch~ 1", 440, 160, 110, 1, 1, ["jit_matrix"]),
        # (named jit.matrix removed — jit.catch~ owns its matrix)
        uiobj("o-tgl", "toggle", 240, 90, 24, 24, 1, 1, [""],
              extra={"presentation": 1, "presentation_rect": [180.0, 6.0, 24.0, 24.0]}),
        box("o-lb", "loadbang", 360, 50, 70, 0, 1, ["bang"]),
        box("o-qm", "qmetro 1000", 240, 120, 80, 1, 1, ["bang"]),
        box("o-3m", "jit.3m", 240, 200, 60, 1, 3, ["", "", ""]),
        box("o-pmin", "prepend min", 180, 240, 70, 1, 1, [""]),
        box("o-pmean", "prepend mean", 260, 240, 80, 1, 1, [""]),
        box("o-pmax", "prepend max", 350, 240, 70, 1, 1, [""]),
        box("o-snap", "snapshot~ 1000", 60, 200, 100, 1, 1, ["float"]),
        box("o-prein", "prepend in", 60, 240, 70, 1, 1, [""]),
        box("o-log", "js kscope_log.js", 150, 290, 130, 1, 0),
    ]
    lines = [
        line("o-in", 0, "o-out", 0),     # L passthrough
        line("o-in", 1, "o-out", 1),     # R passthrough
        line("o-osc", 0, "o-amp", 0),    # internal 440Hz test tone
        line("o-amp", 0, "o-catch", 0),  # tone signal -> jit.catch~
        line("o-lb", 0, "o-tgl", 0),     # autostart
        line("o-tgl", 0, "o-qm", 0),
        line("o-qm", 0, "o-catch", 0),   # bang -> output captured matrix
        line("o-catch", 0, "o-3m", 0),   # matrix -> min/mean/max
        line("o-3m", 0, "o-pmin", 0),    # log ALL three stats to disambiguate
        line("o-3m", 1, "o-pmean", 0),
        line("o-3m", 2, "o-pmax", 0),
        line("o-pmin", 0, "o-log", 0),
        line("o-pmean", 0, "o-log", 0),
        line("o-pmax", 0, "o-log", 0),
        line("o-amp", 0, "o-snap", 0),   # probe the test tone going into the FFT
        line("o-snap", 0, "o-prein", 0),
        line("o-prein", 0, "o-log", 0),  # label "in" -> js post()
    ]
    return patcher(boxes, lines, present=True, desc="K-Scope M0 spine test (analysis half)")


def main():
    (HERE / "K-Scope-M0.maxpat").write_text(json.dumps(build_main(), indent=1), encoding="utf-8")
    (HERE / "kscope_fft.maxpat").write_text(json.dumps(build_fft_subpatch(), indent=1), encoding="utf-8")
    print("wrote K-Scope-M0.maxpat + kscope_fft.maxpat")
    r = subprocess.run(
        [sys.executable, str(ROOT / "kripper" / "make_amxd.py"),
         str(HERE / "K-Scope-M0.maxpat"), str(HERE / "K-Scope-M0.amxd"), "audio_effect"],
        capture_output=True, text=True,
    )
    sys.stdout.write(r.stdout)
    sys.stderr.write(r.stderr)
    return r.returncode


if __name__ == "__main__":
    sys.exit(main())
