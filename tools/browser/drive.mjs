// node drive.mjs <url> <out.png> [js-to-run-in-page] [wait-ms-after]  -- headless Chrome with SwiftShader WebGL
import { createRequire } from 'node:module';
const puppeteer = createRequire('/opt/npm-tools/node_modules/')('puppeteer-core');
const [url, out, js = '', wait = '1500', w = '960', h = '720'] = process.argv.slice(2);
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', `--window-size=${w},${h}`] });
const p = await b.newPage();
await p.setViewport({ width: +w, height: +h });
p.on('console', (m) => { const t = m.text(); if (!/GPU stall|GL Driver/.test(t)) console.log('[console]', t.slice(0, 300)); });
p.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 400)));
await p.goto(url, { waitUntil: 'load' });
if (url.includes('debug')) { try { await p.waitForFunction('window.__nst', { timeout: 90000 }); } catch { console.log('no __nst (timeout)'); } } else await new Promise((r) => setTimeout(r, 2500));
if (js) { const r = await p.evaluate(js); if (r !== undefined) console.log('[result]', JSON.stringify(r)); }
await new Promise((r) => setTimeout(r, +wait));
await p.screenshot({ path: out });
await b.close();
