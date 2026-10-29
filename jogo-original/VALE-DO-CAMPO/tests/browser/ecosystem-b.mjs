/**
 * Ecossistema vivo — cenários 11 a 19 (o jogador como presa: onça e sucuri). Roda o jogo no Chromium (Playwright) com o
 * laço parado e o tempo avançado à mão. O "jogador" é simulado (posição/velocidade); os resultados são estatísticos.
 *
 * Uso: NODE_PATH=$(npm root -g) node tests/browser/ecosystem-b.mjs
 */
import { launch, ok, run } from './lib.mjs';
import { installTools } from './eco-lib.mjs';

const { p, errs, close } = await launch({ width: 960, height: 540 });
await installTools(p);
const J = async (code) => JSON.parse(await run(p, `JSON.stringify((() => {${code}})())`));

// campo aberto, jogador no centro; onça faminta/saciada a `dist` px à esquerda
const SETUP = `
  const setup = (seed, o = {}) => {
    T.seed(seed); T.reset(); const tx = (T.home.x / TS) | 0, ty = ((T.home.y / TS) | 0) - 4; T.field(tx, ty, 16); const c = T.C;
    T.player(c.x, c.y); S.vida = o.energy == null ? 100 : o.energy;
    const j = T.mk('jaguar', c.x - (o.dist || 95), c.y, { hun: o.hun == null ? 0.9 : o.hun, sex: 'm', hx: c.x - (o.dist || 95), hy: c.y });
    return { c, j, tx, ty };
  };`;

/* ---------- 11. onça detecta o jogador e avalia caçá-lo sem fome alta ---------- */
{
  const r = await J(`${SETUP}
    const res = { n: 30, sated: { obs: 0, bite: 0 }, satedStill: { atk: 0 }, hungry: { bite: 0 } };
    for (let k = 0; k < res.n; k++) { // jogador andando de lado a 120 px; onça saciada
      const { j } = setup(200 + k, { hun: 0.1, dist: 120 });
      let o = 0;
      T.step(0.05, 30, () => { T.mv(1.57, 40, 0.05); if (j.state === 'pobserve') o = 1; return S.vida < 100; });
      res.sated.obs += o; if (S.vida < 100) res.sated.bite++;
    }
    for (let k = 0; k < res.n; k++) { // jogador PARADO perto (75 px), onça saciada: ainda avalia
      const { j } = setup(600 + k, { hun: 0.1, dist: 75 });
      let a = 0;
      T.step(0.05, 30, () => { T.stand(); if (['pobserve', 'pstalk', 'pchase'].includes(j.state)) a = 1; return S.vida < 100; });
      res.satedStill.atk += a;
    }
    for (let k = 0; k < res.n; k++) { // faminta + jogador parado
      const { j } = setup(900 + k, { hun: 0.9, dist: 95 });
      T.step(0.05, 30, () => { T.stand(); return S.vida < 100; });
      if (S.vida < 100) res.hungry.bite++;
    }
    return res;`);
  console.log('  [11]', JSON.stringify(r));
  ok(r.sated.obs >= r.n * 0.8, `11. onça SACIADA nota o jogador em movimento e AVALIA (observa em ${r.sated.obs}/${r.n})`);
  ok(r.sated.bite === 0, `11. saciada que só observa não morde sem motivo (${r.sated.bite}/${r.n} mordidas)`);
  ok(r.satedStill.atk >= r.n * 0.8, `11. jogador parado perto: ela avalia mesmo sem fome (${r.satedStill.atk}/${r.n})`);
  ok(r.hungry.bite >= r.n * 0.8, `11. faminta ataca o jogador parado ao alcance (${r.hungry.bite}/${r.n})`);
}

/* ---------- 12. velocidade de perseguição ---------- */
{
  const r = await J(`${SETUP}
    const res = { n: 20, peak: [], early: [], walk: 60, run: 78, jagRun: FA_SP.jaguar.run, jagWalk: FA_SP.jaguar.walk };
    for (let k = 0; k < res.n; k++) {
      const { j } = setup(1200 + k, { hun: 0.95, dist: 95 });
      let px = j.x, py = j.y, t0 = null, peak = 0, early = 0;
      T.step(0.05, 12, (i, t) => {
        T.stand();
        const sp = Math.hypot(j.x - px, j.y - py) / 0.05; px = j.x; py = j.y;
        if (j.state === 'pchase') { if (t0 == null) t0 = t; const dt = t - t0; if (dt > 0.1 && dt < 0.2) early = Math.max(early, sp); peak = Math.max(peak, sp); }
        return S.vida < 100;
      });
      if (peak) { res.peak.push(peak); res.early.push(early); }
    }
    const avg = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
    return { n: res.peak.length, peak: Math.max(...res.peak), peakAvg: avg(res.peak), earlyAvg: avg(res.early), walk: res.walk, run: res.run, jagRun: res.jagRun, jagWalk: res.jagWalk, burstCfg: T.Eco.PLAYER_PREY.jaguar.burst };`);
  console.log('  [12]', JSON.stringify(r));
  ok(r.n >= 10, `12. perseguições medidas: ${r.n}`);
  ok(r.peakAvg >= r.run * 1.2, `12. velocidade de perseguição ${r.peakAvg.toFixed(0)} px/s ≥ 1,2× a corrida do jogador (${r.run}) e ${(r.peakAvg / r.walk).toFixed(1)}× a caminhada (${r.walk}); caminhada normal da onça é ${r.jagWalk}`);
  ok(r.earlyAvg < r.peakAvg * 0.9, `12. aceleração gradual: ${r.earlyAvg.toFixed(0)} px/s em 0,1–0,2 s de corrida < ${(r.peakAvg * 0.9).toFixed(0)} (90% do pico)`);
}

