/**
 * Ecossistema vivo — comportamentos de espécie que dependem do bando/da fazenda: galinha (vigilância, chamado de alarme,
 * fuga), galo-lira (exibição e resposta a ameaças) e lebre (abrigo na fuga). Chromium (Playwright), laço parado, tempo à mão.
 *
 * Uso: NODE_PATH=$(npm root -g) node tests/browser/ecosystem-d.mjs
 */
import { launch, ok, run } from './lib.mjs';
import { installTools } from './eco-lib.mjs';

const { p, errs, close } = await launch({ width: 960, height: 540 });
await installTools(p);
const J = async (code) => JSON.parse(await run(p, `JSON.stringify((() => {${code}})())`));

const PRE = `
  const field = (seed) => { T.seed(seed); T.reset(); const tx = (T.home.x / TS) | 0, ty = ((T.home.y / TS) | 0) - 4; T.field(tx, ty, 16); chx.length = 0; fox.length = 0; T.player(T.C.x, T.C.y + 600); return T.C; };
  const hen = (x, y, o = {}) => { const h = mkChx(Object.assign({ x, y, sex: 'f', age: CHX_ADULT + 10 }, o)); h.state = 'ciscar'; h.t = 99; h.broody = false; chx.push(h); return h; };
  const mkFox = (x, y) => { const f = { x, y, st: 'caça', target: null, wander: null, prey: null, dir: 1, t: 0, fr: 0 }; fox.push(f); return f; };
  const stepChx = (secs, f) => { const n = Math.round(secs / 0.05); for (let i = 0; i < n; i++) { S.min += 0.05; T.Pc.ecoTick(0.05, nightF(6 + S.min / 60)); updateChx(0.05); if (f && f(i)) return i * 0.05; } return secs; };
`;

/* ---------- galinha: percebe a raposa por visão (alcance, linha de visão, hora) ---------- */
{
  const r = await J(`${PRE}
    const out = {};
    const trial = (d, setup, n = 30, state = 'ciscar', minute = 360) => {
      let fled = 0;
      for (let k = 0; k < n; k++) {
        const c = field(100 + k); S.min = minute; T.player(c.x, c.y + 600);
        const h = hen(c.x, c.y); h.state = state; h.t = 99; h.dir = -1; // olhando para o lado da raposa (oeste)
        const f = mkFox(c.x - d, c.y + ((k % 5) - 2) * 3); setup && setup(c, f);
        let t = 0; stepChx(1.2, () => { f.x += 0; return h.state === 'fugir'; }); if (h.state === 'fugir') fled++;
      }
      return fled / n;
    };
    for (const d of [30, 70, 100, 130, 170]) out['dia ' + d] = trial(d);
    out.noite80 = trial(80, null, 30, 'ciscar', 1100);
    out.dia80 = trial(80);
    out.vigia100 = trial(100, null, 30, 'vigia');
    out.ciscar100 = trial(100);
    out.pedra90 = trial(80, (c, f) => { obj[Math.floor(c.y / TS) * MW + Math.floor((c.x - 45) / TS)] = ROCK; });
    out.pedra40 = trial(40, (c, f) => { obj[Math.floor(c.y / TS) * MW + Math.floor((c.x - 20) / TS)] = ROCK; });
    out.cerca90 = trial(80, (c, f) => { obj[Math.floor(c.y / TS) * MW + Math.floor((c.x - 45) / TS)] = FENCE; });
    out.semRaposa = (() => { let fled = 0; for (let k = 0; k < 20; k++) { const c = field(300 + k); const h = hen(c.x, c.y); stepChx(3); if (h.state === 'fugir') fled++; } return fled / 20; })();
    return out;`);
  console.log('  [galinha-visão]', JSON.stringify(r));
  ok(r['dia 30'] === 1 && r['dia 70'] >= 0.85 && r.dia80 >= 0.7, `galinha: raposa a 30/70/80 px, de dia, olhando para ela: foge em ${Math.round(r['dia 30'] * 100)}%/${Math.round(r['dia 70'] * 100)}%/${Math.round(r.dia80 * 100)}% (antes só fugia a < 50 px)`);
  ok(r['dia 170'] <= 0.1 && r['dia 130'] <= 0.5, `galinha: não "adivinha" a raposa de longe: a 130/170 px foge em ${Math.round(r['dia 130'] * 100)}%/${Math.round(r['dia 170'] * 100)}%`);
  ok(r.noite80 < r.dia80, `galinha: à noite enxerga menos (80 px: ${Math.round(r.noite80 * 100)}% contra ${Math.round(r.dia80 * 100)}% de dia)`);
  ok(r.vigia100 > r.ciscar100, `galinha: de cabeça erguida (vigia) percebe mais que ciscando (100 px: ${Math.round(r.vigia100 * 100)}% contra ${Math.round(r.ciscar100 * 100)}%)`);
  ok(r.pedra90 <= 0.1 && r.pedra40 === 1, `galinha: pedra entre ela e a raposa esconde (80 px: ${Math.round(r.pedra90 * 100)}%), mas perto demais (40 px) sempre assusta (${Math.round(r.pedra40 * 100)}%)`);
  ok(r.cerca90 >= r.dia80 - 0.15, `galinha: cerca não tapa a visão (80 px atrás da cerca: ${Math.round(r.cerca90 * 100)}% contra ${Math.round(r.dia80 * 100)}% sem cerca)`);
  ok(r.semRaposa === 0, `galinha: sem raposa não há alarme falso (${Math.round(r.semRaposa * 100)}%)`);
}

