/**
 * Árvores paradas: sem balanço do vento, cada árvore é UM desenho só (um drawImage), igual em qualquer instante, com vento fraco ou tempestade.
 * Vale para as árvores comuns (rendering/TreeRenderer.js) e para as grandes da Amazônia (features/amazon/AmazonRender.js).
 * Uso: NODE_PATH=$(npm root -g) node tests/browser/arvores.mjs
 */
import { launch, run, ok, failures } from './lib.mjs';

const { p, close, errs } = await launch({ width: 960, height: 540 });
const J = async (code) => JSON.parse(await run(p, `JSON.stringify(${code})`));

const r = await J(`(() => {
  const out = {};
  const tx = 30, ty = 30;
  obj[ty * MW + tx] = TREE; // uma árvore comum
  const amz = [...ecoTrees.values()].find((a) => a.amz && a.st >= 4 && a.model() && a.model().ready);
  const casos = [['comum', tx, ty, treeModel(tx, ty)]];
  if (amz) casos.push(['amazônia', amz.x, amz.y, amz.model()]);
  const real = performance.now.bind(performance);
  for (const [nome, cx, cy, m] of casos) {
    if (!m || !m.ready) { out[nome] = null; continue; }
    const W = m.w + 40, H = m.h + 20, T = document.createElement('canvas');
    T.width = W; T.height = H;
    const k = T.getContext('2d', { willReadFrequently: true });
    const antes = ctx;
    let chamadas = 0;
    const orig = k.drawImage.bind(k);
    k.drawImage = (...a) => { chamadas++; return orig(...a); };
    const quadros = [];
    for (const [t, vento, tipo] of [[1000, 0.1, 0], [1733.4, 1, 4], [5210.9, 0.6, 3], [9999.1, 1, 4]]) {
      climate.wind = vento; climate.kind = tipo;
      performance.now = () => t;
      k.clearRect(0, 0, W, H);
      setDrawCtx(k);
      chamadas = 0;
      drawTree(20 + m.w / 2, H - 4, cx, cy);
      setDrawCtx(antes);
      let h = 0;
      const d = k.getImageData(0, 0, W, H).data;
      for (let i = 0; i < d.length; i += 4) h = (h * 31 + d[i] + d[i + 1] * 3 + d[i + 2] * 7 + d[i + 3] * 13) | 0;
      quadros.push({ h, chamadas });
    }
    performance.now = real;
    out[nome] = quadros;
  }
  return out;
})()`);
for (const [nome, q] of Object.entries(r)) {
  ok(q !== null, `árvore ${nome}: modelo pronto`);
  if (!q) continue;
  ok(q.every((x) => x.chamadas === 1), `árvore ${nome}: um desenho só por árvore (${q.map((x) => x.chamadas).join(', ')} drawImage)`);
  ok(q.every((x) => x.h === q[0].h), `árvore ${nome}: igual com vento fraco, forte e tempestade, em instantes diferentes`);
}
ok(Object.keys(r).length >= 2, 'testou a árvore comum e a da Amazônia');
ok(errs.length === 0, 'sem erros no console' + (errs.length ? ': ' + errs[0] : ''));
await close();
process.exitCode = failures() ? 1 : 0;
