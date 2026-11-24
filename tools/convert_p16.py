#!/usr/bin/env python3
"""Convert NightStone .P16 sprite packs to PNG atlas + JSON.

usage: python3 -I tools/convert_p16.py <game_dir> <out_dir>

JSON: {image, size:[w,h], ref:[rx,ry], frames:{id:[x,y,w,h,hx,hy]}}
  (hx,hy) is the pack's raw hotspot offset of the bitmap's top-left corner; `ref` is the pack-wide median of
  (hx + w/2, hy + h) = where the feet / base sit in that coordinate system. To place a sprite with its feet at
  screen point P:  topLeft = P + (hx - ref.x, hy - ref.y).
"""
import json
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from p16 import P16, rgba  # noqa: E402

PACKS = {
    'scenary/outside/pack1': 'Scenary/OutSide/Pack1.P16',
    'scenary/outside/pack2': 'Scenary/OutSide/Pack2.P16',
    'scenary/outside/pack3': 'Scenary/OutSide/Pack3.P16',
    'scenary/outside/packcell': 'Scenary/OutSide/PackCell.P16',
    'scenary/cave/pack1': 'Scenary/Cave/Pack1.P16',
    'scenary/cave/pack2': 'Scenary/Cave/Pack2.P16',
    'scenary/cave/pack3': 'Scenary/Cave/Pack3.P16',
    'scenary/cave/packcell': 'Scenary/Cave/PackCell.P16',
    'scenary/dungeon/pack1': 'Scenary/Dungeon/Pack1.P16',
    'scenary/dungeon/pack2': 'Scenary/Dungeon/Pack2.P16',
    'scenary/dungeon/pack3': 'Scenary/Dungeon/Pack3.P16',
    'scenary/dungeon/packcell': 'Scenary/Dungeon/PackCell.P16',
    'actors/barbarian0': 'Actors/000-Barbarian.P16',
    'actors/barbarian2': 'Actors/002-Barbarian.P16',
    'actors/sorceress0': 'Actors/000-Sorceress.P16',
    'actors/sorceress1': 'Actors/001-Sorceress.P16',
    'actors/amazon0': 'Actors/000-Amazon.P16',
    'actors/amazon1': 'Actors/001-Amazon.P16',
    'actors/rat': 'Actors/Rat.P16',
    'actors/spider': 'Actors/Spider.P16',
    'actors/stone': 'Actors/Stone.P16',
}
ATLAS_W = 2048
PACK_SLOPES = True  # 7th frame field for narrow slices (see edge_slope)


def edge_slope(rgba):
    """Narrow wall slices (<= 34 px wide) lean along one isometric diagonal: the bottom edge of the right-hand columns
    sits lower (+1: runs down-right) or higher (-1: runs down-left) than that of the left-hand ones. 0 = flat/unknown."""
    a = rgba[..., 3] > 0
    w = a.shape[1]
    if w < 8 or not a.any():
        return 0
    def bottom(col):
        r = np.where(a[:, col])[0]
        return int(r.max()) if len(r) else None
    l, r = bottom(2), bottom(w - 3)
    if l is None or r is None or abs(r - l) < 4:
        return 0
    return 1 if r > l else -1


def shelf_pack(sizes):
    """sizes: {id:(w,h)} -> ({id:(x,y)}, atlas_h). Tallest-first shelf packing with 1px gutters."""
    pos, x, y, row_h = {}, 0, 0, 0
    for fid, (w, h) in sorted(sizes.items(), key=lambda kv: (-kv[1][1], kv[0])):
        if x + w + 1 > ATLAS_W:
            x, y, row_h = 0, y + row_h + 1, 0
        pos[fid] = (x, y)
        x += w + 1
        row_h = max(row_h, h)
    return pos, y + row_h


def convert(src, dst_base, quantize=False):
    p = P16(src)
    frames = {}
    sizes = {}
    imgs = {}
    for fid in p.ids():
        px, _ = p.frame(fid)
        imgs[fid] = rgba(px)
        sizes[fid] = (px.shape[1], px.shape[0])
    pos, hgt = shelf_pack(sizes)
    H = 1
    while H < max(hgt, 1):
        H *= 2
    atlas = np.zeros((H, ATLAS_W, 4), np.uint8)
    for fid, (x, y) in pos.items():
        w, h = sizes[fid]
        atlas[y:y + h, x:x + w] = imgs[fid]
        frames[str(fid)] = [x, y, w, h, int(p.x[fid - 1]), int(p.y[fid - 1])]
        if w <= 34 and h >= 40 and PACK_SLOPES:
            frames[str(fid)].append(edge_slope(imgs[fid]))
    fx = [p.x[i - 1] + p.w[i - 1] / 2 for i in p.ids()]
    fy = [p.y[i - 1] + p.h[i - 1] for i in p.ids()]
    ref = [float(np.median(fx)), float(np.median(fy))] if fx else [0.0, 0.0]
    os.makedirs(os.path.dirname(dst_base), exist_ok=True)
    im = Image.fromarray(atlas)
    if quantize:  # 256-colour palette + 1-bit transparency: ~3x smaller, visually the same for these sprites
        im = im.quantize(255, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
        pal = im.getpalette()[:255 * 3] + [0, 0, 0]
        a = np.asarray(Image.fromarray(atlas)[..., 3] if False else atlas[..., 3])
        idx = np.where(a < 128, 255, np.asarray(im))
        im = Image.fromarray(idx.astype(np.uint8), 'P')
        im.putpalette(pal)
        im.info['transparency'] = 255
        im.save(dst_base + '.png', optimize=True, transparency=255)
    else:
        im.save(dst_base + '.png', optimize=True)
    with open(dst_base + '.json', 'w') as f:
        json.dump({'image': os.path.relpath(dst_base + '.png', OUT).replace(os.sep, '/'), 'size': [ATLAS_W, H],
                   'ref': ref, 'frames': frames}, f, separators=(',', ':'))
    return len(frames), H, ref


def monster_packs(game, out):
    """Every Actors/<id>E|X.P16 that data/anims.json describes (written by tools/build_anims.py)."""
    path = os.path.join(out, 'data', 'anims.json')
    if not os.path.exists(path):
        return {}
    res = {}
    for aid, a in json.load(open(path))['actors'].items():
        if a['pack'][0].isdigit() and a['pack'][-1] in 'EX':  # hostile monsters (E) and NPCs (X)
            res[f"actors/{a['pack'].lower()}"] = f"Actors/{a['pack']}.P16"
    return res


if __name__ == '__main__':
    game, OUT = sys.argv[1], sys.argv[2]
    PACKS.update(monster_packs(game, OUT))
    for name, rel in PACKS.items():
        n, h, ref = convert(os.path.join(game, rel), os.path.join(OUT, 'p16', name), quantize=name.split('/')[-1][0].isdigit())
        print(f'{name:28s} frames={n:4d} atlas=2048x{h} ref={ref}')
