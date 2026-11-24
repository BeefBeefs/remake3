#!/usr/bin/env python3
"""Adds the 7th frame field (bottom-edge slope of narrow wall slices, see convert_p16.edge_slope) to the scenery
atlases already in public/assets/p16/scenary without redoing the PNGs.   usage: python3 -I tools/add_slopes.py <assets_dir>"""
import glob
import json
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from convert_p16 import edge_slope  # noqa: E402

root = sys.argv[1]
for jp in sorted(glob.glob(os.path.join(root, 'p16', 'scenary', '*', 'pack[123].json'))):
    j = json.load(open(jp))
    im = np.asarray(Image.open(os.path.join(root, j['image'])).convert('RGBA'))
    n = 0
    for fid, f in j['frames'].items():
        x, y, w, h = f[:4]
        if w <= 34 and h >= 40:
            f[:] = f[:6] + [edge_slope(im[y:y + h, x:x + w])]
            n += 1
    json.dump(j, open(jp, 'w'), separators=(',', ':'))
    print(jp.split('scenary/')[1], n, 'slices')
