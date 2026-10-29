/**
 * Fezes dos animais: parâmetros e funções puras (sem DOM) para testes. A sprite, as moscas e a lista ficam em world/Feces.js.
 *
 * Unidades: segundos reais (1 s real ≈ 1 min do relógio do jogo).
 *
 * Origem: novo (ecossistema vivo).
 */

import { rr } from '../utils/Random.js';

export const FECES = {
  max: 120, // fezes na tela ao mesmo tempo; as mais antigas somem primeiro
  life: 260, // s até sumir (≈ 4 h de jogo)
  fade: 40, // s finais em que a fezes vai sumindo aos poucos
  rainMul: 2.2, // a chuva lava e decompõe mais depressa
  flyMax: 4, // moscas no máximo por fezes
};

/**
 * Temporizador de defecação. Guarda o contador em `o.dung`; devolve true quando o animal defeca.
 * O primeiro ciclo começa defasado, para os animais não defecarem todos juntos.
 */
export function dungTimer(o, dt, lo, hi) {
  if (o.dung == null) o.dung = rr(lo * 0.3, hi * 0.6);
  o.dung -= dt;
  if (o.dung > 0) return false;
  o.dung = rr(lo, hi);
  return true;
}

/** Opacidade (0..1) de uma fezes conforme a idade: plena até os últimos `fade` segundos. */
export function fecesAlpha(age, life, fade = FECES.fade) {
  const left = life - age;
  return left >= fade ? 1 : Math.max(0, left / fade);
}

/** Quantas moscas pousam numa fezes de tamanho `size` (0.55..1.6). */
export function fliesFor(size) {
  return Math.min(FECES.flyMax, 1 + Math.round(size * 1.5));
}
