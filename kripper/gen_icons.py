"""Render platform indicator icons for K-Ripper's "supported platforms" row.

Reads brand SVGs from a local folder (sourced by the user — by default
C:/Qoral/Projects/Misc/Logos), parses each path, samples curves to polygons,
and composites with an even-odd fill rule so cutouts (camera lens, play
triangle) render correctly. Output PNGs go to assets/icon_<slug>.png at the
target brand color + opacity.

Run from kripper/ — produces assets/icon_*.png.
"""

from __future__ import annotations

import re
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw
from svg.path import Move, parse_path

OUT = Path(__file__).parent / "assets"
OUT.mkdir(parents=True, exist_ok=True)

# Source folder for the SVG files the user dropped in.
LOGOS_DIR = Path(r"C:/Qoral/Projects/Misc/Logos")

# Each entry: (filename short, SVG basename in LOGOS_DIR, RGB brand color).
# TikTok's canonical single-color is black, which disappears on the dark
# device background, so the magenta brand accent is used instead.
PLATFORMS = [
    ("sc", "soundcloud", (255,  85,   0)),
    ("yt", "youtube",    (255,   0,   0)),
    ("bc", "bandcamp",   ( 64, 130, 148)),
    ("mc", "mixcloud",   ( 80,   0, 255)),
    ("tt", "tiktok",     (254,  44,  85)),
    ("tw", "twitch",     (145,  70, 255)),
    ("vm", "vimeo",      ( 26, 183, 234)),
    ("rd", "reddit",     (255,  69,   0)),
]

# Final raster size (Max displays them at 20×20; 2× source for crispness).
SIZE = 40
# Two variants per platform: the dim resting state (~35% opacity) and a
# "lit" state shown when the device recognizes a pasted URL's platform.
VARIANTS = [("", 90), ("_lit", 235)]


def load_svg(name: str) -> str:
    path = LOGOS_DIR / f"{name}.svg"
    if not path.exists():
        raise FileNotFoundError(f"missing source SVG: {path}")
    return path.read_text(encoding="utf-8")


def extract_path_d(svg: str) -> str | None:
    m = re.search(r'<path[^>]*\sd="([^"]+)"', svg)
    return m.group(1) if m else None


def extract_viewbox(svg: str) -> tuple[float, float, float, float]:
    m = re.search(r'viewBox="([^"]+)"', svg)
    if m:
        parts = [float(x) for x in m.group(1).replace(",", " ").split()]
        return tuple(parts)  # type: ignore[return-value]
    return (0.0, 0.0, 24.0, 24.0)


def subpaths_to_polygons(d: str, samples_per_curve: int = 40) -> list[list[tuple[float, float]]]:
    """Walk the SVG path, breaking into subpaths whenever a Move appears."""
    path = parse_path(d)
    polys: list[list[tuple[float, float]]] = []
    current: list[tuple[float, float]] = []
    for seg in path:
        if isinstance(seg, Move):
            if len(current) >= 3:
                polys.append(current)
            current = [(seg.end.real, seg.end.imag)]
        else:
            for i in range(1, samples_per_curve + 1):
                t = i / samples_per_curve
                p = seg.point(t)
                current.append((p.real, p.imag))
    if len(current) >= 3:
        polys.append(current)
    return polys


def render(svg_content: str, size: int, color: tuple[int, int, int, int]) -> Image.Image:
    d = extract_path_d(svg_content)
    if not d:
        raise ValueError("no <path d=...> found")
    vminx, vminy, vw, vh = extract_viewbox(svg_content)
    sx = size / vw
    sy = size / vh

    polys = subpaths_to_polygons(d)

    # Even-odd fill via XOR of subpath masks → handles cutouts correctly.
    combined = Image.new("1", (size, size), 0)
    for poly in polys:
        scaled = [((p[0] - vminx) * sx, (p[1] - vminy) * sy) for p in poly]
        sub = Image.new("1", (size, size), 0)
        ImageDraw.Draw(sub).polygon(scaled, fill=1)
        combined = ImageChops.logical_xor(combined, sub)

    # Convert to L-mode alpha mask, then paint with the requested color.
    alpha_mask = combined.convert("L").point(lambda v: 255 if v else 0)
    fill_layer = Image.new("RGBA", (size, size), color)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(fill_layer, mask=alpha_mask)
    return out


def main() -> None:
    for short, name, rgb in PLATFORMS:
        try:
            svg = load_svg(name)
            for suffix, alpha in VARIANTS:
                img = render(svg, SIZE, (*rgb, alpha))
                path = OUT / f"icon_{short}{suffix}.png"
                img.save(path)
                print(f"  {name:12s}  ->  {path.name}  ({path.stat().st_size} bytes)")
        except Exception as e:
            print(f"  {name:12s}  FAILED: {e}")


if __name__ == "__main__":
    main()
