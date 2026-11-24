import type { Atlas } from '../assets/atlas.ts';
import type { Game } from '../game/game.ts';
import { slotOf, type ItemDef, type Slot } from '../game/items.ts';

const SLOTS: Slot[] = ['weapon', 'shield', 'armor', 'ring', 'amulet'];

/** Plain-DOM inventory / equipment panel (toggle with I). Icons are cropped from the IListData atlas via CSS. */
export class InventoryPanel {
  private readonly root = document.createElement('div');
  private readonly body = document.createElement('div');
  private readonly logEl = document.createElement('div');
  private seen = -1;
  private open = false;

  constructor(private readonly game: Game, private readonly icons: Atlas, private readonly base: string) {
    this.root.style.cssText =
      'position:fixed;right:8px;top:8px;width:340px;padding:8px;background:rgba(14,10,6,.92);border:2px solid #6b5426;color:#e9dfb8;font:12px ui-monospace,Menlo,monospace;display:none;user-select:none';
    this.root.appendChild(this.body);
    document.body.appendChild(this.root);
    this.logEl.style.cssText =
      'position:fixed;left:8px;bottom:26px;font:12px ui-monospace,Menlo,monospace;color:#d8caa0;text-shadow:0 1px 2px #000;pointer-events:none;white-space:pre';
    document.body.appendChild(this.logEl);
  }

  toggle(): void {
    this.open = !this.open;
    this.root.style.display = this.open ? 'block' : 'none';
    this.seen = -1;
  }

  private icon(def: ItemDef, size = 56): HTMLDivElement {
    const [x, y, w, h] = this.icons.rect(def.id);
    const d = document.createElement('div');
    d.style.cssText = `width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center`;
    const i = document.createElement('div');
    i.style.cssText = `width:${w}px;height:${h}px;background:url(${this.base}${this.icons.json.image}) -${x}px -${y}px;image-rendering:pixelated`;
    d.appendChild(i);
    return d;
  }

  private tip(def: ItemDef): string {
    const parts = [def.name];
    if (def.kind === 'weapon') parts.push(`damage ${def.power[0]}-${def.power[1]}`);
    if (def.kind === 'shield') parts.push(`protection ${def.power[0]}`);
    if (def.kind === 'armor') parts.push(`armour level ${def.level}`);
    if (def.kind === 'potion' && def.data === 1) parts.push(`heals ${def.power[0]}-${def.power[1]}`);
    if (def.price) parts.push(`worth ${def.price}`);
    return parts.join(' · ');
  }

  private cell(def: ItemDef | undefined, onClick?: () => void, highlight = false): HTMLDivElement {
    const c = document.createElement('div');
    c.style.cssText = `width:60px;height:60px;box-sizing:border-box;background:#1d160d;border:1px solid ${highlight ? '#d8b24a' : '#4a3a1c'};cursor:${def && onClick ? 'pointer' : 'default'}`;
    if (def) {
      c.appendChild(this.icon(def));
      c.title = this.tip(def);
      if (onClick) c.addEventListener('click', onClick);
    }
    return c;
  }

  update(): void {
    this.logEl.textContent = this.game.log.join('\n');
    if (!this.open || this.seen === this.game.version) return;
    this.seen = this.game.version;
    const inv = this.game.inventory;
    this.body.replaceChildren();
    const head = document.createElement('div');
    head.textContent = `${this.game.hero.stats.name} · gold ${inv.gold} · damage ${inv.damage().join('-')} · armour ${inv.armor()}\nSTR ${this.game.attrs.strength} · SKL ${this.game.attrs.skill} · RES ${this.game.attrs.resistance} · MAG ${this.game.attrs.magic}`;
    head.style.cssText = 'margin-bottom:6px;white-space:pre';
    this.body.appendChild(head);
    const eq = document.createElement('div');
    eq.style.cssText = 'display:flex;gap:4px;margin-bottom:8px';
    for (const slot of SLOTS) {
      const id = inv.equipped[slot];
      eq.appendChild(this.cell(id ? inv.def(id) : undefined, () => this.game.unequip(slot), true));
    }
    this.body.appendChild(eq);
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(5,60px);gap:4px';
    inv.slots.forEach((id, i) => {
      const def = id ? inv.def(id) : undefined;
      grid.appendChild(this.cell(def, () => this.game.useSlot(i), !!def && slotOf(def) === null && def.kind === 'potion'));
    });
    this.body.appendChild(grid);
    const hint = document.createElement('div');
    hint.textContent = 'click an item to use / wear it · click a worn item to take it off · I closes';
    hint.style.cssText = 'margin-top:6px;color:#8d7c52';
    this.body.appendChild(hint);
  }
}
