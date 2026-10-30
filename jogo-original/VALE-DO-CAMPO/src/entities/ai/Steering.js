/**
 * Movimento de entidades: sorteio ponderado, giro suave, passo com desvio de obstáculos, linha de visão e busca de caminho (A* em grade).
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { MH, MW, TS } from '../../config/constants.js';
import { S } from '../../core/GameState.js';
import { blocked, solid } from '../../systems/CollisionSystem.js';
import { animalSpeed, tilePathCost } from '../../world/Trails.js';

const MAX_SUBSTEP = 3; // px por teste de colisão (um tile tem 16)

function wpick(o) {
  let s = 0;
  for (const [, w] of o) s += w;
  let r = Math.random() * s;
  for (const [k, w] of o) {
    if ((r -= w) <= 0) return k;
  }
  return o[0][0];
}

function turnTo(e, ang, dt) {
  const da = Math.atan2(Math.sin(ang - e.dir), Math.cos(ang - e.dir));
  e.dir += Math.max(-5 * dt, Math.min(5 * dt, da));
}

function moveEnt(e, tx, ty, sp, dt, can) {
  sp *= (e.lifeF || 1) * animalSpeed(e.x, e.y); // mato fechado freia, trilha batida acelera
  const dx = tx - e.x,
    dy = ty - e.y,
    d = Math.hypot(dx, dy);
  e.mv = false;
  if (d < 3) return true;
  const want = Math.atan2(dy, dx),
    da = Math.atan2(Math.sin(want - e.dir), Math.cos(want - e.dir));
  e.dir += Math.max(-7 * dt, Math.min(7 * dt, da));
  // Passo total dividido em pedaços de no máximo MAX_SUBSTEP px: com dt grande (recuperação da fazenda,
  // queda de FPS) o animal nunca "pula" uma cerca de 1 tile entre dois testes de colisão.
  const total = Math.min(d, sp * dt),
    n = Math.max(1, Math.ceil(total / MAX_SUBSTEP)),
    st = total / n;
  let moved = 0;
  for (let k = 0; k < n; k++) {
    const rx = tx - e.x,
      ry = ty - e.y,
      rd = Math.hypot(rx, ry);
    if (rd < 0.001) break;
    const s1 = Math.min(st, rd),
      vx = (rx / rd) * s1,
      vy = (ry / rd) * s1;
    if (can(e.x + vx, e.y + vy)) {
      e.x += vx;
      e.y += vy;
    } else if (Math.abs(vx) > 0.01 && can(e.x + vx, e.y)) e.x += vx;
    else if (Math.abs(vy) > 0.01 && can(e.x, e.y + vy)) e.y += vy;
    else break;
    moved += s1;
    e.mv = true;
  }
  e.step = (e.step || 0) + moved;
  e.stuck = e.mv ? 0 : (e.stuck || 0) + dt;
  return false;
}

function losWith(can, x0, y0, x1, y1) {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 4);
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    if (!can(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return false;
  }
  return true;
}

// Memória da busca (reaproveitada em toda chamada: nada é alocado por busca). `stamp` diz se o tile foi visto NESTA busca.
const N_TILES = MW * MH,
  stamp = new Uint32Array(N_TILES),
  prev = new Int32Array(N_TILES),
  dist = new Float64Array(N_TILES), // precisão dupla: com Float32 o arredondamento fazia um tile "melhorar" para sempre (loop infinito)
  HEAP_MAX = 1 << 17,
  heapK = new Float64Array(HEAP_MAX), // prioridade (custo até o tile + estimativa até o destino)
  heapC = new Int32Array(HEAP_MAX), // tile
  heapD = new Float64Array(HEAP_MAX); // custo até o tile (para descartar entradas velhas)
let gen = 0,
  heapN = 0;
// Caminhos que NÃO existem (alvo cercado): lembrados por um tempo DE JOGO (não do relógio real: o jogo também roda acelerado, ao dormir
// e nos testes). Galinhas e vacas atraídas por comida repetem a busca a cada quadro enquanto não há rota, e uma busca sem saída varre a
// área inteira (~1 ms): sem esta memória, vários bichos assim pesavam o quadro todo.
const noPath = new Map(),
  NO_PATH_MIN = 1.5; // minutos de jogo (~1,5 s no ritmo normal)
const gameClock = () => S.day * 10000 + S.min;

function heapPush(k, c, d) {
  if (heapN >= HEAP_MAX) return;
  let i = heapN++;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (heapK[p] <= k) break;
    heapK[i] = heapK[p];
    heapC[i] = heapC[p];
    heapD[i] = heapD[p];
    i = p;
  }
  heapK[i] = k;
  heapC[i] = c;
  heapD[i] = d;
}

// Tira o menor e devolve o tile (o custo fica em popD).
let popD = 0;
function heapPop() {
  const top = heapC[0];
  popD = heapD[0];
  const k = heapK[--heapN],
    c = heapC[heapN],
    d = heapD[heapN];
  let i = 0;
  for (;;) {
    let m = 2 * i + 1;
    if (m >= heapN) break;
    if (m + 1 < heapN && heapK[m + 1] < heapK[m]) m++;
    if (heapK[m] >= k) break;
    heapK[i] = heapK[m];
    heapC[i] = heapC[m];
    heapD[i] = heapD[m];
    i = m;
  }
  heapK[i] = k;
  heapC[i] = c;
  heapD[i] = d;
  return top;
}

// Caminho por tiles (A*) + suavização por linha de visão -> trajetos naturais, sem "andar em grade"
function findPath(x0, y0, x1, y1, canF) {
  const sx = Math.floor(x0 / TS),
    sy = Math.floor(y0 / TS),
    gx = Math.floor(x1 / TS),
    gy = Math.floor(y1 / TS);
  if (solid(gx, gy)) return null;
  const clock = gameClock(),
    nk = ((sy * MW + sx) << 14) ^ (gy * MW + gx), // chave da busca (tile de saída + tile de chegada)
    nf = noPath.get(nk);
  if (nf !== undefined && clock >= nf && clock - nf < NO_PATH_MIN) return null;
  const bx0 = Math.min(sx, gx) - 45,
    bx1 = Math.max(sx, gx) + 45,
    by0 = Math.min(sy, gy) - 45,
    by1 = Math.max(sy, gy) + 45;
  // A* em grade: o tile custa menos em trilha batida e mais em mato fechado (world/Trails.js), então o caminho
  // segue as trilhas e contorna o mato alto. Num terreno liso é o mesmo trajeto de antes (todos os custos = 1).
  // A estimativa (distância em tiles x o custo mínimo 0,5) nunca passa do custo real, então o resultado é o mesmo de um Dijkstra.
  if (++gen === 0xffffffff) {
    stamp.fill(0);
    gen = 1;
  }
  const start = sy * MW + sx,
    goal = gy * MW + gx,
    h = (x, y) => (Math.abs(x - gx) + Math.abs(y - gy)) * 0.5;
  stamp[start] = gen;
  prev[start] = -1;
  dist[start] = 0;
  heapN = 0;
  heapPush(h(sx, sy), start, 0);
  let guard = 0;
  while (heapN) {
    if (++guard > 120000) break; // trava de segurança (a área tem no máximo ~8 mil tiles): nunca deixa a página presa
    const c = heapPop(),
      cd = popD;
    if (cd > dist[c] + 1e-9) continue;
    if (c === goal) break;
    const cx = c % MW,
      cy = (c / MW) | 0;
    for (let q = 0; q < 4; q++) {
      const nx = cx + (q === 0 ? 1 : q === 1 ? -1 : 0),
        ny = cy + (q === 2 ? 1 : q === 3 ? -1 : 0);
      if (nx < bx0 || nx > bx1 || ny < by0 || ny > by1 || solid(nx, ny)) continue;
      const n = ny * MW + nx,
        nd = cd + tilePathCost(n);
      if (stamp[n] === gen && nd >= dist[n] - 1e-9) continue;
      stamp[n] = gen;
      dist[n] = nd;
      prev[n] = c;
      heapPush(nd + h(nx, ny), n, nd);
    }
  }
  const g = goal;
  if (stamp[g] !== gen) {
    if (noPath.size > 400) noPath.clear();
    noPath.set(nk, clock);
    return null;
  }
  const pts = [];
  for (let c = g; c !== -1; c = prev[c]) pts.push([(c % MW) * TS + 8, ((c / MW) | 0) * TS + 8]);
  pts.reverse();
  pts[pts.length - 1] = [x1, y1];
  const free = canF || ((x, y) => !blocked(x, y)),
    out = [],
    tileOf = (x, y) => Math.floor(y / TS) * MW + Math.floor(x / TS),
    cum = [0];
  for (let k = 1; k < pts.length; k++) cum[k] = cum[k - 1] + tilePathCost(tileOf(pts[k][0], pts[k][1]));
  // Custo de ir em linha reta de (ax,ay) a (bx,by): comprimento em tiles x custo médio dos tiles amostrados no meio.
  const cutCost = (ax, ay, bx, by) => {
    const len = Math.hypot(bx - ax, by - ay),
      n = Math.max(1, Math.ceil(len / 8));
    let c = 0;
    for (let k = 1; k <= n; k++) c += tilePathCost(tileOf(ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n));
    return (c / n) * (len / TS);
  };
  let ax = x0,
    ay = y0,
    i = 0;
  while (i < pts.length) {
    let j = pts.length - 1;
    // o atalho em linha reta só vale se não custar mais que o caminho por tiles (não corta por mato fechado para fugir da trilha)
    while (
      j > i &&
      !(
        losWith(free, ax, ay, pts[j][0], pts[j][1]) &&
        cutCost(ax, ay, pts[j][0], pts[j][1]) <= cum[j] - cum[Math.max(0, i - 1)] + 0.5
      )
    )
      j--;
    out.push(pts[j]);
    ax = pts[j][0];
    ay = pts[j][1];
    i = j + 1;
  }
  return out;
}

export { findPath, losWith, moveEnt, turnTo, wpick };
