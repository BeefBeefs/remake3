import { createRequire } from 'node:module';
const puppeteer = createRequire('/opt/npm-tools/node_modules/')('puppeteer-core');
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--window-size=960,720'] });
const p = await b.newPage();
await p.setViewport({ width: 960, height: 720 });
p.on('console', (m) => { const t = m.text(); if (!/GPU stall|GL Driver|Clock|404/.test(t)) console.log('[console]', t.slice(0, 300)); });
p.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 400)));
p.on('dialog', (d) => d.accept());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const click = async (x, y) => { await p.mouse.click(x * 1.5, y * 1.5); await sleep(500); };
// seed a save as the previous flow would have written it
await p.goto('http://127.0.0.1:8765/index.html?debug', { waitUntil: 'load' });
await p.evaluate(`localStorage.setItem('nst-saves', JSON.stringify([{v:1,classId:102,difficulty:2,hero:{attrs:{strength:19,skill:23,resistance:21,magic:30},level:5,xp:900,points:4,gold:640,inv:{slots:[86,88,0,104],equipped:{weapon:56}}},done:['lost_forrest'],when:Date.now()}]))`);
await p.reload({ waitUntil: 'load' });
await sleep(2500);
await p.screenshot({ path: '/tmp/f2_0.png' });          // title: Load game is live
await click(150, 374);                                   // Load game
await p.screenshot({ path: '/tmp/f2_1.png' });          // slot list
await p.evaluate(`[...document.querySelectorAll('div')].filter(d=>d.style.cursor==='pointer'&&d.style.height==='30px')[0].click()`);
await sleep(800);
await p.screenshot({ path: '/tmp/f2_2.png' });          // map with the star
await click(265, 262);
await p.waitForFunction('window.__nst', { timeout: 90000 });
console.log(JSON.stringify(await p.evaluate(`(()=>{const g=window.__nst.game;return {cls:g.classId,lvl:g.level,xp:g.xp,pts:g.points,gold:g.inventory.gold,mag:g.attrs.magic,slots:g.inventory.slots.filter(x=>x),weapon:g.inventory.equipped.weapon,hp:g.hero.hp}})()`)));
await sleep(1500);
await p.screenshot({ path: '/tmp/f2_3.png' });
await b.close();
