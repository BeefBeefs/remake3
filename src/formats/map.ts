/**
 * NightStone .map / .adv containers. See docs/FORMATS.md ("Maps").
 *
 * A .map file is a plain gzip stream. The decompressed body (1,655,172 bytes for "Lost Forrest") is:
 *   0x00000  header region (16 KiB; only the first 72 bytes are understood)
 *   0x04000  terrain: 256*256 cells, 12 bytes each, row-major (index = cy*256 + cx); the first u32 of a cell is the
 *            VTiles id (0 = void), the other 8 bytes are 0 in Lost Forrest
 *   0xC4000  72 bytes of unknown (6 extra 12-byte records)
 *   0xC4048  objects: 256*256 u32, row-major; value = (pack << 10) | frameId, pack 0..3 = PackCell, Pack1, Pack2, Pack3
 *            of the tileset; 0 = none. Pack 0 is special: its ids are NOT scenery but spawn markers (actor id N =
 *            IA-N, 100/101/102 = Barbarian/Amazon/Sorceress start). parseMap() lifts them into `markers`.
 *   0x104048 decor: 256*256 records of 4 u16 (8 bytes) - extra scenery sprite ids + an unknown flag field (not rendered)
 *   0x184048 255 zone records of 196 bytes (u32 key = packed cell (y<<8|x) of a PackCell object, then up to 32 packed
 *            cells, then 16 u32 of unknown data), 49,980 bytes
 *   0x190384 64 script records of 248 bytes (loot/trigger scripts: 8 command ids at +0x38, 8x4 u32 args at +0x78), 15,872 bytes
 * Verified by disassembling the editor's loader (read order and sizes) and by decoding Lost Forrest; see docs/FORMATS.md.
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

export const DECOR_OFFSET = OBJECTS_OFFSET + MAP_DIM * MAP_DIM * 4;
export const ZONES_OFFSET = DECOR_OFFSET + MAP_DIM * MAP_DIM * 8;
export const ZONE_SIZE = 196;
export const SCRIPTS_OFFSET = ZONES_OFFSET + 255 * ZONE_SIZE;
export const SCRIPT_SIZE = 248;

/** Pack-0 marker ids 100/101/102 are the hero start points (Barbarian, Amazon, Sorceress). */
export const START_IDS = { 100: 'Barbarian', 101: 'Amazon', 102: 'Sorceress' } as const;

/** A pack-0 object: an actor spawn (id = actor IA number) or a start point (100..102) or an unknown marker. */
export interface Marker {
  id: number; cx: number; cy: number;
  /** points from the marker's zone record (a few cells around it): the monster's wander/patrol route */
  route?: { cx: number; cy: number }[];
}

export interface GameMap {
  dim: number;
  tileset: string;
  /** VTiles id per cell, index = cy * dim + cx. */
  terrain: Uint16Array;
  /** (pack << 10) | frameId per cell, 0 = empty. Pack-0 markers are removed (see `markers`). */
  objects: Uint32Array;
  /** pack-0 objects, in row-major order */
  markers: Marker[];
}

/** Hero start cell for a class id (100 Barbarian, 101 Amazon, 102 Sorceress), if the map defines one. */
export function startOf(map: GameMap, classId: number): Marker | undefined {
  return map.markers.find((m) => m.id === classId);
}

export function parseMap(body: Uint8Array): GameMap {
  const header = parseMapHeader(body);
  const dv = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const n = MAP_DIM * MAP_DIM;
  if (body.byteLength < OBJECTS_OFFSET + n * 4) throw new Error('map body too short');
  const terrain = new Uint16Array(n);
  for (let i = 0; i < n; i++) terrain[i] = dv.getUint32(TERRAIN_OFFSET + i * 12, true);
  const objects = new Uint32Array(n);
  const markers: Marker[] = [];
  for (let i = 0; i < n; i++) {
    const o = dv.getUint32(OBJECTS_OFFSET + i * 4, true);
    if (o && o >> 10 === 0) markers.push({ id: o & 1023, cx: i % MAP_DIM, cy: Math.floor(i / MAP_DIM) });
    else objects[i] = o;
  }
  // Zone records: key = packed marker cell (y<<8|x), then up to 32 packed cells. Read as a patrol route (see FORMATS.md).
  if (body.byteLength >= SCRIPTS_OFFSET) {
    for (let z = 0; z < 255; z++) {
      const o = ZONES_OFFSET + z * ZONE_SIZE;
      const key = dv.getUint32(o, true);
      if (!key) continue;
      const m = markers.find((k) => k.cx === (key & 255) && k.cy === key >> 8);
      if (!m) continue;
      const route: { cx: number; cy: number }[] = [];
      for (let j = 0; j < 32; j++) {
        const v = dv.getUint32(o + 4 + j * 4, true);
        if (!v) break;
        route.push({ cx: v & 255, cy: v >> 8 });
      }
      if (route.length) m.route = route;
    }
  }
  return { dim: MAP_DIM, tileset: header.tileset, terrain, objects, markers };
}
