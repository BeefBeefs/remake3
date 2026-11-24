import * as THREE from 'three';
import { Atlas } from '../assets/atlas.ts';
import { type AnimData } from './anims.ts';
import { Creature, type Stats } from './creature.ts';
import { World } from './world.ts';

type Range = [number, number];
interface ActorIni {
  General?: { Vel_Ataque?: Range; Altura?: number };
  HDP?: { Vida?: number; Fuerza?: Range; Armadura?: number; Pts_Experiencia?: Range; Velocidad?: number };
  IA?: { Oido?: number };
}

/** Everything the simulation needs to be loaded from /assets (see main.ts). */
export interface GameData {
  anims: AnimData;
  actors: Record<string, ActorIni>;
  names: Record<string, string>;
  atlases: Map<string, Atlas>;
}

const HERO_ID = '100';
const HERO_SPEED = 3.2; // cells per second
const MONSTER_SPEED = 1.7;
const MELEE = 1.35; // cells
const HIT_RANGE = 1.9; // hero swing reach, cells
/** Engine ticks of the INI cooldown (Vel_Ataque) in seconds; 1/30 is a guess. */
const AI_TICK = 1 / 30;

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Game {
  readonly hero: Creature;
  readonly monsters: Creature[] = [];
  readonly group = new THREE.Group();
  kills = 0;
  xp = 0;
  /** The enemy the hero is walking up to / fighting. */
  target: Creature | null = null;
  walkTarget: { cx: number; cy: number } | null = null;
  private facing = { x: 0, y: 1 };
  private readonly rnd = mulberry32(0x4e53);

  constructor(private readonly world: World, private readonly data: GameData, start: { cx: number; cy: number }) {
    this.hero = this.make(HERO_ID, start.cx, start.cy, { hp: 60, damage: [3, 7], speed: HERO_SPEED, name: data.names[HERO_ID] ?? 'Hero' });
    this.hero.onStrike = () => this.heroStrike();
    this.group.add(this.hero.sprite);
    this.populate(start);
  }

  private make(id: string, cx: number, cy: number, over: Partial<Stats> = {}): Creature {
    const def = this.data.anims.actors[id]!;
    const ini = this.data.actors[id] ?? {};
    const atlas = this.data.atlases.get(def.pack)!;
    const hdp = ini.HDP ?? {};
    const cd = ini.General?.Vel_Ataque ?? [25, 70];
    const stats: Stats = {
      name: this.data.names[id] ?? def.title,
      hp: hdp.Vida ?? 10,
      damage: hdp.Fuerza ?? [1, 3],
      armor: hdp.Armadura ?? 0,
      speed: MONSTER_SPEED * (hdp.Velocidad ?? 1),
      cooldown: [cd[0] * AI_TICK, cd[1] * AI_TICK],
      hearing: ini.IA?.Oido ?? 3,
      xp: hdp.Pts_Experiencia ?? [1, 2],
      ...over,
    };
    return new Creature(def, atlas, stats, cx, cy);
  }

  /** Scatters a few monsters around the start; the real placement lives in the (undecoded) adventure file. */
  private populate(start: { cx: number; cy: number }): void {
    const kinds = ['1', '1', '1', '2', '2', '3', '5', '1', '2', '3'];
    for (const id of kinds) {
      for (let tries = 0; tries < 60; tries++) {
        const a = this.rnd() * Math.PI * 2, r = 7 + this.rnd() * 10;
        const cx = Math.round(start.cx + Math.cos(a) * r), cy = Math.round(start.cy + Math.sin(a) * r);
        if (!this.world.isWalkable(cx, cy)) continue;
        const m = this.make(id, cx, cy);
        m.dir = Math.floor(this.rnd() * 8);
        this.monsters.push(m);
        this.group.add(m.sprite);
        break;
      }
    }
  }

  /** Called with a cell-space click position. */
  click(cx: number, cy: number): void {
    if (!this.hero.alive) return;
    let best: Creature | null = null, bd = 1.3;
    for (const m of this.monsters) {
      if (!m.alive) continue;
      const d = Math.hypot(m.cx - cx, m.cy - cy);
      if (d < bd) { bd = d; best = m; }
    }
    this.target = best;
    this.walkTarget = best ? null : { cx, cy };
  }

  /** Space bar: swing in the current facing direction. */
  swing(): void {
    if (this.hero.alive) this.tryAttack();
  }

  private tryAttack(): boolean {
    const h = this.hero;
    if (h.cooldown > 0 || h.state === 'attack' || h.state === 'hit') return false;
    h.face(this.facing.x, this.facing.y);
    h.setState('attack');
    h.cooldown = 0.35;
    return true;
  }

  private heroStrike(): void {
    const h = this.hero;
    for (const m of this.monsters) {
      if (!m.alive) continue;
      const dx = m.cx - h.cx, dy = m.cy - h.cy, d = Math.hypot(dx, dy);
      if (d > HIT_RANGE) continue;
      if (d > 0.6 && (dx * this.facing.x + dy * this.facing.y) / d < 0.2) continue; // must be in front
      const [lo, hi] = h.stats.damage;
      const dmg = Math.max(1, lo + Math.floor(this.rnd() * (hi - lo + 1)) - m.stats.armor);
      if (m.hurt(dmg)) {
        this.kills++;
        this.xp += m.stats.xp[0] + Math.floor(this.rnd() * (m.stats.xp[1] - m.stats.xp[0] + 1));
      }
    }
  }

  private monsterStrike(m: Creature): void {
    const h = this.hero;
    if (!h.alive || Math.hypot(h.cx - m.cx, h.cy - m.cy) > MELEE + 0.5) return;
    const [lo, hi] = m.stats.damage;
    h.hurt(Math.max(1, lo + Math.floor(this.rnd() * (hi - lo + 1)) - h.stats.armor));
  }

  /** @param move cell-space unit vector from the keyboard, or null */
  update(dt: number, move: { x: number; y: number } | null): void {
    const h = this.hero;
    this.updateHero(dt, move);
    for (const m of this.monsters) this.updateMonster(m, dt);
    h.update(dt);
    for (const m of this.monsters) m.update(dt);
  }

  private step(c: Creature, vx: number, vy: number, speed: number, dt: number): void {
    const nx = c.cx + vx * speed * dt, ny = c.cy + vy * speed * dt;
    if (this.world.isWalkable(nx, ny)) { c.cx = nx; c.cy = ny; }
    else if (this.world.isWalkable(nx, c.cy)) c.cx = nx;
    else if (this.world.isWalkable(c.cx, ny)) c.cy = ny;
  }

  private updateHero(dt: number, move: { x: number; y: number } | null): void {
    const h = this.hero;
    if (!h.alive) return;
    if (h.state === 'attack' || h.state === 'hit') return;
    let vx = 0, vy = 0;
    if (move) {
      this.target = null; this.walkTarget = null;
      vx = move.x; vy = move.y;
    } else if (this.target && this.target.alive) {
      const ex = this.target.cx - h.cx, ey = this.target.cy - h.cy, d = Math.hypot(ex, ey);
      this.facing = { x: ex / (d || 1), y: ey / (d || 1) };
      if (d <= MELEE) { this.tryAttack(); }
      else { vx = ex / d; vy = ey / d; }
    } else if (this.walkTarget) {
      const ex = this.walkTarget.cx - h.cx, ey = this.walkTarget.cy - h.cy, d = Math.hypot(ex, ey);
      if (d < 0.1) this.walkTarget = null;
      else { vx = ex / d; vy = ey / d; }
    } else this.target = null;
    if (vx || vy) {
      this.facing = { x: vx, y: vy };
      h.face(vx, vy);
      h.setState('walk');
      const before = { x: h.cx, y: h.cy };
      this.step(h, vx, vy, h.stats.speed, dt);
      if (!this.target && Math.hypot(h.cx - before.x, h.cy - before.y) < 1e-4) this.walkTarget = null; // blocked
    } else if (h.state === 'walk') h.setState('idle');
  }

  private updateMonster(m: Creature, dt: number): void {
    if (!m.alive) return;
    const h = this.hero;
    if (m.state === 'attack' || m.state === 'hit') return;
    const ex = h.cx - m.cx, ey = h.cy - m.cy, d = Math.hypot(ex, ey);
    const aggro = m.stats.hearing + 3;
    if (!h.alive || d > aggro) { if (m.state === 'walk') m.setState('idle'); return; }
    m.face(ex, ey);
    if (d > MELEE) {
      m.setState('walk');
      this.step(m, ex / d, ey / d, m.stats.speed, dt);
      // keep monsters from stacking on top of each other
      for (const o of this.monsters) {
        if (o === m || !o.alive) continue;
        const ox = m.cx - o.cx, oy = m.cy - o.cy, od = Math.hypot(ox, oy);
        if (od < 0.7 && od > 1e-3) this.step(m, ox / od, oy / od, 1.2, dt);
      }
    } else if (m.cooldown === 0) {
      m.onStrike = (c) => this.monsterStrike(c);
      m.setState('attack');
      const [lo, hi] = m.stats.cooldown;
      m.cooldown = lo + this.rnd() * (hi - lo);
    } else if (m.state === 'walk') m.setState('idle');
  }
}
