import { createRequire } from 'node:module';
const puppeteer = createRequire('/opt/npm-tools/node_modules/')('puppeteer-core');
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--window-size=640,480'] });
const ids = ['nhs/2','nhs/8','nhs/23','mp/lost_forrest_8p','mp/novus_ancestre_8p'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const id of ids) {
  const p = await b.newPage();
  await p.setViewport({ width: 640, height: 480 });
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
  p.on('console', (m) => { const t = m.text(); if (/error|Error|failed/i.test(t) && !/404|GPU/.test(t)) errs.push(t.slice(0, 160)); });
  await p.goto(`http://127.0.0.1:8765/index.html?class=barbarian&debug&map=${id}`, { waitUntil: 'load' });
  let info = 'no __nst';
  try { await p.waitForFunction('window.__nst', { timeout: 40000 }); await sleep(700); info = JSON.stringify(await p.evaluate(`(()=>{const g=__nst.game;return [g.world.map.tileset,g.monsters.length,Math.round(g.hero.cx)+','+Math.round(g.hero.cy)]})()`)); await p.screenshot({ path: `/tmp/am_${id.replace('/', '_')}.png` }); } catch {}
  console.log(id.padEnd(24), info, errs.length ? errs.join(' | ') : '');
  await p.close();
}
await b.close();
