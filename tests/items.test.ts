import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Inventory, buildItems, kindOf, rollDrop } from '../src/game/items.ts';

const json = (p: string) => JSON.parse(readFileSync(new URL(`../public/assets/${p}`, import.meta.url), 'utf8'));
const defs = buildItems(json('data/items.json'), {});

test('every item gets a kind and the 141 items are all present', () => {
  assert.equal(defs.size, 141);
  assert.equal(defs.get(1)!.kind, 'weapon');
  assert.equal(defs.get(25)!.kind, 'shield');
  assert.equal(defs.get(35)!.kind, 'armor');
  assert.equal(defs.get(66)!.kind, 'ring');
  assert.equal(defs.get(104)!.kind, 'potion');
  assert.equal(defs.get(124)!.kind, 'gold');
  assert.equal(kindOf(512), 'scroll');
  // no item falls through to 'quest' except the horn
  const quest = [...defs.values()].filter((d) => d.kind === 'quest').map((d) => d.id);
  assert.deepEqual(quest, [131]);
});

test('equipping a weapon changes the damage range, shields and armour add protection', () => {
  const inv = new Inventory(defs, 100);
  assert.deepEqual(inv.damage(), [1, 2]);
  inv.add(1); inv.add(25); inv.add(35);
  assert.ok(inv.equip(0) && inv.equip(1) && inv.equip(2));
  assert.deepEqual(inv.damage(), [2, 4]);
  assert.equal(inv.armor(), 1 + 1);
  // swapping puts the old weapon back in the pack
  inv.add(4);
  assert.ok(inv.equip(inv.slots.indexOf(4)));
  assert.deepEqual(inv.damage(), [3, 7]);
  assert.ok(inv.slots.includes(1));
  assert.ok(inv.unequip('weapon'));
  assert.deepEqual(inv.damage(), [1, 2]);
});

test('class restrictions are enforced (amazon armour is not for a barbarian)', () => {
  const inv = new Inventory(defs, 100);
  inv.add(49);
  assert.equal(inv.equip(0), false);
  assert.equal(inv.armor(), 0);
});

test('the pack has a size limit', () => {
  const inv = new Inventory(defs, 100);
  for (let i = 0; i < 20; i++) assert.ok(inv.add(104));
  assert.equal(inv.add(104), false);
});

test('rollDrop follows the weights and only returns table entries', () => {
  const table = { IDItem: [16, 104, 106], PItem: [1, 2, 3] };
  let s = 7;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const counts = new Map<number, number>();
  for (let i = 0; i < 6000; i++) { const d = rollDrop(table, rnd)!; counts.set(d, (counts.get(d) ?? 0) + 1); }
  assert.deepEqual([...counts.keys()].sort((a, b) => a - b), [16, 104, 106]);
  assert.ok(counts.get(106)! > counts.get(104)! && counts.get(104)! > counts.get(16)!);
  assert.equal(rollDrop(undefined, rnd), null);
});
