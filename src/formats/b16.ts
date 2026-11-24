/**
 * B16 image bank (tiles, item icons, UI art). See docs/FORMATS.md.
 *
 *   u32 count
 *   count × { u32 id, u16 width, u16 height, u16 pixels[width*height] }   (RGB565 LE, 0xF81F = transparent)
 *   4092 trailing bytes (purpose unknown; ignored)
 */
export const COLOR_KEY = 0xf81f;

export interface B16Frame {
  id: number;
  width: number;
  height: number;
  pixels: Uint16Array;
}

export function parseB16(buf: ArrayBuffer): { frames: B16Frame[]; trailing: number } {
  const dv = new DataView(buf);
  const count = dv.getUint32(0, true);
  let pos = 4;
  const frames: B16Frame[] = [];
  for (let i = 0; i < count; i++) {
    const id = dv.getUint32(pos, true);
    const width = dv.getUint16(pos + 4, true);
    const height = dv.getUint16(pos + 6, true);
    pos += 8;
    const n = width * height;
    // Copy: the source offset is not guaranteed to be 2-byte aligned.
    const pixels = new Uint16Array(n);
    for (let p = 0; p < n; p++) pixels[p] = dv.getUint16(pos + p * 2, true);
    pos += n * 2;
    frames.push({ id, width, height, pixels });
  }
  return { frames, trailing: buf.byteLength - pos };
}

/** RGB565 -> [r,g,b,a] (0..255), with the colour key mapped to alpha 0. */
export function rgb565ToRgba(px: number): [number, number, number, number] {
  let r = ((px >> 11) & 31) << 3;
  let g = ((px >> 5) & 63) << 2;
  let b = (px & 31) << 3;
  r |= r >> 5;
  g |= g >> 6;
  b |= b >> 5;
  return [r, g, b, px === COLOR_KEY ? 0 : 255];
}
