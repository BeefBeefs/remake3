import { MAPS, applyCampaignNames, findMap } from './game/maplist.ts';
import { gunzip, parseMap, MAP_DIM, MAX_ROUTE, WATER_TILE, type GameMap, type Marker, START_IDS } from './formats/map.ts';
import { blankMapBody, gzip, writeMapBody } from './formats/mapwriter.ts';
import { isSlabFrame, tileFlip, HOTSPOT_X, HOTSPOT_Y } from './game/world.ts';
import type { AtlasJson } from './assets/atlas.ts';
import { applyBrush, blankCommand, clearRoute, COMMANDS, deleteScript, newScript, type Brush, type Tool } from './editorlogic.ts';

const BASE = `${import.meta.env.BASE_URL}assets/`;
const side = document.getElementById('side') as HTMLDivElement;
const view = document.getElementById('view') as HTMLCanvasElement;
const info = document.getElementById('info') as HTMLDivElement;
const ctx = view.getContext('2d')!;

interface Sheet { json: AtlasJson; img: HTMLImageElement }
async function sheet(path: string): Promise<Sheet> {
  const json = (await (await fetch(`${BASE}${path}`)).json()) as AtlasJson;
  const img = new Image();
  img.src = `${BASE}${json.image}`;
  await img.decode();
  return { json, img };
}
const frame = (s: Sheet | undefined, id: number): [number, number, number, number, number, number] | null => {
  const r = s?.json.frames[String(id)];
  return r ? [r[0], r[1], r[2], r[3], r[4] ?? 0, r[5] ?? 0] : null;
};

// --- state ---------------------------------------------------------------------------------------------------
let map: GameMap = parseMap(blankMapBody('Outside', 340));
let body: Uint8Array = blankMapBody('Outside', 340);
let mapName = 'new_map';
let mapId = '';
let tiles: Sheet | undefined;
let orient: Record<string, string> = {};
let packs: (Sheet | undefined)[] = [];
let tool: Tool = 'ground';
const brush: Brush = { size: 1, tile: 340, pack: 1, frame: 0, actor: 1, start: 100, script: undefined };
let zoom = 1, showGrid = false;
const cam = { x: 0, y: 0 };
let undo: { terrain: Uint16Array; objects: Uint32Array; markers: Marker[]; scripts: GameMap['scripts']; scriptAt: Int8Array }[] = [];
let dirty = false;
const names: Record<string, string> = {};
let actors: { id: number; name: string; npc: boolean }[] = [];

const snapshot = () => ({ terrain: map.terrain.slice(), objects: map.objects.slice(), markers: map.markers.map((m) => ({ ...m, route: m.route && m.route.map((c) => ({ ...c })) })), scripts: structuredClone(map.scripts), scriptAt: map.scriptAt.slice() });
function pushUndo(): void { undo.push(snapshot()); if (undo.length > 40) undo.shift(); }
function doUndo(): void {
  const s = undo.pop();
  if (!s) return;
  map.terrain = s.terrain; map.objects = s.objects; map.markers = s.markers; map.scripts = s.scripts; map.scriptAt = s.scriptAt;
  buildPanel();
  draw();
}

// --- loading ---------------------------------------------------------------------------------------------------
async function loadTileset(ts: string): Promise<void> {
  const k = ts.toLowerCase();
  orient = ((await fetch(`${BASE}data/tile_orient.json`).then((r) => (r.ok ? r.json() : {})).catch(() => ({}))) as Record<string, Record<string, string>>)[k] ?? {};
  [tiles, ...packs] = await Promise.all([
    sheet(`atlas/scenary/${k}/vtiles.json`),
    sheet(`p16/scenary/${k}/packcell.json`).catch(() => undefined),
    sheet(`p16/scenary/${k}/pack1.json`).catch(() => undefined),
    sheet(`p16/scenary/${k}/pack2.json`).catch(() => undefined),
    sheet(`p16/scenary/${k}/pack3.json`).catch(() => undefined),
  ]);
}

