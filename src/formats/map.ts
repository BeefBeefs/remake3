/**
 * NightStone .map / .adv containers. See docs/FORMATS.md ("Maps").
 *
 * A .map file is a plain gzip stream. The decompressed body (1,655,172 bytes for "Lost Forrest") starts with a
 * 16 KiB header region followed by cell data. Only the header prefix is understood so far.
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
