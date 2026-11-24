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
    'actors/barbarian0': 'Actors/000-Barbarian.P16',
    'actors/sorceress0': 'Actors/000-Sorceress.P16',
    'actors/amazon0': 'Actors/000-Amazon.P16',
    'actors/e1': 'Actors/1E.P16',
    'actors/e2': 'Actors/2E.P16',
    'actors/rat': 'Actors/Rat.P16',
    'actors/spider': 'Actors/Spider.P16',
    'actors/stone': 'Actors/Stone.P16',
}
ATLAS_W = 2048


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


def convert(src, dst_base):
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
    fx = [p.x[i - 1] + p.w[i - 1] / 2 for i in p.ids()]
    fy = [p.y[i - 1] + p.h[i - 1] for i in p.ids()]
    ref = [float(np.median(fx)), float(np.median(fy))] if fx else [0.0, 0.0]
    os.makedirs(os.path.dirname(dst_base), exist_ok=True)
    Image.fromarray(atlas).save(dst_base + '.png', optimize=True)
    with open(dst_base + '.json', 'w') as f:
        json.dump({'image': os.path.relpath(dst_base + '.png', OUT).replace(os.sep, '/'), 'size': [ATLAS_W, H],
                   'ref': ref, 'frames': frames}, f, separators=(',', ':'))
    return len(frames), H, ref


if __name__ == '__main__':
    game, OUT = sys.argv[1], sys.argv[2]
    for name, rel in PACKS.items():
        n, h, ref = convert(os.path.join(game, rel), os.path.join(OUT, 'p16', name))
        print(f'{name:28s} frames={n:4d} atlas=2048x{h} ref={ref}')
