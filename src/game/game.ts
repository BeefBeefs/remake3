import * as THREE from 'three';
import { Atlas } from '../assets/atlas.ts';
import { type AnimData } from './anims.ts';
import { INFERNAL, SPELLS, SPELL_RADIUS, inSight, spellPower } from './spells.ts';
import { STEP_SOUND, type Surface } from './surface.ts';
import { Creature, type Stats } from './creature.ts';
import { levelUpFx, makeFx, potionFx, spellFx, stepFx, type Fx } from './effects.ts';
import { HIT_PIXELS, PX_HERO_ARROW, PX_HERO_BOLT, PX_MONSTER_SHOT, lineClear, makeProjectile, pixelDistance, type Projectile, type ProjKind } from './projectiles.ts';
import { Inventory, missingReqs, rollByMask, rollDrop, slotOf, SPECIAL, type ItemDef } from './items.ts';
import { cellToWorld, depthOf } from '../iso.ts';
import { StoneObj, isStoneId, stoneDamage } from './stone.ts';
import { World } from './world.ts';
import {
  ATTR_CAPS, GAME_FPS, MAX_LEVEL, POINTS_PER_LEVEL, START_ATTRS, STAFF_MANA, STAMINA_TICK, TICK, classDamage, hitReceived,
  manaRegenTick, maxLife, maxMana, maxStamina, minDamage, perSecond, xpForLevel, type ClassKey,
} from './rules.ts';

export { xpForLevel, POINTS_PER_LEVEL };

type Range = [number, number];
interface ActorIni {
  General?: { Vel_Ataque?: Range; Altura?: number; Raza?: number; Rnd_Bloqueo?: number };
  HDP?: { Vida?: number; Fuerza?: Range; Armadura?: number; Aturdirse?: number; Pts_Experiencia?: Range; Velocidad?: number };
  IA?: { Oido?: number; Radio_Busqueda?: number };
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
  /** campaign mission number (the executable's map index): mission 35 changes how the Dark Stones behave */
  mapNumber?: number;
  /** 0 Apprentice (easy), 1 Expert (normal, default), 2 Hero (hard): scales monster life and damage */
  difficulty?: 0 | 1 | 2;
  /** continue with a hero from an earlier attempt (see `Game.save`); its attributes replace `attrs` */
  save?: HeroSave;
}

/**
 * What the difficulty level changes, read from the executable: monster armour (halved / as is / doubled) and the delay between
 * a monster's attacks (x1.5 / as is / x2/3). Monster life and damage do not depend on it.
 */
/** First blow after reaching the hero, as a share of the (difficulty-scaled) attack delay: raw/2 x (2, 1, 2/3) against raw x (1.5, 1, 2/3). */
const FIRST_BLOW = [2 / 3, 1 / 2, 1 / 2] as const;
export const DIFFICULTY = [{ armor: 0.5, delay: 1.5 }, { armor: 1, delay: 1 }, { armor: 2, delay: 2 / 3 }] as const;

/** What survives from one attempt to the next: the hero's growth (manual: dying costs the items and one point of each ability). */
export interface HeroSave {
  attrs: { strength: number; skill: number; resistance: number; magic: number };
  level: number; xp: number; points: number; gold: number;
  /** items that survived a death (the legendary weapons): they come back in the next attempt's backpack */
  kept?: { id: number; left: number }[];
  /** backpack and worn gear: present when the hero moves on to another mission or is saved (not after dying) */
  inv?: { slots: number[]; equipped: Partial<Record<'weapon' | 'shield' | 'armor' | 'ring' | 'amulet', number>>; /** durability left per slot and per worn item (0 / missing = as new) */ left?: number[]; equippedLeft?: Partial<Record<'weapon' | 'shield' | 'armor' | 'ring' | 'amulet', number>> };
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
interface Trigger { cx: number; cy: number; script: number; fired: boolean; repeat: boolean }
/** Level messages (MSGBOX\\* of the language file). */
export const LEVEL_MSG = {
  completed: 'You have completed this level',
  failed: 'You have failed the mission',
  objective: 'You must meet the objective before exiting',
} as const;

/** Playable classes: INI actor id, first weapon, and the base of the class's sound ids (die; +1,+2 hurt). */
export const CLASSES = {
  100: { name: 'Barbarian', weapon: 1, sound: 100 },
  101: { name: 'Amazon', weapon: 40, sound: 120 },
  102: { name: 'Sorceress', weapon: 56, sound: 140 },
} as const;
export type ClassId = keyof typeof CLASSES;
/** Seconds of walking between footsteps: the walk cycle (Andar 7 ticks x 10 frames = 2 s) holds two steps. */
const STEP_EVERY = 1.0;
export type Attr = 'strength' | 'skill' | 'resistance' | 'magic';
/** Potions of Fortuity (azar) and Knowledge (conocimiento): effects are guesses. */
const POTION_FORTUITY = 111, POTION_KNOWLEDGE = 112;

export type Stance = 'walk' | 'run' | 'stealth';
/** Speed multipliers: run = twice as fast, stealth = half (manual). */
export const STANCE_SPEED: Record<Stance, number> = { walk: 1, run: 2, stealth: 0.5 };
/** Stealth: unaware monsters notice you from half as far, and the first blow on one of them does double damage. */
const STEALTH_HEARING = 0.5;
/** Bows shoot an arrow that flies this many cells; it is aimed at the nearest monster within ~25 degrees of the aim. */
const BOW_RANGE = 7;
/** Worn items that survive death: the three legendary weapons (sword 14, bow 48, staff 61) and item 129. */
const KEEPS_ON_DEATH = new Set([14, 48, 61, 129]);

/** The executable adds armour to the troll warrior master (48), Lord of Ailm (51), the two orc masters (52, 58) and the orc general (61, +2). */
const MASTER_ARMOR: Record<string, number> = { '48': 1, '51': 1, '52': 1, '58': 1, '61': 2 };

/** Monsters that shoot from a distance (INI Tipo_IA 3): what they fire, how far, and the closest they like to stand. */
const RANGED: Record<string, { kind: ProjKind; range: number; keep: number; color: number }> = {
  '23': { kind: 'arrow', range: 8, keep: 3.5, color: 0xffffff }, // Arquero
  '25': { kind: 'bolt', range: 8, keep: 3.5, color: 0x7fb0ff }, // Mago
  '55': { kind: 'bolt', range: 9, keep: 3, color: 0xff8040 }, // Zelos
};
/** Sorceress staffs by element (items 53-55 electricity, 56-58 ice, 59-61 the dead, 132-134 fire): bolt colour and sound. */
type Element = 'electric' | 'ice' | 'dead' | 'fire';
const staffElement = (id: number): Element => (id >= 132 ? 'fire' : id >= 59 ? 'dead' : id >= 56 ? 'ice' : 'electric');
const STAFF_COLOR: Record<Element, number> = { electric: 0xaad4ff, ice: 0x9fe8ff, dead: 0xb070ff, fire: 0xff8040 };
const STAFF_SOUND: Record<Element, number> = { electric: 24, ice: 74, dead: 23, fire: 72 };
/**
 * Walking speed in the executable (path set-up at 0x4237b8, per-tick move at 0x42345b): the object advances `speed` screen
 * pixels per tick (35 a second) along the longer screen axis of its path. Heroes walk at 1 (run 2, stealth 0.5); a monster's
 * speed is its Velocidad times itself (the order routine multiplies the Velocidad it is passed by the actor's own, 0x422f57),
 * and the roaming, patrol and chase orders all pass it. Cells are 64x32 pixels.
 */
const HERO_SPEED = 1;
const PATROL_SPEED = 1;
const MELEE = 1.35; // cells
const HIT_RANGE = 1.9; // hero swing reach, cells
const PICKUP = 0.9; // cells
const DROP_CHANCE = 0.45;
const GOLD_BAG = 124; // 'small bag of gold'
/** Engine ticks of the INI cooldown (Vel_Ataque) in seconds: the engine runs at 35 frames per second. */
const AI_TICK = TICK;

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
  /** Hero level (the executable's curve; level n needs `xpForLevel(n)` total points). */
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
  /** Visual effects in progress (spells, level-up, potions); drawn by EffectsView. */
  readonly fx: Fx[] = [];
  /** arrows and bolts in flight (drawn by ProjectileView) */
  readonly projectiles: Projectile[] = [];
  /** Screen shake left (seconds), set by the earth parchment; main.ts shakes the camera while it runs. */
  shake = 0;
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
  /** Dark Stones / Cauldron parts (actors 70-82): objective objects kept in `monsters` so the hero can hit and see them, but they never act */
  private readonly stones = new Set<Creature>();
  private mapNumber = 0;
  /** the monster the hero struck last and when (game seconds), for the target plate */
  private struck: Creature | null = null;
  private struckAt = -99;
  private clockT = 0;
  /** monsters that have noticed the hero (they shout once) */
  private readonly alerted = new Set<Creature>();
  private readonly boxes: Box[] = [];
  private targetBox: Box | null = null;
  private goals: { cx: number; cy: number; name: string }[] = [];
  /** Tile scripts: the hero sets one off by walking on it (or, for scripts on solid objects, by standing next to it). */
  private triggers: Trigger[] = [];
  /** 'complete' when a level-end script ran (Complete level, Exit level), 'failed' when the mission clock ran out. */
  status: 'playing' | 'complete' | 'failed' = 'playing';
  /** Seconds left on the mission clock, started by script command 4 ("Add time" in the editor: it sets the timer), or null when no clock runs. */
  clock: number | null = null;
  /** where the mission's goal objects are (for the minimap) */
  get goalSpots(): readonly { cx: number; cy: number }[] { return this.goals; }
  private readonly finalText: string;
  /** true once the hero has reached the goal object of the map (script "Tumba de Domnir" in Lost Forrest) */
  goalReached = false;
  /** Blood mode of the Controls window: a red puff where a blow lands */
  blood = true;
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
  /** Monsters without a route roam: a random cell within `r` of home, then wait 1-8 s (the executable's idle routine 0x434090). */
  private readonly roamers = new Map<Creature, { home: { cx: number; cy: number }; r: number; to: { cx: number; cy: number } | null; wait: number }>();
  private readonly patrols = new Map<Creature, { pts: { cx: number; cy: number }[]; i: number; wait: number }>();

