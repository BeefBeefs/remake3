import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { parseMap, startOf, WATER_TILE, START_IDS, DECOR_OFFSET, ZONES_OFFSET, SCRIPTS_OFFSET, SCRIPT_SIZE } from '../src/formats/map.ts';

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
  assert.equal(n, 2280 - 43); // the 43 pack-0 objects became markers
});

test('pack-0 objects are actor spawn markers and hero starts', () => {
  assert.equal(map.markers.length, 43);
  const byId = new Map<number, number>();
  for (const m of map.markers) byId.set(m.id, (byId.get(m.id) ?? 0) + 1);
  assert.equal(byId.get(16), 9); // nine zombies
  assert.equal(byId.get(8), 5);
  assert.deepEqual(startOf(map, 100), { id: 100, cx: 235, cy: 121 });
  assert.deepEqual(startOf(map, 101), { id: 101, cx: 235, cy: 123 });
  assert.deepEqual(startOf(map, 102), { id: 102, cx: 234, cy: 118 });
  assert.equal(Object.keys(START_IDS).length, 3);
  // all markers sit on real ground
  for (const m of map.markers) assert.ok(map.terrain[m.cy * 256 + m.cx]! > 0 && map.terrain[m.cy * 256 + m.cx] !== WATER_TILE);
});

test('section offsets add up to the file size (matches the editor loader read order)', () => {
  assert.equal(DECOR_OFFSET, 0x104048);
  assert.equal(ZONES_OFFSET, 0x184048);
  assert.equal(SCRIPTS_OFFSET, 0x190384);
  assert.equal(SCRIPTS_OFFSET + 64 * SCRIPT_SIZE, body.length);
});

test('every zone record key is a pack-0 marker cell (y<<8|x)', () => {
  const dv = new DataView(body.buffer, body.byteOffset, body.byteLength);
  let n = 0;
  for (let i = 0; i < 255; i++) {
    const key = dv.getUint32(ZONES_OFFSET + i * 196, true);
    if (!key) continue;
    n++;
    assert.ok(map.markers.some((m) => m.cx === (key & 255) && m.cy === key >> 8), `zone ${i} key ${key}`);
  }
  assert.equal(n, 32);
});

test('zone records become wander routes on the markers', () => {
  const withRoute = map.markers.filter((m) => m.route);
  assert.equal(withRoute.length, 32);
  const mage = map.markers.find((m) => m.cx === 158 && m.cy === 77)!;
  assert.equal(mage.route!.length, 8);
  assert.deepEqual(mage.route![0], { cx: 157, cy: 81 });
  for (const m of withRoute) for (const r of m.route!) assert.ok(Math.hypot(r.cx - m.cx, r.cy - m.cy) < 20, `route far from marker ${m.id}`);
});
