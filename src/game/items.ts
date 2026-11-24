/** Item definitions (from public/assets/data/items.json, i.e. WData.Nhs) and the hero's inventory rules. */

export type ItemKind = 'weapon' | 'shield' | 'armor' | 'ring' | 'amulet' | 'scroll' | 'potion' | 'key' | 'gold' | 'book' | 'quest';
export type Slot = 'weapon' | 'shield' | 'armor' | 'ring' | 'amulet';

/** `Tipo` is a bit mask: 1,2,4,8 melee weapons, 16 shield, 32 bow, 64 staff, 128 ring, 256 amulet, 512 scroll, ... */
export function kindOf(tipo: number): ItemKind {
  if (tipo & (1 | 2 | 4 | 8 | 32 | 64)) return 'weapon';
  if (tipo & 16) return 'shield';
  if (tipo & (8192 | 16384 | 32768)) return 'armor';
  if (tipo & 128) return 'ring';
  if (tipo & 256) return 'amulet';
  if (tipo & 512) return 'scroll';
  if (tipo & 1024) return 'potion';
  if (tipo & 2048) return 'key';
  if (tipo & 4096) return 'gold';
  if (tipo & (65536 | 131072)) return 'book';
  return 'quest';
}

export interface ItemDef {
  id: number;
  name: string;
  tipo: number;
  kind: ItemKind;
  /** damage range (weapons), protection (shields), healing amount (potions) */
  power: [number, number];
  /** armour level of body armour */
  level: number;
  price: number;
  /** 0 = anyone, 100 Barbarian, 101 Amazon, 102 Sorceress */
  character: number;
  /** potion effect: 1 life, 2 stamina, 4 magic */
  data: number;
  /** INI `CofreLv`: the chest level an item can come out of (0 = never from chests) */
  chestLevel: number;
  /** INI `Durabilidad`: blows (or shots) an item survives; 0 = does not wear, 999 = never breaks */
  durability: number;
  /** attribute and level requirements (INI R_Fuerza, R_Destreza = skill, R_Resistencia, R_Magia = power, R_Nivel) */
  req: Requirements;
  bonus: Bonus;
}

/** Monster family bit masks (INI `Raza`) and the item bonus keys that refer to them. */
export const FAMILY_BONUS: Record<string, number> = { B_Goblins: 1, B_Orcos: 2, B_NoMuertos: 4, B_Bestias: 8, B_Trolls: 16, B_Demonios: 32, B_Humanos: 64 };

/** What wearing an item adds (INI `Bonificadores`): attribute points, armour, and a damage multiplier per monster family. */
export interface Bonus { strength: number; skill: number; resistance: number; magic: number; armor: number; vs: Record<number, number> }
export const noBonus = (): Bonus => ({ strength: 0, skill: 0, resistance: 0, magic: 0, armor: 0, vs: {} });

export interface Requirements { strength: number; skill: number; resistance: number; magic: number; level: number }

interface RawItem {
  title?: string;
  General?: { Tipo?: number; Potencia?: [number, number]; Nivel?: number; Precio?: number; Data?: number; CofreLv?: number; Durabilidad?: number };
  Bonificadores?: Record<string, number>;
  Bonificacion?: Record<string, number>;
  Requerimientos?: { Character?: number; R_Fuerza?: number; R_Destreza?: number; R_Resistencia?: number; R_Magia?: number; R_Nivel?: number };
}

function parseBonus(v: RawItem): Bonus {
  const raw = { ...v.Bonificacion, ...v.Bonificadores };
  const b = noBonus();
  b.strength = raw.B_Fuerza ?? 0;
  b.skill = raw.B_Destreza ?? 0;
  b.resistance = raw.B_Resistencia ?? 0;
  b.magic = (raw.B_Magia ?? 0) + (raw.B_Poder ?? 0); // B_Poder (one amulet) is Power too
  b.armor = raw.B_Armadura ?? 0;
  for (const [k, mask] of Object.entries(FAMILY_BONUS)) if (raw[k]) b.vs[mask] = raw[k]!;
  return b;
}

export function buildItems(raw: Record<string, RawItem>, names: Record<string, string>): Map<number, ItemDef> {
  const out = new Map<number, ItemDef>();
  for (const [k, v] of Object.entries(raw)) {
    const g = v.General ?? {};
    const tipo = g.Tipo ?? 0;
    const id = Number(k);
    out.set(id, {
      id,
      name: names[k] ?? v.title ?? `Item ${k}`,
      tipo,
      kind: kindOf(tipo),
      power: g.Potencia ?? [0, 0],
      level: g.Nivel ?? 0,
      price: g.Precio ?? 0,
      character: v.Requerimientos?.Character ?? 0,
      data: g.Data ?? 0,
      chestLevel: g.CofreLv ?? 0,
      durability: Math.min(MAX_DURABILITY, g.Durabilidad ?? 0),
      bonus: parseBonus(v),
      req: { strength: v.Requerimientos?.R_Fuerza ?? 0, skill: v.Requerimientos?.R_Destreza ?? 0, resistance: v.Requerimientos?.R_Resistencia ?? 0, magic: v.Requerimientos?.R_Magia ?? 0, level: v.Requerimientos?.R_Nivel ?? 0 },
    });
  }
  return out;
}

