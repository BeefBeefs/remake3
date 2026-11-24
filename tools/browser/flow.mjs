// Plays the menu flow in the real page: title -> new game -> hero -> difficulty -> world map -> mission; then finishes the mission,
// saves, returns to the map, goes back to the title and loads the save.
import { createRequire } from 'node:module';
const puppeteer = createRequire('/opt/npm-tools/node_modules/')('puppeteer-core');
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--window-size=960,720'] });
const p = await b.newPage();
await p.setViewport({ width: 960, height: 720 });
p.on('console', (m) => { const t = m.text(); if (!/GPU stall|GL Driver|Clock|404/.test(t)) console.log('[console]', t.slice(0, 300)); });
p.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 400)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const click = async (x, y) => { await p.mouse.click(x * 1.5, y * 1.5); await sleep(400); };
await p.goto('http://127.0.0.1:8765/index.html?debug', { waitUntil: 'load' });
await sleep(2500);
await p.screenshot({ path: '/tmp/flow0.png' });
await click(150, 274);   // New game
await click(269, 312);   // Start game
await click(268, 310);   // Accept hero (Barbarian)
await click(350, 299);   // Expert
await sleep(500);
await p.screenshot({ path: '/tmp/flow1.png' });   // world map
await click(265, 262);   // Lost Forest
await p.waitForFunction('window.__nst', { timeout: 90000 });
console.log('in mission:', JSON.stringify(await p.evaluate(`(()=>{const g=window.__nst.game;return {cls:g.classId,lvl:g.level,gold:g.inventory.gold,slots:g.inventory.slots.filter(x=>x)}})()`)));
// grow the hero a little, then "reach the goal"
await p.evaluate(`(()=>{const g=window.__nst.game; g.inventory.gold=555; g.inventory.add(86); g.xp=500; g.goalReached=true;})()`);
await sleep(1500);
await p.screenshot({ path: '/tmp/flow2.png' });  // victory card
const buttons = await p.$$eval('button', (bs) => bs.map((x) => x.textContent));
console.log('victory buttons:', buttons);
p.on('dialog', (d) => d.accept());
await p.evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Save game').click()`);
await sleep(600);
await p.screenshot({ path: '/tmp/flow3.png' });  // slot picker over the card
// pick slot 1: first row of the panel
await p.mouse.click(480, 360 - 100 + 0); await sleep(200);
console.log('saved:', await p.evaluate(`localStorage.getItem('nst-saves')`).then((s) => (s ? JSON.parse(s).map((c) => c && { cls: c.classId, lvl: c.hero.level, gold: c.hero.gold, done: c.done, inv: c.hero.inv && c.hero.inv.slots.filter((x) => x) }) : s)));
await p.screenshot({ path: '/tmp/flow4.png' });
await b.close();
