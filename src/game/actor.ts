import * as THREE from 'three';
import { Atlas } from '../assets/atlas.ts';
import { HOTSPOT_X, HOTSPOT_Y } from './world.ts';

/** Direction order of the 8 P16 animation blocks (verified by eye on the Barbarian): NW, N, NE, E, SE, S, SW, W. */
export const DIR_NAMES = ['NW', 'N', 'NE', 'E', 'SE', 'S', 'SW', 'W'] as const;

/** 8-way direction index from a screen-space vector (x right, y up). */
export function screenDir(sx: number, sy: number): number {
  const a = Math.atan2(sx, sy); // 0 = up, clockwise
  return (Math.round(a / (Math.PI / 4)) + 1 + 8) % 8;
}

/** One animated sprite whose feet are at the object's origin; swaps a single quad between P16 frames. */
export class ActorSprite extends THREE.Mesh {
  private readonly posAttr: THREE.BufferAttribute;
  private readonly uvAttr: THREE.BufferAttribute;
  private current = -1;

  constructor(private readonly atlas: Atlas, readonly framesPerDir = 12) {
    const g = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(new Float32Array(12), 3);
    const uvAttr = new THREE.BufferAttribute(new Float32Array(8), 2);
    g.setAttribute('position', posAttr);
    g.setAttribute('uv', uvAttr);
    g.setIndex([0, 1, 2, 2, 1, 3]);
    super(g, atlas.material);
    this.posAttr = posAttr;
    this.uvAttr = uvAttr;
    this.frustumCulled = false;
  }

  /** Walk-cycle frame: block `dir` (0..7) of `framesPerDir` frames, step `step`. Ids are 1-based. */
  setWalkFrame(dir: number, step: number): void {
    this.setFrame(dir * this.framesPerDir + (step % this.framesPerDir) + 1);
  }

  setFrame(id: number): void {
    if (id === this.current || !this.atlas.has(id)) return;
    this.current = id;
    const [x, y, w, h] = this.atlas.rect(id);
    const [hx, hy] = this.atlas.hotspot(id);
    const [aw, ah] = this.atlas.json.size;
    const x0 = hx + HOTSPOT_X, top = -(hy + HOTSPOT_Y), y0 = top - h;
    this.posAttr.set([x0, y0, 0, x0 + w, y0, 0, x0, y0 + h, 0, x0 + w, y0 + h, 0]);
    const u0 = x / aw, u1 = (x + w) / aw, v0 = 1 - (y + h) / ah, v1 = 1 - y / ah;
    this.uvAttr.set([u0, v0, u1, v0, u0, v1, u1, v1]);
    this.posAttr.needsUpdate = true;
    this.uvAttr.needsUpdate = true;
  }
}