/** What a hero lacks to use an item ("red border" in the manual): e.g. ['Strength 36']. Empty = usable. */
export function missingReqs(def: ItemDef, attrs: { strength: number; skill: number; resistance: number; magic: number }, level: number): string[] {
  const out: string[] = [];
  if (def.req.strength > attrs.strength) out.push(`Strength ${def.req.strength}`);
  if (def.req.skill > attrs.skill) out.push(`Skill ${def.req.skill}`);
  if (def.req.resistance > attrs.resistance) out.push(`Resistance ${def.req.resistance}`);
  if (def.req.magic > attrs.magic) out.push(`Power ${def.req.magic}`);
  if (def.req.level > level) out.push(`Level ${def.req.level}`);
  return out;
}

/** Manual: "Heavy objects" (weapons, shields, body armour) and "Light objects" (everything else) have separate inventory pages. */
export function isHeavy(def: ItemDef): boolean {
  const s = slotOf(def);
  return s === 'weapon' || s === 'shield' || s === 'armor';
}

export function slotOf(def: ItemDef): Slot | null {
  switch (def.kind) {
    case 'weapon': case 'shield': case 'armor': case 'ring': case 'amulet': return def.kind;
    default: return null;
  }
}

/** Picks one item id from an actor's drop table (`[Items] IDItem` with weights `PItem`). */
export function rollDrop(table: { IDItem?: number[]; PItem?: number[] } | undefined, rnd: () => number): number | null {
  const ids = table?.IDItem ?? [];
  if (!ids.length) return null;
  const w = ids.map((_, i) => Math.max(0, table?.PItem?.[i] ?? 1));
  const total = w.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  let r = rnd() * total;
  for (let i = 0; i < ids.length; i++) { r -= w[i]!; if (r < 0) return ids[i]!; }
  return ids[ids.length - 1]!;
}

export const INVENTORY_SIZE = 20;

/** The engine keeps durability in one byte: the INI value is capped at 255 when the item table loads (999 reads as 255). */
export const MAX_DURABILITY = 255;
/** The three legendary weapons (Ripping Sword 14, Bow of Virtue 48, Staff of Destiny 61) are skipped by the engine's wear routine. */
export const NEVER_WEARS = new Set([14, 48, 61]);

export class Inventory {
  /** item id per slot, 0 = empty */
  readonly slots: number[] = Array<number>(INVENTORY_SIZE).fill(0);
  readonly equipped: Partial<Record<Slot, number>> = {};
  /** durability left of the item in each slot / worn; 0 or missing = as new */
  readonly slotLeft: number[] = Array<number>(INVENTORY_SIZE).fill(0);
  readonly equippedLeft: Partial<Record<Slot, number>> = {};
  gold = 0;

  constructor(private readonly defs: Map<number, ItemDef>, private readonly character: number) {}

  /** All item definitions (for shops). */
  get itemDefs(): Map<number, ItemDef> { return this.defs; }

  def(id: number): ItemDef | undefined { return this.defs.get(id); }

  add(id: number, left = 0): boolean {
    const i = this.slots.indexOf(0);
    if (i < 0) return false;
    this.slots[i] = id;
    this.slotLeft[i] = left;
    return true;
  }

  /** Empties a slot (sold, dropped), forgetting its wear. */
  remove(index: number): void { this.slots[index] = 0; this.slotLeft[index] = 0; }

  /** Durability left of a worn item (the full value when it was never used); null for items that do not wear. */
  leftOf(slot: Slot): number | null {
    const id = this.equipped[slot], d = id ? this.defs.get(id) : undefined;
    if (!d || !d.durability) return null;
    return this.equippedLeft[slot] || d.durability;
  }

  /**
   * Wear on a worn item, as the engine's routine does it: the amount is divided by the item's level (`Nivel`, when it has one)
   * unless `flat`; the legendary weapons never wear; the item breaks when its durability is used up (the engine lets it go one
   * point below zero first; "0 left" is how a save says "as new", so ours breaks at zero). Returns the item when it broke (it is gone from the slot).
   */
  wear(slot: Slot, amount = 1, flat = false): ItemDef | null {
    const d = this.equipped[slot] ? this.defs.get(this.equipped[slot]!) : undefined;
    if (!d || !d.durability || NEVER_WEARS.has(d.id)) return null;
    const lost = flat || d.level <= 0 ? amount : Math.trunc(amount / d.level);
    if (lost <= 0) return null;
    const left = (this.equippedLeft[slot] || d.durability) - lost;
    if (left <= 0) { delete this.equipped[slot]; delete this.equippedLeft[slot]; return d; }
    this.equippedLeft[slot] = left;
    return null;
  }

