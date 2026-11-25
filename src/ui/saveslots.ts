import { CLASSES } from '../game/game.ts';
import { MISSIONS, type Career, type SaveStore } from '../game/career.ts';
import type { Skin } from './skin.ts';

// The window is the original picture `Pack/Ov_Save.g16` / `Ov_Load.g16` (400 x 450): eight slot rows of 30 px from y 25, the
// "Information" band at y 234 and an information box (y 253-417); Accept / Cancel are drawn at the bottom (y 423-443).
const W = 400, H = 450, ROW = 30, TOP = 25;

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
    panel.style.cssText = `position:relative;width:${W}px;height:${H}px;flex:none;background:url(${skin.base}screens/ov_${mode}.png);filter:drop-shadow(0 8px 20px #000)`;
    const done = (v: number | null) => { veil.remove(); resolve(v); };
    const slots = store.list();
    const rows: HTMLDivElement[] = [];
    let sel: number | null = null;
    const info = document.createElement('div');
    info.style.cssText = 'position:absolute;left:20px;top:262px;width:360px;height:150px;overflow:hidden';
    panel.appendChild(info);
    const show = (c: Career | null, i: number) => {
      info.replaceChildren();
      const line = (t: string, y: number, color: string) => { const e = skin.text(t, { color }); e.style.cssText += `;position:absolute;left:0;top:${y}px`; info.appendChild(e); };
      if (!c) { line(`Slot ${i + 1}: empty`, 0, '#8a8062'); return; }
      const d = describe(c);
      line(`Slot ${i + 1}: ${d.title}`, 0, '#f1d98a'); line(d.detail, 22, '#d8caa0'); line(d.date, 44, '#a99b72');
    };
    slots.forEach((c, i) => {
      const row = document.createElement('div');
      const usable = mode === 'save' || !!c;
      row.style.cssText = `position:absolute;left:20px;top:${TOP + i * ROW}px;width:340px;height:${ROW - 2}px;box-sizing:border-box;cursor:${usable ? 'pointer' : 'default'};opacity:${usable ? 1 : 0.55}`;
      panel.appendChild(row);
      const text = (t: string, x: number, y: number, color: string) => { const e = skin.text(t, { color }); e.style.cssText += `;position:absolute;left:${x}px;top:${y}px;pointer-events:none`; row.appendChild(e); };
      if (c) { const d = describe(c); text(`${i + 1}. ${d.title}`, 8, 6, '#f1d98a'); text(d.date, 332 - skin.textWidth(d.date), 6, '#8a8062'); }
      else text(`${i + 1}. empty`, 8, 6, '#8a8062');
      row.addEventListener('pointerenter', () => { if (usable) row.style.background = '#5a431a99'; show(c, i); });
      row.addEventListener('pointerleave', () => { row.style.background = 'transparent'; });
      rows.push(row);
      if (usable) {
        row.addEventListener('click', () => { sel = i; rows.forEach((r, k) => { r.style.outline = k === i ? '1px solid #e8c85a' : ''; }); show(c, i); });
        row.addEventListener('dblclick', () => accept(i));
      }
    });
    const accept = (i: number | null) => {
      if (i === null) return;
      if (mode === 'save' && slots[i] && !window.confirm(`Replace saved game ${i + 1}?`)) return;
      done(i);
    };
    const btn = (label: string, x: number, on: () => void) => {
      const b = document.createElement('div');
      b.title = label;
      b.style.cssText = `position:absolute;left:${x}px;top:423px;width:68px;height:21px;cursor:pointer`;
      b.addEventListener('click', on);
      b.addEventListener('pointerenter', () => { b.style.background = '#ffffff22'; });
      b.addEventListener('pointerleave', () => { b.style.background = ''; });
      panel.appendChild(b);
    };
    btn('Accept', 123, () => accept(sel));
    btn('Cancel', 213, () => done(null));
    veil.appendChild(panel);
    veil.addEventListener('click', (e) => { if (e.target === veil) done(null); });
    parent.appendChild(veil);
  });
}
