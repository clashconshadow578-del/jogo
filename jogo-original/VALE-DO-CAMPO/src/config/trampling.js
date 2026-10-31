/**
 * Pisoteio e trilhas: parâmetros do que o caminhar dos animais faz com o mato e o solo, e do que o mato e as trilhas
 * fazem com o caminhar. A simulação do desgaste em si (grassWear / soilCompact, 4x4 células por tile) fica em
 * world/GrassSystem.js; as regras que ligam isso às plantas, à velocidade e ao caminho ficam em world/Trails.js.
 */

import { FASE } from './plants.js';

export const TRAMPLE = {
  // ---- plantas pisoteadas (world/PlantSpecies.js: plantTrampled) ----
  limite: 0.12, // desgaste médio do tile (0-1) a partir do qual o mato sofre e para de crescer
  perdaPorPasso: 0.8, // mato perdido por passo da hidrologia acima do limite...
  perdaPorDesgaste: 8, // ...mais isto vezes o desgaste (pisoteio forte mata mais rápido)
  regride: 0.2, // desgaste que derruba uma planta de fase 3 ou 4 de uma vez
  // ---- solo compactado (a compactação média do tile, 0-1) ----
  compactaCresce: 0.8, // o crescimento do mato cai até 80% em solo bem compactado
  compactaGermina: 0.3, // acima disso semente de árvore não germina
  matoFechado: FASE[3], // com mato desta fase em diante, semente de árvore também não germina (falta clareira)
  // ---- movimento ----
  freiaFase3: 0.88, // velocidade em mato crescido (fase 3)
  freiaFase4: 0.6, // velocidade em mato fechado (fase 4): cansa atravessar
  trilhaBonus: 0.08, // animais: +8% de velocidade em trilha batida (o jogador já tem o seu em PlayerMovement)
  // ---- caminho (findPath) ----
  caminhoTrilha: 0.5, // custo de um tile de trilha batida: 1 - 0,5 (prefere andar por ela)
  caminhoMato: [1, 1, 1, 1.4, 2.2], // custo do tile por fase do mato (0-4): contorna mato fechado
  // ---- fauna selvagem: peso do pisoteio por espécie (0 = não pisoteia) ----
  peso: { deer: 1, boar: 1.1, jaguar: 0.9, fox: 0.3, hare: 0.1, grouse: 0.1, anaconda: 0, harpy: 0 },
  // ---- competição: broto ou planta jovem ao lado de helicônia adulta perde isto por dia (falta de luz) ----
  sombraDaHelikonia: 4,
};

/** Multiplicador de velocidade no mato de fase `stage` (0-4). */
export function matoDrag(stage) {
  return stage >= 4 ? TRAMPLE.freiaFase4 : stage === 3 ? TRAMPLE.freiaFase3 : 1;
}

/** Custo de um tile no caminho: trilha batida (0-1) barateia, mato de fase `stage` encarece. */
export function pathCost(trail, stage) {
  return (1 - TRAMPLE.caminhoTrilha * trail) * TRAMPLE.caminhoMato[stage];
}

/** Para onde o mato regride (valor de mato) quando é pisoteado forte (`stress` 0-1): fase 4 cai para a 2, fase 3 para a 1. */
export function regressTo(stage, stress) {
  if (stress < TRAMPLE.regride) return null;
  if (stage >= 4) return FASE[2] - 5;
  if (stage === 3) return FASE[1] - 5;
  return null;
}
