/**
 * The maps this install can play. `Maps/Lost Forrest.map` is the solo mission; `NightStone.NHS` holds 34 more
 * (campaign missions, unpacked to `maps/nhs/<n>.map`, #35 is there too) and `Maps/Multiplayer` five deathmatch
 * arenas. Names of the campaign missions are not in the data we decoded, so they are numbered.
 */
import type { GameMap, Marker } from '../formats/map.ts';

export type MapGroup = 'Solo' | 'Campaign' | 'Multiplayer';
export interface MapEntry {
  id: string;
  name: string;
  group: MapGroup;
  /** file under `assets/` (gzip, see formats/map.ts) */
  file: string;
}

const MP: [string, string][] = [
  ['lost_forrest_8p', 'Lost Forrest (8 players)'],
  ['novus_ancestre_8p', 'Novus Ancestre (8 players)'],
  ['castle_of_khanon_4p', 'Castle of Khanon (4 players)'],
  ['caves_of_zatrack_8p', 'Caves of Zatrack (8 players)'],
  ['holocaust_8p', 'Holocaust (8 players)'],
];
const MP_FILE: Record<string, string> = {
  lost_forrest_8p: 'lost_forrest_8p-c2_.map', novus_ancestre_8p: 'novus_ancestre_8p-c1_.map', castle_of_khanon_4p: 'castle_of_khanon_4p-d1_.map',
  caves_of_zatrack_8p: 'caves_of_zatrack_8p-e1_.map', holocaust_8p: 'holocaust_8p-c2_.map',
};

export const MAPS: MapEntry[] = [
  { id: 'lost_forrest', name: 'Lost Forrest', group: 'Solo', file: 'maps/lost_forrest.map' },
  ...Array.from({ length: 35 }, (_, i): MapEntry => ({ id: `nhs/${i + 1}`, name: `Mission ${i + 1}`, group: 'Campaign', file: `maps/nhs/${i + 1}.${i + 1 === 4 ? 'MAP' : 'map'}` })),
  ...MP.map(([id, name]): MapEntry => ({ id: `mp/${id}`, name, group: 'Multiplayer', file: `maps/multiplayer/${MP_FILE[id]!}` })),
];

export function findMap(id: string | null | undefined): MapEntry | undefined {
  if (!id) return undefined;
  const k = id.toLowerCase().replace(/^nhs\/(\d+)$/, 'nhs/$1');
  return MAPS.find((m) => m.id === k) ?? MAPS.find((m) => m.id === `nhs/${k}`) ?? MAPS.find((m) => m.id.endsWith(`/${k}`));
}

/** Folder name under Scenary/ (and the converted atlases) for a map's tileset: Outside, Cave or Dungeon. */
export const tilesetDir = (map: Pick<GameMap, 'tileset'>): string => map.tileset.toLowerCase();

/**
 * Where the hero starts: the marker of his class (100 Barbarian, 101 Amazon, 102 Sorceress); multiplayer arenas place
 * players at 110-112, 120-122... so those fall back to the lowest start marker (id 100 and up, never an actor).
 */
export function mapStart(map: Pick<GameMap, 'markers'>, classId: number): Marker | undefined {
  const own = map.markers.find((m) => m.id === classId);
  if (own) return own;
  const starts = map.markers.filter((m) => m.id >= 100).sort((a, b) => a.id - b.id);
  return starts[0];
}
