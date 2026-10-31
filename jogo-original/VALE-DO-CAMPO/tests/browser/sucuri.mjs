/**
 * Sucuri com a folha nova (public/assets/sprites/animals/anaconda.webp, gerada por tools/anaconda/make-anaconda.py): a folha em si, as poses
 * por estado e direção, e o corpo que estica ao redor da presa engolida (anaStretch). Sem PixiJS (o desenho é o mesmo nos dois).
 * Uso: NODE_PATH=$(npm root -g) node tests/browser/sucuri.mjs
 */
import { launch, run, ok, failures } from './lib.mjs';

const { p, close, errs } = await launch({ width: 960, height: 540 });
const J = async (code) => JSON.parse(await run(p, `JSON.stringify(${code})`));

// 1) a folha: 640x640, alfa só 0/255, os 12 quadros com cobra, a cabeça na âncora e nada fora do quadro
await p.waitForFunction(() => window.VDC.run(`(() => { try { anaProf(); return true; } catch (e) { return false; } })()`), null, { timeout: 30000 }).catch(() => {});
const folha = await p.evaluate(async () => {
  const im = new Image();
  im.src = new URL('assets/sprites/animals/anaconda.webp', location.href).href;
  await im.decode();
  const c = document.createElement('canvas');
  c.width = im.width;
  c.height = im.height;
  const g = c.getContext('2d');
  g.drawImage(im, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data,
    F = 160,
    meio = (v) => v > 0 && v < 255,
    q = (col, lin) => {
      let n = 0;
      for (let y = lin * F; y < (lin + 1) * F; y++) for (let x = col * F; x < (col + 1) * F; x++) if (d[(y * c.width + x) * 4 + 3]) n++;
      return n;
    };
  let semi = 0;
  for (let i = 3; i < d.length; i += 4) if (meio(d[i])) semi++;
  const alfa = (x, y) => d[(y * c.width + x) * 4 + 3];
  return {
    w: im.width,
    h: im.height,
    semi,
    cheios: [0, 1].flatMap((l) => [0, 1].map((cc) => q(cc, l))).concat([2, 3].flatMap((l) => [0, 1, 2, 3].map((cc) => q(cc, l)))),
    vazios: [2, 3].map((cc) => q(cc, 0)).concat([2, 3].map((cc) => q(cc, 1))), // colunas 2 e 3 das linhas que deslizam não têm quadro
    cabecaEsq: [0, 1].map((f) => alfa(f * F + 10, 80) || alfa(f * F + 10, 79) || alfa(f * F + 10, 81)),
    cabecaDir: [0, 1].map((f) => alfa(f * F + F - 1 - 10, F + 80) || alfa(f * F + F - 1 - 10, F + 79) || alfa(f * F + F - 1 - 10, F + 81)),
  };
});
ok(folha.w === 640 && folha.h === 640, `folha de 640x640 (${folha.w}x${folha.h})`);
ok(folha.semi === 0, `alfa só 0/255 (pixel art nítida), ${folha.semi} pixels meio transparentes`);
ok(folha.cheios.length === 12 && folha.cheios.every((n) => n > 300), `os 12 quadros têm cobra (${folha.cheios.join(', ')} pixels)`);
ok(folha.vazios.every((n) => n === 0), 'sem quadros sobrando nas linhas que deslizam');
ok(folha.cabecaEsq.every(Boolean) && folha.cabecaDir.every(Boolean), 'a ponta da cabeça está na âncora (esquerda e direita), na altura do meio do quadro');

// 2) o corpo estica ao redor da presa: sem presa o quadro sai igual ao da folha; com presa a cobra engrossa e alonga, a cabeça não se mexe
const E = await J(`(() => {
  const F = 160, medir = (row, fr, bk, bp) => {
    const T = document.createElement('canvas'); T.width = T.height = F;
    const g = T.getContext('2d', { willReadFrequently: true });
    anaStretch(g, row, fr, bk, bp);
    const d = g.getImageData(0, 0, F, F).data, sg = row === 0 ? 1 : -1, hc = row === 0 ? 10 : F - 1 - 10;
    let maxH = 0, cauda = 0, hash = 0, area = 0;
    for (let x = 0; x < F; x++) {
      let top = -1, bot = -1;
      for (let y = 0; y < F; y++) if (d[(y * F + x) * 4 + 3]) { if (top < 0) top = y; bot = y; }
      if (top >= 0) { maxH = Math.max(maxH, bot - top + 1); cauda = Math.max(cauda, (x - hc) * sg); }
      for (let y = 0; y < F; y++) if (d[(y * F + x) * 4 + 3]) area++;
    }
    for (let i = 0; i < d.length; i += 4) hash = (hash * 31 + d[i] + d[i + 3] * 7) | 0;
    // a cabeça: as 12 colunas mais perto dela
    let cab = 0;
    for (let k = 0; k < 12; k++) for (let y = 0; y < F; y++) cab = (cab * 31 + d[(y * F + hc + sg * k) * 4 + 3] + d[(y * F + hc + sg * k) * 4]) | 0;
    return { maxH, cauda, hash, cab, area };
  };
  const r = {};
  for (const row of [0, 1]) for (const fr of [0, 1]) r[row + '_' + fr] = { zero: medir(row, fr, 0, 0.3), cheio: medir(row, fr, 1, 0.3), meio: medir(row, fr, 0.5, 0.3), longe: medir(row, fr, 1, 0.6) };
  return r;
})()`);
for (const [k, v] of Object.entries(E)) {
  ok(v.cheio.maxH >= v.zero.maxH * 1.6, `quadro ${k}: a barriga cheia engrossa (${v.zero.maxH} -> ${v.cheio.maxH} px)`);
  ok(v.cheio.cauda >= v.zero.cauda + 6, `quadro ${k}: o corpo alonga (${v.zero.cauda} -> ${v.cheio.cauda} px da cabeça à cauda)`);
  ok(v.meio.maxH > v.zero.maxH && v.meio.maxH < v.cheio.maxH, `quadro ${k}: presa média engrossa menos que a grande (${v.meio.maxH} px)`);
  ok(v.cheio.cab === v.zero.cab, `quadro ${k}: a cabeça não muda`);
  ok(v.longe.area >= v.zero.area * 1.25, `quadro ${k}: a barriga na posição mais distante que o jogo usa (60% do corpo) também engrossa (área ${v.zero.area} -> ${v.longe.area})`);
}

// 3) as poses por estado e direção (faRow: 0 baixo, 1 cima, 2 esquerda, 3 direita)
const pose = (state, dir, extra = {}) =>
  J(`anaPose(Object.assign({ t0: 0, bk: 0, dg: 0, hide: false, sw: false, mv: false, stT: 0, gsp: 1 }, ${JSON.stringify(extra)}), '${state}', ${dir}, 1.7)`);
{
  const esq = await pose('go', 2, { mv: true }), dir = await pose('go', 3, { mv: true }), baixo = await pose('go', 0, { mv: true }), cima = await pose('go', 1, { mv: true });
  ok(esq.row === 0 && esq.rot === 0 && dir.row === 1 && dir.rot === 0, 'esquerda e direita usam as linhas da folha, sem girar');
  const q = Math.PI / 2;
  ok(baixo.row === 1 && Math.abs(baixo.rot - q) < 1e-9 && cima.row === 0 && Math.abs(cima.rot - q) < 1e-9, 'para baixo gira o quadro da direita, para cima o da esquerda (90 graus, cabeça na âncora)');
  const bote = [0, 0.1, 0.2, 0.3].map((stT) => pose('strike', 2, { stT }));
  const b = await Promise.all(bote);
  ok(b[0].row === 3 && b[1].ls < b[2].ls && b[2].ls < b[3].ls && b[3].ls === 1, `o bote: levantada, depois o corpo estica (${b.map((x) => x.ls).join(', ')})`);
  const pronta = await pose('coil', 2), rep = await pose('rest', 3), cons = await pose('constrict', 2);
  ok(pronta.row === 3 && rep.row === 2 && rep.flip === true && cons.row === 2, 'enrolada: pronta (cabeça levantada), descansando (virada para a direita) e apertando');
  const nada = await pose('go', 3, { sw: true, mv: true }), esc = await pose('ambush', 2, { hide: true });
  ok(nada.swim === true && esc.hide === true, 'nadando e escondida na água');
  const barriga = await pose('swallow', 2, { bk: 0.9 }), dig = await pose('rest', 2, { bk: 0.9, dg: 0.02 }), digMeio = await pose('rest', 2, { bk: 0.9, dg: 0.8 }), morta = await pose('dead', 2, { bk: 0.9 });
  ok(barriga.stretch === true && barriga.row <= 1, 'engolindo: o corpo estica');
  ok(dig.cs > 1.2 && dig.stretch === false, 'fim da digestão, enrolada: a cobra inteira fica maior (' + dig.cs.toFixed(2) + 'x)');
  ok(digMeio.stretch === true && digMeio.row <= 1, 'digerindo (meio da digestão): fica esticada, com a barriga descendo pelo corpo');
  ok(morta.stretch === false && morta.cs === 1, 'morta: sem barriga');
}

// 4) desenhar cada pose no jogo (Canvas) não dá erro e é rápido
const t = await J(`(() => {
  const f = { x: 300, y: 300, dir: 0, state: 'go', mv: false, sw: false, hide: false, t0: 0, bk: 0, bp: 0.4, dg: 0, camo: 0, kind: 'grass', stT: 0, t: 5, gsp: 1 };
  const casos = [{ mv: true, dir: 3.14 }, { mv: true, dir: 1.57 }, { state: 'rest' }, { state: 'coil' }, { state: 'strike', stT: 0.2 }, { sw: true, mv: true, dir: 0 }, { camo: 0.8, mv: true }, { state: 'swallow', bk: 1, bp: 0.3, dir: 3.14 }, { state: 'swallow', bk: 1, bp: 0.3, dir: 1.57 }, { state: 'rest', bk: 1 }];
  const r = [];
  for (const c of casos) { const a = Object.assign({}, f, c); const t0 = performance.now(); for (let i = 0; i < 60; i++) { dynFrame(); drawAna(a); } r.push((performance.now() - t0) / 60); }
  return r;
})()`);
ok(t.every((x) => x < 4), `cada pose desenha em menos de 4 ms (maior: ${Math.max(...t).toFixed(2)} ms; deslizando ${t[0].toFixed(3)} ms, esticada ${t[7].toFixed(3)} ms)`);

// 5) a demonstração (?sucuri): uma sucuri engolindo na frente do jogador, a barriga cresce e anda pelo corpo
const demo = await J(`(() => {
  const a = anaDemo();
  const r = { estado: a.state, perto: Math.hypot(a.x - S.px, a.y - S.py) < 150, nFauna: fauna.filter((f) => f.sp === 'anaconda' && Math.hypot(f.x - S.px, f.y - S.py) < 150).length };
  window.__demo = a;
  return r;
})()`);
ok(demo.estado === 'swallow' && demo.perto && demo.nFauna === 1, 'anaDemo cria uma sucuri engolindo perto do jogador');
const seq = [];
for (let i = 0; i < 3; i++) {
  await run(p, `(() => { const a = window.__demo; a.dgK = 1; a.swT = 24; a.t = 24 * (1 - ${(i + 1) / 4}); a.bk = 0; })()`);
  await p.waitForTimeout(700);
  seq.push(await J(`({ bk: +window.__demo.bk.toFixed(2), bp: +window.__demo.bp.toFixed(2), st: window.__demo.state })`));
}
ok(seq.every((s) => s.st === 'swallow') && seq[0].bk < seq[2].bk && seq[0].bp < seq[2].bp, `a barriga cresce e desce pelo corpo (${seq.map((s) => s.bk + '@' + s.bp).join(' → ')})`);

ok(errs.length === 0, 'sem erros no console' + (errs.length ? ': ' + errs[0] : ''));
await close();
process.exitCode = failures() ? 1 : 0;
