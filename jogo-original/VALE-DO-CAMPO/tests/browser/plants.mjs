/**
 * Mato = helicônia e samambaia: espécie escolhida pelo ambiente, 4 fases, ciclo de vida e inspeção.
 * Uso: NODE_PATH=$(npm root -g) node tests/browser/plants.mjs
 */
import { launch, run, ok, failures } from './lib.mjs';

const { p, close, errs } = await launch({ width: 960, height: 540 });

// 1) campo de teste: 10 tiles de grama livres ao lado do jogador, cada um com uma fase
const setup = await run(p, `(() => {
  const tx = Math.floor(S.px / 16), ty = Math.floor(S.py / 16), out = [];
  for (let a = 2; a < 40 && out.length < 10; a++) for (let b = -6; b < 6 && out.length < 10; b++) {
    const i = (ty + a) * MW + tx + b;
    if (ground[i] === GRASS && !obj[i] && !crops[i]) out.push(i);
  }
  window.__t = out; return JSON.stringify(out.length);
})()`);
ok(Number(setup) === 10, 'achou 10 tiles de grama livres');

// 2) cada tile com mato tem espécie estável (HEL ou SAM) e fase coerente com a quantidade de mato
const r = await run(p, `(() => {
  const V = [30, 50, 80, 110, 130, 150, 170, 200, 230, 255], res = [];
  window.__t.forEach((i, k) => { mato[i] = V[k]; const s1 = speciesAt(i); const s2 = speciesAt(i); res.push([V[k], s1, s2, stageAt(i)]); });
  return JSON.stringify(res);
})()`);
for (const [m, s1, s2, st] of JSON.parse(r)) {
  ok(s1 === 1 || s1 === 2, `mato ${m}: tem espécie (${s1})`);
  ok(s1 === s2, `mato ${m}: a espécie não muda entre consultas`);
  ok(st === (m <= 25 ? 0 : m < 64 ? 1 : m < 120 ? 2 : m < 165 ? 3 : 4), `mato ${m}: fase ${st}`);
}

// 3) sem mato não há espécie
const z = await run(p, `(() => { const i = window.__t[0]; mato[i] = 4; return speciesAt(i) + ',' + stageAt(i); })()`);
ok(z === '0,0', 'mato cortado (4) volta a não ter planta');

// 4) helicônia florida perde o caule com o tempo; samambaia perene não
const life = await run(p, `(() => {
  const H = [], F = [];
  for (let n = 0; n < 4000; n++) {
    const i = window.__t[1 + (n % 9)]; mato[i] = 255; const s = speciesAt(i);
    plantDaily(i); (s === 1 ? H : F).push(mato[i] < 255 ? 1 : 0);
  }
  const f = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : -1;
  return JSON.stringify({ hel: f(H), sam: f(F), nh: H.length, ns: F.length });
})()`);
const L = JSON.parse(life);
console.log('ciclo:', life);
if (L.nh) ok(L.hel > 0.05 && L.hel < 0.4, 'helicônia florida: o caule morre em ~16% dos dias');
if (L.ns) ok(L.sam === 0, 'samambaia perene: nada cai ao chegar na fase 4');

// 5) o mato cresce mais rápido para a helicônia que para a samambaia
const rate = await run(p, `(() => { const o = {}; for (const i of window.__t) { mato[i] = 100; const s = speciesAt(i); o[s] = growthRate(i); } return JSON.stringify(o); })()`);
const R = JSON.parse(rate);
if (R[1] && R[2]) ok(R[1] > R[2], 'ritmo: helicônia > samambaia');

// 6) inspeção com as mãos mostra o nome e a descrição
const ins = await run(p, `(() => { const i = window.__t[5]; mato[i] = 140; ground[i] = GRASS; const ok1 = inspectMato(i); return ok1 + '|' + document.body.innerText.slice(0, 0); })()`);
ok(ins.startsWith('true'), 'inspectMato devolve true onde há mato');
// o aviso de boas-vindas da floresta pode cobrir o primeiro: repete a inspeção até o texto da planta aparecer
let toastTxt = '';
for (let k = 0; k < 8 && !toastTxt; k++) {
  await run(p, `inspectMato(window.__t[5])`);
  await p.waitForTimeout(250);
  toastTxt = await p.evaluate(() => [...document.querySelectorAll('*')].map((e) => e.children.length === 0 ? e.textContent : '').filter((t) => /Helicônia|Samambaia/.test(t)).join(' || '));
}
ok(/(Helicônia|Samambaia)/.test(toastTxt), 'o aviso mostra a planta: ' + toastTxt.slice(0, 80));

// 6b) o nível de água do tile não faz a planta sumir (antes `wl < 0.03` a fazia piscar na borda de poças e rios)
const vis = JSON.parse(await run(p, `(() => {
  const i = window.__t[2], tx = i % MW, ty = (i / MW) | 0; const r = [];
  mato[i] = 150; wearT[i] = 0; obj[i] = 0; ground[i] = GRASS;
  for (const w of [0, 0.05, 0.3, 0.9, 0.01]) { wl[i] = w; r.push(hydroMatoList(tx - 1, tx + 1, ty - 1, ty + 1).some((o) => o.i === i)); }
  wl[i] = 0; return JSON.stringify(r);
})()`));
ok(vis.every(Boolean), 'planta continua na lista de desenho com qualquer nível de água: ' + vis);
const pd = await run(p, `(() => pdNear(window.__t[2], window.__t[2] % MW, (window.__t[2] / MW) | 0))()`);
ok(pd === false, 'poças deixaram de ser desenhadas (pdNear = false)');

// 7) a hidrologia roda sem erro com as espécies (vários passos e dias)
await run(p, `(() => { for (let k = 0; k < 20; k++) hydroDaily(); return 1; })()`);
await p.waitForTimeout(1500);
ok(errs.length === 0, 'sem erros no console' + (errs.length ? ': ' + errs.join(' | ') : ''));

await close();
process.exitCode = failures() ? 1 : 0;
