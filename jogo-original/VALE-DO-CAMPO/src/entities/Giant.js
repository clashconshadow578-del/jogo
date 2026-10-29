/**
 * Gigante triste (golem de pedra com grama e pássaros). ATENÇÃO: já no original este sistema não estava conectado ao jogo (ggTick/giantEnt nunca são chamados); o código foi preservado.
 *
 * Origem: Vale_do_Campo_V64.html (s09)
 */

import { MH, MW, OXP, OYP, TS, VH, VW, WATER } from '../config/constants.js';
import { S, sleeping } from '../core/GameState.js';
import { ctx } from '../rendering/Canvas.js';
import { SPR } from '../rendering/Sprites.js';
import { assetUrl } from '../utils/assets.js';
import { INST } from '../world/Instances.js';
import { wCam } from '../world/WaterSystem.js';
import { ground } from '../world/World.js';

/* ============ GIGANTE TRISTE: golem de pedra, grama no topo, raízes embaixo, pássaros em volta ============ */
const GG = { x: 0, y: 0, tx: 0, ty: 0, st: 'init', t: 2, ph: 0 };

const GG_BIRDS = [
  ['#3b4a5a', 1],
  ['#8a4f3a', -1],
  ['#e6dfcf', 1],
  ['#4a5f3a', -1],
  ['#5a4a6a', 1],
];

function ggFree(x, y) {
  const tx = Math.floor(x / TS),
    ty = Math.floor(y / TS);
  if (tx < 3 || ty < 3 || tx >= MW - 3 || ty >= MH - 3) return false;
  if (ground[ty * MW + tx] === WATER) return false;
  return Math.hypot(x - (278 + OXP), y - (176 + OYP)) > 190;
} // não pisa na água nem na casa

function ggSpawn() {
  for (let i = 0; i < 60; i++) {
    const a = Math.random() * 6.283,
      r = 420 + Math.random() * 300,
      x = 278 + OXP + Math.cos(a) * r,
      y = 176 + OYP + Math.sin(a) * r;
    if (ggFree(x, y)) {
      GG.x = x;
      GG.y = y;
      GG.st = 'idle';
      GG.t = 2;
      return;
    }
  }
}

function ggTick(dt) {
  if (!INST.homeAct) return;
  const G = GG;
  if (G.st === 'init') {
    ggSpawn();
    return;
  }
  if (sleeping) return;
  G.t -= dt;
  if (G.st === 'idle') {
    if (G.t <= 0) {
      const a = Math.random() * 6.283,
        r = 150 + Math.random() * 230,
        x = G.x + Math.cos(a) * r,
        y = G.y + Math.sin(a) * r;
      if (ggFree(x, y)) {
        G.tx = x;
        G.ty = y;
        G.st = 'walk';
      } else G.t = 0.3;
    }
    return;
  }
  const dx = G.tx - G.x,
    dy = G.ty - G.y,
    d = Math.hypot(dx, dy);
  if (d < 4) {
    G.st = 'idle';
    G.t = 4 + Math.random() * 8;
    return;
  }
  const step = Math.min(9 * dt, d),
    ux = dx / d,
    uy = dy / d,
    nx = G.x + ux * step,
    ny = G.y + uy * step; // 9 px/s: bem devagar
  if (!ggFree(nx, ny) || !ggFree(nx + ux * 24, ny + uy * 24)) {
    G.st = 'idle';
    G.t = 1.5;
    return;
  }
  G.x = nx;
  G.y = ny;
  G.ph += step * 0.09;
  G.row = Math.abs(ux) > Math.abs(uy) ? (ux > 0 ? 2 : 1) : uy > 0 ? 0 : 3;
}

function giantEnt(ents) {
  const G = GG;
  if (G.st === 'init' || S.inside) return;
  if (G.x < wCam.x - 190 || G.x > wCam.x + VW + 190 || G.y < wCam.y - 60 || G.y > wCam.y + VH + 340) return;
  const k = ggK();
  ents.push({ k: G.y, sh: [G.x, G.y, Math.round(96 * k), Math.round(120 * k), 'giant'], draw: drawGiant });
}

