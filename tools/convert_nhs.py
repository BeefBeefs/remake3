#!/usr/bin/env python3
"""NHS archives -> JSON: python3 -I tools/convert_nhs.py <game_dir> <out_assets_dir>

AData.Nhs (IA-<n>.INI)  -> data/actors.json   { "<n>": {title, <Section>: {key: value}} }
WData.Nhs (ID-<n>.INI)  -> data/items.json
NightStone.NHS (<n>.map) -> maps/nhs/<n>.map  (gzip maps, same format as Maps/*.map)
Values: int, float, "(a,b,..)" -> list, anything else -> string. Section/key names are the original (Spanish) ones.
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from nhs import read_nhs  # noqa: E402


def value(s):
    s = s.strip()
    if s.startswith('(') and s.endswith(')'):
        return [value(x) for x in s[1:-1].split(',') if x.strip()]
    try:
        return int(s)
    except ValueError:
        pass
    try:
        return float(s)
    except ValueError:
        return s


def parse_ini(text):
    out, sec, title = {}, None, None
    for line in text.replace('\r', '').split('\n'):
        raw = line.strip()
        if raw.startswith(';'):
            m = re.match(r';\s*\[(.+?)\]', raw)
            if m and title is None:
                title = m.group(1)
            continue
        line = line.split(';', 1)[0].strip()
        if not line:
            continue
        m = re.match(r'^\[(.+)\]$', line)
        if m:
            sec = out.setdefault(m.group(1), {})
            continue
        if '=' in line and sec is not None:
            k, v = line.split('=', 1)
            sec[k.strip()] = value(v)
    if title:
        out = {'title': title, **out}
    return out


def table(path, prefix):
    res = {}
    for name, blob, _ in read_nhs(path):
        m = re.match(rf'^{prefix}-(\d+)\.INI$', name, re.I)
        if m:
            res[m.group(1)] = parse_ini(blob.decode('latin1'))
    return dict(sorted(res.items(), key=lambda kv: int(kv[0])))


if __name__ == '__main__':
    game, out = sys.argv[1], sys.argv[2]
    os.makedirs(os.path.join(out, 'data'), exist_ok=True)
    for src, prefix, dst in (('AData.Nhs', 'IA', 'actors'), ('WData.Nhs', 'ID', 'items')):
        t = table(os.path.join(game, 'System', src), prefix)
        with open(os.path.join(out, 'data', dst + '.json'), 'w') as f:
            json.dump(t, f, ensure_ascii=False, indent=1)
        print(dst, len(t))
    os.makedirs(os.path.join(out, 'maps', 'nhs'), exist_ok=True)
    n = 0
    for name, blob, _ in read_nhs(os.path.join(game, 'System', 'NightStone.NHS')):
        open(os.path.join(out, 'maps', 'nhs', name), 'wb').write(blob)
        n += 1
    print('nhs maps', n)
