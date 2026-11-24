import * as THREE from 'three';
import { Atlas } from '../assets/atlas.ts';
import { type GameMap, WATER_TILE } from '../formats/map.ts';
import { cellToWorld, depthOf } from '../iso.ts';
import { QuadBatch } from './batch.ts';

/**
 * P16 hotspots are raw offsets (px) of a bitmap's top-left corner. Measured on the Barbarian walk cycle (feet at
 * x -127.75, y -17) and on the Lost Forrest camp objects, the engine's reference point is offset by (128, 16) px: with a sprite anchored at its cell centre (or an actor's feet):
 *   topLeft = anchor + (hx + 128, hy + 16)   (screen px, y down).
 * The 32 px wall slices of the map border (Pack2 600-625) do NOT follow it: their hotspots put them ~6-7 cells
 * (about 100 px up and 200 px left) away from the line of cells that carries them, i.e. into the playable area
 * where they hide the hero. They are therefore drawn standing on their own cell (see `wallRect`).
 */
export const HOTSPOT_X = 128;
export const HOTSPOT_Y = 16;

export const CHUNK = 16;
/** Chunks loaded around the player (Chebyshev). 3 covers a widescreen view plus the tallest scenery. */
const LOAD_RADIUS = 3;

/** Sprites at least this tall (px) block movement (trees, walls, barrels...). */
const BLOCK_HEIGHT = 30;

/** Pack2 border-wall slices (one per cell along the map edge) and the invisible blocker that fills the gaps between them. */
export const WALL_PACK = 2;
export const WALL_FIRST = 600;
export const WALL_LAST = 625;
export const WALL_BLOCKER = 599;
export const isWallSlice = (pack: number, id: number): boolean => pack === WALL_PACK && id >= WALL_FIRST && id <= WALL_LAST;

/** Screen rectangle (x of left edge, y of bottom edge, y up) of a wall slice standing on the cell centred at p. */
export function wallRect(p: { x: number; y: number }, w: number): { x: number; bottom: number } {
  return { x: p.x - w / 2, bottom: p.y - 12 };
}

const WATER = new THREE.MeshBasicMaterial({ color: 0x1c3446, side: THREE.DoubleSide });

export class World {
  readonly group = new THREE.Group();
  readonly dim: number;
  readonly blocked: Uint8Array;
  private readonly chunks = new Map<number, THREE.Group>();
  private readonly chunksPerRow: number;

  /** @param packs scenery atlases indexed by the map's pack number (PackCell, Pack1, Pack2, Pack3). */
  constructor(
    readonly map: GameMap,
    private readonly tiles: Atlas,
    private readonly packs: Atlas[],
  ) {
    this.dim = map.dim;
    this.chunksPerRow = Math.ceil(map.dim / CHUNK);
    this.blocked = new Uint8Array(map.dim * map.dim);
    for (let i = 0; i < this.blocked.length; i++) {
      const t = map.terrain[i]!;
      if (t === 0 || t === WATER_TILE) this.blocked[i] = 1;
      const o = map.objects[i]!;
      if (o) {
        const atlas = packs[o >> 10];
        const id = o & 1023;
        if (atlas && atlas.has(id) && atlas.rect(id)[3] >= BLOCK_HEIGHT) this.blocked[i] = 1;
        if (o >> 10 === WALL_PACK && id === WALL_BLOCKER) this.blocked[i] = 1;
      }
    }
  }