/* ---------- 13. o jogador consegue escapar; a onça desiste ---------- */
{
  const r = await J(`${SETUP}
    const run1 = (mode, seed) => {
      const { j, tx, ty, c } = setup(seed, { hun: 0.9, dist: mode === 'far' ? 160 : 95 });
      if (mode === 'rock') for (let i = 0; i < 14; i++) { const rx = tx + 2 + ((i * 5) % 11), ry = ty - 6 + ((i * 7) % 13); obj[ry * MW + rx] = ROCK; }
      let started = null, ang = 0, nextTurn = 0, sgn = 1, gave = false, last = '', jukes = 0, cdAfter = 0;
      T.step(0.05, 40, (i, t) => {
        if (started == null) {
          T.stand();
          const trig = mode === 'early' ? ['pstalk', 'pobserve', 'pchase'].includes(j.state) : j.state === 'pchase';
          if (trig) started = t + (mode === 'early' ? 0.6 : 0.4); // tempo de reação humano
          return false;
        }
        if (mode === 'still') T.stand();
        else if (t >= started) {
          if (mode === 'juke' && jukes < 1 && T.dP(j) < 38) { jukes++; sgn = -sgn; ang = Math.atan2(S.py - j.y, S.px - j.x) + sgn * 1.4; }
          T.mv(ang, 78, 0.05);
        } else T.stand();
        if (last === 'pchase' && j.state !== 'pchase' && j.state !== 'pattack') gave = true;
        last = j.state;
        if (gave && T.dP(j) > 150) cdAfter = j.cd;
        return S.vida < 100 || (gave && T.dP(j) > 150);
      });
      return { bitten: S.vida < 100, gave, started: started != null, cd: cdAfter };
    };
    const out = {};
    for (const mode of ['still', 'straight', 'juke', 'rock', 'early']) {
      const o = { n: mode === 'straight' ? 100 : 40, bit: 0, esc: 0, started: 0, cdOk: 0 };
      for (let k = 0; k < o.n; k++) { const r = run1(mode, 1300 + k); if (r.started) o.started++; if (r.bitten) o.bit++; else if (r.gave) { o.esc++; if (r.cd > 0) o.cdOk++; } }
      out[mode] = o;
    }
    return out;`);
  console.log('  [13]', JSON.stringify(r));
  const R = r;
  ok(R.still.bit >= R.still.started * 0.9, `13. controle: parado diante da onça faminta leva mordida (${R.still.bit}/${R.still.started})`);
  const frac = (o) => o.esc / Math.max(1, o.started);
  ok(frac(R.straight) >= 0.15 && frac(R.straight) <= 0.75, `13. fugir em linha reta logo que a onça arranca: escapa em ${R.straight.esc}/${R.straight.started} (${Math.round(frac(R.straight) * 100)}%) — nem trivial nem impossível`);
  ok(frac(R.early) >= 0.85, `13. fugir assim que percebe a espreita (distância): escapa em ${R.early.esc}/${R.early.started}`);
  ok(frac(R.rock) >= 0.7, `13. fugir entre obstáculos (pedras): escapa em ${R.rock.esc}/${R.rock.started} (${Math.round(frac(R.rock) * 100)}%)`);
  ok(frac(R.juke) >= frac(R.straight) - 0.05, `13. uma guinada brusca no último instante não piora a fuga (${R.juke.esc}/${R.juke.started} vs ${R.straight.esc}/${R.straight.started} em linha reta)`);
  ok(R.straight.cdOk >= R.straight.esc * 0.9, `13. depois de desistir a onça entra em intervalo e não volta a perseguir logo (${R.straight.cdOk}/${R.straight.esc})`);
}

