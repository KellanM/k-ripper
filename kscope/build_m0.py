"""Generate the K-Scope Milestone-0 device patchers as .maxpat JSON, then wrap
the main patch into a loadable .amxd via kripper/make_amxd.py.

DISPLAY = jsui/mgraphics (CPU draw — the spec's fallback renderer; authorable +
self-debuggable). Data path (PROVEN working): cycle~440 -> *~0.3 -> pfft~ ->
cartopol~ magnitude -> jit.poke~ kscope_spec PLANE 0 (x-coord = scaled fftin~
sync). The named matrix kscope_spec is read directly by kscope_ui.js (jsui) and
drawn as a log-frequency filled spectrum.

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


def patcher(boxes, lines, present=False, devicewidth=540.0, desc=""):
    return {"patcher": {
        "fileversion": 1, "appversion": APPVERSION, "classnamespace": "box",
        "rect": [100.0, 100.0, 760.0, 540.0], "openinpresentation": 1 if present else 0,
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
        box("f-binmul", "*~ 1024", 200, 60, 70, 2, 1, ["signal"]),       # sync 0..1 -> bin
        box("f-poke", "jit.poke~ kscope_spec 1 0", 30, 150, 180, 2, 0),  # PLANE 0
    ]
    lines = [
        line("f-in", 0, "f-c2p", 0),
        line("f-in", 1, "f-c2p", 1),
        line("f-c2p", 0, "f-poke", 0),     # magnitude -> poke value
        line("f-in", 2, "f-binmul", 0),
        line("f-binmul", 0, "f-poke", 1),  # bin index -> poke x-coord
    ]
    return patcher(boxes, lines)


def build_main():
    DW = 540
    boxes = [
        # ---- presentation UI ----
        uiobj("o-title", "comment", 20, 20, 200, 22, 1, 0,
              extra={"text": "K-SCOPE", "presentation": 1,
                     "presentation_rect": [16.0, 10.0, 160.0, 22.0],
                     "fontsize": 15.0, "fontface": 1, "textcolor": [0.91, 0.30, 0.18, 1.0]}),
        uiobj("o-ui", "jsui", 20, 250, 360, 180, 1, 1, [""],
              extra={"filename": "kscope_ui.js", "presentation": 1,
                     "presentation_rect": [12.0, 40.0, float(DW - 24), 196.0]}),
        uiobj("o-tgl", "toggle", 400, 20, 24, 24, 1, 1, [""],
              extra={"presentation": 1, "presentation_rect": [float(DW - 30), 12.0, 18.0, 18.0]}),
        # ---- audio + analysis (internal) ----
        box("o-in", "plugin~", 20, 70, 80, 0, 2, ["signal", "signal"]),
        box("o-out", "plugout~", 20, 470, 80, 2, 0),
        box("o-osc", "cycle~ 440", 440, 70, 80, 2, 1, ["signal"]),
        box("o-amp", "*~ 0.3", 440, 100, 60, 2, 1, ["signal"]),
        box("o-pfft", "pfft~ kscope_fft 2048 4", 440, 130, 170, 1, 1, ["signal"]),
        box("o-mtx", "jit.matrix kscope_spec 1 float32 1024", 200, 130, 250, 1, 2, ["jit_matrix", ""]),
        # ---- clocks ----
        box("o-lb", "loadbang", 120, 90, 70, 0, 1, ["bang"]),
        box("o-qm", "qmetro 33", 120, 130, 80, 1, 1, ["bang"]),         # ~30fps redraw
        box("o-dbgm", "metro 1000", 240, 90, 80, 1, 1, ["bang"]),
        box("o-dbgmsg", "dbg", 240, 120, 40, 2, 1, [""], extra={"maxclass": "message"}),
    ]
    lines = [
        line("o-in", 0, "o-out", 0),     # passthrough L
        line("o-in", 1, "o-out", 1),     # passthrough R
        line("o-osc", 0, "o-amp", 0),    # internal 440Hz tone
        line("o-amp", 0, "o-pfft", 0),   # analyze
        line("o-lb", 0, "o-tgl", 0),     # autostart
        line("o-tgl", 0, "o-qm", 0),
        line("o-tgl", 0, "o-dbgm", 0),
        line("o-qm", 0, "o-mtx", 0),     # bang the named matrix
        line("o-mtx", 0, "o-ui", 0),     # jit_matrix -> jsui reads + redraws
        line("o-dbgm", 0, "o-dbgmsg", 0),
        line("o-dbgmsg", 0, "o-ui", 0),  # "dbg" -> jsui logs max+size to console
    ]
    return patcher(boxes, lines, present=True, devicewidth=float(DW),
                   desc="K-Scope M0 spectrum (jsui)")


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
