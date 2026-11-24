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
    for (let d = 14; d >= 2; d--) { const g = mk(stealth, 128 + d); run(g, 0.3); if (g.monsters[0]!.state !== 'idle' && g.monsters[0]!.cx < 128 + d - 0.05) return d; }
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
