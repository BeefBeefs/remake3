import * as THREE from 'three';
import { Atlas } from '../assets/atlas.ts';
import { type AnimData } from './anims.ts';
import { SPELLS, SPELL_RADIUS, blastDamage, manaCost } from './spells.ts';
import { STEP_SOUND, type Surface } from './surface.ts';
import { Creature, type Stats } from './creature.ts';
import { Inventory, missingReqs, rollByMask, rollDrop, slotOf, type ItemDef } from './items.ts';
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
  /** Ground surface under a cell (for footstep sounds); default grass. */
  surface?: (cx: number, cy: number) => Surface;
  /** which hero to play (default 100, the Barbarian) */
  classId?: ClassId;
  /** text shown when the mission's goal object is reached */
  finalText?: string;
}

/** A non-hostile character (innkeeper, villagers…): single-view sprite strip, talks when clicked. */
export interface Npc { id: string; name: string; creature: Creature }
/** NPC actors that run the buy/sell window (guess: the innkeeper; the manual only says "certain people at the Inn"). */
export const MERCHANTS = new Set(['27']);
const TALK_RANGE = 2.2;

export interface GroundItem { id: number; cx: number; cy: number; mesh: THREE.Object3D }

/** Pack-3 container objects. The map stores the *open* sprite of a chest; the closed one is the previous frame id (401/402, 403/404, 526/527 ...). */
const CHESTS = new Set([402, 404, 527, 529, 531]);
/** breakable containers -> original sound id (013 crate, 015 water barrel, 016 barrel; which is which is a guess) */
const BREAKABLES: Record<number, number> = { 405: 16, 406: 16, 407: 15, 408: 13 };
const CHEST_SOUND = 14;
const CONTAINER_PACK = 3;

const DROP_SPOTS: [number, number][] = [[0, 0.6], [0.7, 0.4], [-0.7, 0.4], [0, 1.1]];

interface Box { cx: number; cy: number; id: number; chest: boolean; done: boolean }