/* ---------- 14. perde a linha de visão: investiga o ÚLTIMO ponto, não a posição atual ---------- */
{
  const r = await J(`${SETUP}
    const res = { n: 20, chased: 0, invest: 0, frozen: 0, speedOk: 0, gaveUp: 0, cdOk: 0, farEnd: 0, towardLast: 0, short: 0 };
    for (let k = 0; k < res.n; k++) {
      const { j, c } = setup(1700 + k, { hun: 0.95, dist: 95 });
      let phase = 0, tI = 0, inv = false, plIn = null, plOut = null, p0 = null, pEnd = null, vmax = 0, px = 0, py = 0, tInv0 = null, tInv1 = null, d0 = 0, dMin = 1e9, left = false;
      T.step(0.05, 45, (i, t) => {
        if (phase === 0) { // espera a corrida; no instante dela uma parede de pedra longa aparece entre os dois
          T.stand();
          if (j.state === 'pchase') { phase = 1; tI = t; const mx = Math.floor(((j.x + S.px) / 2) / TS), jy = Math.floor(j.y / TS); for (let y = jy - 14; y <= jy + 14; y++) obj[y * MW + mx] = ROCK; }
          return false;
        }
        T.mv(0, 78, 0.05); // foge para longe da parede (leste): sai do alcance de audição
        if (j.state === 'pinvest') {
          if (!inv) { inv = true; tInv0 = t; plIn = j.pl ? { x: j.pl.x, y: j.pl.y } : null; p0 = { x: S.px, y: S.py }; d0 = plIn ? Math.hypot(j.x - plIn.x, j.y - plIn.y) : 0; }
          vmax = Math.max(vmax, Math.hypot(j.x - px, j.y - py) / 0.05);
          if (j.pl) { plOut = { x: j.pl.x, y: j.pl.y }; dMin = Math.min(dMin, Math.hypot(j.x - plOut.x, j.y - plOut.y)); }
          pEnd = { x: S.px, y: S.py }; tInv1 = t;
        } else if (inv && !left) { left = true; }
        px = j.x; py = j.y;
        return left && T.dP(j) > 150;
      });
      if (phase) res.chased++;
      if (inv) {
        res.invest++;
        if (plIn && plOut && Math.hypot(plIn.x - plOut.x, plIn.y - plOut.y) < 1 && Math.hypot(pEnd.x - p0.x, pEnd.y - p0.y) > 60) res.frozen++; // ela guarda o ponto onde viu; o jogador andou 60+ px sem ela saber
        if (vmax <= 45) res.speedOk++;
        if (dMin <= d0 + 1) res.towardLast++; // foi na direção do último ponto visto
        if (tInv1 - tInv0 <= 9.5) res.short++;
        if (left && j.cd > 0) res.cdOk++;
      }
      if (left) res.gaveUp++;
      if (T.dP(j) > 120) res.farEnd++;
    }
    return res;`);
  console.log('  [14]', JSON.stringify(r));
  ok(r.chased >= r.n * 0.9, `14. onça entra em perseguição (${r.chased}/${r.n})`);
  ok(r.invest >= r.chased * 0.8, `14. perdeu a linha de visão (parede de pedra) e passou a INVESTIGAR (${r.invest}/${r.chased})`);
  ok(r.frozen >= r.invest * 0.8, `14. enquanto investiga, só conhece o ÚLTIMO ponto visto: a posição guardada não acompanha o jogador que anda ≥60 px (${r.frozen}/${r.invest})`);
  ok(r.towardLast >= r.invest * 0.7, `14. ela vai ao ponto da última observação (${r.towardLast}/${r.invest})`);
  ok(r.speedOk >= r.invest * 0.9, `14. investiga em ritmo de caminhada, sem a velocidade de corrida (${r.speedOk}/${r.invest})`);
  ok(r.short >= r.invest * 0.9 && r.gaveUp >= r.invest * 0.9 && r.cdOk >= r.gaveUp * 0.9, `14. a investigação é limitada no tempo: desiste (${r.gaveUp}/${r.invest}), em ≤ ~9 s (${r.short}/${r.invest}), e entra em intervalo (${r.cdOk}/${r.gaveUp})`);
}

/* ---------- sucuri: preparação ---------- */
const SNAKE = `
  const shallow = (tx, ty) => ground[ty * MW + tx] === WATER && (WTc[ty * MW + tx] === 7 || WTc[ty * MW + tx] === 8);
  const pool = () => {
    let x0 = T.snake.x, y0 = T.snake.y, best = 99;
    const sx = (T.snake.x / TS) | 0, sy = (T.snake.y / TS) | 0;
    for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) {
      let all = true;
      for (let a = -1; a <= 1 && all; a++) for (let b = -1; b <= 1; b++) if (!shallow(sx + dx + b, sy + dy + a)) { all = false; break; }
      if (all && Math.hypot(dx, dy) < best) { best = Math.hypot(dx, dy); x0 = (sx + dx) * TS + 8; y0 = (sy + dy) * TS + 8; }
    }
    return { x0, y0 };
  };
  const landNear = (x0, y0, d) => { for (let ang = 0; ang < 6.28; ang += 0.2) { const x = x0 + Math.cos(ang) * d, y = y0 + Math.sin(ang) * d; if (ground[Math.floor(y / TS) * MW + Math.floor(x / TS)] !== WATER && !obj[Math.floor(y / TS) * MW + Math.floor(x / TS)]) return [x, y, ang]; } return null; };`;

