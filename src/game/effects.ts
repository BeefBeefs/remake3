/**
 * Spell and ability visual effects. The original draws them as additive Direct3D sprites from `GDI/3D/*.bmp`:
 * 64-72 flame frames, 75/76 red / green puffs, 77 an orange glow, 100 an orange ring, 101 a blue-white ring, 102 a
 * white ring, 103 a green glow, 104 a small ring, 118/119 blue / warm flares and 120-133 a sparkling ice spirit
 * (14 frames: grows, then shrinks). Which texture goes with which spell is a guess from how they look; sizes, timings
 * and colours are mine. This module is pure data (no three.js) so the game logic can create and test effects;
 * `effectsview.ts` draws them.
 */
import type { Creature } from './creature.ts';

/** Texture ids (GDI/3D) the effects use. */
export const FLAME = [64, 65, 66, 67, 68, 69, 70, 71, 72];
export const ICE = [120, 121, 122, 123, 124, 125, 126, 127, 128, 129, 130, 131, 132, 133];
export const FX_TEXTURES = [...FLAME, 75, 76, 77, 100, 101, 102, 103, 104, 118, 119, ...ICE];

export interface Fx {
  /** one texture, or frames played evenly over the life */
  tex: number | number[];
  cx: number;
  cy: number;
  /** a creature to stay on (its position is read every frame; kept where it fell when it dies) */
  follow?: Creature;
  /** pixels above the ground point (flames and glows sit on the body) */
  lift: number;
  /** lies on the ground (squashed like the floor tiles) instead of facing the camera */
  flat: boolean;
  /** seconds before it appears */
  delay: number;
  age: number;
  life: number;
  /** size at the start and end: pixels (width) for upright effects, cells (radius) for flat ones */
  size0: number;
  size1: number;
  alpha0: number;
  alpha1: number;
  /** tint, 0xRRGGBB */
  color: number;
}

export type FxOpts = Partial<Omit<Fx, 'tex' | 'cx' | 'cy' | 'age'>>;

export function makeFx(tex: Fx['tex'], cx: number, cy: number, o: FxOpts = {}): Fx {
  return { tex, cx, cy, lift: 0, flat: false, delay: 0, life: 1, size0: 64, size1: 64, alpha0: 1, alpha1: 0, color: 0xffffff, ...o, age: 0 };
}

