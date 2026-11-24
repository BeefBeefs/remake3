import type { Atlas } from '../assets/atlas.ts';
import type { Game } from '../game/game.ts';
import { buy, sell, sellValue, stockFor, type Tab } from '../game/shop.ts';
import type { ItemDef } from '../game/items.ts';
import type { Skin } from './skin.ts';

const W = 330, H = 388, BRONZE = '#9c7e48';

/**
 * Buy/sell window (manual: BUYING AND SELLING AT THE INN), opened by talking to a merchant. The original has no
 * dedicated art for it that we found, so it is built from the interface parts: the stone panel texture (Overlay 66),
 * the Heavy/Light object tab buttons (Inventory 10-13), Accept/Cancel (Overlay 57/58) and the bitmap font.
 */
export class ShopWindow {
  private readonly root = document.createElement('div');
  private tab: Tab = 'heavy';
  private mode: 'buy' | 'sell' = 'buy';
  private basketBuy: number[] = [];
  private basketSell = new Set<number>();
  private message = '';
  private merchant = '';
  private scroll = 0;
  isOpen = false;

  constructor(private readonly game: Game, private readonly icons: Atlas, private readonly base: string, private readonly skin: Skin) {
    this.root.style.cssText = `position:fixed;left:50%;top:50%;width:${W}px;height:${H}px;display:none;user-select:none;z-index:9`;
    document.body.appendChild(this.root);
    const fit = () => { this.root.style.transform = `translate(-50%,-50%) scale(${window.innerHeight / 480})`; };
    window.addEventListener('resize', fit);
    fit();
  }

  open(merchantName: string): void {
    this.merchant = merchantName;
    this.isOpen = true;
    this.basketBuy = []; this.basketSell.clear(); this.message = 'What can I do for you?'; this.scroll = 0;
    this.root.style.display = 'block';
    this.render();
  }

  close(): void { this.isOpen = false; this.root.style.display = 'none'; }

  private text(t: string, x: number, y: number, color = '#e9dfb8', align: 'l' | 'c' | 'r' = 'l', w = 0, parent: HTMLElement = this.root): void {
    const c = this.skin.text(t, { color });
    const tw = this.skin.textWidth(t);
    const left = align === 'l' ? x : align === 'c' ? x + (w - tw) / 2 : x + w - tw;
    c.style.cssText += `;position:absolute;left:${left}px;top:${y}px;pointer-events:none`;
    parent.appendChild(c);
  }

  private icon(def: ItemDef): HTMLDivElement {
    const d = document.createElement('div');
    d.style.cssText = 'position:absolute;left:2px;top:2px;width:36px;height:36px;display:flex;align-items:center;justify-content:center;pointer-events:none';
    if (!this.icons.has(def.id)) return d;
    const [x, y, w, h] = this.icons.rect(def.id);
    const k = Math.min(1, 34 / w, 34 / h);
    const i = document.createElement('div');
    i.style.cssText = `width:${w}px;height:${h}px;flex:none;background:url(${this.base}${this.icons.json.image}) -${x}px -${y}px;image-rendering:pixelated;transform:scale(${k})`;
    d.appendChild(i);
    return d;
  }

  /** A button in the panel style: the stone texture with a bronze edge and a label. */
  private plate(label: string, x: number, y: number, w: number, on: () => void, active = false): void {
    const b = document.createElement('div');
    b.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:20px;cursor:pointer;box-sizing:border-box;border:1px solid ${active ? '#e8c85a' : BRONZE};overflow:hidden;box-shadow:inset 0 0 0 1px #000a`;
    b.appendChild(this.skin.fill('overlay', 66, w, 20));
    this.text(label, 0, 0, active ? '#f6e49a' : '#d8caa0', 'c', w - 2, b);
    b.addEventListener('click', on);
    b.addEventListener('pointerenter', () => { b.style.filter = 'brightness(1.3)'; });
    b.addEventListener('pointerleave', () => { b.style.filter = ''; });
    this.root.appendChild(b);
  }

  private sprite(bank: 'inventory' | 'overlay', id: number, x: number, y: number, on: () => void): void {
    const s = this.skin.sprite(bank, id, x, y);
    s.style.cursor = 'pointer';
    s.addEventListener('click', on);
    s.addEventListener('pointerenter', () => { s.style.filter = 'brightness(1.3)'; });
    s.addEventListener('pointerleave', () => { s.style.filter = ''; });
    this.root.appendChild(s);
  }

