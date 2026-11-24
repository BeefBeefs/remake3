/**
 * Arrows and magic bolts in flight. Pure data (cell space) so the game logic can create, move and test them;
 * `projectileview.ts` draws them. The original has an Arquero (archer), Mago (mage) and Zelos that shoot from a
 * distance (INI `Tipo_IA` 3) and the Amazon's bow; speeds, ranges and looks here are guesses.
 */
import type { Creature } from './creature.ts';

export type ProjKind = 'arrow' | 'bolt';

export interface Projectile {
  kind: ProjKind;
  cx: number;
  cy: number;
  /** cells per second */
  vx: number;
  vy: number;
  age: number;
  /** seconds in the air before it falls (flight range / speed) */
  life: number;
  /** shot by the hero (hits monsters) or by a monster (hits the hero) */
  friendly: boolean;
  /** bolt tint, 0xRRGGBB */
  color: number;
  /** seconds until the next trail puff (bolts) */
  trail: number;
  done: boolean;
  /** called once on impact with the creature it struck (null: it hit scenery) */
  hit: (target: Creature | null) => void;
}

export const ARROW_SPEED = 16;
export const BOLT_SPEED = 9;

export function makeProjectile(kind: ProjKind, cx: number, cy: number, dirx: number, diry: number, range: number, friendly: boolean, hit: Projectile['hit'], color = 0xffffff): Projectile {
  const d = Math.hypot(dirx, diry) || 1;
  const speed = kind === 'arrow' ? ARROW_SPEED : BOLT_SPEED;
  return { kind, cx, cy, vx: (dirx / d) * speed, vy: (diry / d) * speed, age: 0, life: range / speed, friendly, color, trail: 0, done: false, hit };
}

/** Screen angle (radians, 0 = right, counter-clockwise) of the flight direction, for rotating the sprite. */
export function projectileAngle(p: Pick<Projectile, 'vx' | 'vy'>): number {
  return Math.atan2(-(p.vx + p.vy) * 16, (p.vx - p.vy) * 32);
}

/** Whether nothing blocks a straight line between two cell positions (sampled every half cell). */
export function lineClear(walkable: (cx: number, cy: number) => boolean, ax: number, ay: number, bx: number, by: number): boolean {
  const d = Math.hypot(bx - ax, by - ay);
  for (let s = 0.5; s < d - 0.5; s += 0.5) {
    if (!walkable(ax + ((bx - ax) * s) / d, ay + ((by - ay) * s) / d)) return false;
  }
  return true;
}
