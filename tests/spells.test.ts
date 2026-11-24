import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SPELLS, spellPower, inSight } from '../src/game/spells.ts';

const items = JSON.parse(readFileSync(new URL('../public/assets/data/items.json', import.meta.url), 'utf8')) as Record<string, { General: { Tipo?: number; Nivel?: number } }>;

test('every parchment in the item data has a spell, and no spell points at a non-parchment', () => {
  const scrolls = Object.entries(items).filter(([, v]) => ((v.General.Tipo ?? 0) & 512) !== 0).map(([k]) => Number(k));
  assert.equal(scrolls.length, 18);
  for (const id of scrolls) assert.ok(SPELLS[id], `parchment ${id}`);
  for (const id of Object.keys(SPELLS)) assert.ok(scrolls.includes(Number(id)), `spell ${id}`);
});

test('strength follows the mana held, with a soft cap above 60', () => {
  assert.equal(spellPower(0), 0);
  assert.ok(spellPower(40) > spellPower(20));
  assert.equal(spellPower(35), 70 - 5, 'above 60 only half of the excess counts');
  assert.ok(spellPower(100) < 200);
});

test('storm is the strongest damage scroll and takes all mana; incineration beats fire', () => {
  const storm = SPELLS[87]!, fire = SPELLS[89]!, inc = SPELLS[90]!;
  assert.ok(storm.kind === 'blast' && fire.kind === 'blast' && inc.kind === 'blast');
  assert.ok(storm.divisor < inc.divisor && inc.divisor < fire.divisor);
  assert.equal(storm.keep, 0);
});

test('the sight rectangle is the 640x480 screen around the hero', () => {
  assert.ok(inSight(0, 0) && inSight(5, 0) && inSight(0, -5));
  assert.ok(!inSight(12, 0) && !inSight(10, 10) && inSight(7, 7));
  assert.ok(!inSight(0, 16));
});
