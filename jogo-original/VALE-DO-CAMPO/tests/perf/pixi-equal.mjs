// Compara o desenho COM ?pixi (fase 2: chão de grama parada na GPU) com o desenho SEM ?pixi, quadro a quadro.
// Três execuções no mesmo ambiente determinístico (mesmo tempo, mesmas teclas, mesma luz):
//   base  = jogo normal (sem ?pixi)
//   2d    = ?pixi&pixi2d  mesma lógica da fase 2 (quais tiles, recorte, ordem) mas a cópia vem direto da imagem pronta, sem WebGL.
//           Tem que dar ZERO pixels diferentes: prova que a escolha dos tiles e a ordem de desenho não mudam nada.
//   webgl = ?pixi         com o WebGL de verdade. Aceita uma tolerância (ver TOL_*): nos quadros em que o canvas do jogo recebe a
//           imagem do WebGL, o Chromium sem placa de vídeo (SwiftShader) arredonda as camadas translúcidas de outro jeito (quase
//           tudo 1 nível de 255, no máximo ~9) e suaviza a borda de 1 pixel da tela. Quadros sem cópia do WebGL saem idênticos.
//           A textura do PixiJS em si é conferida pixel a pixel. Em placa de vídeo real, confira a olho no aparelho.
// Uso:  npm install (o teste usa o Vite) e  NODE_PATH=$(npm root -g) node tests/perf/pixi-equal.mjs
//       DENSE=20 quantas posições aleatórias da câmera · DRY=1 tempo seco · EXTRA='&chunks' parâmetros extras da URL · ONLY=webgl roda só uma variante · PNGDIR=pasta grava os quadros
// Sai com código 1 se algo falhar.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createServer } from 'vite';
const { chromium } = createRequire(import.meta.url)('playwright');

const TOL_MAX = 10; // maior diferença aceita por canal (0-255) na variante WebGL: um tile errado diferiria MUITO mais que isso
const TOL_FRAC = 0.1; // fração máxima de pixels diferentes por quadro na variante WebGL (medido: até ~7%, quase tudo de 1 nível)
const AQUECE = 60; // passos de tempo iguais em todas as execuções (o PixiJS precisa deles para terminar de ligar)

const root = new URL('../../', import.meta.url).pathname;
const env = fs.readFileSync(new URL('../regression/deterministic-env.js', import.meta.url), 'utf8');
// precisa do Vite (ele resolve o import 'pixi.js'; o servidor simples dos outros testes não resolve)
const srv = await createServer({ root, logLevel: 'error', server: { port: 0, host: '127.0.0.1' } });
await srv.listen();
const port = srv.httpServer.address().port;
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

