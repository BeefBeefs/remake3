import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { parseMap } from '../src/formats/map.ts';
import { STEP_SOUND, type TileTable, surfaceLookup } from '../src/game/surface.ts';

const table = JSON.parse(readFileSync(new URL('../public/assets/data/tiles.json', import.meta.url), 'utf8')) as TileTable;

test('Outside tiles: grass variants, dirt, bridge planks, water and void are classified', () => {
  const s = surfaceLookup(table, 'Outside');
  assert.equal(s(330), 'grass');
  assert.equal(s(398), 'grass');
  assert.equal(s(109), 'grass'); // very dark forest floor is still grass
  assert.equal(s(147), 'dirt');
  assert.equal(s(141), 'wood');
  assert.equal(s(146), 'wood');
  assert.equal(s(511), 'water');
  assert.equal(s(0), 'void');
  assert.equal(s(606), 'stone');
});

test('Cave and Dungeon floors are stone; unknown ids fall back by tileset', () => {
  assert.equal(surfaceLookup(table, 'Cave')(5), 'stone');
  assert.equal(surfaceLookup(table, 'dungeon')(60), 'stone');
  assert.equal(surfaceLookup(table, 'Outside')(99999), 'grass');
  assert.equal(surfaceLookup(table, 'Cave')(99999), 'stone');
});

test('the Lost Forrest is mostly grass with some dirt, water and a few planks', () => {
  const map = parseMap(new Uint8Array(gunzipSync(readFileSync(new URL('../public/assets/maps/lost_forrest.map', import.meta.url)))));
  const s = surfaceLookup(table, map.tileset);
  const n: Record<string, number> = {};
  for (const t of map.terrain) n[s(t)] = (n[s(t)] ?? 0) + 1;
  assert.ok((n.grass ?? 0) > 60000, JSON.stringify(n));
  assert.ok((n.dirt ?? 0) > 300 && (n.water ?? 0) > 500 && (n.wood ?? 0) >= 6);
  assert.ok((n.stone ?? 0) < 100);
});

test('footstep sounds exist for every surface and step pairs are consecutive', () => {
  for (const id of Object.values(STEP_SOUND)) assert.ok(id >= 160 && id <= 169);
  assert.equal(STEP_SOUND.wood, 164);
  assert.equal(STEP_SOUND.stone, 168);
});
