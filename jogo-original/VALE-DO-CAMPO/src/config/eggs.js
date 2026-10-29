/**
 * Ovos: intervalo de postura, incubação e limites. O tempo é o relógio do jogo (minutos absolutos do mundo,
 * `worldMin()`), nunca o relógio do computador. 1 dia do jogo = DAY_MIN minutos.
 *
 * Origem: novo (ovos e eclosão)
 */

import { DAY_MIN } from './constants.js';

export const EGG_CFG = {
  layIntervalMin: 1 * DAY_MIN, // "24 horas" do jogo = 1 dia entre as posturas de cada galinha
  incubationMin: 3 * DAY_MIN, // 3 dias até eclodir se o ovo ficar no chão
  maxChickens: 30, // mesmo limite do galinheiro que já existia ("Galinheiro cheio (30 aves)")
  maxEggsInWorld: 60, // trava de segurança contra poluir o mapa
  collectRadiusPx: 22, // alcance para pegar um ovo
  maxLaysPerUpdate: 3, // ao voltar de uma ausência longa, no máximo 3 posturas atrasadas por galinha de uma vez
};

/** Quando a galinha põe o próximo ovo, dado o instante da última postura. */
export const nextLayAt = (lastEgg) => lastEgg + EGG_CFG.layIntervalMin;

/** Instante da eclosão de um ovo posto em `layT`. */
export const hatchAt = (layT) => layT + EGG_CFG.incubationMin;

/** Já é hora de pôr? (um ovo por vez: nunca recupera várias posturas atrasadas de uma só vez) */
export const dueToLay = (now, layNext) => now >= layNext;

/** O ovo já cumpriu a incubação? */
export const dueToHatch = (now, egg) => now >= egg.hatchAt;

/**
 * Instante da primeira postura de uma galinha que acabou de ficar adulta. Cada galinha ganha um deslocamento
 * fixo (pelo id) dentro do primeiro dia, para não porem todas no mesmo segundo.
 */
export const firstLayAt = (now, id) => now + EGG_CFG.layIntervalMin * (0.25 + 0.75 * ((id * 0.6180339887) % 1));

/**
 * Posturas devidas até `now`. Cada postura é datada no horário em que deveria ter acontecido (`times`), a
 * próxima é sempre 24h depois da anterior e nunca se acumulam mais que `cap` de uma só vez: o que passar
 * disso é descartado (`next` volta a ficar 24h à frente de `now`). Função pura.
 * @returns {{times:number[], next:number}}
 */
export function planLays(now, layNext, cap = EGG_CFG.maxLaysPerUpdate) {
  const times = [];
  let next = layNext;
  while (now >= next && times.length < cap) {
    times.push(next);
    next += EGG_CFG.layIntervalMin;
  }
  if (now >= next) next = now + EGG_CFG.layIntervalMin;
  return { times, next };
}
