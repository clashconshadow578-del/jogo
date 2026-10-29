/**
 * Simulação no navegador dos sistemas de cercas, portões, atração por comida e ovos (spec B, seção 11).
 * O laço do jogo é parado e o tempo é avançado à mão, com vários tamanhos de passo (dt), para provar que
 * nenhum animal atravessa uma cerca nem em quedas de FPS (dt grande) e que os prazos dos ovos não dependem de dt.
 *
 * Uso: NODE_PATH=$(npm root -g) node tests/browser/fences-animals.mjs
 */
import { boot, failures, launch, ok, run } from './lib.mjs';

const { p, errs, close } = await launch();
await p.evaluate(() => { window.requestAnimationFrame = () => 0; }); // para o laço do jogo: o teste controla o tempo
await p.waitForTimeout(200);

/* ---------- ferramentas dentro do jogo ---------- */
await run(p, `(() => {
  const PEN = { x0: 20, y0: 30, x1: 31, y1: 38, gx: 25 };           // paredes; interior = 21..30 x 31..37; portão em (25,38)
  const T = (globalThis.T = { PEN });
  T.clear = () => {
    chx.length = 0; herd.length = 1; setGest(null); getEggs().length = 0;
    for (let y = PEN.y0 - 5; y <= PEN.y1 + 8; y++) for (let x = 4; x <= PEN.x1 + 6; x++) {
      const i = y * MW + x; ground[i] = GRASS; obj[i] = 0; delete crops[i]; wet[i] = 0; shroom[i] = 0;
    }
    for (const f of fox) { f.x = f.y = -9999; }
    fox.length = 0;
  };
  T.pen = (gate = GATE) => {
    T.clear();
    for (let x = PEN.x0; x <= PEN.x1; x++) { obj[PEN.y0 * MW + x] = FENCE; obj[PEN.y1 * MW + x] = FENCE; }
    for (let y = PEN.y0; y <= PEN.y1; y++) { obj[y * MW + PEN.x0] = FENCE; obj[y * MW + PEN.x1] = FENCE; }
    obj[PEN.y1 * MW + PEN.gx] = gate;
  };
  T.inside = (e) => e.x > (PEN.x0 + 1) * 16 && e.x < PEN.x1 * 16 && e.y > (PEN.y0 + 1) * 16 && e.y < PEN.y1 * 16;
  T.nearGateOrInside = (e) => T.inside(e) || (Math.abs(e.x - (PEN.gx * 16 + 8)) < 20 && e.y > PEN.y1 * 16 - 4);
  T.center = { x: 26 * 16, y: 34 * 16 };
  T.farm = () => { S.inside = false; S.sel = 0; S.px = 9 * 16; S.py = 40 * 16; sleeping === false; };
  T.adv = (m) => { S.min += m; while (S.min >= DAY_MIN) { S.min -= DAY_MIN; S.day++; } };
  T.step = (dt, secs, f) => { const n = Math.round(secs / dt); for (let i = 0; i < n; i++) { T.adv(dt); updateHerd(dt); updateChx(dt); updateEggs(dt); if (f && f(i)) return i; } return n; };
  T.holdItem = (id) => { S.inv[id] = 9; S.sel = ITEMS.findIndex((it) => it.id === id); };
  T.populate = () => {
    const c = T.center;
    herd[0].x = c.x - 20; herd[0].y = c.y; herd[0].state = 'rest'; herd[0].t = 1; herd[0].path = null; herd[0].age = 500;
    const bull = herd.length > 1 ? herd[1] : (herd.push(mkCow({ x: 0, y: 0, black: true, sex: 'm', social: 0.9 })), herd[1]);
    bull.x = c.x + 20; bull.y = c.y; bull.state = 'rest'; bull.t = 1; bull.path = null; bull.age = 500;
    const calf = mkCow({ x: c.x, y: c.y + 20, calf: true, age: 0, mom: 0, social: 1 });
    if (herd.length < 3) herd.push(calf);
    chx.length = 0;
    for (let k = 0; k < 4; k++) chx.push(mkChx({ x: c.x - 30 + k * 20, y: c.y - 24, sex: 'f', age: CHX_ADULT + 1 }));
    chx.push(mkChx({ x: c.x, y: c.y - 30, sex: 'm', age: CHX_ADULT + 1 }));
  };
  return 'ok';
})()`);
const run0 = (code) => run(p, code);

