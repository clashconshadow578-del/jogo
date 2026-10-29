/**
 * Percepção e memória dos animais: linha de visão (árvores, pedras e casas tapam; cercas não), detecção por
 * visão/audição, memória curta de ameaças e de presas perdidas (só posições, nunca referências a entidades vivas),
 * e a trava que impede vários predadores de atacarem o jogador ao mesmo tempo.
 *
 * Origem: novo (ecossistema vivo). Os parâmetros ficam em config/ecosystem.js.
 */

import { BIN, HOUSE, MH, MW, ROCK, TREE, TS } from '../../config/constants.js';
import { ATTN, ECO, MEM, PERC_DT, detects, huntOpportunity, rearFactor, sightRange, targetVisibility } from '../../config/ecosystem.js';
import { S } from '../../core/GameState.js';
import { obj } from '../../world/World.js';

/* ============ relógio e ambiente da simulação ============ */
const env = { t: 0, night: 0, coverAt: null, playerLit: false };

/** Segundos de simulação acumulados (só avança quando o jogo atualiza a fauna). */
export const ecoNow = () => env.t;

/** Contadores de custo (só leitura em testes): quantas avaliações de percepção/oclusão rodaram. */
export const percStats = { sense: 0, occ: 0 };

/** Chamado por updateFauna a cada quadro. `night` é nightF(h) (0 dia … 1 noite). */
export function ecoTick(dt, night) {
  env.t += dt;
  env.night = night;
}

/** Injeta consultas que dependem de módulos pesados (cobertura vegetal em x,y → 0..1; tocha acesa). */
export function setEcoHooks(h) {
  if (h.coverAt) env.coverAt = h.coverAt;
  if (h.playerLit) env.playerLit = h.playerLit;
}

export const ecoNight = () => env.night;

/** Cobertura vegetal (0..1) em x,y. */
export const coverAt = (x, y) => (env.coverAt ? env.coverAt(x, y) : 0);

/* ============ linha de visão ============ */
const OCC_TREE = 0.45;

/**
 * Quanto a paisagem tapa a visão entre dois pontos (0 = livre, 1 = totalmente tapada).
 * Pedra, casa e lixeira tapam tudo; cada árvore atravessada tapa 0,45; cercas e portões deixam ver.
 * Os tiles de origem e de destino não contam (quem observa/é observado pode estar encostado numa árvore).
 */
export function occlusion(x0, y0, x1, y1, objArr = obj, mw = MW, mh = MH) {
  percStats.occ++;
  const len = Math.hypot(x1 - x0, y1 - y0),
    n = Math.max(1, Math.ceil(len / 6)),
    t0x = Math.floor(x0 / TS),
    t0y = Math.floor(y0 / TS),
    t1x = Math.floor(x1 / TS),
    t1y = Math.floor(y1 / TS);
  let sum = 0,
    lx = t0x,
    ly = t0y;
  for (let k = 1; k < n; k++) {
    const f = k / n,
      tx = Math.floor((x0 + (x1 - x0) * f) / TS),
      ty = Math.floor((y0 + (y1 - y0) * f) / TS);
    if (tx === lx && ty === ly) continue;
    lx = tx;
    ly = ty;
    if ((tx === t1x && ty === t1y) || tx < 0 || ty < 0 || tx >= mw || ty >= mh) continue;
    const o = objArr[ty * mw + tx];
    if (o === ROCK || o === HOUSE || o === BIN) return 1;
    if (o === TREE) {
      sum += OCC_TREE;
      if (sum >= 1) return 1;
    }
  }
  return sum;
}

/** Linha de visão livre (oclusão < 0,5). */
export const hasLOS = (x0, y0, x1, y1, objArr = obj) => occlusion(x0, y0, x1, y1, objArr) < 0.5;

/* ============ o que cada animal mostra de si ============ */
/** Descritor do jogador como alvo de percepção. */
export function playerTarget() {
  const sp = Math.hypot(S.vx || 0, S.vy || 0);
  return {
    x: S.px,
    y: S.py,
    moving: sp > 6,
    running: sp > 68,
    stalking: false,
    frozen: false,
    cover: S.inside ? 1 : coverAt(S.px, S.py),
    camo: 0,
    lit: env.playerLit ? !!env.playerLit() : false,
  };
}