  /** Nearest unblocked cell to (cx, cy), for choosing a spawn point. */
  findOpenCell(cx: number, cy: number): { cx: number; cy: number } {
    for (let r = 0; r < 40; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = cx + dx, y = cy + dy;
          if (this.inBounds(x, y) && !this.blocked[y * this.dim + x]) return { cx: x, cy: y };
        }
      }
    }
    return { cx, cy };
  }

  inBounds(cx: number, cy: number): boolean {
    return cx >= 0 && cy >= 0 && cx < this.dim && cy < this.dim;
  }

  /** Changes the object at a cell (0 removes it) and rebuilds the visible chunk and the cell's collision. */
  setObject(cx: number, cy: number, value: number): void {
    if (!this.inBounds(cx, cy)) return;
    const i = cy * this.dim + cx;
    this.map.objects[i] = value;
    const t = this.map.terrain[i]!;
    let b = t === 0 || t === WATER_TILE;
    if (value) {
      const atlas = this.packs[value >> 10], id = value & 1023;
      if (atlas && atlas.has(id) && atlas.rect(id)[3] >= BLOCK_HEIGHT) b = true;
    }
    this.blocked[i] = b ? 1 : 0;
    const key = Math.floor(cy / CHUNK) * this.chunksPerRow + Math.floor(cx / CHUNK);
    const g = this.chunks.get(key);
    if (g) {
      this.group.remove(g);
      g.traverse((o) => { if (o instanceof THREE.Mesh && o.geometry) o.geometry.dispose(); });
      this.chunks.delete(key);
    }
  }

  isWalkable(cx: number, cy: number): boolean {
    const ix = Math.floor(cx + 0.5), iy = Math.floor(cy + 0.5);
    return this.inBounds(ix, iy) && !this.blocked[iy * this.dim + ix];
  }

  /** Builds the chunks around the given cell and drops the ones that are far away. */
  update(cx: number, cy: number): void {
    const ccx = Math.floor(cx / CHUNK), ccy = Math.floor(cy / CHUNK);
    for (const [key, g] of this.chunks) {
      const kx = key % this.chunksPerRow, ky = Math.floor(key / this.chunksPerRow);
      if (Math.max(Math.abs(kx - ccx), Math.abs(ky - ccy)) > LOAD_RADIUS + 1) {
        this.group.remove(g);
        g.traverse((o) => { if (o instanceof THREE.Mesh && o.geometry) o.geometry.dispose(); });
        this.chunks.delete(key);
      }
    }
    for (let ky = ccy - LOAD_RADIUS; ky <= ccy + LOAD_RADIUS; ky++) {
      for (let kx = ccx - LOAD_RADIUS; kx <= ccx + LOAD_RADIUS; kx++) {
        if (kx < 0 || ky < 0 || kx >= this.chunksPerRow || ky >= this.chunksPerRow) continue;
        const key = ky * this.chunksPerRow + kx;
        if (!this.chunks.has(key)) {
          const g = this.buildChunk(kx, ky);
          this.chunks.set(key, g);
          this.group.add(g);
        }
      }
    }
  }

  private buildChunk(kx: number, ky: number): THREE.Group {
    const group = new THREE.Group();
    const ground = new QuadBatch(this.tiles);
    const scenery = this.packs.map((p) => new QuadBatch(p));
    const water: number[] = [];
    const x1 = Math.min((kx + 1) * CHUNK, this.dim), y1 = Math.min((ky + 1) * CHUNK, this.dim);
    for (let cy = ky * CHUNK; cy < y1; cy++) {
      for (let cx = kx * CHUNK; cx < x1; cx++) {
        const i = cy * this.dim + cx;
        const p = cellToWorld(cx, cy);
        const t = this.map.terrain[i]!;
        if (t === WATER_TILE) {
          water.push(p.x - 32, p.y, -999, p.x, p.y + 16, -999, p.x + 32, p.y, -999, p.x, p.y - 16, -999);
        } else if (t && this.tiles.has(t)) {
          // tiles are 64x31 but the grid steps by 16 px: stretch to 32 to close the seams
          ground.add(t, p.x - 32, p.y - 16, 64, 32, -1000);
        }
        let o = this.map.objects[i]!;
        // The map's wall line has an empty frame (599) between slices; a plain slice stands in so the wall has no holes.
        if (o === ((WALL_PACK << 10) | WALL_BLOCKER)) o = (WALL_PACK << 10) | (cx + cy & 1 ? 610 : 600);
        if (o) {
          const atlas = this.packs[o >> 10], id = o & 1023;
          if (atlas && atlas.has(id)) {
            const [, , w, h] = atlas.rect(id);
            const [hx, hy] = atlas.hotspot(id);
            if (isWallSlice(o >> 10, id)) {
              const r = wallRect(p, w);
              scenery[o >> 10]!.add(id, r.x, r.bottom, w, h, depthOf(cx, cy), true);
            } else {
              const top = p.y - (hy + HOTSPOT_Y);
              scenery[o >> 10]!.add(id, p.x + hx + HOTSPOT_X, top - h, w, h, depthOf(cx, cy));
            }
          }
        }
      }
    }
    const g = ground.build();
    if (g) group.add(g);
    for (const s of scenery) { const m = s.build(); if (m) group.add(m); }
    if (water.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(water, 3));
      const idx: number[] = [];
      for (let q = 0; q < water.length / 12; q++) idx.push(q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3);
      geo.setIndex(idx);
      group.add(new THREE.Mesh(geo, WATER));
    }
    return group;
  }
}
