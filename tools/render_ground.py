#!/usr/bin/env python3
"""Debug: draw a patch of an Outside map's ground with the orientation of tile_orient.json applied. usage: render_ground.py map.map out.png [cx cy] [orient=1]"""
import gzip, json, struct, sys
from PIL import Image
import os
root = 'public/assets'
SET = os.environ.get('SET', 'outside')
d = gzip.open(sys.argv[1]).read()
cx, cy = (int(sys.argv[3]), int(sys.argv[4])) if len(sys.argv) > 4 else (128, 128)
orient = (sys.argv[5] != '0') if len(sys.argv) > 5 else True
at = json.load(open(f'{root}/atlas/scenary/{SET}/vtiles.json'))['frames']
png = Image.open(f'{root}/atlas/scenary/{SET}/vtiles.png').convert('RGBA')
ori = json.load(open(f'{root}/data/tile_orient.json'))['outside'] if orient else {}
R = 14
out = Image.new('RGBA', (64 * R * 2 + 64, 32 * R * 2 + 64), (0, 0, 0, 255))
for j in range(-R, R + 1):
    for i in range(-R, R + 1):
        x, y = cx + i, cy + j
        t = struct.unpack_from('<I', d, 0x4000 + (y * 256 + x) * 12)[0] & 0xFFFF
        f = at.get(str(t))
        if not f: continue
        im = png.crop((f[0], f[1], f[0] + f[2], f[1] + f[3]))
        k = ori.get(str(t), '')
        if 'x' in k: im = im.transpose(Image.FLIP_LEFT_RIGHT)
        if 'y' in k: im = im.transpose(Image.FLIP_TOP_BOTTOM)
        sx = (i - j) * 32 + out.width // 2 - 32
        sy = (i + j) * 15.5 + out.height // 2 - 16
        out.alpha_composite(im, (int(sx), int(sy)))
out.save(sys.argv[2])