/** Descritor de um animal como alvo (para outro animal). `camo` vem de a.camo (sucuri). */
export function animalTarget(a) {
  const st = a.state,
    run = st === 'flee' || st === 'chase' || st === 'charge' || st === 'fly' || st === 'pchase';
  return {
    x: a.x,
    y: a.y,
    moving: !!a.mv,
    running: run && !!a.mv,
    stalking: st === 'stalk' || st === 'pstalk' || st === 'ambush' || st === 'investigate',
    frozen: st === 'freeze',
    cover: a.sp === 'hare' || a.sp === 'grouse' ? coverAt(a.x, a.y) : 0,
    camo: a.camo || 0,
    lit: false,
  };
}

/* ============ detecção ============ */
/**
 * O observador `o` (animal com .x .y .dir .sp .state) detecta o alvo `T` (descritor)?
 * `rangeBonus` (≥0) multiplica o alcance (ex.: ameaça que carrega um raio de medo próprio, em px, como a onça caçando).
 * Retorna { seen, heard, any, dist, occ, range }.
 */
export function senseTarget(o, T, rangeOverride) {
  percStats.sense++;
  const P = ECO[o.sp];
  const dx = T.x - o.x,
    dy = T.y - o.y,
    dist = Math.hypot(dx, dy);
  const base = rangeOverride != null ? rangeOverride : sightRange(o.sp, env.night, ATTN[o.state] != null ? ATTN[o.state] : 1);
  if (dist > Math.max(base * 1.9, P ? Math.max(P.hear, P.scent || 0, P.heat || 0) : 0) + 1)
    return { seen: false, heard: false, smelled: false, any: false, dist, occ: 0, range: base, eff: 0 };
  const occ = occlusion(o.x, o.y, T.x, T.y),
    // quem come/descansa vira a cabeça o tempo todo: a direção do olhar oscila ±~57° em torno do corpo (fases distintas por animal)
    look = o.state === 'alert' || o.state === 'freeze' ? 0 : Math.sin(env.t * 0.8 + (o.id || 0) * 1.7),
    dirE = (o.dir || 0) + look,
    cosF = dist > 0.001 ? (Math.cos(dirE) * dx + Math.sin(dirE) * dy) / dist : 1;
  const vis = targetVisibility(T),
    rear = rearFactor(cosF);
  const r = detects({ dist, range: base, vis, occlusion: occ, rear, hear: P ? P.hear : 0, loud: !!T.running });
  // olfato (predador com fome farejando) e sentido de calor (sucuri): alcance curto, atravessam a vegetação
  const scent = P && P.scent && o.hun != null && o.hun >= 0.5 && dist <= P.scent * (1 - 0.3 * occ),
    heat = P && P.heat && !T.cold && dist <= P.heat * (1 - 0.5 * occ);
  return {
    seen: r.seen,
    heard: r.heard,
    smelled: !!(scent || heat),
    any: r.any || !!(scent || heat),
    dist,
    occ,
    range: base,
    eff: base * vis * (1 - Math.min(1, occ)) * rear,
  };
}

/**
 * Avalia a oportunidade de caçar `p` (animal ou o jogador, `p.isPlayer`). Só considera o que o predador DETECTA
 * agora (visão/audição); retorna null se não detecta. `o`: { hunt, vPred, vPrey, value, counter, scanR?, driveMul? }.
 * A fome (pred.hun, 0..1) só entra no valor da presa; o interesse (hunt.drive) existe mesmo saciado.
 */
export function evalPrey(pred, p, o) {
  const T = p.isPlayer ? playerTarget() : animalTarget(p),
    s = senseTarget(pred, T);
  if (!s.any) return null;
  const alert = p.state === 'alert' || p.state === 'freeze' || p.state === 'flee' || p.state === 'fly' || p.state === 'alertp' ? 1 : 0;
  const ev = huntOpportunity({
    need: pred.hun,
    dist: s.dist,
    scanR: o.scanR || o.hunt.scanR,
    vPred: o.vPred,
    vPrey: o.vPrey,
    alert,
    stamina: pred.stam,
    value: o.value,
    counter: o.counter,
    cover: T.cover,
    drive: o.hunt.drive * (o.driveMul == null ? 1 : o.driveMul),
    riskAv: o.hunt.riskAv,
    fleeing: p.state === 'flee' || !!T.running,
  });
  return { p, sense: s, ev };
}

/**
 * Roda a cada PERC_DT (defasado por animal). Use: if (percTick(a, dt, 's')) { …testes de percepção… }.
 * `key` separa temporizadores independentes no mesmo animal (cada consumidor usa o seu).
 */
