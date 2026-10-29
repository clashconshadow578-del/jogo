/**
 * Efeitos de brilho radial reutilizáveis.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { ctx } from './Canvas.js';

function fillGlow(target, x, y, r, color, alpha) {
  if (alpha <= 0) return;
  const grad = target.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0, `rgba(${color},${alpha})`);
  grad.addColorStop(0.28, `rgba(${color},${alpha * 0.5})`);
  grad.addColorStop(1, `rgba(${color},0)`);
  target.fillStyle = grad;
  target.fillRect(x - r, y - r, 2 * r, 2 * r);
}

function glow(x, y, r, col, a) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${col},${a})`);
  g.addColorStop(1, `rgba(${col},0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

export { fillGlow, glow };
