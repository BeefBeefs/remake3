import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { parseAdv } from '../src/formats/adv.ts';

const adv = `${process.env.NST_GAME_DIR ?? 'game'}/Adv/Test.adv`;
const have = existsSync(adv);

test('Test.adv container', { skip: !have }, () => {
  const d = new Uint8Array(gunzipSync(readFileSync(adv)));
  const a = parseAdv(d);
  assert.match(a.intro, /^Enter the text that the player will read/);
  assert.equal(a.missionName, 'Lost Forest');
  assert.deepEqual(a.heroes.map((h) => [h.name, h.strength, h.skill, h.resistance, h.magic]),
    [['Barbarian', 32, 24, 30, 11], ['Amazon', 22, 28, 22, 14], ['Sorceress', 19, 23, 21, 30]]);
  assert.equal(a.mapFile, 'Lost Forrest.map');
  assert.equal(a.mapOffset, 0x7385);
});

test('converted adventure.json matches', () => {
  const j = JSON.parse(readFileSync(new URL('../public/assets/data/adventure.json', import.meta.url), 'utf8'));
  assert.equal(j.heroes[0].resistance, 30);
  assert.match(j.mission_text, /^Find the tomb of Donmir/);
});
