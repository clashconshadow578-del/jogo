// Tempo real de render() (mediana de 5 amostras de 200 quadros) depois de pisar a grama.
// Uso: NODE_PATH=$(npm root -g) node tests/perf/bench.mjs <raiz do projeto> <desktop|mobile> [limite de CPU, ex.: 4]
// Chromium sem GPU rasteriza por software: use para comparar versões entre si, não como FPS real do aparelho.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { startServer } from '../regression/static-server.mjs';
const PROJECT = fileURLToPath(new URL('../..', import.meta.url));
const { chromium } = createRequire(import.meta.url)('playwright');
const [root0, mode = 'desktop', thr] = process.argv.slice(2);
const root = root0 || PROJECT;
const srv = await startServer(root, 0);
const b = await chromium.launch();
const opt = mode === 'mobile' ? { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 960, height: 540 } };
const c = await b.newContext(opt);
const p = await c.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(`http://127.0.0.1:${srv.address().port}/?debug${process.env.QS || ""}`);
await p.waitForFunction(() => window.VDC && window.VDC.run, null, { timeout: 40000 });
await p.waitForTimeout(2500);
const run = (x) => p.evaluate((q) => window.VDC.run(q), x);
if (thr) { const s = await c.newCDPSession(p); await s.send('Emulation.setCPUThrottlingRate', { rate: +thr }); }
await run("gfx.res='2'; applyRes(); setQDrop(0); S.inside=false; S.px=300; S.py=300; climate.rain=0; climate.wetness=0.3");
// pisa a grama andando em círculo
for (const k of ['d','s','a','w','d','s','a','w']) { await run(`keys['${k}']=true`); await p.waitForTimeout(500); await run(`keys['${k}']=false`); }
const samples = [];
for (let r = 0; r < 5; r++) {
  const v = await run(`(() => { for (let i=0;i<10;i++) render(); const N=+(200); const a=performance.now(); for (let i=0;i<N;i++) render(); return (performance.now()-a)/N; })()`);
  samples.push(+v.toFixed(2));
}
samples.sort((x,y)=>x-y);
console.log(JSON.stringify({ mode, thr: thr||1, medianMs: samples[2], all: samples, errs }));
await b.close(); srv.close();
