/**
 * Árvore ou planta na frente do personagem: só um círculo ao redor dele fica translúcido, com a borda em degradê (rendering/Occlusion.js),
 * e as fases 3 e 4 do mato são 15% maiores. Sobe o jogo pelo Vite com WebGL por software (como pixi-leak.mjs) para conferir o PixiJS
 * de verdade; com SHOTS=<pasta> grava as capturas. Com CANVAS=1 roda o mesmo teste no Canvas 2D (`?canvas`).
 * Uso: NODE_PATH=$(npm root -g) node tests/browser/oclusao.mjs
 */
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import { ok, failures, ROOT } from './lib.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const server = await createServer({ root: ROOT, server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const port = server.httpServer.address().port;
const b = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-gl=angle'],
});
const p = await b.newPage({ viewport: { width: 960, height: 540 } });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
const canvas = !!process.env.CANVAS;
await p.goto(`http://127.0.0.1:${port}/?debug&copia${canvas ? '&canvas' : ''}`);
if (canvas) await p.waitForFunction(() => window.VDC && window.VDC.run, null, { timeout: 60000 });
else await p.waitForFunction(() => window.VDC && window.VDC_PIXI?.ok && window.VDC_LAYER_STATS?.layers > 5, null, { timeout: 120000 });
ok(true, canvas ? 'Canvas 2D (?canvas)' : 'PixiJS ligado (WebGL)');
const run = (c) => p.evaluate((x) => window.VDC.run(x), c);
const esperar = (ms) => p.waitForTimeout(ms);

// 1) as fases 3 e 4 do mato são 15% maiores; as fases 1 e 2 não mudam
const esc = JSON.parse(
  await run(`JSON.stringify(['helikonia', 'samambaia'].map((e) => [1, 2, 3, 4].map((f) => [SPR[e + '_' + f].w, SPR[e + '_' + f].h])))`),
);
const orig = { helikonia: [[16, 9], [22, 14], [28, 22], [34, 33]], samambaia: [[16, 8], [22, 16], [28, 24], [34, 33]] };
['helikonia', 'samambaia'].forEach((e, k) =>
  orig[e].forEach(([w, h], f) => {
    const kk = f >= 2 ? 1.15 : 1,
      ew = Math.round(w * kk),
      eh = Math.round(h * kk);
    ok(esc[k][f][0] === ew && esc[k][f][1] === eh, `${e} fase ${f + 1}: ${esc[k][f].join('x')} (esperado ${ew}x${eh})`);
  }),
);

// Ajudantes ---------------------------------------------------------------------------------------------------------------------
const frames = async (n) => {
  const a = await p.evaluate(() => (window.VDC_LAYER_STATS ? window.VDC_LAYER_STATS.layers : 0));
  if (canvas) return esperar(n * 40);
  await p.waitForFunction(([x, k]) => window.VDC_LAYER_STATS.layers > x + k, [a, n], { timeout: 30000 });
};
// recorte de 96x96 px lógicos centrado no círculo (a cópia do quadro vem do ?copia)
const lerTela = () =>
  p.evaluate(() => {
    const cv = document.getElementById('c'),
      S = window.VDC.run('S'),
      vc = window.VDC.run('vcam'),
      rs = cv.width / 480,
      cx = S.px - vc.x,
      cy = S.py - vc.y - 11;
    const x0 = Math.round((cx - 48) * rs),
      y0 = Math.round((cy - 48) * rs),
      n = Math.round(96 * rs);
    return { rs, data: Array.from(cv.getContext('2d').getImageData(x0, y0, n, n).data), n };
  });
const foto = (nome) =>
  process.env.SHOTS ? p.screenshot({ path: `${process.env.SHOTS}/${nome}${canvas ? '-canvas' : ''}.png` }) : null;
/** Pixels que mudaram entre dois recortes, separados em dentro do círculo (até o raio) e fora dele (depois do raio + 3). */
const compara = (A, B, R) => {
  let dentro = 0,
    fora = 0;
  const { rs, n } = A;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const i = (y * n + x) * 4,
        d = Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1]) + Math.abs(A.data[i + 2] - B.data[i + 2]);
      if (d <= 12) continue;
      const dist = Math.hypot((x + 0.5) / rs - 48, (y + 0.5) / rs - 48);
      if (dist <= R) dentro++;
      else if (dist > R + 3) fora++;
    }
  return { dentro, fora };
};
const R = Number(await run(`OCLUSAO.raio`));
/**
 * Fotografa a cena duas vezes: com o círculo e com o círculo mandado para longe (o desenho normal). Devolve onde os quadros diferem.
 * Também confere que dois quadros iguais saem iguais (senão a comparação não vale).
 */
async function cena(nome) {
  await frames(12);
  await foto('oclusao-' + nome + '-com');
  const com = await lerTela();
  await frames(6);
  const ruido = compara(com, await lerTela(), R);
  ok(ruido.dentro + ruido.fora < 400, `${nome}: quadro razoavelmente estável para comparar (${ruido.dentro + ruido.fora} pixels mudam entre dois quadros iguais)`);
  await run(`OCLUSAO.centroY = -5000`);
  await frames(8);
  await foto('oclusao-' + nome + '-sem');
  const sem = await lerTela();
  await run(`OCLUSAO.centroY = 11`);
  return { ...compara(com, sem, R), ruido };
}
const estrito = (nome, d, minimo) => {
  ok(d.dentro > minimo, `${nome}: o círculo muda o desenho ao redor do personagem (${d.dentro} pixels dentro do raio)`);
  // fora do círculo só pode mudar o que já muda sozinho entre dois quadros iguais (bichos, marcadores), não o desenho da árvore ou planta
  const limite = d.ruido.fora * 1.5 + 40;
  ok(d.fora <= limite && d.fora < d.dentro * 0.3, `${nome}: fora do círculo nada muda além do ruído (${d.fora} pixels fora, ruído ${d.ruido.fora}, ${d.dentro} dentro): não fica translúcido por inteiro`);
};

