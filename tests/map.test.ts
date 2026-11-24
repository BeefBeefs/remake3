import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { parseMap, WATER_TILE } from '../src/formats/map.ts';

const body = new Uint8Array(gunzipSync(readFileSync(new URL('../public/assets/maps/lost_forrest.map', import.meta.url))));
const map = parseMap(body);

test('Lost Forrest terrain grid', () => {
  assert.equal(map.dim, 256);
  assert.equal(map.tileset, 'Outside');
  assert.equal(map.terrain.length, 65536);
  let void_ = 0, max = 0;
  for (const t of map.terrain) { if (!t) void_++; if (t > max) max = t; }
  assert.equal(void_, 19);
  assert.ok(max <= 611);
});

test('the 3-wide east-west river is water (id 511) on rows 165..167', () => {
  for (const row of [165, 166, 167]) {
    let n = 0;
    for (let cx = 0; cx < 256; cx++) if (map.terrain[row * 256 + cx] === WATER_TILE) n++;
    assert.ok(n >= 240, `row ${row}: ${n}`);
  }
});

test('object layer values are (pack<<10)|id with pack 0..3', () => {
  let n = 0;
  for (const o of map.objects) {
    if (!o) continue;
    n++;
    assert.ok(o >> 10 <= 3, `bad pack in ${o}`);
  }
  assert.equal(n, 2280);
});
