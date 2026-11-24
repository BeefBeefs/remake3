/**
 * Isometric projection used by the original ground tiles (64x31 diamonds, VTiles/PackCell banks).
 * World space is three.js style: +x right, +y up. Cell (0,0) is the top corner of the map; cx grows to the
 * lower right on screen, cy grows to the lower left.
 */
export const TILE_W = 64;
export const TILE_H = 32;

export function cellToWorld(cx: number, cy: number): { x: number; y: number } {
  return { x: ((cx - cy) * TILE_W) / 2, y: (-(cx + cy) * TILE_H) / 2 };
}

export function worldToCell(x: number, y: number): { cx: number; cy: number } {
  const a = x / (TILE_W / 2);
  const b = -y / (TILE_H / 2);
  return { cx: (a + b) / 2, cy: (b - a) / 2 };
}

/** Painter's-algorithm depth for a cell-space position; larger = nearer the viewer. */
export function depthOf(cx: number, cy: number): number {
  return cx + cy;
}