/* ---------- 16 (e 18-sucuri). emboscada: entra no alcance → ataque surpresa ---------- */
{
  const r = await J(`${SNAKE}
    if (!T.snake) return { noSnake: 1 };
    const { x0, y0 } = pool();
    // jogador chega pela margem: acha a terra mais próxima a ~30 px (alcance do bote ≈ 34)
    let land = null, dd = 0;
    for (const d of [28, 30, 32, 26]) { land = landNear(x0, y0, d); if (land) { dd = d; break; } }
    if (!land) return { noLand: 1 };
    const PA = T.Eco.PLAYER_PREY.anaconda;
    const res = { n: 60, coil: 0, hit: 0, other: 0, noWarn: 0, dmgOk: 0, telegraph: [], holds: [], slowSeen: 0, released: 0, stayedHidden: 0, dd, reach: PA.reach };
    for (let k = 0; k < res.n; k++) {
      T.seed(2200 + k); T.reset();
      const s = T.mk('anaconda', x0, y0, { state: 'ambush', hide: true, t: 300, hun: 0.8, expose: 0, cd: 0 });
      T.player(x0 + (land[0] - x0) * 4, y0 + (land[1] - y0) * 4); S.vida = 100; // começa a 4× a distância final
      let tc = null, tStr = null, hit = false, slow = false, e0 = 100, fled = false, holdN = 0, other = false;
      T.step(0.05, 14, (i, t) => {
        // aproximação: anda até o ponto final a 55 px/s, depois fica parado
        const dx = land[0] - S.px, dy = land[1] - S.py, dl = Math.hypot(dx, dy);
        if (dl > 1) { const st = Math.min(dl, 55 * 0.05); S.px += (dx / dl) * st; S.py += (dy / dl) * st; S.vx = (dx / dl) * 55; S.vy = (dy / dl) * 55; } else T.stand();
        if (s.state === 'coil' && tc == null) tc = t;
        if (s.state === 'pstrike' && tc != null && tStr == null) tStr = t;
        if (s.state === 'go' && !hit && tc == null) fled = true;
        if (s.state === 'pstrike' && tc == null) res.noWarn++;
        if (S.vida < 100 && !hit) { hit = true; e0 = S.vida; if (tc == null) other = true; }
        if (T.Pc.playerSlow() < 1) { slow = true; holdN++; }
        return false;
      });
      if (tc != null) { res.coil++; if (tStr != null) res.telegraph.push(+(tStr - tc).toFixed(2)); }
      if (hit && other) res.other++;
      else if (hit) { res.hit++; if (Math.abs(e0 - (100 - PA.bite)) < 0.01) res.dmgOk++; if (slow) { res.slowSeen++; res.holds.push(holdN * 0.05); if (T.Pc.playerSlow() === 1) res.released++; } }
      if (tc == null && !fled && s.state === 'ambush') res.stayedHidden++;
    }
    res.telegraph.sort((a, b) => a - b); res.tMed = res.telegraph[res.telegraph.length >> 1]; res.holds.sort((a, b) => a - b); res.holdMed = res.holds[res.holds.length >> 1]; delete res.telegraph; delete res.holds;
    return res;`);
  console.log('  [16]', JSON.stringify(r));
  if (r.noSnake || r.noLand) ok(false, `16. cenário da sucuri não pôde ser montado (${JSON.stringify(r)})`);
  else {
    ok(r.coil >= r.n * 0.45 && r.coil <= r.n * 0.95, `16. jogador entra no alcance da sucuri escondida (com fome) e ela decide investir em ${r.coil}/${r.n} (${Math.round((r.coil / r.n) * 100)}%; esperado ~70%); nas demais ela não ataca`);
    ok(r.noWarn === 0, `16. nunca há bote sem o aviso de contração antes (${r.noWarn} botes sem aviso)`);
    ok(r.hit >= r.coil * 0.9, `16. o bote acerta o jogador parado ao alcance (${r.hit}/${r.coil} botes)`);
    ok(r.dmgOk === r.hit, `18/16. dano pelo sistema de energia existente = exatamente ${r.hit ? 14 : '?'} por bote (${r.dmgOk}/${r.hit})`);
    ok(r.slowSeen === r.hit && r.released === 0, `16. preso e retardado enquanto a sucuri persegue; parado, o jogador não escapa sozinho (${r.slowSeen}/${r.hit} retardados, ${r.released}/${r.hit} soltos; mediana ${r.holdMed} s)`);
    ok(r.tMed >= 0.3 && r.tMed <= 0.8, `16. tempo de reação (aviso antes do bote): mediana ${r.tMed} s (0,3–0,8 s)`);
    ok(r.other <= r.n - r.coil, `16. quando ela decide não atacar o jogador só leva, no máximo, a mordida de defesa já existente (${r.other} casos de ${r.n - r.coil}); mordida de bote só após o aviso`);
  }
}

