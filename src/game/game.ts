import * as THREE from 'three';
import { Atlas } from '../assets/atlas.ts';
import { type AnimData } from './anims.ts';
import { Creature, type Stats } from './creature.ts';
import { Inventory, rollDrop, type ItemDef } from './items.ts';
import { cellToWorld, depthOf } from '../iso.ts';
import { World } from './world.ts';

type Range = [number, number];
interface ActorIni {
  General?: { Vel_Ataque?: Range; Altura?: number };
  HDP?: { Vida?: number; Fuerza?: Range; Armadura?: number; Pts_Experiencia?: Range; Velocidad?: number };
  IA?: { Oido?: number };
  Items?: { IDItem?: number[]; PItem?: number[] };
  Sonidos?: { SndBase?: number; Carne?: number };
}

/** Everything the simulation needs to be loaded from /assets (see main.ts). */
export interface GameData {
  anims: AnimData;
  actors: Record<string, ActorIni>;
  names: Record<string, string>;
  atlases: Map<string, Atlas>;
  items: Map<number, ItemDef>;
  /** item icon atlas (System/IListData.b16), frame id = item id */
  icons: Atlas;
}

/** Per-adventure parameters (see adventure.json / the map's markers). */
export interface GameOptions {
  /** actor spawns from the map's pack-0 markers; omitted = scatter a few monsters around the start */
  spawns?: { id: string; cx: number; cy: number; route?: { cx: number; cy: number }[] }[];
  /** hero attributes from the .adv file (strength, skill, resistance, magic) */
  attrs?: { strength: number; skill: number; resistance: number; magic: number };
}

export interface GroundItem { id: number; cx: number; cy: number; mesh: THREE.Object3D }