async function open(m: GameMap, b: Uint8Array, name: string, id = ''): Promise<void> {
  info.textContent = 'Loading…';
  map = m; body = b; mapName = name; mapId = id; undo = []; dirty = false;
  await loadTileset(m.tileset);
  brush.tile = [...Object.keys(tiles!.json.frames)].map(Number).includes(brush.tile) ? brush.tile : Number(Object.keys(tiles!.json.frames)[0]);
  const start = m.markers.find((k) => k.id >= 100) ?? { cx: 128, cy: 128 };
  cam.x = (start.cx - start.cy) * 32; cam.y = (start.cx + start.cy) * 16;
  buildPanel();
  draw();
  info.textContent = `${name}: ${m.markers.length} markers, ${m.scripts.length} scripts`;
}

async function openUrl(file: string, name: string, id = ''): Promise<void> {
  const b = await gunzip(await (await fetch(`${BASE}${file}`)).arrayBuffer());
  await open(parseMap(b), b, name, id);
}

async function openFile(f: File): Promise<void> {
  const raw = new Uint8Array(await f.arrayBuffer());
  const b = raw[0] === 0x1f && raw[1] === 0x8b ? await gunzip(raw) : raw;
  await open(parseMap(b), b, f.name.replace(/\.map$/i, ''));
}

// --- drawing ---------------------------------------------------------------------------------------------------
const sx = (cx: number, cy: number) => (cx - cy) * 32;
const sy = (cx: number, cy: number) => (cx + cy) * 16;

function resize(): void {
  const r = view.getBoundingClientRect();
  view.width = Math.max(1, Math.floor(r.width)); view.height = Math.max(1, Math.floor(r.height));
  draw();
}

