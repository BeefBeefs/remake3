import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { frameId } from '../src/game/anims.ts';
import { Game, type GameData, type GameOptions, xpForLevel } from '../src/game/game.ts';
import { World } from '../src/game/world.ts';
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
  assert.equal(g.hero.stats.hp, 44); // 2 x resistance
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
  assert.ok(!g.ranged);
  assert.equal(g.hero.stats.hp, 42);
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
  g.click(g.hero.cx + 8, g.hero.cy);
  run(g, 3);
  const steps = heard.filter((id) => id === 160 || id === 161);
  assert.ok(steps.length >= 4 && steps.length <= 6, `steps=${steps.length}`);
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
  run(g, 5);
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
  run(g, 1.5);
  assert.ok(stepsOf(160) >= 2 && stepsOf(164) === 0 && stepsOf(168) === 0);
  surface = 'wood'; heard.length = 0; run(g, 1.5);
  assert.ok(stepsOf(164) >= 2 && stepsOf(160) === 0);
  surface = 'stone'; heard.length = 0; run(g, 1.5);
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
  run(g, 4);
  assert.deepEqual(talked, ['27']);
  assert.ok(Math.hypot(g.hero.cx - npc.creature.cx, g.hero.cy - npc.creature.cy) <= 2.3);
  assert.equal(npc.creature.state, 'attack', 'innkeeper turns to serve');
  run(g, 8); // the serve animation is 70 frames x 6 ticks = 7 s
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
  assert.ok(runner.stamina < s0 - 4, 'running tires the hero');
  assert.ok(heard.some((id) => id === 162 || id === 163), 'j_correr_hierba');
  assert.ok(!heard.some((id) => id === 160 || id === 161));
  runner.stamina = 0;
  const x = runner.hero.cx;
  run(runner, 1);
  assert.ok(Math.abs(runner.hero.cx - x - 3.2) < 0.2, 'out of stamina: back to walking pace');
});

test('standing still recovers stamina; stealth is slow and silent', () => {
  const g = makeGame();
  g.stamina = 10;
  run(g, 2);
  assert.ok(g.stamina > 14);
  const heard: number[] = [];
  g.onSound = (id) => heard.push(id);
  g.setStance(false, true);
  const x = g.hero.cx;
  g.click(x + 30, g.hero.cy);
  run(g, 2);
  assert.ok(Math.abs(g.hero.cx - x - 3.2) < 0.3, `stealth speed ${g.hero.cx - x}`);
  assert.equal(heard.filter((id) => id >= 160 && id <= 171).length, 0, 'no footsteps');
});

test('stealth hides you from monsters at half range and the first blow on an unaware one is doubled', () => {
  const mk = (stealth: boolean, gx: number) => { const g = makeGame({ spawns: [{ id: '1', cx: gx, cy: 128 }] }); g.setStance(false, stealth); return g; };
  // a goblin 7 cells away: a walking hero is heard (hearing + 3 > 7?) only if inside range; stealth halves it
  const range = (stealth: boolean) => {
    for (let d = 14; d >= 2; d--) { const g = mk(stealth, 128 + d); run(g, 0.3); if (g.monsters[0]!.state !== 'idle') return d; }
    return 0;
  };
  const walkRange = range(false), sneakRange = range(true);
  assert.ok(walkRange > 0 && sneakRange > 0 && sneakRange < walkRange, `walk hears at ${walkRange}, stealth at ${sneakRange}`);
  // identical seeds: same damage roll, so the sneak blow must be exactly double (before armour)
  const blow = (stealth: boolean) => {
    const g = mk(stealth, 129);
    const m = g.monsters[0]!;
    m.hp = 10000; m.stats.hp = 10000; m.stats.armor = 0;
    g.target = null;
    g.hero.face(1, 0); (g as unknown as { facing: { x: number; y: number } }).facing = { x: 1, y: 0 };
    g.swing();
    run(g, 0.6);
    return 10000 - m.hp;
  };
  const normal = blow(false), sneak = blow(true);
  assert.ok(normal > 0);
  assert.equal(sneak, normal * 2);
});