const HERO_ID = '100';
const HERO_SPEED = 3.2; // cells per second
const MONSTER_SPEED = 1.7;
const PATROL_SPEED = 0.45; // fraction of chase speed
const MELEE = 1.35; // cells
const HIT_RANGE = 1.9; // hero swing reach, cells
const PICKUP = 0.9; // cells
const DROP_CHANCE = 0.45;
const GOLD_BAG = 124; // 'small bag of gold'
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
  readonly inventory: Inventory;
  readonly ground: GroundItem[] = [];
  /** most recent messages, newest last (for the HUD) */
  readonly log: string[] = [];
  /** bumps whenever the inventory/equipment changed (so the UI knows to redraw) */
  version = 0;
  /** The enemy the hero is walking up to / fighting. */
  target: Creature | null = null;
  walkTarget: { cx: number; cy: number } | null = null;
  private facing = { x: 0, y: 1 };
  private readonly rnd = mulberry32(0x4e53);
  private readonly idOf = new Map<Creature, string>();
  /** monsters that have noticed the hero (they shout once) */
  private readonly alerted = new Set<Creature>();
  /** Sound hook: numeric id of a GDI/Audio file (see data/sfx.json). Set by the front end. */
  onSound?: (id: number) => void;
  /** wander routes of unaware monsters (the map's zone records) */
  private readonly patrols = new Map<Creature, { pts: { cx: number; cy: number }[]; i: number; wait: number }>();

  /** hero attributes of the adventure (shown in the inventory panel; only resistance feeds back into HP, see below) */
  readonly attrs: NonNullable<GameOptions['attrs']>;

  constructor(private readonly world: World, private readonly data: GameData, start: { cx: number; cy: number }, opts: GameOptions = {}) {
    this.attrs = opts.attrs ?? { strength: 30, skill: 24, resistance: 30, magic: 11 };
    this.inventory = new Inventory(data.items, 100);
    // starting kit: the INI lists the Barbarian's items; we start with a scimitar in hand and two life potions
    this.inventory.add(1); this.inventory.equip(0);
    this.inventory.add(104); this.inventory.add(104);
    this.hero = this.make(HERO_ID, start.cx, start.cy, { hp: this.attrs.resistance * 2 /* guess: 60 hp for the Barbarian's 30 resistance */, damage: [2, 4], speed: HERO_SPEED, name: data.names[HERO_ID] ?? 'Hero' });
    this.refreshHeroStats();
    this.hero.onStrike = () => this.heroStrike();
    this.group.add(this.hero.sprite);
    if (opts.spawns) this.spawnFromMap(opts.spawns); else this.populate(start);
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

  /** Real placement: one monster per pack-0 marker whose actor we have art and animations for. */
  private spawnFromMap(spawns: NonNullable<GameOptions['spawns']>): void {
    for (const sp of spawns) {
      const def = this.data.anims.actors[sp.id];
      if (!def || !this.data.atlases.has(def.pack)) continue;
      const m = this.make(sp.id, sp.cx, sp.cy);
      this.idOf.set(m, sp.id);
      m.dir = Math.floor(this.rnd() * 8);
      this.monsters.push(m);
      this.group.add(m.sprite);
      if (sp.route?.length) this.patrols.set(m, { pts: [{ cx: sp.cx, cy: sp.cy }, ...sp.route], i: 0, wait: this.rnd() * 3 });
    }
  }

  /** Fallback: scatters a few monsters around the start. */
  private populate(start: { cx: number; cy: number }): void {
    const kinds = ['1', '1', '1', '2', '2', '3', '5', '1', '2', '3'];
    for (const id of kinds) {
      for (let tries = 0; tries < 60; tries++) {
        const a = this.rnd() * Math.PI * 2, r = 7 + this.rnd() * 10;
        const cx = Math.round(start.cx + Math.cos(a) * r), cy = Math.round(start.cy + Math.sin(a) * r);
        if (!this.world.isWalkable(cx, cy)) continue;
        const m = this.make(id, cx, cy);
        this.idOf.set(m, id);
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

  private snd(id: number): void { this.onSound?.(id); }
  private pick(base: number, n: number): number { return base + Math.floor(this.rnd() * n); }
  /** Monster sound: SndBase + 0 attack, 1 alarm, 2 die, 3 hurt (file names 200_goblin_atacar … 203_goblin_recibir). */
  private msnd(m: Creature, k: number): void {
    const base = this.data.actors[this.idOf.get(m) ?? '']?.Sonidos?.SndBase;
    if (base) this.snd(base + k);
  }

  say(msg: string): void {
    this.log.push(msg);
    if (this.log.length > 6) this.log.shift();
  }

  /** Damage and armour follow the equipment. */
  refreshHeroStats(): void {
    this.hero.stats.damage = this.inventory.damage();
    this.hero.stats.armor = this.inventory.armor();
    this.version++;
  }

  /** Clicking an inventory slot: drink potions, wear equipment. */
  useSlot(index: number): void {
    const id = this.inventory.slots[index];
    const def = id ? this.inventory.def(id) : undefined;
    if (!def || !this.hero.alive) return;
    if (def.kind === 'potion') {
      if (def.data === 1) {
        const [lo, hi] = def.power;
        const heal = lo + Math.floor(this.rnd() * (hi - lo + 1));
        this.hero.hp = Math.min(this.hero.stats.hp, this.hero.hp + heal);
        this.inventory.take(index);
        this.snd(9);
        this.say(`You drink the ${def.name}: +${heal} HP`);
      } else this.say(`${def.name}: stamina and magic are not in the game yet`);
    } else if (this.inventory.equip(index)) {
      this.say(`You equip the ${def.name}`);
    } else if (!this.inventory.canUse(def) && def.kind !== 'scroll' && def.kind !== 'book' && def.kind !== 'key' && def.kind !== 'quest') {
      this.say(`${def.name} is not for a Barbarian`);
    } else this.say(def.name);
    this.refreshHeroStats();
  }

  unequip(slot: 'weapon' | 'shield' | 'armor' | 'ring' | 'amulet'): void {
    if (this.inventory.unequip(slot)) this.refreshHeroStats();
  }

  private dropLoot(m: Creature, id: string): void {
    const table = this.data.actors[id]?.Items;
    const picks: number[] = [];
    if (this.rnd() < DROP_CHANCE) { const d = rollDrop(table, this.rnd); if (d) picks.push(d); }
    if (this.rnd() < 0.25) picks.push(GOLD_BAG);
    picks.forEach((item, i) => this.spawnGround(item, m.cx + (i ? 0.6 : 0), m.cy));
  }

  /** Puts an item on the ground (also used by tests). */
  spawnGround(id: number, cx: number, cy: number): void {
    const mesh = this.data.icons.mesh(id, 'bottom');
    mesh.scale.set(0.55, 0.55, 1);
    const w = cellToWorld(cx, cy);
    mesh.position.set(w.x, w.y - 4, depthOf(cx, cy) + 0.2);
    this.group.add(mesh);
    this.ground.push({ id, cx, cy, mesh });
  }

  private pickups(): void {
    const h = this.hero;
    if (!h.alive) return;
    for (let i = this.ground.length - 1; i >= 0; i--) {
      const g = this.ground[i]!;
      if (Math.hypot(g.cx - h.cx, g.cy - h.cy) > PICKUP) continue;
      const def = this.inventory.def(g.id);
      if (def?.kind === 'gold') {
        const amount = 5 + Math.floor(this.rnd() * 20) * (g.id - GOLD_BAG + 1);
        this.inventory.gold += amount;
        this.say(`+${amount} gold`);
      } else if (!this.inventory.add(g.id)) { this.say('Your pack is full'); continue; }
      else this.say(`Picked up ${def?.name ?? 'an item'}`);
      this.snd(8);
      this.group.remove(g.mesh);
      this.ground.splice(i, 1);
      this.version++;
    }
  }

  private heroStrike(): void {
    const h = this.hero;
    let hit = false;
    for (const m of this.monsters) {
      if (!m.alive) continue;
      const dx = m.cx - h.cx, dy = m.cy - h.cy, d = Math.hypot(dx, dy);
      if (d > HIT_RANGE) continue;
      if (d > 0.6 && (dx * this.facing.x + dy * this.facing.y) / d < 0.2) continue; // must be in front
      hit = true;
      const [lo, hi] = h.stats.damage;
      const dmg = Math.max(1, lo + Math.floor(this.rnd() * (hi - lo + 1)) - m.stats.armor);
      const flesh = this.data.actors[this.idOf.get(m) ?? '']?.Sonidos?.Carne !== 0;
      this.snd(this.pick(flesh ? 59 : 62, 3)); // c_carne / c_nocarne
      const killed = m.hurt(dmg);
      this.msnd(m, killed ? 2 : 3);
      if (killed) {
        this.dropLoot(m, this.idOf.get(m) ?? '');
        this.kills++;
        this.xp += m.stats.xp[0] + Math.floor(this.rnd() * (m.stats.xp[1] - m.stats.xp[0] + 1));
      }
    }
    if (!hit) this.snd(this.pick(65, 6)); // c_sesgo: a swing that hits nothing (guess: whoosh)
  }

  private monsterStrike(m: Creature): void {
    const h = this.hero;
    if (!h.alive || Math.hypot(h.cx - m.cx, h.cy - m.cy) > MELEE + 0.5) return;
    const [lo, hi] = m.stats.damage;
    this.msnd(m, 0);
    const died = h.hurt(Math.max(1, lo + Math.floor(this.rnd() * (hi - lo + 1)) - h.stats.armor));
    this.snd(died ? 100 : this.pick(101, 2)); // barbarian morir / recibir
  }

  /** @param move cell-space unit vector from the keyboard, or null */
  update(dt: number, move: { x: number; y: number } | null): void {
    const h = this.hero;
    this.updateHero(dt, move);
    this.pickups();
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

  /** Unaware monsters stroll between their route points, pausing at each. */
  private patrol(m: Creature, dt: number): void {
    const p = this.patrols.get(m);
    if (!p) { if (m.state === 'walk') m.setState('idle'); return; }
    if (p.wait > 0) { p.wait -= dt; if (m.state === 'walk') m.setState('idle'); return; }
    const t = p.pts[p.i]!;
    const ex = t.cx - m.cx, ey = t.cy - m.cy, d = Math.hypot(ex, ey);
    if (d < 0.15) { p.i = (p.i + 1) % p.pts.length; p.wait = 1.5 + this.rnd() * 3.5; return; }
    m.face(ex, ey);
    m.setState('walk');
    const before = { x: m.cx, y: m.cy };
    this.step(m, ex / d, ey / d, m.stats.speed * PATROL_SPEED, dt);
    if (Math.hypot(m.cx - before.x, m.cy - before.y) < 1e-4) { p.i = (p.i + 1) % p.pts.length; p.wait = 1; } // blocked: next point
  }

  private updateMonster(m: Creature, dt: number): void {
    if (!m.alive) return;
    const h = this.hero;
    if (m.state === 'attack' || m.state === 'hit') return;
    const ex = h.cx - m.cx, ey = h.cy - m.cy, d = Math.hypot(ex, ey);
    const aggro = m.stats.hearing + 3;
    if (!h.alive || d > aggro) { this.patrol(m, dt); return; }
    if (!this.alerted.has(m)) { this.alerted.add(m); this.msnd(m, 1); }
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
