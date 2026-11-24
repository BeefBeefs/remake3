import { spellPower } from '../src/game/spells.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { frameId } from '../src/game/anims.ts';
import { Game, type GameData, type GameOptions, xpForLevel } from '../src/game/game.ts';
import { World, isSlabFrame, slabFlip, wallRect, WALL_BLOCKER } from '../src/game/world.ts';
import type { Atlas } from '../src/assets/atlas.ts';
import type { GameMap } from '../src/formats/map.ts';
import { Mesh } from 'three';
import { buildItems } from '../src/game/items.ts';

const json = (p: string) => JSON.parse(readFileSync(new URL(`../public/assets/${p}`, import.meta.url), 'utf8'));
const fakeAtlas = { mesh: () => Object.assign(new Mesh(), { scale: { set() {} } }), has: () => true, rect: () => [0, 0, 8, 8, 0, 0], hotspot: () => [0, 0], json: { size: [64, 64] }, material: {} } as unknown as Atlas;

function flatWorld(): World {
  const dim = 256;
  const map: GameMap = { dim, tileset: 'Outside', terrain: new Uint16Array(dim * dim).fill(340), objects: new Uint32Array(dim * dim), markers: [], scripts: [], scriptAt: new Int8Array(dim * dim).fill(-1) };
  return new World(map, fakeAtlas, []);
}

function makeGame(opts: GameOptions = {}): Game {
  const anims = json('data/anims.json');
  const atlases = new Map<string, Atlas>();
  for (const a of Object.values(anims.actors) as { pack: string }[]) atlases.set(a.pack, fakeAtlas);
  const data: GameData = { anims, actors: json('data/actors.json'), names: { '100': 'Terak', '1': 'Goblin' }, atlases, items: buildItems(json('data/items.json'), {}), icons: fakeAtlas };
  return new Game(flatWorld(), data, { cx: 128, cy: 128 }, opts);
}

const run = (g: Game, seconds: number, move: { x: number; y: number } | null = null) => {
  for (let t = 0; t < seconds; t += 1 / 60) g.update(1 / 60, move);
};

