import { createRequire } from 'node:module';
const puppeteer = createRequire('/opt/npm-tools/node_modules/')('puppeteer-core');
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--window-size=1400,800'] });
const p = await b.newPage();
await p.setViewport({ width: 1400, height: 800 });
p.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
await p.goto('http://127.0.0.1:8765/editor.html?map=nhs/10', { waitUntil: 'load' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(2500);
const click = (l) => p.evaluate((l) => [...document.querySelectorAll('button')].find((x) => x.textContent === l).click(), l);
await click('Script');
await sleep(300);
// choose the 'Bdt Entrar' script (index 4) and put it on a new cell
await p.evaluate(() => { const s = [...document.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.text.includes('Bdt Entrar'))); s.value = [...s.options].find((o) => o.text.includes('Bdt Entrar')).value; s.dispatchEvent(new Event('change')); });
await sleep(300);
await p.mouse.click(700, 400);
await p.screenshot({ path: '/tmp/edscript.png' });
console.log(await p.$eval('#info', (e) => e.textContent));
await b.close();