/* ---------- galinha: chamado de alarme se espalha só pelo alcance da voz ---------- */
{
  const r = await J(`${PRE}
    const out = { n: 30, A: 0, B: 0, C: 0, Bctl: 0, alarmT: 0, cdOk: 0 };
    const trial = (herdAlarm) => {
      const save = T.Eco.ECO.chicken.herdAlarm; T.Eco.ECO.chicken.herdAlarm = herdAlarm; const res = { A: 0, B: 0, C: 0, alarm: 0, cd: 0 };
      for (let k = 0; k < out.n; k++) {
        const c = field(500 + k); S.min = 360;
        const A = hen(c.x, c.y), B = hen(c.x + 50, c.y + 6), C = hen(c.x + 260, c.y); for (const h of [A, B, C]) { h.dir = -1; }
        mkFox(c.x - 80, c.y);
        const ever = { A: 0, B: 0, C: 0 }; let alarm = 0, cd = 0;
        stepChx(2, () => { if (A.state === 'fugir') ever.A = 1; if (B.state === 'fugir') ever.B = 1; if (C.state === 'fugir') ever.C = 1; if (A.alarmT > 0 || B.alarmT > 0) alarm = 1; if (A.callCd > 0) cd = 1; return false; });
        res.A += ever.A; res.B += ever.B; res.C += ever.C; res.alarm += alarm; res.cd += cd;
      }
      T.Eco.ECO.chicken.herdAlarm = save; return res;
    };
    const w = trial(85), ctl = trial(0);
    return { w, ctl, n: out.n };`);
  console.log('  [galinha-alarme]', JSON.stringify(r));
  ok(r.w.A >= r.n * 0.9, `galinha: quem vê a raposa (80 px) foge e dá o chamado (${r.w.A}/${r.n})`);
  ok(r.w.B >= r.n * 0.8 && r.ctl.B <= r.n * 0.2, `galinha: a vizinha a 50 px, que está a 130 px da raposa (fora da própria visão), foge COM o chamado em ${r.w.B}/${r.n} e SEM o chamado em ${r.ctl.B}/${r.n}`);
  ok(r.w.C === 0, `galinha: a galinha a 260 px (fora do alcance da voz) não é afetada (${r.w.C}/${r.n})`);
  ok(r.w.alarm >= r.n * 0.8 && r.w.cd >= r.n * 0.8, `galinha: o chamado tem sinal visual (arcos) e intervalo mínimo entre chamados (${r.w.alarm}/${r.n} e ${r.w.cd}/${r.n})`);
}

/* ---------- galinha: vigilância espontânea ---------- */
{
  const r = await J(`${PRE}
    const c = field(700); S.min = 360; const hs = []; for (let i = 0; i < 10; i++) hs.push(hen(c.x + (i - 5) * 14, c.y + (i % 3) * 10, { age: CHX_ADULT + 20 }));
    for (const h of hs) { h.state = 'andar'; h.t = 0.1; h.tx = h.x; h.ty = h.y; }
    const seen = new Set(); let vig = 0, n = 0; const chick = hen(c.x, c.y + 40, { age: 10 }); chick.state = 'andar'; chick.t = 0.1; let chickVig = 0;
    stepChx(240, () => { for (const h of hs) { if (h.state === 'vigia') { seen.add(h); vig++; } n++; if (h.state !== 'vigia' && h.t <= 0) h.t = 0; } if (chick.state === 'vigia') chickVig++; return false; });
    return { hens: seen.size, frac: vig / n, chickVig };`);
  console.log('  [galinha-vigia]', JSON.stringify(r));
  ok(r.hens >= 8 && r.frac > 0.02 && r.frac < 0.25, `galinha: em 4 min de jogo ${r.hens}/10 galinhas pararam para vigiar; tempo em vigilância ${(r.frac * 100).toFixed(1)}% (2–25%)`);
  ok(r.chickVig === 0, `galinha: pintinhos não têm o comportamento de vigia (${r.chickVig} quadros)`);
}