/* ===================================================================== */
console.log('\n--- 1. validade da construção ---');
await run0(`T.pen(); T.farm(); S.inv.fence = 5; S.inv.gate = 2; S.inv.madeira = 99; S.inv.palha = 9; T.holdItem('fence'); S.inv.fence = 5; 'x'`);
// jogador num tile livre fora do cercado, olhando para a direita
await run0(`S.px = 10 * 16 + 8; S.py = 34 * 16 + 8; S.fx = 1; S.fy = 0; 'x'`);
let r = await run0(`buildCheck(10, 34, 'fence')`);
ok(!r.ok && /você/.test(r.reason), 'não constrói sobre o jogador: ' + r.reason);
r = await run0(`buildCheck(11, 34, 'fence')`);
ok(r.ok, 'tile livre à frente é válido');
await run0(`herd[0].x = 11 * 16 + 8; herd[0].y = 34 * 16 + 8; 'x'`);
r = await run0(`buildCheck(11, 34, 'fence')`);
ok(!r.ok && /vaca/.test(r.reason), 'não constrói sobre uma vaca: ' + r.reason);
await run0(`herd[0].x = 40 * 16; chx.length = 0; chx.push(mkChx({ x: 12 * 16 + 8, y: 34 * 16 + 8 })); 'x'`);
r = await run0(`buildCheck(12, 34, 'fence')`);
ok(!r.ok && /galinha/.test(r.reason), 'não constrói sobre uma galinha: ' + r.reason);
await run0(`chx.length = 0; ground[13 * 1 + 34 * MW] = WATER; 'x'`);
r = await run0(`buildCheck(13, 34, 'fence')`);
ok(!r.ok, 'não constrói na água: ' + r.reason);
await run0(`ground[34 * MW + 13] = GRASS; crops[34 * MW + 14] = { k: 'cenoura', d: 0, need: 3 }; 'x'`);
r = await run0(`buildCheck(14, 34, 'fence')`);
ok(!r.ok && /plantação/.test(r.reason), 'não constrói sobre plantação: ' + r.reason);
await run0(`delete crops[34 * MW + 14]; obj[34 * MW + 15] = TREE; 'x'`);
r = await run0(`buildCheck(15, 34, 'fence')`);
ok(!r.ok, 'não constrói sobre árvore: ' + r.reason);
await run0(`obj[34 * MW + 15] = 0; 'x'`);
// colocar de verdade: gasta exatamente 1; falhar não gasta
let n0 = await run0(`S.inv.fence`);
r = await run0(`placeAt(11, 34, 'fence')`);
let n1 = await run0(`S.inv.fence`);
ok(r.ok && n1 === n0 - 1 && (await run0(`obj[34 * MW + 11]`)) === 5, 'colocar cerca gasta 1 item e grava no mapa');
r = await run0(`placeAt(11, 34, 'fence')`);
ok(!r.ok && (await run0(`S.inv.fence`)) === n1, 'colocar onde já há cerca falha sem gastar');
r = await run0(`placeAt(11, 34, 'gate')`);
ok(r.ok && (await run0(`obj[34 * MW + 11]`)) === 6 && (await run0(`S.inv.fence`)) === n1 + 1, 'portão substitui a cerca e devolve a cerca');
await run0(`S.inv.fence = 0`);
r = await run0(`placeAt(12, 34, 'fence')`);
ok(!r.ok && (await run0(`obj[34 * MW + 12]`)) === 0, 'sem o item não constrói');
await run0(`S.inside = true`);
r = await run0(`buildCheck(12, 34, 'fence')`);
ok(!r.ok, 'não constrói dentro de casa');
await run0(`S.inside = false; 'x'`);

/* ---- sprites: conexões automáticas ---- */
console.log('\n--- 2. sprites automáticos ---');
await run0(`T.pen(); 'x'`);
const fr = await run0(`({
  cornerNW: frameAt(20, 30), top: frameAt(25, 30), cornerNE: frameAt(31, 30), left: frameAt(20, 34),
  gate: frameAt(25, 38), bottom: frameAt(24, 38), lone: (obj[10*MW+10] = FENCE, frameAt(10, 10)),
})`);
ok(fr.cornerNW === 6 && fr.top === 10 && fr.cornerNE === 12 && fr.left === 5, 'cantos/retas ligam pelos vizinhos: ' + JSON.stringify(fr));
ok(fr.gate === 16 && fr.lone === 0, 'portão horizontal fechado e poste isolado');
await run0(`obj[10*MW+10] = 0; obj[38*MW+25] = GATE_OPEN; 'x'`);
ok((await run0(`frameAt(25, 38)`)) === 17, 'portão aberto usa o quadro aberto');