/* ---------- 13b. o jogador escapa do bote da sucuri ---------- */
{
  const r = await J(`${SNAKE}
    if (!T.snake) return { noSnake: 1 };
    const { x0, y0 } = pool();
    let land = null; for (const d of [28, 30, 32, 26]) { land = landNear(x0, y0, d); if (land) break; }
    if (!land) return { noLand: 1 };
    const out = {};
    for (const mode of ['stand', 'away', 'side']) {
      const o = { n: 60, coil: 0, hit: 0 };
      for (let k = 0; k < o.n; k++) {
        T.seed(5200 + k); T.reset();
        const s = T.mk('anaconda', x0, y0, { state: 'ambush', hide: true, t: 300, hun: 0.95, expose: 0, cd: 0 });
        T.player(land[0], land[1]); S.vida = 100;
        const ang0 = Math.atan2(land[1] - y0, land[0] - x0);
        let tc = null;
        T.step(0.05, 6, (i, t) => {
          if (s.state === 'coil' && tc == null) tc = t;
          if (tc != null && t - tc >= 0.2 && mode === 'away') T.mv(ang0, 78, 0.05); // reage em 0,2 s e foge para longe
          else if (tc != null && t - tc >= 0.2 && mode === 'side') T.mv(ang0 + 1.57, 78, 0.05); // reage em 0,2 s e sai de lado
          else T.stand();
          return false;
        });
        if (tc != null) { o.coil++; if (S.vida < 100) o.hit++; }
      }
      out[mode] = o;
    }
    return out;`);
  console.log('  [13b]', JSON.stringify(r));
  if (!r.noSnake && !r.noLand) {
    ok(r.stand.coil >= 20 && r.stand.hit >= r.stand.coil * 0.9, `13. controle: quem fica parado leva o bote (${r.stand.hit}/${r.stand.coil})`);
    ok(r.side.hit <= r.side.coil * 0.5, `13. sair de lado ao ver o aviso (reação 0,2 s) evita o bote em ${r.side.coil - r.side.hit}/${r.side.coil} (o bote vai reto à posição de quando começou)`);
    ok(r.away.coil >= 20, `13. fugir em linha reta após o aviso: ${r.away.coil - r.away.hit}/${r.away.coil} escapam (informativo; o bote tem alcance curto de ~57 px)`);
  }
}

