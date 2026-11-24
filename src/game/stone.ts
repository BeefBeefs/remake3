import { Atlas } from '../assets/atlas.ts';
import { cellToWorld, depthOf } from '../iso.ts';
import type { ActorAnims } from './anims.ts';
import { Creature, type Stats } from './creature.ts';

/**
 * The objective objects of three campaign missions: the Fragment of the Dark Goddess (mission 12: one large DarkStone, actor 70, and
 * five small ones, 71-75), the Cauldron of Damnation (mission 26: the cauldron 80 and its two tentacles 81 / 82) and the final
 * stones (mission 35). They are `CActorDarkStone` objects of the executable (class at 0x432ae0 / vtable 0x4984e4), not monsters:
 * no art in the actor packs, one shared sheet (`Actors/Stone.P16`, 27 frames) and a fixed picture per damage state.
 */
export const STONE_IDS = [70, 71, 72, 73, 74, 75, 80, 81, 82] as const;
export const isStoneId = (id: number | string): boolean => (STONE_IDS as readonly number[]).includes(Number(id));

/**
 * Per actor id: first frame (0-based; the sheet's frame ids are +1) of its three states, and the screen offset the draw routine
 * (0x432fc0, jump table 0x433210) adds to the actor's position before it blits (hotspots are subtracted, like every actor).
 * State frames are base + 0 (more than half the life left), + 1 (half or less) and + 2 (destroyed).
 */
export const STONE_ART: Record<number, { base: number; dx: number; dy: number }> = {
  70: { base: 0, dx: -76, dy: -36 },
  71: { base: 3, dx: -42, dy: -18 },
  72: { base: 6, dx: -42, dy: -18 },
  73: { base: 9, dx: -34, dy: -8 },
  74: { base: 12, dx: -34, dy: -14 },
  75: { base: 15, dx: -34, dy: -6 },
  80: { base: 18, dx: -66, dy: -54 },
  81: { base: 21, dx: -80, dy: -90 },
  82: { base: 24, dx: -86, dy: -50 },
};

/** Where the executable's position origin lies relative to the cell centre (px, y down); fitted so the pieces sit on their cells. */
const ORIGIN = { x: 0, y: -54 };

/** Damage state of a stone: 0 intact, 1 at half its life or less, 2 destroyed (0x43302a: life > max/2, else +1, life < 1 -> 2). */
export function stoneState(hp: number, max: number): 0 | 1 | 2 {
  if (hp < 1) return 2;
  return hp <= Math.trunc(max / 2) ? 1 : 0;
}

/** What a hero blow of `dmg` does to a stone: half of it (a third in mission 35), at least 2 (0x433250). */
export function stoneDamage(dmg: number, mapNumber: number): number {
  const d = mapNumber === 35 ? Math.trunc(dmg / 3) : Math.trunc(dmg / 2);
  return Math.max(2, d);
}

function stoneDef(id: number, name: string): ActorAnims {
  const art = STONE_ART[id]!;
  return { title: name, pack: 'stone', verified: true, foot: [ORIGIN.x + art.dx, ORIGIN.y + art.dy], anims: {} };
}

function stoneStats(name: string, hp: number): Stats {
  return { name, hp, damage: [0, 0], armor: 0, speed: 0, cooldown: [99, 99], hearing: 0, xp: [0, 0], race: 512, block: 0, stun: 0 };
}

export class StoneObj extends Creature {
  private ready = false;

  /** @param maxHp the INI life, which the damage states are measured against; @param hp the life it starts with (254 in mission 35) */
  constructor(readonly actorId: number, atlas: Atlas, name: string, readonly maxHp: number, hp: number, cx: number, cy: number) {
    super(stoneDef(actorId, name), atlas, stoneStats(name, hp), cx, cy);
    this.ready = true;
    this.apply();
  }

  protected override apply(): void {
    if (!this.ready) return;
    const art = STONE_ART[this.actorId]!;
    this.sprite.setFrame(art.base + stoneState(this.hp, this.maxHp) + 1);
    const w = cellToWorld(this.cx, this.cy);
    this.sprite.position.set(w.x, w.y, depthOf(this.cx, this.cy) + (this.alive ? 0.3 : 0.1));
    this.sprite.visible = true;
  }
}
