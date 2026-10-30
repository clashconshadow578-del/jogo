/**
 * Ecossistema vivo — cenários 1 a 10 (IA animal). Roda o jogo de verdade no Chromium (Playwright), com o laço parado e o
 * tempo avançado à mão (determinístico por semente; os resultados são estatísticos, por isso há várias repetições).
 *
 * Uso: NODE_PATH=$(npm root -g) node tests/browser/ecosystem-a.mjs
 */
import { launch, ok, run } from './lib.mjs';
import { installTools } from './eco-lib.mjs';

const { p, errs, close } = await launch();
await installTools(p);
const J = async (code) => JSON.parse(await run(p, `JSON.stringify((() => {${code}})())`));

/* ---------- 1. onça saciada encontra um cervo ---------- */
{
  const r = await J(`
    const res = { sated: { obs: 0, stalk: 0, kill: 0 }, hungry: { obs: 0, stalk: 0, kill: 0 }, n: 40 };
    for (const [key, hun] of [['sated', 0.05], ['hungry', 0.9]]) for (let k = 0; k < res.n; k++) {
      T.seed(10 + k); const c = T.open();
      const j = T.mk('jaguar', c.x - 70, c.y, { hun, sex: 'm', hx: c.x - 70, hy: c.y });
      const d = T.mk('deer', c.x, c.y, { hun: 0.3 });
      let o = 0, s = 0;
      T.step(0.05, 40, () => { if (j.state === 'observe') o = 1; if (j.state === 'stalk') s = 1; return d.state === 'dead'; });
      res[key].obs += o; res[key].stalk += s; if (d.state === 'dead') res[key].kill++;
    }
    return res;`);
  console.log('  [1]', JSON.stringify(r));
  ok(r.sated.obs >= r.n * 0.8, `1. onça saciada nota o cervo e OBSERVA (${r.sated.obs}/${r.n} tentativas) — interesse sem fome`);
  ok(r.sated.kill < r.hungry.kill && r.hungry.kill >= r.n * 0.8, `1. saciada ataca bem menos que faminta (mata ${r.sated.kill}/${r.n} vs ${r.hungry.kill}/${r.n}); faminta quase sempre ataca presa desatenta`);
  ok(r.sated.obs > r.sated.stalk || r.sated.stalk < r.n, `1. onça saciada nem sempre vira ataque (espreita em ${r.sated.stalk}/${r.n})`);
}

/* ---------- 2. cervo detecta a onça antes de ser atacado ---------- */
{
  const r = await J(`
    const out = {};
    for (const st of ['idle', 'forage', 'rest']) {
      const res = { n: 60, A: 0, B: 0, C: 0, D: 0, kill: 0, dist: [] };
      for (let k = 0; k < res.n; k++) {
        T.seed(500 + k); const c = T.open();
        const j = T.mk('jaguar', c.x - 140, c.y + ((k % 5) - 2) * 8, { hun: 0.9, sex: 'm', hx: c.x - 140, hy: c.y });
        const d = T.mk('deer', c.x, c.y, { hun: 0.4, state: st, t: 30 });
        let tA = null, tP = null, dA = null;
        T.step(0.05, 40, (i, t) => {
          if (tA == null && ['alert', 'flee', 'freeze'].includes(d.state)) { tA = t; dA = Math.round(T.d(j, d)); }
          if (tP == null && j.state === 'pounce') tP = t;
          return d.state === 'dead';
        });
        const det = tA != null && (tP == null || tA < tP);
        if (det && tP == null) res.A++; else if (det) res.B++; else if (tP != null) res.C++; else res.D++;
        if (det) res.dist.push(dA);
        if (d.state === 'dead') res.kill++;
      }
      res.dist.sort((a, b) => a - b); res.med = res.dist[res.dist.length >> 1]; delete res.dist;
      out[st] = res;
    }
    return out;`);
  console.log('  [2]', JSON.stringify(r));
  for (const st of ['idle', 'forage', 'rest']) {
    const q = r[st], eng = q.A + q.B + q.C;
    // idle: o cervo parado e sem presença de bando; 'rest' (deitado, atenção baixa) é o caso mais difícil
    const need = st === 'rest' ? 0.6 : 0.7;
    ok(eng > 0 && (q.A + q.B) / eng >= need, `2. cervo ${st}: detecta a onça ANTES do bote em ${q.A + q.B}/${eng} aproximações (${Math.round(((q.A + q.B) / eng) * 100)}%), distância mediana ${q.med} px`);
    // onça FAMINTA (agressiva: foco em caçar, descansa pouco): comendo/parado em chão aberto a presa ainda escapa bastante; deitado é o alvo mais fácil
    const maxKill = st === 'idle' ? 0.4 : st === 'forage' ? 0.65 : 0.95;
    ok(q.kill <= q.n * maxKill, `2. cervo ${st}: onça faminta mata ${q.kill}/${q.n} (≤ ${Math.round(maxKill * 100)}%): a caça é arriscada para o predador`);
  }
}