/* ---------- 15 e 17. camuflagem: difícil de ver, varia com o ambiente, nunca invisível ---------- */
{
  const r = await J(`${SNAKE}
    if (!T.snake) return { noSnake: 1 };
    const { x0, y0 } = pool();
    const CV = VDC.modules['rendering/Canvas'];
    const out = { camo: {}, diff: {} };
    const gx = T.home.x + 14 * TS, gy = T.home.y - 10 * TS, gtx = (gx / TS) | 0, gty = (gy / TS) | 0; // longe da casa e de árvores
    const patch = (fn) => { T.field(gtx, gty, 8); for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) fn((gty + a) * MW + gtx + b); };
    // prepara o cenário e devolve a sucuri já atualizada uma vez (jogador longe, sem interferir)
    const mkSnake = (x, y, o, prep, minute) => {
      T.reset(); prep && prep(); S.min = minute == null ? 360 : minute;
      const s = T.mk('anaconda', x, y, Object.assign({ state: 'idle', t: 99, hun: 0.1, cd: 0, expose: 0 }, o || {}));
      T.player(x + 900, y + 900); T.tick(0.05); return s;
    };
    // ---- 17: valores por ambiente (parada, de dia) ----
    out.camo.agua = +mkSnake(x0, y0).camo.toFixed(3);
    out.camo.mato_alto = +mkSnake(gx, gy, 0, () => patch((i) => { mato[i] = 255; })).camo.toFixed(3);
    out.camo.grama_rasteira = +mkSnake(gx, gy, 0, () => patch((i) => { mato[i] = 0; })).camo.toFixed(3);
    out.camo.areia = +mkSnake(gx, gy, 0, () => patch((i) => { ground[i] = SAND; })).camo.toFixed(3);
    out.camo.terra = +mkSnake(gx, gy, 0, () => patch((i) => { ground[i] = SOIL; })).camo.toFixed(3);
    out.camo.grama_dia = out.camo.grama_rasteira;
    out.camo.grama_noite = +mkSnake(gx, gy, 0, () => patch((i) => { mato[i] = 0; }), 800).camo.toFixed(3);
    out.camo.apos_atacar = +mkSnake(gx, gy, { expose: T.Eco.CAMO.exposeT }, () => patch((i) => { mato[i] = 0; })).camo.toFixed(3);
    { // em movimento: a camuflagem usa o estado de movimento do quadro anterior (mvL); força-o e lê depois de um quadro
      const s = mkSnake(x0, y0); s.mvL = true; T.tick(0.05); out.camo.nadando = +s.camo.toFixed(3);
      const g = mkSnake(gx, gy, 0, () => patch((i) => { mato[i] = 0; })); g.mvL = true; T.tick(0.05); out.camo.rastejando = +g.camo.toFixed(3);
    }
    // ---- 15: contraste visual REAL (pixels): renderiza com e sem a sucuri e mede a diferença numa janela em volta ----
    const diffAt = (label, x, y, prep, o) => {
      const s = mkSnake(x, y, o, prep);
      T.step(0.05, 0.2); T.player(x, y + 44); // o jogador só se aproxima para enquadrar a câmera; nenhum quadro de simulação depois
      const grab = () => { render(1234.5); const R = CV.RS, ctx = CV.ctx, cx = Math.round((x - wCam.x - 24) * R), cy = Math.round((y - wCam.y - 30) * R), w = Math.round(48 * R), h = Math.round(44 * R); return ctx.getImageData(cx, cy, w, h).data; };
      const withS = grab(); const sx = s.x, sy = s.y; s.x = -9000; s.y = -9000; const noS = grab(); s.x = sx; s.y = sy;
      let sum = 0, n = 0, nz = 0; for (let i = 0; i < withS.length; i += 4) { const d = (Math.abs(withS[i] - noS[i]) + Math.abs(withS[i + 1] - noS[i + 1]) + Math.abs(withS[i + 2] - noS[i + 2])) / 3; sum += d; n++; if (d > 12) nz++; }
      out.diff[label] = { mean: +(sum / n).toFixed(2), pct: +((nz / n) * 100).toFixed(1), camo: +s.camo.toFixed(2), state: s.state };
    };
    diffAt('escondida_na_agua', x0, y0, 0, { state: 'ambush', hide: true });
    diffAt('exposta_na_areia', gx, gy, () => patch((i) => { ground[i] = SAND; }), { expose: T.Eco.CAMO.exposeT });
    diffAt('parada_no_mato_alto', gx, gy, () => patch((i) => { mato[i] = 255; }));
    diffAt('parada_na_areia', gx, gy, () => patch((i) => { ground[i] = SAND; }));
    return out;`);
  console.log('  [15/17]', JSON.stringify(r));
  if (r.noSnake) ok(false, '15/17. sem sucuri para medir');
  else {
    const C = r.camo, D = r.diff;
    ok(C.agua > C.mato_alto && C.mato_alto > C.grama_rasteira && C.grama_rasteira > C.areia, `17. camuflagem varia com o ambiente: água ${C.agua} > mato alto ${C.mato_alto} > grama rasteira ${C.grama_rasteira} > areia ${C.areia} (terra ${C.terra})`);
    ok(C.grama_noite > C.grama_dia, `17. à noite a camuflagem é maior (${C.grama_noite} vs ${C.grama_dia} de dia)`);
    ok(C.nadando < C.agua && C.rastejando < C.grama_dia && C.apos_atacar < C.grama_dia * 0.2, `17. movendo-se (água ${C.nadando} < ${C.agua}; grama ${C.rastejando} < ${C.grama_dia}) ou logo após atacar (${C.apos_atacar} < ${C.grama_dia}) perde camuflagem`);
    ok(Math.max(...Object.values(C).filter((v) => typeof v === 'number')) < 1, `17. nunca invisível por padrão: camuflagem máxima ${Math.max(...Object.values(C).filter((v) => typeof v === 'number'))} < 1`);
    ok(D.escondida_na_agua.pct > 0.3, `17. escondida na água ainda aparece um pouco: ${D.escondida_na_agua.pct}% dos pixels da janela diferem (visível a quem olha de perto)`);
    ok(D.escondida_na_agua.mean < D.exposta_na_areia.mean * 0.6, `15. camuflada na água é bem mais difícil de ver que exposta na areia: diferença média ${D.escondida_na_agua.mean} vs ${D.exposta_na_areia.mean} (≤ 60%)`);
    ok(D.parada_no_mato_alto.mean < D.parada_na_areia.mean, `15/17. parada no mato alto se confunde mais que na areia: ${D.parada_no_mato_alto.mean} < ${D.parada_na_areia.mean}`);
  }
}

