import * as THREE from 'three';
import { Atlas } from './assets/atlas.ts';
import { World } from './game/world.ts';
import { Sfx } from './audio/sfx.ts';
import { surfaceLookup, type TileTable } from './game/surface.ts';
import { CLASSES, MERCHANTS, type ClassId, Game, type GameData, type HeroSave } from './game/game.ts';
import type { AnimData } from './game/anims.ts';
import { buildItems } from './game/items.ts';
import { InventoryPanel } from './ui/inventory.ts';
import { ShopWindow } from './ui/shop.ts';
import { CharacterPanel } from './ui/character.ts';
import { gunzip, parseMap, startOf } from './formats/map.ts';
import { cellToWorld, worldToCell } from './iso.ts';

const BASE = `${import.meta.env.BASE_URL}assets/`;
const VIEW_H = 480; // the original ran at 640x480; we keep that logical height and scale to the window

const canvas = document.getElementById('game') as HTMLCanvasElement;
const hud = document.getElementById('hud') as HTMLDivElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060a);
const camera = new THREE.OrthographicCamera(-320, 320, VIEW_H / 2, -VIEW_H / 2, 0.1, 3000);
camera.position.z = 1500;

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  const halfH = VIEW_H / 2, halfW = halfH * (w / h);
  camera.left = -halfW; camera.right = halfW; camera.top = halfH; camera.bottom = -halfH;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

