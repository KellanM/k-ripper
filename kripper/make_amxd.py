"""Convert a Max .maxpat patcher into a binary .amxd file that Live can load
directly (no manual paste in the Max editor required).

Binary layout (little-endian):
    "ampf"
    u32        constant 4
    "aaaa"
    "meta"
    u32        meta chunk payload size = 4
    u32        device type (1=audio effect, 2=MIDI effect, 3=instrument)
    "ptch"
    u32        patcher JSON byte length
    <JSON>     the .maxpat content, verbatim

Usage:
    python make_amxd.py <input.maxpat> <output.amxd> [device_type]
"""

from __future__ import annotations

import struct
import sys
from pathlib import Path

DEVICE_TYPES = {"audio_effect": 1, "midi_effect": 2, "instrument": 3}


def convert(maxpat: Path, amxd: Path, device_type: int = 1) -> None:
    # Max for Live's JSON parser expects CRLF line endings inside the ptch
    # chunk — LF-only patcher content loads silently as an empty device.
    raw = maxpat.read_bytes()
    json_bytes = raw.replace(b"\r\n", b"\n").replace(b"\n", b"\r\n")
    with amxd.open("wb") as f:
        f.write(b"ampf")
        f.write(struct.pack("<I", 4))
        f.write(b"aaaa")
        f.write(b"meta")
        f.write(struct.pack("<I", 4))
        f.write(struct.pack("<I", device_type))
        f.write(b"ptch")
        f.write(struct.pack("<I", len(json_bytes)))
        f.write(json_bytes)


def main() -> int:
    if len(sys.argv) < 3:
        sys.stderr.write(__doc__)
        return 1
    src = Path(sys.argv[1])
    dst = Path(sys.argv[2])
    dtype = DEVICE_TYPES.get(sys.argv[3], 1) if len(sys.argv) > 3 else 1
    convert(src, dst, dtype)
    print(f"wrote {dst} ({dst.stat().st_size} bytes, device_type={dtype})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
