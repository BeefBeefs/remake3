#!/usr/bin/env python3
"""Orientation of the Outside ground transition tiles (VTiles 156-191, dirt fading into grass).

The maps lay these tiles out next to each other regardless of what the pictures show, so along every shared edge the
dirt / grass pattern of a tile must continue into its neighbour. For each transition tile this tries the picture as
stored and mirrored left-right (x), top-bottom (y) and both (xy), and keeps the choice that minimises the dirt/grass
mismatch over all shared edges of all Outside campaign maps (coordinate descent, random restarts). A tile is only
changed when it gains clearly and two disjoint halves of the maps choose the same way.
Measured: mismatch 0.338 -> 0.240; the two halves agree on 31-34 of the 36 tiles.

Output: public/assets/data/tile_orient.json  {"outside": {"<id>": "x"|"y"|"xy"}}
usage: tools/tile_orient.py [public/assets]
"""
import collections, glob, gzip, json, os, random, struct, sys
import numpy as np
from PIL import Image

root = sys.argv[1] if len(sys.argv) > 1 else 'public/assets'
H, W = 31, 64
LO, HI = 156, 191
KS = ['id', 'x', 'y', 'xy']
TR = {'id': lambda a: a, 'x': lambda a: a[:, ::-1], 'y': lambda a: a[::-1], 'xy': lambda a: a[::-1, ::-1]}
V = {'T': (31.5, 0), 'R': (63, 15), 'B': (31.5, 30), 'L': (0, 15)}
EDGES = {'NE': ('T', 'R'), 'SE': ('R', 'B'), 'SW': ('B', 'L'), 'NW': ('L', 'T')}
STEPS = ((1, 0, 'SE', 'NW'), (0, 1, 'SW', 'NE'))  # cell -> neighbour, my edge, its facing edge

atlas = json.load(open(os.path.join(root, 'atlas/scenary/outside/vtiles.json')))['frames']
png = np.array(Image.open(os.path.join(root, 'atlas/scenary/outside/vtiles.png')).convert('RGB')).astype(float)
yy, xx = np.mgrid[0:H, 0:W]
inside = (np.abs(xx - 31.5) / 32 + np.abs(yy - 15) / 15.5) <= 0.97


def img(t):
    x, y, w, h = atlas[str(t)][:4]
    a = png[y:y + h, x:x + w]
    return a if a.shape[:2] == (H, W) else np.array(Image.fromarray(a.astype('uint8')).resize((W, H), Image.NEAREST)).astype(float)


dirt = np.mean([img(t)[inside].mean(0) for t in range(147, 156)], 0)
grass = np.mean([img(t)[inside].mean(0) for t in range(330, 341)], 0)


def dirt_mask(t):
    a = img(t)
    return ((np.linalg.norm(a - dirt, axis=2) < np.linalg.norm(a - grass, axis=2)) & inside).astype(float)


def profile(m):
    out = {}
    for name, (pn, qn) in EDGES.items():
        p, q = V[pn], V[qn]
        prof = []
        for s0 in range(8):
            vals = []
            for s in np.linspace(s0 / 8 + 0.02, (s0 + 1) / 8 - 0.02, 4):
                for inset in (0.04, 0.09, 0.14):
                    x = p[0] + (q[0] - p[0]) * s + (31.5 - (p[0] + (q[0] - p[0]) * s)) * inset
                    y = p[1] + (q[1] - p[1]) * s + (15 - (p[1] + (q[1] - p[1]) * s)) * inset
                    vals.append(m[int(round(min(max(y, 0), H - 1))), int(round(min(max(x, 0), W - 1)))])
            prof.append(np.mean(vals))
        out[name] = np.array(prof)
    return out


ids_all = sorted(int(k) for k in atlas if k.isdigit() and 147 <= int(k) <= 191 or k.isdigit() and 330 <= int(k) <= 407)
PROF = {(t, k): profile(TR[k](dirt_mask(t))) for t in ids_all for k in KS}


def seam(a, ka, b, kb, sa, sb):
    return float(np.abs(PROF[(a, ka)][sa] - PROF[(b, kb)][sb][::-1]).mean())


def outside_maps():
    out = []
    for p in sorted(glob.glob(os.path.join(root, 'maps', '**', '*.map'), recursive=True)):
        d = gzip.open(p).read()
        if d[4:0x44].split(b'\0')[0].decode().lower() == 'outside':
            out.append(np.array([struct.unpack_from('<I', d, 0x4000 + i * 12)[0] & 0xFFFF for i in range(65536)]).reshape(256, 256))
    return out


def collect(maps):
    have = set(ids_all)
    pairs = collections.Counter()
    for m in maps:
        for dx, dy, sa, sb in STEPS:
            a = m[: 256 - dy, : 256 - dx].ravel().tolist()
            b = m[dy:, dx:].ravel().tolist()
            for x, y in zip(a, b):
                if x in have and y in have and (LO <= x <= HI or LO <= y <= HI):
                    pairs[(x, y, sa, sb)] += 1
    return pairs


def cost(pairs, ch):
    return sum(n * seam(a, ch.get(a, 'id'), b, ch.get(b, 'id'), sa, sb) for (a, b, sa, sb), n in pairs.items()) / max(1, sum(pairs.values()))


def fit(pairs, restarts=30, seed=1):
    rnd = random.Random(seed)
    byt = collections.defaultdict(list)
    for (a, b, sa, sb), n in pairs.items():
        byt[a].append((a, b, sa, sb, n))
        if b != a:
            byt[b].append((a, b, sa, sb, n))
    mine = [t for t in range(LO, HI + 1) if t in byt]
    best = None
    for r in range(restarts):
        ch = {t: ('id' if r == 0 else rnd.choice(KS)) for t in mine}

        def total(t, k):
            return sum(n * seam(a, k if a == t else ch.get(a, 'id'), b, k if b == t else ch.get(b, 'id'), sa, sb) for a, b, sa, sb, n in byt[t])

        for _ in range(12):
            moved = 0
            for t in mine:
                cs = {k: total(t, k) for k in KS}
                bk = min(cs, key=cs.get)
                if cs[bk] < cs[ch[t]] - 1e-9:
                    ch[t] = bk
                    moved += 1
            if not moved:
                break
        c = cost(pairs, ch)
        if best is None or c < best[0] - 1e-12:
            best = (c, dict(ch), byt)
    return best


maps = outside_maps()
halves = [collect(maps[0::2]), collect(maps[1::2])]
allp = collect(maps)
sols = [fit(p) for p in halves]
c_all, ch, byt = fit(allp)
print(len(maps), 'maps; mismatch identity %.3f -> %.3f' % (cost(allp, {}), c_all))
keep = {}
for t, k in ch.items():
    if k == 'id' or not all(s[1].get(t) == k for s in sols):
        continue
    # gain of this tile alone over leaving it as stored, others as solved
    def tot(kk):
        c2 = dict(ch)
        c2[t] = kk
        return sum(n * seam(a, c2.get(a, 'id'), b, c2.get(b, 'id'), sa, sb) for a, b, sa, sb, n in byt[t]) / max(1, sum(n for *_, n in byt[t]))
    if tot('id') - tot(k) > 0.02:
        keep[t] = k
print('flipped', len(keep), 'of', HI - LO + 1, 'transition tiles:', {t: keep[t] for t in sorted(keep)})
os.makedirs(os.path.join(root, 'data'), exist_ok=True)
json.dump({'outside': {str(t): keep[t] for t in sorted(keep)}}, open(os.path.join(root, 'data', 'tile_orient.json'), 'w'), indent=1)
