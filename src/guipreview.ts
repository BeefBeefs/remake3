/** A page that shows the GUI screens without the game (no WebGL needed): the title menu, the HUD on a fake hero, the options menu. */
import { Atlas } from './assets/atlas.ts';
import { Skin } from './ui/skin.ts';
import { TitleMenu } from './ui/titlemenu.ts';
import { Hud } from './ui/hud.ts';
import { GameMenu } from './ui/gamemenu.ts';
import { DEFAULT_PREFS } from './ui/prefs.ts';
import { Inventory, buildItems } from './game/items.ts';
import type { Game } from './game/game.ts';
import { InventoryPanel } from './ui/inventory.ts';
import { CharacterPanel } from './ui/character.ts';
import { ShopWindow } from './ui/shop.ts';
import { WorldMap } from './ui/worldmap.ts';
import { pickSlot } from './ui/saveslots.ts';
import { pickMap } from './ui/mappicker.ts';
import { SaveStore, newCareer } from './game/career.ts';

const BASE = `${import.meta.env.BASE_URL}assets/`;
const q = new URLSearchParams(location.search);
const screen = q.get('screen') ?? 'title';
const skin = await Skin.load(BASE);

// a throw-away store with two saves, so the Load game button and the slot list can be seen
const mem = new Map<string, string>();
const demoStore = new SaveStore({ getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => { mem.set(k, v); } });
const demoHero = { attrs: { strength: 32, skill: 24, resistance: 30, magic: 11 }, level: 3, xp: 240, points: 4, gold: 1234 };
demoStore.write(0, { ...newCareer(100, 1, demoHero), done: ['lost_forrest'] });
demoStore.write(2, newCareer(102, 2, { ...demoHero, level: 7, gold: 90 }));

if (screen === 'worldmap') {
  const wm = new WorldMap(skin, demoStore);
  const done = q.has('done') ? ['lost_forrest'] : [];
  const r = await wm.run({ ...newCareer(100, 1, demoHero), done }, 'Terak');
  document.body.append(`chose ${JSON.stringify(r)}`);
} else if (screen === 'slots') {
  const r = await pickSlot(skin, demoStore, (q.get('mode') as 'save' | 'load' | null) ?? 'load');
  document.body.append(`picked ${r}`);
} else if (screen === 'maps') {
  const stage = document.createElement('div');
  stage.style.cssText = 'position:relative;width:640px;height:480px;background:#000 center/cover';
  document.body.appendChild(stage);
  const r = await pickMap(skin, stage);
  document.body.append(`picked ${r?.id ?? 'nothing'}`);
} else if (screen === 'title') {
  const menu = new TitleMenu(skin, { ...DEFAULT_PREFS }, () => undefined, ['Barbarian', 'Amazon', 'Sorceress'], demoStore);
  const r = await menu.run((q.get('at') as Parameters<TitleMenu['run']>[0] | null) ?? 'main');
  document.body.append(`chose hero ${r.hero}, difficulty ${r.difficulty}`);
} else if (screen === 'inventory' || screen === 'character' || screen === 'shop') {
  const icons = await Atlas.load(BASE, 'atlas/system/ilistdata.json');
  const items = buildItems((await (await fetch(`${BASE}data/items.json`)).json()) as Parameters<typeof buildItems>[0], {});
  const inv = new Inventory(items, 100);
  for (const id of [1, 5, 14, 3, 104, 105, 104, 86, 87, 71, 80, 110, 3, 9]) inv.add(id);
  inv.equip(inv.slots.indexOf(1)); inv.equip(inv.slots.indexOf(80)); inv.gold = 1234;
  const attrs = { strength: 32, skill: 24, resistance: 30, magic: 11 };
  const fake = {
    hero: { hp: 41, alive: true, stats: { hp: 60, name: 'Terak' } }, classId: 100, level: 3, xp: 240, points: 4, version: 1,
    stamina: 40, maxStamina: 60, mana: 14, maxMana: 22, inventory: inv, attrs, eff: { strength: 40, skill: 20, resistance: 26, magic: 5 },
    blocked: (d: { req: { strength: number } }) => d.req.strength > 40, missing: () => [], activate: () => undefined, unequip: () => undefined, spend: () => undefined,
  };
  if (screen === 'shop') {
    const shopGame = { ...fake, playSound: () => undefined, version: 1 };
    const shop = new ShopWindow(shopGame as unknown as Game, icons, BASE, skin);
    shop.open('Bartender');
    shop.isOpen = true;
  } else {
  const panel = screen === 'inventory' ? new InventoryPanel(fake as unknown as Game, icons, BASE, skin) : new CharacterPanel(fake as unknown as Game, skin);
  panel.toggle();
  panel.update();
  }
} else if (screen === 'options') {
  new GameMenu(skin, () => undefined).open();
} else {
  const icons = await Atlas.load(BASE, 'atlas/system/ilistdata.json');
  const items = buildItems((await (await fetch(`${BASE}data/items.json`)).json()) as Parameters<typeof buildItems>[0], {});
  const inv = new Inventory(items, 100);
  for (const id of [1, 104, 105, 86]) inv.add(id);
  const dead = q.get('dead') === '1';
  const log = ['Welcome to the Lost Forrest.', 'You drink the Life potion: +18 HP', 'You need Strength 36 to use the Great Sword'];
  const fake = {
    hero: { hp: dead ? 0 : 41, alive: !dead, cx: 100, cy: 100, stats: { hp: 60, name: 'Terak' } },
    stamina: 40, maxStamina: 60, mana: 14, maxMana: 22, classId: Number(q.get('class') ?? 100), level: 3, xp: 240, kills: 7, points: 4, version: 1,
    inventory: inv, log, goalSpots: [{ cx: 110, cy: 96 }], npcs: [{ creature: { cx: 97, cy: 104 } }],
    monsters: [{ alive: true, cx: 104, cy: 103 }, { alive: true, cx: 95, cy: 92 }, { alive: true, cx: 108, cy: 110 }],
    useQuick: () => undefined, say: () => undefined,
  };
  const hud = new Hud(skin, fake as unknown as Game, icons, BASE, { quest: () => undefined, inventory: () => undefined, options: () => undefined, character: () => undefined });
  hud.update();
}
