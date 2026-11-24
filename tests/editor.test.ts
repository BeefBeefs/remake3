import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyBrush, type Brush } from '../src/editorlogic.ts';
import { parseMap, MAP_DIM, SCRIPTS_OFFSET, SCRIPT_SIZE } from '../src/formats/map.ts';
import { blankMapBody, writeMapBody } from '../src/formats/mapwriter.ts';

const brush = (o: Partial<Brush> = {}): Brush => ({ size: 1, tile: 340, pack: 1, frame: 775, actor: 5, start: 100, ...o });
const fresh = () => parseMap(blankMapBody('Outside', 1));

test('ground paints a square brush and clips at the map edge', () => {
  const m = fresh();
  applyBrush(m, 'ground', brush({ size: 3, tile: 345 }), 10, 10);
  assert.equal(m.terrain.filter((t) => t === 345).length, 9);
  applyBrush(m, 'ground', brush({ size: 3, tile: 7 }), 0, 0);
  assert.equal(m.terrain.filter((t) => t === 7).length, 4);
});

test('scenery, monsters and starts: one thing per cell, one start per hero, erase clears all', () => {
  const m = fresh();
  applyBrush(m, 'scenery', brush(), 20, 20);
  assert.equal(m.objects[20 * MAP_DIM + 20], (1 << 10) | 775);
  applyBrush(m, 'actor', brush({ actor: 5 }), 20, 20); // replaces the scenery
  assert.equal(m.objects[20 * MAP_DIM + 20], 0);
  assert.deepEqual(m.markers, [{ id: 5, cx: 20, cy: 20 }]);
  applyBrush(m, 'scenery', brush(), 20, 20); // and scenery replaces the marker
  assert.equal(m.markers.length, 0);
  applyBrush(m, 'start', brush({ start: 100 }), 5, 5);
  applyBrush(m, 'start', brush({ start: 100 }), 6, 6);
  assert.deepEqual(m.markers, [{ id: 100, cx: 6, cy: 6 }], 'a hero has one start');
  applyBrush(m, 'erase', brush({ size: 3 }), 6, 6);
  assert.equal(m.markers.length, 0);
});

test('an edited map written and read back has what was painted', () => {
  const body = blankMapBody('Cave', 9);
  const m = parseMap(body);
  applyBrush(m, 'ground', brush({ size: 2, tile: 12 }), 100, 100);
  applyBrush(m, 'actor', brush({ actor: 17 }), 101, 103);
  applyBrush(m, 'start', brush({ start: 101 }), 90, 90);
  const back = parseMap(writeMapBody(m, body));
  assert.equal(back.tileset, 'Cave');
  assert.equal(back.terrain[100 * MAP_DIM + 100], 12);
  assert.deepEqual(back.markers.map((k) => [k.id, k.cx, k.cy]).sort(), [[101, 90, 90], [17, 101, 103]].sort());
});

import { newScript, deleteScript, MAX_SCRIPTS } from '../src/editorlogic.ts';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

test('scripts can be added, put on cells, edited, deleted; they survive a write and read back', () => {
  const body = blankMapBody('Outside', 1);
  const m = parseMap(body);
  const a = newScript(m, 'Bdt Entrar')!;
  a.commands = [{ id: 2, args: [78, 229, 0, 0] }];
  const b = newScript(m)!;
  assert.deepEqual([a.index, b.index], [0, 1]);
  applyBrush(m, 'script', brush({ script: 0 }), 30, 40);
  applyBrush(m, 'script', brush({ script: 0 }), 31, 40);
  applyBrush(m, 'script', brush({ script: 9 }), 32, 40); // no such script: ignored
  applyBrush(m, 'script', brush({ script: 1 }), 50, 50);
  const back = parseMap(writeMapBody(m, body));
  assert.equal(back.scripts.length, 2);
  assert.deepEqual(back.scripts[0], { index: 0, name: 'Bdt Entrar', commands: [{ id: 2, args: [78, 229, 0, 0] }] });
  assert.equal(back.scriptAt[40 * MAP_DIM + 30], 0);
  assert.equal(back.scriptAt[40 * MAP_DIM + 31], 0);
  assert.equal(back.scriptAt[40 * MAP_DIM + 32], -1);
  assert.equal(back.scriptAt[50 * MAP_DIM + 50], 1);
  // erase takes the script off the cell; deleting a script clears the others
  applyBrush(m, 'erase', brush(), 30, 40);
  deleteScript(m, 0);
  const again = parseMap(writeMapBody(m, writeMapBody(m, body)));
  assert.deepEqual(again.scripts.map((s) => s.index), [1]);
  assert.ok(again.scriptAt.every((v, i) => v === (i === 50 * MAP_DIM + 50 ? 1 : -1)));
});

