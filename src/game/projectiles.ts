/**
 * Arrows and magic bolts in flight. Pure data (cell space) so the game logic can create, move and test them;
 * `projectileview.ts` draws them. The original has an Arquero (archer), Mago (mage) and Zelos that shoot from a
 * distance (INI `Tipo_IA` 3) and the Amazon's bow; speed and flight time are the executable's; the looks are guesses.
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

/**
 * Flight, from the executable (arrow object update at 0x4250a0, shot set-up at 0x42f290 / 0x437750 / 0x43cf79): the shot moves
 * `px` screen pixels a tick along the longer screen axis of its direction, flies 60 ticks at most, and hits the first creature
 * within 16 pixels that is not its shooter. Hero arrows 10 px/tick, the Sorceress's bolts 8, Arquero / Mago / Zelos shots 9.
 */
export const PX_HERO_ARROW = 10, PX_HERO_BOLT = 8, PX_MONSTER_SHOT = 9;
export const FLIGHT_TICKS = 60;
export const HIT_PIXELS = 16;
const FPS = 35;

/** Screen pixels covered by one cell of travel in the direction (dx, dy) (cells are 64x32 pixel diamonds). */
export function pixelsPerCell(dx: number, dy: number): number {
  const d = Math.hypot(dx, dy) || 1;
  return Math.max(Math.abs(dx - dy) * 32, Math.abs(dx + dy) * 16) / d;
}

/** Distance in screen pixels between two cell positions. */
export function pixelDistance(dx: number, dy: number): number {
  return Math.hypot((dx - dy) * 32, (dx + dy) * 16);
}

export function makeProjectile(kind: ProjKind, cx: number, cy: number, dirx: number, diry: number, pxPerTick: number, friendly: boolean, hit: Projectile['hit'], color = 0xffffff): Projectile {
  const d = Math.hypot(dirx, diry) || 1;
  const speed = (pxPerTick * FPS) / pixelsPerCell(dirx, diry); // cells per second
  return { kind, cx, cy, vx: (dirx / d) * speed, vy: (diry / d) * speed, age: 0, life: FLIGHT_TICKS / FPS, friendly, color, trail: 0, done: false, hit };
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
