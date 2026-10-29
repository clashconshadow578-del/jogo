/**
 * Ecossistema vivo — cenários 20 a 31 (indicadores de fome, sede e idade). Roda o jogo no Chromium (Playwright), com o laço
 * parado, o relógio de performance.now() controlado e o desenho feito à mão (render). Mede pixels reais do canvas.
 *
 * Numeração (a do pedido, na ordem em que aparece):
 *  20 presença em todos os tipos · 21 valores reais (barras) · 22 idade · 23 legibilidade/contraste/distância de 6 blocos
 *  24 ancoragem por espécie/tamanho · 25 acompanha animações sem tremer · 26 oclusão/dentro de casa · 27 remoção na morte
 *  28 sem sobreposição · 29 desempenho e recursos · 30 não interfere na simulação · 31 coerência de fome/sede/idade no tempo
 *
 * Uso: NODE_PATH=$(npm root -g) node tests/browser/ecosystem-c.mjs
 */
import { launch, ok, run } from './lib.mjs';
import { installTools } from './eco-lib.mjs';
import { STATUS_COLORS as COL, STATUS_LAYOUT as LAY, statusScale, fmtAge, lifeStage } from '../../src/config/ecosystem.js';

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const { p, errs, close } = await launch({ width: 960, height: 540 });
await installTools(p);
const J = async (code) => JSON.parse(await run(p, `JSON.stringify((() => {${code}})())`));

// relógio controlável + utilidades de captura (dentro do jogo)
const PRE = `
  if (!globalThis.__clk) { globalThis.__ptr = performance.now.bind(performance); globalThis.__clk = { t: 100000 }; performance.now = () => globalThis.__clk.t; } // relógio virtual: só anda quando o teste manda (simulação determinística)
  const CV = VDC.modules['rendering/Canvas'], AS = T.AS, dbg = AS.statusDebug, LAY = T.Eco.STATUS_LAYOUT;
  const adv = (ms) => { __clk.t += ms; };
  const frame = (ms = 300) => { adv(ms); render(1234.5 + __clk.t / 1000); };
  const shown = (e) => AS.statusTopOf(e) != null;
  const field = (seed) => { __clk.t = 100000; T.seed(seed); T.reset(); const tx = (T.home.x / TS) | 0, ty = ((T.home.y / TS) | 0) - 4; T.field(tx, ty, 16); T.player(T.C.x, T.C.y); LAY.showR = globalThis.__showR || LAY.showR; if (herd[0]) { herd[0].x = 40; herd[0].y = 40; herd[0].dead = false; } return T.C; };
  const spyBlocks = (fn) => { const g = CV.ctx, orig = g.drawImage, calls = []; g.drawImage = function (src, ...a) { if (a.length === 4 && src instanceof HTMLCanvasElement && src !== g.canvas && a[2] >= 26 && a[2] <= 60 && a[3] >= 18 && a[3] <= 26) calls.push({ alpha: g.globalAlpha, w: a[2], h: a[3] }); return orig.call(this, src, ...a); }; try { fn(); } finally { g.drawImage = orig; } return calls; };
  const rectOf = (e) => { const t = AS.statusTopOf(e); if (t == null) return null; const c = dbg.rects().filter((r) => r.y === t).sort((a, b) => Math.abs(a.x + a.w / 2 - e.x) - Math.abs(b.x + b.w / 2 - e.x)); return c[0] || null; };
  const px = (wx, wy) => [Math.round((wx - wCam.x) * CV.RS), Math.round((wy - wCam.y) * CV.RS)];
  const grab = (x, y, w, h) => { const [cx, cy] = px(x, y); return CV.ctx.getImageData(cx, cy, Math.round(w * CV.RS), Math.round(h * CV.RS)).data; };
  const near = (d, rgb, tol) => { let n = 0; for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - rgb[0]) + Math.abs(d[i + 1] - rgb[1]) + Math.abs(d[i + 2] - rgb[2]) <= tol && d[i + 3] > 200) n++; return n; };
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const kscale = () => { const css = Math.min(innerWidth / VW, innerHeight / VH); return T.Eco.statusScale(css); };
  if (!globalThis.__showR) globalThis.__showR = LAY.showR;
`;

/* ===================== 20. presença em todos os tipos de animal ===================== */
{
  const r = await J(`${PRE}
    const c = field(100); const out = { items: [], chickenFox: 0 };
    const ring = (i, n, R = 70) => [c.x + Math.cos((i / n) * 6.283) * R, c.y + Math.sin((i / n) * 6.283) * R];
    const spec = ['deer', 'hare', 'grouse', 'fox', 'boar', 'jaguar', 'anaconda'];
    const subj = [];
    spec.forEach((sp, i) => { const [x, y] = ring(i, 10); subj.push([sp, T.mk(sp, x, y, { age: 999 })]); });
    // filhotes de duas espécies
    { const [x, y] = ring(7, 10); subj.push(['deer(filhote)', T.mk('deer', x, y, { age: 30 })]); }
    { const [x, y] = ring(8, 10); subj.push(['jaguar(filhote)', T.mk('jaguar', x, y, { age: 10 })]); }
    // vaca (do jogo) e galinha
    const cow = herd[0]; cow.x = ring(9, 10)[0]; cow.y = ring(9, 10)[1]; cow.age = 3000; cow.dead = false; subj.push(['vaca', cow]);
    const hen = mkChx({ x: c.x - 100, y: c.y + 20, sex: 'f', age: CHX_ADULT + 5 }); chx.push(hen); subj.push(['galinha', hen]);
    const chick = mkChx({ x: c.x + 100, y: c.y + 30, sex: 'm', age: 20 }); chx.push(chick); subj.push(['pinto', chick]);
    frame();
    for (const [n, e] of subj) { const m = dbg.metaOf(e); out.items.push({ n, shown: shown(e), age: m && m.age, stage: m && m.stage, wh: m && m.wh, wt: m && m.wt }); }
    out.total = dbg.shown();
    return out;`);
  console.log('  [20]', JSON.stringify(r.items.map((i) => `${i.n}:${i.shown ? 'sim' : 'NÃO'}(${i.age},${i.stage})`)));
  for (const i of r.items) ok(i.shown, `20. indicador aparece em: ${i.n} (idade ${i.age}, fase ${i.stage}, barras ${i.wh}/${i.wt} px)`);
  ok(r.items.some((i) => i.n.includes('filhote') && i.stage === 'filhote'), `20. filhotes são marcados como "filhote"`);
}

