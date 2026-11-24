import { MAP_DIM, type GameMap, type MapScript, type ScriptCmd } from './formats/map.ts';

/** What a click does in the map editor (the pure part of src/editor.ts, so it can be tested). */
export type Tool = 'ground' | 'scenery' | 'actor' | 'start' | 'script' | 'erase' | 'pick';
export interface Brush { size: number; tile: number; pack: number; frame: number; actor: number; start: number; script?: number }

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
        else { map.objects[at(x, y)] = 0; map.scriptAt[at(x, y)] = -1; dropMarker(x, y); }
      }
    }
    return;
  }
  if (!inside(cx, cy)) return;
  if (tool === 'script') { if (b.script !== undefined && map.scripts.some((sc) => sc.index === b.script)) map.scriptAt[at(cx, cy)] = b.script; return; }
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

/** The scripts the file can hold: indexes 0..62 (a cell stores `index + 1` in 6 bits). */
export const MAX_SCRIPTS = 63;

/** Adds an empty script in the first free slot and returns it (null when the table is full). */
export function newScript(map: GameMap, name = ''): MapScript | null {
  for (let i = 0; i < MAX_SCRIPTS; i++) {
    if (map.scripts.some((sc) => sc.index === i)) continue;
    const sc: MapScript = { index: i, name, commands: [{ id: 12, args: [0, 0, 0, 0] }] };
    map.scripts.push(sc);
    map.scripts.sort((a, b) => a.index - b.index);
    return sc;
  }
  return null;
}

/** Deletes a script and every cell that pointed at it. */
export function deleteScript(map: GameMap, index: number): void {
  map.scripts = map.scripts.filter((sc) => sc.index !== index);
  for (let i = 0; i < map.scriptAt.length; i++) if (map.scriptAt[i] === index) map.scriptAt[i] = -1;
}

/** What each command takes (docs/FORMATS.md "Scripts"); `args` names the arguments that matter, the rest stay 0. */
export const COMMANDS: { id: number; label: string; args: string[] }[] = [
  { id: 1, label: 'Roll loot', args: ['type mask', 'chest level'] },
  { id: 2, label: 'Move hero to', args: ['x', 'y'] },
  { id: 3, label: 'Exit level if no enemies', args: ['race mask'] },
  { id: 4, label: 'Add time', args: ['seconds'] },
  { id: 5, label: 'Create enemy', args: ['actor − 1', 'direction 0-7', 'x', 'y'] },
  { id: 7, label: 'Remove object at', args: ['x', 'y'] },
  { id: 8, label: 'Remove object here', args: [] },
  { id: 9, label: 'Drop item', args: ['item id'] },
  { id: 10, label: 'Effect', args: ['effect id'] },
  { id: 11, label: 'Exit level if hero has item', args: ['item id'] },
  { id: 12, label: 'Complete level', args: [] },
  { id: 13, label: 'Play sound', args: ['sound id'] },
];

export const blankCommand = (id: number): ScriptCmd => ({ id, args: [0, 0, 0, 0] });