async function boot() {
  hud.textContent = 'Loading original map and sprite data…';
  const [tiles, packCell, pack1, pack2, pack3, mapBytes] = await Promise.all([
    Atlas.load(BASE, 'atlas/scenary/outside/vtiles.json'),
    Atlas.load(BASE, 'p16/scenary/outside/packcell.json'),
    Atlas.load(BASE, 'p16/scenary/outside/pack1.json'),
    Atlas.load(BASE, 'p16/scenary/outside/pack2.json'),
    Atlas.load(BASE, 'p16/scenary/outside/pack3.json'),
    fetch(`${BASE}maps/lost_forrest.map`).then((r) => r.arrayBuffer()).then(gunzip),
  ]);
  const map = parseMap(mapBytes);
  const world = new World(map, tiles, [packCell, pack1, pack2, pack3]);
  scene.add(world.group);

  const animData = (await (await fetch(`${BASE}data/anims.json`)).json()) as AnimData;
  const actorsIni = (await (await fetch(`${BASE}data/actors.json`)).json()) as GameData['actors'];
  const names: Record<string, string> = {};
  const itemNames: Record<string, string> = {};
  for (const [k, v] of Object.entries((await (await fetch(`${BASE}text/idioma.json`)).json()) as Record<string, string>)) {
    const m = /^(ACTORS|ITEMS)\\ID-(\d+)$/.exec(k);
    if (m) (m[1] === 'ACTORS' ? names : itemNames)[m[2]!] = v;
  }
  const items = buildItems((await (await fetch(`${BASE}data/items.json`)).json()) as Parameters<typeof buildItems>[0], itemNames);
  const icons = await Atlas.load(BASE, 'atlas/system/ilistdata.json');
  const adv = (await (await fetch(`${BASE}data/adventure.json`)).json()) as { mission_text: string; final: string; heroes: { strength: number; skill: number; resistance: number; magic: number }[] };
  // Which hero? ?class=amazon skips the menu.
  const byName: Record<string, ClassId> = { barbarian: 100, amazon: 101, sorceress: 102 };
  // After dying, R comes back here with the hero's growth (items and ability points already paid for) in sessionStorage.
  let carried: { classId: ClassId; save: HeroSave } | null = null;
  try {
    const raw = sessionStorage.getItem('nst-save');
    sessionStorage.removeItem('nst-save');
    if (raw) carried = JSON.parse(raw) as { classId: ClassId; save: HeroSave };
  } catch { /* storage unavailable: start fresh */ }
  const classId: ClassId = carried?.classId ?? byName[new URLSearchParams(location.search).get('class')?.toLowerCase() ?? ''] ?? (await chooseClass(adv.heroes));
  // Hero + every monster kind the map places (pack-0 markers).
  const spawns = map.markers.filter((m) => animData.actors[String(m.id)] && m.id < 100).map((m) => ({ id: String(m.id), cx: m.cx, cy: m.cy, route: m.route }));
  // ?npc=27,28 puts those NPCs next to the start (the Lost Forrest has none; the Inn map is not in this install).
  const extraNpcs = (new URLSearchParams(location.search).get('npc') ?? '').split(',').filter((id) => animData.actors[id]?.npc);
  const atlases = new Map<string, Atlas>();
  await Promise.all([String(classId), ...extraNpcs, ...new Set(spawns.map((s) => s.id))].map(async (id) => {
    const pack = animData.actors[id]!.pack;
    if (!atlases.has(pack)) atlases.set(pack, await Atlas.load(BASE, `p16/actors/${pack.toLowerCase()}.json`));
  }));

  // The chosen hero's start marker (100 Barbarian, 101 Amazon, 102 Sorceress) of the map; fall back to the old camp guess for maps without one.
  const st = startOf(map, classId);
  const spawn = world.findOpenCell(st?.cx ?? 152, st?.cy ?? 78);
  const tileSurface = surfaceLookup((await (await fetch(`${BASE}data/tiles.json`)).json()) as TileTable, map.tileset);
  const surface = (cx: number, cy: number) => (map.terrain[Math.floor(cy) * map.dim + Math.floor(cx)] !== undefined ? tileSurface(map.terrain[Math.floor(cy) * map.dim + Math.floor(cx)]!) : 'grass');
  const npcSpawns = extraNpcs.map((id, k) => { const c = world.findOpenCell(spawn.cx + 3 + 2 * k, spawn.cy + 2); return { id, cx: c.cx, cy: c.cy }; });
  const game = new Game(world, { anims: animData, actors: actorsIni, names, atlases, items, icons }, spawn, { spawns: [...spawns, ...npcSpawns], surface, attrs: adv.heroes[classId - 100], classId, save: carried?.save, finalText: adv.final.startsWith('Enter the final text') ? 'You have found the Tomb of Donmir!' : adv.final });
  game.say(adv.mission_text);
  const panel = new InventoryPanel(game, icons, BASE);
  const shop = new ShopWindow(game, icons, BASE);
  const charPanel = new CharacterPanel(game);
  game.onTalk = (npc) => { if (MERCHANTS.has(npc.id)) shop.open(npc.name); };
  scene.add(game.group);
  const hero = game.hero;
  world.update(hero.cx, hero.cy);
  const startW = cellToWorld(hero.cx, hero.cy);
  camera.position.x = startW.x; camera.position.y = startW.y;
  const pointerToCell = (ev: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    const nx = (ev.clientX - r.left) / r.width, ny = (ev.clientY - r.top) / r.height;
    const wx = camera.left + nx * (camera.right - camera.left) + camera.position.x;
    const wy = camera.top - ny * (camera.top - camera.bottom) + camera.position.y;
    return worldToCell(wx, wy);
  };
  // Ctrl = run, Shift = stealth (manual); read from every mouse and key event.
  const mods = { ctrl: false, shift: false };
  const readMods = (e: { ctrlKey: boolean; shiftKey: boolean }) => { mods.ctrl = e.ctrlKey; mods.shift = e.shiftKey; };
  window.addEventListener('blur', () => { mods.ctrl = false; mods.shift = false; });
  let held = false;
  let last: { cx: number; cy: number } | null = null;
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    readMods(e);
    startAudio();
    if (e.button === 2) { game.setGuard(true); return; } // right button: Barbarian blocks, others hold position
    held = true; last = pointerToCell(e); game.click(last.cx, last.cy);
  });
  canvas.addEventListener('pointermove', (e) => { readMods(e); last = pointerToCell(e); if (held && !game.holding) game.click(last.cx, last.cy); });
  window.addEventListener('pointerup', (e) => { if (e.button === 2) game.setGuard(false); else held = false; });

  // Keyboard: arrows/WASD move along the screen axes (up = towards the top of the screen); space swings.
  const keys = new Set<string>();
  window.addEventListener('keydown', (e) => {
    readMods(e);
    keys.add(e.key.toLowerCase());
    if (e.key === 'Escape') shop.close();
    if (e.key === ' ') { if (!shop.isOpen) game.swing(); e.preventDefault(); }
    if (e.key >= '1' && e.key <= '4' && !shop.isOpen) game.useQuick(Number(e.key));
    if (e.key.toLowerCase() === 'i') panel.toggle();
    if (e.key.toLowerCase() === 'c') charPanel.toggle();
    if (e.key.toLowerCase() === 'r' && !game.hero.alive) {
      try { sessionStorage.setItem('nst-save', JSON.stringify({ classId: game.classId, save: game.save() })); } catch { /* start fresh */ }
      location.reload();
    }
    startAudio();
  });
  window.addEventListener('keyup', (e) => { readMods(e); keys.delete(e.key.toLowerCase()); });

  const sfx = new Sfx(BASE, (await (await fetch(`${BASE}data/sfx.json`)).json()) as Record<string, string>);
  game.onSound = (id) => sfx.play(id);
  let audioOn = false;
  function startAudio() {
    if (audioOn) return;
    audioOn = true;
    sfx.enabled = true;
    const music = new Audio(`${BASE}audio/system/outside.ogg`); music.loop = true; music.volume = 0.35;
    const wind = new Audio(`${BASE}audio/gdi/audio/ambsounds/05_viento2.ogg`); wind.loop = true; wind.volume = 0.4;
    void music.play().catch(() => undefined);
    void wind.play().catch(() => undefined);
  }

  // HUD: hero health bar + kill counter (plain DOM over the canvas)
  const bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;left:8px;top:8px;font:12px ui-monospace,Menlo,monospace;color:#e9dfb8;text-shadow:0 1px 2px #000;pointer-events:none';
  bar.innerHTML = '<div id="hpname"></div><div style="width:180px;height:10px;background:#2a0d0d;border:1px solid #000"><div id="hpfill" style="height:100%;background:#b32020"></div></div><div style="width:180px;height:6px;margin-top:2px;background:#1d2a0d;border:1px solid #000"><div id="stfill" style="height:100%;background:#9ab32a"></div></div><div style="width:180px;height:6px;margin-top:2px;background:#0d1a2a;border:1px solid #000"><div id="mpfill" style="height:100%;background:#2a5cb3"></div></div><div id="hpinfo"></div>';
  document.body.appendChild(bar);
  const hpname = bar.querySelector('#hpname') as HTMLDivElement, hpfill = bar.querySelector('#hpfill') as HTMLDivElement, hpinfo = bar.querySelector('#hpinfo') as HTMLDivElement;
  const stfill = bar.querySelector('#stfill') as HTMLDivElement, mpfill = bar.querySelector('#mpfill') as HTMLDivElement;
  const banner = document.createElement('div');
  banner.style.cssText = 'position:fixed;left:0;right:0;top:40%;text-align:center;font:24px ui-monospace,Menlo,monospace;color:#e9c27a;text-shadow:0 2px 4px #000;pointer-events:none;display:none';
  document.body.appendChild(banner);

  const clock = new THREE.Clock();
  let won = false;
  function frame() {
    const dt = Math.min(clock.getDelta(), 0.1);
    let dx = 0, dy = 0; // screen-space direction
    if (keys.has('arrowleft') || keys.has('a')) dx -= 1;
    if (keys.has('arrowright') || keys.has('d')) dx += 1;
    if (keys.has('arrowup') || keys.has('w')) dy += 1;
    if (keys.has('arrowdown') || keys.has('s')) dy -= 1;
    let move: { x: number; y: number } | null = null;
    if (dx || dy) {
      const c = worldToCell(dx * 32, dy * 16); // one screen unit expressed in cell space
      const l = Math.hypot(c.cx, c.cy) || 1;
      move = { x: c.cx / l, y: c.cy / l };
    }
    game.setStance(mods.ctrl, mods.shift);
    game.update(dt, move);
    panel.update();
    charPanel.update();
    world.update(hero.cx, hero.cy);
    const w = cellToWorld(hero.cx, hero.cy);
    camera.position.x += (w.x - camera.position.x) * Math.min(1, dt * 6);
    camera.position.y += (w.y - camera.position.y) * Math.min(1, dt * 6);
    hpname.textContent = hero.stats.name;
    hpfill.style.width = `${(100 * hero.hp) / hero.stats.hp}%`;
    stfill.style.width = `${(100 * game.stamina) / game.maxStamina}%`;
    mpfill.style.width = `${(100 * game.mana) / game.maxMana}%`;
    hpinfo.textContent = `HP ${hero.hp}/${hero.stats.hp}  gold ${game.inventory.gold}  kills ${game.kills}  xp ${game.xp}  L${game.level}${game.points ? `  +${game.points} points (C)` : ''}`;
    const left = game.monsters.filter((m) => m.alive).length;
    banner.style.display = !hero.alive || left === 0 ? 'block' : 'none';
    banner.textContent = !hero.alive ? 'You have fallen — press R to try again (items and one point of each ability are lost)' : 'The camp is clear!';
    if (game.goalReached && !won) { won = true; showVictory(game, hero.stats.name); }
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  hud.textContent = 'NightStone remake · milestone 2 · click ground to walk, click a monster (or Space) to fight · WASD moves · Ctrl run · Shift stealth · right button block / hold · I inventory · C character';
  frame();
}