export function percTick(a, dt, key = '') {
  const f = '_pc' + key;
  if (a[f] == null) a[f] = ((a.id || 1) * 0.137) % PERC_DT;
  a[f] -= dt;
  if (a[f] > 0) return false;
  a[f] = a[f] < -PERC_DT ? PERC_DT : a[f] + PERC_DT;
  return true;
}

/* ============ memória (posições, com validade) ============ */
/**
 * Registra/atualiza uma lembrança. kind: 'threat' (onde vi um predador) | 'lost' (onde perdi a presa).
 * Cada animal guarda no máximo MEM.cap lembranças; lembranças do mesmo `id` (ou muito próximas) se fundem.
 */
export function memAdd(a, kind, x, y, id, extra) {
  const m = a.mem || (a.mem = []),
    ttl = kind === 'lost' ? MEM.lostTtl : MEM.threatTtl;
  let e = m.find((q) => q.kind === kind && (q.id === id || Math.hypot(q.x - x, q.y - y) < MEM.mergeR));
  if (!e) {
    if (m.length >= MEM.cap) {
      let oi = 0;
      for (let i = 1; i < m.length; i++) if (m[i].until < m[oi].until) oi = i;
      m.splice(oi, 1);
    }
    e = { kind };
    m.push(e);
  }
  e.x = x;
  e.y = y;
  e.id = id;
  e.until = env.t + ttl;
  if (extra) Object.assign(e, extra);
  return e;
}

/** Descarta o que expirou. */
export function memPrune(a) {
  const m = a.mem;
  if (!m || !m.length) return;
  for (let i = m.length - 1; i >= 0; i--) if (m[i].until <= env.t) m.splice(i, 1);
}

/** Lembrança mais recente do tipo (ou null). */
export function memFind(a, kind) {
  memPrune(a);
  let best = null;
  if (a.mem) for (const e of a.mem) if (e.kind === kind && (!best || e.until > best.until)) best = e;
  return best;
}

/** Existe lembrança de ameaça a menos de r px de (x,y)? Retorna a mais próxima ou null. */
export function memNear(a, x, y, r, kind = 'threat') {
  memPrune(a);
  let best = null,
    bd = r;
  if (a.mem)
    for (const e of a.mem)
      if (e.kind === kind) {
        const d = Math.hypot(e.x - x, e.y - y);
        if (d < bd) {
          bd = d;
          best = e;
        }
      }
  return best;
}

export function memClear(a, kind) {
  if (!a.mem) return;
  if (!kind) a.mem.length = 0;
  else a.mem = a.mem.filter((e) => e.kind !== kind);
}

/* ============ jogador como presa: trava de caça ============ */
const lock = { id: 0, until: 0, cool: 0 };

/** Só um predador por vez caça o jogador (os outros apenas observam). Renova a trava a cada chamada do dono. */
export function claimPlayerHunt(id, ttl = 2.2) {
  if (env.t < lock.cool) return false;
  if (lock.id && lock.id !== id && lock.until > env.t) return false;
  lock.id = id;
  lock.until = env.t + ttl;
  return true;
}

/** Quem está caçando o jogador agora (id) ou 0. */
export const playerHunter = () => (lock.until > env.t ? lock.id : 0);

export function releasePlayerHunt(id, cool = 0) {
  if (lock.id === id) lock.until = 0;
  if (cool > 0) lock.cool = Math.max(lock.cool, env.t + cool * 0.4);
}

/** Depois de ferir o jogador, ninguém volta a caçá-lo por `cool` s (evita ataques em sequência artificiais). */
export function playerHurtTruce(cool) {
  lock.cool = Math.max(lock.cool, env.t + cool);
  lock.until = 0;
}

/** Só para testes: zera relógio, ambiente e trava. */
export function resetEcology() {
  env.t = 0;
  env.night = 0;
  lock.id = 0;
  lock.until = 0;
  lock.cool = 0;
}

/** Efeitos temporários sobre o jogador causados por animais (não são salvos). `snareUntil`: preso pela sucuri até esse instante (ecoNow). */
export const playerFx = { snareUntil: 0, snareSlow: 1 };

/** Fator de velocidade do jogador devido a efeitos de animais (1 = normal). */
export const playerSlow = () => (playerFx.snareUntil > env.t ? playerFx.snareSlow : 1);