test('the hero walks when told to and stops at the click target', () => {
  const g = makeGame();
  g.click(g.hero.cx + 4, g.hero.cy);
  run(g, 0.3);
  assert.equal(g.hero.state, 'walk');
  run(g, 5); // 1 pixel a tick: 1.09 cells a second along the screen's long axis
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
  assert.ok(g.hero.hp >= 10 + Math.trunc(g.hero.stats.hp * 0.3) && g.hero.hp <= 10 + Math.trunc(g.hero.stats.hp * 0.45) + 1, 'a small life potion gives 30-45 % of the maximum');
  assert.equal(g.inventory.slots.filter((i) => i === 104).length, 1);
  g.inventory.add(2); // no requirements (sword #4 needs Strength 43)
  g.useSlot(g.inventory.slots.indexOf(2));
  assert.deepEqual(g.hero.stats.damage, [3, 4]);
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

test('monsters with a route wander between its points until the hero is near', () => {
  const g = makeGame();
  const far = new Game(flatWorld(), (g as unknown as { data: GameData }).data, { cx: 10, cy: 10 }, { spawns: [{ id: '1', cx: 200, cy: 200, route: [{ cx: 204, cy: 200 }] }] });
  const m = far.monsters[0]!;
  let moved = 0;
  for (let t = 0; t < 30; t += 1 / 60) { const x = m.cx, y = m.cy; far.update(1 / 60, null); moved += Math.hypot(m.cx - x, m.cy - y); }
  assert.ok(moved > 3, `moved ${moved}`);
  assert.ok(m.cx >= 199.9 && m.cx <= 204.1);
});

test('combat emits the original sound ids (goblin SndBase 200: attack/alarm/die/hurt)', () => {
  const g = makeGame();
  const played: number[] = [];
  g.onSound = (id) => played.push(id);
  const m = g.monsters[0]!;
  g.hero.cx = m.cx - 1; g.hero.cy = m.cy; // beside it
  g.click(m.cx, m.cy);
  run(g, 6);
  assert.ok(played.some((id) => id >= 59 && id <= 64), `flesh/no-flesh hit sound in ${played}`);
  assert.ok(played.some((id) => id >= 200 && id <= 270), `a monster sound in ${played}`);
});

test('opening a chest rolls its script: a level-3 potion chest drops a life potion and the lid swaps', () => {
  const dim = 256;
  const map: GameMap = { dim, tileset: 'Outside', terrain: new Uint16Array(dim * dim).fill(340), objects: new Uint32Array(dim * dim), markers: [],
    scripts: [{ index: 4, name: '', commands: [{ id: 1, args: [1024, 3, 0, 0] }] }], scriptAt: new Int8Array(dim * dim).fill(-1) };
  map.objects[128 * dim + 130] = (3 << 10) | 404;
  map.scriptAt[128 * dim + 130] = 4;
  const world = new World(map, fakeAtlas, [fakeAtlas, fakeAtlas, fakeAtlas, fakeAtlas]);
  const anims = json('data/anims.json');
  const atlases = new Map<string, Atlas>();
  for (const a of Object.values(anims.actors) as { pack: string }[]) atlases.set(a.pack, fakeAtlas);
  const data: GameData = { anims, actors: json('data/actors.json'), names: {}, atlases, items: buildItems(json('data/items.json'), {}), icons: fakeAtlas };
  const g = new Game(world, data, { cx: 128, cy: 128 }, { spawns: [] });
  assert.equal(map.objects[128 * dim + 130], (3 << 10) | 403); // shown closed
  g.click(130, 128);
  run(g, 3);
  assert.equal(map.objects[128 * dim + 130], (3 << 10) | 404); // open now
  assert.equal(g.ground.length, 1);
  assert.equal(data.items.get(g.ground[0]!.id)!.kind, 'potion');
});

test('the Amazon starts with a short bow and shoots from a distance', () => {
  const g = makeGame({ classId: 101, attrs: { strength: 20, skill: 27, resistance: 22, magic: 15 }, spawns: [{ id: '1', cx: 133, cy: 128 }] });
  assert.equal(g.classId, 101);
  assert.equal(g.inventory.equipped.weapon, 40);
  assert.ok(g.ranged);
  assert.equal(g.hero.stats.hp, 79); // Amazon: 35 + level/5 + 2 x Resistance
  const m = g.monsters[0]!;
  const hp0 = m.hp;
  g.click(m.cx, m.cy);
  run(g, 4);
  assert.ok(m.hp < hp0 || !m.alive, 'the goblin took arrow damage');
  assert.ok(Math.hypot(g.hero.cx - m.cx, g.hero.cy - m.cy) > 2.5, 'she kept her distance');
});

test('the Sorceress starts with a staff and cannot wear the Barbarian scimitar', () => {
  const g = makeGame({ classId: 102, attrs: { strength: 19, skill: 23, resistance: 21, magic: 30 } });
  assert.equal(g.inventory.equipped.weapon, 56);
  assert.ok(g.ranged, 'a staff shoots');
  assert.equal(g.hero.stats.hp, 67); // Sorceress: 25 + level/4 + 2 x Resistance
  g.inventory.add(1);
  assert.equal(g.inventory.equip(g.inventory.slots.indexOf(1)), false);
});

test('all three heroes have animations and the class sprite packs exist', () => {
  const anims = json('data/anims.json');
  for (const id of ['100', '101', '102']) {
    const a = anims.actors[id];
    assert.ok(a.anims.Andar && a.anims.Respirar && a.anims.Atacar, id);
    json(`p16/actors/${a.pack}.json`);
  }
});

test('hero hit and death animations are laid out inside every pack, death with 4 directions', () => {
  const anims = json('data/anims.json');
  for (const id of ['100', '101', '102']) {
    const a = anims.actors[id];
    const atlas = json(`p16/actors/${a.pack}.json`);
    assert.ok(a.verified && a.anims.Recibir && a.anims.Morir, id);
    assert.equal(a.anims.Morir.dirs, 4);
    // every frame of every animation exists in the converted atlas
    for (const [name, an] of Object.entries<any>(a.anims)) {
      for (let dir = 0; dir < 8; dir++) for (let step = 0; step < an.frames; step++) {
        const f = frameId(an, dir, step);
        assert.ok(atlas.frames[String(f)], `${id} ${name} dir ${dir} step ${step} -> frame ${f}`);
      }
    }
    // the last death frame is the pack's last frame
    assert.equal(frameId(a.anims.Morir, 7, a.anims.Morir.frames - 1), a.frames);
  }
});

test('death uses the pair-of-directions block: dirs 2k and 2k+1 share a sequence', () => {
  const an = { start: 521, frames: 11, speed: 6, dirs: 4 };
  assert.equal(frameId(an, 0, 0), 521);
  assert.equal(frameId(an, 1, 0), 521);
  assert.equal(frameId(an, 2, 3), 521 + 11 + 3);
  assert.equal(frameId(an, 7, 10), 564);
});

test('a hero hit by a monster plays Recibir and a killed hero stays dead', () => {
  const g = makeGame({ classId: 100, spawns: [{ id: '1', cx: 129, cy: 128 }] });
  g.hero.hurt(1);
  assert.equal(g.hero.state, 'hit');
  run(g, 1);
  assert.notEqual(g.hero.state, 'hit');
  g.hero.hurt(10_000);
  assert.equal(g.hero.state, 'dead');
  run(g, 3);
  assert.equal(g.hero.state, 'dead');
  assert.ok(!g.hero.alive);
});

test('walking plays alternating footstep sounds', () => {
  const g = makeGame();
  const heard: number[] = [];
  g.onSound = (id) => heard.push(id);
  g.click(g.hero.cx + 4, g.hero.cy);
  run(g, 4);
  const steps = heard.filter((id) => id === 160 || id === 161);
  assert.ok(steps.length >= 3 && steps.length <= 5, `steps=${steps.length}`);
  assert.deepEqual(steps.slice(0, 2).sort(), [160, 161]);
  heard.length = 0;
  run(g, 1);
  assert.equal(heard.filter((id) => id === 160 || id === 161).length, 0, 'standing still is silent');
});

test('a kill that crosses XP thresholds raises the level, heals and plays the class level-up sound per level', () => {
  const g = makeGame({ classId: 101, spawns: [{ id: '1', cx: 129, cy: 128 }] });
  const heard: number[] = [];
  g.onSound = (id) => heard.push(id);
  assert.equal(g.level, 1);
  const hp0 = g.hero.stats.hp;
  g.xp = xpForLevel(3) - 1;
  const gob = g.monsters[0]!;
  gob.hp = 1;
  g.click(gob.cx, gob.cy);
  run(g, 10);
  assert.equal(g.level, 3);
  assert.equal(g.hero.hp, g.hero.stats.hp);
  assert.equal(g.hero.stats.hp, hp0, 'life only grows through Resistance');
  assert.equal(g.points, 8, 'four points per level');
  assert.equal(heard.filter((id) => id === 123).length, 2, 'one amazon level-up sound per level');
});

test('reaching the goal cell (named script without loot) completes the quest once', () => {
  const dim = 256;
  const map: GameMap = { dim, tileset: 'Outside', terrain: new Uint16Array(dim * dim).fill(340), objects: new Uint32Array(dim * dim), markers: [],
    scripts: [{ index: 11, name: 'Tomb', commands: [{ id: 5, args: [0, 0, 0, 0] }] }], scriptAt: new Int8Array(dim * dim).fill(-1) };
  map.scriptAt[128 * dim + 140] = 11;
  const g = new Game(new World(map, fakeAtlas, []), (() => { const x = makeGame() as unknown as { data: GameData }; return x.data; })(), { cx: 128, cy: 128 }, { spawns: [], finalText: 'You win' });
  assert.equal(g.goalReached, false);
  g.click(138, 128);
  run(g, 12);
  assert.equal(g.goalReached, true);
  assert.equal(g.log.at(-1), 'You win');
  const n = g.log.length;
  run(g, 2);
  assert.equal(g.log.length, n, 'announced once');
});

test('footsteps follow the surface underfoot', () => {
  let surface: 'grass' | 'wood' | 'stone' = 'grass';
  const g = makeGame({ surface: () => surface });
  const heard: number[] = [];
  g.onSound = (id) => heard.push(id);
  const stepsOf = (lo: number) => heard.filter((id) => id === lo || id === lo + 1).length;
  g.click(g.hero.cx + 20, g.hero.cy);
  run(g, 3);
  assert.ok(stepsOf(160) >= 2 && stepsOf(164) === 0 && stepsOf(168) === 0);
  surface = 'wood'; heard.length = 0; run(g, 3);
  assert.ok(stepsOf(164) >= 2 && stepsOf(160) === 0);
  surface = 'stone'; heard.length = 0; run(g, 3);
  assert.ok(stepsOf(168) >= 2 && stepsOf(164) === 0);
});

test('NPC strips: every frame of every animation exists in the atlas; the innkeeper has idle and talk animations', () => {
  const anims = json('data/anims.json');
  const npcs = Object.entries<any>(anims.actors).filter(([, a]) => a.npc);
  assert.ok(npcs.length >= 15);
  for (const [id, a] of npcs) {
    const atlas = json(`p16/actors/${a.pack.toLowerCase()}.json`);
    for (const [name, an] of Object.entries<any>(a.anims)) {
      assert.equal(an.dirs, 1);
      for (let dir = 0; dir < 8; dir++) for (let step = 0; step < an.frames; step++) assert.ok(atlas.frames[String(frameId(an, dir, step))], `${id} ${name}`);
    }
  }
  const inn = anims.actors['27'];
  assert.ok(inn.verified);
  assert.deepEqual([inn.anims.Andar.frames, inn.anims.Respirar.frames, inn.anims.Atacar.frames], [14, 15, 70]);
});

test('clicking an NPC walks the hero over, plays the talk animation and fires onTalk once', () => {
  const g = makeGame({ spawns: [{ id: '27', cx: 136, cy: 128 }] });
  assert.equal(g.npcs.length, 1);
  assert.equal(g.monsters.length, 0, 'an NPC is not a monster');
  const npc = g.npcs[0]!;
  const talked: string[] = [];
  g.onTalk = (n) => talked.push(n.id);
  g.click(npc.creature.cx, npc.creature.cy);
  run(g, 0.2);
  assert.equal(g.hero.state, 'walk');
  assert.equal(talked.length, 0);
  run(g, 7);
  assert.deepEqual(talked, ['27']);
  assert.ok(Math.hypot(g.hero.cx - npc.creature.cx, g.hero.cy - npc.creature.cy) <= 2.3);
  assert.equal(npc.creature.state, 'attack', 'innkeeper turns to serve');
  run(g, 14); // the serve animation is 70 frames x 6 ticks = 12 s
  assert.deepEqual(talked, ['27'], 'does not talk again by itself');
  assert.equal(npc.creature.state, 'idle');
});

test('level-up points: spending raises the attribute, Resistance also raises life, no points = no change', () => {
  const g = makeGame({ attrs: { strength: 30, skill: 24, resistance: 30, magic: 11 } });
  assert.equal(g.spend('strength'), false);
  g.points = 2;
  const hp = g.hero.stats.hp;
  g.hero.hp = hp - 10;
  assert.equal(g.spend('resistance'), true);
  assert.equal(g.attrs.resistance, 31);
  assert.equal(g.hero.stats.hp, hp + 2);
  assert.equal(g.hero.hp, hp - 8);
  assert.equal(g.spend('magic'), true);
  assert.equal(g.attrs.magic, 12);
  assert.equal(g.spend('magic'), false);
  assert.equal(g.points, 0);
});

test('running is twice as fast, drains stamina, uses the running footsteps and stops when stamina is empty', () => {
  const walk = makeGame(), runner = makeGame();
  runner.setStance(true, false);
  const heard: number[] = [];
  runner.onSound = (id) => heard.push(id);
  const s0 = runner.stamina;
  walk.click(walk.hero.cx + 30, walk.hero.cy);
  runner.click(runner.hero.cx + 30, runner.hero.cy);
  run(walk, 1); run(runner, 1);
  const dw = walk.hero.cx - 128, dr = runner.hero.cx - 128;
  assert.ok(Math.abs(dr / dw - 2) < 0.1, `ratio ${dr / dw}`);
  assert.ok(runner.stamina < s0 - 0.5, 'running tires the hero');
  assert.ok(heard.some((id) => id === 162 || id === 163), 'j_correr_hierba');
  assert.ok(!heard.some((id) => id === 160 || id === 161));
  runner.stamina = 0;
  const x = runner.hero.cx;
  run(runner, 1);
  assert.ok(Math.abs(runner.hero.cx - x - 1.09) < 0.1, 'out of stamina: back to walking pace');
});

test('standing still recovers stamina; stealth is slow and silent', () => {
  const g = makeGame();
  g.stamina = 10;
  run(g, 2);
  assert.ok(g.stamina > 10.5, 'three points per frame of 1/200');
  const heard: number[] = [];
  g.onSound = (id) => heard.push(id);
  g.setStance(false, true);
  const x = g.hero.cx;
  g.click(x + 30, g.hero.cy);
  run(g, 2);
  assert.ok(Math.abs(g.hero.cx - x - 1.09) < 0.15, `stealth speed ${g.hero.cx - x}`);
  assert.equal(heard.filter((id) => id >= 160 && id <= 171).length, 0, 'no footsteps');
});

test('stealth hides you from monsters at half range', () => {
  const mk = (stealth: boolean, gx: number) => { const g = makeGame({ spawns: [{ id: '1', cx: gx, cy: 128 }] }); g.setStance(false, stealth); return g; };
  // a goblin 7 cells away: a walking hero is heard (hearing + 3 > 7?) only if inside range; stealth halves it
  const range = (stealth: boolean) => {
    for (let d = 14; d >= 2; d--) { const g = mk(stealth, 128 + d); run(g, 0.3); if ((g as unknown as { alerted: Set<unknown> }).alerted.has(g.monsters[0]!)) return d; }
    return 0;
  };
  const walkRange = range(false), sneakRange = range(true);
  assert.ok(walkRange > 0 && sneakRange > 0 && sneakRange < walkRange, `walk hears at ${walkRange}, stealth at ${sneakRange}`);
});

test('stamina, mana and the vitality potion: mask bits restore each pool; vitality can hurt', () => {
  const g = makeGame();
  g.stamina = 0; g.mana = 0;
  g.inventory.add(106); // small stamina potion 40-60
  g.inventory.add(108); // small magic potion 20-40
  g.useSlot(g.inventory.slots.indexOf(106));
  assert.ok(g.stamina >= Math.trunc(g.maxStamina * 0.4) && g.stamina <= Math.trunc(g.maxStamina * 0.6), 'Potencia is a percentage of the maximum');
  g.useSlot(g.inventory.slots.indexOf(108));
  assert.ok(g.mana >= Math.trunc(g.maxMana * 0.2) && g.mana <= Math.trunc(g.maxMana * 0.4));
  g.inventory.add(110);
  const hp = g.hero.hp;
  g.useSlot(g.inventory.slots.indexOf(110));
  assert.ok(g.hero.hp >= 0 && g.hero.hp !== hp + 100);
  assert.equal(g.inventory.slots.includes(110), false, 'consumed');
});

test('item requirements: too little Strength blocks equipping (red border) until points are spent', () => {
  const g = makeGame({ attrs: { strength: 32, skill: 24, resistance: 30, magic: 11 } });
  const sword3 = g.inventory.def(3)!; // needs Strength 36
  assert.equal(sword3.req.strength, 36);
  assert.deepEqual(g.missing(sword3), ['Strength 36']);
  assert.equal(g.blocked(sword3), true);
  g.inventory.add(3);
  const slot = g.inventory.slots.indexOf(3);
  g.useSlot(slot);
  assert.notEqual(g.inventory.equipped.weapon, 3);
  assert.match(g.log.at(-1)!, /You need Strength 36/);
  g.points = 4;
  for (let i = 0; i < 4; i++) g.spend('strength');
  assert.deepEqual(g.missing(sword3), []);
  g.useSlot(g.inventory.slots.indexOf(3));
  assert.equal(g.inventory.equipped.weapon, 3);
  assert.equal(g.hero.stats.damage[1], sword3.power[1]);
});

test('every class can use its own starting weapon with the attributes of the adventure file', () => {
  const heroes = json('data/adventure.json').heroes;
  for (const [i, id] of [100, 101, 102].entries()) {
    const g = makeGame({ classId: id as 100, attrs: heroes[i] });
    const w = g.inventory.def(g.inventory.equipped.weapon ?? 0)!;
    assert.ok(w, `${id} has a weapon`);
    assert.deepEqual(g.missing(w), [], `${id} ${w.name}`);
  }
});

test('class gear of another hero is blocked', () => {
  const g = makeGame({ classId: 102 });
  assert.equal(g.blocked(g.inventory.def(3)!), true);
  assert.equal(g.blocked(g.inventory.def(56)!), false);
});

const facing = (g: Game, x: number, y: number) => { (g as unknown as { facing: { x: number; y: number } }).facing = { x, y }; g.hero.face(x, y); };

test('Barbarian block: frontal blows are stopped and cost no stamina (the executable charges none); blows from behind get through', () => {
  const setup = () => { const g = makeGame({ spawns: [{ id: '1', cx: 129, cy: 128 }] }); g.setGuard(true); facing(g, 1, 0); return g; };
  const front = setup();
  const heard: number[] = [];
  front.onSound = (id) => heard.push(id);
  front.stamina = 20; const s0 = front.stamina, hp0 = front.hero.hp;
  run(front, 6);
  assert.equal(front.hero.hp, hp0, 'no damage while covering up');
  assert.equal(front.stamina, s0, 'blocking neither spends nor regains stamina');
  assert.equal(front.hero.state, 'block');
  assert.ok(heard.some((id) => id >= 53 && id <= 56), 'c_cubrir');

  const behind = setup();
  facing(behind, -1, 0); // the goblin is behind him
  run(behind, 6);
  assert.ok(behind.hero.hp < behind.hero.stats.hp, 'a flank blow lands');
});

test('blocking holds the Cubrir pose, stops walking and attacking, and ends when the button is released', () => {
  const g = makeGame();
  g.click(g.hero.cx + 10, g.hero.cy);
  run(g, 0.3);
  assert.equal(g.hero.state, 'walk');
  g.setGuard(true);
  run(g, 0.2);
  const x = g.hero.cx;
  assert.equal(g.hero.state, 'block');
  g.swing(); run(g, 0.5);
  assert.equal(g.hero.state, 'block', 'cannot swing while covering');
  assert.equal(g.hero.cx, x);
  g.setGuard(false);
  run(g, 0.1);
  assert.equal(g.hero.state, 'idle');
});

test('the Amazon can plant her feet and shoot where she clicks (right button held)', () => {
  const g = makeGame({ classId: 101, spawns: [{ id: '1', cx: 134, cy: 128 }] });
  const gob = g.monsters[0]!;
  gob.stats.hp = 500; gob.hp = 500;
  g.setGuard(true);
  assert.equal(g.holding, true);
  assert.equal(g.blocking, false);
  const x = g.hero.cx;
  g.click(gob.cx, gob.cy); // aims, does not walk
  run(g, 1);
  assert.equal(g.hero.cx, x);
  assert.ok(gob.hp < 500, 'the arrow found him');
  g.setGuard(false);
  g.click(g.hero.cx - 5, g.hero.cy);
  run(g, 0.5);
  assert.ok(g.hero.cx < x, 'walks again once released');
});

test('the Sorceress right button holds position too (block is Barbarian-only)', () => {
  const g = makeGame({ classId: 102 });
  g.setGuard(true);
  assert.equal(g.blocking, false);
  assert.equal(g.holding, true);
});

const withScroll = (id: number, opts: GameOptions = {}) => { const g = makeGame(opts); g.inventory.add(id); return g; };
const read = (g: Game, id: number) => g.useSlot(g.inventory.slots.indexOf(id));

test('a storm parchment hits every monster in sight, costs mana and is used up; far monsters are spared', () => {
  const g = withScroll(87, { classId: 102, attrs: { strength: 19, skill: 23, resistance: 21, magic: 30 }, spawns: [{ id: '1', cx: 133, cy: 128 }, { id: '1', cx: 124, cy: 126 }, { id: '1', cx: 180, cy: 128 }] });
  const [a, b, far] = g.monsters;
  for (const m of g.monsters) { m.hp = 500; m.stats.hp = 500; }
  const power = spellPower(g.mana);
  read(g, 87);
  assert.equal(500 - a!.hp, Math.trunc(power / 2), 'storm: half the strength, whatever the armour');
  assert.ok(b!.hp < 500);
  assert.equal(far!.hp, 500);
  assert.equal(g.mana, 0, 'storm takes all the mana');
  assert.equal(g.inventory.slots.includes(87), false);
});

test('parchments need their Power requirement and enough mana, otherwise nothing happens', () => {
  const weak = withScroll(87, { classId: 100 }); // Barbarian power 11 < 20
  read(weak, 87);
  assert.ok(weak.inventory.slots.includes(87));
  assert.match(weak.log.at(-1)!, /You need Power 20/);
  const dry = withScroll(86, { classId: 102, attrs: { strength: 19, skill: 23, resistance: 21, magic: 30 } });
  dry.mana = 0;
  read(dry, 86);
  assert.ok(dry.inventory.slots.includes(86));
  assert.match(dry.log.at(-1)!, /Not enough mana/);
});

test('ice slows monsters: they cover half the distance', () => {
  const dist = (frozen: boolean) => {
    const g = withScroll(88, { classId: 102, attrs: { strength: 19, skill: 23, resistance: 21, magic: 30 }, spawns: [{ id: '1', cx: 133, cy: 128 }] });
    if (frozen) read(g, 88);
    const m = g.monsters[0]!;
    (g as unknown as { alerted: Set<unknown> }).alerted.add(m); // already roared: measure the chase only
    const x0 = m.cx;
    run(g, 0.8);
    return x0 - m.cx;
  };
  const normal = dist(false), slow = dist(true);
  assert.ok(normal > 0.3 && slow > 0.05 && slow < normal * 0.7, `normal ${normal}, slowed ${slow}`);
});

test('the life parchment turns mana into life and stamina and keeps half; attribute parchments are permanent', () => {
  const g = withScroll(92, { classId: 102, attrs: { strength: 19, skill: 23, resistance: 21, magic: 30 } });
  g.hero.hp = 10; g.stamina = 0; g.mana = 100;
  read(g, 92);
  assert.equal(g.mana, 50, 'half of the mana is left');
  assert.equal(g.hero.hp, 67, 'capped at maximum life');
  assert.equal(g.stamina, g.maxStamina, 'capped at maximum stamina');
  const h = withScroll(97, { classId: 102, attrs: { strength: 19, skill: 23, resistance: 21, magic: 30 } });
  const hp = h.hero.stats.hp;
  read(h, 97);
  assert.equal(h.attrs.resistance, 22);
  assert.equal(h.hero.stats.hp, hp + 2);
  const sacred = withScroll(99, { classId: 102, attrs: { strength: 19, skill: 23, resistance: 21, magic: 35 } });
  read(sacred, 99);
  assert.deepEqual(sacred.attrs, { strength: 21, skill: 25, resistance: 23, magic: 37 });
});

test('Berserk fills life, immunity fills mana', () => {
  const b = withScroll(101, { classId: 100, attrs: { strength: 32, skill: 24, resistance: 30, magic: 30 } });
  b.hero.hp = 5;
  read(b, 101);
  assert.equal(b.hero.hp, b.hero.stats.hp);
  assert.equal(b.attrs.strength, 34);
  const i = withScroll(102, { classId: 102, attrs: { strength: 19, skill: 23, resistance: 21, magic: 30 } });
  i.mana = 30;
  read(i, 102);
  assert.equal(i.attrs.magic, 32);
  assert.equal(i.mana, i.maxMana, 'immunity refills the pool');
});

const SORC = { strength: 19, skill: 23, resistance: 21, magic: 50 };

test('worn items add their attribute bonuses to life, stamina and mana, and take them away again', () => {
  const g = makeGame({ classId: 100, attrs: { strength: 32, skill: 24, resistance: 30, magic: 30 } });
  g.inventory.add(80); // amulet: +8 Strength, -4 Skill, -4 Resistance, -6 Power
  const hp0 = g.hero.stats.hp, st0 = g.maxStamina, mp0 = g.maxMana;
  g.useSlot(g.inventory.slots.indexOf(80));
  assert.equal(g.inventory.equipped.amulet, 80);
  assert.equal(g.eff.strength, 40);
  assert.equal(g.eff.resistance, 26);
  assert.equal(g.hero.stats.hp, hp0 - 10, 'Barbarian: 2.3 life per Resistance point, truncated');
  assert.equal(g.maxStamina, st0 - 4, 'one stamina per Resistance point');
  assert.equal(g.maxMana, mp0 - 12, 'Poder counts as Power');
  assert.equal(g.attrs.resistance, 30, 'the invested points are untouched');
  g.unequip('amulet');
  assert.equal(g.hero.stats.hp, hp0);
  assert.equal(g.maxMana, mp0);
});

test('requirements are checked against invested points, not against worn bonuses', () => {
  const g = makeGame({ classId: 100, attrs: { strength: 32, skill: 24, resistance: 30, magic: 30 } });
  g.inventory.add(80);
  g.useSlot(g.inventory.slots.indexOf(80));
  const def = g.inventory.def(1)!;
  assert.equal(g.missing({ ...def, req: { ...def.req, strength: 36 } }).length, 1, '32 invested + 8 worn must not satisfy a Strength 36 requirement');
});

test('a cursed ring lowers everything but raises armour; life never drops below 1 when it is put on', () => {
  const g = makeGame({ classId: 100, attrs: { strength: 32, skill: 24, resistance: 30, magic: 30 } });
  g.inventory.add(71);
  const armor0 = g.hero.stats.armor;
  g.hero.hp = 3;
  g.useSlot(g.inventory.slots.indexOf(71));
  assert.equal(g.hero.stats.armor, armor0 + 1);
  assert.equal(g.eff.magic, 28);
  assert.ok(g.hero.hp >= 1);
});

test('a staff does extra damage to the families it is made for and little to the rest', () => {
  const dmgOn = (race: number, staff: number) => {
    const g = makeGame({ classId: 102, attrs: SORC, spawns: [{ id: '1', cx: 129, cy: 128 }] });
    const m = g.monsters[0]!;
    m.hp = m.stats.hp = 100000; m.stats.armor = 0; m.stats.race = race;
    g.inventory.equipped.weapon = staff;
    g.refreshHeroStats();
    facing(g, 1, 0);
    let total = 0;
    for (let i = 0; i < 300; i++) { const before = m.hp; g.inventory.repairAll(); (g as unknown as { heroHitMonster(m: unknown, sneak: boolean): void }).heroHitMonster(m, false); total += before - m.hp; }
    return total / 300;
  };
  const a = dmgOn(1, 55), b = dmgOn(0, 55), c = dmgOn(32, 58), d = dmgOn(1, 58);
  assert.ok(a > b * 1.3, `staff 55: +64% against goblins (${a} vs ${b})`);
  assert.ok(c > d * 1.3, `staff 58: +70% against demons (${c} vs ${d})`);
});

test('scroll strength comes from the mana held: two per point, half of what is above 60; light keeps a third, fire feeds infernal monsters', () => {
  assert.equal(spellPower(10), 20);
  assert.equal(spellPower(30), 60);
  assert.equal(spellPower(50), 80);
  const g = makeGame({ classId: 102, attrs: SORC, spawns: [{ id: '1', cx: 131, cy: 128 }] });
  const m = g.monsters[0]!;
  m.hp = m.stats.hp = 900; m.stats.armor = 99;
  g.inventory.add(86); g.mana = 40;
  const p = spellPower(40);
  g.useSlot(g.inventory.slots.indexOf(86));
  assert.equal(900 - m.hp, Math.trunc(p / 4), 'spells ignore armour');
  assert.equal(Math.round(g.mana * 3), 40, 'a third of the mana is left');
});

const killHero = (g: Game) => {
  g.hero.hp = 1;
  const m = g.monsters[0]!;
  (g as unknown as { monsterStrike(m: unknown): void }).monsterStrike(m);
};

test('dying loses every item and one point of each ability, but keeps gold, level and unspent points', () => {
  const g = makeGame({ classId: 100, attrs: { strength: 32, skill: 24, resistance: 30, magic: 12 }, spawns: [{ id: '1', cx: 129, cy: 128 }] });
  g.inventory.add(104); g.inventory.gold = 250; g.level = 3; g.points = 4;
  killHero(g);
  assert.equal(g.hero.alive, false);
  assert.equal(g.dead, true);
  assert.equal(g.inventory.slots.some(Boolean), false);
  assert.deepEqual(g.inventory.equipped, {});
  assert.deepEqual(g.attrs, { strength: 31, skill: 23, resistance: 29, magic: 11 });
  assert.deepEqual(g.save(), { attrs: { strength: 31, skill: 23, resistance: 29, magic: 11 }, level: 3, xp: g.xp, points: 4, gold: 250 });
  assert.match(g.log.at(-1)!, /You have died: \d+ items lost/);
  assert.equal(g.hero.hp <= 0, true, 'a dead hero is not revived by stat refreshes');
});

test('an ability loses its point but never goes below 0 (the executable clamps at zero)', () => {
  const g = makeGame({ classId: 100, attrs: { strength: 1, skill: 5, resistance: 1, magic: 2 }, spawns: [{ id: '1', cx: 129, cy: 128 }] });
  killHero(g);
  assert.deepEqual(g.attrs, { strength: 0, skill: 4, resistance: 0, magic: 1 });
});

test('a worn legendary weapon survives death (the executable keeps ids 14, 48, 61); other worn gear is lost', () => {
  const g = makeGame({ classId: 100, attrs: { strength: 80, skill: 60, resistance: 60, magic: 12 }, spawns: [{ id: '1', cx: 129, cy: 128 }] });
  g.inventory.add(14); g.useSlot(g.inventory.slots.indexOf(14));
  assert.equal(g.inventory.equipped.weapon, 14);
  killHero(g);
  assert.equal(g.inventory.slots.includes(14), true, 'back in the pack');
  assert.equal(g.inventory.equipped.weapon, undefined);
  assert.equal(g.inventory.slots.filter(Boolean).length, 1, 'nothing else survives');
  const next = makeGame({ classId: 100, save: g.save() });
  assert.ok(next.inventory.slots.includes(14), 'the next attempt starts with it as well');
});

test('a new attempt continues with the saved hero: attributes, level, experience, points, gold and the starting kit', () => {
  const first = makeGame({ classId: 102, attrs: { strength: 19, skill: 23, resistance: 21, magic: 30 }, spawns: [{ id: '1', cx: 129, cy: 128 }] });
  first.level = 4; first.xp = 600; first.points = 8; first.inventory.gold = 77;
  killHero(first);
  const second = makeGame({ classId: 102, save: first.save() });
  assert.deepEqual(second.attrs, first.attrs);
  assert.equal(second.level, 4);
  assert.equal(second.xp, 600);
  assert.equal(second.points, 8);
  assert.equal(second.inventory.gold, 77);
  assert.equal(second.hero.alive, true);
  assert.equal(second.hero.stats.hp, 25 + 1 + 2 * second.attrs.resistance, 'Sorceress level 4: 25 + level/4 + 2 x Resistance');
  assert.ok(second.inventory.equipped.weapon, 'back with the class weapon in hand');
});

test('left click wears equipment but only reminds you about potions and scrolls; right click uses them', () => {
  const g = makeGame({ classId: 102, attrs: SORC });
  g.inventory.add(86);
  const at = g.inventory.slots.indexOf(86);
  g.mana = 100;
  g.activate(at, 'left');
  assert.ok(g.inventory.slots.includes(86), 'left click leaves the scroll alone');
  assert.match(g.log.at(-1)!, /Right-click to use/);
  g.activate(at, 'right');
  assert.equal(g.inventory.slots.includes(86), false, 'right click reads it');
  const p = g.inventory.slots.indexOf(104);
  g.hero.hp = 5;
  g.activate(p, 'left');
  assert.equal(g.hero.hp, 5, 'left click does not drink');
  g.activate(p, 'right');
  assert.ok(g.hero.hp > 5);
});

test('left click still wears a weapon, and right click does too', () => {
  const g = makeGame({ classId: 100, attrs: { strength: 60, skill: 60, resistance: 30, magic: 30 } });
  g.inventory.add(2);
  const w0 = g.inventory.equipped.weapon;
  g.activate(g.inventory.slots.indexOf(2), 'left');
  assert.equal(g.inventory.equipped.weapon, 2);
  assert.ok(w0 !== 2);
  g.activate(g.inventory.slots.indexOf(w0!), 'right');
  assert.equal(g.inventory.equipped.weapon, w0);
});

test('keys 1-4 use the first four light objects, skipping heavy gear in the backpack', () => {
  const g = makeGame({ classId: 100 });
  g.inventory.slots[0] = 2; // a sword in the first slot is a heavy object and does not count
  g.inventory.slots[1] = 104;
  g.hero.hp = 5;
  g.useQuick(1);
  assert.ok(g.hero.hp > 5, 'key 1 drank the first light object');
  assert.equal(g.inventory.slots[0], 2, 'the sword was not touched');
  const before = g.inventory.slots.slice();
  g.useQuick(0); g.useQuick(5);
  assert.deepEqual(g.inventory.slots, before, 'only 1-4 are quick keys');
});

test('difficulty changes monster armour (halved / doubled) and attack delay (x1.5 / x2/3), not life or damage', () => {
  const stats = (d: 0 | 1 | 2) => {
    const g = makeGame({ difficulty: d, spawns: [{ id: '8', cx: 140, cy: 128 }] });
    const m = g.monsters[0]!;
    return { hp: m.stats.hp, armor: m.stats.armor, dmg: m.stats.damage, cd: m.stats.cooldown };
  };
  const easy = stats(0), normal = stats(1), hard = stats(2);
  assert.deepEqual([easy.hp, hard.hp], [normal.hp, normal.hp], 'life is the same on every level');
  assert.deepEqual([easy.dmg, hard.dmg], [normal.dmg, normal.dmg], 'so is the damage');
  assert.equal(normal.armor, 3, 'the orc captain has armour 3 to scale');
  assert.equal(easy.armor, Math.trunc(normal.armor / 2));
  assert.equal(hard.armor, normal.armor * 2);
  assert.ok(Math.abs(easy.cd[0] - normal.cd[0] * 1.5) < 1e-9 && Math.abs(hard.cd[1] - normal.cd[1] * 2 / 3) < 1e-9);
});

test('the orc general (61) has 2 extra armour in the executable, an orc master (52) 1; ordinary monsters none', () => {
  const avg = (id: string) => {
    const g = makeGame({ classId: 100, attrs: { strength: 60, skill: 24, resistance: 30, magic: 12 }, spawns: [{ id, cx: 300, cy: 300 }] });
    const m = g.monsters[0]!; m.hp = 1e6; m.stats.hp = 1e6; m.stats.armor = 0; m.stats.block = 0; m.stats.stun = 0;
    const hit = g as unknown as { heroHitMonster(m: unknown, s: boolean, ranged?: boolean): void };
    let t = 0;
    for (let i = 0; i < 600; i++) { m.hp = 1e6; g.inventory.repairAll(); hit.heroHitMonster(m, false, true); t += 1e6 - m.hp; }
    return t / 600;
  };
  const plain = avg('8'), master = avg('52'), general = avg('61');
  assert.ok(Math.abs(plain - master - 1) < 0.3, `master ${master} vs ${plain}`);
  assert.ok(Math.abs(plain - general - 2) < 0.3, `general ${general} vs ${plain}`);
});

test('the monster receive routine: a blow from behind is tripled, an almost-behind one doubled, ranged ones never; armour comes off after', () => {
  const g = makeGame({ spawns: [{ id: '1', cx: 300, cy: 300 }] });
  const m = g.monsters[0]!; m.hp = 1e6; m.stats.hp = 1e6; m.stats.armor = 0; m.stats.block = 0; m.stats.stun = 0;
  const hit = g as unknown as { heroHitMonster(m: unknown, s: boolean, ranged?: boolean): void };
  const blow = (heroDir: number, ranged = false) => { g.hero.dir = heroDir; m.dir = 3; m.hp = 1e6; g.inventory.repairAll(); hit.heroHitMonster(m, false, ranged); return 1e6 - m.hp; };
  // same seed each time: the roll before the multiplier is identical, so compare with a front blow
  const front = (() => { let t = 0; for (let i = 0; i < 400; i++) t += blow(7); return t / 400; })(); // opposite side: x1
  const behind = (() => { let t = 0; for (let i = 0; i < 400; i++) t += blow(3); return t / 400; })();
  const side = (() => { let t = 0; for (let i = 0; i < 400; i++) t += blow(4); return t / 400; })();
  const shot = (() => { let t = 0; for (let i = 0; i < 400; i++) t += blow(3, true); return t / 400; })();
  assert.ok(Math.abs(behind / front - 3) < 0.35, `behind ${behind} vs front ${front}`);
  assert.ok(Math.abs(side / front - 2) < 0.3, `side ${side} vs front ${front}`);
  assert.ok(Math.abs(shot / front - 1) < 0.2, `a shot from the same side is not tripled: ${shot}`);
  m.stats.armor = 1e3;
  assert.equal(blow(7), 1, 'armour takes the blow down to the minimum of 1');
});

test('a monster covers frontal melee blows by its Rnd_Bloqueo percent and shrugs off blows under its Aturdirse', () => {
  const g = makeGame({ spawns: [{ id: '1', cx: 300, cy: 300 }] });
  const m = g.monsters[0]!; m.hp = 1e6; m.stats.hp = 1e6; m.stats.armor = 0;
  const hit = g as unknown as { heroHitMonster(m: unknown, s: boolean, ranged?: boolean): void };
  let blocked = 0;
  m.stats.block = 30; m.stats.stun = 0;
  for (let i = 0; i < 1000; i++) { m.setState('idle'); g.hero.dir = 7; m.dir = 3; g.inventory.repairAll(); const hp = m.hp; hit.heroHitMonster(m, false); if (m.hp === hp) blocked++; }
  assert.ok(blocked > 240 && blocked < 360, `blocked ${blocked} of 1000 at 30 %`);
  m.stats.block = 0; m.stats.stun = 1e3; // never staggers
  m.setState('idle'); g.hero.dir = 7; m.dir = 3;
  hit.heroHitMonster(m, false);
  assert.equal(m.state, 'idle', 'a light blow does not stagger it');
  m.stats.stun = 0;
  hit.heroHitMonster(m, false);
  assert.equal(m.state, 'hit');
});

test('knowledge potion adds a point of Power (to the class cap), chance potion refills one of life, stamina or mana', () => {
  const g = makeGame({ classId: 102, attrs: { strength: 19, skill: 23, resistance: 21, magic: 30 } });
  g.inventory.add(112);
  g.useSlot(g.inventory.slots.indexOf(112));
  assert.equal(g.attrs.magic, 31);
  assert.ok(!g.inventory.slots.includes(112));
  const capped = makeGame({ classId: 102, attrs: { strength: 19, skill: 23, resistance: 21, magic: 90 } });
  capped.inventory.add(112); capped.useSlot(capped.inventory.slots.indexOf(112));
  assert.equal(capped.attrs.magic, 90, 'Sorceress Power stops at 90');
  const seen = new Set<string>();
  const c = makeGame({ classId: 102, attrs: { strength: 19, skill: 23, resistance: 21, magic: 30 } });
  for (let n = 0; n < 40; n++) {
    c.hero.hp = 1; c.stamina = 0; c.mana = 0;
    c.inventory.add(111); c.useSlot(c.inventory.slots.indexOf(111));
    const full = [c.hero.hp === c.hero.stats.hp, c.stamina === c.maxStamina, c.mana === c.maxMana];
    assert.equal(full.filter(Boolean).length, 1, 'exactly one pool is refilled');
    seen.add(full.indexOf(true).toString());
  }
  assert.equal(seen.size, 3, 'all three can come up');
});

test('a skeleton lies dormant until the hero is close, then rises and fights', () => {
  const g = makeGame({ spawns: [{ id: '9', cx: 140, cy: 128 }] });
  const sk = g.monsters[0]!;
  assert.ok(sk.dormant);
  run(g, 1);
  assert.ok(sk.dormant, 'too far to hear the hero');
  g.click(sk.cx, sk.cy); // dormant monsters cannot be targeted
  assert.equal(g.target, null);
  sk.cx = g.hero.cx + 3; sk.cy = g.hero.cy;
  run(g, 0.1);
  assert.equal(sk.dormant, false);
  assert.equal(sk.state, 'appear');
  run(g, 4);
  assert.notEqual(sk.state, 'appear');
  assert.ok(sk.alive);
});

test('monsters with an Alarma animation roar before they chase', () => {
  const g = makeGame({ spawns: [{ id: '1', cx: 132, cy: 128 }] });
  const m = g.monsters[0]!;
  run(g, 0.1);
  assert.equal(m.state, 'taunt');
  const x0 = m.cx;
  run(g, 0.2);
  assert.equal(m.cx, x0, 'does not move while roaring');
  run(g, 3);
  assert.notEqual(m.state, 'taunt');
});

test('demons pick their second attack about half the time', () => {
  const g = makeGame({ spawns: [{ id: '19', cx: 129, cy: 128 }] });
  const m = g.monsters[0]!;
  const seen = new Set<boolean>();
  for (let i = 0; i < 400 && seen.size < 2; i++) { g.update(1 / 20, null); if (m.state === 'attack') seen.add(m.secondAttack); }
  assert.equal(seen.size, 2);
});

test('spells create effects: rings from the caster and something on every enemy hit; they expire', () => {
  const g = withScroll(90, { classId: 102, attrs: { strength: 19, skill: 23, resistance: 21, magic: 30 }, spawns: [{ id: '1', cx: 133, cy: 128 }, { id: '1', cx: 134, cy: 129 }] });
  assert.equal(g.fx.length, 0);
  read(g, 90);
  const rings = g.fx.filter((f) => f.flat && !f.follow);
  const onEnemies = g.fx.filter((f) => f.follow);
  assert.equal(rings.length, 2, 'incineration sends two rings');
  assert.ok(onEnemies.length >= 10, `flames on both enemies (${onEnemies.length})`);
  run(g, 4);
  assert.equal(g.fx.length, 0, 'effects clean themselves up');
});

test('earth shakes the screen; level-up and potions glow', () => {
  const g = withScroll(91, { classId: 102, attrs: { strength: 19, skill: 23, resistance: 21, magic: 30 } });
  read(g, 91);
  assert.ok(g.shake > 0.5);
  run(g, 1);
  assert.equal(g.shake, 0);
  g.inventory.add(104);
  const n = g.fx.length;
  g.useSlot(g.inventory.slots.indexOf(104));
  assert.ok(g.fx.length > n, 'potion glow');
  const lv = withScroll(90, { classId: 102, spawns: [{ id: '1', cx: 129, cy: 128 }] });
  lv.xp = xpForLevel(2) - 1;
  const gob = lv.monsters[0]!;
  gob.hp = 1;
  lv.click(gob.cx, gob.cy);
  for (let t = 0; t < 600 && lv.level < 2; t++) lv.update(1 / 60, null);
  assert.equal(lv.level, 2);
  assert.ok(lv.fx.some((f) => f.tex === 119), 'level-up flare');
});

test('a hero who finishes a mission carries everything into the next one; dying carries only growth', () => {
  const g = makeGame({ classId: 100 });
  g.inventory.add(86); g.inventory.add(5);
  g.inventory.gold = 777; g.xp = 30; g.points = 3;
  g.inventory.equip(g.inventory.slots.indexOf(5));
  const c = g.carry();
  assert.deepEqual(c.inv!.equipped.weapon, 5);
  assert.ok(c.inv!.slots.includes(86));
  assert.equal(c.gold, 777);
  const next = makeGame({ classId: 100, save: c });
  assert.equal(next.inventory.equipped.weapon, 5);
  assert.ok(next.inventory.slots.includes(86));
  assert.equal(next.inventory.gold, 777);
  assert.equal(next.points, 3);
  assert.ok(next.hero.stats.damage[1] >= 7, 'the carried sabre is wielded');
  assert.equal(next.save().inv, undefined, 'dying loses the items');
  const poor = makeGame({ classId: 100, save: g.save() });
  assert.ok(poor.inventory.slots.includes(104) && !poor.inventory.slots.includes(86), 'a retry starts with the basic kit');
  const junk = makeGame({ classId: 100, save: { ...c, inv: { slots: [999999, 86, -3], equipped: { weapon: 424242 } } } });
  assert.deepEqual(junk.inventory.slots.filter((x) => x), [86], 'unknown items in a save are dropped');
  assert.equal(junk.inventory.equipped.weapon, undefined);
});

test('border wall slices stand on their own cell and the empty wall frame still blocks', () => {
  // Lost Forrest border slice 610 (32x89, hotspot -311,-198) and a cave wall strip are slabs; a rock piece and a tree are not
  assert.ok(isSlabFrame(32, 89, -311, -198) && isSlabFrame(32, 152, -48, -137));
  assert.ok(!isSlabFrame(32, 62, -192, -75) && !isSlabFrame(64, 106, -128, -58));
  // runs along +cx need slices leaning down-right (+1), runs along +cy the other way; flat ones and corners stay as they are
  assert.ok(!slabFlip(1, true, false) && slabFlip(-1, true, false) && slabFlip(1, false, true) && !slabFlip(-1, false, true));
  assert.ok(!slabFlip(0, true, false) && !slabFlip(1, true, true));
  const r = wallRect({ x: 100, y: -200 }, 32);
  assert.equal(r.x, 84); // centred on the cell
  assert.ok(r.bottom < -200 + 1 && r.bottom > -230); // base at the cell, not ~100 px above it as the hotspot says
  const dim = 256;
  const objects = new Uint32Array(dim * dim);
  objects[10 * dim + 10] = (2 << 10) | WALL_BLOCKER;
  const map: GameMap = { dim, tileset: 'Outside', terrain: new Uint16Array(dim * dim).fill(340), objects, markers: [], scripts: [], scriptAt: new Int8Array(dim * dim).fill(-1) };
  const w = new World(map, { ...fakeAtlas, has: (id: number) => id !== WALL_BLOCKER } as unknown as Atlas, [fakeAtlas, fakeAtlas, { ...fakeAtlas, has: (id: number) => id !== WALL_BLOCKER } as unknown as Atlas]);
  assert.equal(w.blocked[10 * dim + 10], 1);
});

test('projectile maths: heading, range and line of sight', async () => {
  const { makeProjectile, projectileAngle, lineClear, ARROW_SPEED } = await import('../src/game/projectiles.ts');
  const p = makeProjectile('arrow', 10, 10, 1, 0, 8, true, () => {});
  assert.ok(Math.abs(Math.hypot(p.vx, p.vy) - ARROW_SPEED) < 1e-9);
  assert.ok(Math.abs(p.life * ARROW_SPEED - 8) < 1e-9);
  assert.ok(Math.abs(projectileAngle(p) - Math.atan2(-16, 32)) < 1e-9); // +cx runs to the lower right on screen
  assert.ok(lineClear(() => true, 0, 0, 6, 0));
  assert.ok(!lineClear((x) => x < 3, 0, 0, 6, 0));
});

test('the Amazon\'s arrow flies and hurts what it reaches', () => {
  const g = makeGame({ classId: 101, attrs: { strength: 20, skill: 27, resistance: 22, magic: 15 }, spawns: [{ id: '1', cx: 133, cy: 128 }] });
  const m = g.monsters[0]!;
  const hp0 = m.hp;
  g.click(m.cx, m.cy);
  let sawArrow = false;
  for (let t = 0; t < 4 && m.hp === hp0 && m.alive; t += 1 / 60) { g.update(1 / 60, null); if (g.projectiles.some((p) => p.kind === 'arrow' && p.friendly)) sawArrow = true; }
  assert.ok(sawArrow, 'an arrow was in the air');
  assert.ok(m.hp < hp0 || !m.alive, 'and it landed');
});

test('archers and mages keep their distance and shoot the hero', () => {
  for (const id of ['23', '25']) {
    const g = makeGame({ spawns: [{ id, cx: 134, cy: 128 }] });
    const m = g.monsters[0]!;
    m.dormant = false;
    const hp0 = g.hero.hp;
    let shots = 0, closest = Infinity;
    const seen = new Set<unknown>();
    for (let t = 0; t < 12; t += 1 / 60) {
      g.update(1 / 60, null);
      for (const p of g.projectiles) if (!p.friendly && !seen.has(p)) { seen.add(p); shots++; }
      closest = Math.min(closest, Math.hypot(g.hero.cx - m.cx, g.hero.cy - m.cy));
    }
    assert.ok(shots >= 1, `${id} fired`);
    assert.ok(g.hero.hp < hp0 || shots > 0);
    assert.ok(closest > 2.5, `${id} did not walk up to melee (closest ${closest.toFixed(1)})`);
  }
});

test('a raised shield stops an arrow from the front', () => {
  const g = makeGame({ spawns: [{ id: '23', cx: 134, cy: 128 }] });
  g.monsters[0]!.dormant = false;
  g.stamina = 20;
  g.blocking = true;
  (g as unknown as { facing: { x: number; y: number } }).facing = { x: 1, y: 0 }; // towards the archer
  const hp0 = g.hero.hp;
  const seen = new Set<unknown>();
  for (let t = 0; t < 3; t += 1 / 60) { g.update(1 / 60, null); for (const p of g.projectiles) seen.add(p); }
  const shots = seen.size;
  assert.ok(shots >= 1);
  assert.equal(g.hero.hp, hp0);
});

test('a world with water, wall slices and scenery builds its chunks', () => {
  const dim = 256;
  const terrain = new Uint16Array(dim * dim).fill(340);
  const objects = new Uint32Array(dim * dim);
  for (let i = 0; i < 6; i++) { terrain[(100 + i) * dim + 100] = 511; objects[(100 + i) * dim + 103] = (2 << 10) | 610; }
  const map: GameMap = { dim, tileset: 'Outside', terrain, objects, markers: [], scripts: [], scriptAt: new Int8Array(dim * dim).fill(-1) };
  const slab = { ...fakeAtlas, rect: () => [0, 0, 32, 89, -311, -198], slope: () => 1 } as unknown as Atlas;
  const w = new World(map, fakeAtlas, [fakeAtlas, fakeAtlas, slab, fakeAtlas]);
  assert.doesNotThrow(() => w.update(102, 102));
  assert.equal(w.blocked[102 * dim + 103], 1);
});

test('the map list resolves ids, files exist and start cells fall back for multiplayer arenas', async () => {
  const { MAPS, findMap, mapStart, tilesetDir } = await import('../src/game/maplist.ts');
  const { existsSync } = await import('node:fs');
  assert.equal(MAPS.length, 41);
  for (const m of MAPS) assert.ok(existsSync(new URL(`../public/assets/${m.file}`, import.meta.url)), m.file);
  assert.equal(findMap('nhs/12')?.name, 'Mission 12');
  assert.equal(findMap('12')?.id, 'nhs/12');
  assert.equal(findMap('mp/holocaust_8p')?.group, 'Multiplayer');
  assert.equal(findMap('nope'), undefined);
  const mk = (id: number) => ({ id, cx: id, cy: 0 });
  assert.equal(mapStart({ markers: [mk(5), mk(101), mk(100)] }, 101)?.id, 101);
  assert.equal(mapStart({ markers: [mk(5), mk(112), mk(110)] }, 100)?.id, 110); // arena: lowest start marker
  assert.equal(mapStart({ markers: [mk(5)] }, 100), undefined);
  assert.equal(tilesetDir({ tileset: 'Dungeon' }), 'dungeon');
});

// ---- numbers read out of Nightstone.exe (src/game/rules.ts) ----

test('experience curve: 195 (n-1)^2 + 200, level 50 at most, and the class tables of the executable', async () => {
  const r = await import('../src/game/rules.ts');
  assert.equal(r.xpForLevel(1), 0);
  assert.equal(r.xpForLevel(2), 395);
  assert.equal(r.xpForLevel(10), 15995);
  assert.equal(r.xpForLevel(50), 468395);
  assert.equal(r.MAX_LEVEL, 50);
  assert.deepEqual(r.START_ATTRS[100], { strength: 32, skill: 24, resistance: 30, magic: 11 });
  assert.deepEqual(r.START_ATTRS[102], { strength: 19, skill: 23, resistance: 21, magic: 30 });
  assert.equal(r.ATTR_CAPS[102].magic, 90);
  assert.equal(r.ATTR_CAPS[100].magic, 45);
  // derived pools at level 1 with the starting attributes
  assert.equal(r.maxLife(100, 1, 30), 112);
  assert.equal(r.maxLife(101, 1, 22), 79);
  assert.equal(r.maxLife(102, 1, 21), 67);
  assert.equal(r.maxStamina(100, 1, 30), 45);
  assert.equal(r.maxStamina(101, 1, 22), 35);
  assert.equal(r.maxStamina(102, 1, 21), 35);
  assert.equal(r.maxMana(1, 30), 61);
  assert.equal(r.maxMana(1, 11), 23);
  // damage: integer division truncates, so weak heroes add nothing; a 0..2 sum is re-rolled to 1..3
  assert.equal(r.classDamage(100, r.START_ATTRS[100], 1), 1);
  assert.equal(r.classDamage(100, { strength: 90, skill: 85, resistance: 1, magic: 1 }, 34), 7 + 3 + 2);
  assert.equal(r.classDamage(102, { strength: 1, skill: 23, resistance: 1, magic: 25 }, 1), 0, 'both terms truncate to zero');
  assert.equal(r.classDamage(102, { strength: 1, skill: 1, resistance: 1, magic: 1 }, 1), -3, 'a feeble sorceress subtracts');
  assert.equal(r.minDamage(0, 0.99), 3);
  assert.equal(r.minDamage(2, 0), 1);
  assert.equal(r.minDamage(3, 0.5), 3);
  assert.equal(r.minDamage(-4, 0.5), -4);
  assert.equal(r.hitReceived(10, 3), 6);
  assert.equal(r.hitReceived(2, 5), 1);
  assert.equal(r.STAFF_MANA[55], 11.25);
});

test('level-ups use the real curve, refill every pool and stop at level 50', () => {
  const g = makeGame({ classId: 100 });
  g.hero.hp = 3; g.stamina = 1; g.mana = 0;
  g.xp = xpForLevel(2);
  (g as unknown as { checkLevel(): void }).checkLevel();
  assert.equal(g.level, 2);
  assert.equal(g.points, 4);
  assert.equal(g.hero.hp, g.hero.stats.hp);
  assert.equal(g.stamina, g.maxStamina);
  assert.equal(g.mana, g.maxMana);
  g.level = 49; g.xp = xpForLevel(60);
  (g as unknown as { checkLevel(): void }).checkLevel();
  assert.equal(g.level, 50, 'capped');
});

test('a class cannot train an attribute past its cap', () => {
  const g = makeGame({ classId: 102, attrs: { strength: 60, skill: 23, resistance: 21, magic: 30 } });
  g.points = 3;
  assert.equal(g.spend('strength'), false, 'Sorceress strength tops out at 60');
  assert.equal(g.points, 3);
  assert.equal(g.spend('magic'), true);
});

test('the Sorceress shoots her staff for mana; with none left it stays silent', () => {
  const g = makeGame({ classId: 102, attrs: SORC, spawns: [{ id: '1', cx: 132, cy: 128 }] });
  g.inventory.equipped.weapon = 57;
  g.refreshHeroStats();
  facing(g, 1, 0);
  g.mana = 20;
  (g as unknown as { heroStrike(): void }).heroStrike();
  assert.ok(Math.abs(g.mana - (20 - 5.45)) < 1e-9, 'staff 57 costs 1090/200 points');
  assert.equal(g.projectiles.length, 1);
  assert.equal(g.projectiles[0]!.kind, 'bolt');
  g.projectiles.length = 0;
  g.mana = 1;
  (g as unknown as { heroStrike(): void }).heroStrike();
  assert.equal(g.projectiles.length, 0);
  assert.equal(g.mana, 1);
});

/** A game on a flat map whose cells carry the given scripts ({cell: script index}). */
function scriptGame(scripts: GameMap['scripts'], cells: Record<string, number>, opts: GameOptions = {}): Game {
  const dim = 256;
  const map: GameMap = { dim, tileset: 'Outside', terrain: new Uint16Array(dim * dim).fill(340), objects: new Uint32Array(dim * dim), markers: [], scripts, scriptAt: new Int8Array(dim * dim).fill(-1) };
  for (const [k, v] of Object.entries(cells)) { const [x, y] = k.split(',').map(Number); map.scriptAt[y! * dim + x!] = v; }
  const data = (makeGame() as unknown as { data: GameData }).data;
  return new Game(new World(map, fakeAtlas, []), data, { cx: 128, cy: 128 }, { spawns: [], ...opts });
}

test('script command 2 (Bdt Entrar / Salir) teleports the hero and works again after leaving the cell', () => {
  const g = scriptGame([{ index: 0, name: 'Bdt Entrar', commands: [{ id: 2, args: [200, 60, 0, 0] }] }], { '131,128': 0 });
  g.click(133, 128);
  run(g, 3);
  assert.ok(Math.abs(g.hero.cx - 200) < 4 && Math.abs(g.hero.cy - 60) < 4, `hero at ${g.hero.cx},${g.hero.cy}`);
  assert.equal(g.goalReached, false);
});

test('script commands 5, 7 and 8 raise a monster, remove a gate and clear the trigger cell object', () => {
  const g = scriptGame([{ index: 0, name: '', commands: [{ id: 5, args: [8, 2, 140, 128] }, { id: 7, args: [150, 150, 0, 0] }, { id: 8, args: [0, 0, 0, 0] }] }], { '131,128': 0 });
  const w = (g as unknown as { world: World }).world;
  w.setObject(150, 150, (2 << 10) | 7);
  w.setObject(131, 128, (2 << 10) | 7);
  g.runScript(0, 131, 128);
  const m = g.monsters.at(-1)!;
  assert.ok(m.stats.hp > 0 && m.stats.name.startsWith('ESQUELETO'));
  assert.equal(m.state, 'appear');
  assert.equal(m.dir, 2);
  assert.equal(w.map.objects[150 * 256 + 150], 0);
  assert.equal(w.map.objects[128 * 256 + 131], 0);
});

test('Exit level with command 3 needs every enemy of the race mask dead', () => {
  const g = scriptGame([{ index: 0, name: 'Bdt Salirnivel', commands: [{ id: 3, args: [1, 0, 0, 0] }] }], { '131,128': 0 });
  g.runScript(0, 131, 128); // no monsters at all: completes
  assert.equal(g.status, 'complete');
  assert.equal(g.goalReached, true);
  const h = scriptGame([{ index: 0, name: 'Bdt Salirnivel', commands: [{ id: 3, args: [1, 0, 0, 0] }] }], { '131,128': 0 }, { spawns: [{ id: '1', cx: 140, cy: 140 }] });
  h.runScript(0, 131, 128);
  assert.equal(h.status, 'playing');
  assert.equal(h.log.at(-1), 'You must meet the objective before exiting');
  h.monsters[0]!.hurt(10000);
  h.runScript(0, 131, 128);
  assert.equal(h.status, 'complete');
  assert.equal(h.log.at(-2), 'You have completed this level');
});

test('Exit level with command 11 needs the item in the pack; command 12 always ends the level; 4 starts the mission clock', () => {
  const sc: GameMap['scripts'] = [{ index: 0, name: 'Bdt Salirnivel', commands: [{ id: 11, args: [130, 0, 0, 0] }] }, { index: 1, name: 'Bdt Salirnivel', commands: [{ id: 12, args: [0, 0, 0, 0] }] }, { index: 2, name: '', commands: [{ id: 4, args: [60, 0, 0, 0] }] }];
  const g = scriptGame(sc, {});
  g.runScript(0, 0, 0);
  assert.equal(g.status, 'playing');
  assert.equal(g.clock, null, 'no clock until script 2 sets it');
  g.runScript(2, 0, 0);
  assert.equal(g.clock, 60);
  g.inventory.add(130);
  g.runScript(0, 0, 0);
  assert.equal(g.status, 'complete');
  const h = scriptGame(sc, { '131,128': 1 });
  h.click(133, 128);
  run(h, 3);
  assert.equal(h.goalReached, true, 'walking over the exit cell ends the level');
});

test('command 4 starts the mission clock (setting it, not adding) and it fails the mission at zero', () => {
  const g = scriptGame([{ index: 0, name: '', commands: [{ id: 4, args: [2, 0, 0, 0] }] }], {});
  g.clock = 100;
  g.runScript(0, 0, 0);
  assert.equal(g.clock, 2, 'set to a0 seconds');
  run(g, 3.5);
  assert.equal(g.status, 'failed');
  assert.equal(g.log.at(-1), 'You have failed the mission');
});

test('every campaign map: its scripts run without errors and the start cell does not end the level', async () => {
  const { readdirSync } = await import('node:fs');
  const { gunzipSync } = await import('node:zlib');
  const { parseMap } = await import('../src/formats/map.ts');
  const dir = new URL('../public/assets/maps/nhs/', import.meta.url);
  const data = (makeGame() as unknown as { data: GameData }).data;
  let maps = 0, scripts = 0;
  for (const f of readdirSync(dir)) {
    const map = parseMap(new Uint8Array(gunzipSync(readFileSync(new URL(f, dir)))));
    const st = map.markers.find((m) => m.id === 100) ?? map.markers.find((m) => m.id >= 100) ?? { cx: 128, cy: 128 };
    const g = new Game(new World(map, fakeAtlas, []), data, st, { spawns: [] });
    run(g, 1);
    assert.equal(g.status, 'playing', `${f}: level ends at the start`);
    for (const sc of map.scripts) {
      const i = map.scriptAt.indexOf(sc.index);
      g.runScript(sc.index, i >= 0 ? i % map.dim : 0, i >= 0 ? Math.floor(i / map.dim) : 0);
      scripts++;
      if (g.status !== 'playing') break;
    }
    maps++;
  }
  assert.equal(maps, 35);
  assert.ok(scripts > 300, `${scripts} scripts`);
});

test('durability: the weapon wears on about one blow in eleven (1-2 points over its level), breaks, the three legendary weapons never wear', () => {
  const g = makeGame({ spawns: [{ id: '1', cx: 300, cy: 300 }] });
  const m = g.monsters[0]!; m.hp = 1e9; m.stats.hp = 1e9; m.stats.block = 0;
  const hit = (g as unknown as { heroHitMonster(m: unknown, s: boolean): void });
  assert.equal(g.inventory.leftOf('weapon'), 56, 'the scimitar has 56');
  const start = 56;
  for (let i = 0; i < 400; i++) { hit.heroHitMonster(m, false); if (!g.inventory.equipped.weapon) break; }
  const used = start - (g.inventory.leftOf('weapon') ?? 0);
  assert.ok(g.inventory.equipped.weapon === undefined || (used > 5 && used < 40), `used ${used} points in 400 blows`);
  // run it long enough and it breaks
  for (let i = 0; i < 4000 && g.inventory.equipped.weapon; i++) hit.heroHitMonster(m, false);
  assert.equal(g.inventory.equipped.weapon, undefined, 'broken');
  assert.match(g.log.at(-1)!, /broke/);
  assert.deepEqual(g.hero.stats.damage, [1, 2], 'bare hands again');
  g.inventory.add(14); g.inventory.equipped.weapon = 14; // the Ripping Sword never wears
  for (let i = 0; i < 2000; i++) hit.heroHitMonster(m, false);
  assert.equal(g.inventory.equipped.weapon, 14);
  assert.equal(g.inventory.leftOf('weapon'), 80);
});

test('Inventory.wear: amounts are divided by the item level unless flat; durability is capped at 255', () => {
  const g = makeGame();
  const inv = g.inventory;
  inv.equipped.armor = 0; delete inv.equipped.armor;
  const def = inv.def(28)!; // a shield
  inv.add(28); inv.equip(inv.slots.indexOf(28));
  const lvl = def.level;
  inv.wear('shield', 5, true);
  assert.equal(inv.leftOf('shield'), def.durability - 5, 'flat: not divided');
  inv.repairAll();
  inv.wear('shield', 6);
  assert.equal(inv.leftOf('shield'), def.durability - (lvl > 0 ? Math.trunc(6 / lvl) : 6));
  assert.ok(Math.max(...[...inv.itemDefs.values()].map((d) => d.durability)) <= 255, '999 in the data reads as 255');
});

test('durability: armour and shield wear when the hero is hit, wear travels with the item, the restoration parchment repairs, saves keep it', () => {
  const g = makeGame();
  const inv = g.inventory;
  inv.add(28); inv.add(28);
  inv.slotLeft[inv.slots.indexOf(28)] = 10; // one worn shield has 10 left
  inv.equip(inv.slots.indexOf(28));
  assert.equal(inv.leftOf('shield'), 10);
  inv.wear('shield', 3);
  assert.equal(inv.leftOf('shield'), 7);
  inv.equip(inv.slots.indexOf(28)); // swap with the new one in the pack
  assert.equal(inv.leftOf('shield'), 60, 'the fresh shield is as new');
  assert.equal(inv.slotLeft[inv.slots.indexOf(28)], 7, 'the old one kept its wear in the pack');
  const saved = g.carry();
  assert.deepEqual(saved.inv!.left![inv.slots.indexOf(28)], 7);
  const g2 = makeGame({ save: saved });
  assert.equal(g2.inventory.slotLeft[g2.inventory.slots.indexOf(28)], 7);
  inv.repairAll();
  assert.equal(inv.slotLeft[inv.slots.indexOf(28)], 0);
  inv.wear('armor'); // nothing worn: no effect
  assert.equal(inv.leftOf('armor'), null);
});

test('blood mode puts a red puff on a creature that is hit; off, nothing', () => {
  const g = makeGame({ spawns: [{ id: '1', cx: 300, cy: 300 }] });
  const m = g.monsters[0]!; m.hp = 1e6; m.stats.hp = 1e6;
  const hit = (g as unknown as { heroHitMonster(m: unknown, s: boolean): void });
  const before = g.fx.length;
  hit.heroHitMonster(m, false);
  assert.equal(g.fx.length, before + 1);
  assert.equal(g.fx.at(-1)!.tex, 75);
  g.blood = false;
  hit.heroHitMonster(m, false);
  assert.equal(g.fx.length, before + 1);
});

test('monsters without a patrol route roam within their search radius of home and wait between trips (executable idle routine)', () => {
  const g = makeGame({ spawns: [{ id: '1', cx: 150, cy: 150 }] }); // goblin: Radio_Busqueda 5
  const m = g.monsters[0]!;
  let far = 0, moved = false;
  for (let i = 0; i < 60 * 40; i++) { g.update(1 / 60, null); if (m.state === 'walk') moved = true; far = Math.max(far, Math.hypot(m.cx - 150, m.cy - 150)); }
  assert.ok(moved, 'it walks now and then');
  assert.ok(far > 0.5 && far < 9, `strays ${far.toFixed(1)} cells but stays near home`);
});

test('stamina by hero state (executable): standing regains, walking regains less, stealth walking and running drain', () => {
  const rate = (stance: 'walk' | 'run' | 'stealth' | 'still') => {
    const g = makeGame({ classId: 100 });
    g.stamina = 20;
    if (stance !== 'still') { g.setStance(stance === 'run', stance === 'stealth'); g.click(g.hero.cx + 40, g.hero.cy); }
    run(g, 1);
    return g.stamina - 20;
  };
  const still = rate('still'), walk = rate('walk'), stealth = rate('stealth'), runn = rate('run');
  assert.ok(still > walk && walk > 0, `rest ${still}, walk ${walk}`);
  assert.ok(stealth < 0 && runn < stealth, `stealth ${stealth}, run ${runn}`);
});
