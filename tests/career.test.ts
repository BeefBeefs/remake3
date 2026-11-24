import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MISSIONS, SLOTS, SaveStore, newCareer, parseCareer } from '../src/game/career.ts';

const hero = { attrs: { strength: 30, skill: 24, resistance: 30, magic: 11 }, level: 3, xp: 250, points: 2, gold: 321, inv: { slots: [3, 0, 104, 86], equipped: { weapon: 1, armor: 12 } } };
const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, raw: m }; };

test('a career survives a trip through storage, slot by slot', () => {
  const st = new SaveStore(mem());
  assert.equal(st.any, false);
  assert.equal(st.list().length, SLOTS);
  const c = { ...newCareer(101, 2, hero), done: ['lost_forrest'] };
  assert.ok(st.write(2, c));
  assert.equal(st.any, true);
  const back = st.read(2)!;
  assert.equal(back.classId, 101);
  assert.equal(back.difficulty, 2);
  assert.deepEqual(back.hero, hero);
  assert.deepEqual(back.done, ['lost_forrest']);
  assert.ok(back.when > 0);
  assert.equal(st.read(1), null);
  st.remove(2);
  assert.equal(st.any, false);
});

test('corrupt, foreign or hostile save data is ignored, not trusted', () => {
  const s = mem();
  s.setItem('nst-saves', '{not json');
  assert.equal(new SaveStore(s).any, false);
  s.setItem('nst-saves', JSON.stringify([{ v: 1, classId: 7, difficulty: 1, hero }, { v: 2 }, null, 'x', { v: 1, classId: 100, difficulty: 1, hero: { ...hero, level: 'high' } }]));
  assert.equal(new SaveStore(s).any, false);
  const bad = parseCareer({ v: 1, classId: 100, difficulty: 1, hero: { ...hero, inv: { slots: 'lots', equipped: {} } }, done: [] });
  assert.equal(bad, null);
  const odd = parseCareer({ v: 1, classId: 100, difficulty: 1, hero: { ...hero, inv: { slots: Array(50).fill(3), equipped: { weapon: 1, wings: 9, ring: -4 } } }, done: [1, 'a'] })!;
  assert.equal(odd.hero.inv!.slots.length, 20, 'a backpack is 20 slots');
  assert.deepEqual(odd.hero.inv!.equipped, { weapon: 1 });
  assert.deepEqual(odd.done, ['a']);
  assert.equal(new SaveStore(null).write(0, newCareer(100, 1, hero)), false, 'no storage: reports failure');
  assert.equal(new SaveStore(mem()).write(SLOTS, newCareer(100, 1, hero)), false);
});

test('the Lost Forest is the one mission of this install', () => {
  assert.deepEqual(MISSIONS.map((m) => m.id), ['lost_forrest']);
});
