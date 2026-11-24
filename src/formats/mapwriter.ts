import {
  type GameMap, MAP_DIM, MAP_HEADER_SIZE, OBJECTS_OFFSET, SCRIPTS_OFFSET, SCRIPT_SIZE, TERRAIN_OFFSET, ZONES_OFFSET, ZONE_SIZE,
} from './map.ts';

/** Size of a whole map body (the decompressed `.map`): 1,655,172 bytes. */
export const MAP_BODY_SIZE = SCRIPTS_OFFSET + 64 * SCRIPT_SIZE;

/** An empty map body: header (100, tileset name, 2), every cell the given ground tile, no objects, no zones, no scripts. */
export function blankMapBody(tileset: string, tile: number): Uint8Array {
  const body = new Uint8Array(MAP_BODY_SIZE);
  const dv = new DataView(body.buffer);
  dv.setUint32(0, 100, true);
  dv.setUint32(68, 2, true);
  writeTileset(body, tileset);
  for (let i = 0; i < MAP_DIM * MAP_DIM; i++) dv.setUint32(TERRAIN_OFFSET + i * 12, tile, true);
  return body;
}

function writeTileset(body: Uint8Array, tileset: string): void {
  body.fill(0, 4, 68);
  for (let i = 0; i < Math.min(tileset.length, 63); i++) body[4 + i] = tileset.charCodeAt(i) & 255;
}

/**
 * The inverse of `parseMap`: `base` (the body the map was parsed from, or `blankMapBody`) with the map's ground, scenery and
 * markers written back. Everything the parser does not model (header fields, decor layer, zone data of markers that are still
 * there, scripts) is carried over untouched; the zone record of a marker that was deleted or moved is cleared.
 */
export function writeMapBody(map: GameMap, base: Uint8Array): Uint8Array {
  if (map.dim !== MAP_DIM) throw new Error('only 256x256 maps can be written');
  if (base.byteLength !== MAP_BODY_SIZE) throw new Error(`map body must be ${MAP_BODY_SIZE} bytes`);
  const out = base.slice();
  const dv = new DataView(out.buffer);
  const was = new Set<number>(); // cells that held a marker in `base`: only their zone records can go stale
  for (let i = 0; i < MAP_DIM * MAP_DIM; i++) { const o = dv.getUint32(OBJECTS_OFFSET + i * 4, true); if (o && o >> 10 === 0) was.add(((Math.floor(i / MAP_DIM)) << 8) | (i % MAP_DIM)); }
  if (map.tileset) writeTileset(out, map.tileset);
  const n = MAP_DIM * MAP_DIM;
  for (let i = 0; i < n; i++) {
    dv.setUint16(TERRAIN_OFFSET + i * 12, map.terrain[i]!, true); // the upper half of the u32 (flag bits on some maps) is left alone
    dv.setUint32(OBJECTS_OFFSET + i * 4, map.objects[i]!, true);
  }
  for (const m of map.markers) dv.setUint32(OBJECTS_OFFSET + (m.cy * MAP_DIM + m.cx) * 4, m.id, true); // pack 0: the id itself
  const at = new Set(map.markers.map((m) => (m.cy << 8) | m.cx));
  for (let z = 0; z < 255; z++) {
    const o = ZONES_OFFSET + z * ZONE_SIZE;
    const key = dv.getUint32(o, true);
    if (key && was.has(key) && !at.has(key)) out.fill(0, o, o + ZONE_SIZE);
  }
  return out;
}

/** gzip, the container of every `.map` file. */
export async function gzip(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export { MAP_HEADER_SIZE };