function draw(): void {
  const W = view.width, H = view.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#05060a';
  ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = false;
  ctx.setTransform(zoom, 0, 0, zoom, W / 2 - cam.x * zoom, H / 2 - cam.y * zoom);
  // visible cell range: the screen rectangle (a little larger for tall scenery) mapped back to cells
  const x0 = cam.x - W / 2 / zoom - 80, x1 = cam.x + W / 2 / zoom + 80, y0 = cam.y - H / 2 / zoom - 40, y1 = cam.y + H / 2 / zoom + 300;
  const cell = (x: number, y: number) => { const a = x / 32, b = y / 16; return { cx: (a + b) / 2, cy: (b - a) / 2 }; };
  const cs = [cell(x0, y0), cell(x1, y0), cell(x0, y1), cell(x1, y1)];
  const cxMin = Math.max(0, Math.floor(Math.min(...cs.map((c) => c.cx)))), cxMax = Math.min(MAP_DIM - 1, Math.ceil(Math.max(...cs.map((c) => c.cx))));
  const cyMin = Math.max(0, Math.floor(Math.min(...cs.map((c) => c.cy)))), cyMax = Math.min(MAP_DIM - 1, Math.ceil(Math.max(...cs.map((c) => c.cy))));
  const inView = (cx: number, cy: number) => { const x = sx(cx, cy), y = sy(cx, cy); return x > x0 && x < x1 && y > y0 && y < y1; };
  // ground
  for (let cy = cyMin; cy <= cyMax; cy++) {
    for (let cx = cxMin; cx <= cxMax; cx++) {
      if (!inView(cx, cy)) continue;
      const t = map.terrain[cy * MAP_DIM + cx]!;
      const x = sx(cx, cy), y = sy(cx, cy);
      if (t === WATER_TILE) { ctx.fillStyle = '#1c3446'; ctx.beginPath(); ctx.moveTo(x - 32, y); ctx.lineTo(x, y - 16); ctx.lineTo(x + 32, y); ctx.lineTo(x, y + 16); ctx.fill(); continue; }
      const f = frame(tiles, t);
      if (f && tiles) {
        const fl = tileFlip(orient[t]);
        if (fl) { ctx.save(); ctx.translate(x, y); ctx.scale(fl & 1 ? -1 : 1, fl & 2 ? -1 : 1); ctx.drawImage(tiles.img, f[0], f[1], f[2], f[3], -32, -16, 64, 32); ctx.restore(); }
        else ctx.drawImage(tiles.img, f[0], f[1], f[2], f[3], x - 32, y - 16, 64, 32);
      }
    }
  }
  // scenery, back to front (painter's order along the diagonals)
  for (let d = cxMin + cyMin; d <= cxMax + cyMax; d++) {
    for (let cx = Math.max(cxMin, d - cyMax); cx <= Math.min(cxMax, d - cyMin); cx++) {
      const cy = d - cx;
      const o = map.objects[cy * MAP_DIM + cx]!;
      if (!o || !inView(cx, cy)) continue;
      const f = frame(packs[o >> 10], o & 1023);
      if (!f) continue;
      const sh = packs[o >> 10]!;
      const x = sx(cx, cy), y = sy(cx, cy);
      if (isSlabFrame(f[2], f[3], f[4], f[5])) ctx.drawImage(sh.img, f[0], f[1], f[2], f[3], x - f[2] / 2, y + 12 - f[3], f[2], f[3]);
      else ctx.drawImage(sh.img, f[0], f[1], f[2], f[3], x + f[4] + HOTSPOT_X, y + f[5] + HOTSPOT_Y, f[2], f[3]);
    }
  }
  // markers, script cells, grid
  ctx.font = '10px ui-monospace, monospace';
  ctx.textAlign = 'center';
  const diamond = (x: number, y: number, r: number) => { ctx.beginPath(); ctx.moveTo(x - 2 * r, y); ctx.lineTo(x, y - r); ctx.lineTo(x + 2 * r, y); ctx.lineTo(x, y + r); ctx.closePath(); };
  for (const m of map.markers) {
    if (!inView(m.cx, m.cy)) continue;
    const x = sx(m.cx, m.cy), y = sy(m.cx, m.cy);
    const start = m.id >= 100;
    const npc = actors.find((a) => a.id === m.id)?.npc;
    ctx.fillStyle = start ? '#4a7bd8aa' : npc ? '#3fae5faa' : '#d8453faa';
    diamond(x, y, 12); ctx.fill();
    ctx.strokeStyle = '#000'; ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.fillText(start ? (START_IDS as Record<number, string>)[m.id]?.[0] ?? String(m.id) : String(m.id), x, y + 3);
    if (m.route) {
      const sel = tool === 'route' && brush.routeOf?.cx === m.cx && brush.routeOf?.cy === m.cy;
      ctx.strokeStyle = sel ? '#ffd24a' : '#ffffff66'; ctx.lineWidth = sel ? 2 : 1;
      ctx.beginPath(); ctx.moveTo(x, y); for (const p of m.route) ctx.lineTo(sx(p.cx, p.cy), sy(p.cx, p.cy)); ctx.stroke(); ctx.lineWidth = 1;
      if (sel) { ctx.fillStyle = '#ffd24a'; m.route.forEach((p, i) => ctx.fillText(String(i + 1), sx(p.cx, p.cy), sy(p.cx, p.cy) + 3)); }
    }
  }
  for (let cy = cyMin; cy <= cyMax; cy++) {
    for (let cx = cxMin; cx <= cxMax; cx++) {
      if (!inView(cx, cy)) continue;
      const s = map.scriptAt[cy * MAP_DIM + cx]!;
      const x = sx(cx, cy), y = sy(cx, cy);
      if (s >= 0) { ctx.strokeStyle = tool === 'script' && s === brush.script ? '#ff7a3a' : '#e8c85a'; diamond(x, y, 6); ctx.stroke(); ctx.fillStyle = '#e8c85a'; ctx.fillText(String(s), x, y + 3); }
      if (showGrid && zoom >= 1) { ctx.strokeStyle = '#ffffff22'; diamond(x, y, 8); ctx.stroke(); }
    }
  }
  // brush footprint
  if (hover) {
    ctx.strokeStyle = '#ffd24a';
    for (const c of footprint(hover.cx, hover.cy)) { diamond(sx(c.cx, c.cy), sy(c.cx, c.cy), 8); ctx.stroke(); }
  }
}

// --- editing ---------------------------------------------------------------------------------------------------
let hover: { cx: number; cy: number } | null = null;
const footprint = (cx: number, cy: number): { cx: number; cy: number }[] => {
  const n = tool === 'ground' || tool === 'erase' ? brush.size : 1, out: { cx: number; cy: number }[] = [];
  const r0 = -Math.floor((n - 1) / 2);
  for (let dy = 0; dy < n; dy++) for (let dx = 0; dx < n; dx++) { const c = { cx: cx + r0 + dx, cy: cy + r0 + dy }; if (c.cx >= 0 && c.cy >= 0 && c.cx < MAP_DIM && c.cy < MAP_DIM) out.push(c); }
  return out;
};
const toCell = (e: PointerEvent | WheelEvent): { cx: number; cy: number } => {
  const r = view.getBoundingClientRect();
  const wx = (e.clientX - r.left - r.width / 2) / zoom + cam.x, wy = (e.clientY - r.top - r.height / 2) / zoom + cam.y;
  const a = wx / 32, b = wy / 16;
  return { cx: Math.round((a + b) / 2), cy: Math.round((b - a) / 2) };
};

