// Hash do quadro em muitas posições da câmera (fração de tile, bordas do mapa; DENSE=160 gera 160 posições aleatórias).
// Compara duas versões do jogo: rode nas duas raízes e confira se os hashes são iguais. Prova que cortar o desenho
// fora da tela não muda nenhum pixel.
// Uso: NODE_PATH=$(npm root -g) [DENSE=160] node tests/perf/posgrid.mjs <raiz> <saida.json>
import { createRequire } from 'node:module';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { startServer } from '../regression/static-server.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');
const [root, out] = process.argv.slice(2);
const env = fs.readFileSync(new URL('../regression/deterministic-env.js', import.meta.url), 'utf8');
const srv = await startServer(root, 0);
const b = await chromium.launch();
const c = await b.newContext({ viewport: { width: 960, height: 540 } });
await c.addInitScript(env);
const p = await c.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(`http://127.0.0.1:${srv.address().port}/?debug${process.env.QS || ""}`);
for (let i = 0; i < 200; i++) { await p.waitForTimeout(250); if (await p.evaluate(() => !!(window.VDC && window.VDC.run && window.__imgsReady && window.__imgsReady()))) break; }
await p.waitForTimeout(1000);
const run = (x) => p.evaluate((q) => window.VDC.run(q), x);
const step = (n) => p.evaluate((k) => window.__step(k, 16.667), n);
await run("gfx.res = '2'; applyRes(); setQDrop(0); S.inside=false; climate.rain=0.3; climate.wetness=0.5");
if (process.env.PAD) await run("globalThis.__PAD=[" + process.env.PAD + "]");
await step(60);
const res = {};
// grade de posições: frações diferentes de tile, perto das bordas do mapa e em várias regiões
const pos = [];
for (let gy = 0; gy < 6; gy++) for (let gx = 0; gx < 6; gx++) pos.push([60 + gx * 290 + (gy * 7 + gx * 3) % 16, 60 + gy * 290 + (gx * 5 + gy * 11) % 16]);
if (process.env.DENSE) { pos.length = 0; let q = 12345; const rnd = () => (q = (q * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; for (let i = 0; i < +process.env.DENSE; i++) pos.push([8 + Math.floor(rnd() * 1584), 8 + Math.floor(rnd() * 1584)]); }
else pos.push([8, 8], [1592, 8], [8, 1592], [1592, 1592], [800, 5], [5, 800]);
for (const [x, y] of pos) {
  await run(`S.px=${x}; S.py=${y}; S.vx=0; S.vy=0`);
  await step(3);
  const d = await p.evaluate(() => document.getElementById('c').toDataURL('image/png'));
  if (process.env.PNGDIR) fs.writeFileSync(`${process.env.PNGDIR}/${x}_${y}.png`, Buffer.from(d.split(',')[1], 'base64'));
  res[`${x},${y}`] = crypto.createHash('sha1').update(Buffer.from(d.split(',')[1], 'base64')).digest('hex');
}
fs.writeFileSync(out, JSON.stringify(res));
console.log(Object.keys(res).length, 'posições', errs.length, 'erros');
await b.close(); srv.close();
