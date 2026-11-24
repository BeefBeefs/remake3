import * as THREE from 'three';

/** B16 atlases store [x,y,w,h]; P16 atlases add the raw hotspot [x,y,w,h,hx,hy]. */
export type Rect = [x: number, y: number, w: number, h: number, hx?: number, hy?: number];

export interface AtlasJson {
  image: string;
  size: [number, number];
  frames: Record<string, Rect>;
}

export type Anchor = 'center' | 'bottom';

/** One converted B16 bank (see tools/convert_assets.py): a packed PNG plus an id -> rect table. */
export class Atlas {
  readonly material: THREE.MeshBasicMaterial;
  private readonly geoms = new Map<string, THREE.PlaneGeometry>();

  private constructor(
    readonly json: AtlasJson,
    readonly texture: THREE.Texture,
  ) {
    // Colour-keyed art: hard cut-out, no blending (keeps depth-buffer sorting of sprites correct).
    this.material = new THREE.MeshBasicMaterial({ map: texture, transparent: false, alphaTest: 0.5, side: THREE.DoubleSide });
  }

  static async load(base: string, jsonPath: string): Promise<Atlas> {
    const json = (await (await fetch(`${base}${jsonPath}`)).json()) as AtlasJson;
    const tex = await new THREE.TextureLoader().loadAsync(`${base}${json.image}`);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    return new Atlas(json, tex);
  }

  /** Raw P16 hotspot (offset of the bitmap's top-left corner, see tools/convert_p16.py). */
  hotspot(id: number): [number, number] {
    const r = this.rect(id);
    return [r[4] ?? 0, r[5] ?? 0];
  }

  has(id: number): boolean {
    return String(id) in this.json.frames;
  }

  ids(): number[] {
    return Object.keys(this.json.frames).map(Number).sort((a, b) => a - b);
  }

  rect(id: number): Rect {
    const r = this.json.frames[String(id)];
    if (!r) throw new Error(`atlas frame ${id} missing`);
    return r;
  }

  geometry(id: number, anchor: Anchor = 'center'): THREE.PlaneGeometry {
    const key = `${id}:${anchor}`;
    let g = this.geoms.get(key);
    if (g) return g;
    const [x, y, w, h] = this.rect(id);
    const [aw, ah] = this.json.size;
    g = new THREE.PlaneGeometry(w, h);
    const u0 = x / aw, u1 = (x + w) / aw, v0 = 1 - (y + h) / ah, v1 = 1 - y / ah;
    const uv = g.attributes.uv as THREE.BufferAttribute;
    uv.setXY(0, u0, v1); uv.setXY(1, u1, v1); uv.setXY(2, u0, v0); uv.setXY(3, u1, v0);
    if (anchor === 'bottom') g.translate(0, h / 2, 0);
    this.geoms.set(key, g);
    return g;
  }

  mesh(id: number, anchor: Anchor = 'center'): THREE.Mesh {
    return new THREE.Mesh(this.geometry(id, anchor), this.material);
  }
}