  render(): void {
    const g = this.game, inv = g.inventory, sk = this.skin;
    this.root.replaceChildren();
    const frame = sk.fill('overlay', 66, W, H);
    frame.style.cssText += `;position:absolute;left:0;top:0;box-sizing:border-box;border:3px double ${BRONZE};box-shadow:0 0 0 1px #000,0 6px 24px #000c`;
    this.root.appendChild(frame);

    // title plate: merchant name, and the purse
    const title = document.createElement('div');
    title.style.cssText = `position:absolute;left:14px;top:12px;width:${W - 28}px;height:24px;background:#000;border:1px solid ${BRONZE};box-sizing:border-box`;
    this.root.appendChild(title);
    this.text(this.merchant, 14, 15, '#f1d98a', 'c', W - 28);
    this.text('Gold', 22, 48, '#d8caa0');
    this.text(String(inv.gold), 60, 48, '#f1d98a', 'r', W - 60 - 22);

    // mode and category buttons
    this.plate('Buy', 14, 72, 56, () => { this.mode = 'buy'; this.scroll = 0; this.render(); }, this.mode === 'buy');
    this.plate('Sell', 74, 72, 56, () => { this.mode = 'sell'; this.scroll = 0; this.render(); }, this.mode === 'sell');
    if (this.mode === 'buy') {
      this.sprite('inventory', this.tab === 'heavy' ? 11 : 10, 150, 72, () => { this.tab = 'heavy'; this.scroll = 0; this.render(); });
      this.sprite('inventory', this.tab === 'light' ? 13 : 12, 238, 72, () => { this.tab = 'light'; this.scroll = 0; this.render(); });
    }

    // the list
    const list = document.createElement('div');
    list.style.cssText = `position:absolute;left:14px;top:100px;width:${W - 28}px;height:204px;overflow-y:auto;overflow-x:hidden;background:#0009;border:1px solid ${BRONZE};box-sizing:border-box;scrollbar-width:thin;scrollbar-color:${BRONZE} #000`;
    this.root.appendChild(list);
    const row = (def: ItemDef, price: number, picked: boolean, on: () => void, count = 0) => {
      const r = document.createElement('div');
      r.style.cssText = `position:relative;height:40px;cursor:pointer;background:${picked ? '#5a431a99' : 'transparent'};border-bottom:1px solid #3a2d14`;
      r.appendChild(this.icon(def));
      this.text(this.label(def) + (count > 1 ? ` x${count}` : ''), 44, 4, g.blocked(def) ? '#d27a7a' : '#e9dfb8', 'l', 0, r);
      const stat = def.kind === 'weapon' ? `damage ${def.power[0]}-${def.power[1]}` : def.kind === 'shield' ? `protection ${def.power[0]}` : def.kind === 'armor' ? `armour ${def.level}` : '';
      if (stat) this.text(stat, 44, 21, '#a99b72', 'l', 0, r);
      this.text(String(price), 0, 12, '#f1d98a', 'r', W - 28 - 22, r);
      r.title = this.label(def);
      r.addEventListener('click', on);
      r.addEventListener('pointerenter', () => { if (!picked) r.style.background = '#ffffff14'; });
      r.addEventListener('pointerleave', () => { if (!picked) r.style.background = 'transparent'; });
      list.appendChild(r);
    };
    let total = 0;
    if (this.mode === 'buy') {
      for (const d of stockFor(inv.itemDefs, g.classId, this.tab)) {
        const n = this.basketBuy.filter((i) => i === d.id).length;
        row(d, d.price, n > 0, () => { this.basketBuy.push(d.id); this.keep(list); }, n);
      }
      for (const id of this.basketBuy) total += inv.def(id)?.price ?? 0;
    } else {
      inv.slots.forEach((id, i) => {
        const d = id ? inv.def(id) : undefined;
        if (!d || d.price <= 0) return;
        const picked = this.basketSell.has(i);
        row(d, sellValue(d), picked, () => { if (picked) this.basketSell.delete(i); else this.basketSell.add(i); this.keep(list); });
        if (picked) total += sellValue(d);
      });
      if (!list.childElementCount) this.text('Nothing in your pack can be sold.', 12, 12, '#d8caa0', 'l', 0, list);
    }
    list.scrollTop = this.scroll;
    list.addEventListener('scroll', () => { this.scroll = list.scrollTop; });

    // totals and the action buttons
    this.text(`${this.mode === 'buy' ? 'Cost' : 'You get'}: ${total}`, 22, 314, total > inv.gold && this.mode === 'buy' ? '#d27a7a' : '#e9dfb8');
    if (this.mode === 'buy' && this.basketBuy.length) this.plate('Clear', W - 14 - 67 * 2 - 6 - 62, 312, 56, () => { this.basketBuy = []; this.render(); });
    this.sprite('overlay', 57, W - 14 - 67 * 2 - 6, 312, () => this.confirm());
    this.sprite('overlay', 58, W - 14 - 67, 312, () => this.close());
    const lines = sk.wrap(this.message, W - 44);
    lines.slice(0, 2).forEach((l, i) => this.text(l, 22, 340 + i * 18, '#d8caa0'));
  }

  /** "ESPADA #3: ESPADA BASTARDA" -> "Espada Bastarda", cut to fit the list. */
  private label(def: ItemDef): string {
    let n = def.name.includes(':') ? def.name.slice(def.name.indexOf(':') + 1).trim() : def.name;
    n = n.toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase());
    while (n.length > 3 && this.skin.textWidth(n) > 180) n = n.slice(0, -2);
    return n;
  }

  /** Re-render but keep the list scroll position. */
  private keep(list: HTMLElement): void { this.scroll = list.scrollTop; this.render(); }

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