test('editing a script of a real map changes only that script and the table limit is enforced', () => {
  const body = new Uint8Array(gunzipSync(readFileSync(new URL('../public/assets/maps/nhs/10.map', import.meta.url))));
  const m = parseMap(body);
  const t = m.scripts.find((s) => s.name === 'Bdt Entrar')!;
  t.commands[0]!.args[0] = 100;
  const out = writeMapBody(m, body);
  const lo = SCRIPTS_OFFSET + t.index * SCRIPT_SIZE;
  let diff = 0;
  out.forEach((v, i) => { if (v !== body[i]) { diff++; assert.ok(i >= lo && i < lo + SCRIPT_SIZE, `byte ${i} outside the script's record`); } });
  assert.ok(diff > 0, 'something changed');
  assert.equal(parseMap(out).scripts.find((s) => s.index === t.index)!.commands[0]!.args[0], 100);
  const full = parseMap(blankMapBody('Outside', 1));
  for (let i = 0; i < MAX_SCRIPTS; i++) assert.ok(newScript(full));
  assert.equal(newScript(full), null);
});

import { clearRoute } from '../src/editorlogic.ts';
import { ZONES_OFFSET, ZONE_SIZE, MAX_ROUTE } from '../src/formats/map.ts';

test('patrol routes: pick a monster, click cells in order, write, read back; clear removes it', () => {
  const body = blankMapBody('Outside', 340);
  const map = parseMap(body);
  const b: Brush = { size: 1, tile: 340, pack: 1, frame: 0, actor: 1, start: 100 };
  applyBrush(map, 'actor', b, 10, 12);
  applyBrush(map, 'route', b, 20, 20); // nothing picked yet: ignored
  assert.equal(map.markers[0]!.route, undefined);
  applyBrush(map, 'route', b, 10, 12); // picks the monster
  for (const [x, y] of [[11, 12], [12, 12], [12, 12], [12, 14]] as const) applyBrush(map, 'route', b, x, y);
  assert.deepEqual(map.markers[0]!.route, [{ cx: 11, cy: 12 }, { cx: 12, cy: 12 }, { cx: 12, cy: 14 }]); // the repeated cell is not added twice
  const out = writeMapBody(map, body);
  const dv = new DataView(out.buffer);
  assert.equal(dv.getUint32(ZONES_OFFSET, true), (12 << 8) | 10, 'record keyed by the packed marker cell');
  assert.equal(dv.getUint32(ZONES_OFFSET + 4, true), (12 << 8) | 11);
  assert.equal(dv.getUint32(ZONES_OFFSET + 4 + 12, true), 0, 'terminated');
  const back = parseMap(out);
  assert.deepEqual(back.markers[0]!.route, map.markers[0]!.route);
  // a second monster gets the next free record
  applyBrush(map, 'actor', b, 30, 30); applyBrush(map, 'route', b, 30, 30); applyBrush(map, 'route', b, 31, 30);
  const two = parseMap(writeMapBody(map, body));
  assert.equal(two.markers.filter((m) => m.route).length, 2);
  // clearing
  clearRoute(map, 10, 12);
  const cleared = parseMap(writeMapBody(map, out));
  assert.equal(cleared.markers.find((m) => m.cx === 10)!.route, undefined);
});

test('a patrol route holds 32 cells at most; the unknown words of a record survive an edit', () => {
  const body = blankMapBody('Outside', 340);
  const dv0 = new DataView(body.buffer);
  const map = parseMap(body);
  const b: Brush = { size: 1, tile: 340, pack: 1, frame: 0, actor: 1, start: 100 };
  applyBrush(map, 'actor', b, 5, 5); applyBrush(map, 'route', b, 5, 5);
  for (let i = 0; i < 40; i++) applyBrush(map, 'route', b, 6 + i, 5);
  assert.equal(map.markers[0]!.route!.length, MAX_ROUTE);
  const first = writeMapBody(map, body);
  // pretend the record has unknown data after the cells, then shorten the route
  const dv = new DataView(first.buffer);
  const o = ZONES_OFFSET + 4 + 128;
  dv.setUint32(o, 0xdeadbeef, true);
  const m2 = parseMap(first);
  m2.markers[0]!.route = m2.markers[0]!.route!.slice(0, 3);
  const second = writeMapBody(m2, first);
  assert.equal(new DataView(second.buffer).getUint32(o, true), 0xdeadbeef);
  assert.equal(parseMap(second).markers[0]!.route!.length, 3);
  void dv0; void ZONE_SIZE;
});
