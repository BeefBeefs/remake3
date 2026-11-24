/** Ground surface of a tile, inferred by tools/build_tiles.py (data/tiles.json). */
export type Surface = 'grass' | 'dirt' | 'stone' | 'wood' | 'water' | 'void';
export type TileTable = Record<string, Record<string, [number, number][]>>;

/** First footstep sound id per surface (the next id is the second foot): GDI/Audio 160.. j_andar_hierba / madera / piedra. */
export const STEP_SOUND: Record<Surface, number> = { grass: 160, dirt: 160, stone: 168, wood: 164, water: 160, void: 160 };

/** Builds a tile-id → surface lookup for one tileset ('outside' | 'cave' | 'dungeon'). Unknown ids count as grass outdoors, stone indoors. */
export function surfaceLookup(table: TileTable, tileset: string): (tileId: number) => Surface {
  const key = tileset.toLowerCase();
  const by = table[key] ?? {};
  const map = new Map<number, Surface>();
  for (const [surf, spans] of Object.entries(by)) for (const [lo, hi] of spans) for (let i = lo; i <= hi; i++) map.set(i, surf as Surface);
  const fallback: Surface = key === 'outside' ? 'grass' : 'stone';
  return (id) => map.get(id) ?? fallback;
}