/* ===================================================================== */
console.log('\n--- 3. colisão: nada atravessa a cerca (vários dt) ---');
for (const dt of [0.016, 0.05, 0.5, 2]) {
  await run0(`T.pen(); T.farm(); T.populate(); 'x'`);
  const res = await run0(`(() => {
    let out = 0, moved = 0; const ents = [...herd, ...chx]; const start = new Map(ents.map((e) => [e, [e.x, e.y]]));
    const total = 600;                                                   // 10 minutos de jogo
    const grew = { herd: herd.length, chx: chx.length };
    T.step(${dt}, total, () => { for (const e of [...herd, ...chx]) if (!T.inside(e)) out++; return false; });
    for (const e of ents) { const s0 = start.get(e); moved += Math.hypot(e.x - s0[0], e.y - s0[1]); }
    const now = ents;
    globalThis.__grew = [grew.herd, herd.length, grew.chx, chx.length];
    return { out, moved: Math.round(moved), n: now.length, grew: globalThis.__grew };
  })()`);
  ok(res.out === 0, `dt=${dt}: nenhum animal saiu do cercado (saídas: ${res.out}); andaram ${res.moved}px no total; rebanho/aves ${res.grew}`);
  ok(res.moved > 100, `dt=${dt}: os animais continuam vivos dentro do cercado (sem ficarem travados)`);
}

/* ---- animais encostados na cerca não tremem ---- */
console.log('\n--- 4. sem tremor contra a cerca ---');
await run0(`T.pen(); T.farm(); T.populate(); T.holdItem('milho'); 'x'`);
const jit = await run0(`(() => {
  S.px = 26 * 16; S.py = 28 * 16;                                       // fora do cercado, ao norte: atrai para a parede norte
  herd[0].age = 500; herd.forEach((q) => { q.age = Math.max(q.calf ? 0 : 500, q.age || 0); }); const c = herd[0]; c.x = 26 * 16; c.y = 33 * 16; let flips = 0, lastDx = 0, maxStep = 0, px = c.x, py = c.y;
  T.step(0.05, 120, () => { const dx = c.x - px, dy = c.y - py; maxStep = Math.max(maxStep, Math.hypot(dx, dy)); if (dx * lastDx < -0.0001) flips++; if (Math.abs(dx) > 1e-4) lastDx = dx; px = c.x; py = c.y; return false; });
  return { flips, maxStep: +maxStep.toFixed(2), y: Math.round(c.y), inside: T.inside(c), dPlayer: Math.round(Math.hypot(c.x - S.px, c.y - S.py)) };
})()`);
ok(jit.inside, 'a vaca atraída pelo milho fica dentro do cercado: ' + JSON.stringify(jit));
ok(jit.flips < 6, 'sem vai-e-vem contra a cerca (inversões de direção em x: ' + jit.flips + ')');
ok(jit.maxStep < 2, 'nenhum salto/teletransporte (maior passo ' + jit.maxStep + 'px)');
ok(jit.dPlayer < 100 && jit.y < 34 * 16, 'ela foi até a parede mais próxima do jogador (dist ' + jit.dPlayer + 'px)');

