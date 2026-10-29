/**
 * Serrapilheira: folhas que se acumulam sob as copas e se decompõem.
 *
 * Origem: Vale_do_Campo_V64.html (s13)
 */

import { GRASS, HN, MH, MW, TREE, TS, VH, VW } from '../../config/constants.js';
import { clamp, seasonNow } from './AmazonTrees.js';
import { ctx } from '../../rendering/Canvas.js';
import { vcam } from '../../rendering/Renderer.js';
import { hash2 } from '../../utils/MathUtils.js';
import { ecoTrees } from '../../world/ecology/TreeEcology.js';
import { bio, nut, om, sm } from '../../world/hydrology/Hydrology.js';
import { climate } from '../../world/WeatherSystem.js';
import { ground, obj } from '../../world/World.js';

/* ============================================================================
   SERAPILHEIRA (folhas/palha viram chão coberto, sem objetos por folha)  +  ABELHAS (Apis) E COLMEIAS
   Serapilheira: cada tile guarda uma "cobertura de folhas" (0-255). Folhas/palhas que caem se
   misturam ao solo; sob árvores grandes o chão fica coberto. Decompõe em húmus/nutrientes e retém umidade.
   Abelhas (parâmetros reais, escalados): operária ~1,2 cm vive ~6 semanas; rainha ~2 cm; colônias de
   dezenas de milhares (aqui 5–24 desenhadas); forrageiam km (aqui ~14 tiles); polinizam; ferrão com
   farpas: a operária morre ao ferroar; feromônio de alarme recruta muitas; a rainha é protegida.
   ============================================================================ */
const litter = new Uint8Array(HN);

function litterAdd(j, v) {
  if (j >= 0 && j < HN && ground[j] === GRASS) litter[j] = Math.min(255, litter[j] + v);
}

const LT_PAT = [];

function litterDaily() {
  const sI = seasonNow(),
    dry = sI === 3 || sI === 0,
    raining = climate.kind >= 3;
  for (const [i, a] of ecoTrees) {
    if (!a.amz || a.st < 3 || a.estagio === 'morta' || obj[i] !== TREE) continue;
    const m = a.model(),
      r = clamp(Math.round((((m && m.mw) || 20) * 0.42) / TS), 1, 4),
      base = (a.especie === 'buriti' ? 5 : 9) + a.st * 2 * (dry ? 1.5 : 1);
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const d = Math.hypot(dx, dy);
        if (d > r + 0.3) continue;
        const x = a.x + dx,
          y = a.y + dy;
        if (x < 0 || x >= MW || y < 0 || y >= MH) continue;
        litterAdd(y * MW + x, Math.round(base * (1 - d / (r + 1)) * (0.6 + Math.random() * 0.8)));
      }
  }
  for (let j = 0; j < HN; j++) {
    const v = litter[j];
    if (!v) continue;
    const lt = v / 255;
    om[j] = Math.min(1, om[j] + lt * 0.006);
    nut[j] = Math.min(1, nut[j] + lt * 0.004);
    bio[j] = Math.min(1, bio[j] + lt * 0.004);
    sm[j] = Math.min(1, sm[j] + lt * 0.012); // adubo verde + mulch que segura água
    litter[j] = Math.max(0, Math.floor(v * (raining ? 0.88 : 0.94)));
  }
}

function drawLitter() {
  const cx = vcam ? vcam.x : 0,
    cy = vcam ? vcam.y : 0,
    x0 = Math.max(0, ((cx / TS) | 0) - 1),
    x1 = Math.min(MW - 1, (((cx + VW) / TS) | 0) + 1),
    y0 = Math.max(0, ((cy / TS) | 0) - 1),
    y1 = Math.min(MH - 1, (((cy + VH) / TS) | 0) + 1);
  for (let ty = y0; ty <= y1; ty++)
    for (let tx = x0; tx <= x1; tx++) {
      const j = ty * MW + tx,
        v = litter[j];
      if (v < 14 || ground[j] !== GRASS) continue;
      const lv = v >= 170 ? 3 : v >= 100 ? 2 : v >= 45 ? 1 : 0;
      ctx.drawImage(LT_PAT[lv][(tx * 7 + ty * 13) & 3], tx * TS, ty * TS);
    }
}

export function initLitter() {
  (function () {
    const cols = ['#8a6a2e', '#a07a38', '#6a4a22', '#b88a3a', '#4f6a2a', '#7a3f1c'];
    for (let lv = 0; lv < 4; lv++) {
      LT_PAT[lv] = [];
      for (let v = 0; v < 4; v++) {
        const c = document.createElement('canvas');
        c.width = c.height = 16;
        const g = c.getContext('2d');
        g.fillStyle = 'rgba(74,50,22,' + (0.07 + lv * 0.08) + ')';
        g.fillRect(0, 0, 16, 16);
        const n = [3, 8, 15, 24][lv];
        for (let k = 0; k < n; k++) {
          const h1 = hash2(lv * 100 + v * 17 + k, 3),
            h2 = hash2(lv * 100 + v * 17 + k, 9),
            h3 = hash2(k + v * 7, lv + 5);
          g.fillStyle = cols[(h3 * cols.length) | 0];
          const x = (h1 * 14) | 0,
            y = (h2 * 14) | 0;
          if (h3 < 0.5) g.fillRect(x, y, 2, 1);
          else g.fillRect(x, y, 1, 2);
        }
        LT_PAT[lv].push(c);
      }
    }
  })();
}

export { drawLitter, litter, litterAdd, litterDaily };
