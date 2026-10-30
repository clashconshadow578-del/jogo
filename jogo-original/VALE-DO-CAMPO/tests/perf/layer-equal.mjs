// (diferenças de 1-2 níveis são arredondamento das camadas translúcidas na GPU; o teste olha as de 3 níveis ou mais)
// Compara o jogo com as camadas no PixiJS (padrão) contra o Canvas puro (?canvas), quadro a quadro. Mostra, por camada, quantas vezes o
// PixiJS desenhou ou caiu no plano B, e a diferença de pixels. Uso: NODE_PATH=$(npm root -g) [DENSE=8] node tests/perf/layer-equal.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { createServer } from 'vite';
const { chromium } = createRequire(import.meta.url)('playwright');
const TOL_MAX = +(process.env.TOL_MAX || 10),
  TOL_FRAC = +(process.env.TOL_FRAC || 0.02);
const root = new URL('../../', import.meta.url).pathname;
const env = fs.readFileSync(new URL('../regression/deterministic-env.js', import.meta.url), 'utf8');
const srv = await createServer({ root, logLevel: 'error', server: { port: 0, host: '127.0.0.1' } });
await srv.listen();
const port = srv.httpServer.address().port;
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
async function roda(qs) {
  const c = await b.newContext({ viewport: { width: 960, height: 540 } });
  await c.addInitScript(env);
  await c.addInitScript(() => {
    window.LIGHT_FULL = true;
  });
  const p = await c.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${port}/?debug&idle${qs}`);
  for (let i = 0; i < 200; i++) {
    await p.waitForTimeout(250);
    if (await p.evaluate(() => !!(window.VDC && window.VDC.run && window.__imgsReady && window.__imgsReady()))) break;
  }
  await p.waitForTimeout(1000);
  for (let i = 0; i < 60; i++) {
    await p.evaluate(() => window.__step(2, 16.667));
    await p.waitForTimeout(60);
  }
  const run = (x) => p.evaluate((q) => window.VDC.run(q), x);
  const step = (n) => p.evaluate((k) => window.__step(k, 16.667), n);
  await run("gfx.res = '2'; applyRes(); setQDrop(0); S.inside=false; climate.rain=0; climate.wetness=0");
  await step(60);
  const pngs = {};
  let q = 777;
  const rnd = () => (q = (q * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const pos = [];
  for (let i = 0; i < +(process.env.DENSE || 8); i++)
    pos.push([8 + Math.floor(rnd() * 1584), 8 + Math.floor(rnd() * 1584)]);
  pos.push([8, 8], [1592, 1592], [800, 5], [300, 1000], [1200, 400]);
  for (const [x, y] of pos) {
    await run(`S.px=${x}; S.py=${y}; S.vx=0; S.vy=0`);
    await step(3);
    pngs[`${x},${y}`] = (await p.evaluate(() => document.getElementById('c').toDataURL('image/png'))).split(',')[1];
  }
  const layers = await p.evaluate(
    () => JSON.stringify(window.VDC_LAYERS || null) + ' guardas: ' + JSON.stringify(window.VDC_LAYER_STATS || null),
  );
  await c.close();
  return { pngs, layers, errs };
}
const dpage = await b.newPage();
const difere = (A, B) =>
  dpage.evaluate(
    async ([a, b2]) => {
      const load = (s) =>
        new Promise((res) => {
          const im = new Image();
          im.onload = () => res(im);
          im.src = 'data:image/png;base64,' + s;
        });
      const [ia, ib] = await Promise.all([load(a), load(b2)]);
      const c = document.createElement('canvas');
      c.width = ia.width;
      c.height = ia.height;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(ia, 0, 0);
      const da = g.getImageData(0, 0, c.width, c.height).data;
      g.clearRect(0, 0, c.width, c.height);
      g.drawImage(ib, 0, 0);
      const db = g.getImageData(0, 0, c.width, c.height).data;
      let n = 0,
        n3 = 0,
        max = 0;
      for (let i = 0; i < da.length; i += 4) {
        const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]));
        if (d) {
          n++;
          if (d >= 3) n3++;
          if (d > max) max = d;
        }
      }
      return { n, n3, max, total: c.width * c.height };
    },
    [A, B],
  );
const base = await roda('&canvas');
const pix = await roda('');
if (process.env.PNGDIR)
  for (const [nm, r] of [
    ['canvas', base],
    ['pixi', pix],
  ])
    for (const k of Object.keys(r.pngs))
      fs.writeFileSync(`${process.env.PNGDIR}/${nm}_${k.replace(',', '_')}.png`, Buffer.from(r.pngs[k], 'base64'));
let pior = 0,
  maxD = 0,
  dif = 0;
for (const k of Object.keys(base.pngs)) {
  const d = await difere(base.pngs[k], pix.pngs[k]);
  if (d.n) {
    dif++;
    maxD = Math.max(maxD, d.max);
    pior = Math.max(pior, d.n3 / d.total);
  }
}
console.log('camadas no PixiJS:', pix.layers, '· erros:', base.errs.length + pix.errs.length);
console.log(
  `${Object.keys(base.pngs).length} quadros · ${dif} com diferença · pior: ${(pior * 100).toFixed(3)}% dos pixels com 3+ níveis de diferença, até ${maxD} níveis`,
);
await b.close();
await srv.close();
process.exit(maxD <= TOL_MAX && pior <= TOL_FRAC && !base.errs.length && !pix.errs.length ? 0 : 1);