/* ---------- 18. ataques respeitam colisões, obstáculos, alcance e sistemas existentes ---------- */
{
  const r = await J(`${SETUP}
    const out = { snakeBlocked: { coil: 0, n: 40 }, penBites: { bites: 0, n: 30 }, maxLoss: 0, inside: { loss: 0 }, nonFinite: 0 };
    // (a) sucuri com pedra entre ela e o jogador
    if (T.snake) {
      const sh = (tx, ty) => ground[ty * MW + tx] === WATER && (WTc[ty * MW + tx] === 7 || WTc[ty * MW + tx] === 8);
      let x0 = T.snake.x, y0 = T.snake.y, best = 99; const sx = (x0 / TS) | 0, sy = (y0 / TS) | 0;
      for (let dy = -8; dy <= 8; dy++) for (let dx = -8; dx <= 8; dx++) { let all = true; for (let a = -1; a <= 1 && all; a++) for (let b = -1; b <= 1; b++) if (!sh(sx + dx + b, sy + dy + a)) { all = false; break; } if (all && Math.hypot(dx, dy) < best) { best = Math.hypot(dx, dy); x0 = (sx + dx) * TS + 8; y0 = (sy + dy) * TS + 8; } }
      let land = null; for (const d of [28, 30]) for (let ang = 0; ang < 6.28 && !land; ang += 0.2) { const x = x0 + Math.cos(ang) * d, y = y0 + Math.sin(ang) * d; const i = Math.floor(y / TS) * MW + Math.floor(x / TS); if (ground[i] !== WATER && !obj[i]) land = [x, y]; }
      if (land) for (let k = 0; k < out.snakeBlocked.n; k++) {
        T.seed(6100 + k); T.reset(); const s = T.mk('anaconda', x0, y0, { state: 'ambush', hide: true, t: 300, hun: 0.95, expose: 0, cd: 0 });
        T.player(land[0], land[1]); S.vida = 100;
        // pedra no tile do meio do caminho (quando possível) → bloqueia a linha de visão
        const mx = Math.floor(((x0 + land[0]) / 2) / TS), my = Math.floor(((y0 + land[1]) / 2) / TS);
        const sxt = Math.floor(x0 / TS), syt = Math.floor(y0 / TS), lxt = Math.floor(land[0] / TS), lyt = Math.floor(land[1] / TS);
        const old = obj[my * MW + mx]; if ((mx !== sxt || my !== syt) && (mx !== lxt || my !== lyt)) obj[my * MW + mx] = ROCK;
        let c = false; T.step(0.05, 8, () => { if (s.state === 'coil' || s.state === 'pstrike') c = true; T.stand(); });
        if (c && (mx !== sxt || my !== syt) && (mx !== lxt || my !== lyt)) out.snakeBlocked.coil++;
        obj[my * MW + mx] = old;
      }
    }
    // (b) jogador DENTRO de um cercado, onça faminta fora: não alcança nem morde
    for (let k = 0; k < out.penBites.n; k++) {
      const { j, c, tx, ty } = setup(6600 + k, { hun: 0.95, dist: 90 });
      for (let x = tx - 2; x <= tx + 2; x++) { obj[(ty - 2) * MW + x] = FENCE; obj[(ty + 2) * MW + x] = FENCE; }
      for (let y = ty - 2; y <= ty + 2; y++) { obj[y * MW + tx - 2] = FENCE; obj[y * MW + tx + 2] = FENCE; }
      T.step(0.05, 40, () => { T.stand(); return S.vida < 100; });
      if (S.vida < 100) out.penBites.bites++;
    }
    // (c) perda máxima por investida = mordidas × dano configurado; (d) dentro de casa não há dano
    const PP = T.Eco.PLAYER_PREY.jaguar;
    for (let k = 0; k < 30; k++) { const { j } = setup(7100 + k, { hun: 0.95, dist: 90 }); T.step(0.05, 14, () => { T.stand(); }); out.maxLoss = Math.max(out.maxLoss, 100 - S.vida); }
    for (let k = 0; k < 10; k++) { const { j } = setup(7400 + k, { hun: 0.95, dist: 20 }); S.inside = true; T.step(0.05, 10, () => { T.stand(); }); out.inside.loss += 100 - S.vida; S.inside = false; }
    out.bites = PP.bites; out.bite = PP.bite; out.cap = PP.bites * PP.bite;
    return out;`);
  console.log('  [18]', JSON.stringify(r));
  ok(r.snakeBlocked.coil === 0, `18. sucuri NÃO ataca com pedra entre ela e o jogador (${r.snakeBlocked.coil}/${r.snakeBlocked.n} botes)`);
  ok(r.penBites.bites === 0, `18. onça não morde jogador protegido por cerca (${r.penBites.bites}/${r.penBites.n})`);
  ok(r.maxLoss > 0, `18. investida da onça causa dano (sem limite de mordidas: persegue até o jogador escapar); máx ${r.maxLoss}`);
  ok(r.inside.loss === 0, `18. dentro de casa não há dano (${r.inside.loss})`);
}

