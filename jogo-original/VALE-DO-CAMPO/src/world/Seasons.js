/**
 * Estações do ano (28 dias cada): paletas das copas e tingimento sazonal.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { DAY_MIN } from '../config/constants.js';
import { S } from '../core/GameState.js';

const SEASONS = ['Primavera', 'Verão', 'Outono', 'Inverno'];

const TREE_PAL = [
  ['#2f7a45', '#37904a', '#47a14c', '#2e7a44', '#4fb057', '#3c8a47'],
  ['#245c36', '#286f3b', '#347e3c', '#256638', '#398745', '#2d7139'],
  ['#a8541f', '#c0651f', '#d08a2a', '#9c4a1e', '#b9701f', '#c47a2a'],
  ['#6f8078', '#7d8e87', '#8b9c95', '#6b7c74', '#94a59e', '#7b8c84'],
];

const SEASON_TINT = [
  [120, 200, 90, 0.06],
  [225, 205, 80, 0.1],
  [205, 120, 40, 0.22],
  [238, 246, 255, 0.42],
];

let TREEPAL = TREE_PAL[1].slice(),
  TINT = [0, 0, 0, 0],
  TINTSTR = 'rgba(0,0,0,0)';

const hexRGB = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];

function seasonPhase() {
  return Math.max(0, ((S.day - 1 + S.min / DAY_MIN) / 28) % 4);
}

function seasonUpdate() {
  // cores mudam gradualmente; transição nos últimos 20% de cada estação
  const p = seasonPhase(),
    s = Math.floor(p) % 4,
    n = (s + 1) % 4,
    f = p - Math.floor(p),
    b = f < 0.8 ? 0 : (f - 0.8) / 0.2,
    mx = (a, c) => a + (c - a) * b;
  TREEPAL = TREE_PAL[s].map((c, i) => {
    const A = hexRGB(c),
      B = hexRGB(TREE_PAL[n][i]);
    return `rgb(${mx(A[0], B[0]) | 0},${mx(A[1], B[1]) | 0},${mx(A[2], B[2]) | 0})`;
  });
  const A = SEASON_TINT[s],
    B = SEASON_TINT[n];
  TINT = [0, 1, 2, 3].map((k) => mx(A[k], B[k]));
  TINTSTR = `rgba(${TINT[0] | 0},${TINT[1] | 0},${TINT[2] | 0},${TINT[3].toFixed(3)})`;
}

export { SEASONS, TINT, TINTSTR, TREEPAL, seasonPhase, seasonUpdate };
