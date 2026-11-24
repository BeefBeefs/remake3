import type { Atlas } from '../assets/atlas.ts';
import type { Game } from '../game/game.ts';
import { buy, sell, sellValue, stockFor, type Tab } from '../game/shop.ts';
import type { ItemDef } from '../game/items.ts';

/** Plain-DOM buy/sell window (manual: BUYING AND SELLING AT THE INN). Opened by talking to a merchant NPC. */
export class ShopWindow {
  private readonly root = document.createElement('div');
  private tab: Tab = 'heavy';
  private mode: 'buy' | 'sell' = 'buy';
  private basketBuy: number[] = [];
  private basketSell = new Set<number>();
  private message = '';
  private merchant = '';
  isOpen = false;

  constructor(private readonly game: Game, private readonly icons: Atlas, private readonly base: string) {
    this.root.style.cssText =
      'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:520px;max-width:96vw;max-height:92vh;overflow:auto;padding:10px;background:rgba(14,10,6,.96);border:2px solid #6b5426;color:#e9dfb8;font:12px ui-monospace,Menlo,monospace;display:none;user-select:none;z-index:5';
    document.body.appendChild(this.root);
  }

  open(merchantName: string): void {
    this.merchant = merchantName;
    this.isOpen = true;
    this.basketBuy = []; this.basketSell.clear(); this.message = 'What can I do for you?';
    this.root.style.display = 'block';
    this.render();
  }

  close(): void { this.isOpen = false; this.root.style.display = 'none'; }

  private icon(def: ItemDef): HTMLDivElement {
    const [x, y, w, h] = this.icons.rect(def.id);
    const d = document.createElement('div');
    d.style.cssText = 'width:52px;height:52px;display:flex;align-items:center;justify-content:center;flex:none';
    const i = document.createElement('div');
    i.style.cssText = `width:${w}px;height:${h}px;background:url(${this.base}${this.icons.json.image}) -${x}px -${y}px;image-rendering:pixelated`;
    d.appendChild(i);
    return d;
  }

  private btn(label: string, on: () => void, active = false): HTMLButtonElement {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = `padding:4px 10px;margin-right:6px;background:${active ? '#4a3a1c' : '#241a0e'};color:#e9dfb8;border:1px solid #6b5426;font:inherit;cursor:pointer`;
    b.onclick = on;
    return b;
  }

  private row(def: ItemDef, price: number, picked: boolean, on: () => void, count = 0): HTMLDivElement {
    const r = document.createElement('div');
    r.style.cssText = `display:flex;align-items:center;gap:8px;padding:2px 4px;cursor:pointer;background:${picked ? '#3a2d14' : 'transparent'};border-bottom:1px solid #2b2112`;
    r.appendChild(this.icon(def));
    const t = document.createElement('div');
    t.style.cssText = 'flex:1';
    t.textContent = def.name + (count > 1 ? ` ×${count}` : '');
    const p = document.createElement('div');
    p.textContent = `${price}`;
    r.append(t, p);
    r.onclick = on;
    return r;
  }

  render(): void {
    const g = this.game, inv = g.inventory;
    this.root.replaceChildren();
    const head = document.createElement('div');
    head.style.cssText = 'display:flex;justify-content:space-between;margin-bottom:6px';
    head.innerHTML = `<b>${this.merchant}</b><span>gold ${inv.gold}</span>`;
    this.root.appendChild(head);

    const bar = document.createElement('div');
    bar.style.marginBottom = '6px';
    bar.append(
      this.btn('Buy', () => { this.mode = 'buy'; this.render(); }, this.mode === 'buy'),
      this.btn('Sell', () => { this.mode = 'sell'; this.render(); }, this.mode === 'sell'),
    );
    if (this.mode === 'buy') bar.append(this.btn('Heavy', () => { this.tab = 'heavy'; this.render(); }, this.tab === 'heavy'), this.btn('Light', () => { this.tab = 'light'; this.render(); }, this.tab === 'light'));
    this.root.appendChild(bar);

    const list = document.createElement('div');
    list.style.cssText = 'max-height:46vh;overflow:auto;border:1px solid #4a3a1c;margin-bottom:6px';
    let total = 0;
    if (this.mode === 'buy') {
      for (const d of stockFor(inv.itemDefs, g.classId, this.tab)) {
        const n = this.basketBuy.filter((i) => i === d.id).length;
        list.appendChild(this.row(d, d.price, n > 0, () => { this.basketBuy.push(d.id); this.render(); }, n));
      }
      for (const id of this.basketBuy) total += inv.def(id)?.price ?? 0;
    } else {
      inv.slots.forEach((id, i) => {
        const d = id ? inv.def(id) : undefined;
        if (!d || d.price <= 0) return;
        const picked = this.basketSell.has(i);
        list.appendChild(this.row(d, sellValue(d), picked, () => { if (picked) this.basketSell.delete(i); else this.basketSell.add(i); this.render(); }));
        if (picked) total += sellValue(d);
      });
      if (!list.childElementCount) list.textContent = 'Nothing in your pack can be sold.';
    }
    this.root.appendChild(list);

    const foot = document.createElement('div');
    foot.style.cssText = 'display:flex;align-items:center;gap:6px';
    const sum = document.createElement('span');
    sum.style.flex = '1';
    sum.textContent = `${this.mode === 'buy' ? 'Cost' : 'You get'}: ${total}`;
    foot.append(sum);
    if (this.mode === 'buy' && this.basketBuy.length) foot.append(this.btn('Clear', () => { this.basketBuy = []; this.render(); }));
    foot.append(
      this.btn(this.mode === 'buy' ? 'Buy' : 'Sell', () => this.confirm()),
      this.btn('Leave', () => this.close()),
    );
    this.root.appendChild(foot);
    const msg = document.createElement('div');
    msg.style.cssText = 'margin-top:6px;color:#d8caa0;min-height:1.2em';
    msg.textContent = this.message;
    this.root.appendChild(msg);
  }

  private confirm(): void {
    const g = this.game;
    const res = this.mode === 'buy' ? buy(g.inventory, this.basketBuy) : sell(g.inventory, [...this.basketSell]);
    if (res.ok) {
      this.message = this.mode === 'buy' ? `Bought for ${res.total} gold.` : `Sold for ${res.total} gold.`;
      this.basketBuy = []; this.basketSell.clear();
      g.version++;
      g.playSound(17); // i_click (guess)
    } else this.message = res.reason;
    this.render();
  }
}
