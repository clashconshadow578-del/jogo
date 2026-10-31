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

// 2b) a ondulação ao andar (anaWaveStrips / anaWave): sem intensidade sai igual ao quadro; a cabeça não se mexe; o corpo muda com a fase
await p.evaluate(async () => {
  const im = new Image();
  im.src = new URL('assets/sprites/animals/anaconda.webp', location.href).href;
  await im.decode();
  const c = document.createElement('canvas');
  c.width = im.width;
  c.height = im.height;
  c.getContext('2d').drawImage(im, 0, 0);
  window.__folha = c;
});
const W = await J(`(() => {
  const F = 160, r = {};
  const ler = (g) => g.getImageData(0, 0, F, F).data;
  const novo = () => { const T = document.createElement('canvas'); T.width = T.height = F; return T.getContext('2d', { willReadFrequently: true }); };
  const quadro = (row, fr, k, s) => { const g = novo(); anaWaveStrips(g, window.__folha, fr * F, row * F, 0, 0, row, fr, k, s); return ler(g); };
  const original = (row, fr) => { const g = novo(); g.drawImage(window.__folha, fr * F, row * F, F, F, 0, 0, F, F); return ler(g); };
  const difer = (a, b, x0, x1) => { let n = 0; for (let y = 0; y < F; y++) for (let x = x0; x < x1; x++) for (let c = 0; c < 4; c++) if (a[(y * F + x) * 4 + c] !== b[(y * F + x) * 4 + c]) { n++; break; } return n; };
  for (const row of [0, 1]) for (const fr of [0, 1]) {
    const o = original(row, fr), zero = quadro(row, fr, 0, 1.3), a = quadro(row, fr, 1, 0), b = quadro(row, fr, 1, 2.5);
    const hc = row === 0 ? 10 : F - 1 - 10;
    const [h0, h1] = row === 0 ? [hc - 2, hc + 6] : [hc - 5, hc + 3]; // as colunas da cabeça: a amplitude cresce do zero a partir dela
    r[row + '_' + fr] = { semOnda: difer(zero, o, 0, F), mudaComFase: difer(a, b, 0, F), cabeca: difer(a, o, h0, h1) };
  }
  // a fase anda com a distância e a intensidade acompanha o movimento
  const f = { x: 100, y: 100 }, k0 = anaWave(f, 10, false), fase0 = f.wS;
  f.x = 100 + ANA_WAVE.lam / 2; anaWave(f, 10.016, true);
  const meia = f.wS;
  for (let i = 0; i < 40; i++) { f.x += 1; anaWave(f, 10.016 + i * 0.016, true); }
  const anda = f.wK;
  const fase1 = f.wS;
  for (let i = 0; i < 60; i++) anaWave(f, 11 + i * 0.016, false);
  const parou = f.wK, fase2 = f.wS;
  return { quadros: r, fase0, meia, k0, anda, parou, parada: fase1 === fase2 };
})()`);
for (const [k, v] of Object.entries(W.quadros)) {
  ok(v.semOnda === 0, `quadro ${k}: sem intensidade a ondulação sai igual ao quadro da folha`);
  ok(v.mudaComFase > 150, `quadro ${k}: o corpo muda com a fase da onda (${v.mudaComFase} colunas-pixel diferentes)`);
  ok(v.cabeca === 0, `quadro ${k}: a cabeça não se mexe`);
}
ok(Math.abs(W.meia - Math.PI) < 0.05, `a fase anda com a distância: meio comprimento de onda andado = meia volta (${W.meia.toFixed(2)} rad)`);
ok(W.k0 === 0 && W.anda > 0.9 && W.parou < 0.05, `a intensidade acompanha o movimento (parada ${W.k0}, andando ${W.anda.toFixed(2)}, parou ${W.parou.toFixed(3)})`);
ok(W.parada, 'parada, a fase não anda');

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

// 3b) as diagonais: o corpo gira até o ângulo de verdade do movimento (anaPose com `ang`, de anaAngle, em passos de 22,5 graus)
{
  const P = Math.PI,
    pa = (ang) => J(`anaPose({ t0: 0, bk: 0, dg: 0, hide: false, sw: false, mv: true, stT: 0, gsp: 1 }, 'go', 3, 1.7, ${ang})`);
  // [nome, ângulo (0 direita, PI/2 baixo), linha esperada, giro esperado]
  const casos = [
    ['direita', 0, 1, 0], ['baixo-direita', P / 4, 1, P / 4], ['baixo', P / 2, 1, P / 2], ['baixo-esquerda', (3 * P) / 4, 0, -P / 4],
    ['esquerda', P, 0, 0], ['cima-esquerda', (-3 * P) / 4, 0, P / 4], ['cima', -P / 2, 1, -P / 2], ['cima-direita', -P / 4, 1, -P / 4],
  ];
  const falhas = [];
  for (const [nome, ang, row, rot] of casos) {
    const o = await pa(ang);
    if (o.row !== row || Math.abs(o.rot - rot) > 1e-9) falhas.push(`${nome}: linha ${o.row} giro ${o.rot.toFixed(3)} (esperado ${row} e ${rot.toFixed(3)})`);
  }
  ok(falhas.length === 0, 'as 8 direções (com as 4 diagonais) usam a linha certa e giram até o ângulo' + (falhas.length ? ': ' + falhas.join('; ') : ''));
  // o rosto da cobra aponta mesmo para o ângulo pedido: a cabeça do quadro girado cai na direção (cos, sen) do ângulo
  const aponta = await J(`(() => {
    const r = [];
    for (const [ang] of ${JSON.stringify(casos)}) {
      const o = anaPose({ t0: 0, bk: 0, dg: 0, hide: false, sw: false, mv: true, stT: 0, gsp: 1 }, 'go', 3, 1.7, ang);
      const dx = o.row === 1 ? 1 : -1; // a cabeça do quadro da direita olha para +x, a do da esquerda para -x
      const x = dx * Math.cos(o.rot), y = dx * Math.sin(o.rot);
      r.push(Math.hypot(x - Math.cos(ang), y - Math.sin(ang)));
    }
    return r;
  })()`);
  ok(aponta.every((e) => e < 1e-9), 'a cabeça aponta para o ângulo do movimento nas 8 direções');
  // anaAngle: passos de 22,5 graus com histerese (não pisca entre dois passos)
  const q = await J(`(() => {
    const a = { dir: 0.1 }, r = [];
    r.push(anaAngle(a)); a.dir = 0.275; r.push(anaAngle(a)); a.dir = 0.31; r.push(anaAngle(a));
    a.dir = Math.PI / 8 - 0.2; r.push(anaAngle(a)); a.dir = Math.PI / 2 + 0.05; r.push(anaAngle(a));
    a.dir = -3 * Math.PI / 4 + 0.05; const b = { dir: 3.2 }; r.push(anaAngle(b));
    return r;
  })()`);
  const p8 = Math.PI / 8;
  ok(q[0] === 0 && q[1] === 0 && Math.abs(q[2] - p8) < 1e-9 && Math.abs(q[3] - p8) < 1e-9 && Math.abs(q[4] - Math.PI / 2) < 1e-9, `anaAngle gira em passos de 22,5 graus e só muda de passo passando bem do meio (${q.slice(0, 5).map((v) => v.toFixed(2)).join(', ')})`);
  ok(Math.abs(q[5] - Math.PI) < 1e-9, `um ângulo além de PI (3,2 rad) cai no passo mais próximo, que é o de 180 graus (${q[5].toFixed(3)}), dentro de -PI a PI`);
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
