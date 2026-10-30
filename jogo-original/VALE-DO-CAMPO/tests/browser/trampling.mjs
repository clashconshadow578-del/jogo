/**
 * Pisoteio e trilhas: planta que regride de fase, mato que freia, fauna que pisoteia, caminho que segue a trilha.
 * Uso: NODE_PATH=$(npm root -g) node tests/browser/trampling.mjs
 */
import { launch, run, ok, failures } from './lib.mjs';

const { p, close, errs } = await launch({ width: 960, height: 540 });

// campo de teste: 12 x 9 tiles de grama limpos (a fazenda de partida é cheia de árvores: o teste os limpa)
const field = await run(p, `(() => {
  // a fazenda de partida é cheia de árvores e raízes: o teste limpa um retângulo (com margem) e o transforma em grama
  const fx = Math.floor(S.px / 16) - 6, fy = Math.floor(S.py / 16) + 4;
  for (let y = -2; y < 12; y++) for (let x = -2; x < 15; x++) { const i = (fy + y) * MW + fx + x; ground[i] = GRASS; obj[i] = 0; delete crops[i]; wl[i] = 0; sapl[i] = 0; seedAge[i] = 0; }
  window.__f = [fx, fy]; return JSON.stringify(window.__f);
})()`);
ok(field !== 'null', 'campo de teste em ' + field);

// 1) regressão de fase por pisoteio forte
const reg = JSON.parse(await run(p, `(() => {
  const [fx, fy] = window.__f, i = fy * MW + fx, r = {};
  mato[i] = 230; plantTrampled(i, 0.25); r.f4 = [mato[i], stageAt(i)];
  mato[i] = 140; plantTrampled(i, 0.25); r.f3 = [mato[i], stageAt(i)];
  mato[i] = 230; plantTrampled(i, 0.15); r.fraco = [mato[i], stageAt(i)];
  return JSON.stringify(r);
})()`));
ok(reg.f4[1] <= 2, 'pisoteio forte derruba a fase 4 para a 2 ou menos (' + reg.f4 + ')');
ok(reg.f3[1] <= 1, 'pisoteio forte derruba a fase 3 para a 1 ou menos (' + reg.f3 + ')');
ok(reg.fraco[1] === 4 && reg.fraco[0] < 230, 'pisoteio fraco só desgasta, sem derrubar de fase (' + reg.fraco + ')');

// 2) mato freia
const drag = JSON.parse(await run(p, `(() => {
  const [fx, fy] = window.__f, i = fy * MW + fx, x = fx * 16 + 8, y = fy * 16 + 8, r = [];
  for (const m of [4, 100, 140, 200]) { mato[i] = m; r.push(plantDrag(x, y)); }
  return JSON.stringify(r);
})()`));
ok(drag[0] === 1 && drag[1] === 1 && drag[2] < 1 && drag[3] < drag[2], 'mato freia por fase: ' + drag);

// 3) fauna pisoteia (cervo anda e o solo desgasta)
const fa = JSON.parse(await run(p, `(() => {
  const [fx, fy] = window.__f;
  for (let y = 0; y < 9; y++) for (let x = 0; x < 12; x++) mato[(fy + y) * MW + fx + x] = 4;
  const a = faSpawn('deer', fx * 16 + 8, (fy + 4) * 16 + 8, false); fauna.push(a); a.inW = false;
  const w0 = grassWear.reduce((s, v) => s + v, 0);
  for (let k = 0; k < 120; k++) { a.state = 'go'; a.gx = (fx + 11) * 16; a.gy = (fy + 4) * 16 + 8; faStep(a, (fx + 11) * 16, (fy + 4) * 16 + 8, 30, 0.1, false); if (Math.abs(a.x - (fx + 11) * 16) < 3) { a.x = fx * 16 + 8; } }
  return JSON.stringify({ d: grassWear.reduce((s, v) => s + v, 0) - w0 });
})()`));
ok(fa.d > 200, 'o cervo pisoteou o chão (desgaste +' + fa.d + ')');

