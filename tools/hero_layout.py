"""Finds the block order of the three hero packs by silhouette continuity.

Inside one direction's run of an animation consecutive frames differ little; between two directions (or two animations) they
jump.  For every permutation of the class's animation blocks (8 directions each, Morir last with 4) the mean jump at the
predicted boundaries minus the mean jump elsewhere is scored; the best order is printed.  Usage: python3 tools/hero_layout.py
"""
import itertools, json, os, sys
import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets')
anims = json.load(open(os.path.join(ROOT, 'data', 'anims.json')))['actors']
ini = json.load(open(os.path.join(ROOT, 'data', 'actors.json')))


def jumps(pack, foot, n):
    j = json.load(open(f'{ROOT}/p16/actors/{pack}.json'))
    im = Image.open(f'{ROOT}/p16/actors/{pack}.png').convert('RGBA')
    W, H = 420, 420
    feats = []
    for i in range(1, n + 1):
        x, y, w, h, hx, hy = j['frames'][str(i)]
        c = Image.new('RGBA', (W, H))
        c.paste(im.crop((x, y, x + w, y + h)), (int(W / 2 + foot[0] - hx), int(H * 0.8 + foot[1] - hy)))
        feats.append(np.array(c)[:, :, 3] > 0)
    return np.array([(feats[i] ^ feats[i + 1]).sum() / max(1, (feats[i] | feats[i + 1]).sum()) for i in range(n - 1)])


def score(d, order, sizes):
    pos, bounds = 0, []
    for name in order:
        n, dirs = sizes[name]
        for _ in range(dirs):
            pos += n
            bounds.append(pos)  # frames [pos-n, pos) are one run; the jump to the next run is d[pos-1]
    b = np.array([p - 1 for p in bounds[:-1]])
    mask = np.ones(len(d), bool)
    mask[b] = False
    return d[b].mean() - d[mask].mean()


for aid in ('100', '101', '102'):
    a = anims[aid]
    n = a['frames']
    d = jumps(a['pack'], a['foot'], n)
    sizes = {k: (v['frames'], v.get('dirs', 8)) for k, v in a['anims'].items()}
    sizes = {k: (f, 4 if k == 'Morir' else 8) for k, (f, _) in sizes.items()}
    names = [k for k in sizes if k != 'Morir']
    current = [k for k in a['anims'] if k != 'Morir'] + ['Morir']
    best = None
    for perm in itertools.permutations(names):
        # identical frame counts are interchangeable for the score: keep one representative
        s = score(d, list(perm) + ['Morir'], sizes)
        if best is None or s > best[0] + 1e-12:
            best = (s, perm)
    print(aid, a['title'], 'current order score %.3f' % score(d, current, sizes), '| best %.3f' % best[0], list(best[1]) + ['Morir'])
