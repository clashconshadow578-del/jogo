/**
 * Personagem genérico em pixel art desenhado por código (usado como reserva enquanto a sprite carrega).
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { ctx } from './Canvas.js';

function drawPerson(x, y, shirt, hat, walk, face = 0) {
  const a = Math.round(Math.sin(walk));
  ctx.fillStyle = '#3a3a55';
  ctx.fillRect(x - 3, y - 5, 2, 5 + a);
  ctx.fillRect(x + 1, y - 5, 2, 5 - a);
  ctx.fillStyle = shirt;
  ctx.fillRect(x - 4, y - 12, 8, 8);
  ctx.fillStyle = 'rgba(0,0,0,.23)';
  ctx.fillRect(x + 2, y - 12, 2, 8);
  ctx.fillStyle = 'rgba(255,255,255,.23)';
  ctx.fillRect(x - 4, y - 12, 2, 7);
  ctx.fillStyle = '#f1c27d';
  ctx.fillRect(x - 3, y - 17, 6, 6);
  ctx.fillStyle = hat;
  ctx.fillRect(x - 3, y - 17, 6, face === 2 ? 5 : 2);
  ctx.fillStyle = '#222';
  if (face === 0) {
    ctx.fillRect(x - 2, y - 14, 1, 1);
    ctx.fillRect(x + 1, y - 14, 1, 1);
  } else if (face !== 2) {
    ctx.fillRect(x + (face > 0 ? 1 : -2), y - 14, 1, 1);
    ctx.fillStyle = '#d9a066';
    ctx.fillRect(x + (face > 0 ? 3 : -4), y - 13, 1, 1);
  }
}

export { drawPerson };