  /** The restoration parchment: only what is worn (weapon, shield, armour) is as good as new; the pack stays as it was. */
  repairWorn(): void { for (const k of ['weapon', 'shield', 'armor'] as const) delete this.equippedLeft[k]; }

  /** Dying: every worn and carried item is as good as new (a guess; the executable's death handler was not read). */
  repairAll(): void {
    this.slotLeft.fill(0);
    for (const k of Object.keys(this.equippedLeft) as Slot[]) delete this.equippedLeft[k];
  }

  canUse(def: ItemDef): boolean { return def.character === 0 || def.character === this.character; }

  /** Backpack indices of the heavy / light objects, in slot order. */
  indicesOf(heavy: boolean): number[] {
    const out: number[] = [];
    this.slots.forEach((id, i) => {
      const d = id ? this.defs.get(id) : undefined;
      if (d && isHeavy(d) === heavy) out.push(i);
    });
    return out;
  }

  /** The "direct access" objects of keys 1-4 (manual: any light item): the first four light objects. */
  quick(): number[] { return this.indicesOf(false).slice(0, 4); }

  /** Equips the item in slot `index` (swapping with what is worn). Returns false if it can't be worn. */
  equip(index: number): boolean {
    const id = this.slots[index];
    const def = id ? this.defs.get(id) : undefined;
    const slot = def ? slotOf(def) : null;
    if (!def || !slot || !this.canUse(def)) return false;
    const old = this.equipped[slot] ?? 0, oldLeft = this.equippedLeft[slot] ?? 0, left = this.slotLeft[index] ?? 0;
    this.equipped[slot] = def.id;
    this.equippedLeft[slot] = left;
    this.slots[index] = old;
    this.slotLeft[index] = oldLeft;
    return true;
  }

  unequip(slot: Slot): boolean {
    const id = this.equipped[slot];
    if (!id || !this.add(id, this.equippedLeft[slot] ?? 0)) return false;
    delete this.equipped[slot];
    delete this.equippedLeft[slot];
    return true;
  }

  /** Removes and returns the item in a slot (for potions being drunk). */
  take(index: number): ItemDef | undefined {
    const id = this.slots[index];
    if (!id) return undefined;
    this.remove(index);
    return this.defs.get(id);
  }

  /** Damage range of the wielded weapon; bare hands without one. */
  damage(): [number, number] {
    const w = this.equipped.weapon ? this.defs.get(this.equipped.weapon) : undefined;
    return w ? [w.power[0], w.power[1]] : [1, 2];
  }

  /** Damage absorbed per hit: body armour level + shield protection + armour bonuses of worn items. */
  armor(): number {
    const a = this.equipped.armor ? this.defs.get(this.equipped.armor) : undefined;
    const s = this.equipped.shield ? this.defs.get(this.equipped.shield) : undefined;
    return (a?.level ?? 0) + (s?.power[0] ?? 0) + this.worn().armor;
  }

  /** Sum of the bonuses of everything worn. */
  worn(): Bonus {
    const t = noBonus();
    for (const id of Object.values(this.equipped)) {
      const b = id ? this.defs.get(id)?.bonus : undefined;
      if (!b) continue;
      t.strength += b.strength; t.skill += b.skill; t.resistance += b.resistance; t.magic += b.magic; t.armor += b.armor;
    }
    return t;
  }

  /** Damage multiplier of the wielded weapon against a monster family mask (1 = no bonus; below 0 heals). */
  weaponVs(race: number): number {
    const w = this.equipped.weapon ? this.defs.get(this.equipped.weapon) : undefined;
    return 1 + familyBonus(w?.bonus, race);
  }
}

/**
 * Script command 1: "roll a random item whose type mask matches `mask`, from chest level `level` or lower"
 * (args like 100,3 / 1024,3 / 57344,2). `usable` filters out other classes' gear.
 */
export function rollByMask(defs: Map<number, ItemDef>, mask: number, level: number, rnd: () => number, usable: (d: ItemDef) => boolean = () => true): number | null {
  const pool = [...defs.values()].filter((d) => d.chestLevel >= 1 && d.chestLevel <= level && (d.tipo & mask) !== 0 && usable(d));
  if (!pool.length) return null;
  return pool[Math.floor(rnd() * pool.length)]!.id;
}

/** Sum of an item's family bonuses that apply to a monster's `Raza` mask. */
export function familyBonus(b: Bonus | undefined, race: number): number {
  if (!b) return 0;
  let t = 0;
  for (const [mask, v] of Object.entries(b.vs)) if (race & Number(mask)) t += v;
  return t;
}
