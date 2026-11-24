/**
 * Parchments (item type 512), as the executable's use-item routine (0x44df43..0x44e660) does them. Everything runs from the
 * hero's current mana M (raw units, 200 per point): the strength is P = M/100 (that is two per mana point), and above 60 only
 * half of the excess counts. Each scroll then keeps a share of the mana that is left: a third after light / ice / fire / earth /
 * vitality, a quarter after incineration, half after life, vampire and the attribute scrolls, none after storm and restoration;
 * immunity refills it. "In sight" is the screen rectangle (640x480) around the hero. There is no mana price and no per-scroll
 * level in the code: the `Nivel` of a parchment only matters for the shop and the chests. Sound ids: 22 onda, 23 magia,
 * 24 electric, 25 rocas, 71-77 fire / ice / dead / thunder effects.
 */
export type Spell =
  | { kind: 'blast'; divisor: number; keep: number; sound: number; fire?: boolean; stagger?: boolean; heals?: never }
  | { kind: 'freeze'; divisor: number; keep: number; sound: number }
  | { kind: 'restore'; keep: number; party?: boolean }  // life: life += M/100, stamina += M (all mana converted)
  | { kind: 'attr'; strength?: number; skill?: number; resistance?: number; magic?: number; fillLife?: boolean; fillMana?: boolean; keep: number }
  | { kind: 'allies' }                          // vampire: needs other heroes (none in single player)
  | { kind: 'repair' };                         // restoration: the worn weapon, shield and armour are as new; all mana goes

export const SPELLS: Record<number, Spell> = {
  86: { kind: 'blast', divisor: 4, keep: 1 / 3, sound: 22, stagger: true },   // light: P/4 to everything in sight, staggers
  87: { kind: 'blast', divisor: 2, keep: 0, sound: 77, stagger: true },       // storm: P/2, the strongest, takes all mana
  88: { kind: 'freeze', divisor: 4, keep: 1 / 3, sound: 74 },                 // ice: slows for P/4 seconds; hurts the infernal ones for P/4
  89: { kind: 'blast', divisor: 4, keep: 1 / 3, sound: 72, fire: true },      // fire: P/4; heals the infernal ones (ids 3, 10, 19, 20)
  90: { kind: 'blast', divisor: 3, keep: 1 / 4, sound: 72, fire: true },      // incineration: P/3
  91: { kind: 'blast', divisor: 4, keep: 1 / 3, sound: 25 },                  // earth: earthquake, P/4
  92: { kind: 'restore', keep: 1 / 2 },                                       // life
  93: { kind: 'restore', keep: 1 / 3, party: true },                          // vitality (every hero in the party)
  94: { kind: 'allies' },
  95: { kind: 'attr', strength: 1, keep: 1 / 2 },
  96: { kind: 'attr', skill: 1, keep: 1 / 2 },
  97: { kind: 'attr', resistance: 1, keep: 1 / 2 },
  98: { kind: 'attr', magic: 1, keep: 1 / 2 },
  99: { kind: 'attr', strength: 2, skill: 2, resistance: 2, magic: 2, keep: 1 / 2 },   // sacred
  100: { kind: 'attr', strength: 2, skill: 2, resistance: 2, magic: 2, keep: 1 / 2 },  // of the Gods (+ every hero in the party)
  101: { kind: 'attr', strength: 2, fillLife: true, keep: 1 / 2 },                     // Berserk
  102: { kind: 'attr', magic: 2, fillMana: true, keep: 1 },                            // immunity (the INI calls it "de la mente")
  103: { kind: 'repair' },
};

/** Monsters (actor ids) that fire heals and ice burns: the infernal goblin and skeleton and the two demons. */
export const INFERNAL = new Set(['3', '10', '19', '20']);

/** Sight rectangle for area spells: the 640x480 screen around the hero, in iso pixels. */
export const inSight = (dx: number, dy: number): boolean => Math.abs((dx - dy) * 32) <= 320 && Math.abs((dx + dy) * 16) <= 240;
/** Radius used to draw the rings of the effect (cells). */
export const SPELL_RADIUS = 10;

/** The strength of a scroll for a hero holding `mana` points: M/100 with M = 200 per point, half of what is above 60. */
export const spellPower = (mana: number): number => {
  const p = Math.trunc(mana * 2);
  return p > 60 ? p - Math.trunc((p - 60) / 2) : p;
};