/* ---------- 3. raposa encontra uma lebre e avalia ---------- */
{
  const r = await J(`
    const res = { n: 40, hare: { obs: 0, stalk: 0, chase: 0, kill: 0 }, grouse: { hungry: { atk: 0 }, sated: { atk: 0 } }, hidden: 0, sated: { atk: 0 } };
    const E = (f) => ['observe', 'stalk', 'chase'].includes(f.state);
    for (let k = 0; k < res.n; k++) { // lebre à vista: ela avalia (a lebre é mais rápida que a raposa: raramente vale perseguir)
      T.seed(900 + k); const c = T.open();
      const f = T.mk('fox', c.x - 60, c.y, { hun: 0.7 });
      const h = T.mk('hare', c.x, c.y, { state: 'forage', t: 30, mv: true });
      let o = 0, s = 0, ch = 0;
      T.step(0.05, 40, () => { if (f.state === 'observe') o = 1; if (f.state === 'stalk') s = 1; if (f.state === 'chase') ch = 1; return h.state === 'dead'; });
      res.hare.obs += o; res.hare.stalk += s; res.hare.chase += ch; if (h.state === 'dead') res.hare.kill++;
    }
    for (const [key, hun] of [['hungry', 0.9], ['sated', 0.02]]) for (let k = 0; k < res.n; k++) { // galo-lira (presa mais lenta de arrancar)
      T.seed(1500 + k); const c = T.open();
      const f = T.mk('fox', c.x - 60, c.y, { hun });
      const g = T.mk('grouse', c.x, c.y, { state: 'forage', t: 30, hun: 0.4 });
      let a = 0;
      T.step(0.05, 40, () => { if (f.state === 'stalk' || f.state === 'chase') a = 1; return g.state === 'dead'; });
      res.grouse[key].atk += a;
    }
    for (let k = 0; k < res.n; k++) { // lebre atrás de parede de pedra: a raposa não a vê
      T.seed(1900 + k); const c = T.open();
      T.wall(((c.x - 30) / TS) | 0, ((c.y / TS) | 0) - 6, ((c.y / TS) | 0) + 6);
      const f = T.mk('fox', c.x - 60, c.y, { hun: 0.9 });
      const h = T.mk('hare', c.x, c.y, { state: 'idle', t: 30 });
      let e = 0;
      T.step(0.05, 25, () => { if (E(f)) e = 1; });
      res.hidden += e;
    }
    return res;`);
  console.log('  [3]', JSON.stringify(r));
  ok(r.hare.obs >= r.n * 0.8, `3. raposa nota a lebre à vista e AVALIA (observa em ${r.hare.obs}/${r.n})`);
  ok(r.hare.chase < r.n * 0.5, `3. avaliar ≠ perseguir: contra a lebre (mais rápida) persegue só em ${r.hare.chase}/${r.n}`);
  ok(r.grouse.hungry.atk > r.grouse.sated.atk, `3. contra presa viável, decide pela oportunidade e pela fome: faminta ataca ${r.grouse.hungry.atk}/${r.n}, saciada ${r.grouse.sated.atk}/${r.n}`);
  ok(r.hidden === 0, `3. lebre atrás de parede de pedra NÃO é percebida (engajou em ${r.hidden}/${r.n})`);
}

