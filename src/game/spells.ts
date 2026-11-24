/**
 * Parchments (item type 512). Effects are from the manual ("PARCHMENTS"); the data files only give each scroll a level
 * (`Nivel` 2-5), a price and an `R_Magia` requirement, so every number below — damage, radius, durations, mana cost —
 * is a placeholder. Sound ids: 22 onda, 23 magia, 24 electric, 25 rocas, 71-77 fire/ice/dead/thunder effects.
 */
export type Spell =
  | { kind: 'blast'; base: number; perPower: number; sound: number; stun?: boolean; heals?: never }
  | { kind: 'freeze'; seconds: number; sound: number }
  | { kind: 'restore'; scale: number }          // life: all mana becomes life and stamina
  | { kind: 'attr'; strength?: number; skill?: number; resistance?: number; magic?: number; fillLife?: boolean; fillMana?: boolean }
  | { kind: 'allies' }                          // vampire: needs other heroes (none in single player)
  | { kind: 'repair' };                         // restoration: weapon durability is not modelled yet

export const SPELLS: Record<number, Spell> = {
  86: { kind: 'blast', base: 8, perPower: 0.5, sound: 22, stun: true },   // light: radial beam, damages and disorients
  87: { kind: 'blast', base: 28, perPower: 1.0, sound: 77 },              // storm: strongest
  88: { kind: 'freeze', seconds: 8, sound: 74 },                          // ice: movement and attack speed halved
  89: { kind: 'blast', base: 16, perPower: 0.7, sound: 72 },              // fire (heals demons in the original; no demons here)
  90: { kind: 'blast', base: 32, perPower: 1.0, sound: 72 },              // incineration
  91: { kind: 'blast', base: 22, perPower: 0.8, sound: 25 },              // earth: earthquake
  92: { kind: 'restore', scale: 1 },                                      // life
  93: { kind: 'restore', scale: 1.5 },                                    // vitality (also the heroes next to you)
  94: { kind: 'allies' },
  95: { kind: 'attr', strength: 1 },
  96: { kind: 'attr', skill: 1 },
  97: { kind: 'attr', resistance: 1 },
  98: { kind: 'attr', magic: 1 },
  99: { kind: 'attr', strength: 2, skill: 2, resistance: 2, magic: 2 },   // sacred
  100: { kind: 'attr', strength: 2, skill: 2, resistance: 2, magic: 2 },  // of the Gods (+ nearby heroes)
  101: { kind: 'attr', strength: 2, fillLife: true },                     // Berserk
  102: { kind: 'attr', magic: 2, fillMana: true },                        // immunity (the INI calls it "de la mente")
  103: { kind: 'repair' },
};

/** Sight radius for area spells, in cells (guess). */
export const SPELL_RADIUS = 10;
/** Mana a parchment costs: "the more powerful the parchment, the more mana it consumes" -> 5 per scroll level. */
export const manaCost = (spell: Spell, level: number): number => (spell.kind === 'restore' ? 0 : level * 5);
/** Damage of an area spell for a caster with this Power attribute. */
export const blastDamage = (s: Extract<Spell, { kind: 'blast' }>, power: number): number => Math.round(s.base + s.perPower * power);