/** What a spell looks like: expanding rings from the caster plus something on every enemy it touches. */
export function spellFx(id: number, cx: number, cy: number, radius: number, hits: Creature[]): Fx[] {
  const out: Fx[] = [];
  const ring = (tex: number, o: FxOpts = {}) => out.push(makeFx(tex, cx, cy, { flat: true, size0: 0.5, size1: radius, life: 0.8, alpha0: 1, alpha1: 0, ...o }));
  const onEach = (make: (m: Creature) => Fx[]) => { for (const m of hits) out.push(...make(m)); };
  const self = (tex: Fx['tex'], o: FxOpts = {}) => out.push(makeFx(tex, cx, cy, { lift: 24, ...o }));
  switch (id) {
    case 86: // light: a white wave and a flash on everything it blinds
      ring(102, { life: 0.7 });
      self(119, { size0: 60, size1: 220, life: 0.5 });
      onEach((m) => [makeFx(118, m.cx, m.cy, { follow: m, lift: 28, size0: 30, size1: 110, life: 0.6 })]);
      break;
    case 87: // storm: two blue-white waves, a hard flash on every enemy
      ring(101, { life: 0.6 });
      ring(101, { life: 0.8, delay: 0.25 });
      self(118, { size0: 80, size1: 300, life: 0.45 });
      onEach((m) => [
        makeFx(118, m.cx, m.cy, { follow: m, lift: 28, size0: 140, size1: 40, life: 0.5, delay: 0.1 }),
        makeFx(101, m.cx, m.cy, { follow: m, flat: true, size0: 0.3, size1: 1.8, life: 0.6, delay: 0.1 }),
      ]);
      break;
    case 88: // ice: a frost wave, then the ice spirit forms on every enemy
      ring(101, { life: 0.9, color: 0x7fd0ff });
      onEach((m) => [makeFx(ICE, m.cx, m.cy, { follow: m, lift: 30, size0: 120, size1: 120, life: 1.4, alpha0: 1, alpha1: 0.9 })]);
      break;
    case 89: // fire: an orange ring and flames licking at every enemy
      ring(100);
      onEach((m) => [0, 1, 2].map((k) => makeFx(FLAME, m.cx, m.cy, { follow: m, lift: 4 + k * 10, size0: 64, size1: 64, life: 1.2, delay: 0.1 + k * 0.12, alpha0: 1, alpha1: 0.8 })).flat());
      break;
    case 90: // incineration: two rings, a glow, a pyre on every enemy
      ring(100, { life: 0.9 });
      ring(100, { life: 1.1, delay: 0.2, color: 0xffd080 });
      self(77, { size0: 100, size1: 360, life: 0.7 });
      onEach((m) => [0, 1, 2, 3, 4].map((k) => makeFx(FLAME, m.cx, m.cy, { follow: m, lift: k * 9, size0: 84, size1: 84, life: 2.2, delay: 0.1 + k * 0.1, alpha0: 1, alpha1: 0.7 })).flat());
      break;
    case 91: // earth: a brown shock wave, dust on every enemy
      ring(100, { life: 0.9, color: 0x9a6a38 });
      self(77, { size0: 80, size1: 300, life: 0.8, color: 0x9a6a38 });
      onEach((m) => [makeFx(77, m.cx, m.cy, { follow: m, lift: 10, size0: 40, size1: 150, life: 0.9, color: 0xb98a50 })]);
      break;
    case 92: case 93: // life, vitality: a green glow rises through the hero
      self(103, { size0: 160, size1: 100, life: 1.2, lift: 28 });
      ring(104, { size0: 0.3, size1: 2.2, life: 1.0, color: 0x80ff90 });
      break;
    case 95: case 96: case 97: case 98: { // a single attribute: a ring that closes in, tinted by the attribute
      const col = { 95: 0xff6a4a, 96: 0xffe070, 97: 0x6aff7a, 98: 0x6aa8ff }[id as 95 | 96 | 97 | 98];
      ring(102, { size0: 3, size1: 0.3, life: 0.8, alpha0: 0.2, alpha1: 1, color: col });
      self(118, { size0: 20, size1: 160, life: 0.6, color: col, delay: 0.5 });
      break;
    }
    case 99: case 100: // sacred / of the gods: gold wave and a warm flare
      ring(102, { size0: 3, size1: 0.3, life: 0.9, alpha0: 0.2, alpha1: 1, color: 0xffd860 });
      ring(100, { life: 1.1, delay: 0.6, color: 0xffe9a0 });
      self(119, { size0: 40, size1: 300, life: 0.9, delay: 0.5 });
      break;
    case 101: // berserk: red ring and red puffs
      ring(100, { life: 0.9, color: 0xff3020 });
      for (let k = 0; k < 4; k++) self(75, { lift: 10 + k * 14, size0: 40, size1: 130, life: 0.9, delay: k * 0.12 });
      break;
    case 102: // immunity: blue flare and a closing ring
      ring(101, { size0: 3, size1: 0.3, life: 0.8, alpha0: 0.2, alpha1: 1 });
      self(118, { size0: 30, size1: 260, life: 0.8, delay: 0.4 });
      break;
    case 103: // restoration of weapons
      self(119, { size0: 30, size1: 160, life: 0.7 });
      ring(104, { size0: 0.3, size1: 1.8, life: 0.8 });
      break;
    default:
      self(118, { size0: 30, size1: 140, life: 0.6 });
  }
  return out;
}

/** Level-up: a warm flare and a ring. */
export function levelUpFx(cx: number, cy: number): Fx[] {
  return [
    makeFx(119, cx, cy, { lift: 28, size0: 50, size1: 280, life: 0.9 }),
    makeFx(101, cx, cy, { flat: true, size0: 0.3, size1: 3, life: 1.0, color: 0xffe9a0 }),
  ];
}

/** Drinking a potion: a small glow in the potion's colour (life red, stamina yellow, mana blue). */
export function potionFx(cx: number, cy: number, bits: number): Fx[] {
  const col = bits & 4 && !(bits & 3) ? 0x5a9aff : bits & 2 && !(bits & 5) ? 0xffe060 : bits & 1 && !(bits & 6) ? 0xff5a5a : 0xffffff;
  return [makeFx(103, cx, cy, { lift: 26, size0: 110, size1: 60, life: 0.8, color: col })];
}

/** Advances effects and drops finished ones (in place). */
export function stepFx(list: Fx[], dt: number): void {
  for (let i = list.length - 1; i >= 0; i--) {
    const f = list[i]!;
    if (f.delay > 0) { f.delay -= dt; if (f.delay > 0) continue; f.age += -f.delay; f.delay = 0; } else f.age += dt;
    if (f.age >= f.life) list.splice(i, 1);
  }
}

/** Current look of an effect: texture, size, opacity (0..1 through its life). */
export function fxLook(f: Fx): { tex: number; size: number; alpha: number } | null {
  if (f.delay > 0) return null;
  const t = Math.min(1, Math.max(0, f.age / f.life));
  const tex = Array.isArray(f.tex) ? f.tex[Math.min(f.tex.length - 1, Math.floor(t * f.tex.length))]! : f.tex;
  // ease-out growth, linear fade
  const e = 1 - (1 - t) * (1 - t);
  return { tex, size: f.size0 + (f.size1 - f.size0) * e, alpha: f.alpha0 + (f.alpha1 - f.alpha0) * t };
}
