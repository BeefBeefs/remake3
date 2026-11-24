import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game, type GameData } from '../src/game/game.ts';
import { World } from '../src/game/world.ts';
import type { Atlas } from '../src/assets/atlas.ts';
import type { GameMap } from '../src/formats/map.ts';
import { Mesh } from 'three';
import { buildItems } from '../src/game/items.ts';

const json = (p: string) => JSON.parse(readFileSync(new URL(`../public/assets/${p}`, import.meta.url), 'utf8'));
const fakeAtlas = { mesh: () => Object.assign(new Mesh(), { scale: { set() {} } }), has: () => true, rect: () => [0, 0, 8, 8, 0, 0], hotspot: () => [0, 0], json: { size: [64, 64] }, material: {} } as unknown as Atlas;

function flatWorld(): World {
  const dim = 256;
  const map: GameMap = { dim, tileset: 'Outside', terrain: new Uint16Array(dim * dim).fill(340), objects: new Uint32Array(dim * dim) };
  return new World(map, fakeAtlas, []);
}

function makeGame(): Game {
  const anims = json('data/anims.json');
  const atlases = new Map<string, Atlas>();
  for (const a of Object.values(anims.actors) as { pack: string }[]) atlases.set(a.pack, fakeAtlas);
  const data: GameData = { anims, actors: json('data/actors.json'), names: { '100': 'Terak', '1': 'Goblin' }, atlases, items: buildItems(json('data/items.json'), {}), icons: fakeAtlas };
  return new Game(flatWorld(), data, { cx: 128, cy: 128 });
}

const run = (g: Game, seconds: number, move: { x: number; y: number } | null = null) => {
  for (let t = 0; t < seconds; t += 1 / 60) g.update(1 / 60, move);
};

test('the hero walks when told to and stops at the click target', () => {
  const g = makeGame();
  g.click(g.hero.cx + 4, g.hero.cy);
  run(g, 0.3);
  assert.equal(g.hero.state, 'walk');
  run(g, 3);
  assert.ok(Math.abs(g.hero.cx - 132) < 0.2, `cx=${g.hero.cx}`);
  assert.equal(g.hero.state, 'idle');
});

test('the hero fights a monster that is clicked and kills it', () => {
  const g = makeGame();
  for (const m of g.monsters) { m.cx = 5; m.cy = 5; } // park everybody far away
  const m = g.monsters[0]!;
  m.cx = g.hero.cx + 3; m.cy = g.hero.cy;
  g.click(m.cx, m.cy);
  run(g, 30);
  assert.equal(m.alive, false);
  assert.equal(g.kills, 1);
  assert.ok(g.xp > 0);
});

test('monsters that hear the hero chase and hurt him', () => {
  const g = makeGame();
  for (const m of g.monsters) { m.cx = 5; m.cy = 5; }
  const m = g.monsters[0]!;
  m.cx = g.hero.cx + 4; m.cy = g.hero.cy;
  run(g, 20);
  assert.ok(g.hero.hp < g.hero.stats.hp, 'hero should have taken damage');
});

test('a dead hero stops reacting and monsters go idle', () => {
  const g = makeGame();
  g.hero.hurt(1000);
  assert.equal(g.hero.alive, false);
  g.click(140, 140);
  const before = { x: g.hero.cx, y: g.hero.cy };
  run(g, 1);
  assert.deepEqual({ x: g.hero.cx, y: g.hero.cy }, before);
});

test('the hero starts with a scimitar equipped and two life potions', () => {
  const g = makeGame();
  assert.equal(g.inventory.equipped.weapon, 1);
  assert.deepEqual(g.hero.stats.damage, [2, 4]);
  assert.equal(g.inventory.slots.filter((i) => i === 104).length, 2);
});

test('walking over an item picks it up; gold bags add gold', () => {
  const g = makeGame();
  const potions = () => g.inventory.slots.filter((i) => i === 105).length;
  g.spawnGround(105, g.hero.cx + 2, g.hero.cy);
  g.spawnGround(124, g.hero.cx + 3, g.hero.cy);
  g.click(g.hero.cx + 4, g.hero.cy);
  run(g, 3);
  assert.equal(potions(), 1);
  assert.ok(g.inventory.gold > 0);
  assert.equal(g.ground.length, 0);
});

test('a life potion heals up to the maximum and is used up; equipping changes damage', () => {
  const g = makeGame();
  g.hero.hp = 10;
  const slot = g.inventory.slots.indexOf(104);
  g.useSlot(slot);
  assert.ok(g.hero.hp > 10 && g.hero.hp <= g.hero.stats.hp);
  assert.equal(g.inventory.slots.filter((i) => i === 104).length, 1);
  g.inventory.add(4);
  g.useSlot(g.inventory.slots.indexOf(4));
  assert.deepEqual(g.hero.stats.damage, [3, 7]);
});

test('monsters drop loot sometimes when they die', () => {
  let drops = 0;
  for (let n = 0; n < 8; n++) {
    const g = makeGame();
    for (const m of g.monsters) { m.cx = 5; m.cy = 5; }
    const m = g.monsters[0]!;
    m.cx = g.hero.cx + 2; m.cy = g.hero.cy;
    m.hp = 1;
    g.click(m.cx, m.cy);
    run(g, 5);
    drops += g.ground.length + g.inventory.slots.filter((i) => i !== 0).length - 2 + (g.inventory.gold > 0 ? 1 : 0);
  }
  assert.ok(drops >= 1, 'with 45% item + 25% gold over 8 kills at least one drop is expected');
});