/* ---------- 4. presa escapa e o predador desiste ---------- */
const run4 = (HUN) => J(`
    const HUN = ${HUN};
    // perseguição já em andamento, com a presa fugindo a 70–110 px (inviável para a onça): ela deve desistir sem oscilar
    const res = { n: 40, gaveUp: 0, kills: 0, maxChase: 0, reenter: 0, cdSet: 0 };
    for (let k = 0; k < res.n; k++) {
      T.seed(3000 + k); const c = T.open();
      const gap = 70 + (k % 5) * 10;
      const j = T.mk('jaguar', c.x - gap, c.y, { hun: HUN, sex: 'm', hx: c.x - gap, hy: c.y });
      const d = T.mk(k % 2 ? 'hare' : 'deer', c.x, c.y, { state: 'flee', t: 12, fang: 0, zz: 1 });
      j.state = 'chase'; j.tgt = d; j.t = T.Eco.HUNT.jaguar.giveUp; j.lastSeen = { x: d.x, y: d.y, t: 0 };
      let ct = 0, entries = 1, last = 'chase', ended = null;
      T.step(0.05, 40, (i, t) => {
        if (j.state === 'chase') ct += 0.05;
        if (j.state !== last) { if (j.state === 'chase') entries++; if (last === 'chase' && ended == null) ended = t; last = j.state; }
        return d.state === 'dead';
      });
      res.maxChase = Math.max(res.maxChase, ct);
      if (d.state === 'dead') res.kills++; else { res.gaveUp++; if (j.cd > 0 || j.state !== 'chase') res.cdSet++; }
      res.reenter += Math.max(0, entries - 1);
    }
    res.giveUp = T.Eco.HUNT.jaguar.giveUp;
    return res;`);
{
  const r = await run4(0.3); // fome baixa (sem agressividade): o comportamento-base de desistência
  console.log('  [4]', JSON.stringify(r));
  ok(r.gaveUp >= r.n * 0.5, `4. presa escapou e a onça DESISTIU em ${r.gaveUp}/${r.n} perseguições inviáveis (matou ${r.kills})`);
  ok(r.maxChase <= r.giveUp + 3, `4. tempo total em perseguição por tentativa ≤ limite (${r.maxChase.toFixed(1)} s ≤ ${r.giveUp} s + folga)`);
  ok(r.cdSet >= r.gaveUp * 0.9, `4. depois de desistir deixa de caçar/espera (${r.cdSet}/${r.gaveUp})`);
  ok(r.reenter <= r.n * 0.25, `4. sem oscilação perseguir↔desistir (${r.reenter} reentradas em ${r.n} tentativas)`);
  const h = await run4(0.95); // faminta: persegue por mais tempo e desiste menos
  console.log('  [4h]', JSON.stringify(h));
  ok(h.kills >= r.kills, `4. onça faminta persiste mais que a saciada (mata ${h.kills}/${h.n} contra ${r.kills}/${r.n})`);
  ok(h.maxChase >= r.maxChase - 0.5, `4. faminta não desiste antes da saciada (${h.maxChase.toFixed(1)} s ≥ ${r.maxChase.toFixed(1)} s)`);
}

/* ---------- 5. bando de queixadas reage a um predador ---------- */
{
  const r2 = await J(`
    const res = { n: 30, collective: 0, firstDist: [], groupKill: 0, loneKill: 0 };
    const R = (b) => ['alert', 'warn', 'charge', 'flee', 'retreat'].includes(b.state);
    for (let k = 0; k < res.n; k++) {
      T.seed(4000 + k); const c = T.open();
      const j = T.mk('jaguar', c.x - 130, c.y, { hun: 0.95, sex: 'm', hx: c.x - 130, hy: c.y });
      const bs = [];
      for (let i = 0; i < 5; i++) bs.push(T.mk('boar', c.x + (i % 3) * 14, c.y + (i >> 1) * 14, { state: 'forage', t: 40, hun: 0.4 }));
      let t0 = null, peak = 0, dist = null;
      T.step(0.05, 30, (i, t) => {
        const n = bs.filter((b) => R(b) || b.state === 'dead' || b.state === 'fight').length;
        if (t0 == null && n >= 1) { t0 = t; dist = Math.round(T.d(j, bs[0])); }
        if (t0 != null && t - t0 <= 4) peak = Math.max(peak, n); // quantos reagem ao mesmo tempo logo depois do primeiro aviso
        return false;
      });
      if (peak >= 3) res.collective++;
      if (dist != null) res.firstDist.push(dist);
      if (bs.some((b) => b.state === 'dead')) res.groupKill++;
    }
    for (let k = 0; k < res.n; k++) {
      T.seed(4000 + k); const c = T.open();
      const j = T.mk('jaguar', c.x - 130, c.y, { hun: 0.95, sex: 'm', hx: c.x - 130, hy: c.y });
      const b = T.mk('boar', c.x, c.y, { state: 'forage', t: 40, hun: 0.4 });
      T.step(0.05, 30, () => b.state === 'dead');
      if (b.state === 'dead') res.loneKill++;
    }
    res.firstDist.sort((a, b) => a - b); res.med = res.firstDist[res.firstDist.length >> 1]; delete res.firstDist;
    return res;`);
  console.log('  [5]', JSON.stringify(r2));
  ok(r2.collective >= r2.n * 0.6, `5. quando um queixada percebe o predador, ≥3 dos 5 reagem juntos em até 4 s (${r2.collective}/${r2.n}); 1ª reação a ~${r2.med} px da onça`);
  ok(r2.groupKill < r2.loneKill, `5. bando perde menos que um queixada sozinho (${r2.groupKill}/${r2.n} vs ${r2.loneKill}/${r2.n})`);
}

