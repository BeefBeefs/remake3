/** Animation layouts from public/assets/data/anims.json (built by tools/build_anims.py). */
export interface AnimDef {
  start: number;
  frames: number;
  speed: number;
  /** direction blocks stored: 8 (default), 4 for the heroes' death animation (screen direction d uses block d >> 1), 1 for NPC strips */
  dirs?: number;
}
export interface ActorAnims {
  title: string;
  /** Atlas name under p16/actors/ (lower-cased P16 file stem). */
  pack: string;
  /** true when the animation order was matched uniquely against the pack's frame count. */
  verified: boolean;
  /** true when only Andar/Respirar/Atacar are known (monsters without a matched layout). */
  partial?: boolean;
  /** NPC strip (single view, no directions) */
  npc?: boolean;
  /** Hotspot-space point of the actor's feet (see tools/build_anims.py). */
  foot: [number, number];
  anims: Record<string, AnimDef>;
}
export interface AnimData { dirs: string[]; actors: Record<string, ActorAnims> }

/** Seconds per animation "speed" unit: the animation clock gains 1 per engine tick (0x4233ca..) and a frame lasts `speed` of them. */
export const TICK = 1 / 35;

export function frameId(a: AnimDef, dir: number, step: number): number {
  const d = a.dirs === 4 ? dir >> 1 : a.dirs === 1 ? 0 : dir;
  return a.start + d * a.frames + (step % a.frames);
}
