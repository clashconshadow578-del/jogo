/**
 * Teste de regressão visual e de estado: compara o jogo modular (index.html + src/)
 * com o arquivo original preservado em legacy/Vale_do_Campo_V64.html.
 *
 * As duas versões rodam no Chromium em um ambiente determinístico (deterministic-env.js:
 * Math.random com semente, relógio e requestAnimationFrame controlados, timers virtuais,
 * áudio desligado). Cada cenário (scenarios/*.js) executa as mesmas entradas de teclado,
 * toque e estado; as capturas de tela são comparadas pixel a pixel e o localStorage final
 * (o save) é comparado byte a byte.
 *
 * Requisitos (opcionais, não fazem parte do jogo):
 *   npm install --no-save playwright
 *   npx playwright install chromium
 * Uso:
 *   npm run test:regression                 # todos os cenários
 *   npm run test:regression -- basic touch  # cenários escolhidos (basic, full, touch, load)
 *   npm run test:regression -- --target=dist   (compara o build de produção em dist/, após npm run build)
 *
 * Observações:
 *  - Os avisos (#toast) ficam ocultos nas capturas porque o projeto corrigiu a quebra de linha
 *    deles (no original o texto era cortado em telas estreitas).
 *  - A textura nova da grama (public/assets/sprites/ground/grass.png) é uma mudança visual
 *    intencional em relação ao original; por isso, nas comparações, a versão modular roda com
 *    window.__VDC_LEGACY_GROUND = true (src/config/groundStyle.js), que volta à grama lisa e à
 *    borda de lago antigas, e o resto da cena continua sendo comparado pixel a pixel. Um passo
 *    final roda o jogo normal e confere que a textura nova carrega e desenha sem erros.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './static-server.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const OUTDIR = path.join(HERE, 'output');

let chromium;
try { ({ chromium } = await import('playwright')); }
catch {
  console.error('Playwright não está instalado. Rode: npm install --no-save playwright && npx playwright install chromium');
  process.exit(2);
}

const args = process.argv.slice(2);
const target = (args.find((a) => a.startsWith('--target=')) || '--target=src').split('=')[1];
const names = args.filter((a) => !a.startsWith('--'));
const ALL = { basic: {}, full: {}, touch: { mobile: true }, load: { preload: '../fixtures/save-v64-original.json', scenario: 'basic' } };
const scenarios = names.length ? names : Object.keys(ALL);

const server = await startServer(ROOT, 0);
const port = server.address().port;
const urls = {
  original: `http://127.0.0.1:${port}/legacy/Vale_do_Campo_V64.html`,
  modular: target === 'dist' ? `http://127.0.0.1:${port}/dist/index.html?debug` : `http://127.0.0.1:${port}/index.html?debug`,
};
if (target === 'dist' && !fs.existsSync(path.join(ROOT, 'dist', 'index.html'))) { console.error('dist/ não existe: rode npm run build antes.'); process.exit(2); }

const browser = await chromium.launch();

async function runScenario(name, which) {
  const opt = ALL[name] || {};
  const ctx = await browser.newContext(opt.mobile
    ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
    : { viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
  await ctx.addInitScript({ path: path.join(HERE, 'deterministic-env.js') });
  if (opt.preload) {   // carrega um save real do original antes do jogo iniciar (teste de compatibilidade)
    const data = JSON.parse(fs.readFileSync(path.join(HERE, opt.preload), 'utf8'));
    await ctx.addInitScript((d) => { if (!sessionStorage.getItem('__pre')) { localStorage.clear(); for (const k in d) localStorage.setItem(k, d[k]); sessionStorage.setItem('__pre', '1'); } }, data);
  }
  if (which === 'modular') await ctx.addInitScript(() => { window.__VDC_LEGACY_GROUND = true; });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(urls[which], { waitUntil: 'load' });
  await p.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important} #toast{visibility:hidden!important}' });
  // espera todas as imagens carregarem e a contagem estabilizar
  let stable = 0, last = -1;
  for (let i = 0; i < 300 && stable < 10; i++) {
    const n = await p.evaluate(() => (window.__imgsReady && window.__imgsReady() ? window.__imgCount() : -1));
    stable = n > 0 && n === last ? stable + 1 : 0; last = n;
    await p.waitForTimeout(100);
  }
  await p.waitForTimeout(800);
  const shots = [];
  const step = (n) => p.evaluate((k) => window.__step(k), n);
  const shot = async (label) => shots.push({ label, png: await p.screenshot() });
  const mod = await import('./scenarios/' + (opt.scenario || name) + '.js');
  await mod.default({ p, step, shot });
  await p.evaluate(() => dispatchEvent(new Event('pagehide')));
  const storage = await p.evaluate(() => { const o = {}; for (const k of Object.keys(localStorage).sort()) o[k] = localStorage.getItem(k); return o; });
  await ctx.close();
  return { shots, storage, errors };
}

async function diffPng(a, b) {
  const page = await browser.newPage();
  const r = await page.evaluate(async ([A, B]) => {
    const load = (s) => new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.src = 'data:image/png;base64,' + s; });
    const [ia, ib] = await Promise.all([load(A), load(B)]);
    if (ia.width !== ib.width || ia.height !== ib.height) return { diff: -1 };
    const c = document.createElement('canvas'); c.width = ia.width; c.height = ia.height; const g = c.getContext('2d');
    g.drawImage(ia, 0, 0); const da = g.getImageData(0, 0, c.width, c.height).data;
    g.clearRect(0, 0, c.width, c.height); g.drawImage(ib, 0, 0); const db = g.getImageData(0, 0, c.width, c.height).data;
    let n = 0; for (let i = 0; i < da.length; i += 4) if (da[i] !== db[i] || da[i + 1] !== db[i + 1] || da[i + 2] !== db[i + 2]) n++;
    return { diff: n };
  }, [a.toString('base64'), b.toString('base64')]);
  await page.close();
  return r.diff;
}

let failures = 0;
fs.mkdirSync(OUTDIR, { recursive: true });
for (const name of scenarios) {
  if (!ALL[name]) { console.error('cenário desconhecido:', name); failures++; continue; }
  const o = await runScenario(name, 'original');
  const m = await runScenario(name, 'modular');
  console.log(`\n== cenário ${name}`);
  for (let i = 0; i < o.shots.length; i++) {
    const d = await diffPng(o.shots[i].png, m.shots[i].png);
    const ok = d === 0;
    if (!ok) {
      failures++;
      fs.writeFileSync(path.join(OUTDIR, `${name}_${o.shots[i].label}_original.png`), o.shots[i].png);
      fs.writeFileSync(path.join(OUTDIR, `${name}_${o.shots[i].label}_modular.png`), m.shots[i].png);
    }
    console.log(`  ${ok ? 'ok  ' : 'FALHA'} ${o.shots[i].label.padEnd(20)} pixels diferentes: ${d}`);
  }
  const keys = [...new Set([...Object.keys(o.storage), ...Object.keys(m.storage)])].sort();
  const bad = keys.filter((k) => o.storage[k] !== m.storage[k]);
  console.log(`  ${bad.length ? 'FALHA' : 'ok  '} localStorage (${keys.length} chaves)${bad.length ? ': ' + bad.join(', ') : ''}`);
  if (bad.length) failures++;
  if (m.errors.length) { console.log('  FALHA erros no console (modular):', m.errors.slice(0, 5)); failures++; }
}
// textura nova da grama: precisa carregar, ficar pronta e desenhar sem erros
{
  const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
  await ctx.addInitScript({ path: path.join(HERE, 'deterministic-env.js') });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(urls.modular, { waitUntil: 'load' });
  let ready = false;
  for (let i = 0; i < 100 && !ready; i++) { ready = await p.evaluate(() => !!(window.VDC && window.VDC.run('SPR.grass.ready'))); if (!ready) await p.waitForTimeout(100); }
  await p.evaluate(() => window.__step(30));
  const size = await p.evaluate(() => window.VDC.run('SPR.grass.img.width'));
  const ok = ready && size === 256 && !errors.length;
  console.log(`\n== textura da grama\n  ${ok ? 'ok  ' : 'FALHA'} carregada: ${ready}, largura ${size}px, erros: ${errors.length}`);
  if (!ok) failures++;
  await ctx.close();
}
await browser.close();
server.close();
console.log(failures ? `\n${failures} falha(s). Capturas divergentes em tests/regression/output/` : '\nTodas as comparações idênticas ao original.');
process.exit(failures ? 1 : 0);
