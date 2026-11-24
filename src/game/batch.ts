import * as THREE from 'three';
import { Atlas } from '../assets/atlas.ts';

/** Collects many atlas quads into one mesh (one draw call per chunk and atlas). */
export class QuadBatch {
  private pos: number[] = [];
  private uv: number[] = [];
  private idx: number[] = [];
  private n = 0;
  constructor(private readonly atlas: Atlas) {}

  /** Adds frame `id` with its bottom-left corner at world (x0, y0), size w*h, depth z (`flip`: true or 1 mirrors it left-right, 2 top-bottom, 3 both). */
  add(id: number, x0: number, y0: number, w: number, h: number, z: number, flip: boolean | number = 0): void {
    const [x, y, fw, fh] = this.atlas.rect(id);
    const [aw, ah] = this.atlas.json.size;
    let u0 = x / aw, u1 = (x + fw) / aw, v0 = 1 - (y + fh) / ah, v1 = 1 - y / ah;
    const f = flip === true ? 1 : flip === false ? 0 : flip;
    if (f & 1) [u0, u1] = [u1, u0];
    if (f & 2) [v0, v1] = [v1, v0];
    this.pos.push(x0, y0, z, x0 + w, y0, z, x0, y0 + h, z, x0 + w, y0 + h, z);
    this.uv.push(u0, v0, u1, v0, u0, v1, u1, v1);
    const b = this.n * 4;
    this.idx.push(b, b + 1, b + 2, b + 2, b + 1, b + 3);
    this.n++;
  }

  get count(): number { return this.n; }

  build(): THREE.Mesh | null {
    if (!this.n) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.n * 4 > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    return new THREE.Mesh(g, this.atlas.material);
  }
}
