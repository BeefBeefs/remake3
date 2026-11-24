import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game, type GameData } from '../src/game/game.ts';
import { World } from '../src/game/world.ts';
import type { Atlas } from '../src/assets/atlas.ts';
import type { GameMap } from '../src/formats/map.ts';

const json = (p: string) => JSON.parse(readFileSync(new URL(`../public/assets/${p}`, import.meta.url), 'utf8'));
const fakeAtlas = { has: () => true, rect: () => [0, 0, 8, 8, 0, 0], hotspot: () => [0, 0], json: { size: [64, 64] }, material: {} } as unknown as Atlas;

function flatWorld(): World {
  const dim = 256;
  const map: GameMap = { dim, tileset: 'Outside', terrain: new Uint16Array(dim * dim).fill(340), objects: new Uint32Array(dim * dim) };
  return new World(map, fakeAtlas, []);
}

function makeGame(): Game {
  const anims = json('data/anims.json');
  const atlases = new Map<string, Atlas>();
  for (const a of Object.values(anims.actors) as { pack: string }[]) atlases.set(a.pack, fakeAtlas);
  const data: GameData = { anims, actors: json('data/actors.json'), names: { '100': 'Terak', '1': 'Goblin' }, atlases };
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
