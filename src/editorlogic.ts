import { MAP_DIM, type GameMap } from './formats/map.ts';

/** What a click does in the map editor (the pure part of src/editor.ts, so it can be tested). */
export type Tool = 'ground' | 'scenery' | 'actor' | 'start' | 'erase' | 'pick';
export interface Brush { size: number; tile: number; pack: number; frame: number; actor: number; start: number }

/** Applies the brush at a cell: ground paints a size×size square, scenery sets one object, actors and starts are markers (one per cell; one start per hero), erase clears scenery and markers. */
export function applyBrush(map: GameMap, tool: Tool, b: Brush, cx: number, cy: number): void {
  const at = (x: number, y: number) => y * MAP_DIM + x;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < MAP_DIM && y < MAP_DIM;
  const dropMarker = (x: number, y: number) => { map.markers = map.markers.filter((m) => m.cx !== x || m.cy !== y); };
  if (tool === 'ground' || tool === 'erase') {
    const r0 = -Math.floor((b.size - 1) / 2);
    for (let dy = 0; dy < b.size; dy++) {
      for (let dx = 0; dx < b.size; dx++) {
        const x = cx + r0 + dx, y = cy + r0 + dy;
        if (!inside(x, y)) continue;
        if (tool === 'ground') map.terrain[at(x, y)] = b.tile;
        else { map.objects[at(x, y)] = 0; dropMarker(x, y); }
      }
    }
    return;
  }
  if (!inside(cx, cy)) return;
  if (tool === 'scenery') { dropMarker(cx, cy); map.objects[at(cx, cy)] = (b.pack << 10) | b.frame; }
  else if (tool === 'actor' || tool === 'start') {
    const id = tool === 'actor' ? b.actor : b.start;
    const old = map.markers.find((m) => m.cx === cx && m.cy === cy);
    dropMarker(cx, cy);
    if (tool === 'start') map.markers = map.markers.filter((m) => m.id !== id);
    map.objects[at(cx, cy)] = 0;
    map.markers.push(old && old.id === id && old.route ? { id, cx, cy, route: old.route } : { id, cx, cy });
  }
}
