import * as THREE from 'three';
import { Atlas } from './assets/atlas.ts';
import { MISSIONS, SaveStore, newCareer, parseCareer, type Career } from './game/career.ts';
import { WorldMap } from './ui/worldmap.ts';
import { pickSlot } from './ui/saveslots.ts';
import { ProjectileView } from './game/projectileview.ts';
import { EffectsView } from './game/effectsview.ts';
import { World } from './game/world.ts';
import { Sfx } from './audio/sfx.ts';
import { surfaceLookup, type TileTable } from './game/surface.ts';
import { DialogueWindow } from './ui/dialogue.ts';
import { parseDialogue, speechFor } from './game/dialogue.ts';
import { CLASSES, LEVEL_MSG, MERCHANTS, type ClassId, Game, type GameData, type HeroSave } from './game/game.ts';
import type { AnimData } from './game/anims.ts';
import { buildItems } from './game/items.ts';
import { InventoryPanel } from './ui/inventory.ts';
import { ShopWindow } from './ui/shop.ts';
import { CharacterPanel } from './ui/character.ts';
import { Skin } from './ui/skin.ts';
import { Hud } from './ui/hud.ts';
import { GameMenu } from './ui/gamemenu.ts';
import { TitleMenu, type Difficulty } from './ui/titlemenu.ts';
import { loadPrefs, renderScale, savePrefs, type Prefs } from './ui/prefs.ts';
import { keyInput, labelOf, mouseInput } from './ui/bindings.ts';
import { gunzip, parseMap } from './formats/map.ts';
import { applyCampaignNames, findMap, mapStart, missionBriefing, missionFinalText, tilesetDir, type MapEntry } from './game/maplist.ts';
import { cellToWorld, worldToCell } from './iso.ts';

const BASE = `${import.meta.env.BASE_URL}assets/`;
const VIEW_H = 480; // the original ran at 640x480; we keep that logical height and scale to the window

const canvas = document.getElementById('game') as HTMLCanvasElement;
const hud = document.getElementById('hud') as HTMLDivElement;
// anything that goes wrong after start-up is shown instead of leaving the screen black
window.addEventListener('error', (e) => { hud.textContent = `Error: ${e.message}`; hud.style.opacity = '1'; });
window.addEventListener('unhandledrejection', (e) => { hud.textContent = `Error: ${String((e.reason as Error)?.message ?? e.reason)}`; hud.style.opacity = '1'; });
let glRenderer: THREE.WebGLRenderer | null = null;
try { glRenderer = new THREE.WebGLRenderer({ canvas, antialias: false }); glRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); } catch { /* no WebGL: the menus still work, the game itself needs it */ }
const renderer = glRenderer as THREE.WebGLRenderer;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060a);
const camera = new THREE.OrthographicCamera(-320, 320, VIEW_H / 2, -VIEW_H / 2, 0.1, 3000);
camera.position.z = 1500;

/** Graphics options of the Controls window: the share of the window the picture fills ("Screen size") and its sharpness ("Detail"). */
const picture = { screen: 1 };
function applyPicture(p: Prefs): void {
  picture.screen = p.screen;
  glRenderer?.setPixelRatio(renderScale(p.detail, window.devicePixelRatio));
  canvas.style.cssText += `;position:fixed;left:50%;top:50%;width:${p.screen * 100}vw;height:${p.screen * 100}vh;transform:translate(-50%,-50%)`;
  resize();
}

