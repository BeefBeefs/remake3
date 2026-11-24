#!/usr/bin/env python3
"""Recompute every actor's `foot` in public/assets/data/anims.json from the sprite pixels.

An actor frame is drawn with its bitmap's top-left corner at  P - (hx - foot.x, hy - foot.y)  (screen px, y down),
P being the actor's position: the hotspot is SUBTRACTED. foot = median over the idle / walk frames of
(hx - legs_x, hy - bottom_row), where legs_x is the middle of the lowest 9 pixel rows and bottom_row the lowest opaque
row of the bitmap. With this rule the body stays on one spot whichever direction it faces and whatever the sword does
(the old `hx + w/2` rule moved the Barbarian by up to 40 px when it turned).

usage: tools/fix_feet.py [public/assets]
"""
import json, os, sys
import numpy as np
from PIL import Image

root = sys.argv[1] if len(sys.argv) > 1 else 'public/assets'
path = os.path.join(root, 'data', 'anims.json')
data = json.load(open(path))
cache = {}


def load(pack):
    if pack not in cache:
        base = os.path.join(root, 'p16', 'actors', pack.lower())
        if not os.path.exists(base + '.json'):
            cache[pack] = None
        else:
            cache[pack] = (json.load(open(base + '.json'))['frames'], np.array(Image.open(base + '.png').convert('RGBA'))[:, :, 3] > 0)
    return cache[pack]


def measure(frames, alpha, i):
    r = frames.get(str(i))
    if not r or not r[2] or len(r) < 6:
        return None
    x, y, w, h, hx, hy = r[:6]
    a = alpha[y:y + h, x:x + w]
    rows = np.where(a.any(1))[0]
    if not len(rows):
        return None
    bot = int(rows.max())
    xs = np.where(a[max(0, bot - 8):bot + 1].any(0))[0]
    return hx - (xs.min() + xs.max()) / 2, hy - bot


changed = 0
for aid, act in data['actors'].items():
    pk = load(act['pack'])
    if not pk:
        continue
    frames, alpha = pk
    anims = act['anims']
    pts = []
    for name in ('Respirar', 'Andar'):
        a = anims.get(name)
        if not a:
            continue
        n = 4 if a.get('dirs') == 4 else 8
        for i in range(a['start'], a['start'] + n * a['frames']):
            m = measure(frames, alpha, i)
            if m:
                pts.append(m)
        if pts:
            break
    if not pts:
        continue
    foot = [float(np.median([p[0] for p in pts])), float(np.median([p[1] for p in pts]))]
    if foot != act.get('foot'):
        act['foot'] = foot
        changed += 1
json.dump(data, open(path, 'w'), indent=1)
print('feet updated for', changed, 'actors')
