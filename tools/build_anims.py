#!/usr/bin/env python3
"""Derive per-actor animation layouts: python3 -I tools/build_anims.py <game_dir> <out_assets_dir>

Actor INIs (data/actors.json) list animations as (speed, frames-per-direction). P16 actor packs store 8 directions
per animation, dir-major (dir*frames + f), animations back to back in a fixed order. Packs only contain a subset of the
listed animations, so we search for the subset whose total frame count matches the pack. Unique match -> verified.
"""
import itertools
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from p16 import P16  # noqa: E402

ORDER = ['Andar', 'Respirar', 'Atacar', 'Cubrir', 'Recibir', 'Morir', 'Recibir2', 'Extra', 'Atacar2', 'Alarma', 'Vigilar']
REQUIRED = ['Andar', 'Respirar', 'Atacar']
# screen direction of each of the 8 blocks (corrected after testing in the browser: counter-clockwise from E)
DIRS = ['E', 'NE', 'N', 'NW', 'W', 'SW', 'S', 'SE']


def layouts(an, total):
    opt = [k for k in ORDER if k not in REQUIRED and an.get(k, [0, 0])[1] > 0]
    req = [k for k in REQUIRED if an.get(k, [0, 0])[1] > 0]
    found = []
    for r in range(len(opt) + 1):
        for sub in itertools.combinations(opt, r):
            names = [k for k in ORDER if k in req or k in sub]
            if 8 * sum(an[k][1] for k in names) == total:
                found.append(names)
    return found


def foot(p, anims):
    """Hotspot-space point of an actor's feet: median bottom-centre of the idle (Respirar) frames, all directions.
    Hotspot origins differ between packs (hero bottoms sit near -12, goblins near -52), so each actor gets its own."""
    for name in ('Respirar', 'Andar', *anims):
        a = anims.get(name)
        if not a:
            continue
        ids = range(a['start'], min(a['start'] + 8 * a['frames'], 1024))
        xs = [p.x[i - 1] + p.w[i - 1] / 2 for i in ids if p.w[i - 1]]
        ys = [p.y[i - 1] + p.h[i - 1] for i in ids if p.w[i - 1]]
        if xs:
            break
    else:
        return [-128.0, -16.0]
    return [float(sorted(xs)[len(xs) // 2]), float(sorted(ys)[len(ys) // 2])]


def build(an, names):
    out, pos = {}, 1
    for k in names:
        speed, n = an[k]
        out[k] = {'start': pos, 'frames': n, 'speed': speed}
        pos += 8 * n
    return out


if __name__ == '__main__':
    game, out = sys.argv[1], sys.argv[2]
    actors = json.load(open(os.path.join(out, 'data', 'actors.json')))
    res, stats = {}, {'unique': 0, 'ambiguous': 0, 'none': 0}
    for aid, a in actors.items():
        an = a.get('Animaciones')
        if not an:
            continue
        # NPC packs (<n>X.P16) have another layout (not 8-direction); only monsters (<n>E.P16) are handled here
        pack = next((f for f in (f'{aid}E.P16',) if os.path.exists(os.path.join(game, 'Actors', f))), None)
        if not pack:
            continue
        p16 = P16(os.path.join(game, 'Actors', pack))
        total = len(p16.ids())
        c = layouts(an, total)
        if not c:
            # Only the first three blocks (Andar, Respirar, Atacar) are guaranteed to come first in a pack.
            stats['none'] += 1
            res[aid] = {'title': a.get('title'), 'pack': pack[:-4], 'frames': total, 'verified': False, 'partial': True,
                        'anims': build(an, [k for k in REQUIRED if an.get(k, [0, 0])[1] > 0])}
            res[aid]['foot'] = foot(p16, res[aid]['anims'])
            continue
        stats['unique' if len(c) == 1 else 'ambiguous'] += 1
        # ambiguity rule: prefer the candidate that keeps Recibir over Recibir2 and drops Cubrir (verified on the Goblin)
        c.sort(key=lambda names: (('Recibir2' in names), ('Cubrir' in names), len(names)))
        res[aid] = {'title': a.get('title'), 'pack': pack[:-4], 'frames': total, 'verified': len(c) == 1,
                    'anims': build(an, c[0])}
        res[aid]['foot'] = foot(p16, res[aid]['anims'])
    # The player characters are layered packs (see docs/FORMATS.md): same layout in every Barbarian pack.
    for aid, pack in (('100', 'barbarian2'),):
        an = actors[aid]['Animaciones']
        res[aid] = {'title': actors[aid]['title'], 'pack': pack, 'frames': 564, 'verified': False, 'partial': True,
                    'anims': build(an, REQUIRED)}
        # feet from the bare body pack: the sword in 002 skews the bbox centre
        res[aid]['foot'] = foot(P16(os.path.join(game, 'Actors', '000-Barbarian.P16')), res[aid]['anims'])
    json.dump({'dirs': DIRS, 'actors': res}, open(os.path.join(out, 'data', 'anims.json'), 'w'), indent=1)
    print(stats, len(res), 'actors')
