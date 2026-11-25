import { MAPS, type MapEntry, type MapGroup } from '../game/maplist.ts';
import type { Skin } from './skin.ts';

// The window is the original picture `Pack/Mn_SelectMap.g16` (308 x 352): a black list (x 14-278, y 26-202), the "Information"
// band, an information box (y 222-318) and the Accept / Cancel buttons drawn at the bottom (y 325-345).
const W = 308, H = 352, ROW = 20, GROUPS: MapGroup[] = ['Solo', 'Campaign', 'Multiplayer'];
const LIST = { x: 14, y: 26, w: 264, h: 176 };

/**
 * "Select map": the list of maps this install has (the solo mission, the campaign missions and the multiplayer arenas)
 * on the original window picture. The three groups are tabs along the top of the list (the original has one flat list).
 * Resolves with the choice, or null on Cancel.
 */
export function pickMap(skin: Skin, parent: HTMLElement, maps: readonly MapEntry[] = MAPS): Promise<MapEntry | null> {
  return new Promise((resolve) => {
    const veil = document.createElement('div');
    veil.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);z-index:30';
    const panel = document.createElement('div');
    panel.style.cssText = `position:relative;width:${W}px;height:${H}px;flex:none;background:url(${skin.base}screens/mn_selectmap.png);filter:drop-shadow(0 8px 20px #000)`;
    const done = (v: MapEntry | null) => { veil.remove(); resolve(v); };

    const groups = GROUPS.filter((g) => maps.some((m) => m.group === g));
    let group: MapGroup = groups.includes('Solo') ? 'Solo' : (groups[0] ?? 'Solo');
    let scroll = 0, selected: MapEntry | null = null;
    const visible = Math.floor((LIST.h - 22) / ROW);
    const list = document.createElement('div');
    list.style.cssText = `position:absolute;left:${LIST.x}px;top:${LIST.y}px;width:${LIST.w}px;height:${LIST.h}px;overflow:hidden`;
    panel.appendChild(list);
    const info = document.createElement('div');
    info.style.cssText = 'position:absolute;left:18px;top:228px;width:270px;height:86px;overflow:hidden';
    panel.appendChild(info);
    const hit = (label: string, x: number, y: number, w: number, h: number, on: () => void) => {
      const b = document.createElement('div');
      b.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;cursor:pointer`;
      b.addEventListener('click', on);
      b.addEventListener('pointerenter', () => { b.style.background = '#ffffff22'; });
      b.addEventListener('pointerleave', () => { b.style.background = ''; });
      b.title = label;
      panel.appendChild(b);
    };
    const paint = () => {
      const items = maps.filter((m) => m.group === group);
      scroll = Math.max(0, Math.min(scroll, Math.max(0, items.length - visible)));
      list.replaceChildren();
      groups.forEach((g, i) => {
        const t = skin.text(g, { color: g === group ? '#f6e49a' : '#8a8062' });
        const cell = document.createElement('div');
        cell.style.cssText = `position:absolute;left:${i * 88}px;top:0;width:88px;height:20px;cursor:pointer;border-bottom:1px solid ${g === group ? '#e8c85a' : '#3a2d14'}`;
        t.style.cssText += `;position:absolute;left:${(88 - skin.textWidth(g)) / 2}px;top:3px;pointer-events:none`;
        cell.appendChild(t);
        cell.addEventListener('click', () => { group = g; scroll = 0; paint(); });
        list.appendChild(cell);
      });
      items.slice(scroll, scroll + visible).forEach((m, i) => {
        const row = document.createElement('div');
        const on = selected?.id === m.id;
        row.style.cssText = `position:absolute;left:0;top:${22 + i * ROW}px;width:100%;height:${ROW}px;cursor:pointer;background:${on ? '#5a431acc' : 'transparent'}`;
        const t = skin.text(m.name, { color: on ? '#f6e49a' : '#d8caa0' });
        t.style.cssText += ';position:absolute;left:8px;top:3px;pointer-events:none';
        row.appendChild(t);
        row.addEventListener('pointerenter', () => { if (!on) row.style.background = '#5a431a66'; });
        row.addEventListener('pointerleave', () => { if (!on) row.style.background = 'transparent'; });
        row.addEventListener('click', () => { selected = m; paint(); });
        row.addEventListener('dblclick', () => done(m));
        list.appendChild(row);
      });
      info.replaceChildren();
      const line = (s: string, y: number, color: string) => { const t = skin.text(s, { color }); t.style.cssText += `;position:absolute;left:0;top:${y}px`; info.appendChild(t); };
      if (selected) { line(selected.name, 0, '#f1d98a'); line(selected.group, 20, '#a99b72'); } else line('Pick a map from the list', 0, '#8a8062');
    };
    hit('Accept', 78, 325, 66, 20, () => { if (selected) done(selected); });
    hit('Cancel', 168, 325, 66, 20, () => done(null));
    list.addEventListener('wheel', (e) => { scroll += Math.sign(e.deltaY) * 3; paint(); e.preventDefault(); }, { passive: false });
    paint();
    veil.appendChild(panel);
    veil.addEventListener('click', (e) => { if (e.target === veil) done(null); });
    parent.appendChild(veil);
  });
}