let painting = false, panning: { x: number; y: number } | null = null, spaceDown = false;
view.addEventListener('contextmenu', (e) => e.preventDefault());
view.addEventListener('pointerdown', (e) => {
  view.setPointerCapture(e.pointerId);
  if (e.button === 2 || e.button === 1 || spaceDown) { panning = { x: e.clientX, y: e.clientY }; return; }
  const c = toCell(e);
  if (c.cx < 0 || c.cy < 0 || c.cx >= MAP_DIM || c.cy >= MAP_DIM) return;
  if (tool === 'pick') { pick(c.cx, c.cy); return; }
  pushUndo();
  painting = true;
  apply(c.cx, c.cy);
});
view.addEventListener('pointermove', (e) => {
  if (panning) { cam.x -= (e.clientX - panning.x) / zoom; cam.y -= (e.clientY - panning.y) / zoom; panning = { x: e.clientX, y: e.clientY }; draw(); return; }
  hover = toCell(e);
  if (painting) apply(hover.cx, hover.cy);
  else draw();
  info.textContent = `cell ${hover.cx},${hover.cy} · ${infoAt(hover.cx, hover.cy)}${dirty ? ' · unsaved changes' : ''}`;
});
view.addEventListener('pointerup', () => { painting = false; panning = null; });
view.addEventListener('pointerleave', () => { hover = null; draw(); });
view.addEventListener('wheel', (e) => { e.preventDefault(); cam.x += e.deltaX; cam.y += e.deltaY; draw(); }, { passive: false });

function infoAt(cx: number, cy: number): string {
  if (cx < 0 || cy < 0 || cx >= MAP_DIM || cy >= MAP_DIM) return '';
  const i = cy * MAP_DIM + cx, o = map.objects[i]!, m = map.markers.find((k) => k.cx === cx && k.cy === cy);
  return [`ground ${map.terrain[i]}`, o ? `scenery pack ${o >> 10} #${o & 1023}` : '', m ? `marker ${m.id} ${names[m.id] ?? ''}` : '', map.scriptAt[i]! >= 0 ? `script ${map.scriptAt[i]}` : ''].filter(Boolean).join(' · ');
}

function apply(cx: number, cy: number): void {
  dirty = true;
  applyBrush(map, tool, brush, cx, cy);
  draw();
}

function pick(cx: number, cy: number): void {
  const i = cy * MAP_DIM + cx, o = map.objects[i]!;
  const m = map.markers.find((k) => k.cx === cx && k.cy === cy);
  if (map.scriptAt[i]! >= 0 && !m && !o) { brush.script = map.scriptAt[i]; setTool('script'); return; }
  if (m) { if (m.id >= 100) { brush.start = m.id; setTool('start'); } else { brush.actor = m.id; setTool('actor'); } }
  else if (o) { brush.pack = o >> 10; brush.frame = o & 1023; setTool('scenery'); }
  else { brush.tile = map.terrain[i]!; setTool('ground'); }
}

window.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).tagName === 'SELECT' || (e.target as HTMLElement).tagName === 'INPUT') return;
  if (e.key === ' ') { spaceDown = true; e.preventDefault(); }
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'z') { doUndo(); e.preventDefault(); }
  else if (k === 'g') { showGrid = !showGrid; draw(); }
  else if (k.startsWith('arrow')) { const s = 64 / zoom; if (k === 'arrowleft') cam.x -= s; if (k === 'arrowright') cam.x += s; if (k === 'arrowup') cam.y -= s; if (k === 'arrowdown') cam.y += s; draw(); e.preventDefault(); }
});
window.addEventListener('keyup', (e) => { if (e.key === ' ') spaceDown = false; });
window.addEventListener('resize', resize);
window.addEventListener('beforeunload', (e) => { if (dirty) e.preventDefault(); });

