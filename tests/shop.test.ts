import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Inventory, buildItems } from '../src/game/items.ts';
import { SELL_RATE, buy, sell, sellValue, stockFor, tabOf } from '../src/game/shop.ts';

const defs = buildItems(JSON.parse(readFileSync(new URL('../public/assets/data/items.json', import.meta.url), 'utf8')), {});

test('every class has heavy and light goods in the shop, only items it can use and that have a price', () => {
  for (const cls of [100, 101, 102]) {
    for (const tab of ['heavy', 'light'] as const) {
      const stock = stockFor(defs, cls, tab);
      assert.ok(stock.length >= 3, `${cls} ${tab}: ${stock.length}`);
      for (const d of stock) {
        assert.ok(d.price > 0);
        assert.ok(d.character === 0 || d.character === cls);
        assert.equal(tabOf(d), tab);
      }
      assert.deepEqual(stock.map((d) => d.price), stock.map((d) => d.price).sort((a, b) => a - b), 'cheapest first');
    }
  }
  // gold bags, keys and quest items are never sold
  assert.ok(![...defs.values()].some((d) => stockFor(defs, 100, 'light').includes(d) && (d.kind === 'gold' || d.kind === 'key')));
});

test('buying: an unaffordable basket buys nothing, an affordable one charges the total', () => {
  const inv = new Inventory(defs, 100);
  const stock = stockFor(defs, 100, 'light');
  const a = stock[0]!, b = stock[1]!;
  inv.gold = a.price + b.price - 1;
  assert.deepEqual(buy(inv, [a.id, b.id]), { ok: false, reason: 'Not enough gold' });
  assert.equal(inv.gold, a.price + b.price - 1);
  assert.equal(inv.slots.filter(Boolean).length, 0);
  inv.gold = a.price + b.price + 7;
  const r = buy(inv, [a.id, b.id]);
  assert.deepEqual(r, { ok: true, total: a.price + b.price });
  assert.equal(inv.gold, 7);
  assert.deepEqual(inv.slots.filter(Boolean), [a.id, b.id]);
});

test('buying refuses when the pack cannot hold the basket', () => {
  const inv = new Inventory(defs, 100);
  inv.gold = 1_000_000;
  const cheap = stockFor(defs, 100, 'light')[0]!;
  const r = buy(inv, Array(inv.slots.length + 1).fill(cheap.id));
  assert.equal(r.ok, false);
  assert.equal(inv.gold, 1_000_000);
});

test('selling pays half the price and removes the items', () => {
  const inv = new Inventory(defs, 100);
  const d = stockFor(defs, 100, 'heavy').at(-1)!;
  inv.add(d.id); inv.add(104);
  const r = sell(inv, [0, 0]);
  assert.deepEqual(r, { ok: true, total: sellValue(d) });
  assert.equal(sellValue(d), Math.floor(d.price * SELL_RATE));
  assert.equal(inv.slots[0], 0);
  assert.equal(inv.gold, sellValue(d));
  assert.equal(sell(inv, [5]).ok, false, 'empty slot');
});