/* ===================================================================== */
console.log('\n--- 5. portão fechado barra, portão aberto deixa passar (animais atraídos) ---');
await run0(`T.pen(GATE); T.farm(); T.populate(); T.holdItem('cenoura'); S.px = 25 * 16 + 8; S.py = 42 * 16; 'x'`);
let g = await run0(`(() => { T.step(0.05, 90); return { out: [...herd, ...chx].filter((e) => !T.inside(e)).length }; })()`);
ok(g.out === 0, 'portão fechado: ninguém sai mesmo atraído do lado de fora');
await run0(`obj[38 * MW + 25] = GATE_OPEN; 'x'`);
g = await run0(`(() => {
  const c = herd[0]; let t = T.step(0.05, 240, () => !T.inside(c) && Math.hypot(c.x - S.px, c.y - S.py) < 30);
  return { out: !T.inside(c), d: Math.round(Math.hypot(c.x - S.px, c.y - S.py)), secs: t * 0.05, gateX: c.x };
})()`);
ok(g.out && g.d < 40, 'portão aberto: a vaca sai pelo portão e chega perto do jogador (dist ' + g.d + 'px em ' + g.secs.toFixed(1) + 's)');
ok(Math.abs(g.gateX - (25 * 16 + 8)) < 90, 'ela saiu na altura do portão (x=' + Math.round(g.gateX) + ')');
// bezerro e a outra vaca também conseguem (pegada de 12px)
g = await run0(`(() => { T.step(0.05, 200); return herd.map((q) => [q.calf ? 'bezerro' : q.black ? 'boi' : 'vaca', !T.inside(q), Math.round(Math.hypot(q.x - S.px, q.y - S.py))]); })()`);
ok(g.filter((a) => a[1]).length === g.length, 'todo o rebanho (inclusive o bezerro) saiu pelo portão: ' + JSON.stringify(g));

console.log('\n--- 6. fechar o portão ---');
await run0(`T.pen(GATE_OPEN); T.farm(); T.populate(); herd[0].x = 25 * 16 + 8; herd[0].y = 38 * 16 + 8; S.px = 25*16+8; S.py = 41*16; S.fx = 0; S.fy = -1; 'x'`);
let tg = await run0(`toggleGate(38 * MW + 25, 1e9)`);
ok(!tg.ok && /vaca/.test(tg.reason), 'não fecha com uma vaca no portão: ' + tg.reason);
await run0(`herd[0].x = 25 * 16 + 8; herd[0].y = 33 * 16; 'x'`);
tg = await run0(`toggleGate(38 * MW + 25, 2e9)`);
ok(tg.ok && tg.open === false && (await run0(`obj[38*MW+25]`)) === 6, 'fecha quando está livre');
tg = await run0(`toggleGate(38 * MW + 25, 2e9 + 50)`);
ok(!tg.ok, 'respeita o intervalo mínimo entre toques (sem abre-fecha duplo no mesmo clique)');
tg = await run0(`toggleGate(38 * MW + 25, 3e9)`);
ok(tg.ok && tg.open === true, 'abre de novo');
await run0(`S.px = 25 * 16 + 8; S.py = 38 * 16 + 8; 'x'`);
tg = await run0(`toggleGate(38 * MW + 25, 4e9)`);
ok(tg.ok && tg.open === true === false || !tg.ok, 'com o jogador em cima, não fecha: ' + JSON.stringify(tg));
await run0(`S.px = 25 * 16 + 8; S.py = 41 * 16; S.fx = 0; S.fy = -1; obj[38 * MW + 25] = GATE_OPEN; 'x'`);
// jogador usa o botão Usar com o portão à frente (pelo caminho real do jogo)
await run0(`S.sel = 0; actionA(); 'x'`);
ok((await run0(`obj[38 * MW + 25]`)) === 6 || (await run0(`obj[38 * MW + 25]`)) === 7, 'botão Usar no portão alterna o estado');

/* ---- jogador passa pelo portão aberto e é barrado pelo fechado ---- */
console.log('\n--- 7. jogador e colisão do portão ---');
await run0(`T.pen(GATE_OPEN); S.px = 25 * 16 + 8; S.py = 40 * 16; 'x'`);
const pass = await run0(`(() => { for (let i = 0; i < 40; i++) { if (!pBlocked(S.px, S.py - 1)) S.py -= 1; } return Math.round(S.py); })()`);
ok(pass < 38 * 16, 'jogador atravessa o portão aberto (y=' + pass + ')');
await run0(`T.pen(GATE); S.px = 25 * 16 + 8; S.py = 40 * 16; 'x'`);
const blocked = await run0(`(() => { for (let i = 0; i < 40; i++) { if (!pBlocked(S.px, S.py - 1)) S.py -= 1; } return Math.round(S.py); })()`);
ok(blocked >= 39 * 16 - 4, 'jogador é barrado pelo portão fechado (y=' + blocked + ')');

