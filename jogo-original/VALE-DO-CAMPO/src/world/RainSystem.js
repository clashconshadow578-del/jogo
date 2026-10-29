/**
 * Chuva física: gotas como partículas no mundo, com gravidade e vento, que batem em copas/telhados, fazem ondas na água e molham o solo.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { BIN, HOUSE, MH, MW, ROCK, TREE, TS, VH, VW, WATER } from '../config/constants.js';
import { Q } from '../config/settings.js';
import { S, sleeping } from '../core/GameState.js';
import { ctx } from '../rendering/Canvas.js';
import { hash2 } from '../utils/MathUtils.js';
import { wImpulse, wSplash } from './WaterSystem.js';
import { climate, rainAt, windNow } from './WeatherSystem.js';
import { actRange, ground, obj } from './World.js';

const drops = Array.from({ length: 230 }, (_, i) => ({
  x: hash2(i, 31) * VW,
  y: hash2(i, 71) * VH,
  speed: 85 + hash2(i, 53) * 110,
  len: 3 + hash2(i, 17) * 7,
  th: hash2(i, 5),
}));

/* ============ CHUVA FÍSICA ============
   Gotas são partículas no MUNDO: caem com gravidade, o vento as desloca, batem em árvores/pedras/casa,
   caem na água (ondas reais) ou no chão (respingo e solo que molha e forma poças). */
const rDrops = [],
  rRings = [],
  rHits = [];

let rAcc = 0;

const wetT = new Float32Array(MW * MH); // molhado do solo por tile (0..1)

const OBJ_H = { [TREE]: 24, [ROCK]: 7, [HOUSE]: 30, [BIN]: 10 }; // altura do topo de cada obstáculo (px)

const RAIN_MAX = 340;

function rainWorld(dt) {
  const rain = climate.rain || 0;
  if (rain > 0.02 && !sleeping) {
    rAcc += dt * rain * [5, 6, 7, 8][Q()] * 70 * (1 + (climate.kind === 3 ? 0.5 : 0));
    while (rAcc >= 1) {
      rAcc -= 1;
      if (rDrops.length >= RAIN_MAX) break;
      const x = S.px + (Math.random() - 0.5) * VW * 1.5,
        y = S.py + (Math.random() - 0.5) * VH * 1.5;
      if (rainAt(x, y) < Math.random()) continue;
      rDrops.push({ x, y, h: 70 + Math.random() * 90, v: 40, life: 0 });
    }
  }
  const wd = windNow() * 45; // deriva lateral pelo vento (px/s)
  for (let i = rDrops.length - 1; i >= 0; i--) {
    const d = rDrops[i];
    d.v = Math.min(190, d.v + 420 * dt); // gravidade até a velocidade terminal
    d.h -= d.v * dt;
    d.x += wd * dt;
    d.life += dt;
    const tx = Math.floor(d.x / TS),
      ty = Math.floor(d.y / TS);
    if (tx < 0 || ty < 0 || tx >= MW || ty >= MH || d.life > 3) {
      rDrops.splice(i, 1);
      continue;
    }
    const ti = ty * MW + tx,
      ob = obj[ti],
      oh = ob ? OBJ_H[ob] || 0 : 0;
    if (oh && d.h <= oh) {
      rHits.push({ x: d.x, y: d.y, z: oh, t: 0 });
      rDrops.splice(i, 1);
      continue;
    } // bateu no telhado/copa/pedra
    if (d.h <= 0) {
      if (ground[ti] === WATER) {
        wImpulse(d.x, d.y, -0.5, 1);
        wSplash(d.x, d.y, 2, 0.5);
        rRings.push({ x: d.x, y: d.y, t: 0, w: 1.1, wat: 1 });
      } else {
        wetT[ti] = Math.min(1, wetT[ti] + 0.02);
        rRings.push({ x: d.x, y: d.y, t: 0, w: 0.7, wat: 0 });
      }
      rDrops.splice(i, 1);
    }
  }
  for (let i = rRings.length - 1; i >= 0; i--) {
    rRings[i].t += dt;
    if (rRings[i].t > 0.5) rRings.splice(i, 1);
  }
  for (let i = rHits.length - 1; i >= 0; i--) {
    rHits[i].t += dt;
    if (rHits[i].t > 0.22) rHits.splice(i, 1);
  }
  const dry = dt * 0.0012; // secagem lenta do solo
  for (let i = 0; i < wetT.length; i++) if (wetT[i] > 0) wetT[i] = Math.max(0, wetT[i] - dry);
}

