/**
 * The in-game HUD in the original layout (see the installer screenshots NightStone_1/2.tga): a round minimap with four
 * buttons at the bottom left, the hero's portrait with life / stamina / mana bars at the bottom centre, and the
 * quick-access bar above a message box at the bottom right. All art comes from GDI/Graphics/Score.b16 and
 * Inventory.b16 (frame ids in comments).
 */
import type { Atlas } from '../assets/atlas.ts';
import type { Game } from '../game/game.ts';
import { cellToWorld } from '../iso.ts';
import type { Skin } from './skin.ts';

export interface HudActions { quest(): void; inventory(): void; options(): void; character(): void }

type Bar = HTMLDivElement & { fill: HTMLDivElement };
const PORTRAIT = { 100: [31, 32], 101: [33, 34], 102: [35, 36] } as const; // [alive, dead]
const MAP_SCALE = 0.07; // world units -> minimap pixels
const MESSAGE_LINES = 3;

export class Hud {
  private readonly left = this.cluster('left', 151, 119);
  private readonly mid = this.cluster('center', 102, 63);
  private readonly right = this.cluster('right', 202, 122);
  private readonly map = document.createElement('canvas');
  private readonly portrait: HTMLDivElement;
  private readonly bars: { life: Bar; stamina: Bar; mana: Bar };
  private readonly badge: HTMLDivElement;
  private readonly quick: HTMLDivElement[] = [];
  private readonly msg = document.createElement('div');
  private seenVersion = -1;
  private seenLog = '';
  private seenPoints = -1;
  private seenDead = false;

  constructor(private readonly skin: Skin, private readonly game: Game, private readonly icons: Atlas, private readonly base: string, actions: HudActions) {
    // --- left: minimap ring (score 0), globe (10), buttons (2/3, 4/5, 6/7, 8/9) ---
    const globe = skin.sprite('score', 10, 20, 11);
    this.map.width = 86; this.map.height = 86;
    this.map.style.cssText = 'position:absolute;left:20px;top:11px;width:86px;height:86px;border-radius:50%';
    this.left.append(globe, this.map, skin.sprite('score', 0, 0, 0));
    ([[2, 3, 32, actions.quest, 'Objectives (Q)'], [4, 5, 56, actions.inventory, 'Inventory (I)'], [6, 7, 80, actions.options, 'Options (Esc)'], [8, 9, 104, actions.character, 'Character (C)']] as const).forEach(([a, b, x, fn, tip]) => {
      const hover = skin.sprite('score', b, x, 95);
      hover.style.opacity = '0';
      hover.style.cursor = 'pointer';
      hover.title = tip;
      hover.addEventListener('pointerenter', () => { hover.style.opacity = '1'; });
      hover.addEventListener('pointerleave', () => { hover.style.opacity = '0'; });
      hover.addEventListener('click', fn);
      this.left.appendChild(hover);
      void a;
    });

    // --- centre: ornament (29), portrait frame (30), portrait, three bars (18 red, 19 yellow, 43 blue) ---
    this.mid.appendChild(skin.sprite('score', 30, 7, 9));
    this.portrait = document.createElement('div');
    this.portrait.style.cssText = `position:absolute;left:${7 + 19}px;top:${9 + 1}px;width:44px;height:52px;cursor:pointer`;
    this.portrait.addEventListener('click', actions.character);
    this.mid.appendChild(this.portrait);
    const bar = (id: number, x: number, bottom: number) => {
      const well = document.createElement('div');
      const h = 36;
      well.style.cssText = `position:absolute;left:${7 + x}px;top:${9 + bottom - h}px;width:9px;height:${h}px;overflow:hidden`;
      const fill = skin.sprite('score', id, 0, 0);
      fill.style.top = '0';
      well.appendChild(fill);
      this.mid.appendChild(well);
      return Object.assign(well, { fill }) as Bar;
    };
    const life = bar(18, 66, 52), stamina = bar(19, 76, 42), mana = bar(43, 86, 52);
    this.bars = { life, stamina, mana };
    this.mid.appendChild(skin.sprite('score', 29, 0, 0));
    this.badge = document.createElement('div');
    this.badge.style.cssText = 'position:absolute;left:48px;top:11px;cursor:pointer;display:none';
    this.badge.addEventListener('click', actions.character);
    this.mid.appendChild(this.badge);

    // --- right: message frame (1) with the quick bar (inventory 41) above it ---
    this.right.appendChild(skin.sprite('score', 1, 0, 31));
    this.right.appendChild(skin.sprite('inventory', 41, 8, 0));
    for (let i = 0; i < 4; i++) {
      const s = document.createElement('div');
      s.style.cssText = `position:absolute;left:${8 + 24 + i * 40}px;top:13px;width:36px;height:36px;display:flex;align-items:center;justify-content:center;cursor:pointer`;
      s.addEventListener('click', () => this.game.useQuick(i + 1));
      s.addEventListener('contextmenu', (e) => { e.preventDefault(); this.game.useQuick(i + 1); });
      this.right.appendChild(s);
      this.quick.push(s);
    }
    this.msg.style.cssText = 'position:absolute;left:34px;top:49px;width:150px;height:55px;overflow:hidden;pointer-events:none';
    this.right.appendChild(this.msg);

    window.addEventListener('resize', () => this.layout());
    this.layout();
  }

