/**
 * Poças de escoamento em pixel art (manchas contínuas entre tiles com borda clara e brilho).
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { MH, MW, TS, WATER } from '../../config/constants.js';
import { ctx } from '../../rendering/Canvas.js';
import { hash2 } from '../../utils/MathUtils.js';
import { wl } from './Hydrology.js';
import { ground } from '../World.js';

/* ===== Água de escoamento: poças orgânicas em pixel art (manchas contínuas entre tiles, borda clara, brilho) ===== */
const PD_N = 8,
  PD_C = TS / PD_N,
  PD_B = PD_N + 2,
  _pdF = new Float32Array(PD_B * PD_B);

function pdNoise(X, Y) {
  const L = 6,
    x0 = Math.floor(X / L),
    y0 = Math.floor(Y / L),
    fx = X / L - x0,
    fy = Y / L - y0,
    sx = fx * fx * (3 - 2 * fx),
    sy = fy * fy * (3 - 2 * fy);
  const a = hash2(x0, y0),
    b = hash2(x0 + 1, y0),
    c = hash2(x0, y0 + 1),
    d = hash2(x0 + 1, y0 + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function pdW(tx, ty) {
  return tx < 0 || ty < 0 || tx >= MW || ty >= MH ? 0 : ground[ty * MW + tx] === WATER ? 0 : wl[ty * MW + tx];
}

function pdNear(i, tx, ty) {
  return (
    wl[i] > 0.03 ||
    (tx > 0 && wl[i - 1] > 0.03) ||
    (tx < MW - 1 && wl[i + 1] > 0.03) ||
    (ty > 0 && wl[i - MW] > 0.03) ||
    (ty < MH - 1 && wl[i + MW] > 0.03) ||
    (tx > 0 && ty > 0 && wl[i - MW - 1] > 0.03) ||
    (tx < MW - 1 && ty > 0 && wl[i - MW + 1] > 0.03) ||
    (tx > 0 && ty < MH - 1 && wl[i + MW - 1] > 0.03) ||
    (tx < MW - 1 && ty < MH - 1 && wl[i + MW + 1] > 0.03)
  );
}

function drawPuddle(i, tx, ty, x, y, w, t) {
  const w00 = pdW(tx, ty),
    wl_ = pdW(tx - 1, ty),
    wr = pdW(tx + 1, ty),
    wu = pdW(tx, ty - 1),
    wd = pdW(tx, ty + 1),
    wul = pdW(tx - 1, ty - 1),
    wur = pdW(tx + 1, ty - 1),
    wdl = pdW(tx - 1, ty + 1),
    wdr = pdW(tx + 1, ty + 1),
    F = _pdF;
  let any = 0;
  for (let cy = -1; cy <= PD_N; cy++)
    for (let cx = -1; cx <= PD_N; cx++) {
      const gx = (cx + 0.5) / PD_N - 0.5,
        gy = (cy + 0.5) / PD_N - 0.5,
        ax = gx < 0 ? -gx : gx,
        ay = gy < 0 ? -gy : gy;
      const hx = gx < 0 ? wl_ : wr,
        hy = gy < 0 ? wu : wd,
        hxy = gx < 0 ? (gy < 0 ? wul : wdl) : gy < 0 ? wur : wdr;
      let v = (w00 * (1 - ax) + hx * ax) * (1 - ay) + (hy * (1 - ax) + hxy * ax) * ay;
      v = v * 1.25 + (pdNoise(tx * PD_N + cx, ty * PD_N + cy) - 0.5) * 0.045 - 0.03; // ruído de baixa frequência deforma a borda: mancha irregular
      F[(cy + 1) * PD_B + cx + 1] = v;
      if (v > 0 && cx >= 0 && cy >= 0 && cx < PD_N && cy < PD_N) any = 1;
    }
  if (!any) return;
  const tk = Math.floor(t * 2);
  for (let cy = 0; cy < PD_N; cy++)
    for (let cx = 0; cx < PD_N; cx++) {
      const k = (cy + 1) * PD_B + cx + 1,
        v = F[k];
      if (v <= 0) continue;
      const up = F[k - PD_B] > 0,
        dn = F[k + PD_B] > 0,
        lf = F[k - 1] > 0,
        rt = F[k + 1] > 0;
      if ((!up && !dn) || (!lf && !rt)) continue;
      const px = x + cx * PD_C,
        py = y + cy * PD_C;
      let col;
      if (!up || !lf)
        col = 'rgba(196,226,242,.86)'; // borda iluminada (cima/esquerda)
      else if (!dn || !rt)
        col = 'rgba(74,128,176,.88)'; // borda sombreada (baixo/direita)
      else if (v < 0.05)
        col = 'rgba(138,192,224,.80)'; // lâmina rasa
      else if (v < 0.13) col = 'rgba(104,166,208,.86)';
      else col = 'rgba(82,146,196,.9)'; // miolo mais fundo
      ctx.fillStyle = col;
      ctx.fillRect(px, py, PD_C, PD_C);
      if (up && lf && dn && rt && hash2(tx * PD_N + cx, ty * PD_N + cy) > 0.975) {
        ctx.fillStyle = 'rgba(222,242,255,.55)';
        ctx.fillRect(px, py, PD_C, 1);
      } // reflexos de céu fixos
      else if (up && lf && dn && rt && ((tx * 5 + ty * 3 + cx * 2 + cy * 7 + tk) & 63) === 0) {
        ctx.fillStyle = 'rgba(235,248,255,.7)';
        ctx.fillRect(px, py, PD_C, 1);
      } // brilho que cintila
    }
}

export { drawPuddle, pdNear };
