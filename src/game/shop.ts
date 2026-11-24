import { type Inventory, type ItemDef } from './items.ts';

/**
 * Buying and selling at the Inn of the White Goddess (manual: "BUYING AND SELLING AT THE INN"). The window has one list of
 * heavy equipment and one of light items; clicking items puts them in a basket, then Buy / Sell. If the basket costs more
 * than you own, nothing is bought. Which items a merchant stocks, and the sell-back rate, are not in the data we have
 * (the Inn map is not part of this install): the stock is every priced item the hero's class can use, and items sell
 * back at half price. Both are placeholders.
 */
export const SELL_RATE = 0.5;

export type Tab = 'heavy' | 'light';

/** Heavy = weapons, shields and armour; light = everything else that can sit in the quick slots. */
export const tabOf = (d: ItemDef): Tab => (d.kind === 'weapon' || d.kind === 'shield' || d.kind === 'armor' ? 'heavy' : 'light');

const SOLD = new Set(['weapon', 'shield', 'armor', 'ring', 'amulet', 'scroll', 'potion', 'book']);

export function stockFor(defs: Map<number, ItemDef>, classId: number, tab: Tab): ItemDef[] {
  return [...defs.values()]
    .filter((d) => d.price > 0 && SOLD.has(d.kind) && tabOf(d) === tab && (d.character === 0 || d.character === classId))
    .sort((a, b) => a.price - b.price || a.id - b.id);
}

export const sellValue = (d: ItemDef): number => Math.floor(d.price * SELL_RATE);

export type Result = { ok: true; total: number } | { ok: false; reason: string };

/** Buys every item id in `basket` (duplicates allowed) or nothing at all. */
export function buy(inv: Inventory, basket: number[]): Result {
  if (!basket.length) return { ok: false, reason: 'Nothing selected' };
  let total = 0;
  for (const id of basket) total += inv.def(id)?.price ?? 0;
  if (total > inv.gold) return { ok: false, reason: 'Not enough gold' };
  if (basket.length > inv.slots.filter((s) => s === 0).length) return { ok: false, reason: 'Your pack is too full' };
  for (const id of basket) inv.add(id);
  inv.gold -= total;
  return { ok: true, total };
}

/** Sells the items in the given pack slots (equipped items must be unequipped first). */
export function sell(inv: Inventory, slotIndexes: number[]): Result {
  const uniq = [...new Set(slotIndexes)];
  let total = 0;
  for (const i of uniq) {
    const d = inv.slots[i] ? inv.def(inv.slots[i]!) : undefined;
    if (!d || d.price <= 0) return { ok: false, reason: 'That cannot be sold' };
    total += sellValue(d);
  }
  if (!uniq.length) return { ok: false, reason: 'Nothing selected' };
  for (const i of uniq) inv.slots[i] = 0;
  inv.gold += total;
  return { ok: true, total };
}
