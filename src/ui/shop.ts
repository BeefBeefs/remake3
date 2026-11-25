import type { Atlas } from '../assets/atlas.ts';
import type { Game } from '../game/game.ts';
import { buy, sell, sellValue, stockFor, type Tab } from '../game/shop.ts';
import type { ItemDef } from '../game/items.ts';
import type { Skin } from './skin.ts';

const W = 422, H = 434;

/**
 * Buy/sell window (manual: BUYING AND SELLING AT THE INN), opened by talking to a merchant. The original has no
 * window picture is `Pack/Sc_Compra.g16` (422x434); its five left slots, the Money / Total line and the two bottom buttons
 * are laid out over it, with the bitmap font for the text.
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
  private focus: ItemDef | null = null;
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
    this.basketBuy = []; this.basketSell.clear(); this.message = 'What can I do for you?'; this.scroll = 0; this.focus = null;
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

  private icon(def: ItemDef, size = 36, pos = 'left:2px;top:2px'): HTMLDivElement {
    const d = document.createElement('div');
    d.style.cssText = `position:absolute;${pos};width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;pointer-events:none`;
    if (!this.icons.has(def.id)) return d;
    const [x, y, w, h] = this.icons.rect(def.id);
    const k = Math.min(size === 36 ? 1 : 3, (size - 2) / w, (size - 2) / h);
    const i = document.createElement('div');
    i.style.cssText = `width:${w}px;height:${h}px;flex:none;background:url(${this.base}${this.icons.json.image}) -${x}px -${y}px;image-rendering:pixelated;transform:scale(${k})`;
    d.appendChild(i);
    return d;
  }

  /** An invisible click area over a part of the window picture, with a label and a highlight on hover. */
  private hit(label: string, x: number, y: number, w: number, h: number, on: () => void, active = false): void {
    const b = document.createElement('div');
    b.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;cursor:pointer;box-sizing:border-box;${active ? 'box-shadow:inset 0 0 0 2px #e8c85a99;background:#e8c85a22' : ''}`;
    this.text(label, 0, Math.max(0, (h - 14) / 2), active ? '#f6e49a' : '#d8caa0', 'c', w, b);
    b.addEventListener('click', on);
    b.addEventListener('pointerenter', () => { b.style.background = '#ffffff1c'; });
    b.addEventListener('pointerleave', () => { b.style.background = active ? '#e8c85a22' : ''; });
    this.root.appendChild(b);
  }

  render(): void {
    const g = this.game, inv = g.inventory;
    this.root.replaceChildren();
    // the original window picture (Pack/Sc_Compra.g16): title bar, five left slots, picture and text boxes, list, Money / Total, two buttons
    const frame = document.createElement('div');
    frame.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px;background:url(${this.base}screens/sc_compra.png);image-rendering:auto;filter:drop-shadow(0 6px 18px #000c)`;
    this.root.appendChild(frame);
    this.text(this.merchant, 40, 11, '#f1d98a', 'c', 342);

    // the five left slots are the buttons: Buy, Sell, Heavy, Light, Clear
    const slot = (n: number, label: string, on: () => void, active = false) => this.hit(label, 16, 56 + n * 70, 60, 56, on, active);
    slot(0, 'Buy', () => { this.mode = 'buy'; this.scroll = 0; this.render(); }, this.mode === 'buy');
    slot(1, 'Sell', () => { this.mode = 'sell'; this.scroll = 0; this.render(); }, this.mode === 'sell');
    if (this.mode === 'buy') {
      slot(2, 'Heavy', () => { this.tab = 'heavy'; this.scroll = 0; this.render(); }, this.tab === 'heavy');
      slot(3, 'Light', () => { this.tab = 'light'; this.scroll = 0; this.render(); }, this.tab === 'light');
      if (this.basketBuy.length) slot(4, 'Clear', () => { this.basketBuy = []; this.render(); });
    }

    // the item under the pointer: big picture on the left, its name and figures on the right
    const f = this.focus;
    if (f) {
      this.root.appendChild(this.icon(f, 124, 'left:100px;top:54px'));
      this.text(this.label(f), 232, 56, '#f1d98a', 'l', 0);
      const stat = f.kind === 'weapon' ? `Damage ${f.power[0]}-${f.power[1]}` : f.kind === 'shield' ? `Protection ${f.power[0]}` : f.kind === 'armor' ? `Armour ${f.level}` : '';
      if (stat) this.text(stat, 232, 76, '#d8caa0');
      if (f.price > 0) this.text(`Price ${f.price}`, 232, 96, '#d8caa0');
      if (g.blocked(f)) this.text('You cannot use this', 232, 116, '#d27a7a');
    }

    // the list
    const list = document.createElement('div');
    list.style.cssText = `position:absolute;left:99px;top:209px;width:296px;height:144px;overflow-y:auto;overflow-x:hidden;scrollbar-width:none`;
    this.root.appendChild(list);
    const LW = 296;
    const row = (def: ItemDef, price: number, picked: boolean, on: () => void, count = 0) => {
      const r = document.createElement('div');
      r.style.cssText = `position:relative;height:40px;cursor:pointer;background:${picked ? '#5a431a99' : 'transparent'};border-bottom:1px solid #3a2d14`;
      r.appendChild(this.icon(def));
      this.text(this.label(def) + (count > 1 ? ` x${count}` : ''), 44, 12, g.blocked(def) ? '#d27a7a' : '#e9dfb8', 'l', 0, r);
      this.text(String(price), 0, 12, '#f1d98a', 'r', LW - 8, r);
      r.addEventListener('click', on);
      r.addEventListener('pointerenter', () => { if (!picked) r.style.background = '#ffffff14'; if (this.focus !== def) { this.focus = def; this.showFocus(); } });
      r.addEventListener('pointerleave', () => { if (!picked) r.style.background = 'transparent'; });
      list.appendChild(r);
    };
    let total = 0;
    if (this.mode === 'buy') {
      for (const d of stockFor(inv.itemDefs, g.classId, this.tab)) {
        const n = this.basketBuy.filter((i) => i === d.id).length;
        row(d, d.price, n > 0, () => { this.focus = d; this.basketBuy.push(d.id); this.keep(list); }, n);
      }
      for (const id of this.basketBuy) total += inv.def(id)?.price ?? 0;
    } else {
      inv.slots.forEach((id, i) => {
        const d = id ? inv.def(id) : undefined;
        if (!d || d.price <= 0) return;
        const picked = this.basketSell.has(i);
        row(d, sellValue(d), picked, () => { this.focus = d; if (picked) this.basketSell.delete(i); else this.basketSell.add(i); this.keep(list); });
        if (picked) total += sellValue(d);
      });
      if (!list.childElementCount) this.text('Nothing in your pack can be sold.', 10, 12, '#d8caa0', 'l', 0, list);
    }
    list.scrollTop = this.scroll;
    list.addEventListener('scroll', () => { this.scroll = list.scrollTop; });

    // Money and Total (the labels are part of the picture), then the message and the two buttons
    this.text(String(inv.gold), 150, 359, '#f1d98a', 'r', 96);
    this.text(String(total), 300, 359, total > inv.gold && this.mode === 'buy' ? '#d27a7a' : '#f1d98a', 'r', 100);
    this.text(this.skin.wrap(this.message, 290)[0] ?? '', 104, 380, '#d8caa0');
    this.hit(this.mode === 'buy' ? 'Buy' : 'Sell', 120, 397, 123, 19, () => this.confirm());
    this.hit('Leave', 253, 397, 123, 19, () => this.close());
  }

  private showFocus(): void { this.render(); }

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
