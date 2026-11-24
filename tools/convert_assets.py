#!/usr/bin/env python3
"""Convert the extracted NightStone game files (see extract_nst.py) into web-friendly assets.

    python3 tools/convert_assets.py <extracted game dir> <output dir, e.g. public/assets>

What it converts (only formats that are fully understood):
  *.b16          -> atlas PNG + JSON frame table      (see docs/FORMATS.md, "B16")
  *.bmp          -> PNG
  GDI/Audio/*.wav, System/*.dt (RIFF WAVE music) -> Ogg Vorbis (needs ffmpeg)
  System/Idioma.bdt -> JSON string table
  Maps/**/*.map  -> copied as-is (gzip; the client gunzips with DecompressionStream)
"""
import json, os, re, shutil, struct, subprocess, sys
import numpy as np
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
KEY = 0xF81F  # RGB565 magenta = transparent


def rgb565_rgba(px):
    r = ((px >> 11) & 31) << 3; g = ((px >> 5) & 63) << 2; b = (px & 31) << 3
    r |= r >> 5; g |= g >> 6; b |= b >> 5
    a = np.where(px == KEY, 0, 255)
    return np.dstack([r, g, b, a]).astype(np.uint8)


def parse_b16(path):
    d = open(path, 'rb').read()
    n = struct.unpack_from('<I', d, 0)[0]
    pos = 4; frames = []
    for _ in range(n):
        fid, w, h = struct.unpack_from('<IHH', d, pos); pos += 8
        px = np.frombuffer(d, dtype='<u2', count=w * h, offset=pos).reshape(h, w); pos += w * h * 2
        frames.append((fid, px))
    return frames


def pack_atlas(frames, max_w=2048):
    items = sorted(frames, key=lambda f: -f[1].shape[0])
    x = y = row_h = 0; placed = []
    for fid, px in items:
        h, w = px.shape
        if x + w > max_w: x = 0; y += row_h; row_h = 0
        placed.append((fid, x, y, w, h, px)); x += w; row_h = max(row_h, h)
    H = y + row_h
    atlas = np.zeros((max(H, 1), max_w, 4), np.uint8)
    table = {}
    for fid, px_x, px_y, w, h, px in placed:
        atlas[px_y:px_y + h, px_x:px_x + w] = rgb565_rgba(px)
        table[str(fid)] = [px_x, px_y, w, h]
    return atlas, table


def slug(rel):
    return re.sub(r'[^A-Za-z0-9._/-]+', '_', rel).lower()


def ensure(p):
    os.makedirs(os.path.dirname(p), exist_ok=True); return p


stats = {'b16': 0, 'bmp': 0, 'ogg': 0, 'maps': 0}
index = {'atlases': {}, 'audio': [], 'maps': [], 'textures': []}

for root, _, files in os.walk(src):
    for f in sorted(files):
        full = os.path.join(root, f); rel = os.path.relpath(full, src).replace('\\', '/'); low = f.lower()
        if low.endswith('.b16') and 'thumbnails' not in low:
            frames = parse_b16(full)
            atlas, table = pack_atlas(frames)
            name = slug(rel[:-4])
            Image.fromarray(atlas).save(ensure(f'{out}/atlas/{name}.png'), optimize=True)
            json.dump({'image': f'atlas/{name}.png', 'size': [atlas.shape[1], atlas.shape[0]], 'frames': table},
                      open(f'{out}/atlas/{name}.json', 'w'), separators=(',', ':'))
            index['atlases'][rel] = f'atlas/{name}.json'; stats['b16'] += 1
        elif low.endswith('.bmp') and 'thumbs' not in low:
            name = slug(rel[:-4])
            Image.open(full).convert('RGB').save(ensure(f'{out}/tex/{name}.png'), optimize=True)
            index['textures'].append(f'tex/{name}.png'); stats['bmp'] += 1
        elif low.endswith('.map'):
            dst = ensure(f'{out}/maps/{slug(rel[len("Maps/"):])}')
            shutil.copyfile(full, dst); index['maps'].append(os.path.relpath(dst, out)); stats['maps'] += 1
        elif low.endswith('.wav') or (low.endswith('.dt') and open(full, 'rb').read(4) == b'RIFF'):
            if rel.startswith('GDI/Audio') or rel.startswith('System/'):
                name = slug(re.sub(r'\.(wav|dt)$', '', rel, flags=re.I))
                dst = ensure(f'{out}/audio/{name}.ogg')
                subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', full, '-c:a', 'libvorbis', '-q:a', '3', dst], check=True)
                index['audio'].append(f'audio/{name}.ogg'); stats['ogg'] += 1

# language table: "<< KEY >>\ntext&\n"
raw = open(f'{src}/System/Idioma.bdt', 'rb').read().decode('latin-1')
strings = {}
for m in re.finditer(r'<< (.+?) >>\r?\n(.*?)&\r?\n', raw, re.S):
    strings[m.group(1)] = m.group(2).replace('\r\n', '\n').rstrip('\n')
json.dump(strings, open(ensure(f'{out}/text/idioma.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
json.dump(index, open(f'{out}/index.json', 'w'), indent=1)
print(stats, 'strings', len(strings))
