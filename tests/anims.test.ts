import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DIR_NAMES, screenDir } from '../src/iso.ts';

const data = JSON.parse(readFileSync(new URL('../public/assets/data/anims.json', import.meta.url), 'utf8')) as {
  actors: Record<string, { pack: string; frames: number; verified: boolean; partial?: boolean; foot: number[]; anims: Record<string, { start: number; frames: number; speed: number; dirs?: number }> }>;
};

test('screenDir maps screen vectors to the P16 direction order', () => {
  const idx = (n: string) => DIR_NAMES.indexOf(n as (typeof DIR_NAMES)[number]);
  assert.equal(screenDir(0, 1), idx('N'));
  assert.equal(screenDir(1, 0), idx('E'));
  assert.equal(screenDir(0, -1), idx('S'));
  assert.equal(screenDir(-1, 0), idx('W'));
  assert.equal(screenDir(1, 1), idx('NE'));
  assert.equal(screenDir(-1, -1), idx('SW'));
  assert.equal(screenDir(-1, 1), idx('NW'));
  assert.equal(screenDir(1, -1), idx('SE'));
  assert.deepEqual([...DIR_NAMES], ['E', 'NE', 'N', 'NW', 'W', 'SW', 'S', 'SE']);
});

test('animation blocks are contiguous, in range, and 8 directions each', () => {
  const ids = Object.keys(data.actors);
  assert.ok(ids.length >= 36);
  for (const id of ids) {
    const a = data.actors[id]!;
    let next = 1;
    for (const anim of Object.values(a.anims)) {
      assert.equal(anim.start, next, `actor ${id}`);
      next += (anim.dirs ?? 8) * anim.frames;
    }
    assert.ok(next - 1 <= a.frames , `actor ${id} overruns its pack (${next - 1} > ${a.frames})`);
    if (a.verified) assert.equal(next - 1, a.frames, `verified actor ${id} must account for every frame`);
  }
});

test('goblin layout matches the pack (Andar, Respirar, Atacar, Recibir, Morir, Alarma = 400 frames)', () => {
  const g = data.actors['1']!;
  assert.deepEqual(Object.keys(g.anims), ['Andar', 'Respirar', 'Atacar', 'Recibir', 'Morir', 'Alarma']);
  assert.equal(g.frames, 400);
  assert.equal(g.anims.Morir!.start, 217);
});
