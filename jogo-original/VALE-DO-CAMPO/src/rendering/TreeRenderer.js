/**
 * Desenho das árvores: cada linha da copa balança ao vento com um deslocamento inteiro, e as linhas vizinhas com o mesmo
 * deslocamento saem num único drawImage. Os sprites, as regiões e a escolha do modelo ficam em world/Trees.js.
 *
 * Origem: Vale_do_Campo_V64.html (s02); separado de world/Trees.js na Fase 5 do plano de migração.
 */

import { Q } from '../config/settings.js';
import { extensible } from '../core/extensions.js';
import { S } from '../core/GameState.js';
import { sunInfo } from '../core/TimeManager.js';
import { TREEPAL } from '../world/Seasons.js';
import { treeModel } from '../world/Trees.js';
import { climate } from '../world/WeatherSystem.js';
import { ctx } from './Canvas.js';

const drawTree = extensible(function drawTree(x, y, tx, ty) {
  const m = tx != null && treeModel(tx, ty);
  if (!m || !m.ready) return drawTreeOld(x, y);
  const t = performance.now() / 1000,
    ph = x * 0.23 + y * 0.15,
    w = climate.wind || 0.5,
    amp = 0.5 + w * 1.7 + (climate.kind >= 3 ? 0.8 : 0);
  const sw = (Math.sin(t * 1.4 + ph) * 0.7 + Math.sin(t * 2.6 + ph * 1.7) * 0.3) * amp,
    dx = Math.round(x - m.w / 2),
    dy = Math.round(y - m.h + 2);
  // Cada linha da copa balança com um deslocamento inteiro `o`. Linhas vizinhas com o mesmo `o` saem num único
  // drawImage (mesmos pixels, bem menos chamadas — importante no celular, onde cada chamada tem custo fixo).
  let rs = 0,
    rO = 0;
  for (let r = 0; r < m.h; r++) {
    const f = 1 - (r + 0.5) / m.h,
      o = Math.round(sw * Math.pow(f, 1.5) + Math.sin(t * 6 + r * 0.45 + ph) * 0.4 * f * (0.3 + w));
    if (r === 0) rO = o;
    else if (o !== rO) {
      ctx.drawImage(m.img, 0, rs, m.w, r - rs, dx + rO, dy + rs, m.w, r - rs);
      rs = r;
      rO = o;
    }
  }
  if (m.h > 0) ctx.drawImage(m.img, 0, rs, m.w, m.h - rs, dx + rO, dy + rs, m.w, m.h - rs);
});

function drawTreeOld(x, y) {
  const h = 6 + S.min / 60,
    sun = sunInfo(h),
    wind = Math.sin(performance.now() * 0.0015 + x * 0.23 + y * 0.15) * (0.35 + Q() * 0.16);
  ctx.fillStyle = '#503622';
  ctx.fillRect(x - 2, y - 12, 5, 12);
  ctx.fillStyle = '#8e6034';
  ctx.fillRect(x - 2, y - 11, 1, 9);
  const lobes = [
    [-7, -15, 7],
    [5, -17, 8],
    [-1, -23, 9],
    [-8, -24, 6],
    [8, -25, 6],
    [0, -13, 8],
  ];
  for (let i = 0; i < lobes.length; i++) {
    const [ox, oy, r] = lobes[i],
      xx = x + ox + wind * (i % 2 ? 1 : -1),
      yy = y + oy;
    ctx.fillStyle = TREEPAL[i];
    ctx.beginPath();
    ctx.arc(xx, yy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(xx, yy, r, 0, 6.283);
    ctx.clip();
    ctx.fillStyle = `rgba(6,38,48,${0.1 + 0.22 * sun.day})`;
    ctx.beginPath();
    ctx.arc(xx + sun.dirX * r * 0.55, yy + r * 0.45, r * 0.95, 0, 6.283);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = `rgba(156,225,112,${0.1 + 0.25 * sun.day})`;
    ctx.beginPath();
    ctx.arc(xx - 2 - sun.dirX * 2, yy - 2, Math.max(2, r * 0.5), Math.PI, Math.PI * 1.9);
    ctx.fill();
    if (Q() >= 2) {
      ctx.fillStyle = 'rgba(17,66,35,.36)';
      ctx.fillRect(xx - 2, yy + 2, 3, 1);
    }
  }
}

export { drawTree };
