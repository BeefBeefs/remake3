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

test('goblin layout matches the pack: all INI animations, Morir for 4 directions after Recibir (found by tools/fix_order.py)', () => {
  const g = data.actors['1']!;
  assert.deepEqual(Object.keys(g.anims), ['Andar', 'Respirar', 'Cubrir', 'Atacar', 'Recibir', 'Morir', 'Recibir2', 'Alarma']);
  assert.equal(g.frames, 400);
  assert.equal(g.anims.Morir!.start, 233);
  assert.equal(g.anims.Morir!.dirs, 4);
});

test('the last frame of every death sequence of the common monsters shows a body lying down', () => {
  const atlasOf = (pack: string) => JSON.parse(readFileSync(new URL(`../public/assets/p16/actors/${pack.toLowerCase()}.json`, import.meta.url), 'utf8')) as { frames: Record<string, number[]> };
  for (const id of ['1', '2', '3', '4', '5', '6', '7', '11', '12', '39', '43', '45', '58', '100', '101', '102']) {
    const a = data.actors[id]!, m = a.anims.Morir!, atlas = atlasOf(a.pack);
    let lying = 0;
    for (let d = 0; d < 8; d++) {
      const f = atlas.frames[String(m.start + (m.dirs === 4 ? d >> 1 : d) * m.frames + m.frames - 1)]!;
      if (f[2]! > 1.15 * f[3]!) lying++;
    }
    assert.ok(lying >= 6, `actor ${id}: ${lying} of 8 directions end lying down`);
  }
});

test('every monster now has a full layout: Morir for 4 directions, all INI animations, nothing left over', () => {
  for (const id of ['8', '9', '13', '16', '17', '19', '20', '21', '24', '25', '61']) {
    const a = data.actors[id]!;
    assert.ok(!a.partial && a.verified, `actor ${id}`);
    assert.equal(a.anims.Morir!.dirs, 4, `actor ${id}`);
    assert.ok(a.anims.Recibir || a.anims.Recibir2 || id === '14' || id === '15' || id === '20', `actor ${id} can be hurt`);
  }
  assert.ok(data.actors['9']!.anims.Aparecer, 'skeletons rise');
  assert.ok(data.actors['8']!.anims.Aburrido, 'orcs fidget');
  assert.equal(Object.values(data.actors).filter((a) => a.partial).length, 0);
});

test('an actor stays on its feet point whichever way it faces (the hotspot is subtracted)', () => {
  const hero = data.actors['100']!;
  const frames = (JSON.parse(readFileSync(new URL(`../public/assets/p16/actors/${hero.pack.toLowerCase()}.json`, import.meta.url), 'utf8')) as { frames: Record<string, number[]> }).frames;
  const idle = hero.anims.Respirar!;
  const bottoms: number[] = [];
  for (let i = idle.start; i < idle.start + 8 * idle.frames; i++) {
    const [, , , h, , hy] = frames[String(i)]!;
    bottoms.push(hero.foot[1]! - hy! + h!); // screen offset (down) of the bitmap's bottom edge from the actor's position
  }
  const mean = bottoms.reduce((a, b) => a + b, 0) / bottoms.length;
  const spread = Math.sqrt(bottoms.reduce((a, b) => a + (b - mean) ** 2, 0) / bottoms.length);
  assert.ok(Math.abs(mean) < 6 && spread < 8, `mean ${mean} spread ${spread}`);
});