  /** hero attributes of the adventure (shown in the inventory panel; only resistance feeds back into HP, see below) */
  readonly attrs: NonNullable<GameOptions['attrs']>;
  readonly classId: ClassId;

  constructor(private readonly world: World, private readonly data: GameData, start: { cx: number; cy: number }, opts: GameOptions = {}) {
    this.attrs = { ...(opts.save?.attrs ?? opts.attrs ?? START_ATTRS[(opts.classId ?? 100) as ClassKey]) };
    if (opts.save) { this.level = opts.save.level; this.xp = opts.save.xp; this.points = opts.save.points; }
    this.finalText = opts.finalText ?? 'Mission complete.';
    this.difficulty = opts.difficulty ?? 1;
    this.surfaceAt = opts.surface ?? (() => 'grass');
    this.classId = opts.classId ?? 100;
    const cls = CLASSES[this.classId];
    this.inventory = new Inventory(data.items, this.classId);
    // starting kit: the class's first weapon in hand and two life potions
    this.inventory.add(cls.weapon); this.inventory.equip(0);
    this.inventory.add(104); this.inventory.add(104);
    if (opts.save) this.inventory.gold = opts.save.gold;
    for (const k of opts.save?.kept ?? []) if (data.items.has(k.id)) this.inventory.add(k.id, k.left);
    if (opts.save?.inv) {
      // a hero who moves on keeps his things: replace the starting kit with what he carried (unknown ids are dropped)
      const known = (id: number) => id > 0 && data.items.has(id);
      this.inventory.slots.fill(0);
      opts.save.inv.slots.forEach((id, i) => { if (known(id) && i < this.inventory.slots.length) { this.inventory.slots[i] = id; this.inventory.slotLeft[i] = opts.save!.inv!.left?.[i] ?? 0; } });
      for (const k of Object.keys(this.inventory.equipped) as (keyof typeof this.inventory.equipped)[]) delete this.inventory.equipped[k];
      for (const [k, id] of Object.entries(opts.save.inv.equipped)) if (id && known(id)) { this.inventory.equipped[k as 'weapon'] = id; this.inventory.equippedLeft[k as 'weapon'] = opts.save.inv.equippedLeft?.[k as 'weapon'] ?? 0; }
    }
    this.hero = this.make(String(this.classId), start.cx, start.cy, { hp: maxLife(this.classId, this.level, this.attrs.resistance), damage: [2, 4], speed: HERO_SPEED, name: data.names[String(this.classId)] ?? cls.name });
    this.stamina = this.maxStamina;
    this.mana = this.maxMana;
    this.refreshHeroStats();
    this.hero.onStrike = () => this.heroStrike();
    this.group.add(this.hero.sprite);
    this.mapNumber = opts.mapNumber ?? 0;
    if (opts.spawns) this.spawnFromMap(opts.spawns); else this.populate(start);
    this.initContainers();
  }

  private difficulty: 0 | 1 | 2 = 1;

