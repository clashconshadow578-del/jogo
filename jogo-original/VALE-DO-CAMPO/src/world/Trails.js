/**
 * Trilhas e mato fechado como terreno: o que o pisoteio (world/GrassSystem.js) e o mato (world/PlantSpecies.js) fazem com a
 * velocidade e com o caminho de quem anda. Parâmetros em config/trampling.js.
 *
 *  - mato crescido (fase 3) e fechado (fase 4) freiam; a trilha batida acelera um pouco os animais;
 *  - o caminho (findPath) prefere tiles de trilha e contorna mato fechado.
 */

import { GRASS, HN, MW, TS } from '../config/constants.js';
import { TRAMPLE, matoDrag, pathCost } from '../config/trampling.js';
import { plantStage } from '../config/plants.js';
import { gid, soilCompact } from './GrassSystem.js';
import { cmpT, mato, wearT } from './hydrology/Hydrology.js';
import { ground } from './World.js';

/** Multiplicador de velocidade do mato no ponto de mundo (x, y): 1 fora do mato, menos em mato crescido ou fechado. */
export function plantDrag(x, y) {
  const i = Math.floor(y / TS) * MW + Math.floor(x / TS);
  if (i < 0 || i >= HN || ground[i] !== GRASS) return 1;
  return matoDrag(plantStage(mato[i]));
}

/** Multiplicador de velocidade da trilha batida no ponto (x, y): 1 a 1 + trilhaBonus (só para animais). */
export function trailBoost(x, y) {
  const c = gid(x, y);
  return c < 0 ? 1 : 1 + (TRAMPLE.trilhaBonus * soilCompact[c]) / 255;
}

/** Quanto o tile é trilha (0-1): desgaste ou compactação, o que for mais forte. */
export function trailK(i) {
  return Math.min(1, Math.max(wearT[i] * 2, cmpT[i] * 1.5));
}

/** Multiplicador total de velocidade de um animal no ponto (x, y): mato freia, trilha acelera. */
export function animalSpeed(x, y) {
  return plantDrag(x, y) * trailBoost(x, y);
}

/** Custo do tile i para o caminho (1 = neutro): trilha batida barateia, mato fechado encarece. */
export function tilePathCost(i) {
  if (ground[i] !== GRASS) return 1;
  return pathCost(trailK(i), plantStage(mato[i]));
}
