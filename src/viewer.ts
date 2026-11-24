// Tiny DOM-only browser for the converted B16 banks. Handy while reverse-engineering the remaining formats.
import type { AtlasJson } from './assets/atlas.ts';

const BASE = `${import.meta.env.BASE_URL}assets/`;
const sel = document.getElementById('sel') as HTMLSelectElement;
const zoomEl = document.getElementById('zoom') as HTMLInputElement;
const info = document.getElementById('info') as HTMLSpanElement;
const grid = document.getElementById('grid') as HTMLDivElement;

async function show(jsonPath: string) {
  const atlas = (await (await fetch(`${BASE}${jsonPath}`)).json()) as AtlasJson;
  const z = Math.max(1, Number(zoomEl.value) || 1);
  grid.replaceChildren();
  const ids = Object.keys(atlas.frames).map(Number).sort((a, b) => a - b);
  info.textContent = `${ids.length} frames · ${atlas.size[0]}x${atlas.size[1]} atlas`;
  for (const id of ids) {
    const [x, y, w, h] = atlas.frames[String(id)]!;
    const fig = document.createElement('figure');
    const box = document.createElement('div');
    box.style.cssText = `width:${w * z}px;height:${h * z}px;background-image:url(${BASE}${atlas.image});background-size:${atlas.size[0] * z}px ${atlas.size[1] * z}px;background-position:-${x * z}px -${y * z}px;background-repeat:no-repeat;`;
    // the checkerboard lives on the figure wrapper so the sprite's transparency stays visible
    const wrap = document.createElement('div');
    wrap.style.cssText = `width:${w * z}px;height:${h * z}px;background:repeating-conic-gradient(#2a2c38 0% 25%, #23252f 0% 50%) 0 0 / 12px 12px;`;
    wrap.append(box);
    const cap = document.createElement('figcaption');
    cap.textContent = `${id} · ${w}x${h}`;
    fig.append(wrap, cap);
    grid.append(fig);
  }
}

const index = (await (await fetch(`${BASE}index.json`)).json()) as { atlases: Record<string, string> };
for (const [orig, json] of Object.entries(index.atlases)) sel.add(new Option(orig, json));
sel.addEventListener('change', () => void show(sel.value));
zoomEl.addEventListener('change', () => void show(sel.value));
await show(sel.value);
