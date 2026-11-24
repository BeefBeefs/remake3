import * as THREE from 'three';
import { cellToWorld, depthOf } from '../iso.ts';
import { projectileAngle, type Projectile } from './projectiles.ts';

/** Arrow art: the original has no arrow sprite we have decoded, so one is painted: a shaft, a steel head and fletching. */
function arrowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 32; c.height = 8;
  const g = c.getContext('2d')!;
  g.fillStyle = '#7a5530'; g.fillRect(3, 3, 24, 2); // shaft
  g.fillStyle = '#cfd3d8'; g.beginPath(); g.moveTo(32, 4); g.lineTo(26, 1); g.lineTo(26, 7); g.closePath(); g.fill(); // head
  g.fillStyle = '#e8e0cc'; g.fillRect(0, 1, 5, 2); g.fillRect(0, 5, 5, 2); // fletching
  g.fillStyle = '#4a3820'; g.fillRect(3, 3, 24, 1);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Draws `Game.projectiles`: arrows are small rotated quads that the scenery can hide, bolts are additive glows. */
export class ProjectileView {
  readonly group = new THREE.Group();
  private readonly live = new Map<Projectile, THREE.Mesh>();
  private readonly geometry = new THREE.PlaneGeometry(1, 1);
  private readonly arrow = arrowTexture();
  private glow: THREE.Texture | null = null;

  static async load(base: string): Promise<ProjectileView> {
    const v = new ProjectileView();
    try {
      v.glow = await new THREE.TextureLoader().loadAsync(`${base}tex/gdi/3d/118.png`);
      v.glow.colorSpace = THREE.SRGBColorSpace;
    } catch { /* bolts fall back to the arrow quad */ }
    return v;
  }

  sync(list: readonly Projectile[]): void {
    const seen = new Set<Projectile>();
    for (const p of list) {
      seen.add(p);
      let m = this.live.get(p);
      const bolt = p.kind === 'bolt' && !!this.glow;
      if (!m) {
        const mat = bolt
          ? new THREE.MeshBasicMaterial({ map: this.glow!, transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, color: p.color })
          : new THREE.MeshBasicMaterial({ map: this.arrow, transparent: true, alphaTest: 0.2, side: THREE.DoubleSide });
        m = new THREE.Mesh(this.geometry, mat);
        m.frustumCulled = false;
        if (bolt) m.renderOrder = 1000;
        this.live.set(p, m);
        this.group.add(m);
      }
      const w = cellToWorld(p.cx, p.cy);
      if (bolt) {
        m.scale.set(54, 54, 1);
        m.position.set(w.x, w.y + 26, 900);
      } else {
        m.scale.set(44, 11, 1);
        m.rotation.z = projectileAngle(p);
        m.position.set(w.x, w.y + 26, depthOf(p.cx, p.cy) + 0.5);
      }
    }
    for (const [p, m] of this.live) {
      if (seen.has(p)) continue;
      this.group.remove(m);
      (m.material as THREE.Material).dispose();
      this.live.delete(p);
    }
  }
}
