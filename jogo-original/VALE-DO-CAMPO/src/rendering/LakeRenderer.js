/**
 * Margens arredondadas da água (autotile 16x16 gerado por código, por tipo de margem) e profundidade dos lagos (água mais escura no meio).
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { BED, FORD, MH, MW, SAND, SCREE, SNOWG, STONE, TS, WATER } from '../config/constants.js';
import { ctx } from './Canvas.js';
import { hash2 } from '../utils/MathUtils.js';
import { LEGACY_GROUND } from '../config/groundStyle.js';
import { ground } from '../world/World.js';

/* ============ LAGO ARREDONDADO (autotile 16x16 procedural) ============ */
const LAKE_C = {};

const SHORE_PAL = [
  // [contorno, borda interna x3, borda externa x3, avanco na agua x3, brilho]
  [
    '#17241a',
    ['#8a9a68', '#5b704a', '#3b4d36'],
    LEGACY_GROUND ? ['#3a8a3a', '#4c983c', '#2f7a34'] : ['#71833b', '#96a04a', '#5f7436'],
    LEGACY_GROUND ? ['#4c983c', '#69bc4b', '#9cda65'] : ['#96a04a', '#b2ba57', '#c8cc5e'],
    '#8aa854',
  ],
  [
    '#8a7b50',
    ['#cdbb86', '#bfae7a', '#a89a6c'],
    ['#e0d198', '#e8d9a2', '#d9c98f'],
    ['#e8d9a2', '#d9c98f', '#f1e5b5'],
    '#f0e3ad',
  ],
  [
    '#1f2226',
    ['#8d9296', '#6f747a', '#585d63'],
    ['#9a9a94', '#8a857c', '#7a766e'],
    ['#8a857c', '#7a766e', '#9a9a94'],
    '#b5b8bc',
  ],
  [
    '#9fb4c8',
    ['#e9f1f8', '#d8e6f1', '#c4d6e6'],
    ['#f2f7fb', '#eaf2f8', '#e0ebf4'],
    ['#eaf2f8', '#e0ebf4', '#f2f7fb'],
    '#ffffff',
  ],
];

function lakeSprite(m, v, kind) {
  const k = ((kind << 9) | m) * 4 + v;
  if (LAKE_C[k]) return LAKE_C[k];
  const P = SHORE_PAL[kind],
    pk = (a, n) => (n > 0.55 ? a[0] : n > 0.25 ? a[1] : a[2]);
  const cw = (m >> 4) & 1,
    W = (dx, dy) => (m >> ((dy + 1) * 3 + dx + 1)) & 1,
    N = 24,
    O = 4;
  const F = (px, py) => {
    const cx = (px - 8) / 16,
      cy = (py - 8) / 16,
      x0 = Math.floor(cx),
      y0 = Math.floor(cy),
      u = cx - x0,
      w = cy - y0;
    return (
      W(x0, y0) * (1 - u) * (1 - w) +
      W(x0 + 1, y0) * u * (1 - w) +
      W(x0, y0 + 1) * (1 - u) * w +
      W(x0 + 1, y0 + 1) * u * w
    );
  };
  const inW = [];
  for (let y = 0; y < N; y++) {
    inW[y] = [];
    for (let x = 0; x < N; x++) {
      const px = x - O,
        py = y - O,
        nz = hash2(((px % 16) + 16) % 16, ((py % 16) + 16) % 16);
      inW[y][x] = F(px, py) > 0.64 + (nz - 0.5) * 0.12;
    }
  }
  const dist = (x, y) => {
    const t = inW[y][x];
    let b = 5;
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const xx = x + dx,
          yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= N || yy >= N || inW[yy][xx] === t) continue;
        const d = Math.hypot(dx, dy);
        if (d < b) b = d;
      }
    return b;
  };
  const c = document.createElement('canvas');
  c.width = c.height = TS;
  const g = c.getContext('2d');
  for (let y = 0; y < TS; y++)
    for (let x = 0; x < TS; x++) {
      const t = inW[y + O][x + O],
        d = dist(x + O, y + O),
        n = hash2(x * 7 + v * 31 + m, y * 13 + v * 5);
      let col = null;
      if (t) {
        col = d <= 1.2 ? '#14385c' : d <= 2.4 ? '#235d96' : cw ? null : '#2f75b4';
      } else {
        col =
          d <= 1.2
            ? P[0]
            : d <= 3.3
              ? pk(P[1], n)
              : d <= 4.3
                ? pk(P[2], n)
                : cw
                  ? n > 0.8
                    ? P[3][0]
                    : n < 0.1
                      ? P[3][2]
                      : P[3][1]
                  : null;
        if (!t && d > 1.2 && d <= 3.3 && !inW[y + O - 1][x + O] && inW[y + O + 2][x + O]) col = P[4];
      } // luz no topo das pedras
      if (col) {
        g.fillStyle = col;
        g.fillRect(x, y, 1, 1);
      }
    }
  return (LAKE_C[k] = c);
}

function shoreKind(tx, ty) {
  const c = [0, 0, 0, 0];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const X = tx + dx,
        Y = ty + dy;
      if (X < 0 || Y < 0 || X >= MW || Y >= MH) continue;
      const g = ground[Y * MW + X];
      if (g === WATER || g === FORD) continue;
      c[g === SAND ? 1 : g === SCREE || g === STONE || g === BED ? 2 : g === SNOWG ? 3 : 0]++;
    }
  let k = 0;
  for (let j = 1; j < 4; j++) if (c[j] > c[k]) k = j;
  return k;
}

