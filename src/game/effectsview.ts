import * as THREE from 'three';
import { cellToWorld } from '../iso.ts';
import { FX_TEXTURES, fxLook, type Fx } from './effects.ts';

/**
 * Draws `Game.fx` as additive quads on top of the sprites (no depth test: spell light is not hidden by trees).
 * Upright effects face the camera; flat ones are squashed 2:1 like the floor so rings read as lying on the ground.
 */
export class EffectsView {
  private readonly textures = new Map<number, THREE.Texture>();
  private readonly geometry = new THREE.PlaneGeometry(1, 1);
  private readonly live = new Map<Fx, THREE.Mesh>();
  readonly group = new THREE.Group();

  private constructor() {}

  static async load(base: string): Promise<EffectsView> {
    const v = new EffectsView();
    const loader = new THREE.TextureLoader();
    await Promise.all(FX_TEXTURES.map(async (id) => {
      try {
        const t = await loader.loadAsync(`${base}tex/gdi/3d/${id}.png`);
        t.colorSpace = THREE.SRGBColorSpace;
        v.textures.set(id, t);
      } catch { /* a missing texture just means that frame is skipped */ }
    }));
    return v;
  }

  /** Call once per frame with the game's current list. */
  sync(list: readonly Fx[]): void {
    const seen = new Set<Fx>();
    for (const f of list) {
      const look = fxLook(f);
      if (!look) continue;
      const tex = this.textures.get(look.tex);
      if (!tex) continue;
      seen.add(f);
      let m = this.live.get(f);
      if (!m) {
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, side: THREE.DoubleSide, color: f.color });
        m = new THREE.Mesh(this.geometry, mat);
        m.renderOrder = 1000;
        m.frustumCulled = false;
        this.live.set(f, m);
        this.group.add(m);
      }
      const mat = m.material as THREE.MeshBasicMaterial;
      if (mat.map !== tex) { mat.map = tex; mat.needsUpdate = true; }
      mat.opacity = Math.max(0, Math.min(1, look.alpha));
      const cx = f.follow ? f.follow.cx : f.cx, cy = f.follow ? f.follow.cy : f.cy;
      const w = cellToWorld(cx, cy);
      if (f.flat) {
        const wpx = look.size * 96; // ring texture spans ~94% of its quad; 1 cell of radius = 45 px across, 22 down
        m.scale.set(wpx, wpx / 2, 1);
        m.position.set(w.x, w.y, 900);
      } else {
        m.scale.set(look.size, look.size, 1);
        m.position.set(w.x, w.y + f.lift + look.size * 0.1, 900);
      }
    }
    for (const [f, m] of this.live) {
      if (seen.has(f)) continue;
      this.group.remove(m);
      (m.material as THREE.Material).dispose();
      this.live.delete(f);
    }
  }
}