/* ---------- 6. sucuri espera a presa adequada ---------- */
{
  const r = await J(`
    // acha uma beira de lago: a sucuri nasce na água rasa; presa passa longe, perto e bebendo
    const res = { n: 40, farStrike: 0, farStalk: 0, nearStrike: 0, leftWater: 0, noWater: 0 };
    if (!T.snake) return { noSnake: 1 };
    // centro de uma poça rasa (3×3 tiles de água rasa) perto de onde a sucuri nasceu
    const shallow = (tx, ty) => ground[ty * MW + tx] === WATER && (WTc[ty * MW + tx] === 7 || WTc[ty * MW + tx] === 8);
    let x0 = T.snake.x, y0 = T.snake.y, best = 99;
    const sx = (T.snake.x / TS) | 0, sy = (T.snake.y / TS) | 0;
    for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) {
      let all = true;
      for (let a = -1; a <= 1 && all; a++) for (let b = -1; b <= 1; b++) if (!shallow(sx + dx + b, sy + dy + a)) { all = false; break; }
      if (all && Math.hypot(dx, dy) < best) { best = Math.hypot(dx, dy); x0 = (sx + dx) * TS + 8; y0 = (sy + dy) * TS + 8; }
    }
    T.reset(); const an0 = T.mk('anaconda', x0, y0, { state: 'ambush', hide: true, t: 200, hun: 0.8 });
    const wat = (x, y) => ground[Math.floor(y / TS) * MW + Math.floor(x / TS)] === WATER;
    let land = null;
    for (let ang = 0; ang < 6.28 && !land; ang += 0.3) for (const d of [14, 20, 26, 32]) { const x = x0 + Math.cos(ang) * d, y = y0 + Math.sin(ang) * d; if (!wat(x, y) && !obj[Math.floor(y / TS) * MW + Math.floor(x / TS)]) { land = [x, y, ang, d]; break; } }
    if (!land) return { noLand: 1 };
    const farLand = (() => { for (let ang = 0; ang < 6.28; ang += 0.3) { const x = x0 + Math.cos(ang) * 150, y = y0 + Math.sin(ang) * 150; if (!wat(x, y) && !obj[Math.floor(y / TS) * MW + Math.floor(x / TS)]) return [x, y]; } return null; })();
    for (let k = 0; k < res.n; k++) {
      T.seed(7000 + k); T.reset(); fauna.push(an0);
      Object.assign(an0, { x: x0, y: y0, state: 'ambush', hide: true, t: 200, hun: 0.8, cd: 0, dg: 0, expose: 0 });
      T.player(x0, y0 + 600);
      let far = null;
      if (farLand) far = T.mk('deer', farLand[0], farLand[1], { state: 'idle', t: 99, hun: 0.2 });
      let fs = false, fk = false;
      T.step(0.05, 12, () => { if (an0.state === 'strike' && an0.tgt === far) fs = true; if (an0.state === 'stalk' && an0.tgt === far) fk = true; /* só a presa do teste conta: o povoamento pode soltar um bicho de passagem */ if (an0.state === 'ambush') { an0.x = x0; an0.y = y0; } /* a correnteza do rio arrasta a sucuri parada: o teste mede decisão, não deriva */ });
      if (fs) res.farStrike++; if (fk) res.farStalk++;
      if (!an0.sw && an0.state !== 'dead' && an0.tgt === far) res.leftWater++;
      fauna.splice(0, fauna.length, an0);
      Object.assign(an0, { x: x0, y: y0, state: 'ambush', hide: true, t: 200, hun: 0.8, cd: 0, dg: 0, expose: 0 });
      const near = T.mk('deer', land[0], land[1], { state: 'drink', t: 6, hun: 0.2 });
      let ns = false;
      T.step(0.05, 10, () => { if (an0.state === 'strike' || an0.state === 'constrict') ns = true; });
      if (ns) res.nearStrike++;
    }
    return res;`);
  console.log('  [6]', JSON.stringify(r));
  if (r.noSnake || r.noLand) {
    ok(false, `6. cenário da sucuri não pôde ser montado (${JSON.stringify(r)})`);
  } else {
    ok(r.farStrike === 0, `6. presa longe (150 px) NÃO é atacada: a sucuri espera (${r.farStrike}/${r.n} botes)`);
    ok(r.nearStrike >= r.n * 0.5, `6. presa bebendo na beira (alcance) é atacada (${r.nearStrike}/${r.n})`);
    ok(r.leftWater === 0, `6. ela não sai da água para perseguir (${r.leftWater} saídas)`);
  }
}

