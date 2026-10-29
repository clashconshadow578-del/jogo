// Captura determinística do quadro (3 cenários: seco, grama pisada, chuva) e o hash SHA-1 de cada PNG.
// Uso: NODE_PATH=$(npm root -g) node tests/perf/pix.mjs <raiz do projeto> <desktop|mobile> <saida.json>
// Para comparar duas versões do jogo, rode nas duas raízes e compare os hashes (ou os PNGs *.png gerados).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { startServer } from '../regression/static-server.mjs';
const PROJECT = fileURLToPath(new URL('../..', import.meta.url));
const { chromium } = createRequire(import.meta.url)('playwright');
const [root0, mode = 'desktop', out = 'pix.json'] = process.argv.slice(2);
const root = root0 || PROJECT;
const env = fs.readFileSync(new URL('../regression/deterministic-env.js', import.meta.url), 'utf8');
const srv = await startServer(root, 0);
const b = await chromium.launch();
const opt = mode === 'mobile' ? { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 960, height: 540 } };
const ctxt = await b.newContext(opt);
await ctxt.addInitScript(env);
const p = await ctxt.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.goto(`http://127.0.0.1:${srv.address().port}/?debug${process.env.QS || ""}`);
const step = (n) => p.evaluate((k) => window.__step(k, 16.667), n);
for (let i = 0; i < 200; i++) {
  await p.waitForTimeout(250);
  if (await p.evaluate(() => !!(window.VDC && window.VDC.run && window.__imgsReady && window.__imgsReady()))) break;
}
await p.waitForTimeout(1000);
const run = (c) => p.evaluate((x) => window.VDC.run(x), c);
await run("gfx.res = '2'; applyRes(); setQDrop(0)");
await step(60);
const res = {};
// cenários: seco, depois de pisar a grama, com chuva
async function shot(name) {
  await step(3);
  const d = await p.evaluate(() => { const c = document.getElementById('c'); return c.toDataURL('image/png'); });
  const buf = Buffer.from(d.split(',')[1], 'base64');
  fs.writeFileSync(`${out}.${name}.png`, buf);
  res[name] = crypto.createHash('sha1').update(buf).digest('hex');
}
await run('S.inside=false; S.px=300; S.py=300; S.vx=0; S.vy=0; climate.rain=0; climate.wetness=0');
await shot('seco');
// anda em círculo para pisar a grama
await run("keys['d']=true");
await step(70); await run("keys['d']=false; keys['s']=true"); await step(70);
await run("keys['s']=false; keys['a']=true"); await step(70); await run("keys['a']=false; keys['w']=true"); await step(70);
await run("keys['w']=false");
await shot('pisada');
await run('climate.wetness=0.8; climate.rain=0.5');
await step(40);
await shot('chuva');
console.log(JSON.stringify({ mode, res, errs }));
fs.writeFileSync(out, JSON.stringify(res));
await b.close(); srv.close();
