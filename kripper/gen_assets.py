"""Generate K-Ripper's Frutiger Aero UI assets.

Produces:
  assets/bg.png      — main device background (sky + horizon + ground)
  assets/button.png  — glassy "RIP" button
  assets/bubbles.png — decorative translucent bubbles for personality

Run from kripper/ root. Re-run after editing palette values.
"""

from __future__ import annotations

from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).parent / "assets"
OUT.mkdir(parents=True, exist_ok=True)


def vertical_gradient(width: int, height: int, stops: list[tuple[float, tuple[int, int, int]]]) -> Image.Image:
    """Build a vertical RGB gradient. stops: list of (0..1 position, (r,g,b))."""
    strip = Image.new("RGB", (1, height))
    px = strip.load()
    for y in range(height):
        t = y / max(1, height - 1)
        for i in range(len(stops) - 1):
            p1, c1 = stops[i]
            p2, c2 = stops[i + 1]
            if p1 <= t <= p2:
                u = (t - p1) / (p2 - p1) if p2 > p1 else 0.0
                r = int(c1[0] + (c2[0] - c1[0]) * u)
                g = int(c1[1] + (c2[1] - c1[1]) * u)
                b = int(c1[2] + (c2[2] - c1[2]) * u)
                px[0, y] = (r, g, b)
                break
    return strip.resize((width, height), Image.BILINEAR)


def make_bg(width: int = 420, height: int = 200) -> None:
    # Authentic Aero sky → glossy horizon → fresh teal ground.
    sky = vertical_gradient(width, height, [
        (0.00, (255, 255, 255)),   # very top: pure white
        (0.18, (215, 238, 255)),   # high sky
        (0.50, (102, 179, 255)),   # mid sky: vivid Aero blue
        (0.555, (255, 255, 255)),  # horizon flash (thin white)
        (0.62, (147, 218, 207)),   # post-horizon: fresh teal
        (0.85, (95, 175, 195)),    # mid ground
        (1.00, (60, 120, 175)),    # bottom: deeper aqua
    ]).convert("RGBA")

    # Top gloss highlight: extra white sweep across the top quarter
    gloss = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    gpx = gloss.load()
    for y in range(height // 4):
        a = int(80 * (1 - y / (height // 4)) ** 2)
        for x in range(width):
            gpx[x, y] = (255, 255, 255, a)
    sky = Image.alpha_composite(sky, gloss)

    # Round the corners so it fits a panel nicely.
    mask = Image.new("L", (width, height), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, width - 1, height - 1], radius=8, fill=255)
    out = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    out.paste(sky, mask=mask)

    out.save(OUT / "bg.png")


def make_button(width: int = 110, height: int = 32, accent: str = "blue") -> None:
    # Aqua-style glass: blue (or green) gradient base + strong top specular.
    palettes = {
        "blue": [
            (0.00, (135, 195, 245)),
            (0.50, (75, 150, 230)),
            (1.00, (50, 110, 200)),
        ],
        "green": [
            (0.00, (175, 235, 155)),
            (0.50, (115, 200, 100)),
            (1.00, (75, 160, 70)),
        ],
    }
    base = vertical_gradient(width, height, palettes[accent]).convert("RGBA")

    # Specular highlight: bright white→transparent on top half
    gloss = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    gpx = gloss.load()
    half = height // 2
    for y in range(half):
        a = int(180 * (1 - y / half) ** 1.5)
        for x in range(width):
            gpx[x, y] = (255, 255, 255, a)
    glass = Image.alpha_composite(base, gloss)

    # Pill mask
    mask = Image.new("L", (width, height), 0)
    radius = height // 2
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, width - 1, height - 1], radius=radius, fill=255)
    out = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    out.paste(glass, mask=mask)

    # Inner darker stroke for definition
    border = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    bd = ImageDraw.Draw(border)
    bd.rounded_rectangle([0, 0, width - 1, height - 1], radius=radius,
                          outline=(20, 70, 140, 200) if accent == "blue" else (30, 100, 40, 200),
                          width=1)
    out = Image.alpha_composite(out, border)

    suffix = "" if accent == "blue" else f"-{accent}"
    out.save(OUT / f"button{suffix}.png")


def make_bubbles(width: int = 200, height: int = 80) -> None:
    img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    bd = ImageDraw.Draw(img)
    # Cluster of varying-size translucent bubbles
    bubbles = [
        (30, 50, 22), (70, 25, 11), (100, 55, 14),
        (135, 18, 7), (160, 42, 9), (185, 20, 4),
    ]
    for cx, cy, r in bubbles:
        # Main bubble — soft translucent white
        bd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 255, 255, 60))
        # Outer thin ring for definition
        bd.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(255, 255, 255, 130), width=1)
        # Specular highlight (upper-left quadrant)
        hr = max(2, r // 2)
        hx, hy = cx - r // 2, cy - r // 2
        bd.ellipse([hx - hr // 2, hy - hr // 2, hx + hr // 2, hy + hr // 2],
                   fill=(255, 255, 255, 200))
    img.save(OUT / "bubbles.png")


def main() -> None:
    make_bg()
    make_button(accent="blue")
    make_button(accent="green")
    make_bubbles()
    print(f"wrote: {sorted(p.name for p in OUT.iterdir())}")


if __name__ == "__main__":
    main()
