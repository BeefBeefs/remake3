// node fx.mjs <spellId> <out.png> [class]  -- reads a parchment in the running game next to monsters and screenshots mid-effect
import { createRequire } from 'node:module';
const puppeteer = createRequire('/opt/npm-tools/node_modules/')('puppeteer-core');
const [id, out, cls = 'sorceress', delay = '350'] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--window-size=960,720'] });
const p = await b.newPage();
await p.setViewport({ width: 960, height: 720 });
p.on('console', (m) => { const t = m.text(); if (!/GPU stall|GL Driver|Clock|404/.test(t)) console.log('[console]', t.slice(0, 300)); });
p.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 400)));
await p.goto(`http://127.0.0.1:8765/index.html?class=${cls}&debug`, { waitUntil: 'load' });
await p.waitForFunction('window.__nst', { timeout: 90000 });
const info = await p.evaluate(`(async()=>{
  const g=window.__nst.game; const h=g.hero;
  // pause the AI by making monsters deaf, place three goblins close
  const ms=g.monsters.filter(m=>m.alive).slice(0,4);
  ms.forEach((m,i)=>{ m.cx=h.cx+3+i*0.8; m.cy=h.cy-2+i*1.2; m.stats.hearing=0; m.dormant=false; });
  g.inventory.add(${id}); g.mana=200; g.attrs.magic=60; g.hero.stats.hp=200; g.hero.hp=200;
  const slot=g.inventory.slots.indexOf(${id});
  g.inventory.gold=1;
  g.useSlot(slot);
  return {fx:g.fx.length, hero:[h.cx,h.cy]};
})()`);
console.log(JSON.stringify(info));
await new Promise((r) => setTimeout(r, +delay));
await p.screenshot({ path: out });
await b.close();
