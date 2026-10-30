/**
 * Movimento de entidades: sorteio ponderado, giro suave, passo com desvio de obstáculos, linha de visão e busca de caminho (A* em grade).
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { MH, MW, TS } from '../../config/constants.js';
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

// Caminho por tiles (BFS) + suavização por linha de visão -> trajetos naturais, sem "andar em grade"
function findPath(x0, y0, x1, y1, canF) {
  const sx = Math.floor(x0 / TS),
    sy = Math.floor(y0 / TS),
    gx = Math.floor(x1 / TS),
    gy = Math.floor(y1 / TS);
  if (solid(gx, gy)) return null;
  const bx0 = Math.min(sx, gx) - 45,
    bx1 = Math.max(sx, gx) + 45,
    by0 = Math.min(sy, gy) - 45,
    by1 = Math.max(sy, gy) + 45;
  // Dijkstra em grade: o tile custa menos em trilha batida e mais em mato fechado (world/Trails.js), então o caminho
  // segue as trilhas e contorna o mato alto. Num terreno liso é o mesmo trajeto de antes (todos os custos = 1).
  const prev = new Int32Array(MW * MH).fill(-2),
    dist = new Float32Array(MW * MH).fill(Infinity),
    heap = [[0, sy * MW + sx]];
  prev[heap[0][1]] = -1;
  dist[heap[0][1]] = 0;
  const push = (d, c) => {
    let k = heap.push([d, c]) - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (heap[p][0] <= heap[k][0]) break;
      [heap[p], heap[k]] = [heap[k], heap[p]];
      k = p;
    }
  };
  const pop = () => {
    const top = heap[0],
      last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      for (let k = 0; ; ) {
        const l = 2 * k + 1,
          r = l + 1;
        let m = k;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k], heap[m]];
        k = m;
      }
    }
    return top;
  };
  while (heap.length) {
    const [cd, c] = pop();
    if (cd > dist[c]) continue;
    const cx = c % MW,
      cy = (c / MW) | 0;
    if (cx === gx && cy === gy) break;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = cx + dx,
        ny = cy + dy;
      if (nx < bx0 || nx > bx1 || ny < by0 || ny > by1 || solid(nx, ny)) continue;
      const n = ny * MW + nx,
        nd = cd + tilePathCost(n);
      if (nd >= dist[n]) continue;
      dist[n] = nd;
      prev[n] = c;
      push(nd, n);
    }
  }
  const g = gy * MW + gx;
  if (prev[g] === -2) return null;
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
