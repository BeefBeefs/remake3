import { MAPS, type MapEntry, type MapGroup } from '../game/maplist.ts';
import type { Skin } from './skin.ts';

const W = 340, ROW = 22, VISIBLE = 12, HEAD = 62;
const GROUPS: MapGroup[] = ['Solo', 'Campaign', 'Multiplayer'];

/**
 * "Select map": the list of maps this install has (the solo mission, the campaign missions and the multiplayer arenas)
 * on a stone panel over the menu. Resolves with the choice, or null on Cancel.
 */
export function pickMap(skin: Skin, parent: HTMLElement, maps: readonly MapEntry[] = MAPS): Promise<MapEntry | null> {
  return new Promise((resolve) => {
    const veil = document.createElement('div');
    veil.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);z-index:30';
    const panel = document.createElement('div');
    const H = HEAD + VISIBLE * ROW + 50;
    panel.style.cssText = `position:relative;width:${W}px;height:${H}px;flex:none;box-shadow:0 0 0 3px #9c7e48,0 8px 28px #000`;
    panel.appendChild(skin.fill('overlay', 66, W, H));
    const put = (el: HTMLElement, x: number, y: number) => { el.style.cssText += `;position:absolute;left:${x}px;top:${y}px`; panel.appendChild(el); return el; };
    const title = skin.text('Select map', { color: '#f1d98a' });
    put(title, (W - skin.textWidth('Select map')) / 2, 12);
    const done = (v: MapEntry | null) => { veil.remove(); resolve(v); };

    let group: MapGroup = maps.some((m) => m.group === 'Solo') ? 'Solo' : (maps[0]?.group ?? 'Solo');
    let scroll = 0, selected: MapEntry | null = null;
    const list = document.createElement('div');
    list.style.cssText = `position:absolute;left:14px;top:${HEAD}px;width:${W - 28}px;height:${VISIBLE * ROW}px;overflow:hidden;background:#000a;border:1px solid #9c7e48;box-sizing:content-box`;
    panel.appendChild(list);
    const tabs: HTMLDivElement[] = [];
    const go = skin.plate('Play', 90, 20, () => { if (selected) done(selected); });
    const paint = () => {
      tabs.forEach((t, i) => { t.style.opacity = GROUPS[i] === group ? '1' : '0.6'; });
      const items = maps.filter((m) => m.group === group);
      scroll = Math.max(0, Math.min(scroll, Math.max(0, items.length - VISIBLE)));
      list.replaceChildren();
      items.slice(scroll, scroll + VISIBLE).forEach((m, i) => {
        const row = document.createElement('div');
        const on = selected?.id === m.id;
        row.style.cssText = `position:absolute;left:0;top:${i * ROW}px;width:100%;height:${ROW}px;cursor:pointer;background:${on ? '#5a431acc' : 'transparent'}`;
        const t = skin.text(m.name, { color: on ? '#f6e49a' : '#d8caa0' });
        t.style.cssText += ';position:absolute;left:8px;top:5px;pointer-events:none';
        row.appendChild(t);
        row.addEventListener('pointerenter', () => { if (!on) row.style.background = '#5a431a66'; });
        row.addEventListener('pointerleave', () => { if (!on) row.style.background = 'transparent'; });
        row.addEventListener('click', () => { selected = m; paint(); });
        row.addEventListener('dblclick', () => done(m));
        list.appendChild(row);
      });
      go.style.opacity = selected ? '1' : '0.45';
    };
    GROUPS.filter((g) => maps.some((m) => m.group === g)).forEach((g, i) => {
      const tab = skin.plate(g, 100, 18, () => { group = g; scroll = 0; paint(); }) as HTMLDivElement;
      put(tab, 14 + i * 104, 36);
      tabs[GROUPS.indexOf(g)] = tab;
    });
    list.addEventListener('wheel', (e) => { scroll += Math.sign(e.deltaY) * 3; paint(); e.preventDefault(); }, { passive: false });
    put(go, 52, H - 34);
    put(skin.plate('Cancel', 90, 20, () => done(null)), W - 52 - 90, H - 34);
    paint();
    veil.appendChild(panel);
    veil.addEventListener('click', (e) => { if (e.target === veil) done(null); });
    parent.appendChild(veil);
  });
}
