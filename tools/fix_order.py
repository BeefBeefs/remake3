"""Re-derives the block order of every actor pack (heroes and monsters) from silhouette continuity and rewrites `start` in
public/assets/data/anims.json.  The INI order build_anims.py assumes is only right for some packs: the sizes of the blocks
are known (frames x 8 directions, Morir sometimes x 4), but not their order.  Between two directions of one animation the
picture changes little from frame to frame; at a block or direction boundary it jumps.  For every order of the blocks after
Andar and Respirar the mean jump at the predicted boundaries minus the mean jump elsewhere is scored, and the best order
replaces the INI order when it scores clearly higher (ties keep the INI order).  Usage: python3 tools/fix_order.py [assets]
"""
import itertools, json, os, sys
import numpy as np
from PIL import Image

ROOT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'assets')
path = os.path.join(ROOT, 'data', 'anims.json')
data = json.load(open(path))
actors = data['actors']


def jumps(pack, foot, n):
    j = json.load(open(f'{ROOT}/p16/actors/{pack.lower()}.json'))
    im = Image.open(f'{ROOT}/p16/actors/{pack.lower()}.png').convert('RGBA')
    W, H = 420, 420
    feats = []
    for i in range(1, n + 1):
        x, y, w, h, hx, hy = j['frames'][str(i)]
        c = Image.new('RGBA', (W, H))
        c.paste(im.crop((x, y, x + w, y + h)), (int(W / 2 + foot[0] - hx), int(H * 0.8 + foot[1] - hy)))
        feats.append(np.array(c)[:, :, 3] > 0)
    return np.array([(feats[i] ^ feats[i + 1]).sum() / max(1, (feats[i] | feats[i + 1]).sum()) for i in range(n - 1)])


def score(d, order, size):
    pos, bounds = 0, []
    for name in order:
        n, dirs = size[name]
        for _ in range(dirs):
            pos += n
            bounds.append(pos - 1)
    b = np.array(bounds[:-1])
    mask = np.ones(len(d), bool)
    mask[b] = False
    return d[b].mean() - d[mask].mean()


ini_all = json.load(open(f'{ROOT}/data/actors.json'))


def candidate_sets(aid, a):
    """Block sets (name -> (frames, dirs)) whose size adds up to the pack: the one anims.json has now, and every INI animation
    present with Morir stored for 8 or for 4 directions (several monsters fit both)."""
    an = {k: v for k, v in ini_all[aid]['Animaciones'].items() if v[1] > 0}
    sets = [{k: (v['frames'], v.get('dirs', 8)) for k, v in a['anims'].items()}]
    for morir_dirs in (4, 8):
        sz = {k: (v[1], morir_dirs if k == 'Morir' else 8) for k, v in an.items()}
        if sum(n * d for n, d in sz.values()) == a['frames'] and sz not in sets:
            sets.append(sz)
    return [z for z in sets if sum(n * d for n, d in z.values()) == a['frames']]


# orc 5 scores two orders within noise of each other; its siblings 6, 7, 45 and 58 settle it
OVERRIDE = {'5': ['Andar', 'Respirar', 'Atacar', 'Cubrir', 'Recibir', 'Morir', 'Recibir2']}
# the mage and Zelos: the INI order already ends every death lying down (8 of 8 directions), the search would break that
KEEP = {'25', '55'}
changed = 0
for aid, a in actors.items():
    if a.get('npc') or len(a['anims']) < 4 or aid in KEEP:
        continue
    d = jumps(a['pack'], a['foot'], a['frames'])
    ini_order = list(ini_all[aid]['Animaciones'])
    cur_names = sorted(a['anims'], key=lambda k: a['anims'][k]['start'])
    cur_size = {k: (v['frames'], v.get('dirs', 8)) for k, v in a['anims'].items()}
    cur = score(d, cur_names, cur_size)
    best_s, best, best_size = cur, cur_names, cur_size
    complete = []  # sets that explain every INI animation (preferred: the INI lists exactly what the pack holds)
    for size in candidate_sets(aid, a):
        base = [k for k in ini_order if k in size]
        head, rest = base[:2], base[2:]
        sets_best = (score(d, base, size), base)
        for perm in itertools.permutations(rest):
            o = head + list(perm)
            sc = score(d, o, size)
            if sc > sets_best[0] + 1e-9:
                sets_best = (sc, o)
        if aid in OVERRIDE and set(OVERRIDE[aid]) == set(size):
            sets_best = (score(d, OVERRIDE[aid], size), OVERRIDE[aid])
        if set(size) == set(k for k, v in ini_all[aid]['Animaciones'].items() if v[1] > 0):
            complete.append((sets_best[0], sets_best[1], size))
        elif sets_best[0] > best_s + 0.01:
            best_s, best, best_size = sets_best[0], sets_best[1], size
    if complete:
        c = max(complete, key=lambda t: t[0])
        if c[0] >= best_s - 0.02 or c[0] > cur + 0.01:
            best_s, best, best_size = c
    if best != cur_names or best_size != cur_size:
        speeds = {k: v[0] for k, v in ini_all[aid]['Animaciones'].items()}
        a['anims'] = {}
        pos = 1
        for k in best:
            n, dirs = best_size[k]
            a['anims'][k] = {'start': pos, 'frames': n, 'speed': speeds[k]}
            if dirs != 8:
                a['anims'][k]['dirs'] = dirs
            pos += n * dirs
        assert pos - 1 == a['frames'], (aid, pos, a['frames'])
        changed += 1
    print(aid, a['title'][:26], 'was %.3f' % cur, 'best %.3f' % best_s, 'CHANGED' if best != cur_names or best_size != cur_size else 'kept', best if best != cur_names or best_size != cur_size else '', flush=True)
json.dump(data, open(path, 'w'), indent=1)
print(changed, 'actors reordered')
