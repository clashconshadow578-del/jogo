/**
 * Consulta leve sobre cercas (sem dependências de entidades): usada por animais e por quem faz nascer criaturas.
 *
 * Origem: novo (sistema de cercas)
 */

import { FENCE, GATE, MH, MW, TS } from '../config/constants.js';
import { obj } from '../world/World.js';

/** O segmento entre dois pontos atravessa uma cerca ou portão FECHADO? (portão aberto deixa passar) */
export function crossesFence(x0, y0, x1, y1) {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 4));
  for (let k = 0; k <= n; k++) {
    const t = k / n,
      tx = Math.floor((x0 + (x1 - x0) * t) / TS),
      ty = Math.floor((y0 + (y1 - y0) * t) / TS);
    if (tx < 0 || ty < 0 || tx >= MW || ty >= MH) continue;
    const c = obj[ty * MW + tx];
    if (c === FENCE || c === GATE) return true;
  }
  return false;
}
