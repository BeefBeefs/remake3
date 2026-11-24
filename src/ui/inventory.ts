/**
 * Inventory window (key I) on the original art: Inventory.b16 frame 0 has the equipment slots on the left and the five
 * "heavy object" slots on the right, frame 1 is the 2 x 10 grid of "light objects". Heavy = weapons, shields and body
 * armour; the rest is light. Coordinates were measured from the frames (docs/FORMATS.md section 6).
 */
import type { Atlas } from '../assets/atlas.ts';
import { Game } from '../game/game.ts';
import { isHeavy, slotOf, type ItemDef, type Slot } from '../game/items.ts';
import type { Skin } from './skin.ts';

/** Equipment slots: big ones are 64x64, small 34x32 (frame 0 coordinates) and the silhouette frame shown when empty. */
const EQUIP: { slot: Slot; x: number; y: number; big: boolean; ghost: number | null }[] = [
  { slot: 'weapon', x: 22, y: 54, big: true, ghost: 21 },
  { slot: 'armor', x: 22, y: 122, big: true, ghost: 20 },
  { slot: 'shield', x: 22, y: 190, big: true, ghost: 22 },
  { slot: 'ring', x: 103, y: 69, big: false, ghost: null },
  { slot: 'amulet', x: 103, y: 137, big: false, ghost: null },
];
const HEAVY_X = 163, HEAVY_Y = [29, 98, 166, 235, 304], HEAVY_PAGE = 5;
const GRID_X = 255 + 11, GRID_Y = 25 + 13, CELL_W = 35, CELL_H = 33.5;

export class InventoryPanel {
  private readonly root = document.createElement('div');
  private readonly logEl = document.createElement('div');
  private seen = -1;
  private open = false;
  private page = 0;

  constructor(private readonly game: Game, private readonly icons: Atlas, private readonly base: string, private readonly skin: Skin) {
    this.root.style.cssText = 'position:fixed;right:0;top:50%;width:344px;height:420px;display:none;user-select:none;z-index:8;transform-origin:right center';
    document.body.appendChild(this.root);
    this.logEl.style.cssText = 'display:none';
    const fit = () => { this.root.style.transform = `translateY(-50%) scale(${window.innerHeight / 480})`; };
    window.addEventListener('resize', fit);
    fit();
  }

  /** The HUD's message box shows the log instead. */
  hideLog(): void { this.logEl.remove(); }

  toggle(): void {
    this.open = !this.open;
    this.root.style.display = this.open ? 'block' : 'none';
    this.seen = -1;
  }

  private tip(def: ItemDef): string {
    const parts = [def.name.includes(':') ? def.name.slice(def.name.indexOf(':') + 1).trim() : def.name];
    if (def.kind === 'weapon') parts.push(`damage ${def.power[0]}-${def.power[1]}`);
    if (def.kind === 'shield') parts.push(`protection ${def.power[0]}`);
    if (def.kind === 'armor') parts.push(`armour level ${def.level}`);
    if (def.kind === 'potion' && def.data === 1) parts.push(`heals ${def.power[0]}-${def.power[1]}`);
    const b = def.bonus;
    const bonus = [['Strength', b.strength], ['Skill', b.skill], ['Resistance', b.resistance], ['Power', b.magic], ['armour', b.armor]].filter(([, v]) => v).map(([k, v]) => `${Number(v) > 0 ? '+' : ''}${v} ${k}`);
    if (bonus.length) parts.push(bonus.join(', '));
    if (def.price) parts.push(`worth ${def.price}`);
    if (!this.game.inventory.canUse(def)) parts.push('not for your class');
    const lacks = this.game.missing(def);
    if (lacks.length) parts.push(`needs ${lacks.join(', ')}`);
    return parts.join(' · ');
  }

  /** The item's icon centred in a w x h box, shrunk to fit. */
  private icon(def: ItemDef, w: number, h: number): HTMLDivElement {
    const box = document.createElement('div');
    box.style.cssText = `position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none`;
    if (!this.icons.has(def.id)) return box;
    const [x, y, iw, ih] = this.icons.rect(def.id);
    const i = document.createElement('div');
    const k = Math.min(1, (w - 4) / iw, (h - 4) / ih);
    i.style.cssText = `width:${iw}px;height:${ih}px;background:url(${this.base}${this.icons.json.image}) -${x}px -${y}px;image-rendering:pixelated;transform:scale(${k});flex:none`;
    box.appendChild(i);
    return box;
  }

