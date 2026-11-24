import { CLASSES } from '../game/game.ts';
import { MISSIONS, SLOTS, type Career, type SaveStore } from '../game/career.ts';
import type { Skin } from './skin.ts';

const W = 360, ROW = 34;

/** "Barbarian, level 3" and "1 of 1 missions, 1234 gold" for a slot, plus its date. */
export function describe(c: Career): { title: string; detail: string; date: string } {
  const cls = CLASSES[c.classId as 100 | 101 | 102]?.name ?? 'Hero';
  const d = c.when ? new Date(c.when).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
  return { title: `${cls}, level ${c.hero.level}`, detail: `${c.done.length} of ${MISSIONS.length} missions, ${c.hero.gold} gold`, date: d };
}

/**
 * The list of save slots on a stone panel, over the current screen. `save` lets you pick any slot (asking before it
 * replaces one); `load` only the slots in use. Resolves with the slot, or null if you cancel.
 */
export function pickSlot(skin: Skin, store: SaveStore, mode: 'save' | 'load', parent: HTMLElement = document.body): Promise<number | null> {
  return new Promise((resolve) => {
    const veil = document.createElement('div');
    veil.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);z-index:30';
    const panel = document.createElement('div');
    const H = 58 + SLOTS * ROW + 40;
    panel.style.cssText = `position:relative;width:${W}px;height:${H}px;flex:none;box-shadow:0 0 0 3px #9c7e48,0 8px 28px #000`;
    panel.appendChild(skin.fill('overlay', 66, W, H));
    const label = (t: string, x: number, y: number, color = '#e9dfb8', center = false, w = 0) => {
      const c = skin.text(t, { color });
      c.style.cssText += `;position:absolute;left:${center ? x + (w - skin.textWidth(t)) / 2 : x}px;top:${y}px;pointer-events:none`;
      panel.appendChild(c);
    };
    label(mode === 'save' ? 'Save game' : 'Load game', 0, 12, '#f1d98a', true, W);
    const done = (v: number | null) => { veil.remove(); resolve(v); };
    const slots = store.list();
    slots.forEach((c, i) => {
      const row = document.createElement('div');
      const usable = mode === 'save' || !!c;
      row.style.cssText = `position:absolute;left:14px;top:${44 + i * ROW}px;width:${W - 28}px;height:${ROW - 4}px;box-sizing:border-box;background:#000a;border:1px solid #9c7e48;cursor:${usable ? 'pointer' : 'default'};opacity:${usable ? 1 : 0.55}`;
      panel.appendChild(row);
      const text = (t: string, x: number, y: number, color: string) => { const e = skin.text(t, { color }); e.style.cssText += `;position:absolute;left:${x}px;top:${y}px;pointer-events:none`; row.appendChild(e); };
      if (c) { const d = describe(c); text(`${i + 1}. ${d.title}`, 8, 0, '#f1d98a'); text(d.detail, 8, 14, '#a99b72'); text(d.date, W - 28 - 8 - skin.textWidth(d.date), 0, '#8a8062'); }
      else text(`${i + 1}. empty`, 8, 6, '#8a8062');
      if (usable) {
        row.addEventListener('pointerenter', () => { row.style.background = '#5a431a99'; });
        row.addEventListener('pointerleave', () => { row.style.background = '#000a'; });
        row.addEventListener('click', () => {
          if (mode === 'save' && c && !window.confirm(`Replace saved game ${i + 1}?`)) return;
          done(i);
        });
      }
    });
    const cancel = skin.plate('Cancel', 90, 20, () => done(null));
    cancel.style.cssText += `;position:absolute;left:${(W - 90) / 2}px;top:${H - 34}px`;
    panel.appendChild(cancel);
    veil.appendChild(panel);
    veil.addEventListener('click', (e) => { if (e.target === veil) done(null); });
    parent.appendChild(veil);
  });
}