function ggK() {
  const m = SPR.house;
  return m && m.ready ? (2 * m.h) / 130 : 1.6;
} // altura = 2x a da casa

function ggTufts(c, cx, cy, rx, ry, n, t, wind, seed) {
  // tufos de grama balançando sobre uma elipse
  for (let i = 0; i < n; i++) {
    const u = -1 + (2 * (i + 0.5)) / n,
      x = cx + u * rx,
      yb = cy - ry * Math.sqrt(Math.max(0, 1 - u * u)),
      hh = 5 + ((seed + i * 37) % 7),
      sw = Math.sin(t * 1.5 + i * 0.8 + seed) * (1.5 + wind * 3);
    c.fillStyle = i % 2 ? '#4f9a3c' : '#6ab552';
    c.beginPath();
    c.moveTo(x - 2.2, yb + 1);
    c.lineTo(x + sw, yb - hh);
    c.lineTo(x + 2.2, yb + 1);
    c.fill();
  }
}

const GOLEM_IMG = new Image();

function drawGiant() {
  const G = GG,
    t = performance.now() / 1000,
    k = ggK(),
    walk = G.st === 'walk';
  const bob = walk ? Math.abs(Math.sin(G.ph)) * 2.5 : Math.sin(t * 1.1) * 0.8;
  const gx = Math.round(G.x),
    gy = Math.round(G.y);
  const row = G.row || 0,
    col = walk ? Math.floor(t * 4) % 4 : 0; // passada animada enquanto anda
  const S = (5 * k) / 1.6,
    dw = Math.round(32 * S),
    dh = Math.round(32 * S);
  ctx.save();
  // sombra no chão (duas camadas: sombra forte sob o corpo e penumbra ao redor)
  const sh = 1 - bob * 0.03;
  ctx.fillStyle = 'rgba(20,28,14,.18)';
  ctx.beginPath();
  ctx.ellipse(gx, gy, 60 * k * sh, 19 * k * sh, 0, 0, 6.283);
  ctx.fill();
  ctx.fillStyle = 'rgba(20,28,14,.34)';
  ctx.beginPath();
  ctx.ellipse(gx, gy, 44 * k * sh, 13 * k * sh, 0, 0, 6.283);
  ctx.fill();
  if (GOLEM_IMG.complete && GOLEM_IMG.naturalWidth) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      GOLEM_IMG,
      col * 32,
      row * 32,
      32,
      32,
      gx - Math.round(dw / 2),
      Math.round(gy - dh * 0.875 - bob),
      dw,
      dh,
    ); // pés (y=28/32) pousam em G.y
  }
  ctx.restore();
  // pássaros voando em círculos sobre ele
  const hx = G.x,
    hy = G.y - bob * k - 150 * k;
  for (let i = 0; i < GG_BIRDS.length; i++) {
    const s = GG_BIRDS[i][1],
      ang = t * (0.55 + i * 0.08) * s + i * 1.26,
      rx = (70 + i * 14) * k * 0.7,
      ry = (16 + i * 5) * k * 0.55;
    const bx = Math.round(hx + Math.cos(ang) * rx),
      by = Math.round(hy + Math.sin(ang) * ry - 8 + Math.sin(t * 3 + i) * 4),
      face = -Math.sin(ang) * s > 0 ? 1 : -1,
      fl = Math.sin(t * 16 + i * 2),
      c = GG_BIRDS[i][0];
    ctx.fillStyle = c;
    ctx.fillRect(bx - 2, by - 1, 5, 3);
    ctx.fillRect(bx + face * 3 - 1, by - 2, 3, 3);
    ctx.fillStyle = '#ffd54a';
    ctx.fillRect(bx + face * 5, by - 1, 1, 1);
    ctx.strokeStyle = c;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(bx - 1, by - 1);
    ctx.lineTo(bx - 5, by - 2 - fl * 4);
    ctx.moveTo(bx + 1, by - 1);
    ctx.lineTo(bx + 5, by - 2 - fl * 4);
    ctx.stroke();
  }
}

export function loadGolemSprite() {
  GOLEM_IMG.src = assetUrl('sprites/characters/golem.webp');
}

export { GG };
