// Compara dois modos do jogo (A e B) quadro a quadro, pixel a pixel, no mesmo ambiente determinístico.
// Serve para provar que uma otimização NÃO muda a imagem. Padrão (fase 3, mato em imagens prontas):
//   A = &matolive (desenho original do mato, lâmina por lâmina)   B = (padrão: mato em imagens prontas)
// Cenas: posições aleatórias do mapa e cantos, vento fraco a muito forte, 4 níveis de qualidade, andando (o mato treme perto
// do jogador) e chuva. Sai com código 1 se qualquer quadro diferir.
// Uso: NODE_PATH=$(npm root -g) [DENSE=24] node tests/perf/ab-equal.mjs ["&matolive" ["&outroParametro"]]
import { createRequire } from 'node:module';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { startServer } from '../regression/static-server.mjs';
const { chromium } = createRequire(import.meta.url)('playwright');

const root = new URL('../../', import.meta.url).pathname;
const env = fs.readFileSync(new URL('../regression/deterministic-env.js', import.meta.url), 'utf8');
const [qsA = '&matolive', qsB = ''] = process.argv.slice(2);
const srv = await startServer(root, 0);
const port = srv.address().port;
const b = await chromium.launch();

async function roda(nome, qs) {
  const c = await b.newContext({ viewport: { width: 960, height: 540 } });
  await c.addInitScript(env);
  // a luz é recalculada só a cada 2-3 quadros e reaproveitada nos outros: LIGHT_FULL tira a dependência da contagem de quadros
  await c.addInitScript(() => { window.LIGHT_FULL = true; });
  const p = await c.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(`http://127.0.0.1:${port}/?debug&idle${qs}`);
  for (let i = 0; i < 200; i++) {
    await p.waitForTimeout(250);
    if (await p.evaluate(() => !!(window.VDC && window.VDC.run && window.__imgsReady && window.__imgsReady()))) break;
  }
  await p.waitForTimeout(800);
  const run = (x) => p.evaluate((q) => window.VDC.run(q), x);
  const step = (n) => p.evaluate((k) => window.__step(k, 16.667), n);
  await run("gfx.res = '2'; applyRes(); setQDrop(0); S.inside=false; climate.rain=0; climate.wetness=0");
  await step(60);
  const hashes = {};
  let matoVisivel = 0; // soma de tiles com mato visíveis em todos os quadros (para saber que a cena exercita o mato)
  const snap = async (label) => {
    const d = await p.evaluate(() => document.getElementById('c').toDataURL('image/png'));
    const png = Buffer.from(d.split(',')[1], 'base64');
    hashes[label] = crypto.createHash('sha1').update(png).digest('hex');
    if (process.env.PNGDIR) fs.writeFileSync(`${process.env.PNGDIR}/${nome}_${label.replace(/[ ,=.&]/g, '_')}.png`, png);
    matoVisivel += await run('(() => { const cx = Math.max(0, Math.round(S.px) - 240) >> 4, cy = Math.max(0, Math.round(S.py) - 135) >> 4; return hydroMatoList(cx, cx + 31, cy, cy + 18).length; })()');
  };
  const vai = async (x, y) => { await run(`S.px=${x}; S.py=${y}; S.vx=0; S.vy=0`); await step(3); };
  // 1) posições do mapa (aleatórias e cantos)
  const pos = [[300, 1000], [1200, 400]];
  let q = 4242;
  const rnd = () => (q = (q * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < +(process.env.DENSE || 24); i++) pos.push([8 + Math.floor(rnd() * 1584), 8 + Math.floor(rnd() * 1584)]);
  pos.push([8, 8], [1592, 8], [8, 1592], [1592, 1592]);
  for (const [x, y] of pos) { await vai(x, y); await snap(`pos ${x},${y}`); }
  // 2) vento: de fraco a muito forte, em 3 lugares (a inclinação das lâminas muda de 0 a mais de 6 px)
  for (const [x, y] of [[300, 1000], [800, 800], [1100, 500]]) {
    for (const w of [0, 0.3, 0.9, 1.6, 2.6, 4.5]) {
      await vai(x, y);
      await run(`climate.wind=${w}`);
      for (let k = 0; k < 4; k++) { await step(7); await snap(`vento ${w} em ${x},${y} #${k}`); }
    }
  }
  await run('climate.wind=0.5');
  // 3) qualidade: o mato muda a quantidade de lâminas
  await vai(800, 800);
  for (const qd of [0, 1, 2, 3]) { await run(`setQDrop(${qd})`); await step(4); await snap(`qualidade ${qd}`); }
  await run('setQDrop(0)');
  // 4) andando: o mato treme perto do jogador e é pisoteado
  await vai(800, 800);
  for (const k of ['d', 's', 'a', 'w', 'd']) {
    await p.keyboard.down(k);
    for (let i = 0; i < 6; i++) { await step(12); await snap(`andando ${k} ${i}`); }
    await p.keyboard.up(k);
  }
  // 5) chuva e noite
  await run('climate.rain=0.6; climate.wetness=0.8');
  for (const pp of [[800, 800], [300, 1000]]) { await vai(pp[0], pp[1]); await step(20); await snap(`chuva em ${pp}`); }
  await run('S.min=1200');
  await vai(800, 800); await step(5); await snap('noite');
  await c.close();
  return { hashes, errs, matoVisivel };
}

const a = await roda('A', qsA);
const r = await roda('B', qsB);
let dif = 0;
for (const k of Object.keys(a.hashes)) if (a.hashes[k] !== r.hashes[k]) { dif++; if (dif <= 10) console.log('  DIFERE:', k); }
const total = Object.keys(a.hashes).length;
console.log(`${total} quadros comparados · mato visível (tiles somados): A=${a.matoVisivel} B=${r.matoVisivel} · diferentes: ${dif} · erros: ${a.errs.length + r.errs.length}`);
if (a.errs.length || r.errs.length) console.log([...a.errs, ...r.errs].slice(0, 4));
await b.close();
srv.close();
const ok = dif === 0 && !a.errs.length && !r.errs.length && a.matoVisivel > 0;
console.log(ok ? `OK: imagem idêntica (A=${qsA || 'padrão'} x B=${qsB || 'padrão'})` : 'FALHA');
process.exit(ok ? 0 : 1);