test('stamina, mana and the vitality potion: mask bits restore each pool; vitality can hurt', () => {
  const g = makeGame();
  g.stamina = 0; g.mana = 0;
  g.inventory.add(106); // small stamina potion 40-60
  g.inventory.add(108); // small magic potion 20-40
  g.useSlot(g.inventory.slots.indexOf(106));
  assert.ok(g.stamina >= 40 && g.stamina <= Math.min(60, g.maxStamina));
  g.useSlot(g.inventory.slots.indexOf(108));
  assert.ok(g.mana >= 20 && g.mana <= Math.min(40, g.maxMana));
  g.inventory.add(110);
  const hp = g.hero.hp;
  g.useSlot(g.inventory.slots.indexOf(110));
  assert.ok(g.hero.hp >= 1 && g.hero.hp !== hp + 100);
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

test('Barbarian block: frontal blows are stopped and cost stamina; blows from behind and with no stamina get through', () => {
  const setup = () => { const g = makeGame({ spawns: [{ id: '1', cx: 129, cy: 128 }] }); g.setGuard(true); facing(g, 1, 0); return g; };
  const front = setup();
  const heard: number[] = [];
  front.onSound = (id) => heard.push(id);
  const s0 = front.stamina, hp0 = front.hero.hp;
  run(front, 6);
  assert.equal(front.hero.hp, hp0, 'no damage while covering up');
  assert.ok(front.stamina < s0 && front.stamina !== s0, 'blocking spends stamina');
  assert.equal(front.hero.state, 'block');
  assert.ok(heard.some((id) => id >= 53 && id <= 56), 'c_cubrir');

  const behind = setup();
  facing(behind, -1, 0); // the goblin is behind him
  run(behind, 6);
  assert.ok(behind.hero.hp < behind.hero.stats.hp, 'a flank blow lands');

  const tired = setup();
  tired.stamina = 0;
  run(tired, 6);
  assert.ok(tired.hero.hp < tired.hero.stats.hp, 'no stamina, no block');
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
  const mana0 = g.mana;
  read(g, 87);
  assert.ok(a!.hp < 500 && b!.hp < 500);
  assert.equal(far!.hp, 500);
  assert.equal(g.mana, mana0 - 10, 'storm is a level-2 parchment: 5 mana per level');
  assert.equal(g.inventory.slots.includes(87), false);
});

test('parchments need their Power requirement and enough mana, otherwise nothing happens', () => {
  const weak = withScroll(87, { classId: 100 }); // Barbarian power 11 < 20
  read(weak, 87);
  assert.ok(weak.inventory.slots.includes(87));
  assert.match(weak.log.at(-1)!, /You need Power 20/);
  const dry = withScroll(86, { classId: 102, attrs: { strength: 19, skill: 23, resistance: 21, magic: 30 } });
  dry.mana = 1;
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

test('the life parchment turns all mana into life and stamina; attribute parchments are permanent and use no mana', () => {
  const g = withScroll(92, { classId: 102, attrs: { strength: 19, skill: 23, resistance: 21, magic: 30 } });
  g.hero.hp = 10; g.stamina = 0; g.mana = 40;
  read(g, 92);
  assert.equal(g.mana, 0);
  assert.equal(g.hero.hp, 42, 'capped at maximum life (2 x Resistance 21)');
  assert.equal(g.stamina, 40);
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
  i.mana = 30; // the level-5 parchment costs 25
  read(i, 102);
  assert.equal(i.attrs.magic, 32);
  assert.equal(i.mana, i.maxMana, 'full pool after the cost');
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
  assert.equal(g.hero.stats.hp, hp0 - 8, 'two life per Resistance point');
  assert.equal(g.maxStamina, st0 - 8);
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
    m.hp = m.stats.hp = 500; m.stats.armor = 0; m.stats.race = race;
    g.inventory.equipped.weapon = staff;
    g.refreshHeroStats();
    facing(g, 1, 0);
    let total = 0;
    for (let i = 0; i < 40; i++) { const before = m.hp; (g as unknown as { heroStrike(): void }).heroStrike(); total += before - m.hp; }
    return total / 40;
  };
  assert.ok(dmgOn(1, 55) > dmgOn(0, 55) * 1.4, 'staff 55: +64% against goblins');
  assert.ok(dmgOn(32, 58) > dmgOn(1, 58) * 1.4, 'staff 58: +70% against demons');
});

test('a spell uses the scroll\'s own family bonus: storm hits humans 40% harder, incineration cannot hurt demons', () => {
  const hit = (scroll: number, race: number) => {
    const g = makeGame({ classId: 102, attrs: SORC, spawns: [{ id: '1', cx: 131, cy: 128 }] });
    const m = g.monsters[0]!;
    m.hp = m.stats.hp = 900; m.stats.armor = 0; m.stats.race = race;
    g.inventory.add(scroll); g.mana = 500;
    g.useSlot(g.inventory.slots.indexOf(scroll));
    return 900 - m.hp;
  };
  assert.ok(hit(87, 64) > hit(87, 1) * 1.3);
  assert.equal(hit(90, 32), 0);
  assert.ok(hit(90, 1) > 0);
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

test('a hero never loses an ability below 1', () => {
  const g = makeGame({ classId: 100, attrs: { strength: 1, skill: 5, resistance: 1, magic: 2 }, spawns: [{ id: '1', cx: 129, cy: 128 }] });
  killHero(g);
  assert.deepEqual(g.attrs, { strength: 1, skill: 4, resistance: 1, magic: 1 });
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
  assert.equal(second.hero.stats.hp, second.attrs.resistance * 2);
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

test('difficulty scales monster life and damage: Apprentice softer, Hero tougher, Expert unchanged', () => {
  const stats = (d: 0 | 1 | 2) => { const g = makeGame({ difficulty: d, spawns: [{ id: '1', cx: 140, cy: 128 }] }); const m = g.monsters[0]!; return { hp: m.stats.hp, hit: m.hp, dmg: m.stats.damage }; };
  const easy = stats(0), normal = stats(1), hard = stats(2);
  assert.ok(easy.hp < normal.hp && normal.hp < hard.hp);
  assert.ok(easy.dmg[1] < normal.dmg[1] && normal.dmg[1] < hard.dmg[1]);
  assert.equal(easy.hit, easy.hp, 'monsters start at full life');
  assert.equal(normal.hp, 12, 'goblin life in the data');
});

test('knowledge potion gives an attribute point, fortuity potion drops two items', () => {
  const g = makeGame();
  g.inventory.add(112); g.inventory.add(111);
  const pts = g.points;
  g.useSlot(g.inventory.slots.indexOf(112));
  assert.equal(g.points, pts + 1);
  assert.ok(!g.inventory.slots.includes(112));
  const before = g.ground.length;
  g.useSlot(g.inventory.slots.indexOf(111));
  assert.ok(!g.inventory.slots.includes(111));
  assert.equal(g.ground.length, before + 2);
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