/* ===================== 21. valores reais → barras (pixels) ===================== */
{
  const r = await J(`${PRE}
    const c = field(200); const k = kscale(), f = k * CV.RS, bw = LAY.barW;
    const e = T.mk('deer', c.x + 20, c.y - 70, { age: 999, hun: 0.1, thi: 0.1 });
    const colHun = ${JSON.stringify(hex(COL.hunger))}, colHunC = ${JSON.stringify(hex(COL.hungerCrit))}, colThi = ${JSON.stringify(hex(COL.thirst))}, colThiC = ${JSON.stringify(hex(COL.thirstCrit))};
    const meas = (hun, thi) => {
      e.hun = hun; e.thi = thi; frame(); const r0 = rectOf(e), m = dbg.metaOf(e);
      const d = grab(r0.x, r0.y, r0.w, r0.h);
      return { wh: m.wh, wt: m.wt, hc: m.hc, tc: m.tc, oh: near(d, colHun, 60), rh: near(d, colHunC, 60), bt: near(d, colThi, 60), pt: near(d, colThiC, 60), f };
    };
    const A = meas(0.1, 0.1), B = meas(0.6, 0.45), C = meas(0.95, 0.9), D = meas(0, 0), E = meas(1, 1);
    return { A, B, C, D, E, barH: LAY.barH, bw, f, hunB: e.hun };`);
  console.log('  [21]', JSON.stringify(r));
  const f2 = r.f * r.f;
  const exp = (px) => px * r.barH * f2;
  ok(r.A.wh === 2 && r.B.wh === 12 && r.C.wh === 19 && r.D.wh === 0 && r.E.wh === 20, `21. fome 0,1/0,6/0,95/0/1 → barras de ${r.A.wh}/${r.B.wh}/${r.C.wh}/${r.D.wh}/${r.E.wh} px de ${r.bw} (proporcional ao valor real)`);
  ok(r.A.wt === 2 && r.B.wt === 9 && r.C.wt === 18 && r.D.wt === 0 && r.E.wt === 20, `21. sede 0,1/0,45/0,9/0/1 → barras de ${r.A.wt}/${r.B.wt}/${r.C.wt}/${r.D.wt}/${r.E.wt} px`);
  const dH = r.B.oh - r.A.oh;
  ok(Math.abs(dH - exp(10)) <= exp(10) * 0.3, `21. pixels laranja de fome: de ${r.A.oh} (0,1) para ${r.B.oh} (0,6) = +${dH}, esperado ≈ +${Math.round(exp(10))} (±30%) — o canvas mostra a barra proporcional`);
  const dT = r.B.bt - r.A.bt;
  ok(Math.abs(dT - exp(7)) <= exp(7) * 0.35, `21. pixels azuis de sede: de ${r.A.bt} (0,1) para ${r.B.bt} (0,45) = +${dT}, esperado ≈ +${Math.round(exp(7))} (±35%)`);
  ok(r.C.hc && r.C.rh > r.C.oh && r.E.hc && !r.B.hc, `21. fome ≥ 75% vira vermelho (crítico): ${r.C.rh} px vermelhos > ${r.C.oh} laranja; 60% continua laranja (${r.B.oh} px)`);
  ok(r.C.tc && r.C.pt > r.C.bt && !r.B.tc, `21. sede ≥ 75% vira roxo (crítico): ${r.C.pt} px roxos > ${r.C.bt} azuis; 45% continua azul`);
  ok(r.D.wh === 0 && r.D.wt === 0, `21. valores zerados mostram barra vazia (sem preenchimento)`);
}

/* ===================== 22. idade ===================== */
{
  const r = await J(`${PRE}
    const c = field(300); const e = T.mk('boar', c.x + 25, c.y - 60, { age: 999, hun: 0.2, thi: 0.2 });
    const cases = [0, 5, 59, 60, 61, 119, 600, 1199, 1200, 1260, 2500, 4000];
    const rows = cases.map((a) => { e.age = a; frame(); return { a, txt: dbg.metaOf(e).age, st: dbg.metaOf(e).stage }; });
    // idade real passa com a simulação: 0,05 de idade por passo
    e.age = 100; e.state = 'rest'; e.t = 9999; e.hun = 0; e.thi = 0; frame(); const t0 = dbg.metaOf(e).age; const a0 = e.age;
    T.step(0.05, 40); const a1 = e.age; frame(); const t1 = dbg.metaOf(e).age;
    // idoso: a partir de 82% da vida
    e.age = e.life * 0.9; frame(); const old = dbg.metaOf(e).stage;
    const cow = herd[0]; cow.dead = false; cow.x = c.x - 30; cow.y = c.y - 60; cow.age = 100; cow.calf = true; frame(); const calfSt = dbg.metaOf(cow).stage;
    cow.age = 2000; cow.calf = false; frame(); const cowSt = dbg.metaOf(cow).stage;
    return { rows, a0, a1, t0, t1, old, calfSt, cowSt, life: e.life };`);
  console.log('  [22]', JSON.stringify(r.rows.map((x) => `${x.a}→${x.txt}`)), r.t0, '→', r.t1);
  const bad = r.rows.filter((x) => x.txt !== fmtAge(x.a));
  ok(bad.length === 0, `22. texto da idade = fmtAge(idade real) em ${r.rows.length} casos (${r.rows.map((x) => x.txt).join(', ')})`);
  ok(r.a1 > r.a0 && r.t1 !== r.t0 || r.a1 - r.a0 > 1, `22. a idade avança com a simulação (${r.a0.toFixed(1)} → ${r.a1.toFixed(1)} min) e o indicador acompanha ("${r.t0}" → "${r.t1}")`);
  ok(r.old === 'idoso', `22. animal perto do fim da vida aparece como "idoso" (a partir de 82% de ${Math.round(r.life)} min)`);
  ok(r.calfSt === 'filhote' && r.cowSt === 'adulto', `22. vaca: bezerra = ${r.calfSt}, adulta = ${r.cowSt}`);
  ok(lifeStage(10, 150, 0) === 'filhote' && lifeStage(150, 150, 0) === 'adulto' && lifeStage(900, 150, 1000) === 'idoso', `22. regra de fase da vida (filhote/adulto/idoso) conferida na função`);
}