/* ---------- 18b. vida/morte/respawn do jogo continuam: energia 0 → desmaia e acorda no dia seguinte ---------- */
{
  await run(p, `(() => { ${SETUP}; const { j } = setup(8000, { hun: 0.95, dist: 60, energy: 8 }); globalThis.__T18 = { day: S.day }; T.step(0.05, 60, () => { T.stand(); return S.vida <= 0; }); return S.vida; })()`);
  const e0 = await run(p, `S.vida`);
  const killer = await run(p, `window.NT_KILL || 0`);
  await p.waitForTimeout(2600); // 1,1 s do desmaio + 0,5 s do fade + folga
  const after = await J(`return { day: S.day, d0: globalThis.__T18.day, energy: S.vida, sleeping, toast: (document.querySelector('#toast, .toast')?.textContent || '').slice(0, 80) };`);
  console.log('  [18b]', JSON.stringify({ e0, killer, after }));
  ok(e0 === 0 && killer === 'A onça', `18. a onça derruba o jogador (energia 0, causa registrada: "${killer}")`);
  ok(after.day === after.d0 + 1 && after.energy === 100, `18. respawn existente preservado: acorda no dia seguinte (dia ${after.d0} → ${after.day}) com energia ${after.energy}`);
}

/* ---------- 19. vários animais + jogador: sem ataques contraditórios nem custo excessivo ---------- */
{
  const r = await J(`${SETUP}
    const res = { n: 6, maxHunters: 0, stuckFrames: 0, ms: [], bites: 0, flips: 0 };
    const HUNT_ST = ['pstalk', 'pchase', 'pattack', 'coil', 'pstrike', 'phold'];
    for (let k = 0; k < res.n; k++) {
      T.seed(9100 + k); T.reset(); const tx = (T.home.x / TS) | 0, ty = ((T.home.y / TS) | 0) - 4; T.field(tx, ty, 16); const c = T.C;
      T.player(c.x, c.y); S.vida = 100;
      const preds = [];
      for (let i = 0; i < 3; i++) preds.push(T.mk('jaguar', c.x + (i - 1) * 70, c.y - 90 - i * 10, { hun: 0.95, sex: i % 2 ? 'm' : 'f', hx: c.x, hy: c.y }));
      if (T.snake) {}
      preds.push(T.mk('fox', c.x + 60, c.y + 50, { hun: 0.8 }));
      for (let i = 0; i < 12; i++) T.mk(['deer', 'boar', 'hare'][i % 3], c.x + ((i * 37) % 260) - 130, c.y + ((i * 53) % 200) - 100, { state: 'forage', t: 20 });
      let swim = 0;
      for (let i = 0; i < 1200; i++) { // 60 s: o jogador anda em círculo, para um pouco, anda de novo
        const ph = (i * 0.05) % 20;
        if (ph < 8) T.mv(ph * 0.4, 50, 0.05); else if (ph < 14) T.stand(); else T.mv(-ph, 70, 0.05);
        const t0 = performance.now(); T.tick(0.05); res.ms.push(performance.now() - t0);
        const hunters = preds.filter((a) => a.sp === 'jaguar' && a.state !== 'dead' && HUNT_ST.includes(a.state)).length;
        res.maxHunters = Math.max(res.maxHunters, hunters);
        for (const a of preds) if (!isFinite(a.x) || !isFinite(a.y)) res.nan = 1;
        if (S.vida < 100) { res.bites++; S.vida = 100; } // conta e "cura" para continuar o teste
        if (S.px < 40 || S.py < 40 || S.px > 1500 || S.py > 1500) { T.player(c.x, c.y); }
      }
    }
    res.ms.sort((a, b) => a - b); res.mean = res.ms.reduce((a, b) => a + b, 0) / res.ms.length; res.p95 = res.ms[Math.floor(res.ms.length * 0.95)]; res.max = res.ms[res.ms.length - 1]; delete res.ms;
    return res;`);
  console.log('  [19]', JSON.stringify(r));
  ok(r.maxHunters <= 1, `19. no máximo 1 onça caça o jogador por vez (máx simultâneo medido: ${r.maxHunters}) — sem ataques múltiplos simultâneos`);
  ok(!r.nan, `19. sem NaN/posições inválidas com vários predadores`);
  ok(r.p95 < 6, `19. custo por quadro com 3 onças + raposa + 12 presas + jogador: média ${r.mean.toFixed(2)} ms, p95 ${r.p95.toFixed(2)} ms, máx ${r.max.toFixed(1)} ms`);
}

console.log('erros de página:', errs.length ? errs.slice(0, 5) : 'nenhum');
ok(errs.length === 0, 'sem erros de página/console durante os cenários 11–19');
await close();