function resize() {
  const w = window.innerWidth * picture.screen, h = window.innerHeight * picture.screen;
  glRenderer?.setSize(w, h, false);
  const halfH = VIEW_H / 2, halfW = halfH * (w / h);
  camera.left = -halfW; camera.right = halfW; camera.top = halfH; camera.bottom = -halfH;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

async function boot() {
  const prefs = loadPrefs();
  const applyGamma = (p: Prefs) => { canvas.style.filter = p.gamma === 1 ? '' : `brightness(${p.gamma})`; };
  applyGamma(prefs);
  applyPicture(prefs);
  // Who plays? After dying, R comes back with the hero's growth in sessionStorage; returning from a finished mission
  // brings the career back to the world map; ?class=amazon skips the menus; otherwise the title menu asks (new game or Load game).
  const byName: Record<string, ClassId> = { barbarian: 100, amazon: 101, sorceress: 102 };
  const takeSession = <T,>(key: string): T | null => {
    try { const raw = sessionStorage.getItem(key); sessionStorage.removeItem(key); return raw ? (JSON.parse(raw) as T) : null; } catch { return null; }
  };
  const carried = takeSession<{ classId: ClassId; save: HeroSave; difficulty?: Difficulty; done?: string[] }>('nst-save');
  const returning = parseCareer(takeSession<unknown>('nst-career'));
  // a map played on its own (Select map, or ?map=nhs/12): it never touches the career's missions
  let custom = findMap(takeSession<string>('nst-map') ?? new URLSearchParams(location.search).get('map'));
  if (custom?.id === 'lost_forrest') custom = undefined;
  // ?edited=1: the map made in editor.html (kept gzipped and base64 in sessionStorage); played on its own like any selected map
  let editedMap: Uint8Array | null = null;
  if (new URLSearchParams(location.search).has('edited')) {
    try { const raw = sessionStorage.getItem('nst-editmap'); if (raw) editedMap = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0)); } catch { /* falls back to the normal game */ }
    if (editedMap) custom = { id: 'edited', name: 'Your map', group: 'Solo', file: '' };
  }
  hud.textContent = 'Loading…';
  const skin = await Skin.load(BASE);
  const idioma = (await (await fetch(`${BASE}text/idioma.json`)).json()) as Record<string, string>;
  applyCampaignNames(idioma); // the picker and the mission banners use the real mission names
  const adv = (await (await fetch(`${BASE}data/adventure.json`)).json()) as { mission_text: string; final: string; heroes: { strength: number; skill: number; resistance: number; magic: number }[] };
  const store = new SaveStore((() => { try { return localStorage; } catch { return null; } })());
  const freshHero = (id: number): HeroSave => ({ attrs: { ...adv.heroes[id - 100]! }, level: 1, xp: 0, points: 0, gold: 0 });
  let career: Career | null = returning ?? (carried ? { v: 1, classId: carried.classId, difficulty: carried.difficulty ?? 1, hero: carried.save, done: carried.done ?? [], when: 0 } : null);
  const byUrl = byName[new URLSearchParams(location.search).get('class')?.toLowerCase() ?? ''];
  if (!career && byUrl) career = newCareer(byUrl, 1, freshHero(byUrl));
  let showMap = !!returning;
  let menuMusic: HTMLAudioElement | null = null;
  const music0 = () => {
    menuMusic = new Audio(`${BASE}audio/system/menu.ogg`);
    menuMusic.loop = true;
    menuMusic.volume = prefs.music;
    const startMenuMusic = () => { void menuMusic?.play().catch(() => undefined); };
    window.addEventListener('pointerdown', startMenuMusic, { once: true });
    return startMenuMusic;
  };
  let stopMenuMusic = () => undefined as void;
  if (!career) {
    const startMenuMusic = music0();
    const names = Object.values(CLASSES).map((c) => c.name);
    const menu = new TitleMenu(skin, prefs, (p) => { savePrefs(p); if (menuMusic) menuMusic.volume = p.music; applyGamma(p); }, names, store);
    const r = await menu.run();
    career = r.load ?? newCareer((100 + r.hero) as ClassId, r.difficulty, freshHero(100 + r.hero));
    if (r.map) custom = r.map.id === 'lost_forrest' ? undefined : r.map; else if (r.load) custom = undefined;
    showMap = !custom;
    stopMenuMusic = () => { menuMusic?.pause(); window.removeEventListener('pointerdown', startMenuMusic); };
  } else if (showMap) {
    const startMenuMusic = music0();
    stopMenuMusic = () => { menuMusic?.pause(); window.removeEventListener('pointerdown', startMenuMusic); };
    void startMenuMusic();
  }
  if (showMap) {
    const choice = await new WorldMap(skin, store).run(career, '');
    stopMenuMusic();
    if (choice.action === 'menu') { location.href = location.pathname; return; }
  } else stopMenuMusic();
  const classId = career.classId as ClassId;
  const difficulty: Difficulty = career.difficulty;
  const mission = MISSIONS[0]!;
  const played: MapEntry = custom ?? { id: mission.id, name: mission.name, group: 'Solo', file: `maps/${mission.map}` };
  if (!glRenderer) { hud.textContent = 'This browser cannot create a WebGL context, which the game needs to draw the world.'; return; }
  hud.textContent = 'Loading original map and sprite data…';
  const map = parseMap(editedMap ? await gunzip(editedMap) : await fetch(`${BASE}${played.file}`).then((r) => r.arrayBuffer()).then(gunzip));
  const ts = tilesetDir(map);
  const [tiles, packCell, pack1, pack2, pack3] = await Promise.all([
    Atlas.load(BASE, `atlas/scenary/${ts}/vtiles.json`),
    Atlas.load(BASE, `p16/scenary/${ts}/packcell.json`),
    Atlas.load(BASE, `p16/scenary/${ts}/pack1.json`),
    Atlas.load(BASE, `p16/scenary/${ts}/pack2.json`),
    Atlas.load(BASE, `p16/scenary/${ts}/pack3.json`),
  ]);
  const world = new World(map, tiles, [packCell, pack1, pack2, pack3]);
  scene.add(world.group);

  const animData = (await (await fetch(`${BASE}data/anims.json`)).json()) as AnimData;
  const actorsIni = (await (await fetch(`${BASE}data/actors.json`)).json()) as GameData['actors'];
  const names: Record<string, string> = {};
  const speech: Record<string, string> = {};
  const itemNames: Record<string, string> = {};
  for (const [k, v] of Object.entries(idioma)) {
    const m = /^(ACTORS|ITEMS)\\ID-(\d+)$/.exec(k);
    if (m) (m[1] === 'ACTORS' ? names : itemNames)[m[2]!] = v;
    else if (k.startsWith('ACTORS\\')) speech[k] = v; // NPC speeches: ACTORS\ID-27*, ID-63** ...
  }
  const items = buildItems((await (await fetch(`${BASE}data/items.json`)).json()) as Parameters<typeof buildItems>[0], itemNames);
  const icons = await Atlas.load(BASE, 'atlas/system/ilistdata.json');
  // Hero + every monster kind the map places (pack-0 markers).
  const spawns = map.markers.filter((m) => animData.actors[String(m.id)] && m.id < 100).map((m) => ({ id: String(m.id), cx: m.cx, cy: m.cy, route: m.route }));
  // ?npc=27,28 puts those NPCs next to the start (the Lost Forrest has none; the Inn map is not in this install).
  const extraNpcs = (new URLSearchParams(location.search).get('npc') ?? '').split(',').filter((id) => animData.actors[id]?.npc);
  // ?mob=23,25 also drops those monsters (23 archer, 25 mage, 55 Zelos...) a few cells from the start, for trying them out.
  const extraMobs = (new URLSearchParams(location.search).get('mob') ?? '').split(',').filter((id) => animData.actors[id] && !animData.actors[id]!.npc);
  const atlases = new Map<string, Atlas>();
  await Promise.all([String(classId), ...extraNpcs, ...extraMobs, ...new Set(spawns.map((s) => s.id))].map(async (id) => {
    const pack = animData.actors[id]!.pack;
    if (!atlases.has(pack)) { try { atlases.set(pack, await Atlas.load(BASE, `p16/actors/${pack.toLowerCase()}.json`)); } catch { /* that monster is left out of the map */ } }
  }));

  // The chosen hero's start marker (100 Barbarian, 101 Amazon, 102 Sorceress) of the map; fall back to the old camp guess for maps without one.
  const st = mapStart(map, classId);
  const spawn = world.findOpenCell(st?.cx ?? 152, st?.cy ?? 78);
  extraMobs.forEach((id, i) => { const c = world.findOpenCell(spawn.cx + 6 - i * 3, spawn.cy - 2 + i * 5); spawns.push({ id, cx: c.cx, cy: c.cy, route: undefined }); });
  const tileSurface = surfaceLookup((await (await fetch(`${BASE}data/tiles.json`)).json()) as TileTable, map.tileset);
  const surface = (cx: number, cy: number) => (map.terrain[Math.floor(cy) * map.dim + Math.floor(cx)] !== undefined ? tileSurface(map.terrain[Math.floor(cy) * map.dim + Math.floor(cx)]!) : 'grass');
  const npcSpawns = extraNpcs.map((id, k) => { const c = world.findOpenCell(spawn.cx + 3 + 2 * k, spawn.cy + 2); return { id, cx: c.cx, cy: c.cy }; });
  const game = new Game(world, { anims: animData, actors: actorsIni, names, atlases, items, icons }, spawn, { spawns: [...spawns, ...npcSpawns], surface, attrs: adv.heroes[classId - 100], classId, save: career.hero, difficulty, finalText: (custom && missionFinalText(idioma, custom.id)) || (adv.final.startsWith('Enter the final text') ? 'You have found the Tomb of Donmir!' : adv.final) });
  const briefing = custom ? missionBriefing(idioma, custom.id) : null;
  game.say(briefing ? briefing.title : custom ? custom.name : adv.mission_text);
  if (new URLSearchParams(location.search).has('debug')) (window as unknown as { __nst: unknown }).__nst = { game }; // for scripted browser checks
  const panel = new InventoryPanel(game, icons, BASE, skin);
  const shop = new ShopWindow(game, icons, BASE, skin);
  const charPanel = new CharacterPanel(game, skin);
  const talkWin = new DialogueWindow(skin);
  const showObjective = () => {
    if (briefing) talkWin.open(briefing.title, { text: briefing.text, replies: ['Close'] }, () => undefined);
    else game.say(adv.mission_text);
  };
  if (briefing) showObjective(); // the mission text greets the hero, as in the original (Q opens it again)
  const visits = new Map<string, number>();
  game.onTalk = (npc) => {
    const n = visits.get(npc.id) ?? 0;
    visits.set(npc.id, n + 1);
    const raw = speechFor(speech, npc.id, n);
    if (raw === null) { if (MERCHANTS.has(npc.id)) shop.open(npc.name); return; }
    const d = parseDialogue(raw);
    // the merchant's first two answers lead to the shop window ($0 buy, $1 sell); every other answer ends the talk
    talkWin.open(npc.name, d, (i) => { if (MERCHANTS.has(npc.id) && i < 2) shop.open(npc.name); });
  };
  scene.add(game.group);
  const fxView = await EffectsView.load(BASE);
  scene.add(fxView.group);
  const projView = await ProjectileView.load(BASE);
  scene.add(projView.group);
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
  // The control configuration (Controls window, prefs.keys): which mouse button attacks and moves, which key runs, sneaks and
  // blocks (Ctrl, Shift and the right button until changed). `down` holds the inputs that are held right now; the modifier flags
  // of every mouse and key event keep Ctrl / Shift / Alt honest if a key-up was missed.
  const down = new Set<string>();
  const readMods = (e: { ctrlKey: boolean; shiftKey: boolean; altKey: boolean }) => {
    for (const [on, k] of [[e.ctrlKey, 'key:control'], [e.shiftKey, 'key:shift'], [e.altKey, 'key:alt']] as const) { if (on) down.add(k); else down.delete(k); }
  };
  window.addEventListener('blur', () => { down.clear(); game.setGuard(false); });
  let held = false;
  let last: { cx: number; cy: number } | null = null;
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    readMods(e);
    startAudio();
    if (menu.isOpen) return;
    const input = mouseInput(e.button);
    down.add(input);
    if (input === prefs.keys.block) { game.setGuard(true); return; } // Barbarian blocks, the others hold position
    if (input !== prefs.keys.attack) return;
    held = true; last = pointerToCell(e); game.click(last.cx, last.cy);
  });
  canvas.addEventListener('pointermove', (e) => { readMods(e); last = pointerToCell(e); if (held && !game.holding) game.click(last.cx, last.cy); });
  window.addEventListener('pointerup', (e) => {
    const input = mouseInput(e.button);
    down.delete(input);
    if (input === prefs.keys.block) game.setGuard(false);
    if (input === prefs.keys.attack) held = false;
  });

  // Keyboard: arrows/WASD move along the screen axes (up = towards the top of the screen); space swings.
  const keys = new Set<string>();
  window.addEventListener('keydown', (e) => {
    readMods(e);
    keys.add(e.key.toLowerCase());
    down.add(keyInput(e.key));
    if (keyInput(e.key) === prefs.keys.block && !e.repeat && !menu.isOpen) game.setGuard(true);
    if (e.key === 'Escape') { if (talkWin.isOpen) talkWin.close(); else if (shop.isOpen) shop.close(); else menu.toggle(); }
    if (e.key === ' ') { if (!shop.isOpen && !menu.isOpen) game.swing(); e.preventDefault(); }
    if (e.key >= '1' && e.key <= '4' && !shop.isOpen) game.useQuick(Number(e.key));
    if (e.key.toLowerCase() === 'i') panel.toggle();
    if (e.key.toLowerCase() === 'q' && !talkWin.isOpen && !shop.isOpen) showObjective();
    if (e.key.toLowerCase() === 'c') charPanel.toggle();
    if (e.key.toLowerCase() === 'r' && !game.hero.alive) {
      try { sessionStorage.setItem('nst-save', JSON.stringify({ classId: game.classId, save: game.save(), difficulty, done: career!.done })); if (custom) sessionStorage.setItem('nst-map', JSON.stringify(custom.id)); } catch { /* start fresh */ }
      location.reload();
    }
    startAudio();
  });
  window.addEventListener('keyup', (e) => {
    readMods(e); keys.delete(e.key.toLowerCase()); down.delete(keyInput(e.key));
    if (keyInput(e.key) === prefs.keys.block) game.setGuard(false);
  });

  const sfx = new Sfx(BASE, (await (await fetch(`${BASE}data/sfx.json`)).json()) as Record<string, string>);
  game.onSound = (id) => sfx.play(id);
  const music = new Audio(`${BASE}audio/system/${ts}.ogg`);
  music.loop = true;
  const wind = new Audio(`${BASE}audio/gdi/audio/ambsounds/05_viento2.ogg`);
  wind.loop = true;
  let hintRefresh = () => {};
  const applyPrefs = (p: Prefs) => {
    music.volume = p.music;
    wind.volume = p.ambient && ts === 'outside' ? 0.4 : 0;
    sfx.volume = p.fx;
    applyGamma(p);
    applyPicture(p);
    game.blood = p.blood;
    hintRefresh();
  };
  applyPrefs(prefs);
  let audioOn = false;
  function startAudio() {
    if (audioOn) return;
    audioOn = true;
    sfx.enabled = true;
    void music.play().catch(() => undefined);
    if (ts === 'outside') void wind.play().catch(() => undefined);
  }

  // The original HUD (minimap ring, portrait with bars, quick bar and messages) replaces the old text readout.
  panel.hideLog();
  const gui = new Hud(skin, game, icons, BASE, {
    quest: () => showObjective(),
    inventory: () => panel.toggle(),
    options: () => menu.toggle(),
    character: () => charPanel.toggle(),
  });
  const menu = new GameMenu(skin, () => location.reload(), prefs, (p) => { savePrefs(p); applyPrefs(p); });
  const banner = document.createElement('div');
  banner.style.cssText = 'position:fixed;left:0;right:0;top:40%;text-align:center;font:24px ui-monospace,Menlo,monospace;color:#e9c27a;text-shadow:0 2px 4px #000;pointer-events:none;display:none';
  document.body.appendChild(banner);

  // the mission clock of the two timed missions (3 and 35): top right, red in the last minute
  const clockEl = document.createElement('div');
  clockEl.style.cssText = 'position:fixed;top:8px;right:12px;font:bold 18px monospace;color:#f0e3b0;text-shadow:0 0 4px #000,0 0 2px #000;display:none;pointer-events:none;z-index:5';
  document.body.appendChild(clockEl);
  const showClock = () => {
    const t = game.clock;
    if (t === null) { clockEl.style.display = 'none'; return; }
    const secs = Math.ceil(t);
    clockEl.style.display = 'block';
    clockEl.style.color = secs <= 60 ? '#ff6a5a' : '#f0e3b0';
    clockEl.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  };
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
    game.setStance(down.has(prefs.keys.run), down.has(prefs.keys.stealth));
    if (!menu.isOpen) game.update(dt, move);
    showClock();
    panel.update();
    charPanel.update();
    world.update(hero.cx, hero.cy);
    const w = cellToWorld(hero.cx, hero.cy);
    camera.position.x += (w.x - camera.position.x) * Math.min(1, dt * 6);
    camera.position.y += (w.y - camera.position.y) * Math.min(1, dt * 6);
    gui.update();
    const left = game.monsters.filter((m) => m.alive).length;
    banner.style.display = !hero.alive || left === 0 || game.status === 'failed' ? 'block' : 'none';
    banner.textContent = game.status === 'failed' ? `${LEVEL_MSG.failed} — press Esc for the menu` : !hero.alive ? 'You have fallen — press R to try again (items and one point of each ability are lost)' : (custom ? 'The area is clear!' : 'The camp is clear!');
    if (game.goalReached && !won) {
      won = true;
      const done = custom || career!.done.includes(mission.id) ? career!.done : [...career!.done, mission.id];
      showVictory(game, hero.stats.name, { ...career!, hero: game.carry(), done, when: Date.now() }, skin, store);
    }
    fxView.sync(game.fx);
    projView.sync(game.projectiles);
    // earthquake: shake the picture for a moment
    const sh = Math.min(1, game.shake) * 7, ox = (Math.random() - 0.5) * 2 * sh, oy = (Math.random() - 0.5) * 2 * sh;
    camera.position.x += ox; camera.position.y += oy;
    renderer.render(scene, camera);
    camera.position.x -= ox; camera.position.y -= oy;
    requestAnimationFrame(frame);
  }
  const hint = (p: Prefs) => `${labelOf(p.keys.attack).toLowerCase()} to walk or fight · WASD · Space swing · ${labelOf(p.keys.run)} run · ${labelOf(p.keys.stealth)} stealth · ${labelOf(p.keys.block).toLowerCase()} block / hold · I inventory · C character · Q objective · Esc menu`;
  hud.textContent = hint(prefs);
  hintRefresh = () => { hud.textContent = hint(prefs); };
  hud.style.cssText += ';bottom:auto;top:6px;transition:opacity 2s;opacity:.8';
  setTimeout(() => { hud.style.opacity = '0'; }, 14000);
  frame();
}

