/**
 * Colisões em grade: tiles sólidos (objetos e água) para animais e para o jogador (que pode entrar na água).
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { GATE_OPEN, MH, MW, TS, WATER } from '../config/constants.js';
import { extensible } from '../core/extensions.js';
import { ground, obj } from '../world/World.js';

const solid = extensible(function solid(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= MW || ty >= MH) return true;
  const i = ty * MW + tx,
    o = obj[i];
  return (o !== 0 && o !== GATE_OPEN) || ground[i] === WATER; // portão aberto deixa passar
});

function blocked(x, y) {
  const l = Math.floor((x - 4) / TS),
    r = Math.floor((x + 3.9) / TS);
  const t = Math.floor((y - 3) / TS),
    b = Math.floor((y + 2.9) / TS);
  for (let ty = t; ty <= b; ty++) for (let tx = l; tx <= r; tx++) if (solid(tx, ty)) return true;
  return false;
}

/* ============ ÁGUA VIVA: ondas (física), reflexos, splash e imersão do personagem ============ */
function pSolid(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= MW || ty >= MH) return true;
  const o = obj[ty * MW + tx];
  return o !== 0 && o !== GATE_OPEN;
}

function pBlocked(x, y) {
  const l = Math.floor((x - 4) / TS),
    r = Math.floor((x + 3.9) / TS),
    t = Math.floor((y - 3) / TS),
    b = Math.floor((y + 2.9) / TS);
  for (let ty = t; ty <= b; ty++) for (let tx = l; tx <= r; tx++) if (pSolid(tx, ty)) return true;
  return false;
}

export { blocked, pBlocked, solid };
