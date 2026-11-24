import * as THREE from 'three';
import { Atlas } from '../assets/atlas.ts';
import { cellToWorld, depthOf } from '../iso.ts';

/**
 * Milestone-0 terrain slice: a procedurally laid out patch of the *Outside* tileset built from the real,
 * decoded ground tiles (VTiles) and scenery sprites (PackCell). It exists to prove the asset pipeline and the
 * isometric renderer; it is NOT yet the Lost Forrest map (the .map cell layout is still being decoded).
 */
export const GRID = 56;

// Tile ids picked by eye from the Outside VTiles bank (docs/FORMATS.md has the contact sheet recipe).
const GRASS = [1, 2, 3, 4, 5, 6, 7, 8, 9, ...Array.from({ length: 30 }, (_, i) => 221 + i)];
const GRASS_DARK = Array.from({ length: 18 }, (_, i) => 111 + i);
const DIRT = Array.from({ length: 14 }, (_, i) => 147 + i);
// PackCell scenery: trees / palm / bushes (anchored at the foot of the sprite).
const TREES = [407, 408, 410, 413, 414, 415, 416, 417, 418, 419, 420, 421, 422, 423, 424];
const BUSHES = [406, 409, 411, 412];

/** Small deterministic PRNG so every load gives the same slice. */
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class World {
  readonly group = new THREE.Group();
  /** true = cell can't be walked on (scenery footprint). */
  readonly blocked: boolean[][] = Array.from({ length: GRID }, () => Array<boolean>(GRID).fill(false));
  readonly start = { cx: 6, cy: 6 };

  constructor(tiles: Atlas, props: Atlas) {
    const rnd = mulberry32(0x4e53); // 'NS'
    const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)]!;

    // A winding dirt road along the map diagonal.
    const onRoad = (cx: number, cy: number) => {
      const t = (cx + cy) / 2;
      const centre = t + Math.sin(t * 0.22) * 5;
      return Math.abs(cx - centre) < 2.2;
    };

    for (let cy = 0; cy < GRID; cy++) {
      for (let cx = 0; cx < GRID; cx++) {
        const road = onRoad(cx, cy);
        const dark = !road && Math.sin(cx * 0.31) * Math.cos(cy * 0.27) > 0.45;
        const id = road ? pick(DIRT) : dark ? pick(GRASS_DARK) : pick(GRASS);
        const m = tiles.mesh(id, 'center');
        m.scale.y = 32 / 31; // tiles are 64x31 but the grid steps by 16px: stretch 1px to close the seams
        const p = cellToWorld(cx, cy);
        m.position.set(p.x, p.y, -1000 + depthOf(cx, cy) * 0.001); // ground always behind sprites
        this.group.add(m);
      }
    }

    // Scenery: trees in clusters, bushes sprinkled in, nothing on the road or the start area.
    for (let cy = 1; cy < GRID - 1; cy++) {
      for (let cx = 1; cx < GRID - 1; cx++) {
        if (onRoad(cx, cy)) continue;
        if (Math.hypot(cx - this.start.cx, cy - this.start.cy) < 4) continue;
        const forest = Math.sin(cx * 0.19 + 1.3) + Math.cos(cy * 0.23) > 0.55;
        const r = rnd();
        let id = 0;
        if (forest && r < 0.16) id = pick(TREES);
        else if (r < 0.04) id = pick(BUSHES);
        if (!id) continue;
        const isTree = TREES.includes(id);
        const m = props.mesh(id, 'bottom');
        const p = cellToWorld(cx, cy);
        m.position.set(p.x, p.y - 8, depthOf(cx, cy)); // foot sits a little below the cell centre
        this.group.add(m);
        if (isTree) this.blocked[cy]![cx] = true;
      }
    }
  }

  isWalkable(cx: number, cy: number): boolean {
    const ix = Math.floor(cx + 0.5), iy = Math.floor(cy + 0.5);
    if (ix < 0 || iy < 0 || ix >= GRID || iy >= GRID) return false;
    return !this.blocked[iy]![ix];
  }
}