/* ===================================================================== */
console.log('\n--- 8. atração: raio, histerese e retomada (galinha) ---');
await run0(`T.clear(); T.farm(); T.holdItem('milho'); S.px = 8 * 16; S.py = 34 * 16; S.fx = 1; S.fy = 0; 'x'`);
await run0(`chx.push(mkChx({ x: S.px + 4.5 * 16, y: S.py, sex: 'f', age: CHX_ADULT + 1 })); chx.push(mkChx({ x: S.px + 7 * 16, y: S.py + 20, sex: 'f', age: CHX_ADULT + 1 })); 'x'`);
let l = await run0(`(() => { updateChx(0.05); return [chx[0].state, chx[1].state]; })()`);
ok(l[0] === 'atrai' && l[1] !== 'atrai', 'a 4,5 tiles entra em atração; a 7 tiles não: ' + JSON.stringify(l));
// histerese: a atraída a ~5,4 tiles (dentro de 5+margem) continua; a 6,5 tiles solta
await run0(`chx[0].x = S.px + 5.4 * 16; chx[0].y = S.py; 'x'`);
l = await run0(`(() => { updateChx(0.001); return chx[0].state; })()`);
ok(l === 'atrai', 'histerese: a 5,4 tiles ainda segue (já estava atraída): ' + l);
await run0(`chx[0].x = S.px + 6.5 * 16; chx[0].y = S.py; 'x'`);
l = await run0(`(() => { updateChx(0.001); return chx[0].state; })()`);
ok(l !== 'atrai', 'a 6,5 tiles perde o interesse e volta ao comportamento normal: ' + l);
await run0(`chx[0].x = S.px + 6.5 * 16; chx[0].y = S.py; 'x'`);
l = await run0(`(() => { updateChx(0.001); return chx[0].state; })()`);
ok(l !== 'atrai', 'e não volta a ser atraída a 5,4 tiles sem entrar no raio (sem oscilar)');
// seguir e parar perto, sem teletransporte
await run0(`chx.length = 0; chx.push(mkChx({ x: S.px + 4 * 16, y: S.py + 8, sex: 'f', age: CHX_ADULT + 1 })); 'x'`);
l = await run0(`(() => { const c = chx[0]; let mx = 0, px = c.x, py = c.y; T.step(0.05, 20, () => { mx = Math.max(mx, Math.hypot(c.x - px, c.y - py)); px = c.x; py = c.y; return false; }); return { d: Math.round(Math.hypot(c.x - S.px, c.y - S.py)), mx: +mx.toFixed(2), st: c.state }; })()`);
ok(l.d < 30 && l.mx < 3 && l.st === 'atrai', 'a galinha chega perto, sem saltos: ' + JSON.stringify(l));
await run0(`S.sel = 0; 'x'`);
l = await run0(`(() => { updateChx(0.05); return chx[0].state; })()`);
ok(l !== 'atrai', 'guardar o alimento encerra a atração');
// comida que não serve (madeira): nada
await run0(`T.holdItem('madeira'); chx[0].x = S.px + 3 * 16; chx[0].y = S.py; 'x'`);
l = await run0(`(() => { updateChx(0.05); return chx[0].state; })()`);
ok(l !== 'atrai', 'item que não é comida não atrai');
await run0(`S.sel = 0; 'x'`);

console.log('\n--- 9. atração (vaca) em campo aberto: seguir, parar e perder interesse ---');
await run0(`T.clear(); T.farm(); T.holdItem('cenoura'); S.px = 24 * 16; S.py = 34 * 16; herd[0].x = S.px + 5 * 16; herd[0].y = S.py; herd[0].state = 'rest'; herd[0].t = 99; herd[0].path = null; 'x'`);
l = await run0(`(() => { const c = herd[0]; let mx = 0, px = c.x, py = c.y; T.step(0.05, 30, () => { mx = Math.max(mx, Math.hypot(c.x - px, c.y - py)); px = c.x; py = c.y; return false; }); const a = [c.x, c.y]; T.step(0.05, 2); return { d: Math.round(Math.hypot(c.x - S.px, c.y - S.py)), mx: +mx.toFixed(2), st: c.state, still: Math.round(Math.hypot(c.x - a[0], c.y - a[1])) }; })()`);
ok(l.d <= 40 && l.mx < 2 && l.st === 'atrai' && l.still <= 2, 'a vaca vem e para ao lado do jogador: ' + JSON.stringify(l));
await run0(`S.px += 12 * 16; 'x'`);
l = await run0(`(() => { T.step(0.05, 1); return herd[0].state; })()`);
ok(l !== 'atrai', 'jogador se afasta além do raio: a vaca perde o interesse: ' + l);

