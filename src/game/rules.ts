/**
 * Hero rules read out of Nightstone.exe (see docs/RULES.md "From the executable"). Everything here is a pure function
 * of the class, level and attributes, so it can be tested without a world.
 *
 * Attribute names follow the game: strength (Fuerza), skill (Destreza), resistance (Resistencia), magic (Magia).
 * Stamina and mana are stored by the original in 1/200 units (a full Barbarian stamina bar is 9000); this port keeps
 * them in whole points (9000 / 200 = 45), which is also the unit of the potion data ("stamina potion 40..60").
 */
export type ClassKey = 100 | 101 | 102;
export interface Attrs { strength: number; skill: number; resistance: number; magic: number }

/** The engine runs its logic at 35 frames per second (the SETFPS console command defaults to 0x23). */
export const GAME_FPS = 35;
export const TICK = 1 / GAME_FPS;

/** The level table stops at 50 (the level-up test is skipped from level 50 on). */
export const MAX_LEVEL = 50;
/** Total experience needed to reach `level`: 195 n^2 + 200 for n >= 2 (the table the executable fills at start-up). */
export const xpForLevel = (level: number): number => (level <= 1 ? 0 : 195 * level * level + 200);
/** Attribute points granted by a level-up. */
export const POINTS_PER_LEVEL = 4;

/** Starting attributes of each class (the class constructor of the hero record). */
export const START_ATTRS: Record<ClassKey, Attrs> = {
  100: { strength: 32, skill: 24, resistance: 30, magic: 11 },
  101: { strength: 22, skill: 28, resistance: 22, magic: 14 },
  102: { strength: 19, skill: 23, resistance: 21, magic: 30 },
};
/** The most a class can train each attribute to (worn-item bonuses are on top). */
export const ATTR_CAPS: Record<ClassKey, Attrs> = {
  100: { strength: 90, skill: 85, resistance: 85, magic: 45 },
  101: { strength: 82, skill: 90, resistance: 79, magic: 45 },
  102: { strength: 60, skill: 85, resistance: 70, magic: 90 },
};

/** C-style integer division (truncates towards zero), as the compiled code does. */
const idiv = (a: number, b: number): number => Math.trunc(a / b);

/** Maximum life of the hero. `resistance` and `level` as in the game's derived-stat routine. */
export function maxLife(cls: ClassKey, level: number, resistance: number): number {
  if (cls === 100) return 43 + idiv(level, 3) + Math.trunc(2.3 * resistance);
  if (cls === 101) return 35 + idiv(level, 5) + 2 * resistance;
  return 25 + idiv(level, 4) + 2 * resistance;
}

/** Maximum stamina in whole points (the original keeps 200 times this). */
export function maxStamina(cls: ClassKey, level: number, resistance: number): number {
  if (cls === 100) return 3 * (level + 4) + resistance;
  if (cls === 101) return resistance + 2 * level + idiv(level, 2) + 11;
  return Math.floor((190 * (resistance + 2 * level + 14)) / 200);
}

/** Maximum mana in whole points: level plus twice the Power, for every class. */
export const maxMana = (level: number, magic: number): number => Math.max(0, level + 2 * magic);

/**
 * The class term "B" of the damage sum `B + W + S` (W = the weapon, S = special items): the hero's own strength.
 * Barbarian: Strength/10 and Skill/17 above their floors; Amazon: Skill/10 and Strength/11; Sorceress: Power/9 and
 * Skill/13; plus level/17 for everybody. Divisions truncate towards zero, so a weak hero adds nothing.
 */
export function classDamage(cls: ClassKey, a: Attrs, level: number): number {
  const lv = idiv(level, 17);
  if (cls === 100) return idiv(a.strength - 16, 10) + idiv(a.skill - 25, 17) + lv;
  if (cls === 101) return idiv(a.skill - 25, 10) + idiv(a.strength - 25, 11) + lv;
  return idiv(a.magic - 25, 9) + idiv(a.skill - 25, 13) + lv;
}

/** "The damage sum is 0..2 -> roll 1..3" rule of the three damage routines. `r` is a uniform [0,1) draw. */
export function minDamage(total: number, r: number): number {
  return total >= 0 && total <= 2 ? 1 + Math.floor(r * 3) : total;
}

/** Life lost when a hit of `damage` lands on a hero wearing `armor` (level of the body armour): at least 1. */
export const hitReceived = (damage: number, armor: number): number => (damage <= 0 ? damage : Math.max(1, damage - armor - 1));

/** Mana of one shot of each Sorceress staff (item id -> points; the executable's table is in 1/200 units). */
export const STAFF_MANA: Record<number, number> = {
  53: 4.5, 54: 6.75, 55: 11.25, 56: 3.4, 57: 5.45, 58: 7.5, 59: 3.475, 60: 5.75, 61: 8.5, 132: 3.45, 133: 5.5, 134: 7.25,
};

/** Per-frame stamina changes (original units, 1/200 point) of each class: resting, running, running in body armour, guarding, sneaking. */
export const STAMINA_TICK: Record<ClassKey, { rest: number; run: number; runArmor: number; guard: number; sneak: number }> = {
  100: { rest: 3, run: -5, runArmor: -6, guard: -3, sneak: 2 },
  101: { rest: 4, run: -6, runArmor: -7, guard: -5, sneak: 4 },
  102: { rest: 3, run: -6, runArmor: -6, guard: -3, sneak: 2 },
};
/** Stamina points per second for a per-frame value of the table above. */
export const perSecond = (tick: number): number => (tick * GAME_FPS) / 200;

/** Mana regained per frame while resting (original 1/200 units): Strength/8 + level/3 + 3. */
export const manaRegenTick = (strength: number, level: number): number => idiv(strength, 8) + idiv(level, 3) + 3;
