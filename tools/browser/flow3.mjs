// Title -> New game -> Select map -> Campaign tab -> Mission 4 -> hero -> difficulty -> plays that map outside the career.
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
await click(150, 274);   // New game
await click(250, 350);   // Select map
await p.screenshot({ path: '/tmp/f3a.png' });
await click(318, 97);    // Campaign tab
await click(240, 114 + 3 * 22 + 11); // Mission 4
await p.screenshot({ path: '/tmp/f3b.png' });
await click(247, 404);   // Play
await click(268, 310);   // hero
await click(350, 299);   // Expert
await p.waitForFunction('window.__nst', { timeout: 90000 });
await sleep(1500);
console.log(JSON.stringify(await p.evaluate(`(()=>{const g=window.__nst.game;return {tileset:g.world.map.tileset,hero:[g.hero.cx,g.hero.cy],monsters:g.monsters.length}})()`)));
await p.screenshot({ path: '/tmp/f3c.png' });
await b.close();