// --- side panel ---------------------------------------------------------------------------------------------------
const TOOLS: [Tool, string][] = [['ground', 'Ground'], ['scenery', 'Scenery'], ['actor', 'Monster / NPC'], ['start', 'Hero start'], ['script', 'Script'], ['route', 'Patrol route'], ['erase', 'Erase'], ['pick', 'Pick']];
function setTool(t: Tool): void { tool = t; buildPanel(); draw(); }

const mk = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '', on?: () => void): HTMLElementTagNameMap[K] => {
  const el = document.createElement(tag);
  if (text) el.textContent = text;
  if (on) el.addEventListener('click', on);
  return el;
};
const thumb = (s: Sheet, id: number, w: number, h: number): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const f = frame(s, id)!;
  const k = Math.min(w / f[2], h / f[3], 1);
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.drawImage(s.img, f[0], f[1], f[2], f[3], (w - f[2] * k) / 2, (h - f[3] * k) / 2, f[2] * k, f[3] * k);
  return c;
};

function buildPanel(): void {
  side.replaceChildren();
  const h = (t: string) => side.appendChild(mk('h3', t));
  const row = () => side.appendChild(Object.assign(document.createElement('div'), { className: 'row' }));

  h('Map');
  let r = row();
  const sel = mk('select');
  for (const m of MAPS) sel.add(new Option(`${m.group}: ${m.name}`, m.id));
  sel.value = mapId || sel.value; sel.style.maxWidth = '180px';
  r.append(sel, mk('button', 'Load', () => { const m = findMap(sel.value); if (m) void openUrl(m.file, m.id.replace(/\W+/g, '_'), m.id); }));
  r = row();
  const ts = mk('select');
  for (const t of ['Outside', 'Cave', 'Dungeon']) ts.add(new Option(t));
  ts.value = map.tileset.charAt(0).toUpperCase() + map.tileset.slice(1).toLowerCase();
  r.append(ts, mk('button', 'New map', () => {
    void (async () => {
      await loadTileset(ts.value);
      const ids = Object.keys(tiles!.json.frames).map(Number).filter((k) => k > 0 && k < 500).sort((a, b) => a - b);
      const first = ids.includes(340) ? 340 : ids[0] ?? 1; // (tile 0 is the void)
      const b = blankMapBody(ts.value, first);
      brush.tile = first;
      await open(parseMap(b), b, 'new_map');
    })();
  }));
  r = row();
  const file = mk('input'); file.type = 'file'; file.accept = '.map'; file.style.width = '150px';
  file.addEventListener('change', () => { if (file.files?.[0]) void openFile(file.files[0]); });
  r.append(file);
  r = row();
  const cls = mk('select');
  for (const [v, n] of [['barbarian', 'Barbarian'], ['amazon', 'Amazon'], ['sorceress', 'Sorceress']]) cls.add(new Option(n, v));
  r.append(
    mk('button', 'Save .map', () => void save()),
    mk('button', 'Play', () => void play(cls.value)), cls,
  );
  side.appendChild(mk('small', `${map.tileset} · ${mapName}`));

  h('Tool');
  r = row();
  for (const [t, label] of TOOLS) { const b = mk('button', label, () => setTool(t)); if (t === tool) b.className = 'on'; r.append(b); }
  if (tool === 'ground' || tool === 'erase') {
    r = row();
    r.append(mk('span', 'Brush'));
    for (const n of [1, 2, 3, 5]) { const b = mk('button', `${n}×${n}`, () => { brush.size = n; buildPanel(); }); if (n === brush.size) b.className = 'on'; r.append(b); }
  }
  r = row();
  r.append(mk('button', 'Undo (Ctrl+Z)', doUndo), mk('button', 'Grid (G)', () => { showGrid = !showGrid; draw(); }), mk('button', 'Zoom ×½ / ×1', () => { zoom = zoom === 1 ? 0.5 : 1; draw(); }));
  side.appendChild(mk('small', 'Left drag: apply · right drag / space+drag / arrows: scroll'));

  const pal = document.createElement('div');
  pal.id = 'pal';
  if (tool === 'ground' && tiles) {
    h('Ground tiles');
    const water = mk('button', 'Water', () => { brush.tile = WATER_TILE; buildPanel(); });
    const none = mk('button', 'Void', () => { brush.tile = 0; buildPanel(); });
    r = row(); r.append(water, none);
    for (const k of Object.keys(tiles.json.frames).map(Number).sort((a, b) => a - b)) {
      const c = thumb(tiles, k, 40, 24);
      c.title = String(k);
      if (k === brush.tile) c.className = 'sel';
      c.addEventListener('click', () => { brush.tile = k; buildPanel(); });
      pal.appendChild(c);
    }
    side.appendChild(pal);
  } else if (tool === 'scenery') {
    h('Scenery');
    r = row();
    for (const p of [1, 2, 3]) { const b = mk('button', `Pack ${p}`, () => { brush.pack = p; buildPanel(); }); if (p === brush.pack) b.className = 'on'; if (packs[p]) r.append(b); }
    const s = packs[brush.pack];
    if (s) {
      for (const k of Object.keys(s.json.frames).map(Number).sort((a, b) => a - b)) {
        const c = thumb(s, k, 44, 44);
        c.title = `${brush.pack}:${k}`;
        if (k === brush.frame) c.className = 'sel';
        c.addEventListener('click', () => { brush.frame = k; buildPanel(); });
        pal.appendChild(c);
      }
      side.appendChild(pal);
    }
  } else if (tool === 'actor') {
    h('Monster / NPC');
    const a = mk('select');
    for (const x of actors) a.add(new Option(`${x.id} ${x.name}${x.npc ? ' (NPC)' : ''}`, String(x.id)));
    a.value = String(brush.actor);
    a.addEventListener('change', () => { brush.actor = Number(a.value); });
    row().append(a);
    side.appendChild(mk('small', 'Click a cell to place it; click another to move on. Existing routes are kept.'));
  } else if (tool === 'start') {
    h('Hero start');
    r = row();
    for (const [id, n] of Object.entries(START_IDS)) { const b = mk('button', n, () => { brush.start = Number(id); buildPanel(); }); if (Number(id) === brush.start) b.className = 'on'; r.append(b); }
  }
  if (tool === 'route') {
    h('Patrol route');
    const m = brush.routeOf && map.markers.find((k) => k.cx === brush.routeOf!.cx && k.cy === brush.routeOf!.cy);
    side.appendChild(mk('small', m ? `Monster ${m.id} ${names[m.id] ?? ''} at ${m.cx},${m.cy}: ${m.route?.length ?? 0} of ${MAX_ROUTE} cells. Click cells to add them in order.` : 'Click a monster to pick it, then click the cells it should walk through, in order.'));
    if (m) row().append(mk('button', 'Clear route', () => { pushUndo(); clearRoute(map, m.cx, m.cy); dirty = true; buildPanel(); draw(); }));
  }
  if (tool === 'script') scriptPanel(h, row);
  h('About');
  side.appendChild(mk('small', 'Scripts are the yellow numbers (the selected one orange); patrol routes are the white lines (Patrol route tool: pick a monster, click cells). Save downloads a .map the game reads (Select map on the title menu plays the shipped ones; Play here tries yours).'));
  side.appendChild(document.createElement('br'));
  const back = mk('a', '← game'); back.href = './index.html';
  side.appendChild(back);
}