boot().catch((err) => { hud.textContent = `Failed to start: ${String(err)}`; console.error(err); });

/** End-of-quest card shown when the hero reaches the tomb: save, go back to the map of the land, or carry on exploring. */
function showVictory(game: Game, name: string, next: Career, skin: Skin, store: SaveStore): void {
  const root = document.createElement('div');
  root.style.cssText = 'position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:rgba(10,7,4,.88);color:#e9dfb8;font:15px ui-monospace,Menlo,monospace;z-index:10;text-align:center;padding:24px';
  const text = document.createElement('div');
  text.style.cssText = 'max-width:520px;line-height:1.6;white-space:pre-wrap';
  text.textContent = `QUEST COMPLETE\n\n${game.log.at(-1) ?? ''}\n\n${name} · level ${game.level} · ${game.kills} kills · ${game.xp} xp · ${game.inventory.gold} gold`;
  const note = document.createElement('div');
  note.style.cssText = 'min-height:1.4em;color:#d8caa0';
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;justify-content:center';
  const act = (label: string, fn: () => void) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'padding:8px 16px;background:#241a0e;color:#e9dfb8;border:2px solid #6b5426;font:inherit;cursor:pointer';
    b.onclick = fn;
    row.appendChild(b);
  };
  act('Save game', () => {
    void pickSlot(skin, store, 'save', root).then((slot) => {
      if (slot === null) return;
      note.textContent = store.write(slot, next) ? `Saved in slot ${slot + 1}.` : 'The browser would not store the save.';
    });
  });
  act('Return to the map', () => {
    try { sessionStorage.setItem('nst-career', JSON.stringify(next)); } catch { /* the map starts from the title instead */ }
    location.reload();
  });
  act('Keep exploring', () => root.remove());
  act('Main menu', () => { location.href = location.pathname; });
  root.append(text, row, note);
  document.body.appendChild(root);
}
