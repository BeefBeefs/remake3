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
}

interface RawItem {
  title?: string;
  General?: { Tipo?: number; Potencia?: [number, number]; Nivel?: number; Precio?: number; Data?: number };
  Requerimientos?: { Character?: number };
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
    });
  }
  return out;
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

export class Inventory {
  /** item id per slot, 0 = empty */
  readonly slots: number[] = Array<number>(INVENTORY_SIZE).fill(0);
  readonly equipped: Partial<Record<Slot, number>> = {};
  gold = 0;

  constructor(private readonly defs: Map<number, ItemDef>, private readonly character: number) {}

  def(id: number): ItemDef | undefined { return this.defs.get(id); }

  add(id: number): boolean {
    const i = this.slots.indexOf(0);
    if (i < 0) return false;
    this.slots[i] = id;
    return true;
  }

  canUse(def: ItemDef): boolean { return def.character === 0 || def.character === this.character; }

  /** Equips the item in slot `index` (swapping with what is worn). Returns false if it can't be worn. */
  equip(index: number): boolean {
    const id = this.slots[index];
    const def = id ? this.defs.get(id) : undefined;
    const slot = def ? slotOf(def) : null;
    if (!def || !slot || !this.canUse(def)) return false;
    const old = this.equipped[slot] ?? 0;
    this.equipped[slot] = def.id;
    this.slots[index] = old;
    return true;
  }

  unequip(slot: Slot): boolean {
    const id = this.equipped[slot];
    if (!id || !this.add(id)) return false;
    delete this.equipped[slot];
    return true;
  }

  /** Removes and returns the item in a slot (for potions being drunk). */
  take(index: number): ItemDef | undefined {
    const id = this.slots[index];
    if (!id) return undefined;
    this.slots[index] = 0;
    return this.defs.get(id);
  }

  /** Damage range of the wielded weapon; bare hands without one. */
  damage(): [number, number] {
    const w = this.equipped.weapon ? this.defs.get(this.equipped.weapon) : undefined;
    return w ? [w.power[0], w.power[1]] : [1, 2];
  }

  /** Damage absorbed per hit: body armour level + shield protection. */
  armor(): number {
    const a = this.equipped.armor ? this.defs.get(this.equipped.armor) : undefined;
    const s = this.equipped.shield ? this.defs.get(this.equipped.shield) : undefined;
    return (a?.level ?? 0) + (s?.power[0] ?? 0);
  }
}
