/**
 * Mapa da região carregada: chão, objetos, umidade e plantações, além de consultas espaciais.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { MH, MW, OX, OY, TS, WATER } from '../config/constants.js';

let LK = [34 + OX, 19 + OY, 72 + OX, 46 + OY, 1.3, 5, 3.5, 6, 4];

/* ============ ESTADO ============ */
let ground, obj, wet, crops;

/* fome e sede: 100 = cheia, 0 = faminta/sedenta */
function nearestWater(c, r) {
  const cx = Math.floor(c.x / TS),
    cy = Math.floor(c.y / TS),
    R = Math.ceil(r / TS);
  let best = null,
    bd = r;
  for (let j = cy - R; j <= cy + R; j++)
    for (let i = cx - R; i <= cx + R; i++) {
      if (i < 0 || j < 0 || i >= MW || j >= MH || ground[j * MW + i] !== WATER) continue;
      const x = i * TS + 8,
        y = j * TS + 8,
        d = Math.hypot(x - c.x, y - c.y);
      if (d < bd) {
        bd = d;
        best = { x, y };
      }
    }
  return best;
}

/* Desenho: só a região em que o jogador está (a simulação continua em tudo) */
function actRange() {
  return [0, MW - 1];
}

function inAct(x, y) {
  const a = actRange(),
    t = Math.floor(x / TS);
  return t >= a[0] && t <= a[1];
}

/** Atualiza `LK` a partir de outros módulos (as ligações importadas são somente leitura). */
export function setLK(value) {
  LK = value;
  return value;
}

/** Atualiza `ground` a partir de outros módulos (as ligações importadas são somente leitura). */
export function setGround(value) {
  ground = value;
  return value;
}

/** Atualiza `obj` a partir de outros módulos (as ligações importadas são somente leitura). */
export function setObj(value) {
  obj = value;
  return value;
}

/** Atualiza `wet` a partir de outros módulos (as ligações importadas são somente leitura). */
export function setWet(value) {
  wet = value;
  return value;
}

/** Atualiza `crops` a partir de outros módulos (as ligações importadas são somente leitura). */
export function setCrops(value) {
  crops = value;
  return value;
}

export { LK, actRange, crops, ground, inAct, nearestWater, obj, wet };