  /** A bottom-anchored block of 640x480-space art that scales with the screen height. */
  private cluster(anchor: 'left' | 'center' | 'right', w: number, h: number): HTMLDivElement {
    const d = document.createElement('div');
    d.dataset.anchor = anchor;
    d.style.cssText = `position:fixed;bottom:0;width:${w}px;height:${h}px;user-select:none;z-index:5;transform-origin:${anchor === 'left' ? 'left' : anchor === 'right' ? 'right' : 'center'} bottom`;
    if (anchor === 'left') d.style.left = '0';
    if (anchor === 'right') d.style.right = '0';
    document.body.appendChild(d);
    return d;
  }

  private layout(): void {
    const s = window.innerHeight / 480;
    for (const c of [this.left, this.mid, this.right]) {
      const a = c.dataset.anchor;
      c.style.transform = a === 'center' ? `translateX(-50%) scale(${s})` : `scale(${s})`;
      if (a === 'center') c.style.left = '45%';
    }
  }

  /** The ring, buttons, panels etc. should not let clicks through to the game. */
  contains(target: EventTarget | null): boolean {
    return target instanceof Node && [this.left, this.mid, this.right].some((c) => c.contains(target));
  }

  update(): void {
    const g = this.game, h = g.hero;
    this.setBar(this.bars.life, h.hp / h.stats.hp, 9 + 52);
    this.setBar(this.bars.stamina, g.stamina / g.maxStamina, 9 + 42);
    this.setBar(this.bars.mana, g.mana / Math.max(1, g.maxMana), 9 + 52);

    if (this.seenDead !== !h.alive || this.seenVersion < 0) {
      this.seenDead = !h.alive;
      const [alive, dead] = PORTRAIT[g.classId];
      this.portrait.replaceChildren(this.skin.sprite('score', h.alive ? alive : dead));
    }
    this.portrait.title = `${h.stats.name} · level ${g.level} · HP ${Math.max(0, h.hp)}/${h.stats.hp} · stamina ${Math.floor(g.stamina)}/${g.maxStamina} · mana ${Math.floor(g.mana)}/${g.maxMana} · xp ${g.xp} · ${g.kills} kills`;

    if (this.seenPoints !== g.points) {
      this.seenPoints = g.points;
      this.badge.replaceChildren();
      if (g.points > 0) { this.badge.appendChild(this.skin.text(`+${g.points}`, { color: '#ffffff' })); this.badge.style.display = 'block'; this.badge.title = 'Distribute your points (C)'; }
      else this.badge.style.display = 'none';
    }

    if (this.seenVersion !== g.version) {
      this.seenVersion = g.version;
      this.quick.forEach((slot, i) => {
        slot.replaceChildren();
        const id = g.inventory.slots[i];
        const def = id ? g.inventory.def(id) : undefined;
        slot.title = def ? def.name : '';
        if (def && this.icons.has(def.id)) {
          const [x, y, w, hh] = this.icons.rect(def.id);
          const ic = document.createElement('div');
          const k = Math.min(1, 34 / Math.max(w, hh));
          ic.style.cssText = `width:${w}px;height:${hh}px;background:url(${this.base}${this.icons.json.image}) -${x}px -${y}px;image-rendering:pixelated;transform:scale(${k});flex:none`;
          slot.appendChild(ic);
        }
        const n = this.skin.text(String(i + 1), { color: '#c8b070' });
        n.style.cssText += ';position:absolute;left:2px;top:-2px;transform:scale(.7);transform-origin:left top;pointer-events:none';
        slot.appendChild(n);
      });
    }

    const log = g.log.slice(-4).join('\n');
    if (log !== this.seenLog) {
      this.seenLog = log;
      this.msg.replaceChildren();
      const lines = g.log.slice(-4).flatMap((m) => this.skin.wrap(m, 148)).slice(-MESSAGE_LINES);
      lines.forEach((l, i) => {
        const t = this.skin.text(l, { color: i === lines.length - 1 ? '#f1e3b0' : '#b9a878' });
        t.style.cssText += `;position:absolute;left:0;top:${i * 16}px`;
        this.msg.appendChild(t);
      });
    }
    this.drawMap();
  }

  /** Bars are 9x36 sprites revealed from the bottom; `bottom` is the y (in cluster space) of the bar's bottom edge. */
  private setBar(b: Bar, frac: number, bottom: number): void {
    const f = Math.max(0, Math.min(1, frac));
    const hh = Math.round(36 * f);
    b.style.height = `${hh}px`;
    b.style.top = `${bottom - hh}px`;
    b.fill.style.top = `${hh - 36}px`;
  }

  /** Radar: the hero in the middle, monsters red, NPCs yellow, goal objects blue, drawn on the ring's globe. */
  private drawMap(): void {
    const g = this.game, c = this.map.getContext('2d')!;
    c.clearRect(0, 0, 86, 86);
    const o = cellToWorld(g.hero.cx, g.hero.cy);
    const dot = (cx: number, cy: number, color: string, r = 1.5) => {
      const p = cellToWorld(cx, cy);
      const x = 43 + (p.x - o.x) * MAP_SCALE, y = 43 - (p.y - o.y) * MAP_SCALE;
      if ((x - 43) ** 2 + (y - 43) ** 2 > 40 * 40) return;
      c.fillStyle = color;
      c.fillRect(Math.round(x - r), Math.round(y - r), r * 2, r * 2);
    };
    for (const q of g.goalSpots) dot(q.cx, q.cy, '#5aa0ff', 2);
    for (const n of g.npcs) dot(n.creature.cx, n.creature.cy, '#ffd54a');
    for (const m of g.monsters) if (m.alive) dot(m.cx, m.cy, '#e03030');
    dot(g.hero.cx, g.hero.cy, '#ffffff', 2);
  }
}
