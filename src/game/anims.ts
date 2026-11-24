/** Animation layouts from public/assets/data/anims.json (built by tools/build_anims.py). */
export interface AnimDef { start: number; frames: number; speed: number }
export interface ActorAnims {
  title: string;
  /** Atlas name under p16/actors/ (lower-cased P16 file stem). */
  pack: string;
  /** true when the animation order was matched uniquely against the pack's frame count. */
  verified: boolean;
  /** true when only Andar/Respirar/Atacar are known (no death/hit animations). */
  partial?: boolean;
  /** Hotspot-space point of the actor's feet (see tools/build_anims.py). */
  foot: [number, number];
  anims: Record<string, AnimDef>;
}
export interface AnimData { dirs: string[]; actors: Record<string, ActorAnims> }

/** Seconds per animation "speed" unit. The INI speeds are in engine ticks; 1/60 s is a guess that looks natural. */
export const TICK = 1 / 60;

export function frameId(a: AnimDef, dir: number, step: number): number {
  return a.start + dir * a.frames + (step % a.frames);
}