function rainDraw(camX, camY, t) {
  const AR = actRange(),
    tx0 = Math.max(AR[0], Math.floor(camX / TS)),
    tx1 = Math.min(AR[1], Math.floor((camX + VW) / TS));
  const ty0 = Math.max(0, Math.floor(camY / TS)),
    ty1 = Math.min(MH - 1, Math.floor((camY + VH) / TS));
  for (let ty = ty0; ty <= ty1; ty++)
    for (let tx = tx0; tx <= tx1; tx++) {
      // solo molhado e poças
      const i = ty * MW + tx,
        w = wetT[i];
      if (w < 0.03 || ground[i] === WATER || obj[i]) continue;
      const X = tx * TS - camX,
        Y = ty * TS - camY;
      ctx.fillStyle = `rgba(28,52,64,${(w * 0.32).toFixed(3)})`;
      ctx.fillRect(X, Y, TS, TS);
      if (w > 0.5 && hash2(tx, ty) < (w - 0.4) * 1.6) {
        const px = X + 3 + hash2(tx + 9, ty) * 10,
          py = Y + 4 + hash2(tx, ty + 7) * 8,
          r = 2.5 + w * 3;
        ctx.fillStyle = `rgba(96,140,170,${(0.35 + w * 0.25).toFixed(3)})`;
        ctx.beginPath();
        ctx.ellipse(px, py, r, r * 0.4, 0, 0, 6.283);
        ctx.fill();
        ctx.fillStyle = 'rgba(225,240,255,.45)';
        ctx.fillRect(px - r * 0.4, py - r * 0.2, r * 0.5, 0.7);
      }
    }
  const wv = windNow(); // gotas: rastro inclinado pelo vento
  ctx.lineWidth = 0.7;
  ctx.strokeStyle = 'rgba(199,225,255,.5)';
  ctx.beginPath();
  for (const d of rDrops) {
    const sx = d.x - camX,
      sy = d.y - camY - d.h;
    if (sx < -4 || sx > VW + 4 || sy < -12 || sy > VH + 4) continue;
    const L = 3 + d.v * 0.03;
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + wv * L * 0.35, sy - L);
  }
  ctx.stroke();
  for (const r of rRings) {
    const k = r.t / 0.5,
      rx = (2 + k * 9) * r.w,
      sx = r.x - camX,
      sy = r.y - camY; // anéis de impacto
    ctx.strokeStyle = r.wat
      ? `rgba(225,245,255,${(0.7 * (1 - k)).toFixed(3)})`
      : `rgba(210,235,255,${(0.5 * (1 - k)).toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(sx, sy, rx, rx * 0.42, 0, 0, 6.283);
    ctx.stroke();
  }
  for (const h of rHits) {
    const k = h.t / 0.22,
      sx = h.x - camX,
      sy = h.y - camY - h.z; // respingo no topo do obstáculo
    ctx.fillStyle = `rgba(225,240,255,${(0.6 * (1 - k)).toFixed(3)})`;
    for (const a of [-1, -0.3, 0.4, 1]) ctx.fillRect(sx + a * k * 5, sy - k * 4 + Math.abs(a) * k * 2, 1, 1);
  }
}

export { rDrops, rHits, rRings, rainDraw, rainWorld, wetT };