/* ---------- 7. rotina volta depois que a ameaça some ---------- */
{
  const r = await J(`
    const res = { n: 20, back: 0, tBack: [], memGone: 0 };
    for (let k = 0; k < res.n; k++) {
      T.seed(8000 + k); const c = T.open();
      const j = T.mk('jaguar', c.x - 120, c.y, { hun: 0.9, sex: 'm', hx: c.x - 120, hy: c.y });
      const d = T.mk('deer', c.x, c.y, { state: 'forage', t: 40, hun: 0.4 });
      let fled = false, tRemove = null, tBack = null;
      T.step(0.05, 90, (i, t) => {
        if (!fled && (d.state === 'flee' || d.state === 'alert')) { fled = true; tRemove = t; }
        if (fled && tRemove != null && t >= tRemove && j.T) { j.T = 0; fauna.splice(fauna.indexOf(j), 1); } // a ameaça some
        if (fled && !j.T && tBack == null && ['forage', 'idle', 'rest', 'go', 'drink'].includes(d.state)) tBack = t - tRemove;
        return d.state === 'dead';
      });
      if (tBack != null) { res.back++; res.tBack.push(+tBack.toFixed(1)); }
      if (!d.mem || d.mem.filter((m) => m.kind === 'threat').length === 0) res.memGone++;
    }
    res.tBack.sort((a, b) => a - b); res.med = res.tBack[res.tBack.length >> 1]; res.max = res.tBack[res.tBack.length - 1]; delete res.tBack;
    return res;`);
  console.log('  [7]', JSON.stringify(r));
  ok(r.back >= r.n * 0.8, `7. cervo retoma a rotina depois que a onça some (${r.back}/${r.n}); mediana ${r.med} s, máx ${r.max} s`);
  ok(r.memGone >= r.n * 0.8, `7. a memória da ameaça expira (${r.memGone}/${r.n} sem lembrança ao fim de 90 s)`);
}