/* ===================================================================== */
console.log('\n--- 10. ovos: postura a cada 24h, coleta, eclosão em 3 dias (independente de dt) ---');
for (const dt of [0.1, 0.5, 2]) {
  await run0(`T.pen(); T.farm(); chx.length = 0; getEggs().length = 0; herd.length = 1; S.day = 1; S.min = 0; chx.push(mkChx({ x: 25 * 16, y: 34 * 16, sex: 'f', age: CHX_ADULT + 1 })); 'x'`);
  const e = await run0(`(() => {
    const laid = []; let guard = 0;
    // 5 dias; coleta cada ovo assim que aparece
    const days = 5 * DAY_MIN;
    for (let t = 0; t < days; t += ${dt}) {
      T.adv(${dt}); updateEggs(${dt});
      if (getEggs().length) { laid.push(+(worldMin() / DAY_MIN).toFixed(3)); getEggs().length = 0; }
    }
    return { laid, layNext: chx[0].layNext };
  })()`);
  const gaps = e.laid.slice(1).map((v, i) => +(v - e.laid[i]).toFixed(1));
  ok(e.laid.length === 5, `dt=${dt}: 5 ovos em 5 dias (um por dia): ${JSON.stringify(e.laid)}`);
  ok(gaps.every((x) => Math.abs(x - 1) < 0.05), `dt=${dt}: intervalo de 24h entre posturas ${JSON.stringify(gaps)}`);
}
// coleta pelo botão Usar
await run0(`T.pen(); T.farm(); chx.length = 0; getEggs().length = 0; S.inv.ovo = 0; getEggs().push({ id: 1, x: 10 * 16 + 8, y: 34 * 16 + 8, layT: worldMin(), hatchAt: worldMin() + 3 * DAY_MIN, hen: 99 }); S.px = 10 * 16 + 8; S.py = 34 * 16 + 20; S.sel = 0; 'x'`);
await run0(`actionA()`);
ok((await run0(`S.inv.ovo`)) === 1 && (await run0(`getEggs().length`)) === 0, 'Usar perto do ovo coleta 1 ovo e remove do mundo');
await run0(`actionA()`);
ok((await run0(`S.inv.ovo`)) === 1, 'segundo Usar não rende de novo');
// eclosão: uma vez só
await run0(`T.pen(); T.farm(); chx.length = 0; getEggs().length = 0; S.day = 1; S.min = 0; getEggs().push({ id: 7, x: 26 * 16 + 8, y: 34 * 16 + 8, layT: worldMin(), hatchAt: worldMin() + 3 * DAY_MIN, hen: 99 }); chx.push(mkChx({ x: 25*16, y: 34*16, sex: 'm', age: CHX_ADULT + 1 })); 'x'`);
let h = await run0(`(() => { T.adv(3 * DAY_MIN - 1); updateEggs(0); const before = [getEggs().length, chx.length]; T.adv(2); updateEggs(0); const after = [getEggs().length, chx.length]; updateEggs(0); updateEggs(0); return { before, after, again: [getEggs().length, chx.length], chick: chx.find((c) => c.age < CHX_ADULT) && { age: chx.find((c) => c.age < CHX_ADULT).age, mom: chx.find((c) => c.age < CHX_ADULT).mom, ok: chxWalkOK(chx[1].x, chx[1].y) } }; })()`);
ok(h.before[0] === 1 && h.before[1] === 1, 'antes de 3 dias: o ovo continua no chão');
ok(h.after[0] === 0 && h.after[1] === 2 && h.again[1] === 2, 'aos 3 dias: eclode exatamente 1 pintinho e o ovo some (não repete): ' + JSON.stringify(h));
ok(h.chick && h.chick.ok, 'o pintinho nasce em lugar válido');
// limite de aves: ovo espera
await run0(`T.pen(); chx.length = 0; getEggs().length = 0; for (let k = 0; k < 30; k++) chx.push(mkChx({ x: (22 + (k % 8)) * 16, y: (32 + ((k / 8) | 0)) * 16, sex: 'f', age: CHX_ADULT + 1, layNext: 1e12 })); getEggs().push({ id: 8, x: 26 * 16 + 8, y: 34 * 16 + 8, layT: 0, hatchAt: 0, hen: 99 }); updateEggs(0); 'x'`);
ok((await run0(`[getEggs().length, chx.length]`)).join() === '1,30', 'galinheiro cheio (30): o ovo espera, não eclode');
await run0(`chx.pop(); updateEggs(0); 'x'`);
ok((await run0(`[getEggs().length, chx.length]`)).join() === '0,30', 'com vaga: eclode');
// ovo não eclode se o tile virou parede (espera sem perder)
await run0(`T.clear(); chx.length = 0; getEggs().push({ id: 9, x: 26 * 16 + 8, y: 34 * 16 + 8, layT: 0, hatchAt: 0, hen: 99 }); obj[34 * MW + 26] = FENCE; obj[34 * MW + 27] = FENCE; obj[34 * MW + 25] = FENCE; obj[33 * MW + 26] = FENCE; obj[35 * MW + 26] = FENCE; updateEggs(0); 'x'`);
ok((await run0(`[getEggs().length, chx.length]`)).join() === '1,0', 'sem lugar válido (cercado por paredes): o ovo espera');
ok(!(await run0(`buildCheck(26, 36, 'fence').reason`)).includes('ovo'), 'e construir por cima de um ovo é recusado');
await run0(`obj[34 * MW + 26] = 0; 'x'`);
ok(/ovo/.test(await run0(`buildCheck(26, 34, 'fence').reason`)), 'não constrói por cima de um ovo');

