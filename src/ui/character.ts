/**
 * Character specifications window (key C) on the original art: HDP.b16 frame 0 has the ability and statistic fields
 * (coordinates measured from the frame), frames 1-3 are the "+" buttons. Spending the level-up points happens here.
 */
import type { Attr, Game } from '../game/game.ts';
import { xpForLevel } from '../game/game.ts';
import type { Skin } from './skin.ts';

/** Ability value boxes in the order the art lists them: Strength, Resistance, Skill, Power (box y; x = 109, 50x15). */
const ABILITIES: { key: Attr; y: number }[] = [
  { key: 'strength', y: 89 }, { key: 'resistance', y: 114 }, { key: 'skill', y: 139 }, { key: 'magic', y: 163 },
];
/** Statistic fields (77x14): Level, Life / Experience, Mana / Next level, Stamina. */
const STATS = { level: [31, 222], life: [140, 222], xp: [31, 279], mana: [140, 279], next: [31, 337], stamina: [140, 337] } as const;

export class CharacterPanel {
  private readonly root = document.createElement('div');
  private seen = -1;
  private open = false;

  constructor(private readonly game: Game, private readonly skin: Skin) {
    this.root.style.cssText = 'position:fixed;left:0;top:50%;width:255px;height:420px;display:none;user-select:none;z-index:8;transform-origin:left center';
    document.body.appendChild(this.root);
    const fit = () => { this.root.style.transform = `translateY(-50%) scale(${window.innerHeight / 480})`; };
    window.addEventListener('resize', fit);
    fit();
  }

  toggle(): void {
    this.open = !this.open;
    this.root.style.display = this.open ? 'block' : 'none';
    this.seen = -1;
  }

  /** Text centred (or left-aligned) in a field box. */
  private put(text: string, x: number, y: number, w: number, color = '#e9dfb8', center = true): void {
    const t = this.skin.text(text, { color });
    const tw = this.skin.textWidth(text);
    t.style.cssText += `;position:absolute;left:${center ? x + Math.max(0, (w - tw) / 2) : x + 4}px;top:${y - 3}px`;
    this.root.appendChild(t);
  }

  update(): void {
    if (!this.open || this.seen === this.game.version) return;
    this.seen = this.game.version;
    const g = this.game, h = g.hero, sk = this.skin;
    this.root.replaceChildren(sk.sprite('hdp', 0, 0, 0));
    this.put(h.stats.name.trim(), 37, 27, 88, '#f1d98a');
    if (g.points > 0) this.put(`+${g.points} points`, 126, 26, 85, '#ffffff');
    for (const a of ABILITIES) {
      this.put(String(g.attrs[a.key]), 109, a.y, 50);
      const plus = g.eff[a.key] - g.attrs[a.key];
      if (plus) this.put(`${plus > 0 ? '+' : ''}${plus}`, 163 + 26, a.y, 20, plus > 0 ? '#9ad27a' : '#d27a7a', false);
      if (g.points > 0) {
        const b = sk.sprite('hdp', 1, 160, a.y - 3);
        b.style.cursor = 'pointer';
        b.title = 'Add a point';
        b.addEventListener('pointerenter', () => { b.style.filter = 'brightness(1.5)'; });
        b.addEventListener('pointerleave', () => { b.style.filter = ''; });
        b.addEventListener('click', () => g.spend(a.key));
        this.root.appendChild(b);
      } else {
        const b = sk.sprite('hdp', 3, 160, a.y - 3);
        b.style.opacity = '0.6';
        this.root.appendChild(b);
      }
    }
    const f = (k: keyof typeof STATS, text: string) => this.put(text, STATS[k][0], STATS[k][1], 77);
    f('level', String(g.level));
    f('life', `${Math.max(0, Math.ceil(h.hp))}/${h.stats.hp}`);
    f('xp', String(g.xp));
    f('mana', `${Math.floor(g.mana)}/${g.maxMana}`);
    f('next', String(xpForLevel(g.level + 1)));
    f('stamina', `${Math.floor(g.stamina)}/${g.maxStamina}`);
  }
}