/* ---------- 8. cercas, obstáculos e limites do mapa ---------- */
{
  const r = await J(`
    const res = { n: 20, penEnter: 0, rockInside: 0, oobMin: 1e9, oobMax: -1e9, throughWall: 0, fenceCross: 0 };
    // (a) onça faminta fora de um cercado com cervo dentro: não atravessa a cerca
    for (let k = 0; k < res.n; k++) {
      T.seed(9000 + k); const c = T.open(18);
      const tx = (c.x / TS) | 0, ty = (c.y / TS) | 0;
      for (let x = tx - 3; x <= tx + 3; x++) { obj[(ty - 3) * MW + x] = FENCE; obj[(ty + 3) * MW + x] = FENCE; }
      for (let y = ty - 3; y <= ty + 3; y++) { obj[y * MW + tx - 3] = FENCE; obj[y * MW + tx + 3] = FENCE; }
      const inside = (e) => e.x > (tx - 3) * TS + 4 && e.x < (tx + 4) * TS - 4 && e.y > (ty - 3) * TS + 4 && e.y < (ty + 4) * TS - 4;
      const j = T.mk('jaguar', c.x - 110, c.y, { hun: 0.95, sex: 'm', hx: c.x - 110, hy: c.y });
      const d = T.mk('deer', c.x, c.y, { state: 'forage', t: 99 });
      let entered = false;
      T.step(0.05, 40, () => { if (inside(j)) entered = true; });
      if (entered) res.penEnter++;
    }
    // (b) parede de pedra entre a onça e a presa: não "vê" nem anda por dentro da pedra
    for (let k = 0; k < res.n; k++) {
      T.seed(9500 + k); const c = T.open(18);
      const tx = (c.x / TS) | 0, ty = (c.y / TS) | 0;
      T.wall(tx - 3, ty - 8, ty + 8);
      const j = T.mk('jaguar', c.x - 110, c.y, { hun: 0.95, sex: 'm', hx: c.x - 110, hy: c.y });
      const d = T.mk('deer', c.x, c.y, { state: 'forage', t: 99 });
      let inRock = false, sawThrough = false;
      T.step(0.05, 30, () => {
        const ti = Math.floor(j.y / TS) * MW + Math.floor(j.x / TS);
        if (obj[ti] === ROCK) inRock = true;
        // o faro da onça (420 px) sente a presa atrás da pedra e ela pode ir até lá (observar/espreitar); o que NÃO pode é atacar através da parede
        if (['chase', 'pounce'].includes(j.state) && j.x < (tx - 3) * TS && j.tgt === d && T.d(j, d) < 140 && Math.abs(j.y - d.y) < 20) sawThrough = true;
      });
      if (inRock) res.rockInside++;
      if (sawThrough) res.throughWall++;
    }
    // (c) limites do mapa: perseguição para fora da borda
    const min = (v) => (res.oobMin = Math.min(res.oobMin, v)), max = (v) => (res.oobMax = Math.max(res.oobMax, v));
    for (let k = 0; k < res.n; k++) {
      T.seed(9800 + k); T.reset();
      const ex = 4 * TS, ey = 50 * TS;
      for (let y = 40; y <= 60; y++) for (let x = 2; x <= 14; x++) { const i = y * MW + x; ground[i] = GRASS; obj[i] = 0; mato[i] = 0; }
      T.player(ex + 400, ey + 400);
      const j = T.mk('jaguar', ex + 90, ey, { hun: 0.95, sex: 'm', hx: ex + 90, hy: ey });
      const d = T.mk('hare', ex + 40, ey, { state: 'forage', t: 99 });
      d.fang = Math.PI; // foge para a borda
      T.step(0.05, 25, () => { for (const a of [j, d]) { min(a.x); max(a.x); if (!isFinite(a.x) || !isFinite(a.y)) res.nan = 1; } });
    }
    return res;`);
  console.log('  [8]', JSON.stringify(r));
  ok(r.penEnter === 0, `8. onça NÃO entra no cercado de cercas atrás da presa (${r.penEnter}/${r.n} entradas)`);
  ok(r.rockInside === 0, `8. onça nunca ocupa um tile de pedra (${r.rockInside}/${r.n})`);
  ok(r.throughWall === 0, `8. onça não caça "através" de parede de pedra (${r.throughWall}/${r.n})`);
  ok(r.oobMin >= 16 - 0.01 && r.oobMax <= 99 * 16 + 0.01 && !r.nan, `8. animais respeitam o limite do mapa (x entre ${r.oobMin.toFixed(1)} e ${r.oobMax.toFixed(1)}; permitido 16..${99 * 16}), sem NaN`);
}

