import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { parseMap, MAP_DIM } from '../src/formats/map.ts';
import { blankMapBody, writeMapBody, gzip, MAP_BODY_SIZE } from '../src/formats/mapwriter.ts';
import { gunzip } from '../src/formats/map.ts';

const dir = new URL('../public/assets/maps/nhs/', import.meta.url);
const load = (f: string) => new Uint8Array(gunzipSync(readFileSync(new URL(f, dir))));

test('writing an unedited map gives back the same bytes (all 35 campaign maps)', () => {
  let n = 0;
  for (const f of readdirSync(dir)) {
    const body = load(f);
    assert.equal(body.byteLength, MAP_BODY_SIZE);
    const out = writeMapBody(parseMap(body), body);
    assert.ok(Buffer.compare(Buffer.from(out), Buffer.from(body)) === 0, `${f} differs`);
    n++;
  }
  assert.equal(n, 35);
});

test('edits survive a write and a parse: ground, scenery, markers (moving a marker clears its zone)', () => {
  const body = load('5.map');
  const map = parseMap(body);
  map.terrain[10 * MAP_DIM + 20] = 345;
  map.objects[11 * MAP_DIM + 21] = (1 << 10) | 775;
  const routed = map.markers.find((m) => m.route)!;
  const gone = { ...routed };
  map.markers = map.markers.filter((m) => m !== routed);
  map.markers.push({ id: 5, cx: 30, cy: 31 });
  const back = parseMap(writeMapBody(map, body));
  assert.equal(back.terrain[10 * MAP_DIM + 20], 345);
  assert.equal(back.objects[11 * MAP_DIM + 21], (1 << 10) | 775);
  assert.ok(back.markers.some((m) => m.id === 5 && m.cx === 30 && m.cy === 31));
  assert.ok(!back.markers.some((m) => m.cx === gone.cx && m.cy === gone.cy && m.id === gone.id));
  assert.equal(back.scripts.length, parseMap(body).scripts.length, 'scripts are untouched');
});

test('a blank map has the tileset, a flat ground and nothing else; it gzips and reads back', async () => {
  const body = blankMapBody('Cave', 77);
  const map = parseMap(body);
  assert.equal(map.tileset, 'Cave');
  assert.ok(map.terrain.every((t) => t === 77));
  assert.ok(map.objects.every((o) => o === 0) && map.markers.length === 0 && map.scripts.length === 0);
  const gz = await gzip(body);
  assert.ok(gz.byteLength < 20000, `${gz.byteLength} bytes`);
  assert.deepEqual(await gunzip(gz), body);
});