/* ---------- galo-lira: exibição ---------- */
{
  const r = await J(`${PRE}
    const out = {};
    const field2 = (seed) => { T.seed(seed); T.reset(); const tx = (T.home.x / TS) | 0, ty = ((T.home.y / TS) | 0) - 4; T.field(tx, ty, 16); T.player(T.C.x, T.C.y + 500); S.min = 360; return T.C; };
    const count = (sex, hun, age, secs = 240, n = 6) => { let ent = 0, zmax = 0; for (let k = 0; k < n; k++) { const c = field2(800 + k); const g = T.mk('grouse', c.x, c.y, { sex, hun, age, state: 'idle', t: 1, hx: c.x, hy: c.y }); let was = false; T.step(0.05, secs, () => { if (g.state === 'display') { if (!was) ent++; was = true; zmax = Math.max(zmax, g.z || 0); } else was = false; S.min = 360 + (S.min % 60); }); } return { ent, zmax: +zmax.toFixed(2) }; };
    out.macho = count('m', 0.2, 999); out.femea = count('f', 0.2, 999); out.filhote = count('m', 0.2, 40); out.faminto = count('m', 0.9, 999);
    // ameaça interrompe: raposa faminta caçando um galo em exibição
    { let left = 0, stuckZ = 0, n = 20; for (let k = 0; k < n; k++) { const c = field2(900 + k); const g = T.mk('grouse', c.x, c.y, { sex: 'm', hun: 0.2, age: 999, state: 'display', t: 60, hx: c.x, hy: c.y }); g.dz = true; const j = T.mk('fox', c.x - 90, c.y, { hun: 0.95, state: 'stalk', t: 30, tgt: g, lastSeen: { x: c.x, y: c.y, t: 0 }, loseT: 0 }); let t0 = null; T.step(0.05, 40, (i, t) => { if (g.state !== 'display') { if (t0 == null) t0 = t; return t - t0 > 1; } return false; }); if (g.state !== 'display') { left++; if ((g.state !== 'fly' && g.state !== 'land' && (g.z || 0) > 0.01)) stuckZ++; } } out.interrupt = { left, stuckZ, n }; }
    return out;`);
  console.log('  [galo-lira]', JSON.stringify(r));
  ok(r.macho.ent >= 3, `galo-lira: macho adulto saciado e calmo faz exibição (${r.macho.ent} exibições em 6×4 min; saltinho de até ${r.macho.zmax} px)`);
  ok(r.femea.ent === 0 && r.filhote.ent === 0 && r.faminto.ent === 0, `galo-lira: fêmea (${r.femea.ent}), jovem (${r.filhote.ent}) e macho faminto (${r.faminto.ent}) não fazem exibição`);
  ok(r.macho.zmax > 0.3 && r.macho.zmax <= 1.7, `galo-lira: exibição tem o saltinho (≤ 1,7 px), sem sair do chão`);
  ok(r.interrupt.left >= r.interrupt.n * 0.9 && r.interrupt.stuckZ === 0, `galo-lira: uma raposa faminta se aproximando interrompe a exibição (${r.interrupt.left}/${r.interrupt.n}) e o bicho não fica "preso no ar" (${r.interrupt.stuckZ})`);
}

/* ---------- lebre: abrigo na fuga ---------- */
{
  const r = await J(`${PRE}
    const out = { n: 60 };
    const trial = (cover) => { const angs = []; for (let k = 0; k < out.n; k++) {
      T.seed(1000 + k); T.reset(); const tx = (T.home.x / TS) | 0, ty = ((T.home.y / TS) | 0) - 4; T.field(tx, ty, 16); const c = T.C; T.player(c.x, c.y + 500);
      if (cover) { const px = Math.floor((c.x + 130 * Math.cos(-1)) / TS), py = Math.floor((c.y + 130 * Math.sin(-1)) / TS); for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) mato[(py + a) * MW + px + b] = 255; }
      const h = T.mk('hare', c.x, c.y, { age: 999 }); faFlee(h, { x: c.x - 60, y: c.y, id: 77, src: 'x', d: 60, r: 90 });
      let d = h.fang; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; angs.push(d); }
      return angs.reduce((a, b) => a + b, 0) / angs.length; };
    out.semAbrigo = +trial(false).toFixed(2); out.comAbrigo = +trial(true).toFixed(2);
    return out;`);
  console.log('  [lebre-abrigo]', JSON.stringify(r));
  ok(Math.abs(r.semAbrigo) < 0.35, `lebre: sem mato por perto foge no sentido oposto à ameaça (ângulo médio ${r.semAbrigo} rad ≈ 0)`);
  ok(r.comAbrigo < r.semAbrigo - 0.35, `lebre: com mato alto a ~130 px na diagonal ela curva a fuga em direção ao abrigo (ângulo médio ${r.comAbrigo} rad contra ${r.semAbrigo} sem abrigo)`);
}

console.log('erros de página:', errs.length ? errs.slice(0, 5) : 'nenhum');
ok(errs.length === 0, 'sem erros de página/console durante os testes de espécie');
await close();
