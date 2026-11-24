import type { Attr, Game } from '../game/game.ts';
import { xpForLevel } from '../game/game.ts';

const ROWS: [Attr, string][] = [['strength', 'Strength'], ['skill', 'Skill'], ['resistance', 'Resistance'], ['magic', 'Power']];

/** Character specifications window (key C; manual: "Character specifications"). Level-up points are spent here. */
export class CharacterPanel {
  private readonly root = document.createElement('div');
  private seen = -1;
  private open = false;

  constructor(private readonly game: Game) {
    this.root.style.cssText =
      'position:fixed;left:8px;top:8px;width:260px;padding:8px;background:rgba(14,10,6,.92);border:2px solid #6b5426;color:#e9dfb8;font:12px ui-monospace,Menlo,monospace;display:none;user-select:none;line-height:1.7';
    document.body.appendChild(this.root);
  }

  toggle(): void {
    this.open = !this.open;
    this.root.style.display = this.open ? 'block' : 'none';
    this.seen = -1;
  }

  update(): void {
    if (!this.open || this.seen === this.game.version) return;
    this.seen = this.game.version;
    const g = this.game, h = g.hero;
    this.root.replaceChildren();
    const line = (t: string) => { const d = document.createElement('div'); d.textContent = t; this.root.appendChild(d); };
    line(`${h.stats.name} · level ${g.level}`);
    line(`Experience ${g.xp} · next level ${xpForLevel(g.level + 1)}`);
    line(`Life ${Math.ceil(h.hp)}/${h.stats.hp} · Stamina ${Math.floor(g.stamina)}/${g.maxStamina} · Mana ${Math.floor(g.mana)}/${g.maxMana}`);
    if (g.points > 0) line(`Points to spend: ${g.points}`);
    for (const [key, label] of ROWS) {
      const r = document.createElement('div');
      r.style.cssText = 'display:flex;justify-content:space-between;align-items:center';
      const t = document.createElement('span');
      t.textContent = `${label} ${g.attrs[key]}`;
      r.appendChild(t);
      if (g.points > 0) {
        const b = document.createElement('button');
        b.textContent = '+';
        b.style.cssText = 'width:24px;background:#241a0e;color:#e9dfb8;border:1px solid #6b5426;font:inherit;cursor:pointer';
        b.onclick = () => g.spend(key);
        r.appendChild(b);
      }
      this.root.appendChild(r);
    }
  }
}
