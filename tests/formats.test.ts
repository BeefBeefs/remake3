// Format tests run against the real game data. Point NST_GAME_DIR at the output of `npm run extract`
// (default ./game); they are skipped when the data is not there.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseB16, rgb565ToRgba, COLOR_KEY } from '../src/formats/b16.ts';
import { gunzip, parseMapHeader, MAP_HEADER_SIZE } from '../src/formats/map.ts';

const dir = process.env.NST_GAME_DIR ?? 'game';
const have = existsSync(join(dir, 'Scenary/OutSide/PackCell.b16'));
const ab = (p: string) => { const b = readFileSync(join(dir, p)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; };

test('B16: Outside PackCell parses to 54 frames + 4092 trailing bytes', { skip: !have }, () => {
  const { frames, trailing } = parseB16(ab('Scenary/OutSide/PackCell.b16'));
  assert.equal(frames.length, 54);
  assert.equal(trailing, 4092);
  assert.deepEqual([frames[0]!.id, frames[0]!.width, frames[0]!.height], [1, 64, 31]);
  assert.ok(frames.some((f) => f.width === 138 && f.height === 200 && f.id === 407)); // a tree
});

test('B16: every shipped bank has the same 4092-byte tail', { skip: !have }, () => {
  for (const p of ['Scenary/Cave/VTiles.b16', 'System/IListData.b16', 'System/AListData.b16', 'GDI/Graphics/Menu.b16']) {
    assert.equal(parseB16(ab(p)).trailing, 4092, p);
  }
});

test('RGB565 colour key is transparent', () => {
  assert.equal(rgb565ToRgba(COLOR_KEY)[3], 0);
  assert.deepEqual(rgb565ToRgba(0xffff), [255, 255, 255, 255]);
});

test('Map: Lost Forrest gunzips and exposes the tileset name', { skip: !have }, async () => {
  const body = await gunzip(ab('Maps/Lost Forrest.map'));
  assert.equal(body.length, 1655172);
  const h = parseMapHeader(body);
  assert.equal(h.field0, 100);
  assert.equal(h.tileset, 'Outside');
  assert.ok(body.length > MAP_HEADER_SIZE);
});