boot().catch((err) => { hud.textContent = `Failed to start: ${String(err)}`; console.error(err); });

/** Plain-DOM hero selection shown before the game starts. */
function chooseClass(heroes: { strength: number; skill: number; resistance: number; magic: number }[]): Promise<ClassId> {
  return new Promise((resolve) => {
    const root = document.createElement('div');
    root.style.cssText = 'position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:rgba(10,7,4,.94);color:#e9dfb8;font:14px ui-monospace,Menlo,monospace;z-index:10';
    root.innerHTML = '<div style="font-size:22px;letter-spacing:2px">NIGHTSTONE</div><div>Choose your hero</div>';
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:12px;flex-wrap:wrap;justify-content:center';
    for (const id of [100, 101, 102] as const) {
      const h = heroes[id - 100]!;
      const b = document.createElement('button');
      b.style.cssText = 'width:170px;padding:12px;background:#241a0e;color:#e9dfb8;border:2px solid #6b5426;font:inherit;cursor:pointer;line-height:1.6';
      b.innerHTML = `<b>${CLASSES[id].name}</b><br>STR ${h.strength} · SKL ${h.skill}<br>RES ${h.resistance} · MAG ${h.magic}`;
      b.onclick = () => { root.remove(); resolve(id); };
      row.appendChild(b);
    }
    root.appendChild(row);
    document.body.appendChild(root);
  });
}

/** End-of-quest card shown when the hero reaches the tomb. */
function showVictory(game: Game, name: string): void {
  const root = document.createElement('div');
  root.style.cssText = 'position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:rgba(10,7,4,.88);color:#e9dfb8;font:15px ui-monospace,Menlo,monospace;z-index:10;text-align:center;padding:24px';
  const text = document.createElement('div');
  text.style.cssText = 'max-width:520px;line-height:1.6;white-space:pre-wrap';
  text.textContent = `QUEST COMPLETE\n\n${game.log.at(-1) ?? ''}\n\n${name} · level ${game.level} · ${game.kills} kills · ${game.xp} xp · ${game.inventory.gold} gold`;
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:10px';
  for (const [label, fn] of [['Keep exploring', () => root.remove()], ['New game', () => location.reload()]] as const) {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'padding:8px 16px;background:#241a0e;color:#e9dfb8;border:2px solid #6b5426;font:inherit;cursor:pointer';
    b.onclick = fn;
    row.appendChild(b);
  }
  root.append(text, row);
  document.body.appendChild(root);
}
