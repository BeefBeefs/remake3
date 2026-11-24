import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyBrush, type Brush } from '../src/editorlogic.ts';
import { parseMap, MAP_DIM } from '../src/formats/map.ts';
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