  /** A slot hit area with an optional item: red backing if it cannot be used, blue under the pointer. */
  private cell(x: number, y: number, w: number, h: number, def: ItemDef | undefined, big: boolean, left?: () => void, right?: () => void, ghost?: number | null): HTMLDivElement {
    const c = document.createElement('div');
    c.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;cursor:${def && left ? 'pointer' : 'default'}`;
    const bg = (id: number | null) => {
      c.querySelector('[data-bg]')?.remove();
      if (id === null) return;
      const s = this.skin.sprite('inventory', id, 0, 0);
      s.dataset.bg = '1';
      s.style.pointerEvents = 'none';
      if (!big) s.style.transform = 'none';
      c.prepend(s);
    };
    if (def && this.game.blocked(def)) bg(big ? 7 : 6);
    else if (!def && ghost) { const g = this.skin.sprite('inventory', ghost, 0, 0); g.style.opacity = '0.55'; g.style.pointerEvents = 'none'; c.appendChild(g); }
    if (def) {
      c.appendChild(this.icon(def, w, h));
      c.title = this.tip(def);
      if (left) c.addEventListener('click', left);
      if (right) c.addEventListener('contextmenu', (e) => { e.preventDefault(); right(); });
      c.addEventListener('pointerenter', () => { c.style.boxShadow = 'inset 0 0 0 1px #e8c85a'; });
      c.addEventListener('pointerleave', () => { c.style.boxShadow = ''; });
    }
    return c;
  }

  update(): void {
    if (!this.open || this.seen === this.game.version) return;
    this.seen = this.game.version;
    const g = this.game, inv = g.inventory, sk = this.skin;
    this.root.replaceChildren(sk.sprite('inventory', 0, 0, 0), sk.sprite('inventory', 1, 255, 25));
    // equipment
    for (const e of EQUIP) {
      const id = inv.equipped[e.slot];
      const def = id ? inv.def(id) : undefined;
      const size = e.big ? 64 : 34;
      this.root.appendChild(this.cell(e.x, e.y, size, e.big ? 64 : 32, def, e.big, () => g.unequip(e.slot), () => g.unequip(e.slot), g.classId === 100 ? e.ghost : e.ghost === 20 ? 30 : e.ghost === 21 ? 31 : e.ghost === 22 ? 32 : null));
    }
    // heavy objects: five big slots, paged when there are more
    const heavy = inv.indicesOf(true);
    const pages = Math.max(1, Math.ceil(heavy.length / HEAVY_PAGE));
    this.page = Math.min(this.page, pages - 1);
    HEAVY_Y.forEach((y, k) => {
      const at = heavy[this.page * HEAVY_PAGE + k];
      const def = at !== undefined ? inv.def(inv.slots[at]!) : undefined;
      this.root.appendChild(this.cell(HEAVY_X, y, 65, 64, def, true, at !== undefined ? () => g.activate(at, 'left') : undefined, at !== undefined ? () => g.activate(at, 'right') : undefined));
    });
    if (pages > 1) {
      const arrow = (id: number, x: number, d: number) => {
        const a = sk.sprite('inventory', id, x, 372);
        a.style.cursor = 'pointer';
        a.addEventListener('click', () => { this.page = (this.page + d + pages) % pages; this.seen = -1; });
        this.root.appendChild(a);
      };
      arrow(53, 175, -1);
      arrow(54, 205, 1);
    }
    // light objects: the 2 x 10 grid
    inv.indicesOf(false).forEach((at, n) => {
      const col = n % 2, row = Math.floor(n / 2);
      const def = inv.def(inv.slots[at]!);
      this.root.appendChild(this.cell(GRID_X + col * CELL_W, GRID_Y + row * CELL_H, 33, 33, def, false, () => g.activate(at, 'left'), () => g.activate(at, 'right')));
    });
    // gold
    const gold = sk.text(String(inv.gold), { color: '#f1d98a' });
    gold.style.cssText += `;position:absolute;left:${29 + (102 - sk.textWidth(String(inv.gold))) / 2}px;top:304px`;
    this.root.appendChild(gold);
    // the recessed plate at the bottom closes the window
    const close = document.createElement('div');
    close.style.cssText = 'position:absolute;left:40px;top:335px;width:80px;height:20px;cursor:pointer';
    const ct = sk.text('Close', { color: '#d8caa0' });
    ct.style.cssText += `;position:absolute;left:${(80 - sk.textWidth('Close')) / 2}px;top:0`;
    close.appendChild(ct);
    close.addEventListener('click', () => this.toggle());
    this.root.appendChild(close);
  }
}

export { isHeavy, slotOf };