/* ---------- 9. vários animais próximos: custo ---------- */
{
  const r = await J(`
    T.seed(77); const c = T.open(18);
    const sps = ['deer', 'hare', 'grouse', 'fox', 'boar', 'deer', 'hare', 'boar'];
    for (let i = 0; i < 100; i++) T.mk(sps[i % sps.length], c.x + ((i * 37) % 200) - 100, c.y + ((i * 53) % 200) - 100, { state: 'forage', t: 5 + (i % 20), hun: 0.3 + (i % 5) * 0.1 });
    for (let i = 0; i < 4; i++) T.mk('jaguar', c.x + i * 40 - 60, c.y - 120, { hun: 0.8, sex: i % 2 ? 'm' : 'f', hx: c.x, hy: c.y });
    T.mk('anaconda', c.x + 200, c.y, {});
    T.player(c.x, c.y + 60);
    T.Pc.percStats.sense = 0; T.Pc.percStats.occ = 0;
    const ms = [];
    for (let i = 0; i < 600; i++) { const t0 = performance.now(); T.tick(0.05); ms.push(performance.now() - t0); }
    ms.sort((a, b) => a - b);
    const secs = 600 * 0.05, n = fauna.length;
    return { n, mean: ms.reduce((a, b) => a + b, 0) / ms.length, p95: ms[Math.floor(ms.length * 0.95)], max: ms[ms.length - 1], sensePerAnimalSec: T.Pc.percStats.sense / secs / n, occPerAnimalSec: T.Pc.percStats.occ / secs / n };`);
  console.log('  [9]', JSON.stringify(r));
  ok(r.n >= 100, `9. ${r.n} animais simultâneos na mesma área`);
  ok(r.p95 < 8, `9. custo por quadro de simulação: média ${r.mean.toFixed(2)} ms, p95 ${r.p95.toFixed(2)} ms, máx ${r.max.toFixed(1)} ms (limite 8 ms p95 para 100+ animais)`);
  // cada animal avalia a cada 0,25 s (4 Hz) só os PREDADORES e o jogador próximos (5 predadores + jogador = 6 fontes): teto ≈ 4 × 6 = 24/s, nunca N² sobre todos os animais
  ok(r.sensePerAnimalSec <= 28, `9. percepção escalonada: ${r.sensePerAnimalSec.toFixed(1)} avaliações/animal/s (teto 28 = 4 Hz × 6 fontes), oclusões ${r.occPerAnimalSec.toFixed(1)}/animal/s`);
}

/* ---------- 10. sistemas existentes (fome, comer, caça, reprodução) ---------- */
{
  const r = await J(`
    T.seed(31337); T.reset(); setFaInitDone(false);
    // um dia de jogo de verdade, com a fauna inicial do mapa (sem limpar): mede se o ciclo de vida continua funcionando
    S.min = 300; S.px = T.home.x; S.py = T.home.y;
    const ids = new Map(); const snap = () => { for (const a of fauna) if (!ids.has(a.id)) ids.set(a.id, { sp: a.sp, born: S.min, kid: a.age < 150 }); };
    let eats = 0, kills = 0, drinks = 0, maxHun = 0, minHun = 1, deaths = 0, fights = 0; const seenDead = new Set();
    const hunPrev = new Map();
    const t0 = performance.now();
    for (let i = 0; i < 24000; i++) { // 1200 s = 1 dia de jogo
      S.min += 0.05; updateFauna(0.05); if (i % 20 === 0) snap();
      for (const a of fauna) {
        if (a.state === 'dead' && !seenDead.has(a.id)) { seenDead.add(a.id); deaths++; if (a.cause === 'predador' || a.hunter || a.state === 'dead' && a.killedBy) kills++; }
        if (i % 40 === 0) { const h0 = hunPrev.get(a.id); if (h0 != null && a.hun < h0 - 0.02) eats++; hunPrev.set(a.id, a.hun); maxHun = Math.max(maxHun, a.hun); minHun = Math.min(minHun, a.hun); if (a.state === 'drink') drinks++; if (a.state === 'jfight') fights++; }
      }
      if (S.min > 1190) S.min = 300;
    }
    const kids = [...ids.values()].filter((v) => v.kid).length;
    return { total: ids.size, eats, drinks, deaths, fights, maxHun, minHun, kids, secs: ((performance.now() - t0) / 1000) | 0, left: fauna.length };`);
  console.log('  [10]', JSON.stringify(r));
  ok(r.eats > 0, `10. animais continuam comendo (quedas de fome observadas: ${r.eats})`);
  ok(r.drinks > 0, `10. animais continuam bebendo (${r.drinks} amostras em 'drink')`);
  ok(r.maxHun <= 1 && r.minHun >= 0, `10. fome fica em [0,1] (min ${r.minHun.toFixed(2)}, máx ${r.maxHun.toFixed(2)})`);
  ok(r.fights > 0 || r.deaths > 0, `10. há caça/morte no ecossistema (lutas de onça ${r.fights}, mortes ${r.deaths})`);
  ok(r.left > 0, `10. população não colapsou em 1 dia de jogo (${r.left} animais ao final; nasceram ${r.kids}; ${r.secs}s de CPU)`);
}

console.log('erros de página:', errs.length ? errs.slice(0, 5) : 'nenhum');
ok(errs.length === 0, 'sem erros de página/console durante os cenários 1–10');
await close();
