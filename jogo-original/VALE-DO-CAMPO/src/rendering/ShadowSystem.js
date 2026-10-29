/**
 * Sombras projetadas: silhuetas reais das sprites (árvores, plantações), volumes de casas e pessoas, sombras de contato.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { extensible } from '../core/extensions.js';
import { S } from '../core/GameState.js';
import { sunInfo } from '../core/TimeManager.js';
import { ctx } from './Canvas.js';
import { hash2 } from '../utils/MathUtils.js';

function castShadow(bx, by, w, hgt, sunS, e, alpha, kind = 'object') {
  if (alpha <= 0) return;
  const sun = sunInfo(6 + S.min / 60),
    len = Math.min(115, (hgt * 0.7) / (0.16 + sun.elevation));
  const dx = sun.dirX * len,
    dy = sun.dirY * len;
  ctx.save();
  ctx.fillStyle = '#1b2934';
  // Silhuetas projetadas por volumes com alturas independentes; sem manchas em linha.
  const shapes =
    kind === 'tree'
      ? [
          [0, -0.43, 0.21, 0.27],
          [-0.36, -0.71, 0.33, 0.33],
          [0.3, -0.76, 0.38, 0.36],
          [0, -0.95, 0.41, 0.38],
          [-0.38, -1.01, 0.27, 0.27],
          [0.43, -1.06, 0.25, 0.26],
          [0, -0.67, 0.34, 0.32],
        ]
      : kind === 'house'
        ? [
            [0, -0.6, 0.49, 0.43],
            [-0.32, -0.8, 0.28, 0.31],
            [0.32, -0.8, 0.28, 0.31],
            [0, -1, 0.56, 0.18],
          ]
        : kind === 'person'
          ? [
              [0, -0.22, 0.17, 0.18],
              [0, -0.6, 0.27, 0.31],
              [0, -0.96, 0.23, 0.22],
            ]
          : [[0, -0.6, 0.45, 0.4]];
  const strength = alpha * (kind === 'tree' ? 0.72 : 0.83);
  for (let pass = 2; pass >= 0; pass--) {
    ctx.globalAlpha = strength * (pass === 0 ? 0.53 : pass === 1 ? 0.2 : 0.09);
    const softness = pass * 1.15;
    for (const [ox, oy, rw, rh] of shapes) {
      const z = Math.abs(oy),
        sx = bx + ox * w + dx * z,
        sy = by + dy * z;
      ctx.beginPath();
      ctx.ellipse(sx, sy, Math.max(1.5, rw * w + softness), Math.max(1, rh * w * 0.48 + softness), 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.moveTo(bx - 2 - softness, by);
    ctx.lineTo(bx + 2 + softness, by);
    ctx.lineTo(bx + dx * 0.65 + 1, by + dy * 0.65);
    ctx.lineTo(bx + dx * 0.65 - 1, by + dy * 0.65);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

const CONTACT_FILL = [3, 2, 1].map((j) => `rgba(22,28,28,${0.075 + (4 - j) * 0.035})`);

function contactShadow(x, y, w) {
  // (só fillStyle muda aqui e todos os quadros o redefinem, então não precisa de save/restore)
  for (let j = 3, k = 0; j >= 1; j--, k++) {
    ctx.fillStyle = CONTACT_FILL[k];
    ctx.beginPath();
    ctx.ellipse(x, y, w * (0.38 + j * 0.1), w * (0.1 + j * 0.045), 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function hull(p) {
  p.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const L = [],
    U = [];
  for (const q of p) {
    while (L.length > 1 && cr(L[L.length - 2], L[L.length - 1], q) <= 0) L.pop();
    L.push(q);
  }
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (U.length > 1 && cr(U[U.length - 2], U[U.length - 1], q) <= 0) U.pop();
    U.push(q);
  }
  return L.slice(0, -1).concat(U.slice(0, -1));
}

function poly(c, p) {
  const h = hull(p);
  c.beginPath();
  c.moveTo(h[0][0], h[0][1]);
  for (let i = 1; i < h.length; i++) c.lineTo(h[i][0], h[i][1]);
  c.closePath();
  c.fill();
}

const CAN = [
  [-7, -15, 7],
  [5, -17, 8],
  [-1, -23, 9],
  [-8, -24, 6],
  [8, -25, 6],
  [0, -13, 8],
];

// Projeta a silhueta 3D do objeto no chão (vx,vy = deslocamento da sombra por pixel de altura; k = fração do comprimento)
const casterShadow = extensible(function casterShadow(c, s, vx, vy, k) {
  const x = s[0],
    y = s[1],
    w = s[2],
    H = s[3],
    kind = s[4],
    V = (z) => [vx * z * k, vy * z * k];
  if (kind === 'house') {
    const P = [];
    for (const [a, b] of [
      [x - 62, y - 18],
      [x + 62, y - 18],
      [x + 62, y],
      [x - 62, y],
    ]) {
      P.push([a, b]);
      const v = V(62);
      P.push([a + v[0], b + v[1]]);
    }
    for (const b of [y - 12, y]) {
      const v = V(84);
      P.push([x + v[0], b + v[1]]);
    }
    poly(c, P);
  } else if (kind === 'tree') {
    const m = s[5];
    c.lineWidth = 3;
    c.lineCap = 'round';
    c.strokeStyle = '#000';
    if (m && m.ready) {
      const hc = m.h * 0.62,
        e = V(hc * 0.7);
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + e[0], y + e[1]);
      c.stroke(); // sombra = silhueta real da copa, projetada
      const L = Math.hypot(vx * k * hc, vy * k * hc),
        n = Math.min(4, 1 + Math.ceil(L / 4));
      for (let q = 0; q < n; q++) {
        const v = V(hc * (0.55 + (0.5 * q) / Math.max(1, n - 1)));
        c.drawImage(m.sil, Math.round(x - m.w / 2 + v[0]), Math.round(y - m.h + 2 + v[1]));
      }
    } else {
      const e = V(14);
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + e[0], y + e[1]);
      c.stroke();
      const ang = Math.atan2(vy, vx);
      for (let j = 0; j < CAN.length; j++) {
        const [ox, oy, r] = CAN[j],
          v = V(-oy),
          seed = hash2(Math.floor(x / 16) * 11 + j, Math.floor(y / 16));
        c.beginPath();
        c.ellipse(
          x + ox * 0.8 + v[0] + (seed - 0.5) * 2,
          y + v[1],
          r * (0.9 + seed * 0.22),
          r * (0.75 + seed * 0.16),
          ang * 0.2,
          0,
          6.283,
        );
        c.fill();
      }
    }
  } else if (kind === 'crop') {
    const m = s[5];
    if (m && m.ready) {
      const n = m.h,
        st = Math.max(1, Math.ceil(Math.hypot(vx, vy) * k * 0.8));
      for (let r = 0; r < n; r++) {
        const z = (n - r) * 1.1,
          p = V(z);
        c.drawImage(m.sil, 0, r, m.w, 1, Math.round(x - m.w / 2 + p[0]), Math.round(y + p[1]), m.w, st);
      }
    }
  } else if (kind === 'person') {
    c.lineWidth = 4;
    c.lineCap = 'round';
    c.strokeStyle = '#000';
    const a = V(14),
      b = V(21);
    c.lineWidth = 5;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + a[0], y + a[1]);
    c.stroke();
    c.beginPath();
    c.arc(x + b[0], y + b[1], 4.5, 0, 6.283);
    c.fill();
  } else {
    const P = [],
      hw = w / 2;
    for (const [a, b] of [
      [x - hw, y - 3],
      [x + hw, y - 3],
      [x + hw, y],
      [x - hw, y],
    ]) {
      P.push([a, b]);
      const v = V(H * 0.8);
      P.push([a + v[0], b + v[1]]);
    }
    poly(c, P);
  }
});

export { casterShadow, contactShadow };
