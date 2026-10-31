/**
 * Desenho das árvores: cada árvore é um sprite só, parado (sem balanço do vento). Os sprites, as regiões e a escolha do modelo ficam em world/Trees.js.
 *
 * Origem: Vale_do_Campo_V64.html (s02); separado de world/Trees.js na Fase 5 do plano de migração.
 */

import { Q } from '../config/settings.js';
import { extensible } from '../core/extensions.js';
import { S } from '../core/GameState.js';
import { sunInfo } from '../core/TimeManager.js';
import { TREEPAL } from '../world/Seasons.js';
import { treeModel } from '../world/Trees.js';
import { ctx } from './Canvas.js';
import { occBegin, occEnd } from './Occlusion.js';

const drawTree = extensible(function drawTree(x, y, tx, ty) {
  const m = tx != null && treeModel(tx, ty);
  if (!m || !m.ready) return drawTreeOld(x, y);
  // A árvore fica parada (sem balanço do vento): um desenho só, o sprite inteiro.
  const dx = Math.round(x - m.w / 2),
    dy = Math.round(y - m.h + 2),
    g = occBegin(dx, dy, m.w, m.h); // se o personagem está atrás da árvore, só um círculo dela fica translúcido
  g.drawImage(m.img, dx, dy);
  occEnd(g);
});

function drawTreeOld(x, y) {
  const h = 6 + S.min / 60,
    sun = sunInfo(h);
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
      xx = x + ox,
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