// 4) o caminho segue a trilha e contorna o mato fechado
const path = JSON.parse(await run(p, `(() => {
  const [fx, fy] = window.__f;
  for (let y = 0; y < 9; y++) for (let x = 0; x < 12; x++) { const i = (fy + y) * MW + fx + x; mato[i] = 4; wearT[i] = 0; cmpT[i] = 0; }
  // faixa do meio (y=4) cheia de mato fechado; faixa de cima (y=1) é trilha batida
  for (let x = 0; x < 12; x++) { mato[(fy + 4) * MW + fx + x] = 230; mato[(fy + 3) * MW + fx + x] = 230; mato[(fy + 5) * MW + fx + x] = 230; wearT[(fy + 1) * MW + fx + x] = 0.5; }
  const A = [fx * 16 + 8, (fy + 4) * 16 + 8], B = [(fx + 11) * 16 + 8, (fy + 4) * 16 + 8];
  const pth = findPath(A[0], A[1], B[0], B[1]);
  const ys = pth.map((q) => Math.floor(q[1] / 16) - fy);
  // pelo menos um ponto de passagem fora da faixa de mato fechado (y 3-5)
  return JSON.stringify({ ys, n: pth.length });
})()`));
ok(path.ys.some((y) => y < 3 || y > 5), 'o caminho contorna a faixa de mato fechado: ' + path.ys);

// 5) caminho em terreno liso continua reto (sem mato, sem trilha)
const straight = JSON.parse(await run(p, `(() => {
  const [fx, fy] = window.__f;
  for (let y = 0; y < 9; y++) for (let x = 0; x < 12; x++) { const i = (fy + y) * MW + fx + x; mato[i] = 4; wearT[i] = 0; cmpT[i] = 0; }
  const pth = findPath(fx * 16 + 8, (fy + 4) * 16 + 8, (fx + 11) * 16 + 8, (fy + 4) * 16 + 8);
  return JSON.stringify(pth.length);
})()`));
ok(Number(straight) <= 2, 'terreno liso: caminho reto (' + straight + ' pontos)');

// 6) solo compactado atrapalha o crescimento do mato (o mesmo tile, com e sem compactação, num dia de hidrologia)
const grow = JSON.parse(await run(p, `(() => {
  const [fx, fy] = window.__f, i = (fy + 8) * MW + fx + 6, out = [];
  for (const c of [0, 0.9]) {
    mato[i] = 60; wearT[i] = 0; sm[i] = 0.9; nut[i] = 0.9; elev[i] = 0;
    for (let k = -1; k <= 1; k++) cmpT[i + k] = c;
    hydroDaily();
    out.push(mato[i] - 60);
  }
  return JSON.stringify(out);
})()`));
ok(grow[0] > 0 && grow[1] < grow[0] * 0.5, 'um dia de crescimento: livre +' + grow[0].toFixed(1) + ', compactado +' + grow[1].toFixed(1));

// 7) sombra da helicônia adulta sufoca broto ao lado (só onde a espécie sorteada é helicônia)
const comp = JSON.parse(await run(p, `(() => {
  const [fx, fy] = window.__f; let ok1 = 0, tot = 0;
  for (let k = 0; k < 9; k++) {
    const big = (fy + k) * MW + fx + 2, small = big + 1;
    mato[big] = 230; mato[small] = 50; mato[small + 1] = 50; mato[big - 1] = 4;
    if (speciesAt(big) === 1) { tot++; const b0 = mato[small]; plantDaily(small); if (mato[small] < b0) ok1++; }
  }
  return JSON.stringify([ok1, tot]);
})()`));
ok(comp[1] === 0 || comp[0] === comp[1], 'broto ao lado de helicônia adulta perde mato (' + comp + ' de ' + comp[1] + ' helicônias)');

// 8) regressão do loop infinito do Dijkstra (arredondamento Float32): 300 caminhos aleatórios, com trilhas e mato, nunca podem demorar
const rnd = JSON.parse(await run(p, `(() => {
  const px = Math.floor(S.px / 16), py = Math.floor(S.py / 16); let worst = 0, total = 0;
  for (let k = 0; k < 300; k++) {
    const a = [(px + ((Math.random() * 120) | 0) - 60) * 16 + 8, (py + ((Math.random() * 120) | 0) - 60) * 16 + 8];
    const b = [(px + ((Math.random() * 120) | 0) - 60) * 16 + 8, (py + ((Math.random() * 120) | 0) - 60) * 16 + 8];
    const t = performance.now(); findPath(a[0], a[1], b[0], b[1]); const d = performance.now() - t; worst = Math.max(worst, d); total += d;
  }
  return JSON.stringify({ worst, total });
})()`));
ok(rnd.worst < 80 && rnd.total < 2500, 'findPath nunca prende: pior ' + rnd.worst.toFixed(1) + ' ms, total ' + rnd.total.toFixed(0) + ' ms para 300 caminhos');

await p.waitForTimeout(1000);
ok(errs.length === 0, 'sem erros no console' + (errs.length ? ': ' + errs.join(' | ') : ''));
await close();
process.exitCode = failures() ? 1 : 0;