async function save(): Promise<void> {
  const gz = await gzip(writeMapBody(map, body));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([gz as BlobPart], { type: 'application/octet-stream' }));
  a.download = `${mapName}.map`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  dirty = false;
}

async function play(cls: string): Promise<void> {
  const gz = await gzip(writeMapBody(map, body));
  let bin = '';
  for (let i = 0; i < gz.length; i += 0x8000) bin += String.fromCharCode(...gz.subarray(i, i + 0x8000));
  try { sessionStorage.setItem('nst-editmap', btoa(bin)); } catch { info.textContent = 'The browser would not keep the map for the game; use Save .map instead.'; return; }
  dirty = false;
  location.href = `./index.html?class=${cls}&edited=1`;
}

// --- start ---------------------------------------------------------------------------------------------------
void (async () => {
  const idioma = (await (await fetch(`${BASE}text/idioma.json`)).json()) as Record<string, string>;
  applyCampaignNames(idioma);
  for (const [k, v] of Object.entries(idioma)) { const m = /^ACTORS\\ID-(\d+)$/.exec(k); if (m) names[m[1]!] = v; }
  const anims = (await (await fetch(`${BASE}data/anims.json`)).json()) as { actors: Record<string, { npc?: boolean }> };
  actors = Object.keys(anims.actors).map(Number).filter((n) => n < 100).sort((a, b) => a - b).map((id) => ({ id, name: names[id] ?? `Actor ${id}`, npc: !!anims.actors[id]?.npc }));
  resize();
  const wanted = new URLSearchParams(location.search).get('map');
  const m = findMap(wanted ?? 'nhs/1');
  if (m) await openUrl(m.file, m.id.replace(/\W+/g, '_'), m.id);
  else await open(map, body, mapName);
})();

