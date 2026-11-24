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


def layouts4(an, total):
    """Player packs: Morir is stored for 4 directions only, placed last (checked by eye: every sequence ends lying down).
    Not applied to monsters: some of their sizes also fit this rule, but the "death" frames come out as standing poses.
    8 * sum(others) + 4 * Morir == total."""
    if an.get('Morir', [0, 0])[1] <= 0:
        return []
    opt = [k for k in ORDER if k not in REQUIRED and k != 'Morir' and an.get(k, [0, 0])[1] > 0]
    req = [k for k in REQUIRED if an.get(k, [0, 0])[1] > 0]
    found = []
    for r in range(len(opt) + 1):
        for sub in itertools.combinations(opt, r):
            names = [k for k in ORDER if k in req or k in sub]
            if 8 * sum(an[k][1] for k in names) + 4 * an['Morir'][1] == total:
                found.append(names)
    return found


def layouts_ini4(an, total):
    """All INI animations in INI order, Morir stored for 4 directions only: 8 * sum(others) + 4 * Morir == total."""
    if an.get('Morir', [0, 0])[1] <= 0 or any(an[k][1] <= 0 for k in an):
        return []
    return [list(an)] if 8 * sum(v[1] for k, v in an.items() if k != 'Morir') + 4 * an['Morir'][1] == total else []


def build_ini4(an):
    out, pos = {}, 1
    for k, (speed, n) in an.items():
        d = 4 if k == 'Morir' else 8
        out[k] = {'start': pos, 'frames': n, 'speed': speed, **({'dirs': 4} if d == 4 else {})}
        pos += d * n
    return out


def with_morir4(an, names):
    out = build(an, names)
    out['Morir'] = {'start': 1 + 8 * sum(an[k][1] for k in names), 'frames': an['Morir'][1], 'speed': an['Morir'][0], 'dirs': 4}
    return out


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
        m4 = layouts_ini4(an, total)
        if not c and m4:
            # Same rule as the heroes' packs: every INI animation in INI order, 8 directions each, except Morir
            # (4 directions). Unique and checked on contact sheets (zombie, troll, amazon, groak... all end lying down).
            stats['ini4'] = stats.get('ini4', 0) + 1
            res[aid] = {'title': a.get('title'), 'pack': pack[:-4], 'frames': total, 'verified': True, 'anims': build_ini4(an)}
            res[aid]['foot'] = foot(p16, res[aid]['anims'])
            continue
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
    # The player characters are layered packs (see docs/FORMATS.md). Blocks: Andar, Respirar, Atacar, then whichever of
    # Cubrir / Recibir / Recibir2 / Extra / Atacar2 / Vigilar the class has (8 directions each), and finally Morir, which is
    # stored for only 4 directions (one lying-down sequence per pair of directions). The subset is the unique one whose
    # size matches the pack:  8 * sum(frames) + 4 * Morir == pack size.
    for aid, pack, bare in (('100', 'barbarian2', '000-Barbarian'), ('101', 'amazon1', '000-Amazon'), ('102', 'sorceress1', '000-Sorceress')):
        an = actors[aid]['Animaciones']
        bp = P16(os.path.join(game, 'Actors', bare + '.P16'))
        total = len(bp.ids())
        cands = layouts4(an, total)
        assert len(cands) == 1, (aid, cands)
        anims = with_morir4(an, cands[0])
        res[aid] = {'title': actors[aid]['title'], 'pack': pack, 'frames': total, 'verified': True, 'anims': anims}
        # feet from the bare body pack: weapons skew the bbox centre
        res[aid]['foot'] = foot(bp, res[aid]['anims'])
    # NPCs (<id>X.P16) are single-view strips: Andar, Respirar, Atacar (the INI order) back to back, no directions.
    for aid, a in actors.items():
        an = a.get('Animaciones')
        path = os.path.join(game, 'Actors', f'{aid}X.P16')
        if not an or not os.path.exists(path) or aid in res:
            continue
        p16 = P16(path)
        total = len(p16.ids())
        names = [k for k in ('Andar', 'Respirar', 'Atacar') if an.get(k, [0, 0])[1] > 0]
        anims, pos = {}, 1
        for k in names:
            anims[k] = {'start': pos, 'frames': an[k][1], 'speed': an[k][0], 'dirs': 1}
            pos += an[k][1]
        res[aid] = {'title': a.get('title', '').strip(), 'pack': f'{aid}X', 'frames': total, 'verified': pos - 1 == total, 'npc': True, 'anims': anims}
        res[aid]['foot'] = foot(p16, {k: {**v, 'frames': 1} for k, v in anims.items()}) if False else [float(sorted(p16.x[i] + p16.w[i] / 2 for i in range(total) if p16.w[i])[total // 2]), float(sorted(p16.y[i] + p16.h[i] for i in range(total) if p16.w[i])[total // 2])]
        stats['npc'] = stats.get('npc', 0) + 1
    json.dump({'dirs': DIRS, 'actors': res}, open(os.path.join(out, 'data', 'anims.json'), 'w'), indent=1)
    print(stats, len(res), 'actors')
