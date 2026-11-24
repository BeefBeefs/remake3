import { Atlas } from '../assets/atlas.ts';
import { cellToWorld, depthOf } from '../iso.ts';
import { ActorSprite } from './actor.ts';
import { screenDir } from '../iso.ts';
import { type ActorAnims, type AnimDef, TICK, frameId } from './anims.ts';

export type State = 'idle' | 'walk' | 'attack' | 'hit' | 'dead' | 'block' | 'appear' | 'taunt' | 'bored';

export interface Stats {
  name: string;
  hp: number;
  /** damage range when this creature hits */
  damage: [number, number];
  armor: number;
  /** cells per second */
  speed: number;
  /** attack cooldown range, seconds */
  cooldown: [number, number];
  /** hearing / aggro radius in cells (monsters) */
  hearing: number;
  xp: [number, number];
  /** INI `Raza` family mask: 1 goblin, 2 orc, 4 undead, 8 beast, 16 troll, 32 demon, 64 human */
  race?: number;
  /** INI `Rnd_Bloqueo`: percent chance to cover against a frontal blow */
  block?: number;
  /** INI `Aturdirse`: a blow of at least this much staggers it (ranged: two more) */
  stun?: number;
}

const ONE_SHOT = new Set<State>(['attack', 'hit', 'dead', 'appear', 'taunt', 'bored']);
/** Plays once, then holds its last frame until the state changes. */
const HOLD = new Set<State>(['block']);
const ANIM_OF: Record<State, string> = {
  idle: 'Respirar', walk: 'Andar', attack: 'Atacar', hit: 'Recibir', dead: 'Morir', block: 'Cubrir',
  appear: 'Aparecer', taunt: 'Alarma', bored: 'Aburrido',
};

/** A hero or monster: position in cell space, facing, animation state and hit points. */
export class Creature {
  readonly sprite: ActorSprite;
  cx: number;
  cy: number;
  dir = 6; // S, towards the camera
  state: State = 'idle';
  hp: number;
  /** time spent in the current state */
  private t = 0;
  /** one-shot hit event fired this attack? */
  private struck = false;
  /** seconds until the next attack is allowed */
  cooldown = 0;
  deadFor = 0;
  onStrike: ((c: Creature) => void) | null = null;

  constructor(
    readonly def: ActorAnims,
    atlas: Atlas,
    readonly stats: Stats,
    cx: number,
    cy: number,
  ) {
    this.sprite = new ActorSprite(atlas, def.foot);
    this.cx = cx;
    this.cy = cy;
    this.hp = stats.hp;
    this.apply();
  }

  get alive(): boolean { return this.state !== 'dead'; }

  face(vx: number, vy: number): void {
    // cell-space vector -> screen vector
    this.dir = screenDir((vx - vy) * 32, -(vx + vy) * 16);
  }

  /** Dormant creatures (skeletons, infernal demons) lie as a pile / flame until the hero comes close, then `appear`. */
  dormant = false;
  /** Use the second attack animation (Atacar2: demons) for the current / next swing. */
  secondAttack = false;
  /** Strip played while walking: the heroes' packs hold a run (`Extra`) and a sneak (`Vigilar`) strip next to `Andar`. */
  walkAnim: 'Andar' | 'Extra' | 'Vigilar' = 'Andar';
  /** seconds spent standing still (drives the fidget animations) */
  idleFor = 0;

  private anim(state: State): AnimDef | undefined {
    const an = this.def.anims;
    if (state === 'attack' && this.secondAttack && an.Atacar2) return an.Atacar2;
    if (state === 'bored') return an.Aburrido ?? an.Vigilar;
    if (state === 'walk') return an[this.walkAnim] ?? an.Andar;
    if (state === 'hit') return an.Recibir ?? an.Recibir2;
    return an[ANIM_OF[state]];
  }

  /** Whether `state` has a real animation for this actor. */
  has(state: State): boolean { return !!this.anim(state); }

  setState(state: State): void {
    if (this.state === state || (this.state === 'dead')) return;
    if (!this.has(state) && state !== 'dead') return;
    this.state = state;
    this.t = 0;
    this.struck = false;
  }

  /** Duration of the current state's animation, seconds. */
  private duration(a: AnimDef): number { return a.frames * a.speed * TICK; }

  update(dt: number): void {
    this.t += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    const a = this.anim(this.state);
    this.idleFor = this.state === 'idle' ? this.idleFor + dt : 0;
    if (this.state === 'dead') this.deadFor += dt;
    if (a && ONE_SHOT.has(this.state) && this.state !== 'dead') {
      // the blow lands at about 55% of the swing
      if (this.state === 'attack' && !this.struck && this.t >= this.duration(a) * 0.55) {
        this.struck = true;
        this.onStrike?.(this);
      }
      if (this.t >= this.duration(a)) { this.state = 'idle'; this.t = 0; }
    }
    this.apply();
  }

  protected apply(): void {
    const a = this.anim(this.state) ?? this.anim('idle') ?? this.anim('walk');
    if (this.dormant && this.def.anims.Aparecer) {
      this.sprite.setFrame(frameId(this.def.anims.Aparecer, this.dir, 0));
    } else if (a) {
      let step = Math.floor(this.t / (a.speed * TICK));
      if (ONE_SHOT.has(this.state) || HOLD.has(this.state)) step = Math.min(step, a.frames - 1);
      this.sprite.setFrame(frameId(a, this.dir, step));
    }
    const w = cellToWorld(this.cx, this.cy);
    this.sprite.position.set(w.x, w.y, depthOf(this.cx, this.cy) + (this.alive ? 0.3 : 0.1));
    // actors without a death animation just vanish after a moment
    this.sprite.visible = this.alive || this.has('dead') || this.deadFor < 0.35;
  }

  /** Applies damage; returns true if this killed the creature. */
  hurt(amount: number, stagger = true): boolean {
    if (!this.alive) return false;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.state = 'dead'; this.t = 0; this.deadFor = 0;
      return true;
    }
    if (stagger && this.state !== 'attack') this.setState('hit');
    return false;
  }
}
