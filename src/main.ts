import * as THREE from 'three';
import { Atlas } from './assets/atlas.ts';
import { World } from './game/world.ts';
import { ActorSprite, screenDir } from './game/actor.ts';
import { gunzip, parseMap } from './formats/map.ts';
import { cellToWorld, worldToCell, depthOf } from './iso.ts';

const BASE = `${import.meta.env.BASE_URL}assets/`;
const VIEW_H = 480; // the original ran at 640x480; we keep that logical height and scale to the window
const SPEED = 3.2; // cells per second

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
  const [tiles, packCell, pack1, pack2, pack3, barbarian, mapBytes] = await Promise.all([
    Atlas.load(BASE, 'atlas/scenary/outside/vtiles.json'),
    Atlas.load(BASE, 'p16/scenary/outside/packcell.json'),
    Atlas.load(BASE, 'p16/scenary/outside/pack1.json'),
    Atlas.load(BASE, 'p16/scenary/outside/pack2.json'),
    Atlas.load(BASE, 'p16/scenary/outside/pack3.json'),
    Atlas.load(BASE, 'p16/actors/barbarian0.json'),
    fetch(`${BASE}maps/lost_forrest.map`).then((r) => r.arrayBuffer()).then(gunzip),
  ]);
  const map = parseMap(mapBytes);
  const world = new World(map, tiles, [packCell, pack1, pack2, pack3]);
  scene.add(world.group);

  // The Barbarian walk cycle: 8 directions x 12 frames (P16 ids 1..96).
  const hero = new ActorSprite(barbarian);
  let heroDir = 5; // facing the camera (S)
  hero.setWalkFrame(heroDir, 0);
  scene.add(hero);

  // Start in the camp area of the map (the real spawn point lives in the adventure file, not decoded yet).
  const spawn = world.findOpenCell(152, 78);
  const pos = { cx: spawn.cx, cy: spawn.cy };
  world.update(pos.cx, pos.cy);
  const startW = cellToWorld(pos.cx, pos.cy);
  camera.position.x = startW.x; camera.position.y = startW.y;
  let target: { cx: number; cy: number } | null = null;

  const pointerToCell = (ev: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    const nx = (ev.clientX - r.left) / r.width, ny = (ev.clientY - r.top) / r.height;
    const wx = camera.left + nx * (camera.right - camera.left) + camera.position.x;
    const wy = camera.top - ny * (camera.top - camera.bottom) + camera.position.y;
    return worldToCell(wx, wy);
  };
  let held = false;
  canvas.addEventListener('pointerdown', (e) => { held = true; target = pointerToCell(e); startAudio(); });
  canvas.addEventListener('pointermove', (e) => { if (held) target = pointerToCell(e); });
  window.addEventListener('pointerup', () => { held = false; });

  // Keyboard: arrows/WASD move along the screen axes (up = towards the top of the screen).
  const keys = new Set<string>();
  window.addEventListener('keydown', (e) => { keys.add(e.key.toLowerCase()); startAudio(); });
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

  let walkT = 0;
  const clock = new THREE.Clock();
  function frame() {
    const dt = Math.min(clock.getDelta(), 0.1);
    let dx = 0, dy = 0; // screen-space direction
    if (keys.has('arrowleft') || keys.has('a')) dx -= 1;
    if (keys.has('arrowright') || keys.has('d')) dx += 1;
    if (keys.has('arrowup') || keys.has('w')) dy += 1;
    if (keys.has('arrowdown') || keys.has('s')) dy -= 1;
    let vx = 0, vy = 0; // cell-space velocity
    if (dx || dy) {
      target = null;
      const c = worldToCell(dx * 32, dy * 16); // one screen unit expressed in cell space
      const l = Math.hypot(c.cx, c.cy) || 1;
      vx = c.cx / l; vy = c.cy / l;
    } else if (target) {
      const ex = target.cx - pos.cx, ey = target.cy - pos.cy, d = Math.hypot(ex, ey);
      if (d < 0.08) target = null;
      else { vx = ex / d; vy = ey / d; }
    }
    if (vx || vy) {
      const step = Math.min(SPEED * dt, target ? Math.hypot(target.cx - pos.cx, target.cy - pos.cy) : SPEED * dt);
      const nx = pos.cx + vx * step, ny = pos.cy + vy * step;
      // slide along obstacles: try the full move, then each axis on its own
      if (world.isWalkable(nx, ny)) { pos.cx = nx; pos.cy = ny; }
      else if (world.isWalkable(nx, pos.cy)) pos.cx = nx;
      else if (world.isWalkable(pos.cx, ny)) pos.cy = ny;
      else target = null;
      pos.cx = Math.min(Math.max(pos.cx, 0), world.dim - 1);
      pos.cy = Math.min(Math.max(pos.cy, 0), world.dim - 1);
      // face the screen-space direction of travel and advance the walk cycle
      const sx = (vx - vy) * 32, sy = -(vx + vy) * 16;
      heroDir = screenDir(sx, sy);
      walkT += dt * 14;
    } else walkT = 0;
    hero.setWalkFrame(heroDir, Math.floor(walkT));
    const w = cellToWorld(pos.cx, pos.cy);
    hero.position.set(w.x, w.y, depthOf(pos.cx, pos.cy) + 0.3);
    world.update(pos.cx, pos.cy);
    camera.position.x += (w.x - camera.position.x) * Math.min(1, dt * 6);
    camera.position.y += (w.y - camera.position.y) * Math.min(1, dt * 6);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  hud.textContent = 'NightStone remake · milestone 1 · real Lost Forrest terrain + scenery · Barbarian · click / hold to walk, or WASD';
  frame();
}

boot().catch((err) => { hud.textContent = `Failed to start: ${String(err)}`; console.error(err); });