function lakeEdge(tx, ty) {
  const me = ground[ty * MW + tx];
  if (me === FORD) return;
  const wf = me === WATER;
  let m = 0;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const X = tx + dx,
        Y = ty + dy;
      if (X >= 0 && Y >= 0 && X < MW && Y < MH) {
        const g = ground[Y * MW + X];
        if (g === WATER || (wf && g === FORD)) m |= 1 << ((dy + 1) * 3 + dx + 1);
      }
    }
  if (m === 0 || m === 511) return;
  ctx.drawImage(lakeSprite(m, (hash2(tx, ty) * 3) | 0, shoreKind(tx, ty)), tx * TS, ty * TS);
}

/* ============ DESENHO DE TILES E OBJETOS ============ */

/* ===== Profundidade do lago: quanto maior o lago, mais escura a água do meio ===== */
const LKD = new Float32Array(MW * MH);
let lkdT = -99,
  lkdOn = false;

function lakeDepthTick(t) {
  if (t - lkdT < 2) return;
  lkdT = t;
  let x0 = MW,
    x1 = -1,
    y0 = MH,
    y1 = -1;
  for (let y = 0; y < MH; y++) {
    const r = y * MW;
    for (let x = 0; x < MW; x++)
      if (ground[r + x] === WATER) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  }
  if (x1 < 0) {
    LKD.fill(0);
    lkdOn = false;
    return;
  }
  x0 = Math.max(1, x0 - 2);
  y0 = Math.max(1, y0 - 2);
  x1 = Math.min(MW - 2, x1 + 2);
  y1 = Math.min(MH - 2, y1 + 2);
  const bw = x1 - x0 + 1,
    bh = y1 - y0 + 1,
    D = new Float32Array(bw * bh),
    lab = new Int32Array(bw * bh),
    I = (x, y) => (y - y0) * bw + (x - x0);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) D[I(x, y)] = ground[y * MW + x] === WATER ? 999 : 0;
  for (let y = y0 + 1; y <= y1; y++)
    for (let x = x0 + 1; x <= x1 - 1; x++) {
      const k = I(x, y);
      if (!D[k]) continue;
      D[k] = Math.min(D[k], D[k - 1] + 1, D[k - bw] + 1, D[k - bw - 1] + 1.414, D[k - bw + 1] + 1.414);
    }
  for (let y = y1 - 1; y >= y0; y--)
    for (let x = x1 - 1; x >= x0 + 1; x--) {
      const k = I(x, y);
      if (!D[k]) continue;
      D[k] = Math.min(D[k], D[k + 1] + 1, D[k + bw] + 1, D[k + bw + 1] + 1.414, D[k + bw - 1] + 1.414);
    }
  // cada lago (componente conectada) tem a sua profundidade máxima
  const st = [];
  let nl = 0;
  const mx = [0];
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const k = I(x, y);
      if (!D[k] || lab[k]) continue;
      nl++;
      mx[nl] = 0;
      lab[k] = nl;
      st.push(k);
      while (st.length) {
        const q = st.pop();
        if (D[q] > mx[nl]) mx[nl] = D[q];
        for (const n of [q - 1, q + 1, q - bw, q + bw])
          if (D[n] && !lab[n]) {
            lab[n] = nl;
            st.push(n);
          }
      }
    }
  const F = new Float32Array(bw * bh);
  for (let k = 0; k < F.length; k++) {
    if (!D[k]) continue;
    const m = mx[lab[k]],
      sf = Math.max(0, Math.min(1, (m - 1.2) / 7)),
      dn = Math.min(1, D[k] / Math.max(1, m));
    F[k] = Math.pow(dn, 0.85) * (0.3 + 0.7 * sf);
  }
  // suaviza (2 passadas de média 3x3) para não aparecerem degraus de tile
  const G = new Float32Array(bw * bh);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 1; y < bh - 1; y++)
      for (let x = 1; x < bw - 1; x++) {
        const k = y * bw + x;
        G[k] =
          (F[k] * 4 +
            F[k - 1] +
            F[k + 1] +
            F[k - bw] +
            F[k + bw] +
            (F[k - bw - 1] + F[k - bw + 1] + F[k + bw - 1] + F[k + bw + 1]) * 0.5) /
          10;
      }
    F.set(G);
  }
  LKD.fill(0);
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) if (ground[y * MW + x] === WATER) LKD[y * MW + x] = F[I(x, y)];
  lkdOn = true;
}

function lakeDepthDraw(tx, ty, x, y) {
  if (!lkdOn) return;
  const i = ty * MW + tx,
    c = LKD[i];
  const L = LKD[i - 1],
    R = LKD[i + 1],
    U = LKD[i - MW],
    Dn = LKD[i + MW],
    UL = LKD[i - MW - 1],
    UR = LKD[i - MW + 1],
    DL = LKD[i + MW - 1],
    DR = LKD[i + MW + 1];
  if (c < 0.015 && L < 0.015 && R < 0.015 && U < 0.015 && Dn < 0.015) return;
  const h = TS / 2;
  for (let sy = 0; sy < 2; sy++)
    for (let sx = 0; sx < 2; sx++) {
      const a = sx ? R : L,
        b = sy ? Dn : U,
        d = sx ? (sy ? DR : UR) : sy ? DL : UL,
        v = (9 * c + 3 * a + 3 * b + d) / 16;
      if (v < 0.02) continue;
      ctx.fillStyle = `rgba(4,22,56,${Math.min(0.68, v * 0.74).toFixed(3)})`;
      ctx.fillRect(x + sx * h, y + sy * h, h, h);
    }
}

/** Atualiza `lkdT` a partir de outros módulos (as ligações importadas são somente leitura). */
export function setLkdT(value) {
  lkdT = value;
  return value;
}

export { LKD, lakeDepthDraw, lakeDepthTick, lakeEdge, lkdT };
