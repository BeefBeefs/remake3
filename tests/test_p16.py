"""P16 decoder check: python3 -I tests/test_p16.py <game_dir>   (skips when the original files are absent)."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tools'))
from p16 import P16  # noqa: E402

game = sys.argv[1] if len(sys.argv) > 1 else os.environ.get('NST_GAME_DIR', 'game')
if not os.path.isdir(game):
    print('skip: no game dir'); sys.exit(0)

packs = frames = 0
for root, _, files in os.walk(game):
    for f in files:
        if f.lower().endswith('.p16') and os.path.getsize(os.path.join(root, f)) > 0x2ff8:
            try:
                p = P16(os.path.join(root, f))
            except ValueError:
                continue  # System/*.p16 are gzip-wrapped, not raw packs
            for fid in p.ids():
                p.frame(fid)  # raises on any malformed row / missing terminator
                frames += 1
            packs += 1
assert packs >= 130 and frames > 50000, (packs, frames)
b = P16(os.path.join(game, 'Actors', '000-Barbarian.P16'))
assert len(b.ids()) == 564
print(f'ok: {packs} packs, {frames} frames')
