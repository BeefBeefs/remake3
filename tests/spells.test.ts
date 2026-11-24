import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SPELLS, blastDamage, manaCost } from '../src/game/spells.ts';

const items = JSON.parse(readFileSync(new URL('../public/assets/data/items.json', import.meta.url), 'utf8')) as Record<string, { General: { Tipo?: number; Nivel?: number } }>;

test('every parchment in the item data has a spell, and no spell points at a non-parchment', () => {
  const scrolls = Object.entries(items).filter(([, v]) => ((v.General.Tipo ?? 0) & 512) !== 0).map(([k]) => Number(k));
  assert.equal(scrolls.length, 18);
  for (const id of scrolls) assert.ok(SPELLS[id], `parchment ${id}`);
  for (const id of Object.keys(SPELLS)) assert.ok(scrolls.includes(Number(id)), `spell ${id}`);
});

test('damage grows with Power and with the scroll; mana cost grows with scroll level', () => {
  const storm = SPELLS[87]!, fire = SPELLS[89]!;
  assert.ok(storm.kind === 'blast' && fire.kind === 'blast');
  assert.ok(blastDamage(storm, 30) > blastDamage(storm, 10));
  assert.ok(blastDamage(storm, 20) > blastDamage(fire, 20), 'storm is the strongest');
  assert.ok(manaCost(storm, 5) > manaCost(storm, 2));
  assert.equal(manaCost(SPELLS[92]!, 2), 0, 'the life parchment spends mana as its effect');
});
