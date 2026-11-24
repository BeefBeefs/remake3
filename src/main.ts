import * as THREE from 'three';
import { Atlas } from './assets/atlas.ts';
import { World } from './game/world.ts';
import { Game, type GameData } from './game/game.ts';
import type { AnimData } from './game/anims.ts';
import { buildItems } from './game/items.ts';
import { InventoryPanel } from './ui/inventory.ts';
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
  const adv = (await (await fetch(`${BASE}data/adventure.json`)).json()) as { mission_text: string; heroes: { strength: number; skill: number; resistance: number; magic: number }[] };
  // Hero + every monster kind the map places (pack-0 markers).
  const spawns = map.markers.filter((m) => animData.actors[String(m.id)] && m.id < 100).map((m) => ({ id: String(m.id), cx: m.cx, cy: m.cy }));
  const atlases = new Map<string, Atlas>();
  await Promise.all(['100', ...new Set(spawns.map((s) => s.id))].map(async (id) => {
    const pack = animData.actors[id]!.pack;
    if (!atlases.has(pack)) atlases.set(pack, await Atlas.load(BASE, `p16/actors/${pack.toLowerCase()}.json`));
  }));

  // The Barbarian start marker (id 100) of the map; fall back to the old camp guess for maps without one.
  const st = startOf(map, 100);
  const spawn = world.findOpenCell(st?.cx ?? 152, st?.cy ?? 78);
  const game = new Game(world, { anims: animData, actors: actorsIni, names, atlases, items, icons }, spawn, { spawns, attrs: adv.heroes[0] });
  game.say(adv.mission_text);
  const panel = new InventoryPanel(game, icons, BASE);
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
  let held = false;
  let last: { cx: number; cy: number } | null = null;
  canvas.addEventListener('pointerdown', (e) => { held = true; last = pointerToCell(e); game.click(last.cx, last.cy); startAudio(); });
  canvas.addEventListener('pointermove', (e) => { last = pointerToCell(e); if (held) game.click(last.cx, last.cy); });
  window.addEventListener('pointerup', () => { held = false; });

  // Keyboard: arrows/WASD move along the screen axes (up = towards the top of the screen); space swings.
  const keys = new Set<string>();
  window.addEventListener('keydown', (e) => {
    keys.add(e.key.toLowerCase());
    if (e.key === ' ') { game.swing(); e.preventDefault(); }
    if (e.key.toLowerCase() === 'i') panel.toggle();
    if (e.key.toLowerCase() === 'r' && !game.hero.alive) location.reload();
    startAudio();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

  let audioOn = false;
  function startAudio() {
    if (audioOn) return;
    audioOn = true;
    const music = new Audio(`${BASE}audio/system/outside.ogg`); music.loop = true; music.volume = 0.35;
    const wind = new Audio(`${BASE}audio/gdi/audio/ambsounds/05_viento2.ogg`); wind.loop = true; wind.volume = 0.4;
    void music.play().catch(() => undefined);
    void wind.play().catch(() => undefined);
  }

  // HUD: hero health bar + kill counter (plain DOM over the canvas)
  const bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;left:8px;top:8px;font:12px ui-monospace,Menlo,monospace;color:#e9dfb8;text-shadow:0 1px 2px #000;pointer-events:none';
  bar.innerHTML = '<div id="hpname"></div><div style="width:180px;height:10px;background:#2a0d0d;border:1px solid #000"><div id="hpfill" style="height:100%;background:#b32020"></div></div><div id="hpinfo"></div>';
  document.body.appendChild(bar);
  const hpname = bar.querySelector('#hpname') as HTMLDivElement, hpfill = bar.querySelector('#hpfill') as HTMLDivElement, hpinfo = bar.querySelector('#hpinfo') as HTMLDivElement;
  const banner = document.createElement('div');
  banner.style.cssText = 'position:fixed;left:0;right:0;top:40%;text-align:center;font:24px ui-monospace,Menlo,monospace;color:#e9c27a;text-shadow:0 2px 4px #000;pointer-events:none;display:none';
  document.body.appendChild(banner);

  const clock = new THREE.Clock();
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
    game.update(dt, move);
    panel.update();
    world.update(hero.cx, hero.cy);
    const w = cellToWorld(hero.cx, hero.cy);
    camera.position.x += (w.x - camera.position.x) * Math.min(1, dt * 6);
    camera.position.y += (w.y - camera.position.y) * Math.min(1, dt * 6);
    hpname.textContent = hero.stats.name;
    hpfill.style.width = `${(100 * hero.hp) / hero.stats.hp}%`;
    hpinfo.textContent = `HP ${hero.hp}/${hero.stats.hp}  gold ${game.inventory.gold}  kills ${game.kills}  xp ${game.xp}`;
    const left = game.monsters.filter((m) => m.alive).length;
    banner.style.display = !hero.alive || left === 0 ? 'block' : 'none';
    banner.textContent = !hero.alive ? 'You have fallen — press R to restart' : 'The camp is clear!';
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  hud.textContent = 'NightStone remake · milestone 2 · click ground to walk, click a monster (or Space) to fight · WASD moves · I inventory';
  frame();
}

boot().catch((err) => { hud.textContent = `Failed to start: ${String(err)}`; console.error(err); });