// 2) congela o mundo: o balanço das árvores, o vento e a água usam `performance.now()`, e luz, clima, atmosfera, água e bichos mudam a
// cada quadro; dois quadros só podem ser comparados pixel a pixel se nada disso se mexe (o personagem, as árvores e o mato continuam)
await run(`window.__ini = { x: S.px, y: S.py }`);
await run(`(() => { const t = performance.now(); performance.now = () => t; setAblate({ luz: true, atm: true, clima: true, agua: true, hidro: true, outros: true }); })()`);

// 3) árvore comum (TreeRenderer): o personagem atrás da copa
await run(`(() => {
  const tx = Math.floor(S.px / 16), ty = Math.floor(S.py / 16);
  for (let a = -4; a <= 6; a++) for (let c = -6; c <= 6; c++) { const i = (ty + a) * MW + tx + c; ground[i] = GRASS; obj[i] = 0; crops[i] = 0; mato[i] = 4; }
  obj[(ty + 2) * MW + tx] = TREE; // a base da árvore fica em (ty+3)*16
  const m = treeModel(tx, ty + 2), base = (ty + 3) * 16;
  S.px = tx * 16 + 8; S.py = base - Math.round((m && m.ready ? m.h : 30) * 0.45) + 11; S.mv = false; S.vx = S.vy = 0;
})()`);
const dComum = await cena('arvore-comum');
ok(dComum.dentro > 150, `árvore comum: o círculo muda a copa ao redor do personagem (${dComum.dentro} pixels dentro do raio)`);
ok(!JSON.parse(await run(`occAtivo()`)), 'o círculo não vaza para fora da camada das entidades (desligado depois do quadro)');
await run(`(() => { const tx = Math.floor(S.px / 16), ty = Math.floor(S.py / 16); for (let a = 0; a <= 4; a++) obj[(ty + a) * MW + tx] = 0; })()`);

// 4) árvore grande da Amazônia (AmazonRender): o personagem atrás do tronco, longe da fazenda
const amz = await run(`(() => {
  for (const [j, a] of ecoTrees) {
    if (!a.amz || a.st < 4 || a.y < 14) continue;
    const m = a.model();
    if (!m || !m.ready || m.h < 100) continue;
    S.px = a.x * 16 + 8; S.py = (a.y + 1) * 16 - Math.round(m.h * 0.45) + 11; S.mv = false; S.vx = S.vy = 0;
    return 'h=' + m.h;
  }
  return '';
})()`);
ok(!!amz, 'achou uma árvore grande da Amazônia (' + amz + ')');
if (amz) estrito('árvore da Amazônia', await cena('arvore-amazonia'), 100);

// 5) planta na frente do personagem também ganha o círculo (touceira das duas espécies nas fases 3 e 4), no ponto de partida
await run(`(() => {
  S.px = window.__ini.x; S.py = window.__ini.y; S.mv = false; S.vx = S.vy = 0;
  const tx = Math.floor(S.px / 16), ty = Math.floor(S.py / 16);
  for (let a = -2; a <= 4; a++) for (let c = -6; c <= 6; c++) { const i = (ty + a) * MW + tx + c; ground[i] = GRASS; obj[i] = 0; crops[i] = 0; }
  S.py = ty * 16 + 30; // dentro da touceira
  let k = 0;
  for (let a = 1; a <= 3; a++) for (let c = -3; c <= 3; c++) { const i = (ty + a) * MW + tx + c; nut[i] = 0.9; sm[i] = 0.8; wearT[i] = 0; mato[i] = [255, 140, 255, 180, 200][(k++) % 5]; }
})()`);
estrito('plantas', await cena('plantas'), 100);

// 6) o canvas auxiliar é reaproveitado: andar por cima da touceira não cria canvases novos a cada quadro
await run(`window.__nCv = 0; const o = document.createElement.bind(document); document.createElement = (t) => { if (String(t).toLowerCase() === 'canvas') window.__nCv++; return o(t); };`);
await p.keyboard.down('d');
await esperar(2500);
await p.keyboard.up('d');
const nCv = await run(`window.__nCv`);
ok(nCv < 40, `poucos canvases novos andando atrás das plantas (${nCv} em ~2,5 s)`);

// 7) o degradê: a máscara é suave (sem degrau duro) e o centro é bem mais transparente que a borda
const mk = JSON.parse(
  await run(`(() => {
    const k = OCLUSAO, a = [];
    for (let r = 0; r <= k.raio; r += 1) { const t = Math.min(1, Math.max(0, (r - k.nucleo) / (k.raio - k.nucleo))); a.push(k.forca * (1 - t * t * (3 - 2 * t))); }
    return JSON.stringify(a);
  })()`),
);
let maiorSalto = 0;
for (let i = 1; i < mk.length; i++) maiorSalto = Math.max(maiorSalto, Math.abs(mk[i] - mk[i - 1]));
ok(mk[0] > 0.7 && mk[mk.length - 1] === 0, `centro bem translúcido (${mk[0].toFixed(2)}) e borda sem transparência (${mk[mk.length - 1]})`);
ok(maiorSalto < 0.1, `degradê sem degrau duro (maior salto de ${maiorSalto.toFixed(3)} por pixel)`);

ok(errs.length === 0, 'sem erros na página' + (errs.length ? ': ' + errs[0] : ''));
await b.close();
await server.close();
process.exitCode = failures() ? 1 : 0;
