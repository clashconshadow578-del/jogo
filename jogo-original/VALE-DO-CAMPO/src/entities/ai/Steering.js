/**
 * Movimento de entidades: sorteio ponderado, giro suave, passo com desvio de obstáculos, linha de visão e busca de caminho (A* em grade).
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { MH, MW, TS } from '../../config/constants.js';
import { blocked, solid } from '../../systems/CollisionSystem.js';

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
  sp *= e.lifeF || 1;
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
  const prev = new Int32Array(MW * MH).fill(-2),
    q = [sy * MW + sx];
  prev[q[0]] = -1;
  for (let h = 0; h < q.length; h++) {
    const c = q[h],
      cx = c % MW,
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
      const n = ny * MW + nx;
      if (prev[n] !== -2) continue;
      prev[n] = c;
      q.push(n);
    }
  }
  const g = gy * MW + gx;
  if (prev[g] === -2) return null;
  const pts = [];
  for (let c = g; c !== -1; c = prev[c]) pts.push([(c % MW) * TS + 8, ((c / MW) | 0) * TS + 8]);
  pts.reverse();
  pts[pts.length - 1] = [x1, y1];
  const free = canF || ((x, y) => !blocked(x, y)),
    out = [];
  let ax = x0,
    ay = y0,
    i = 0;
  while (i < pts.length) {
    let j = pts.length - 1;
    while (j > i && !losWith(free, ax, ay, pts[j][0], pts[j][1])) j--;
    out.push(pts[j]);
    ax = pts[j][0];
    ay = pts[j][1];
    i = j + 1;
  }
  return out;
}

export { findPath, losWith, moveEnt, turnTo, wpick };