/** Playable classes: INI actor id, first weapon, and the base of the class's sound ids (die; +1,+2 hurt). */
export const CLASSES = {
  100: { name: 'Barbarian', weapon: 1, sound: 100 },
  101: { name: 'Amazon', weapon: 40, sound: 120 },
  102: { name: 'Sorceress', weapon: 56, sound: 140 },
} as const;
export type ClassId = keyof typeof CLASSES;
/** Total XP needed to reach `level` (placeholder curve). */
export const xpForLevel = (level: number): number => 25 * (level - 1) * level;
/** Seconds of walking between footsteps (the walk cycle is ~1.2 s with two steps). */
const STEP_EVERY = 0.58;
export const POINTS_PER_LEVEL = 4;
export type Attr = 'strength' | 'skill' | 'resistance' | 'magic';
/** Hit points per point of Resistance (the manual only says life is tied to Resistance; 2 is a guess). */
export const HP_PER_RESISTANCE = 2;
/** Stamina follows Resistance and mana follows Power (manual); the per-point ratios and all rates below are guesses. */
export const STAMINA_PER_RESISTANCE = 2;
export const MANA_PER_POWER = 2;
export type Stance = 'walk' | 'run' | 'stealth';
/** Speed multipliers: run = twice as fast, stealth = half (manual). */
export const STANCE_SPEED: Record<Stance, number> = { walk: 1, run: 2, stealth: 0.5 };
/** Stamina drained per second while moving in each stance ("running tires you out", stealth "consumes less"). */
const STAMINA_DRAIN: Record<Stance, number> = { walk: 0.5, run: 6, stealth: 0.2 };
const STAMINA_REGEN = 3; // per second when standing still
const MANA_REGEN = 0.25; // per second
/** Stealth: unaware monsters notice you from half as far, and the first blow on one of them does double damage. */
const STEALTH_HEARING = 0.5;
const SNEAK_MULT = 2;
/** Barbarian block: stamina spent per blocked blow (a guess). Blows from the front arc are stopped completely while it lasts. */
const BLOCK_COST = 4;
/** Bows shoot: the swing hits the nearest monster in front within this many cells (no projectile is drawn yet). */
const BOW_RANGE = 7;
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
  readonly npcs: Npc[] = [];
  /** Fired when the hero reaches an NPC he clicked: the front end opens the shop for merchants. */
  onTalk?: (npc: Npc) => void;
  private talkTarget: Npc | null = null;
  readonly group = new THREE.Group();
  kills = 0;
  xp = 0;
  /** Hero level (guess: the real XP table is not decoded; level n+1 needs `xpForLevel(n+1)` total points). */
  level = 1;
  /** Unspent attribute points (4 per level, see `spend`). */
  points = 0;
  stamina = 0;
  mana = 0;
  /** current movement stance as asked by the player (run needs stamina) */
  stance: Stance = 'walk';
  /** Barbarian only: the right button is held, he covers up (Cubrir) and stops frontal blows. */
  blocking = false;
  /** Amazon / Sorceress: the right button is held, the hero stands still and shoots where clicked. */
  holding = false;
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
  private readonly boxes: Box[] = [];
  private targetBox: Box | null = null;
  private goals: { cx: number; cy: number; name: string }[] = [];
  private readonly finalText: string;
  /** true once the hero has reached the goal object of the map (script "Tumba de Domnir" in Lost Forrest) */
  goalReached = false;
  private readonly surfaceAt: (cx: number, cy: number) => Surface;
  private stepClock = 0;
  private moving = false;
  /** monsters frozen by an ice parchment: seconds of slowness left */
  private readonly slowed = new Map<Creature, number>();
  /** monsters that had not noticed the hero when the current swing began (they take sneak damage) */
  private unaware = new Set<Creature>();
  private stepFoot = 0;
  /** Sound hook: numeric id of a GDI/Audio file (see data/sfx.json). Set by the front end. */
  onSound?: (id: number) => void;
  /** wander routes of unaware monsters (the map's zone records) */
  private readonly patrols = new Map<Creature, { pts: { cx: number; cy: number }[]; i: number; wait: number }>();

  /** hero attributes of the adventure (shown in the inventory panel; only resistance feeds back into HP, see below) */
  readonly attrs: NonNullable<GameOptions['attrs']>;
  readonly classId: ClassId;

  constructor(private readonly world: World, private readonly data: GameData, start: { cx: number; cy: number }, opts: GameOptions = {}) {
    this.attrs = { ...(opts.attrs ?? { strength: 30, skill: 24, resistance: 30, magic: 11 }) };
    this.finalText = opts.finalText ?? 'Mission complete.';
    this.surfaceAt = opts.surface ?? (() => 'grass');
    this.classId = opts.classId ?? 100;
    const cls = CLASSES[this.classId];
    this.inventory = new Inventory(data.items, this.classId);
    // starting kit: the class's first weapon in hand and two life potions
    this.inventory.add(cls.weapon); this.inventory.equip(0);
    this.inventory.add(104); this.inventory.add(104);
    this.hero = this.make(String(this.classId), start.cx, start.cy, { hp: this.attrs.resistance * HP_PER_RESISTANCE, damage: [2, 4], speed: HERO_SPEED, name: data.names[String(this.classId)] ?? cls.name });
    this.stamina = this.maxStamina;
    this.mana = this.maxMana;
    this.refreshHeroStats();
    this.hero.onStrike = () => this.heroStrike();
    this.group.add(this.hero.sprite);
    if (opts.spawns) this.spawnFromMap(opts.spawns); else this.populate(start);
    this.initContainers();
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
      if (def.npc) {
        this.npcs.push({ id: sp.id, name: m.stats.name.trim(), creature: m });
        this.group.add(m.sprite);
        continue;
      }
      this.idOf.set(m, sp.id);
      m.dir = Math.floor(this.rnd() * 8);
      this.monsters.push(m);
      this.group.add(m.sprite);
      if (sp.route?.length) this.patrols.set(m, { pts: [{ cx: sp.cx, cy: sp.cy }, ...sp.route], i: 0, wait: this.rnd() * 3 });
    }
  }

  /** Containers (chests, barrels, crates) and goal objects are the map objects that carry scripts or have container sprites. */
  private initContainers(): void {
    const map = this.world.map;
    const scripts = new Map(map.scripts.map((sc) => [sc.index, sc]));
    for (let i = 0; i < map.objects.length; i++) {
      const o = map.objects[i]!;
      const cx = i % map.dim, cy = Math.floor(i / map.dim);
      const id = o & 1023;
      if (o >> 10 === CONTAINER_PACK && (CHESTS.has(id) || id in BREAKABLES)) {
        const chest = CHESTS.has(id);
        this.boxes.push({ cx, cy, id, chest, done: false });
        if (chest) this.world.setObject(cx, cy, (CONTAINER_PACK << 10) | (id - 1)); // show it closed
      }
      const sc = map.scriptAt[i]! >= 0 ? scripts.get(map.scriptAt[i]!) : undefined;
      // a script that rolls no loot is a goal marker (Lost Forrest: "Tumba de Domnir" on the tomb gate)
      if (sc && !sc.commands.some((c) => c.id === 1) && sc.name) this.goals.push({ cx, cy, name: sc.name });
    }
  }

  private boxAt(cx: number, cy: number, reach: number): Box | null {
    let best: Box | null = null, bd = reach;
    for (const b of this.boxes) {
      if (b.done) continue;
      const d = Math.hypot(b.cx - cx, b.cy - cy);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  /** Runs a map script at a cell. Implemented: 1 (roll item by type mask and chest level) and 9 (fixed item). */
  private runScript(index: number, cx: number, cy: number): void {
    const sc = this.world.map.scripts.find((x) => x.index === index);
    if (!sc) return;
    let n = 0;
    for (const c of sc.commands) {
      let item: number | null = null;
      if (c.id === 1) item = rollByMask(this.data.items, c.args[0], c.args[1], this.rnd, (d) => this.inventory.canUse(d));
      else if (c.id === 9 && c.args[0] > 0) item = c.args[0];
      if (item) { const o = DROP_SPOTS[n % DROP_SPOTS.length]!; this.spawnGround(item, cx + o[0], cy + o[1]); n++; }
    }
  }

  private openBox(b: Box): void {
    b.done = true;
    this.snd(b.chest ? CHEST_SOUND : BREAKABLES[b.id] ?? 13);
    const script = this.world.map.scriptAt[b.cy * this.world.map.dim + b.cx]!;
    if (b.chest) this.world.setObject(b.cx, b.cy, (CONTAINER_PACK << 10) | b.id);
    else this.world.setObject(b.cx, b.cy, 0);
    if (script >= 0) this.runScript(script, b.cx, b.cy);
    else if (!b.chest && this.rnd() < 0.2) this.spawnGround(GOLD_BAG, b.cx, b.cy + 0.5);
    this.say(b.chest ? 'You open the chest' : 'You smash it open');
    if (this.targetBox === b) this.targetBox = null;
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
    if (this.holding) { this.aim(cx, cy); return; }
    if (this.blocking) return;
    const npc = this.npcs.find((n) => Math.hypot(n.creature.cx - cx, n.creature.cy - cy) < 1.3);
    if (npc) { this.talkTarget = npc; this.target = null; this.targetBox = null; this.walkTarget = null; return; }
    this.talkTarget = null;
    const box = this.boxAt(cx, cy, 0.8);
    let best: Creature | null = null, bd = 1.3;
    for (const m of this.monsters) {
      if (!m.alive) continue;
      const d = Math.hypot(m.cx - cx, m.cy - cy);
      if (d < bd) { bd = d; best = m; }
    }
    this.targetBox = best ? null : box;
    this.target = best;
    this.walkTarget = best || box ? null : { cx, cy };
  }

  /** The hero stands next to an NPC: it plays its talk animation and the front end is told. */
  private talk(npc: Npc): void {
    npc.creature.face(this.hero.cx - npc.creature.cx, this.hero.cy - npc.creature.cy);
    npc.creature.setState('attack'); // NPC "Atacar" strips are their serve / talk animations
    this.say(npc.name);
    this.onTalk?.(npc);
  }

  /** Space bar: swing in the current facing direction. */
  swing(): void {
    if (this.hero.alive) this.tryAttack();
  }

  private tryAttack(): boolean {
    const h = this.hero;
    if (h.cooldown > 0 || h.state === 'attack' || h.state === 'hit' || this.blocking) return false;
    h.face(this.facing.x, this.facing.y);
    this.unaware = new Set(this.monsters.filter((m) => !this.alerted.has(m)));
    h.setState('attack');
    h.cooldown = 0.35;
    return true;
  }

  private snd(id: number): void { this.onSound?.(id); }
  /** Lets the UI play a sound through the same hook. */
  playSound(id: number): void { this.onSound?.(id); }
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

  /** True while a bow is wielded (Amazon). */
  get ranged(): boolean {
    const id = this.inventory.equipped.weapon;
    const def = id ? this.inventory.def(id) : undefined;
    return !!def && (def.tipo & 32) !== 0;
  }

  /** Damage and armour follow the equipment. */
  refreshHeroStats(): void {
    this.hero.stats.damage = this.inventory.damage();
    this.hero.stats.armor = this.inventory.armor();
    this.version++;
  }

  /** Reads a parchment: needs its Power requirement and the mana it costs; the scroll is used up (guess: the manual says "once read"). */
  castScroll(index: number, def: ItemDef): boolean {
    const spell = SPELLS[def.id];
    if (!spell) { this.say(`${def.name}: its magic is not understood yet`); return false; }
    const lacks = this.missing(def);
    if (lacks.length) { this.say(`You need ${lacks.join(', ')} to read the ${def.name}`); return false; }
    const cost = manaCost(spell, def.level);
    if (this.mana < cost) { this.say(`Not enough mana (${cost} needed)`); return false; }
    const h = this.hero;
    const near = this.monsters.filter((m) => m.alive && Math.hypot(m.cx - h.cx, m.cy - h.cy) <= SPELL_RADIUS);
    switch (spell.kind) {
      case 'blast': {
        const dmg = blastDamage(spell, this.attrs.magic);
        this.snd(spell.sound);
        for (const m of near) {
          this.damageMonster(m, dmg);
          if (spell.stun && m.alive) m.setState('hit');
        }
        this.say(`${def.name}: ${near.length ? `${near.length} enemies take ${dmg}` : 'no enemy in sight'}`);
        break;
      }
      case 'freeze':
        this.snd(spell.sound);
        for (const m of near) this.slowed.set(m, spell.seconds);
        this.say(`${def.name}: ${near.length} enemies slowed`);
        break;
      case 'restore': {
        const gain = Math.floor(this.mana * spell.scale);
        this.hero.hp = Math.min(h.stats.hp, h.hp + gain);
        this.stamina = Math.min(this.maxStamina, this.stamina + gain);
        this.mana = 0;
        this.snd(23);
        this.say(`${def.name}: +${gain} HP and stamina`);
        break;
      }
      case 'attr': {
        for (const k of ['strength', 'skill', 'resistance', 'magic'] as const) {
          const v = spell[k];
          if (!v) continue;
          this.attrs[k] += v;
          if (k === 'resistance') { h.stats.hp += HP_PER_RESISTANCE * v; h.hp += HP_PER_RESISTANCE * v; }
        }
        if (spell.fillLife) h.hp = h.stats.hp;
        if (spell.fillMana) this.mana = this.maxMana + cost; // the cost is deducted below, leaving a full pool
        this.snd(23);
        this.say(`${def.name}: your attributes grow`);
        break;
      }
      case 'allies':
        this.say(`${def.name}: there is no hero beside you to share it with`);
        return false;
      case 'repair':
        this.say(`${def.name}: your weapons are as good as new (durability is not modelled yet)`);
        this.snd(23);
        break;
    }
    this.mana = Math.max(0, this.mana - cost);
    this.inventory.take(index);
    this.refreshHeroStats();
    return true;
  }

  /** Clicking an inventory slot: drink potions, wear equipment. */
  useSlot(index: number): void {
    const id = this.inventory.slots[index];
    const def = id ? this.inventory.def(id) : undefined;
    if (!def || !this.hero.alive) return;
    if (def.kind === 'scroll') {
      this.castScroll(index, def);
      return;
    }
    if (def.kind === 'potion') {
      if (def.data & 7) {
        // Data is a bit mask: 1 life, 2 stamina, 4 magic (the Vitality potion, 7, does all three and can hurt: -35..75)
        const [lo, hi] = def.power;
        const parts: string[] = [];
        const roll = () => lo + Math.floor(this.rnd() * (hi - lo + 1));
        if (def.data & 1) { const v = roll(); this.hero.hp = Math.max(1, Math.min(this.hero.stats.hp, this.hero.hp + v)); parts.push(`${v >= 0 ? '+' : ''}${v} HP`); }
        if (def.data & 2) { const v = roll(); this.stamina = Math.max(0, Math.min(this.maxStamina, this.stamina + v)); parts.push(`${v >= 0 ? '+' : ''}${v} stamina`); }
        if (def.data & 4) { const v = roll(); this.mana = Math.max(0, Math.min(this.maxMana, this.mana + v)); parts.push(`${v >= 0 ? '+' : ''}${v} mana`); }
        this.inventory.take(index);
        this.snd(9);
        this.say(`You drink the ${def.name}: ${parts.join(', ')}`);
      } else this.say(`${def.name}: its magic is not understood yet`);
    } else if (slotOf(def) && this.inventory.canUse(def) && this.missing(def).length) {
      this.say(`You need ${this.missing(def).join(', ')} to use the ${def.name}`);
    } else if (this.inventory.equip(index)) {
      this.say(`You equip the ${def.name}`);
    } else if (!this.inventory.canUse(def) && def.kind !== 'scroll' && def.kind !== 'book' && def.kind !== 'key' && def.kind !== 'quest') {
      this.say(`${def.name} is not for a ${CLASSES[this.classId].name}`);
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

  /** Applies hero damage to a monster: hurt/die sounds, loot, kill count and experience. */
  private damageMonster(m: Creature, dmg: number): void {
    const killed = m.hurt(dmg);
    this.msnd(m, killed ? 2 : 3);
    if (killed) {
      this.dropLoot(m, this.idOf.get(m) ?? '');
      this.kills++;
      this.xp += m.stats.xp[0] + Math.floor(this.rnd() * (m.stats.xp[1] - m.stats.xp[0] + 1));
      this.checkLevel();
    }
  }

  private heroStrike(): void {
    const h = this.hero;
    let hit = false;
    const bow = this.ranged;
    if (bow) this.snd(this.pick(50, 3)); // c_arco
    let nearest: Creature | null = null, nd = Infinity;
    if (bow) {
      for (const m of this.monsters) {
        if (!m.alive) continue;
        const dx = m.cx - h.cx, dy = m.cy - h.cy, d = Math.hypot(dx, dy);
        if (d > BOW_RANGE || (d > 0.6 && (dx * this.facing.x + dy * this.facing.y) / d < 0.9)) continue; // within ~25 degrees of the aim
        if (d < nd) { nd = d; nearest = m; }
      }
    }
    for (const m of this.monsters) {
      if (!m.alive) continue;
      const dx = m.cx - h.cx, dy = m.cy - h.cy, d = Math.hypot(dx, dy);
      if (bow) { if (m !== nearest) continue; }
      else {
        if (d > HIT_RANGE) continue;
        if (d > 0.6 && (dx * this.facing.x + dy * this.facing.y) / d < 0.2) continue; // must be in front
      }
      hit = true;
      const [lo, hi] = h.stats.damage;
      const sneak = this.effectiveStance === 'stealth' && this.unaware.has(m);
      const dmg = Math.max(1, (lo + Math.floor(this.rnd() * (hi - lo + 1))) * (sneak ? SNEAK_MULT : 1) - m.stats.armor);
      if (sneak) this.say('Sneak attack!');
      const flesh = this.data.actors[this.idOf.get(m) ?? '']?.Sonidos?.Carne !== 0;
      this.snd(this.pick(flesh ? 59 : 62, 3)); // c_carne / c_nocarne
      this.damageMonster(m, dmg);
    }
    for (const b of [...this.boxes]) {
      if (b.done) continue;
      const dx = b.cx - h.cx, dy = b.cy - h.cy, d = Math.hypot(dx, dy);
      if (d > HIT_RANGE) continue;
      if (d > 0.6 && (dx * this.facing.x + dy * this.facing.y) / d < 0.2) continue;
      hit = true;
      this.openBox(b);
    }
    if (!hit && !bow) this.snd(this.pick(65, 6)); // c_sesgo: a swing that hits nothing (guess: whoosh)
  }

  private monsterStrike(m: Creature): void {
    const h = this.hero;
    if (!h.alive || Math.hypot(h.cx - m.cx, h.cy - m.cy) > MELEE + 0.5) return;
    const [lo, hi] = m.stats.damage;
    this.msnd(m, 0);
    if (this.blocking && this.stamina >= BLOCK_COST) {
      // the blow comes from the front arc when the monster is on the side the hero faces
      const ex = m.cx - h.cx, ey = m.cy - h.cy, ed = Math.hypot(ex, ey) || 1;
      if ((ex * this.facing.x + ey * this.facing.y) / ed > 0) {
        this.stamina -= BLOCK_COST;
        this.snd(this.pick(53, 4)); // c_cubrir
        return;
      }
    }
    const died = h.hurt(Math.max(1, lo + Math.floor(this.rnd() * (hi - lo + 1)) - h.stats.armor));
    const sb = CLASSES[this.classId].sound;
    this.snd(died ? sb : this.pick(sb + 1, 2)); // <class>_morir / _recibir
    if (died) this.say('You have died');
  }

  /** @param move cell-space unit vector from the keyboard, or null */
  update(dt: number, move: { x: number; y: number } | null): void {
    const h = this.hero;
    this.moving = false;
    this.updateHero(dt, move);
    this.tickResources(dt);
    this.pickups();
    this.checkGoal();
    for (const [m, t] of this.slowed) { if (t - dt <= 0 || !m.alive) this.slowed.delete(m); else this.slowed.set(m, t - dt); }
    for (const m of this.monsters) this.updateMonster(m, dt);
    for (const n of this.npcs) n.creature.update(dt);
    h.update(dt);
    for (const m of this.monsters) m.update(dt);
  }

  get maxStamina(): number { return this.attrs.resistance * STAMINA_PER_RESISTANCE; }
  get maxMana(): number { return this.attrs.magic * MANA_PER_POWER; }

  /** What the hero still lacks to use an item (empty = usable, otherwise the item shows a red border). */
  missing(def: ItemDef): string[] { return missingReqs(def, this.attrs, this.level); }

  /** True when the item cannot be used by this hero right now: wrong class or attributes too low. */
  blocked(def: ItemDef): boolean { return !this.inventory.canUse(def) || this.missing(def).length > 0; }

  /** Ctrl+click = run, Shift+click = stealth (manual); run wins if both are held. */
  setStance(run: boolean, stealth: boolean): void { this.stance = run ? 'run' : stealth ? 'stealth' : 'walk'; }

  /** Right mouse button: the Barbarian blocks, the other heroes plant their feet ("block mode", manual). */
  setGuard(on: boolean): void {
    if (this.classId === 100) {
      this.blocking = on && this.hero.alive && this.hero.has('block');
      this.holding = false;
      if (!this.blocking && this.hero.state === 'block') this.hero.setState('idle');
    } else {
      this.holding = on;
      this.blocking = false;
    }
    if (on) { this.target = null; this.targetBox = null; this.walkTarget = null; this.talkTarget = null; }
  }

  /** Hold-position fire: face the clicked cell and shoot / swing without walking. */
  aim(cx: number, cy: number): void {
    if (!this.hero.alive) return;
    const dx = cx - this.hero.cx, dy = cy - this.hero.cy, d = Math.hypot(dx, dy);
    if (d < 1e-3) return;
    this.facing = { x: dx / d, y: dy / d };
    this.hero.face(dx, dy);
    this.tryAttack();
  }

  /** The stance actually in effect: you cannot run on empty. */
  private get effectiveStance(): Stance { return this.stance === 'run' && this.stamina < 0.5 ? 'walk' : this.stance; }

  /** Spends one level-up point on an attribute. Life follows Resistance (and the hero is healed by the gain). */
  spend(attr: Attr): boolean {
    if (this.points <= 0 || !this.hero.alive) return false;
    this.points--;
    this.attrs[attr]++;
    if (attr === 'resistance') { this.hero.stats.hp += HP_PER_RESISTANCE; this.hero.hp += HP_PER_RESISTANCE; }
    this.version++;
    return true;
  }

  private tickResources(dt: number): void {
    if (!this.hero.alive) return;
    if (this.moving) this.stamina = Math.max(0, this.stamina - STAMINA_DRAIN[this.effectiveStance] * dt);
    else this.stamina = Math.min(this.maxStamina, this.stamina + STAMINA_REGEN * dt);
    this.mana = Math.min(this.maxMana, this.mana + MANA_REGEN * dt);
  }

  private checkLevel(): void {
    while (this.xp >= xpForLevel(this.level + 1)) {
      this.level++;
      const st = this.hero.stats;
      this.points += POINTS_PER_LEVEL; // manual: "+4" points to distribute on the character specifications window
      this.hero.hp = st.hp;
      this.snd(CLASSES[this.classId].sound + 3); // <class>_nivel
      this.say(`${st.name} reached level ${this.level}`);
      this.version++;
    }
  }

  private checkGoal(): void {
    if (this.goalReached || !this.hero.alive) return;
    const h = this.hero;
    const g = this.goals.find((q) => Math.hypot(q.cx - h.cx, q.cy - h.cy) < 3);
    if (!g) return;
    this.goalReached = true;
    this.say(`${g.name}`);
    this.say(this.finalText);
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
    if (this.blocking) { h.setState('block'); return; }
    if (this.holding) { if (h.state === 'walk') h.setState('idle'); return; }
    let vx = 0, vy = 0;
    if (move) {
      this.target = null; this.walkTarget = null; this.targetBox = null; this.talkTarget = null;
      vx = move.x; vy = move.y;
    } else if (this.talkTarget) {
      const n = this.talkTarget.creature, ex = n.cx - h.cx, ey = n.cy - h.cy, d = Math.hypot(ex, ey);
      this.facing = { x: ex / (d || 1), y: ey / (d || 1) };
      if (d <= TALK_RANGE) { h.face(ex, ey); this.talk(this.talkTarget); this.talkTarget = null; }
      else { vx = ex / d; vy = ey / d; }
    } else if (this.target && this.target.alive) {
      const ex = this.target.cx - h.cx, ey = this.target.cy - h.cy, d = Math.hypot(ex, ey);
      this.facing = { x: ex / (d || 1), y: ey / (d || 1) };
      if (d <= (this.ranged ? BOW_RANGE - 1 : MELEE)) { this.tryAttack(); }
      else { vx = ex / d; vy = ey / d; }
    } else if (this.targetBox && !this.targetBox.done) {
      const b = this.targetBox, ex = b.cx - h.cx, ey = b.cy - h.cy, d = Math.hypot(ex, ey);
      this.facing = { x: ex / (d || 1), y: ey / (d || 1) };
      if (d <= MELEE + 0.2) this.tryAttack();
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
      const stance = this.effectiveStance;
      this.stepClock += dt * STANCE_SPEED[stance];
      if (this.stepClock >= STEP_EVERY) {
        this.stepClock -= STEP_EVERY;
        this.stepFoot ^= 1;
        // stealth is silent; running uses the j_correr_* pair (id + 2)
        if (stance !== 'stealth') this.snd(STEP_SOUND[this.surfaceAt(h.cx, h.cy)] + this.stepFoot + (stance === 'run' ? 2 : 0));
      }
      this.moving = true;
      const before = { x: h.cx, y: h.cy };
      this.step(h, vx, vy, h.stats.speed * STANCE_SPEED[stance], dt);
      if (!this.target && !this.targetBox && Math.hypot(h.cx - before.x, h.cy - before.y) < 1e-4) this.walkTarget = null; // blocked
      else if (this.targetBox && Math.hypot(h.cx - before.x, h.cy - before.y) < 1e-4) this.targetBox = null;
    } else { this.stepClock = 0; if (h.state === 'walk') h.setState('idle'); }
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
    const aggro = (m.stats.hearing + 3) * (this.alerted.has(m) || this.effectiveStance !== 'stealth' ? 1 : STEALTH_HEARING);
    if (!h.alive || d > aggro) { this.patrol(m, dt); return; }
    if (!this.alerted.has(m)) { this.alerted.add(m); this.msnd(m, 1); }
    m.face(ex, ey);
    if (d > MELEE) {
      m.setState('walk');
      this.step(m, ex / d, ey / d, m.stats.speed * (this.slowed.has(m) ? 0.5 : 1), dt);
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
      m.cooldown = (lo + this.rnd() * (hi - lo)) * (this.slowed.has(m) ? 2 : 1);
    } else if (m.state === 'walk') m.setState('idle');
  }
}