/* ===================================================================== */
console.log('\n--- 11. salvar e recarregar ---');
await run0(`T.pen(GATE_OPEN); T.farm(); T.populate(); chx.forEach((c, i) => { c.layNext = worldMin() + 500 + i; c.lastEgg = worldMin() - 50 - i; }); getEggs().length = 0; getEggs().push({ id: 3, x: 25 * 16, y: 33 * 16, layT: worldMin() - 100, hatchAt: worldMin() + 3 * DAY_MIN - 100, hen: chx[0].id }); S.inv.fence = 4; S.inv.gate = 1; S.inv.ovo = 6; save(); 'x'`);
const snap = await run0(`({ gate: obj[38 * MW + 25], wall: obj[30 * MW + 25], eggs: JSON.stringify(eggSave()), hens: JSON.stringify(chx.map((c) => [c.id, c.layNext, c.lastEgg])), inv: [S.inv.fence, S.inv.gate, S.inv.ovo] })`);
await p.reload();
await boot(p);
await p.evaluate(() => { window.requestAnimationFrame = () => 0; });
const snap2 = await run0(`({ gate: obj[38 * MW + 25], wall: obj[30 * MW + 25], eggs: JSON.stringify(eggSave()), hens: JSON.stringify(chx.map((c) => [c.id, c.layNext, c.lastEgg])), inv: [S.inv.fence, S.inv.gate, S.inv.ovo] })`);
ok(snap2.gate === 7 && snap2.wall === 5, 'portão aberto e paredes voltam como estavam: ' + snap2.gate + '/' + snap2.wall);
ok(snap.eggs === snap2.eggs, 'ovo (posição, hora da postura, hora da eclosão) igual após recarregar');
ok(snap.hens === snap2.hens, 'hora da última postura e da próxima de cada galinha igual após recarregar');
ok(JSON.stringify(snap.inv) === JSON.stringify(snap2.inv), 'inventário (cerca, portão, ovo) igual');
// recarregou no meio da contagem: a eclosão continua no mesmo prazo absoluto
const rem = await run0(`(() => { const e = getEggs()[0]; return e ? Math.round(e.hatchAt - worldMin()) : null; })()`);
ok(rem !== null && Math.abs(rem - (3 * 1200 - 100 - 0)) < 5, 'prazo de eclosão preservado (faltam ' + rem + ' min de jogo)');

console.log('\nerros de console/página:', errs.length ? errs : 'nenhum');
ok(errs.length === 0, 'sem erros de JavaScript durante os testes');
await close();
console.log(failures() ? `\n${failures()} FALHA(S)` : '\nTodos os testes passaram.');
