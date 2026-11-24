import * as THREE from 'three';
import { Atlas } from '../assets/atlas.ts';

export { DIR_NAMES, screenDir } from '../iso.ts';

/** One sprite whose feet are at the object's origin; swaps a single quad between P16 frames. */
export class ActorSprite extends THREE.Mesh {
  private readonly posAttr: THREE.BufferAttribute;
  private readonly uvAttr: THREE.BufferAttribute;
  private current = -1;

  /** @param foot hotspot-space point that should land on the actor's position (from anims.json) */
  constructor(private readonly atlas: Atlas, private readonly foot: [number, number]) {
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

  setFrame(id: number): void {
    if (id === this.current || !this.atlas.has(id)) return;
    this.current = id;
    const [x, y, w, h] = this.atlas.rect(id);
    const [hx, hy] = this.atlas.hotspot(id);
    const [aw, ah] = this.atlas.json.size;
    const x0 = hx - this.foot[0], top = -(hy - this.foot[1]), y0 = top - h;
    this.posAttr.set([x0, y0, 0, x0 + w, y0, 0, x0, y0 + h, 0, x0 + w, y0 + h, 0]);
    const u0 = x / aw, u1 = (x + w) / aw, v0 = 1 - (y + h) / ah, v1 = 1 - y / ah;
    this.uvAttr.set([u0, v0, u1, v0, u0, v1, u1, v1]);
    this.posAttr.needsUpdate = true;
    this.uvAttr.needsUpdate = true;
  }
}
