#!/usr/bin/env python3
"""Classify ground tiles by surface: python3 -I tools/build_tiles.py <assets_dir>

The game files carry no tile-property table we could find (System/*.CDt is the map editor's brush catalogue), so this is
*inferred*: every VTiles frame is classified from the mean colour of its opaque pixels, with a few id overrides read from
the editor notes (Outside 141-146 = bridge planks, 511 = water, 0 = void).
Cave and Dungeon floors are all treated as stone. Output data/tiles.json: {tileset: {surface: [[lo, hi], ...]}} with surfaces grass | dirt | stone | wood | water | void.
Footstep sound ids per surface are in src/game/surface.ts.
"""
import json
import os
import sys

import numpy as np
from PIL import Image

OVERRIDES = {'outside': {'wood': [(141, 146)], 'water': [(511, 511)], 'void': [(0, 0)]},
             'cave': {'water': [(511, 511)], 'void': [(0, 0)]},
             'dungeon': {'water': [(511, 511)], 'void': [(0, 0)]}}


def classify(rgb):
    r, g, b = [float(v) for v in rgb]
    spread = max(r, g, b) - min(r, g, b)
    if spread <= 0.25 * max(r, g, b, 1):  # (nearly) colourless
        return 'stone'
    if g >= r * 0.85 and g > b * 1.3:
        return 'grass'
    if r > g * 1.12 and g > b:
        return 'dirt'
    return 'stone'


def ranges(ids):
    out = []
    for i in sorted(ids):
        if out and i == out[-1][1] + 1:
            out[-1][1] = i
        else:
            out.append([i, i])
    return out


if __name__ == '__main__':
    root = sys.argv[1]
    result = {}
    for ts in ('outside', 'cave', 'dungeon'):
        j = json.load(open(os.path.join(root, 'atlas', 'scenary', ts, 'vtiles.json')))
        img = np.array(Image.open(os.path.join(root, 'atlas', 'scenary', ts, 'vtiles.png')).convert('RGBA')).astype(float)
        by = {}
        for fid, f in j['frames'].items():
            x, y, w, h = f[:4]
            a = img[y:y + h, x:x + w]
            m = a[..., 3] > 0
            if not m.any():
                continue
            by.setdefault(classify(a[..., :3][m].mean(0)) if ts == 'outside' else 'stone', set()).add(int(fid))  # indoor floors: all stone
        for surf, spans in OVERRIDES[ts].items():
            for lo, hi in spans:
                for s in by.values():
                    s.difference_update(range(lo, hi + 1))
                by.setdefault(surf, set()).update(range(lo, hi + 1))
        result[ts] = {k: ranges(v) for k, v in sorted(by.items())}
        print(ts, {k: sum(b - a + 1 for a, b in v) for k, v in result[ts].items()})
    json.dump(result, open(os.path.join(root, 'data', 'tiles.json'), 'w'))