  private applyDifficulty(m: Creature): void {
    const k = DIFFICULTY[this.difficulty];
    m.stats.armor = Math.trunc(m.stats.armor * k.armor);
    m.stats.cooldown = [m.stats.cooldown[0] * k.delay, m.stats.cooldown[1] * k.delay];
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
      speed: (hdp.Velocidad ?? 1) ** 2,
      cooldown: [cd[0] * AI_TICK, cd[1] * AI_TICK],
      hearing: ini.IA?.Oido ?? 3,
      xp: hdp.Pts_Experiencia ?? [1, 2],
      race: ini.General?.Raza ?? 0,
      block: ini.General?.Rnd_Bloqueo ?? 0,
      stun: ini.HDP?.Aturdirse ?? 0,
      ...over,
    };
    return new Creature(def, atlas, stats, cx, cy);
  }

  /** A Dark Stone / Cauldron part: life from the INI (254 in mission 35, 0x432e18), picture by damage state. */
  private addStone(id: number, cx: number, cy: number): void {
    const atlas = this.data.atlases.get('stone');
    const ini = this.data.actors[String(id)];
    if (!atlas || !ini) return;
    const max = (ini as { General?: { Vida?: number } }).General?.Vida ?? 40;
    const s = new StoneObj(id, atlas, (this.data.names[String(id)] ?? (ini as { title?: string }).title ?? 'Stone').trim(), max, this.mapNumber === 35 ? 254 : max, cx, cy);
    this.stones.add(s);
    this.monsters.push(s);
    this.group.add(s.sprite);
  }

  /**
   * A hero blow on a stone (receive routine 0x433250): only the hero hurts it; the large stone (70) and the cauldron (80) take
   * nothing while another objective object still stands; the blow counts half (a third in mission 35), at least 2. Each blow may
   * raise a skeleton next to it (27 %; the cauldron 34 %, two of them; mission 35 60 %): the common one, or the infernal one in
   * mission 35 and for 31 % of the cauldron's. The last stone's death completes the level (the missions' objective texts).
   */
  private hitStone(m: StoneObj, blow: number): void {
    if (!m.alive || blow <= 0) return;
    const others = [...this.stones].some((o) => o !== m && o.alive);
    if ((m.actorId === 70 || m.actorId === 80) && others) return;
    const killed = m.hurt(stoneDamage(blow, this.mapNumber), false);
    this.snd(this.pick(62, 3));
    const final = this.mapNumber === 35, cauldron = m.actorId === 80;
    // stone 70 answers a blow with effect slot type 6 (0x4247a0), whose sound is 77 `trueno`; the picture of that effect was not decoded
    if (m.actorId === 70 && this.rnd() * 100 < (final ? 80 : 50)) this.snd(77);
    if (this.monsters.length < 200 && this.rnd() * 100 < (final ? 60 : cauldron ? 34 : 27)) {
      for (let i = 0; i < (cauldron ? 2 : 1); i++) {
        let kind = final ? 10 : 9;
        if (cauldron && this.rnd() * 100 > 68) kind = 10;
        const c = this.world.findOpenCell(m.cx + Math.floor(this.rnd() * 6), m.cy + Math.floor(this.rnd() * 6));
        this.spawnScripted(kind, Math.floor(this.rnd() * 8), c.cx, c.cy);
      }
    }
    if (killed && ![...this.stones].some((o) => o.alive)) this.completeLevel();
  }

  /** Real placement: one monster per pack-0 marker whose actor we have art and animations for. */
  private spawnFromMap(spawns: NonNullable<GameOptions['spawns']>): void {
    for (const sp of spawns) {
      if (isStoneId(sp.id)) { this.addStone(Number(sp.id), sp.cx, sp.cy); continue; }
      const def = this.data.anims.actors[sp.id];
      if (!def || !this.data.atlases.has(def.pack)) continue;
      const m = this.make(sp.id, sp.cx, sp.cy);
      if (!def.npc) this.applyDifficulty(m);
      if (def.npc) {
        this.npcs.push({ id: sp.id, name: m.stats.name.trim(), creature: m });
        this.group.add(m.sprite);
        continue;
      }
      this.idOf.set(m, sp.id);
      m.dir = Math.floor(this.rnd() * 8);
      m.dormant = !!def.anims.Aparecer; // skeletons and infernal demons rise when the hero comes close
      this.monsters.push(m);
      this.group.add(m.sprite);
      if (!sp.route?.length && !m.dormant) this.roamers.set(m, { home: { cx: sp.cx, cy: sp.cy }, r: Math.max(1, this.data.actors[sp.id]?.IA?.Radio_Busqueda ?? 5), to: null, wait: 0 });
      if (sp.route?.length) this.patrols.set(m, { pts: [{ cx: sp.cx, cy: sp.cy }, ...sp.route], i: 0, wait: this.rnd() * 3 });
    }
  }

  /** Containers (chests, barrels, crates), goal objects and tile triggers are the map cells that carry scripts or have container sprites. */
  private initContainers(): void {
    const map = this.world.map;
    const scripts = new Map(map.scripts.map((sc) => [sc.index, sc]));
    const outside = map.tileset.toLowerCase() === 'outside';
    for (let i = 0; i < map.objects.length; i++) {
      const o = map.objects[i]!;
      const cx = i % map.dim, cy = Math.floor(i / map.dim);
      const id = o & 1023;
      const sc = map.scriptAt[i]! >= 0 ? scripts.get(map.scriptAt[i]!) : undefined;
      let owned = false;
      if (outside && o >> 10 === CONTAINER_PACK && (CHESTS.has(id) || id in BREAKABLES)) { // (the chest ids are the Outside pack's; Cave and Dungeon packs are not mapped yet)
        const chest = CHESTS.has(id);
        this.boxes.push({ cx, cy, id, chest, done: false });
        if (chest) this.world.setObject(cx, cy, (CONTAINER_PACK << 10) | (id - 1)); // show it closed
        owned = true;
      } else if (sc && o >> 10 === CONTAINER_PACK && sc.commands.some((c) => c.id === 1 || (c.id === 9 && c.args[0] > 0))) {
        this.boxes.push({ cx, cy, id, chest: true, done: false }); // a loot script on a pack-3 object: a chest of the Cave / Dungeon packs (no closed sprite known)
        owned = true;
      }
      if (!sc || owned) continue;
      // a named script that does nothing but mark a place is a goal marker (Lost Forrest: "Tumba de Domnir" on the tomb gate)
      if (/[a-z]/i.test(sc.name) && !/^bdt/i.test(sc.name) && !sc.commands.some((c) => c.id === 1)) { this.goals.push({ cx, cy, name: sc.name }); continue; }
      const repeat = sc.commands.every((c) => c.id === 2 || c.id === 3 || c.id === 11 || c.id === 12); // teleports and exits can be used again
      this.triggers.push({ cx, cy, script: sc.index, fired: false, repeat });
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

  /** True when the hero carries or wears the item. */
  private holds(id: number): boolean {
    return this.inventory.slots.includes(id) || Object.values(this.inventory.equipped).includes(id);
  }

  /** Ends the level successfully (script commands 3, 11 and 12). */
  private completeLevel(): void {
    if (this.status !== 'playing' || !this.hero.alive) return;
    this.status = 'complete';
    this.goalReached = true;
    this.say(LEVEL_MSG.completed);
    this.say(this.finalText);
  }

  /**
   * Runs a map script at a cell. Commands (decoded from the executable's interpreter):
   * 1 roll an item by type mask and chest level, 2 move the hero to a cell, 3 end the level when no live enemy of the race mask is left,
   * 4 add seconds to the mission clock, 5 raise actor a0+1 facing a1 at (a2,a3), 7 remove the object at (a0,a1), 8 remove the object here,
   * 9 drop a fixed item, 10 effect (not played), 11 end the level when the hero holds item a0, 12 end the level, 13 play sound a0.
   * A failed condition (3, 11) shows "You must meet the objective before exiting" and stops the script.
   */
  runScript(index: number, cx: number, cy: number): void {
    const sc = this.world.map.scripts.find((x) => x.index === index);
    if (!sc) return;
    let n = 0;
    for (const c of sc.commands) {
      let item: number | null = null;
      switch (c.id) {
        case 1: item = rollByMask(this.data.items, c.args[0], c.args[1], this.rnd, (d) => this.inventory.canUse(d)); break;
        case 9: if (c.args[0] > 0) item = c.args[0]; break;
        case 2: this.teleport(c.args[0], c.args[1]); break;
        case 3:
          if (this.monsters.some((m) => m.alive && ((m.stats.race ?? 0) & c.args[0]) !== 0)) { this.say(LEVEL_MSG.objective); return; }
          this.completeLevel();
          break;
        case 4: this.clock = c.args[0] > 0 ? c.args[0] : null; break; // the executable's set-timer routine: seconds x 35 ticks into both timer words (0 switches it off)
        case 5: this.spawnScripted(c.args[0] + 1, c.args[1], c.args[2], c.args[3]); break;
        case 7: this.world.setObject(c.args[0], c.args[1], 0); break;
        case 8: this.world.setObject(cx, cy, 0); break;
        case 11:
          if (!this.holds(c.args[0])) { this.say(LEVEL_MSG.objective); return; }
          this.completeLevel();
          break;
        case 12: this.completeLevel(); break;
        case 13: this.snd(c.args[0]); break;
        default: break; // 6, 10, 14: no visible effect here
      }
      if (item) { const o = DROP_SPOTS[n % DROP_SPOTS.length]!; this.spawnGround(item, cx + o[0], cy + o[1]); n++; }
    }
  }

  /** Moves the hero to the nearest open cell of (cx,cy) and drops every order it had. */
  private teleport(cx: number, cy: number): void {
    const c = this.world.findOpenCell(cx, cy);
    this.hero.cx = c.cx; this.hero.cy = c.cy;
    this.target = null; this.targetBox = null; this.walkTarget = null; this.talkTarget = null;
    this.version++;
  }

  /** Script command 5: a monster rises from the ground at a cell, already awake. */
  private spawnScripted(actor: number, dir: number, cx: number, cy: number): void {
    const id = String(actor), def = this.data.anims.actors[id];
    if (!def || def.npc || !this.data.atlases.has(def.pack)) return;
    const m = this.make(id, cx, cy);
    this.applyDifficulty(m);
    this.idOf.set(m, id);
    m.dir = ((dir % 8) + 8) % 8;
    this.alerted.add(m);
    m.setState('appear');
    this.monsters.push(m);
    this.group.add(m.sprite);
  }

  /** Walking onto a script cell (or next to one that sits under a solid object) sets it off. */
  private checkTriggers(): void {
    const h = this.hero;
    if (!h.alive || this.status !== 'playing') return;
    for (const t of this.triggers) {
      const on = Math.round(h.cx) === t.cx && Math.round(h.cy) === t.cy
        || (!this.world.isWalkable(t.cx, t.cy) && Math.hypot(h.cx - t.cx, h.cy - t.cy) < 1.6);
      if (!on) { if (t.repeat) t.fired = false; continue; }
      if (t.fired) continue;
      t.fired = true;
      this.runScript(t.script, t.cx, t.cy);
      if (this.status !== 'playing') return;
    }
  }

  /** Counts the mission clock down (per engine frame in the executable; game state 6 at zero) and ends the mission at zero. */
  private tickClock(dt: number): void {
    if (this.clock === null || this.status !== 'playing') return;
    this.clock -= dt;
    if (this.clock <= 0) { this.clock = 0; this.status = 'failed'; this.say(LEVEL_MSG.failed); }
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
        this.applyDifficulty(m);
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
      if (!m.alive || m.dormant) continue;
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
    h.secondAttack = !!h.def.anims.Atacar2 && !h.secondAttack; // the Barbarian alternates his two swings
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

  /** True while a bow (Amazon) or a staff (Sorceress) is wielded: the blow becomes a shot. */
  get ranged(): boolean {
    const id = this.inventory.equipped.weapon;
    const def = id ? this.inventory.def(id) : undefined;
    return !!def && (def.tipo & (32 | 64)) !== 0;
  }

  /** Mana one shot of the wielded staff costs (0 for a bow). */
  private get shotMana(): number {
    const id = this.inventory.equipped.weapon;
    return id && this.classId === 102 ? STAFF_MANA[id] ?? 0 : 0;
  }

  /** Maximum life follows class, level and Resistance (worn bonuses included); a gain also heals by that much. */
  private syncLife(): void {
    const h = this.hero, max = maxLife(this.classId as ClassKey, this.level, this.eff.resistance);
    const gain = max - h.stats.hp;
    h.stats.hp = max;
    if (h.alive) h.hp = Math.max(1, Math.min(max, h.hp + Math.max(0, gain)));
  }

  /** Damage and armour follow the equipment. */
  refreshHeroStats(): void {
    this.hero.stats.damage = this.inventory.damage();
    this.hero.stats.armor = this.inventory.armor();
    this.syncLife();
    this.stamina = Math.min(this.stamina, this.maxStamina);
    this.mana = Math.min(this.mana, this.maxMana);
    this.version++;
  }

  /**
   * Reads a parchment (see `spells.ts` for the executable's numbers): needs its Power requirement; the strength comes from the mana
   * you hold and the scroll leaves only part of it. The scroll is used up.
   */
  castScroll(index: number, def: ItemDef): boolean {
    const spell = SPELLS[def.id];
    if (!spell) { this.say(`${def.name}: its magic is not understood yet`); return false; }
    const lacks = this.missing(def);
    if (lacks.length) { this.say(`You need ${lacks.join(', ')} to read the ${def.name}`); return false; }
    const h = this.hero;
    const power = spellPower(this.mana);
    if (power < 1 && (spell.kind === 'blast' || spell.kind === 'freeze' || spell.kind === 'restore')) { this.say(`Not enough mana for the ${def.name}`); return false; }
    // "in sight": the monsters inside the screen rectangle around the hero
    const near = this.monsters.filter((m) => m.alive && !m.dormant && inSight(m.cx - h.cx, m.cy - h.cy));
    if (spell.kind !== 'allies') {
      this.fx.push(...spellFx(def.id, h.cx, h.cy, SPELL_RADIUS, spell.kind === 'blast' || spell.kind === 'freeze' ? near : []));
      if (def.id === 91) this.shake = 0.7;
    }
    const infernal = (m: Creature) => INFERNAL.has(this.idOf.get(m) ?? '');
    let keep = 'keep' in spell ? spell.keep : 0;
    switch (spell.kind) {
      case 'blast': {
        const dmg = Math.trunc(power / spell.divisor);
        this.snd(spell.sound);
        for (const m of near) {
          if (spell.fire && infernal(m)) { m.hp = Math.min(m.stats.hp, m.hp + dmg); continue; } // fire feeds the infernal ones
          this.damageMonster(m, dmg, !!spell.stagger);
        }
        this.say(`${def.name}: ${near.length ? `${near.length} enemies take ${dmg}` : 'no enemy in sight'}`);
        break;
      }
      case 'freeze': {
        const n = Math.trunc(power / spell.divisor);
        this.snd(spell.sound);
        for (const m of near) {
          this.slowed.set(m, n * 37 / 35); // 37 engine ticks per point
          if (infernal(m)) this.damageMonster(m, n, false);
        }
        this.say(`${def.name}: ${near.length} enemies slowed for ${n} s`);
        break;
      }
      case 'restore': {
        const mana = this.mana;
        const life = Math.trunc(mana * 2); // M/100: two life per mana point
        this.hero.hp = Math.min(h.stats.hp, h.hp + life);
        this.stamina = Math.min(this.maxStamina, this.stamina + mana);
        this.snd(23);
        this.say(`${def.name}: +${life} life and ${Math.trunc(mana)} stamina`);
        break;
      }
      case 'attr': {
        for (const k of ['strength', 'skill', 'resistance', 'magic'] as const) {
          const v = spell[k];
          if (!v) continue;
          this.attrs[k] = Math.min(ATTR_CAPS[this.classId as ClassKey][k], this.attrs[k] + v);
        }
        this.syncLife();
        if (spell.fillLife) h.hp = h.stats.hp;
        if (spell.fillMana) { keep = 0; this.mana = this.maxMana; }
        this.snd(23);
        this.say(`${def.name}: your attributes grow`);
        break;
      }
      case 'allies':
        this.say(`${def.name}: there is no hero beside you to share it with`);
        return false;
      case 'repair':
        this.inventory.repairWorn();
        this.say(`${def.name}: what you wear is as good as new`);
        this.snd(23);
        break;
    }
    if (!('fillMana' in spell && spell.fillMana)) this.mana *= keep;
    this.inventory.take(index);
    this.refreshHeroStats();
    return true;
  }

  /** Keys 1-4 reach the first four light objects (manual: "direct access objects ... any light items"). */
  static readonly QUICK_SLOTS = 4;

  /**
   * Mouse use of a backpack slot. Manual: parchments (and potions) are used with the right button; here the left button
   * wears equipment and only reminds you about consumables, so a stray click cannot burn a scroll.
   */
  activate(index: number, button: 'left' | 'right'): void {
    const id = this.inventory.slots[index];
    const def = id ? this.inventory.def(id) : undefined;
    if (!def || !this.hero.alive) return;
    if (button === 'left' && (def.kind === 'potion' || def.kind === 'scroll')) { this.say(`Right-click to use the ${def.name}`); return; }
    this.useSlot(index);
  }

  /** Keys 1-4. */
  useQuick(n: number): void {
    const at = this.inventory.quick()[n - 1];
    if (n >= 1 && n <= Game.QUICK_SLOTS && at !== undefined) this.useSlot(at);
  }

  /** Using an inventory slot: drink potions, read parchments, wear equipment. */
  useSlot(index: number): void {
    const id = this.inventory.slots[index];
    const def = id ? this.inventory.def(id) : undefined;
    if (!def || !this.hero.alive) return;
    if (def.kind === 'scroll') {
      this.castScroll(index, def);
      return;
    }
    if (def.kind === 'potion') {
      if (def.id === POTION_FORTUITY || def.id === POTION_KNOWLEDGE) {
        // The executable (use-item routine, 0x44de66): the Potion of Chance (azar) refills one of life, stamina or mana
        // (picked by a die roll of three); the Potion of Knowledge adds one point of Power, up to the class cap.
        this.inventory.take(index);
        this.snd(9);
        if (def.id === POTION_KNOWLEDGE) {
          const cap = ATTR_CAPS[this.classId as ClassKey].magic;
          if (this.attrs.magic < cap) this.attrs.magic++;
          this.syncLife();
          this.say(`You drink the ${def.name}: +1 Power`);
        } else {
          const pick = Math.floor(this.rnd() * 3);
          if (pick === 0) { this.hero.hp = this.hero.stats.hp; this.say(`You drink the ${def.name}: life restored`); }
          else if (pick === 1) { this.stamina = this.maxStamina; this.say(`You drink the ${def.name}: stamina restored`); }
          else { this.mana = this.maxMana; this.say(`You drink the ${def.name}: mana restored`); }
        }
        this.version++;
      } else if (def.data & 7) {
        // Data is a bit mask: 1 life, 2 stamina, 4 magic (the Vitality potion, 7, does all three and can hurt). The Potencia
        // range is a PERCENTAGE of the maximum (0x42b890: current += maximum * roll / 100, truncated, kept within 0..maximum).
        const [lo, hi] = def.power;
        const parts: string[] = [];
        const roll = () => lo + Math.floor(this.rnd() * (hi - lo + 1));
        const pct = (max: number) => { const r = roll(); return { r, v: Math.trunc((max * r) / 100) }; };
        if (def.data & 1) { const { r, v } = pct(this.hero.stats.hp); const left = Math.min(this.hero.stats.hp, this.hero.hp + v); parts.push(`${r >= 0 ? '+' : ''}${r}% life`); if (left <= 0) { this.hero.hurt(this.hero.hp); this.snd(CLASSES[this.classId].sound); this.die(); } else this.hero.hp = left; }
        if (def.data & 2) { const { r, v } = pct(this.maxStamina); this.stamina = Math.max(0, Math.min(this.maxStamina, this.stamina + v)); parts.push(`${r >= 0 ? '+' : ''}${r}% stamina`); }
        if (def.data & 4) { const { r, v } = pct(this.maxMana); this.mana = Math.max(0, Math.min(this.maxMana, this.mana + v)); parts.push(`${r >= 0 ? '+' : ''}${r}% mana`); }
        this.inventory.take(index);
        this.snd(9);
        this.fx.push(...potionFx(this.hero.cx, this.hero.cy, def.data));
        this.say(`You drink the ${def.name}: ${parts.join(', ')}`);
      } else this.say(`${def.name}: its magic is not understood yet`);
    } else if (slotOf(def) && this.inventory.canUse(def) && this.missing(def).length) {
      this.say(`You need ${this.missing(def).join(', ')} to use the ${def.name}`);
    } else if (this.inventory.equip(index)) {
      this.say(`You equip the ${def.name}`);
    } else if (!this.inventory.canUse(def) && def.kind !== 'book' && def.kind !== 'key' && def.kind !== 'quest') {
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

  /** Blood mode: a quick red puff on the creature that was hit (the original's red puff texture, GDI/3D 75). */
  private bleed(c: Creature): void {
    if (!this.blood) return;
    this.fx.push(makeFx(75, c.cx, c.cy, { follow: c, lift: 26, size0: 24, size1: 70, life: 0.35, alpha0: 0.9, alpha1: 0 }));
  }

  /** The monster the hero is going for, or the one he struck in the last few seconds: the HUD shows its name and life bar. */
  get focus(): Creature | null {
    if (this.target?.alive && !this.target.dormant) return this.target;
    const s = this.struck;
    return s && s.alive && !s.dormant && this.clockT - this.struckAt < 4 ? s : null;
  }

  /** Applies hero damage to a monster: hurt/die sounds, loot, kill count and experience. */
  private damageMonster(m: Creature, dmg: number, stagger = true): void {
    if (dmg > 0) { this.struck = m; this.struckAt = this.clockT; }
    if (this.stones.has(m)) { if (dmg > 0) this.hitStone(m as StoneObj, dmg); return; }
    if (dmg < 0) { m.hp = Math.min(m.stats.hp, m.hp - dmg); return; } // a family bonus below -1 heals (fire on demons)
    if (dmg === 0) return;
    const killed = m.hurt(dmg, stagger);
    this.bleed(m);
    if (killed || stagger) this.msnd(m, killed ? 2 : 3); // only a blow that staggers it makes it cry out
    if (killed) {
      this.dropLoot(m, this.idOf.get(m) ?? '');
      this.kills++;
      this.xp += m.stats.xp[0] + Math.floor(this.rnd() * (m.stats.xp[1] - m.stats.xp[0] + 1));
      this.checkLevel();
    }
  }

  /** Rolls and applies the hero's weapon damage against one monster (melee swing or arrow arrival). */
  /** Wear of one blow on a worn item; a broken item is gone and the hero's numbers follow. */
  private wearItem(slot: 'weapon' | 'shield' | 'armor', amount = 1, flat = false): void {
    if (amount <= 0) return;
    const broke = this.inventory.wear(slot, amount, flat);
    if (!broke) return;
    this.say(`Your ${broke.name.includes(':') ? broke.name.slice(broke.name.indexOf(':') + 1).trim() : broke.name} broke`);
    this.snd(13);
    this.refreshHeroStats();
  }

  /**
   * The monster's receive routine of the executable. The blow B + W is multiplied by 3 when the hero stands behind the monster
   * (both face the same way), by 2 when almost behind it; ranged blows never are. The monster's armour (halved / doubled by the
   * difficulty) is then taken off, at least 1 is left. A frontal melee blow can be covered (INI `Rnd_Bloqueo`, in percent) and then
   * does nothing. Otherwise the weapon may wear (1 in 11 blows, 1 or 2 points divided by its level, plus a flat point for 5-7 % of
   * melee swings) and the monster staggers only if the blow is at least its `Aturdirse` (ranged: two more).
   */
  private heroHitMonster(m: Creature, _sneak: boolean, ranged = false): void {
    if (!m.alive) return;
    this.struck = m; this.struckAt = this.clockT;
    // the executable's sum: class term B (own strength) + weapon W (Potencia roll plus its family bonus), then the
    // 0..2 -> 1..3 rule; a family bonus below zero replaces everything (it heals the monster, fire on demons)
    const [lo, hi] = this.hero.stats.damage;
    const potency = Math.max(1, lo + Math.floor(this.rnd() * (hi - lo + 1)));
    const part = potency * (this.inventory.weaponVs(m.stats.race ?? 0) - 1);
    let total = part < 0 ? Math.trunc(part) : classDamage(this.classId as ClassKey, this.eff, this.level) + potency + Math.trunc(part);
    total = minDamage(total, this.rnd());
    if (total > 0 && this.inventory.wearing(SPECIAL.dragonShield)) total += 1; // shield: "+1 in the attack"
    if (this.stones.has(m)) { this.hitStone(m as StoneObj, total); return; }
    const flesh = this.data.actors[this.idOf.get(m) ?? '']?.Sonidos?.Carne !== 0;
    let dmg = total, mult = 1;
    if (total > 0) {
      if (!ranged) { const turn = Math.abs(this.hero.dir - m.dir); mult = turn === 0 ? 3 : turn === 1 || turn === 7 ? 2 : 1; }
      dmg = Math.max(1, total * mult - m.stats.armor - (MASTER_ARMOR[this.idOf.get(m) ?? ''] ?? 0));
      const covering = m.state === 'hit' || m.state === 'block';
      if (!ranged && mult === 1 && !covering && Math.floor(this.rnd() * 1000) * 0.1 <= (m.stats.block ?? 0)) {
        this.snd(this.pick(53, 4)); // the monster covers: the blow does nothing (c_cubrir)
        m.setState('block');
        m.cooldown = Math.max(0, m.cooldown - 4 * AI_TICK);
        return;
      }
      if (mult > 1) this.say(mult === 3 ? 'A blow in the back!' : 'A blow from behind!');
      if (this.rnd() < 0.09) this.wearItem('weapon', 1 + Math.floor(this.rnd() * 2));
      if (!ranged && this.rnd() < (this.classId === 100 ? 0.05 : 0.07)) this.wearItem('weapon', 1, true);
    }
    this.snd(this.pick(flesh ? 59 : 62, 3)); // c_carne / c_nocarne
    const stun = m.stats.stun ?? 0;
    if (dmg > 0 && this.inventory.equipped.weapon === SPECIAL.lightSword) m.stats.armor = Math.max(0, m.stats.armor - 1); // "Destroy enemy armor"
    if (dmg > 0 && this.inventory.wearing(SPECIAL.blood) && this.hero.alive) { // "Rob 20% of Life"
      const h = this.hero;
      h.hp = Math.min(h.stats.hp, h.hp + Math.max(1, Math.round(dmg * 0.2)));
    }
    this.damageMonster(m, dmg, ranged ? dmg > stun + 1 + Math.floor(this.rnd() * 2) : dmg >= stun);
  }

  private heroStrike(): void {
    const h = this.hero;
    let hit = false;
    const bow = this.ranged;
    const staff = bow && this.classId === 102;
    let shoot = bow;
    if (staff) {
      // a staff shot costs mana (per-staff table of the executable); with too little the staff stays silent
      const cost = this.shotMana;
      if (this.mana < cost) { this.say(`Not enough mana (${cost} needed)`); shoot = false; }
      else { this.mana -= cost; this.snd(STAFF_SOUND[staffElement(this.inventory.equipped.weapon ?? 0)]); }
    } else if (bow) this.snd(this.pick(50, 3)); // c_arco
    if (shoot) {
      let nearest: Creature | null = null, nd = Infinity;
      for (const m of this.monsters) {
        if (!m.alive || m.dormant) continue;
        const dx = m.cx - h.cx, dy = m.cy - h.cy, d = Math.hypot(dx, dy);
        if (d > BOW_RANGE || (d > 0.6 && (dx * this.facing.x + dy * this.facing.y) / d < 0.9)) continue; // within ~25 degrees of the aim
        if (d < nd) { nd = d; nearest = m; }
      }
      const ax = nearest ? nearest.cx - h.cx : this.facing.x, ay = nearest ? nearest.cy - h.cy : this.facing.y;
      const n = Math.hypot(ax, ay) || 1;
      const sneakNow = this.effectiveStance === 'stealth' ? new Set(this.unaware) : new Set<Creature>();
      const kind: ProjKind = staff ? 'bolt' : 'arrow';
      const color = staff ? STAFF_COLOR[staffElement(this.inventory.equipped.weapon ?? 0)] : 0xffffff;
      this.projectiles.push(makeProjectile(kind, h.cx + (ax / n) * 0.5, h.cy + (ay / n) * 0.5, ax, ay, staff ? PX_HERO_BOLT : PX_HERO_ARROW, true, (m) => { if (m) this.heroHitMonster(m, sneakNow.has(m), true); }, color));
    }
    if (!bow) for (const m of this.monsters) {
      if (!m.alive || m.dormant) continue;
      const dx = m.cx - h.cx, dy = m.cy - h.cy, d = Math.hypot(dx, dy);
      if (d > HIT_RANGE) continue;
      if (d > 0.6 && (dx * this.facing.x + dy * this.facing.y) / d < 0.2) continue; // must be in front
      hit = true;
      this.heroHitMonster(m, this.effectiveStance === 'stealth' && this.unaware.has(m));
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
    this.msnd(m, 0);
    this.hurtHero(m.stats.damage, m.cx - h.cx, m.cy - h.cy, m, true);
  }

  /** Damage dealt to the hero from the direction (fromx, fromy): a raised shield stops blows from the front arc. */
  private hurtHero([lo, hi]: [number, number], fromx: number, fromy: number, attacker?: Creature, melee = false): void {
    const h = this.hero;
    if (!h.alive) return;
    const raw = lo + Math.floor(this.rnd() * (hi - lo + 1));
    // shield of the double edge: "-1 l.p. from the combatants" (the monster that strikes in melee loses a point)
    if (melee && attacker?.alive && this.inventory.wearing(SPECIAL.doubleEdge)) this.damageMonster(attacker, 1, false);
    if (this.blocking) {
      const ed = Math.hypot(fromx, fromy) || 1;
      if ((fromx * this.facing.x + fromy * this.facing.y) / ed > 0) {
        this.snd(this.pick(53, 4)); // c_cubrir
        if (this.rnd() < 0.8) this.wearItem('shield', Math.floor(raw / 3) + 1); // the Barbarian's routine: 8 blocked blows in 10 wear the shield
        return;
      }
    }
    this.bleed(h);
    const taken = hitReceived(raw, h.stats.armor);
    const died = h.hurt(taken);
    if (taken > 0 && attacker?.alive && this.inventory.wearing(SPECIAL.vengeance)) this.damageMonster(attacker, Math.max(1, Math.round(taken * 0.15)), false); // "Return 15% of inflicted damage"
    // armour wear per class, from the executable: Barbarian 20 % of the blows, third of the damage plus a roll of up to as much;
    // Amazon 27 % and Sorceress 30 %, half the damage plus a roll plus the armour value itself (only when armour is worn)
    if (this.classId === 100) {
      const b = Math.floor(taken / 3);
      if (this.rnd() < 0.2) this.wearItem('armor', b + (b > 0 ? Math.floor(this.rnd() * b) : 0));
    } else if (h.stats.armor > 0 && this.rnd() < (this.classId === 101 ? 0.27 : 0.3)) {
      const half = Math.floor(taken / 2);
      this.wearItem('armor', half + (half > 2 ? Math.floor(this.rnd() * (half - 2)) : 0) + h.stats.armor);
    }
    const sb = CLASSES[this.classId].sound;
    this.snd(died ? sb : this.pick(sb + 1, 2)); // <class>_morir / _recibir
    if (died) this.die();
  }

  /** The ranged monsters' release frame: an arrow or bolt leaves towards where the hero stands now. */
  private monsterShoot(m: Creature): void {
    const h = this.hero, r = RANGED[this.idOf.get(m) ?? ''];
    if (!h.alive || !r) return;
    const ex = h.cx - m.cx, ey = h.cy - m.cy, d = Math.hypot(ex, ey) || 1;
    this.msnd(m, 0);
    const from = { x: m.cx, y: m.cy };
    this.projectiles.push(makeProjectile(r.kind, m.cx + (ex / d) * 0.6, m.cy + (ey / d) * 0.6, ex, ey, PX_MONSTER_SHOT, false, (t) => {
      if (t === h) this.hurtHero(m.stats.damage, from.x - h.cx, from.y - h.cy, m);
    }, r.color));
  }

  private stepProjectiles(dt: number): void {
    const h = this.hero;
    for (const p of this.projectiles) {
      if (p.done) continue;
      p.age += dt;
      p.cx += p.vx * dt;
      p.cy += p.vy * dt;
      let target: Creature | null | undefined;
      if (p.friendly) {
        for (const m of this.monsters) if (m.alive && !m.dormant && pixelDistance(m.cx - p.cx, m.cy - p.cy) <= HIT_PIXELS) { target = m; break; }
      } else if (h.alive && pixelDistance(h.cx - p.cx, h.cy - p.cy) <= HIT_PIXELS) target = h;
      if (target === undefined && !this.world.isWalkable(p.cx, p.cy)) target = null; // stuck in a tree or wall
      if (target === undefined && p.age >= p.life) target = null; // fell short
      if (p.kind === 'bolt' && !p.done) {
        p.trail -= dt;
        if (p.trail <= 0) { p.trail = 0.05; this.fx.push(makeFx(p.color === 0xff8040 ? 77 : 118, p.cx, p.cy, { lift: 26, size0: 46, size1: 12, life: 0.35, color: p.color })); }
      }
      if (target !== undefined) {
        p.done = true;
        if (p.kind === 'bolt') this.fx.push(makeFx(118, p.cx, p.cy, { lift: 26, size0: 30, size1: 120, life: 0.35, color: p.color }));
        p.hit(target);
      }
    }
    for (let i = this.projectiles.length - 1; i >= 0; i--) if (this.projectiles[i]!.done) this.projectiles.splice(i, 1);
  }

  /**
   * Manual: "When you die, your hero will lose the objects that he/she is carrying in their inventory and one point from
   * each separate ability." Applied at once, so the character window shows it. Guesses: worn equipment counts as carried,
   * gold is kept, an ability never drops below 1, level and unspent points are kept.
   */
  private die(): void {
    // The executable's death routine (0x429e40): worn gear is dropped except the legendary weapons (ids 14, 48, 61) and item
    // 129, which stay with the hero; a worn legendary weapon goes into the first free quick slot. Each ability loses one point
    // (the setter clamps at 0).
    const inv = this.inventory;
    const keep: { id: number; left: number }[] = [];
    for (const k of Object.keys(inv.equipped) as (keyof typeof inv.equipped)[]) {
      const id = inv.equipped[k]!;
      if (KEEPS_ON_DEATH.has(id)) keep.push({ id, left: inv.equippedLeft[k] ?? 0 });
    }
    const lost = inv.slots.filter(Boolean).length + Object.keys(inv.equipped).length - keep.length;
    inv.slots.fill(0);
    for (const k of Object.keys(inv.equipped) as (keyof typeof inv.equipped)[]) delete inv.equipped[k];
    inv.repairAll();
    for (const kept of keep) inv.add(kept.id, kept.left);
    for (const k of ['strength', 'skill', 'resistance', 'magic'] as const) this.attrs[k] = Math.max(0, this.attrs[k] - 1);
    this.dead = true;
    this.version++;
    this.say(`You have died: ${lost} item${lost === 1 ? '' : 's'} lost and one point from each ability`);
  }

  /** True once the hero has died and paid the penalty. */
  dead = false;

  /** The hero as the next attempt starts with it. */
  save(): HeroSave {
    const kept = this.dead ? this.inventory.slots.flatMap((id, i) => (id ? [{ id, left: this.inventory.slotLeft[i] ?? 0 }] : [])) : [];
    return { attrs: { ...this.attrs }, level: this.level, xp: this.xp, points: this.points, gold: this.inventory.gold, ...(kept.length ? { kept } : {}) };
  }

  /** The hero as he walks out of a mission: everything he has, at full strength (saving happens between missions only). */
  carry(): HeroSave {
    return { ...this.save(), inv: { slots: [...this.inventory.slots], equipped: { ...this.inventory.equipped }, left: [...this.inventory.slotLeft], equippedLeft: { ...this.inventory.equippedLeft } } };
  }

  /** @param move cell-space unit vector from the keyboard, or null */
  update(dt: number, move: { x: number; y: number } | null): void {
    const h = this.hero;
    this.clockT += dt;
    this.moving = false;
    this.updateHero(dt, move);
    this.tickResources(dt);
    this.pickups();
    this.checkGoal();
    this.checkTriggers();
    this.tickClock(dt);
    for (const [m, t] of this.slowed) { if (t - dt <= 0 || !m.alive) this.slowed.delete(m); else this.slowed.set(m, t - dt); }
    for (const m of this.monsters) this.updateMonster(m, dt);
    for (const n of this.npcs) n.creature.update(dt);
    h.update(dt);
    for (const m of this.monsters) m.update(dt);
    this.stepProjectiles(dt);
    stepFx(this.fx, dt);
    this.shake = Math.max(0, this.shake - dt);
  }

  /** Attributes with worn-item bonuses; requirements use the plain `attrs`, everything derived (life, stamina, mana, spells) uses these. */
  get eff(): NonNullable<GameOptions['attrs']> {
    const w = this.inventory.worn();
    return { strength: this.attrs.strength + w.strength, skill: this.attrs.skill + w.skill, resistance: this.attrs.resistance + w.resistance, magic: this.attrs.magic + w.magic };
  }
  get maxStamina(): number { return Math.max(1, maxStamina(this.classId as ClassKey, this.level, this.eff.resistance)); }
  get maxMana(): number { return maxMana(this.level, this.eff.magic); }

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
    if (this.attrs[attr] >= ATTR_CAPS[this.classId as ClassKey][attr]) return false; // each class tops out per attribute
    this.points--;
    this.attrs[attr]++;
    this.syncLife();
    this.version++;
    return true;
  }

  private tickResources(dt: number): void {
    if (!this.hero.alive) return;
    // per-frame values the class routines add to the stamina and mana pools (see rules.ts)
    const t = STAMINA_TICK[this.classId as ClassKey];
    // The executable's per-frame hero state routine (0x42c1f8): standing still regains `rest`, walking `walk`, walking in stealth
    // (speed below the walking speed) loses `stealth`, running loses `run` (more in body armour); while attacking, covering or
    // being hit nothing changes.
    const busy = this.hero.state === 'attack' || this.hero.state === 'hit' || this.hero.state === 'block' || this.hero.state === 'dead';
    let tick = 0;
    if (!busy) {
      if (!this.moving) tick = t.rest;
      else if (this.effectiveStance === 'run') tick = this.inventory.equipped.armor ? t.runArmor : t.run;
      else if (this.effectiveStance === 'stealth') tick = t.stealth;
      else tick = t.walk;
    }
    this.stamina = Math.max(0, Math.min(this.maxStamina, this.stamina + perSecond(tick) * dt));
    this.mana = Math.min(this.maxMana, this.mana + perSecond(manaRegenTick(this.eff.strength, this.level)) * dt);
  }

  private checkLevel(): void {
    while (this.level < MAX_LEVEL && this.xp >= xpForLevel(this.level + 1)) {
      this.level++;
      this.syncLife(); // maximum life grows with the level
      const st = this.hero.stats;
      this.points += POINTS_PER_LEVEL; // manual: "+4" points to distribute on the character specifications window
      this.hero.hp = st.hp;
      this.stamina = this.maxStamina; // the original refills life, stamina and mana
      this.mana = this.maxMana;
      this.snd(CLASSES[this.classId].sound + 3); // <class>_nivel
      this.fx.push(...levelUpFx(this.hero.cx, this.hero.cy));
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

  private step(c: Creature, vx: number, vy: number, pxPerTick: number, dt: number): void {
    const run = Math.max(Math.abs(vx - vy) * 32, Math.abs(vx + vy) * 16); // screen pixels per cell moved along (vx, vy)
    const speed = run > 0 ? (pxPerTick * GAME_FPS) / run : 0;
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
      const stance = this.effectiveStance;
      h.walkAnim = stance === 'run' ? 'Extra' : stance === 'stealth' ? 'Vigilar' : 'Andar';
      h.setState('walk');
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

  /** Unaware monsters standing around now and then play their bored / look-around animation (Aburrido, Vigilar). */
  private fidget(m: Creature): void {
    if (m.state === 'idle' && m.idleFor > 4 && this.rnd() < 0.01 && m.has('bored')) m.setState('bored');
  }

  /**
   * The executable's idle routine: with nothing to do a monster picks a random cell around its home (`Radio_Busqueda` cells
   * either way), walks there at its normal speed and waits 1-8 seconds before picking the next.
   */
  private roam(m: Creature, dt: number): void {
    const w = this.roamers.get(m);
    if (!w) { if (m.state === 'walk') m.setState('idle'); return; }
    if (w.wait > 0) w.wait -= dt;
    else {
      w.to = { cx: w.home.cx + Math.floor(this.rnd() * w.r) * 2 - w.r, cy: w.home.cy + Math.floor(this.rnd() * w.r) * 2 - w.r };
      w.wait = 1 + Math.floor(this.rnd() * 8);
    }
    if (!w.to) { if (m.state === 'walk') m.setState('idle'); return; }
    const ex = w.to.cx - m.cx, ey = w.to.cy - m.cy, d = Math.hypot(ex, ey);
    if (d < 0.2) { w.to = null; if (m.state === 'walk') m.setState('idle'); return; }
    m.face(ex, ey);
    m.setState('walk');
    const x0 = m.cx, y0 = m.cy;
    this.step(m, ex / d, ey / d, m.stats.speed, dt);
    if (Math.hypot(m.cx - x0, m.cy - y0) < 1e-4) { w.to = null; m.setState('idle'); } // blocked: stand and wait
  }

  /** Unaware monsters stroll between their route points, pausing at each. */
  private patrol(m: Creature, dt: number): void {
    const p = this.patrols.get(m);
    if (!p) { this.roam(m, dt); return; }
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

  /** Archer / mage behaviour: close in until the hero is in range and in the clear, back away when he gets too close, shoot in between. */
  private updateShooter(m: Creature, rg: (typeof RANGED)[string], ex: number, ey: number, d: number, dt: number): void {
    const h = this.hero;
    const speed = m.stats.speed * (this.slowed.has(m) ? 0.5 : 1);
    const clear = lineClear((x, y) => this.world.isWalkable(x, y), m.cx, m.cy, h.cx, h.cy);
    if (d > rg.range || !clear) {
      m.setState('walk');
      this.step(m, ex / d, ey / d, speed, dt);
      return;
    }
    if (d < rg.keep) {
      const x0 = m.cx, y0 = m.cy;
      this.step(m, -ex / d, -ey / d, speed * 0.8, dt);
      if (Math.hypot(m.cx - x0, m.cy - y0) > 1e-4) { m.setState('walk'); return; } // else cornered: shoot from here
    }
    if (m.cooldown === 0) {
      m.onStrike = (c) => this.monsterShoot(c);
      m.setState('attack');
      const [lo, hi] = m.stats.cooldown;
      m.cooldown = (lo + this.rnd() * (hi - lo)) * (this.slowed.has(m) ? 2 : 1);
    } else if (m.state === 'walk') m.setState('idle');
  }

  private updateMonster(m: Creature, dt: number): void {
    if (!m.alive || this.stones.has(m)) return;
    const h = this.hero;
    if (m.state === 'attack' || m.state === 'hit' || m.state === 'appear' || m.state === 'taunt' || m.state === 'bored') return;
    const ex = h.cx - m.cx, ey = h.cy - m.cy, d = Math.hypot(ex, ey);
    const aggro = (m.stats.hearing + 3) * (this.alerted.has(m) || this.effectiveStance !== 'stealth' ? 1 : STEALTH_HEARING);
    if (m.dormant) {
      // lies still until the hero is within hearing range, then rises (Aparecer) and is alert
      if (h.alive && d <= aggro) {
        m.dormant = false;
        this.alerted.add(m);
        m.face(ex, ey);
        m.setState('appear');
        this.msnd(m, 1);
      }
      return;
    }
    if (!h.alive || d > aggro) { this.patrol(m, dt); this.fidget(m); return; }
    if (!this.alerted.has(m)) {
      this.alerted.add(m);
      this.msnd(m, 1);
      m.face(ex, ey);
      if (m.has('taunt')) { m.setState('taunt'); return; } // Alarma: a roar before the chase
    }
    m.face(ex, ey);
    const rg = RANGED[this.idOf.get(m) ?? ''];
    if (rg && m.has('attack')) { this.updateShooter(m, rg, ex, ey, d, dt); return; }
    if (d > MELEE) {
      m.setState('walk');
      this.step(m, ex / d, ey / d, m.stats.speed * (this.slowed.has(m) ? 0.5 : 1), dt);
      // keep monsters from stacking on top of each other
      for (const o of this.monsters) {
        if (o === m || !o.alive) continue;
        const ox = m.cx - o.cx, oy = m.cy - o.cy, od = Math.hypot(ox, oy);
        if (od < 0.7 && od > 1e-3) this.step(m, ox / od, oy / od, 1.2, dt);
      }
    } else if ((m.state as string) === 'walk') {
      // arriving: the executable (0x434326) waits before the first blow, half an attack delay (two thirds of one at the
      // easy level's x1.5), and only then strikes; later blows wait the whole delay
      const [lo, hi] = m.stats.cooldown;
      m.cooldown = (lo + this.rnd() * (hi - lo)) * FIRST_BLOW[this.difficulty] * (this.slowed.has(m) ? 2 : 1);
      m.setState('idle');
    } else if (m.cooldown === 0) {
      m.onStrike = (c) => this.monsterStrike(c);
      m.secondAttack = !!m.def.anims.Atacar2 && this.rnd() < 0.5;
      m.setState('attack');
      const [lo, hi] = m.stats.cooldown;
      m.cooldown = (lo + this.rnd() * (hi - lo)) * (this.slowed.has(m) ? 2 : 1);
    } else if (m.state === 'walk') m.setState('idle');
  }
}