async function roda(nome, qs) {
  const c = await b.newContext({ viewport: { width: 960, height: 540 } });
  await c.addInitScript(env);
  // A luz é recalculada só a cada 2-3 quadros e reaproveitada (deslocada pela câmera) nos outros, o que deixa a borda da tela
  // dependendo de QUANTOS quadros já foram desenhados. LIGHT_FULL recalcula sempre: o teste não depende mais da contagem.
  await c.addInitScript(() => { window.LIGHT_FULL = true; });
  const p = await c.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(`http://127.0.0.1:${port}/?debug&idle${qs}${process.env.EXTRA || ''}`);
  for (let i = 0; i < 200; i++) {
    await p.waitForTimeout(250);
    if (await p.evaluate(() => !!(window.VDC && window.VDC.run && window.__imgsReady && window.__imgsReady()))) break;
  }
  await p.waitForTimeout(1000);
  // Aquecimento IGUAL em todas as execuções: o ambiente congela os relógios e o PixiJS precisa que eles andem para ligar.
  for (let i = 0; i < AQUECE; i++) { await p.evaluate(() => window.__step(2, 16.667)); await p.waitForTimeout(60); }
  if (qs.includes('pixi') && !(await p.evaluate(() => window.VDC_PIXI && window.VDC_PIXI.ok))) throw new Error(`${nome}: o PixiJS (WebGL) não ligou neste navegador`);
  const run = (x) => p.evaluate((q) => window.VDC.run(q), x);
  const step = (n) => p.evaluate((k) => window.__step(k, 16.667), n);
  const seco = process.env.DRY ? 0 : 1;
  await run(`gfx.res = '2'; applyRes(); setQDrop(0); S.inside=false; climate.rain=${0.3 * seco}; climate.wetness=${0.5 * seco}`);
  await step(60);
  const pngs = {};
  const snap = async (label) => {
    const d = await p.evaluate(() => document.getElementById('c').toDataURL('image/png'));
    pngs[label] = d.split(',')[1];
    if (process.env.PNGDIR) fs.writeFileSync(`${process.env.PNGDIR}/${nome}_${label.replace(/[ ,]/g, '_')}.png`, Buffer.from(pngs[label], 'base64'));
  };
  // 1) posições da câmera: aleatórias (frações de tile) e os cantos/bordas do mapa
  const pos = [];
  let q = 777;
  const rnd = () => (q = (q * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < +(process.env.DENSE || 20); i++) pos.push([8 + Math.floor(rnd() * 1584), 8 + Math.floor(rnd() * 1584)]);
  pos.push([8, 8], [1592, 8], [8, 1592], [1592, 1592], [800, 5], [5, 800]);
  for (const [x, y] of pos) {
    await run(`S.px=${x}; S.py=${y}; S.vx=0; S.vy=0`);
    await step(3);
    await snap(`pos ${x},${y}`);
  }
  // 2) andando: cria trilhas de grama pisoteada (as lâminas vizinhas "vazam" sobre o tile ao lado)
  await run('S.px=800; S.py=800; S.vx=0; S.vy=0');
  await step(5);
  for (const k of ['d', 's', 'a', 'w', 'd']) {
    await p.keyboard.down(k);
    for (let i = 0; i < 6; i++) { await step(15); await snap(`andando ${k} ${i}`); }
    await p.keyboard.up(k);
  }
  const frames = await p.evaluate(() => (window.VDC_PIXI && window.VDC_PIXI.groundFrames) || 0);
  // A imagem que o PixiJS desenha (textura na GPU) tem que ser IGUAL à imagem pronta, pixel a pixel (lida de volta e comparada).
  let textura = null;
  if (qs === '&pixi') {
    textura = await p.evaluate(() => {
      const { PIXI, app } = window.VDC_PIXI;
      const plan = window.VDC.run('pixiPlanTiles(0, 30, 0, 17)');
      window.VDC.run('pixiPlanEnd()');
      const fuse = plan.fuse, w = app.canvas.width, h = app.canvas.height;
      const sp = new PIXI.Sprite(PIXI.Texture.from(fuse)); sp.x = -3 * 16; sp.y = -5 * 16;
      const st = new PIXI.Container(); st.addChild(sp);
      app.renderer.render({ container: st });
      const ler = (src, sx, sy) => { const k = document.createElement('canvas'); k.width = w; k.height = h; const g = k.getContext('2d', { willReadFrequently: true }); g.drawImage(src, sx, sy, w, h, 0, 0, w, h); return g.getImageData(0, 0, w, h).data; };
      const A = ler(app.canvas, 0, 0), B = ler(fuse, 3 * 16, 5 * 16);
      let n = 0;
      for (let i = 0; i < A.length; i += 4) if (A[i] !== B[i] || A[i + 1] !== B[i + 1] || A[i + 2] !== B[i + 2]) n++;
      return { n, total: w * h };
    });
  }
  await c.close();
  return { pngs, errs, frames, textura };
}

// diferença entre dois PNGs (decodificados no navegador): quantos pixels e qual o maior desvio por canal
const dpage = await b.newPage();
async function difere(A, B) {
  return dpage.evaluate(async ([a, b2]) => {
    const load = (s) => new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.src = 'data:image/png;base64,' + s; });
    const [ia, ib] = await Promise.all([load(a), load(b2)]);
    const c = document.createElement('canvas'); c.width = ia.width; c.height = ia.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(ia, 0, 0); const da = g.getImageData(0, 0, c.width, c.height).data;
    g.clearRect(0, 0, c.width, c.height); g.drawImage(ib, 0, 0); const db = g.getImageData(0, 0, c.width, c.height).data;
    let n = 0, max = 0;
    for (let i = 0; i < da.length; i += 4) {
      const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]));
      if (d) { n++; if (d > max) max = d; }
    }
    return { n, max, total: c.width * c.height };
  }, [A, B]);
}
const hash = (s) => crypto.createHash('sha1').update(s).digest('hex');

const base = await roda('base', '');
const execs = [
  { nome: '2d', qs: '&pixi&pixi2d', exato: true },
  { nome: 'webgl', qs: '&pixi', exato: false },
];
let falhou = false;
console.log(`base: ${Object.keys(base.pngs).length} quadros`);
if (base.errs.length) { console.log('  erros na base:', base.errs.slice(0, 3)); falhou = true; }
for (const e of execs) {
  if (process.env.ONLY && process.env.ONLY !== e.nome) continue;
  const r = await roda(e.nome, e.qs);
  let diferentes = 0, maxN = 0, maxD = 0, pior = 0;
  for (const k of Object.keys(base.pngs)) {
    if (hash(base.pngs[k]) === hash(r.pngs[k])) continue;
    const d = await difere(base.pngs[k], r.pngs[k]);
    diferentes++; maxN = Math.max(maxN, d.n); maxD = Math.max(maxD, d.max); pior = Math.max(pior, d.n / d.total);
    if (e.exato && diferentes <= 5) console.log(`    DIFERE (${e.nome}): ${k}: ${d.n} pixels, até ${d.max} níveis`);
  }
  const ok = e.exato ? diferentes === 0 : maxD <= TOL_MAX && pior <= TOL_FRAC;
  const resumo = e.exato
    ? `${diferentes} quadros diferentes (exigido: 0)`
    : `${diferentes} quadros com diferenças pequenas; pior caso: ${maxN} pixels (${(pior * 100).toFixed(2)}%), até ${maxD} níveis (tolerância: ${(TOL_FRAC * 100).toFixed(1)}% e ${TOL_MAX} níveis)`;
  console.log(`${ok && r.frames > 0 && !r.errs.length ? 'ok   ' : 'FALHA'} ${e.nome.padEnd(5)} quadros com chão via PixiJS: ${r.frames} · erros: ${r.errs.length} · ${resumo}`);
  if (r.errs.length) console.log('    ', r.errs.slice(0, 3));
  if (!ok || r.frames === 0 || r.errs.length) falhou = true;
  if (r.textura) {
    console.log(`${r.textura.n === 0 ? 'ok   ' : 'FALHA'} textura do PixiJS x imagem pronta: ${r.textura.n} pixels diferentes de ${r.textura.total} (exigido: 0)`);
    if (r.textura.n) falhou = true;
  }
}
await b.close();
await srv.close();
console.log(falhou ? 'FALHA' : 'OK: lógica exata e WebGL dentro da tolerância');
process.exit(falhou ? 1 : 0);