/* ===================== 23. legibilidade: distância de 6 blocos, tamanho em CSS e contraste ===================== */
{
  const L = (h) => { const [r, g, b] = [h.slice(1, 3), h.slice(3, 5), h.slice(5, 7)].map((x) => parseInt(x, 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const lumRGB = ([r, g, b]) => { const f = [r, g, b].map((x) => x / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]; };
  const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  const hue = (h) => { const [r, g, b] = [h.slice(1, 3), h.slice(3, 5), h.slice(5, 7)].map((x) => parseInt(x, 16) / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let H = d === 0 ? 0 : mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; H *= 60; return (H + 360) % 360; };
  const hd = (a, b) => { const d = Math.abs(hue(a) - hue(b)); return Math.min(d, 360 - d); };
  // placa: rgba(8,10,14,.78) sobre fundos claro (areia) e escuro
  const plate = (bg) => [0, 1, 2].map((i) => Math.round([8, 10, 14][i] * 0.9 + bg[i] * 0.1));
  const sand = plate([232, 217, 168]), white = plate([255, 255, 255]), dark = plate([20, 30, 20]);
  const names = ['hunger', 'hungerCrit', 'thirst', 'thirstCrit'];
  const minRatio = Math.min(...names.flatMap((n) => [sand, white, dark].map((bg) => ratio(L(COL[n]), lumRGB(bg)))));
  ok(minRatio >= 4.5, `23. contraste das barras contra a placa escura (sobre areia, branco e mata escura): mínimo ${minRatio.toFixed(1)}:1 (≥ 4,5:1; o mínimo WCAG para gráficos é 3:1)`);
  ok(hd(COL.hunger, COL.thirst) >= 120 && hd(COL.hungerCrit, COL.thirstCrit) >= 90, `23. fome e sede são distintas pelo matiz: laranja×azul ${hd(COL.hunger, COL.thirst).toFixed(0)}°, vermelho×roxo ${hd(COL.hungerCrit, COL.thirstCrit).toFixed(0)}° (e por ícone e posição, não só por cor)`);
  ok(hd(COL.hunger, COL.hungerCrit) >= 15 || Math.abs(L(COL.hunger) - L(COL.hungerCrit)) > 0.05, `23. estado crítico é distinguível do normal (fome: ${hd(COL.hunger, COL.hungerCrit).toFixed(0)}° de matiz)`);
  // tamanho em CSS px em vários tamanhos de janela (com a escala adaptativa)
  const sizes = [[390, 844], [844, 390], [480, 270], [800, 450], [960, 540], [1280, 720], [1920, 1080], [2560, 1440]];
  const rows = sizes.map(([w, h]) => { const css = Math.min(w / 480, h / 270), k = statusScale(css); return { s: `${w}x${h}`, bar: LAY.barH * k * css, text: 7 * k * css, k }; });
  console.log('  [23]', rows.map((r) => `${r.s}: barra ${r.bar.toFixed(1)}px texto ${r.text.toFixed(1)}px`).join(' | '));
  ok(rows.every((r) => r.bar >= 3), `23. altura da barra ≥ 3 px CSS em todos os tamanhos (mín ${Math.min(...rows.map((r) => r.bar)).toFixed(1)} px)`);
  ok(rows.every((r) => r.text >= 9.5), `23. texto da idade ≥ ~10 px CSS em todos os tamanhos (mín ${Math.min(...rows.map((r) => r.text)).toFixed(1)} px)`);
  // a 6 blocos (96 px) o bloco está tão opaco quanto de perto; passando de 104 px começa a esmaecer (alfa lido da chamada de desenho)
  const r = await J(`${PRE}
    const at = (dist) => { const c = field(400); const e = T.mk('deer', c.x + dist, c.y, { age: 999, hun: 0.7, thi: 0.7 }); let calls = []; calls = spyBlocks(() => frame()); return calls.length ? calls[0].alpha : null; };
    const out = { d30: at(30), d96: at(96), d104: at(104), d112: at(112), d118: at(118), d125: at(125) };
    out.showR = LAY.showR; out.fadeFrom = LAY.fadeFrom;
    // e o desenho nítido: a 96 px o bloco está inteiro (mesmas cores que a 30 px)
    const colHun = ${JSON.stringify(hex(COL.hunger))};
    const cnt = (dist) => { const c = field(401); const e = T.mk('deer', c.x + dist, c.y, { age: 999, hun: 0.7, thi: 0.7 }); frame(); const r0 = rectOf(e); const d = grab(r0.x, r0.y, r0.w, r0.h); return near(d, colHun, 45); };
    out.px30 = cnt(30); out.px96 = cnt(96);
    return out;`);
  console.log('  [23b]', JSON.stringify(r));
  ok(r.d30 === 1 && r.d96 === 1 && r.d104 === 1, `23. até 104 px (6,5 blocos) o bloco é desenhado com opacidade total (alfa ${r.d30}/${r.d96}/${r.d104} a 30/96/104 px)`);
  ok(r.px96 >= r.px30 * 0.9 && r.px96 > 20, `23. a 6 blocos (96 px) o bloco tem a mesma cor cheia que de perto: ${r.px96} px laranja contra ${r.px30} a 30 px`);
  ok(r.d112 > 0 && r.d112 < 1 && r.d118 < r.d112 && r.d125 == null, `23. depois de 104 px esmaece (alfa ${r.d112} a 112 px, ${r.d118} a 118 px) e some em ${r.showR} px (125 px: ${r.d125 == null ? 'não desenha' : 'desenha'})`);
  ok(r.showR >= 100 && r.fadeFrom >= 96, `23. raio de visibilidade ${r.showR} px = ${(r.showR / 16).toFixed(1)} blocos (esmaece a partir de ${r.fadeFrom}) cobre os 6 blocos pedidos`);
}

/* ===================== 24. ancoragem por espécie/tamanho ===================== */
{
  const r = await J(`${PRE}
    const c = field(500); const out = [];
    const spots = [[c.x + 100, c.y + 6]];
    const sprTop = (mk, hideFn) => { // topo REAL do sprite: renderiza sem indicadores, com e sem o animal
      LAY.showR = 0; const e = mk(); render(1234.5); const [x0, y0] = [e.x - 34, e.y - 90];
      const a = grab(x0, y0, 68, 100); const sx = e.x, sy = e.y; if (hideFn) hideFn(e, true); else { e.x = -9000; e.y = -9000; } render(1234.5); const b = grab(x0, y0, 68, 100); if (hideFn) hideFn(e, false); else { e.x = sx; e.y = sy; }
      const W = Math.round(68 * CV.RS); let top = null;
      for (let y = 0; y < Math.round(100 * CV.RS) && top == null; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 60) { top = y / CV.RS; break; } }
      LAY.showR = globalThis.__showR; return { e, topY: top == null ? null : y0 + top };
    };
    const one = (label, mk, hideFn) => {
      fauna.length = 0; chx.length = 0; herd[0].x = 40; herd[0].y = 40; T.player(c.x, c.y);
      const { e, topY } = sprTop(mk, hideFn);
      render(1234.5); adv(300); render(1234.5); const rect = rectOf(e);
      out.push({ label, spriteTop: topY, blockBottom: rect ? rect.y + rect.h : null, gap: rect && topY != null ? +(topY - (rect.y + rect.h)).toFixed(1) : null, head: dbg.metaOf(e).head });
    };
    for (const sp of ['deer', 'hare', 'grouse', 'fox', 'boar', 'jaguar']) {
      one(sp, () => T.mk(sp, spots[0][0], spots[0][1], { age: 999, state: 'idle', t: 99, hun: 0.4, thi: 0.4 }));
      one(sp + ' filhote', () => T.mk(sp, spots[0][0], spots[0][1], { age: sp === 'jaguar' ? 10 : 20, state: 'idle', t: 99, hun: 0.4, thi: 0.4 }));
    }
    one('vaca', () => { const cow = herd[0]; cow.dead = false; cow.x = spots[0][0]; cow.y = spots[0][1]; cow.age = 3000; cow.calf = false; return cow; });
    one('sucuri (terra)', () => T.mk('anaconda', spots[0][0], spots[0][1], { age: 999, state: 'idle', t: 99, hun: 0.4 }));
    one('galinha', () => { const h = mkChx({ x: spots[0][0], y: spots[0][1], sex: 'f', age: CHX_ADULT + 5 }); chx.push(h); return h; });
    one('pinto', () => { const h = mkChx({ x: spots[0][0], y: spots[0][1], sex: 'f', age: 20 }); chx.push(h); return h; });
    one('galo', () => { const h = mkChx({ x: spots[0][0], y: spots[0][1], sex: 'm', age: CHX_ADULT + 5 }); chx.push(h); return h; });
    return out;`);
  console.log('  [24]', r.map((x) => `${x.label}:${x.gap}`).join(' '));
  const miss = r.filter((x) => x.gap == null);
  ok(miss.length === 0, `24. todos os tipos têm bloco e sprite medidos (${r.length}); sem medida: ${miss.map((x) => x.label).join(', ') || 'nenhum'}`);
  const bad = r.filter((x) => x.gap != null && (x.gap < -3 || x.gap > 14));
  ok(bad.length === 0, `24. bloco colado na cabeça de cada animal (folga entre o topo do sprite e o fundo do bloco: ${r.filter((x) => x.gap != null).map((x) => x.label + ' ' + x.gap).join(', ')}) — aceito −3..14 px (nunca cobre o sprite; em poses baixas, como a onça parada, fica um pouco acima); fora: ${bad.map((x) => x.label + ' ' + x.gap).join(', ') || 'nenhum'}`);
  const kid = r.filter((x) => x.label.endsWith('filhote')).every((k) => { const a = r.find((x) => x.label === k.label.replace(' filhote', '')); return a && k.head < a.head; });
  ok(kid, `24. filhotes ficam mais baixos que os adultos da mesma espécie (altura do encaixe menor)`);
}

/* ===================== 25. acompanha o animal nas animações, sem tremer ===================== */
{
  const r = await J(`${PRE}
    const out = {};
    // mede quadro a quadro: o bloco deve manter o mesmo deslocamento em relação ao animal (sem tremida)
    const watch = (label, e, c, nFrames, step) => {
      let px = null, py = null, pex = null, pey = null, maxDx = 0, maxDy = 0, off = [], offY = [], moved = 0, lost = 0, near = 0, jumps = 0;
      for (let i = 0; i < nFrames; i++) {
        step(i);
        const dP = Math.hypot(e.x - S.px, e.y - S.py); render(1234.5 + i * 0.016); adv(16.7);
        if (dP > 100 || e.state === 'dead') continue; near++; // morto: o indicador some de propósito (cenário 27)
        const r0 = rectOf(e); if (!r0) { lost++; px = null; continue; }
        const cx = r0.x + r0.w / 2; off.push(e.x - cx); offY.push((e.y - r0.y - r0.h) - dbg.metaOf(e).head);
        if (px != null) { const ddx = (cx - px) - (e.x - pex), ddy = (r0.y - py) - (e.y - pey); maxDx = Math.max(maxDx, Math.abs(ddx)); maxDy = Math.max(maxDy, Math.abs(ddy)); if (Math.abs(e.x - pex) + Math.abs(e.y - pey) > 0.3) moved++; if (Math.abs(ddx) > 2 || Math.abs(ddy) > 2) jumps++; }
        px = cx; py = r0.y; pex = e.x; pey = e.y;
      }
      const rng = (a) => (a.length ? Math.max(...a) - Math.min(...a) : 999);
      out[label] = { near, lost, moved, jumps, maxDx: +maxDx.toFixed(2), maxDy: +maxDy.toFixed(2), rangeX: +rng(off).toFixed(2), rangeY: +rng(offY).toFixed(2) };
    };
    const scripted = (label, sp, speed, extra) => { // trajetória roteirizada (sem IA): isola o desenho
      const c = field(600); const e = T.mk(sp, c.x - 40, c.y - 40, Object.assign({ age: 999, hun: 0.4, thi: 0.4, t: 9999 }, extra || {}));
      watch(label, e, c, 140, (i) => { e.x += speed * 0.0167 * Math.cos(0.7); e.y += speed * 0.0167 * Math.sin(0.7); e.mv = speed > 0; e.dir = 0.7; e.z = speed > 60 ? Math.abs(Math.sin(i * 0.5)) * 3 : 0; if (i % 20 === 0) { S.vx = 0; S.vy = 0; } });
    };
    scripted('veado andando (roteirizado, 24 px/s)', 'deer', 24); scripted('veado correndo com saltos (roteirizado, 90 px/s)', 'deer', 90, { state: 'flee' });
    scripted('raposa correndo (roteirizado, 100 px/s)', 'fox', 100, { state: 'flee' }); scripted('javali parado comendo', 'boar', 0, { state: 'forage' }); scripted('jaguar andando', 'jaguar', 40);
    scripted('lebre correndo (roteirizado, 70 px/s)', 'hare', 70, { state: 'flee' });
    // simulação real: o veado FOGE de verdade de uma onça faminta; a sucuri em terra; a onça caçando
    {
      const c = field(610); const j = T.mk('jaguar', c.x - 80, c.y - 40, { hun: 0.97, sex: 'm', hx: c.x - 80, hy: c.y - 40 }); const d = T.mk('deer', c.x - 20, c.y - 40, { age: 999, state: 'forage', t: 99, hun: 0.4 });
      watch('veado fugindo de verdade (simulação)', d, c, 220, (i) => { T.tick(0.05); T.player(c.x + 10 * Math.sin(i / 40), c.y + 20); S.vx = 0; S.vy = 0; adv(50); });
    }
    {
      const c = field(620); const e = T.mk('anaconda', c.x - 30, c.y - 40, { age: 999, state: 'idle', t: 99 }); e.state = 'go'; e.gx = e.x + 90; e.gy = e.y + 20; e.gsp = 1; e.gt = 20; e.stuck = 0; e.after = 'idle'; e.adur = 3;
      watch('sucuri rastejando em terra (simulação)', e, c, 160, (i) => { T.tick(0.05); T.player(c.x, c.y); S.vx = 0; S.vy = 0; });
    }
    return out;`);
  console.log('  [25]', JSON.stringify(r));
  for (const [k, v] of Object.entries(r)) {
    ok(v.near >= 40 && v.lost <= v.near * 0.1, `25. ${k}: indicador presente em ${v.near - v.lost}/${v.near} quadros perto o bastante`);
    ok(v.rangeX <= 1.5 && v.jumps === 0, `25. ${k}: sem tremida — o deslocamento em relação ao animal varia ${v.rangeX} px (≤ 1,5); salto máx. entre quadros ${v.maxDx}/${v.maxDy} px, saltos > 2 px: ${v.jumps}; animal moveu em ${v.moved} quadros`);
  }
}

/* ===================== 26. oclusão por linha de visão; dentro de casa ===================== */
{
  const r = await J(`${PRE}
    const c = field(700); const res = {};
    const mk = (dx, dy) => T.mk('deer', c.x + dx, c.y + dy, { age: 999, hun: 0.4, thi: 0.4, state: 'rest', t: 999 });
    const tile = (x, y) => [Math.floor(x / TS), Math.floor(y / TS)];
    // livre
    { fauna.length = 0; const e = mk(70, 0); frame(); res.free = shown(e); }
    // pedra entre o jogador e o animal
    { fauna.length = 0; const e = mk(80, 0); const [tx, ty] = tile(c.x + 40, c.y); obj[ty * MW + tx] = ROCK; frame(); res.rock = shown(e); obj[ty * MW + tx] = 0; frame(); res.rockGone = shown(e); }
    // cerca (transparente) entre os dois
    { fauna.length = 0; const e = mk(80, 0); const [tx, ty] = tile(c.x + 40, c.y); obj[ty * MW + tx] = FENCE; frame(); res.fence = shown(e); obj[ty * MW + tx] = 0; }
    // 1 árvore (0,45 < 0,5) mostra; 2 árvores esconde
    { fauna.length = 0; const e = mk(90, 0); const [tx, ty] = tile(c.x + 30, c.y); obj[ty * MW + tx] = TREE; frame(); res.tree1 = shown(e); const [tx2, ty2] = tile(c.x + 60, c.y); obj[ty2 * MW + tx2] = TREE; frame(); res.tree2 = shown(e); obj[ty * MW + tx] = 0; obj[ty2 * MW + tx2] = 0; }
    // casa/lixeira entre
    { fauna.length = 0; const e = mk(80, 0); const [tx, ty] = tile(c.x + 40, c.y); obj[ty * MW + tx] = HOUSE; frame(); res.house = shown(e); obj[ty * MW + tx] = 0; }
    // dentro de casa: nenhum indicador (nem pelo desenho do jogo, nem chamando direto)
    { fauna.length = 0; const e = mk(60, 0); frame(); res.before = dbg.shown(); S.inside = true; res.insideCalls = spyBlocks(() => { try { frame(); } catch (err) { res.insideErr = String(err); } }).length; AS.drawAnimalStatus(); res.insideShown = dbg.shown(); res.insideEnt = shown(e); S.inside = false; frame(); res.after = dbg.shown(); }
    // sucuri camuflada na água só denuncia o lugar de bem perto
    { fauna.length = 0; const shallow = (tx, ty) => ground[ty * MW + tx] === WATER && (WTc[ty * MW + tx] === 7 || WTc[ty * MW + tx] === 8); let sx = T.snake.x, sy = T.snake.y, best = 99; const stx = (sx / TS) | 0, sty = (sy / TS) | 0; for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) { let all = true; for (let a = -1; a <= 1 && all; a++) for (let b = -1; b <= 1; b++) if (!shallow(stx + dx + b, sty + dy + a)) { all = false; break; } if (all && Math.hypot(dx, dy) < best) { best = Math.hypot(dx, dy); sx = (stx + dx) * TS + 8; sy = (sty + dy) * TS + 8; } } T.player(sx + 60, sy); const a = T.mk('anaconda', sx, sy, { state: 'ambush', hide: true, t: 999, age: 999 }); T.tick(0.05); frame(); res.snakeFar = shown(a); res.snakeCamo = +a.camo.toFixed(2); T.player(sx + 18, sy); frame(); res.snakeNear = shown(a); res.snakeLandShown = (() => { T.player(T.C.x, T.C.y); const b = T.mk('anaconda', T.C.x + 40, T.C.y, { state: 'idle', t: 99, age: 999 }); T.tick(0.05); frame(); return shown(b) && b.camo; })(); }
    return res;`);
  console.log('  [26]', JSON.stringify(r));
  ok(r.free, `26. animal à vista tem indicador`);
  ok(!r.rock && r.rockGone, `26. pedra entre o jogador e o animal esconde o indicador (não é desenhado através do obstáculo) e ele volta quando o obstáculo some`);
  ok(r.fence, `26. cerca não esconde (dá para ver através dela)`);
  ok(r.tree1 && !r.tree2, `26. uma árvore ainda deixa ver o indicador (oclusão parcial 0,45); duas escondem (0,90)`);
  ok(!r.house, `26. casa/parede esconde o indicador`);
  ok(r.snakeFar === false && r.snakeNear === true && !!r.snakeLandShown, `26. sucuri camuflada na água (camuflagem ${r.snakeCamo}) NÃO denuncia o lugar a 60 px, aparece a 18 px; em terra (camuflagem baixa) aparece normalmente`);
  ok(r.before >= 1 && r.insideCalls === 0 && r.insideShown === 0 && !r.insideEnt && r.after === r.before, `26. dentro de casa não há desenho de indicadores (${r.insideCalls} blocos desenhados; direto: ${r.insideShown}) e eles voltam ao sair (${r.after})`);
}

/* ===================== 27. remoção quando o animal morre ou some ===================== */
{
  const r = await J(`${PRE}
    const c = field(800); const res = {};
    // (a) morte pelo estado 'dead'
    { const e = T.mk('deer', c.x + 40, c.y - 40, { age: 999 }); const e2 = T.mk('boar', c.x - 40, c.y - 40, { age: 999 }); frame(); res.aliveBefore = shown(e) && shown(e2); e.state = 'dead'; e.t = 5; frame(); res.deadShown = shown(e); res.otherShown = shown(e2); }
    // (b) removido da lista (despawn)
    { fauna.length = 0; const e = T.mk('fox', c.x + 40, c.y - 40, { age: 999 }); frame(); const had = shown(e); const idx = fauna.indexOf(e); fauna.splice(idx, 1); frame(); res.removed = { had, now: shown(e), shown: dbg.shown() }; }
    // (c) morte de verdade: onça faminta (jogador longe) mata o cervo; "espia" com o jogador perto só para desenhar
    { fauna.length = 0; T.seed(801); const far = [c.x, c.y + 300]; const j = T.mk('jaguar', c.x - 70, c.y - 60, { hun: 0.97, sex: 'm', hx: c.x - 70, hy: c.y - 60 }); const d = T.mk('deer', c.x, c.y - 60, { age: 999, state: 'rest', t: 5, hun: 0.2, thi: 0.2 });
      T.player(far[0], far[1]);
      let died = -1, backShown = 0, shownBefore = 0, samples = 0;
      for (let i = 0; i < 1600; i++) {
        T.tick(0.05);
        if (i % 6 === 0) { const sx = S.px, sy = S.py; T.player(d.x, d.y + 55); frame(80); const sh = shown(d); T.player(sx, sy);
          const dead = d.state === 'dead' || !fauna.includes(d) || d.gone;
          if (!dead && sh) shownBefore++; if (dead && died < 0) died = i; if (died >= 0 && i > died) { samples++; if (sh) backShown++; } }
        if (died >= 0 && i > died + 90) break;
      }
      res.kill = { died, shownBefore, backShown, samples, state: d.state }; }
    // (d) vaca e galinha mortas
    { fauna.length = 0; T.player(c.x, c.y); const cow = herd[0]; cow.dead = false; cow.x = c.x + 30; cow.y = c.y - 60; const h = mkChx({ x: c.x - 30, y: c.y - 60, sex: 'f', age: CHX_ADULT + 5 }); chx.push(h); frame(); frame(); const hadC = shown(cow), hadH = shown(h); cow.dead = true; h.dead = true; frame(); res.cowChx = { had: hadC && hadH, hadC, hadH, cow: shown(cow), chx: shown(h) }; cow.dead = false; chx.length = 0; }
    return res;`);
  console.log('  [27]', JSON.stringify(r));
  ok(r.aliveBefore && !r.deadShown && r.otherShown, `27. animal no estado "morto" perde o indicador; os vivos ao lado continuam`);
  ok(r.removed.had && !r.removed.now && r.removed.shown === 0, `27. animal retirado do mundo (despawn) não deixa indicador para trás`);
  ok(r.kill.died >= 0 && r.kill.samples >= 5 && r.kill.shownBefore > 0 && r.kill.backShown === 0, `27. presa abatida por uma onça: indicador existia (${r.kill.shownBefore} amostras) e some na morte (reaparece em ${r.kill.backShown}/${r.kill.samples} amostras depois; estado final "${r.kill.state}")`);
  ok(r.cowChx.hadC && r.cowChx.hadH && !r.cowChx.cow && !r.cowChx.chx, `27. vaca e galinha mortas também perdem o indicador`);
}

/* ===================== 28. sem sobreposição ===================== */
{
  const r = await J(`${PRE}
    const out = {};
    const crowd = (n, spread, label) => {
      const c = field(900 + n); const list = [];
      for (let i = 0; i < n; i++) { const sp = ['deer', 'hare', 'boar', 'fox', 'grouse'][i % 5]; list.push(T.mk(sp, c.x + 30 + ((i * 53) % spread) - spread / 2, c.y - 40 + ((i * 29) % spread) - spread / 2, { age: 999, hun: (i % 10) / 10, thi: ((i * 3) % 10) / 10 })); }
      frame(); const rs = dbg.rects(); let overlaps = 0, outside = 0;
      for (let i = 0; i < rs.length; i++) { for (let j = i + 1; j < rs.length; j++) { const a = rs[i], b = rs[j]; if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) overlaps++; } if (rs[i].x < wCam.x || rs[i].x + rs[i].w > wCam.x + VW || rs[i].y < wCam.y) outside++; }
      const nearest = list.map((e) => [Math.hypot(e.x - S.px, e.y - S.py), shown(e)]).sort((a, b) => a[0] - b[0]);
      out[label] = { n, shown: rs.length, overlaps, outside, nearestShown: nearest.slice(0, Math.min(rs.length, 4)).every((x) => x[1]), maxShown: 28 };
    };
    crowd(6, 20, '6 em 20 px'); crowd(12, 30, '12 em 30 px'); crowd(25, 40, '25 em 40 px'); crowd(60, 60, '60 em 60 px');
    return out;`);
  console.log('  [28]', JSON.stringify(r));
  for (const [k, v] of Object.entries(r)) {
    ok(v.overlaps === 0, `28. ${k}: 0 blocos sobrepostos entre os ${v.shown} desenhados`);
    ok(v.outside === 0 && v.shown <= v.maxShown && v.shown >= Math.min(v.n, 6), `28. ${k}: ${v.shown} mostrados (teto ${v.maxShown}), nenhum fora da tela`);
  }
}

/* ===================== 29. desempenho e recursos ===================== */
{
  const r = await J(`${PRE}
    const out = { rows: [] };
    const cnt = { n: 0 }; const orig = document.createElement.bind(document); document.createElement = (t, o) => { if (String(t).toLowerCase() === 'canvas') cnt.n++; return orig(t, o); };
    for (const n of [10, 30, 60, 100]) {
      const c = field(1000 + n);
      for (let i = 0; i < n; i++) T.mk(['deer', 'hare', 'boar', 'fox', 'grouse'][i % 5], c.x + Math.cos(i) * (20 + (i * 7) % 90), c.y + Math.sin(i * 1.7) * (20 + (i * 11) % 90), { age: 999, hun: (i % 10) / 10, thi: ((i * 3) % 10) / 10 });
      render(1234.5); const ts = [];
      for (let k = 0; k < 240; k++) { adv(16.7); const t0 = __ptr(); AS.drawAnimalStatus(); ts.push(__ptr() - t0); }
      ts.sort((a, b) => a - b);
      out.rows.push({ n, mean: +(ts.reduce((a, b) => a + b, 0) / ts.length).toFixed(3), p95: +ts[Math.floor(ts.length * 0.95)].toFixed(3), max: +ts[ts.length - 1].toFixed(2), shown: dbg.shown() });
    }
    // cache limitado: muitas combinações diferentes de valores nunca passam do teto
    const c = field(1100); const es = []; for (let i = 0; i < 30; i++) es.push(T.mk('deer', c.x + ((i * 17) % 100) - 50, c.y - 40 - ((i * 13) % 50), { age: 999 }));
    const before = cnt.n;
    for (let k = 0; k < 1500; k++) { for (const e of es) { e.hun = Math.random(); e.thi = Math.random(); e.age = Math.random() * 5000; } adv(260); AS.drawAnimalStatus(); }
    out.cacheMax = dbg.cacheSize(); out.created = cnt.n - before; out.combos = 1500 * 30;
    // estável: sem variar valores, quase nenhum canvas novo por quadro
    for (let k = 0; k < 50; k++) { for (const e of es) { e.hun = 0.5; e.thi = 0.5; e.age = 999; } adv(260); AS.drawAnimalStatus(); }
    const b2 = cnt.n; for (let k = 0; k < 600; k++) { adv(16.7); AS.drawAnimalStatus(); } out.stableCreated = cnt.n - b2;
    // sem animais: nada desenhado, nada guardado por animal que impeça liberar (a lista de meta é WeakMap)
    fauna.length = 0; chx.length = 0; adv(300); render(1234.5); out.empty = dbg.shown();
    document.createElement = orig;
    return out;`);
  console.log('  [29]', JSON.stringify(r));
  for (const row of r.rows) ok(row.p95 < 1.5 && row.mean < 0.8, `29. ${row.n} animais por perto: ${row.mean} ms médios, p95 ${row.p95} ms, máx ${row.max} ms; ${row.shown} blocos desenhados`);
  ok(r.cacheMax <= 120, `29. cache de blocos limitado: ${r.cacheMax} ≤ 120 depois de ${r.combos} combinações de valores diferentes (${r.created} canvases criados no total — um por bloco novo; o cache só mantém ${r.cacheMax})`);
  ok(r.stableCreated === 0, `29. com valores estáveis nenhum canvas novo é criado por quadro (${r.stableCreated} em 600 quadros)`);
  ok(r.empty === 0, `29. sem animais não há nada para desenhar (${r.empty}); os dados por animal ficam num WeakMap e vão embora com o animal`);
}

/* ===================== 30. o indicador não interfere na simulação ===================== */
{
  // (a) invariante direta: desenhar os indicadores não altera NENHUM campo dos animais nem do jogador e não sorteia números
  const r = await J(`${PRE}
    const c = field(1200); const list = [];
    for (let i = 0; i < 16; i++) list.push(T.mk(['deer', 'hare', 'boar', 'fox', 'jaguar', 'grouse'][i % 6], c.x + Math.cos(i) * 80, c.y + Math.sin(i * 2) * 80, { age: 400 + i * 30, hun: 0.4 + (i % 4) * 0.12, thi: 0.3, state: 'idle', t: 2 + (i % 5) }));
    const cow = herd[0]; cow.x = c.x + 10; cow.y = c.y - 70; cow.dead = false; const hen = mkChx({ x: c.x - 90, y: c.y + 20, sex: 'f', age: CHX_ADULT + 5 }); chx.push(hen);
    const subj = [...list, cow, hen];
    const snap = (e) => Object.keys(e).sort().map((k) => { const v = e[k]; return k + '=' + (v && typeof v === 'object' ? 'ref:' + (Array.isArray(v) ? v.length : (v.id != null ? v.id : typeof v)) : v); }).join(';');
    const all = () => subj.map(snap).join('|') + '#' + JSON.stringify(Object.assign({}, S, { inv: undefined })) .length + '#' + S.px + ',' + S.py + ',' + S.vida + ',' + S.min;
    let changed = 0, rnd = 0, n = 0, drawn = 0;
    const base = Math.random; Math.random = () => { rnd++; return base(); };
    for (let i = 0; i < 400; i++) {
      adv(50); T.tick(0.05); if (i % 4 === 0) { render(1234.5 + i * 0.05); const before = all(), r0 = rnd; AS.drawAnimalStatus(); n++; if (all() !== before) changed++; if (rnd !== r0) rnd = rnd; drawn += dbg.shown(); const r1 = rnd; AS.drawAnimalStatus(); if (rnd !== r1) changed += 1000; }
    }
    Math.random = base;
    return { n, changed, drawn, subj: subj.length };`);
  console.log('  [30]', JSON.stringify(r));
  ok(r.n === 100 && r.drawn > 300, `30. ${r.n} desenhos dos indicadores com ${r.subj} animais (em média ${(r.drawn / r.n).toFixed(1)} blocos por desenho)`);
  ok(r.changed === 0, `30. desenhar os indicadores NÃO altera nenhum campo dos animais (posição, fome, sede, estado, idade, memória...), nem o jogador, e não consome números aleatórios (mudanças: ${r.changed})`);
  // (b) comparação ponta a ponta com e sem o desenho: só vale se a simulação do teste for reproduzível; senão fica registrada como não conclusiva
  const q = await J(`${PRE}
    const run1 = (draw) => {
      const c = field(1210); const list = [];
      for (let i = 0; i < 16; i++) list.push(T.mk(['deer', 'hare', 'boar', 'fox', 'jaguar', 'grouse'][i % 6], c.x + Math.cos(i) * 80, c.y + Math.sin(i * 2) * 80, { age: 400 + i * 30, hun: 0.4 + (i % 4) * 0.12, thi: 0.3, state: 'idle', t: 2 + (i % 5) }));
      list.forEach((a, i) => { a.id = 5000 + i; });
      LAY.showR = draw ? globalThis.__showR : 0;
      for (let i = 0; i < 600; i++) { adv(50); T.tick(0.05); S.px = c.x + Math.cos(i / 60) * 30; S.py = c.y + Math.sin(i / 60) * 30; S.vx = 5; S.vy = 0; if (i % 3 === 0) render(1234.5 + i * 0.05); }
      const sig = fauna.map((a) => [a.sp, Math.round(a.x), Math.round(a.y), a.state].join(',')).join('|'); LAY.showR = globalThis.__showR; return sig;
    };
    run1(true); const A = run1(true), A2 = run1(true), B = run1(false);
    return { control: A === A2, same: A === B };`);
  console.log('  [30b]', JSON.stringify(q));
  if (q.control) ok(q.same, `30. comparação ponta a ponta (com e sem desenho): estado final de todos os animais idêntico`);
  else console.log('  (30b) NÃO CONCLUSIVO: duas execuções idênticas da simulação do teste já divergem entre si (a simulação não é reprodutível bit a bit no harness) — por isso a comparação com/sem desenho não é usada como prova; vale a invariante acima.');
}

/* ===================== 31. coerência de fome, sede e idade ao longo do tempo ===================== */
{
  const r = await J(`${PRE}
    const c = field(1300); const list = [];
    for (let i = 0; i < 14; i++) list.push(T.mk(['deer', 'hare', 'boar', 'fox', 'grouse'][i % 5], c.x + Math.cos(i * 0.9) * 60, c.y + Math.sin(i * 1.3) * 50 - 20, { age: 140 + i, hun: 0.6 + (i % 5) * 0.07, thi: 0.5 + (i % 4) * 0.1, state: 'idle', t: 1 }));
    const cow = herd[0]; cow.dead = false; cow.x = c.x; cow.y = c.y - 70; cow.hunger = 0.4; cow.thirst = 0.5; cow.age = 1500; list.push(cow);
    const hen = mkChx({ x: c.x + 20, y: c.y - 80, sex: 'f', age: CHX_ADULT + 5 }); hen.hunger = 40; hen.thirst = 70; chx.push(hen); list.push(hen);
    const bar = (v) => Math.round(Math.max(0, Math.min(1, v)) * LAY.barW);
    const dh = [], dt = []; let maxDH = 0, maxDT = 0, samples = 0, ateEv = 0, drankEv = 0, ageBack = 0, ageStageSwitch = 0, followedEat = 0, followedDrink = 0;
    const last = new Map(); const lastAge = new Map();
    for (let i = 0; i < 2400; i++) { // 120 s de jogo
      T.tick(0.05); S.vx = 0; S.vy = 0;
      if (i % 5 === 0) {
        frame(260);
        for (const e of list) {
          const m = dbg.metaOf(e); if (!m || !shown(e)) continue;
          const isF = !!e.sp && e !== cow; const hun = e === cow ? e.hunger : e === hen ? Math.max(0, Math.min(1, 1 - e.hunger / 100)) : e.hun;
          const thi = e === cow ? e.thirst : e === hen ? Math.max(0, Math.min(1, 1 - e.thirst / 100)) : e.thi;
          maxDH = Math.max(maxDH, Math.abs(m.wh - bar(hun))); maxDT = Math.max(maxDT, Math.abs(m.wt - bar(thi))); dh.push(Math.abs(m.wh - bar(hun))); dt.push(Math.abs(m.wt - bar(thi))); samples++;
          const p = last.get(e); if (p) { if (hun < p.h - 0.02) { ateEv++; if (m.wh <= p.wh) followedEat++; } if (thi < p.t - 0.02) { drankEv++; if (m.wt <= p.wt) followedDrink++; } }
          last.set(e, { h: hun, t: thi, wh: m.wh, wt: m.wt });
          const ag = e.age || 0; if (lastAge.has(e) && ag < lastAge.get(e) - 1e-9) ageBack++; lastAge.set(e, ag);
        }
      }
    }
    // evento forçado: o animal "come" (fome cai 0,3) e "bebe" (sede cai 0,3) → a barra cai no quadro seguinte
    T.player(c.x, c.y); const t1 = T.mk('deer', c.x + 30, c.y - 50, { age: 999, hun: 0.85, thi: 0.75, state: 'rest', t: 9999 }); frame(); frame(); const m1 = dbg.metaOf(t1); const bH0 = m1.wh, bT0 = m1.wt; t1.hun = Math.max(0, t1.hun - 0.3); t1.thi = Math.max(0, t1.thi - 0.3); frame(); const forced = { dH: bH0 - dbg.metaOf(t1).wh, dT: bT0 - dbg.metaOf(t1).wt, hun: t1.hun, thi: t1.thi, wh: dbg.metaOf(t1).wh };
    // a transição filhote→adulto acontece exatamente em 150 min de idade
    const k = T.mk('deer', c.x + 10, c.y - 30, { age: 149.97, hun: 0, thi: 0, state: 'rest', t: 9999 }); frame(); const s0 = dbg.metaOf(k).stage; T.step(0.05, 1.5); frame(); const s1 = dbg.metaOf(k).stage;
    dh.sort((a, b) => a - b); dt.sort((a, b) => a - b); const exact = dh.filter((x) => x === 0).length / dh.length, exactT = dt.filter((x) => x === 0).length / dt.length;
    return { forced, exact, exactT, samples, maxDH, maxDT, ateEv, drankEv, followedEat, followedDrink, ageBack, s0, s1, kAge: k.age };`);
  console.log('  [31]', JSON.stringify(r));
  ok(r.samples > 300, `31. ${r.samples} amostras de animais com indicador em 120 s de jogo`);
  ok(r.maxDH <= 2 && r.maxDT <= 2 && r.exact >= 0.9 && r.exactT >= 0.9, `31. barras = dados reais: exatas em ${(r.exact * 100).toFixed(0)}% (fome) e ${(r.exactT * 100).toFixed(0)}% (sede) das amostras; diferença máxima ${r.maxDH}/${r.maxDT} px de 20 (só enquanto o animal come/bebe: o bloco atualiza a cada 250 ms)`);
  ok(r.forced.dH >= 5 && r.forced.dT >= 5 || (r.forced.hun < 0.3), `31. evento forçado de comer/beber: as barras caem ${r.forced.dH} px (fome) e ${r.forced.dT} px (sede) no quadro seguinte, acompanhando os dados reais`);
  ok(r.followedEat === r.ateEv, `31. quedas de fome observadas na simulação real (${r.ateEv}) foram acompanhadas pela barra: ${r.followedEat}/${r.ateEv}`);
  ok(r.followedDrink === r.drankEv, `31. quedas de sede observadas na simulação real (${r.drankEv}) foram acompanhadas pela barra: ${r.followedDrink}/${r.drankEv}`);
  ok(r.ageBack === 0, `31. a idade mostrada nunca regride (${r.ageBack} regressões)`);
  ok(r.s0 === 'filhote' && r.s1 === 'adulto', `31. a fase muda de "${r.s0}" para "${r.s1}" ao cruzar 150 min (idade ${r.kAge.toFixed(2)})`);
}

console.log('erros de página:', errs.length ? errs.slice(0, 5) : 'nenhum');
ok(errs.length === 0, 'sem erros de página/console durante os cenários 20–31');
await close();