// --- scripts ---------------------------------------------------------------------------------------------------
/** The Script tool: pick or create a script, edit its name and commands, then click cells to put it there (Erase takes it off). */
function scriptPanel(h: (t: string) => unknown, row: () => HTMLElement): void {
  h('Scripts');
  if (!map.scripts.some((x) => x.index === brush.script) && map.scripts.length) brush.script = map.scripts[0]!.index;
  const sc = map.scripts.find((x) => x.index === brush.script);
  let r = row();
  const sel = mk('select');
  for (const x of map.scripts) sel.add(new Option(`${x.index}: ${x.name.replace(/[^\x20-\x7e]/g, '') || x.commands.map((c) => COMMANDS.find((k) => k.id === c.id)?.label ?? `#${c.id}`).join(', ')}`, String(x.index)));
  if (sc) sel.value = String(sc.index);
  sel.style.maxWidth = '170px';
  sel.addEventListener('change', () => { brush.script = Number(sel.value); buildPanel(); draw(); });
  r.append(sel, mk('button', 'New', () => { pushUndo(); const n = newScript(map); if (n) brush.script = n.index; dirty = true; buildPanel(); draw(); }));
  if (!sc) { side.appendChild(mk('small', 'No scripts yet. New adds one.')); return; }
  r.append(mk('button', 'Delete', () => { pushUndo(); deleteScript(map, sc.index); brush.script = undefined; dirty = true; buildPanel(); draw(); }));
  r = row();
  const name = mk('input'); name.value = sc.name; name.placeholder = 'name (optional)'; name.maxLength = 50; name.style.width = '200px';
  name.addEventListener('change', () => { pushUndo(); sc.name = name.value; dirty = true; buildPanel(); });
  r.append(name);
  sc.commands.forEach((c, ci) => {
    const box = row();
    box.style.cssText += ';border:1px solid #333;padding:3px';
    const kind = mk('select');
    for (const k of COMMANDS) kind.add(new Option(`${k.id} ${k.label}`, String(k.id)));
    if (!COMMANDS.some((k) => k.id === c.id)) kind.add(new Option(`${c.id} (unknown)`, String(c.id)));
    kind.value = String(c.id);
    kind.style.maxWidth = '200px';
    kind.addEventListener('change', () => { pushUndo(); sc.commands[ci] = blankCommand(Number(kind.value)); dirty = true; buildPanel(); });
    box.append(kind, mk('button', '×', () => { pushUndo(); sc.commands.splice(ci, 1); dirty = true; buildPanel(); }));
    const def = COMMANDS.find((k) => k.id === c.id);
    (def ? def.args : ['a0', 'a1', 'a2', 'a3']).forEach((label, ai) => {
      const inp = mk('input'); inp.type = 'number'; inp.value = String(c.args[ai]); inp.style.width = '64px'; inp.title = label; inp.placeholder = label;
      inp.addEventListener('change', () => { pushUndo(); c.args[ai] = Math.max(0, Math.floor(Number(inp.value) || 0)); dirty = true; });
      box.append(mk('small', label), inp);
    });
  });
  r = row();
  if (sc.commands.length < 8) r.append(mk('button', '+ command', () => { pushUndo(); sc.commands.push(blankCommand(12)); dirty = true; buildPanel(); }));
  side.appendChild(mk('small', 'Click cells to put this script there. Chests and barrels use "Roll loot" / "Drop item"; other scripts run when the hero walks onto the cell.'));
}
