#!/usr/bin/env python3
"""Index the converted sound effects: python3 -I tools/build_sfx_index.py
Writes public/assets/data/sfx.json = {"<number>": "audio/gdi/audio/<file>.ogg"}; the number is the file's 3-digit prefix,
which is the id the game data uses (actor INI Sonidos.SndBase + 0 attack / 1 alarm / 2 die / 3 hurt)."""
import json, os, re
root = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets')
d = os.path.join(root, 'audio', 'gdi', 'audio')
out = {}
for f in sorted(os.listdir(d)):
    m = re.match(r'(\d{3})_.*\.ogg$', f)
    if m: out[str(int(m.group(1)))] = f'audio/gdi/audio/{f}'
json.dump(out, open(os.path.join(root, 'data', 'sfx.json'), 'w'), indent=0)
print(len(out), 'sounds')
