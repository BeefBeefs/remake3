/**
 * NightStone .map / .adv containers. See docs/FORMATS.md ("Maps").
 *
 * A .map file is a plain gzip stream. The decompressed body (1,655,172 bytes for "Lost Forrest") is:
 *   0x00000  header region (16 KiB; only the first 72 bytes are understood)
 *   0x04000  terrain: 256*256 cells, 12 bytes each, row-major (index = cy*256 + cx); the first u32 of a cell is the
 *            VTiles id (0 = void), the other 8 bytes are 0 in Lost Forrest
 *   0xC4000  72 bytes of unknown (6 extra 12-byte records)
 *   0xC4048  objects: 256*256 u32, row-major; value = (pack << 10) | frameId, pack 0..3 = PackCell, Pack1, Pack2, Pack3
 *            of the tileset; 0 = none. More sparse u32 layers follow (not decoded yet).
 * Layout derived by inspection (see docs/FORMATS.md); the exe's loader has not been fully traced.
 */
export async function gunzip(data: ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  const src = data instanceof Uint8Array ? data : new Uint8Array(data);
  const stream = new Blob([src as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export interface MapHeader {
  /** First u32: 100 in every shipped map (meaning not yet confirmed - likely map dimension). */
  field0: number;
  /** NUL-terminated tileset name at offset 4 ("Outside", "Cave", "Dungeon" ...). */
  tileset: string;
  /** u32 at offset 68 (2 in Lost Forrest, meaning unknown). */
  field68: number;
}

export const MAP_HEADER_SIZE = 16384;

export function parseMapHeader(body: Uint8Array): MapHeader {
  const dv = new DataView(body.buffer, body.byteOffset, body.byteLength);
  let end = 4;
  while (end < 68 && body[end] !== 0) end++;
  return {
    field0: dv.getUint32(0, true),
    tileset: new TextDecoder('latin1').decode(body.subarray(4, end)),
    field68: dv.getUint32(68, true),
  };
}

export const MAP_DIM = 256;
export const TERRAIN_OFFSET = MAP_HEADER_SIZE;
export const OBJECTS_OFFSET = MAP_HEADER_SIZE + MAP_DIM * MAP_DIM * 12 + 72;
/** Terrain id 511 is not a VTiles frame: it marks the water cells (rivers/ponds) that the bridges cross. */
export const WATER_TILE = 511;

export interface GameMap {
  dim: number;
  tileset: string;
  /** VTiles id per cell, index = cy * dim + cx. */
  terrain: Uint16Array;
  /** (pack << 10) | frameId per cell, 0 = empty. */
  objects: Uint32Array;
}

export function parseMap(body: Uint8Array): GameMap {
  const header = parseMapHeader(body);
  const dv = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const n = MAP_DIM * MAP_DIM;
  if (body.byteLength < OBJECTS_OFFSET + n * 4) throw new Error('map body too short');
  const terrain = new Uint16Array(n);
  for (let i = 0; i < n; i++) terrain[i] = dv.getUint32(TERRAIN_OFFSET + i * 12, true);
  const objects = new Uint32Array(n);
  for (let i = 0; i < n; i++) objects[i] = dv.getUint32(OBJECTS_OFFSET + i * 4, true);
  return { dim: MAP_DIM, tileset: header.tileset, terrain, objects };
}
