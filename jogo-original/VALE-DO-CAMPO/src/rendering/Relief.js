/**
 * Relevo: sombreamento do terreno conforme a elevação do mapa.
 *
 * Origem: Vale_do_Campo_V64.html (s05)
 */

import { HN, MH, MW, SAND, SCREE, SNOWG, TS, WATER } from '../config/constants.js';
import { S } from '../core/GameState.js';
import { ctx } from './Canvas.js';
import { elev, ero } from '../world/hydrology/Hydrology.js';
import { ground } from '../world/World.js';

/* Relevo: degraus de pixel conforme a altitude */
let RLV = null,
  RLT = 0;

function drawRelief(x0, x1, y0, y1) {
  if (S.inside) return;
  x0 = Math.max(1, x0);
  y0 = Math.max(1, y0);
  x1 = Math.min(MW - 2, x1);
  y1 = Math.min(MH - 2, y1);
  const nw = performance.now();
  if (!RLV) {
    RLV = new Int8Array(HN);
  }
  if (nw - RLT > 2000) {
    RLT = nw;
    for (let k = 0; k < HN; k++) RLV[k] = Math.floor((elev[k] - ero[k]) / 0.42);
  }
  const L = (i) => RLV[i];
  for (let ty = y0; ty <= y1; ty++)
    for (let tx = x0; tx <= x1; tx++) {
      const i = ty * MW + tx;
      if (ground[i] === WATER) continue;
      const l = L(i),
        x = tx * TS,
        y = ty * TS;
      if (l >= 3) {
        ctx.fillStyle = 'rgba(255,255,225,' + Math.min(0.14, 0.035 * (l - 2)) + ')';
        ctx.fillRect(x, y, TS, TS);
      } else if (l <= 1) {
        ctx.fillStyle = 'rgba(20,30,50,' + Math.min(0.16, 0.05 * (2 - l)) + ')';
        ctx.fillRect(x, y, TS, TS);
      }
      const s = i + MW,
        e = i + 1,
        w = i - 1;
      if (ground[s] !== WATER) {
        const d = l - L(s);
        if (d > 0) {
          const h = Math.min(5, 2 + d);
          ctx.fillStyle = 'rgba(255,255,225,.28)';
          ctx.fillRect(x, y + TS - h, TS, 1);
          {
            const gg = ground[i];
            ctx.fillStyle =
              gg === SNOWG
                ? 'rgba(150,172,200,.5)'
                : gg === SCREE
                  ? 'rgba(78,74,68,.55)'
                  : gg === SAND
                    ? 'rgba(160,140,96,.5)'
                    : 'rgba(88,64,40,.62)';
          }
          ctx.fillRect(x, y + TS - h + 1, TS, h - 1);
          ctx.fillStyle = 'rgba(40,28,18,.45)';
          ctx.fillRect(x, y + TS - 1, TS, 1);
          ctx.fillStyle = 'rgba(0,0,0,.2)';
          ctx.fillRect(x, y + TS, TS, 2);
        }
      }
      if (ground[e] !== WATER && l - L(e) > 0) {
        ctx.fillStyle = 'rgba(0,0,0,.2)';
        ctx.fillRect(x + TS - 1, y, 1, TS - 2);
        ctx.fillRect(x + TS, y, 2, TS);
      }
      if (ground[w] !== WATER && l - L(w) > 0) {
        ctx.fillStyle = 'rgba(255,255,225,.16)';
        ctx.fillRect(x, y, 1, TS - 2);
      }
    }
}

export { drawRelief };
