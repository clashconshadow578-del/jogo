/**
 * Alimentos que atraem cada espécie e o raio de atenção. Só entram itens que já existem no jogo e que fazem
 * sentido para a espécie (não há maçã no jogo, então ela não está na lista).
 *
 *  vaca:    cenoura, abóbora e milho (vegetais/grãos)
 *  galinha: milho e sementes de cenoura, abóbora e milho (grãos pequenos)
 *
 * Origem: novo (atração por alimentos)
 */

export const FOOD = {
  vaca: { items: ['cenoura', 'abobora', 'milho'], radiusTiles: 6, standoffPx: 22, speedMul: 1.0 },
  galinha: { items: ['milho', 'seedC', 'seedP', 'seedM'], radiusTiles: 5, standoffPx: 13, speedMul: 1.0 },
};

/** Margem extra (px) além do raio antes de perder o interesse: evita oscilar entre seguir e parar no limite. */
export const LURE_HYSTERESIS_PX = 12;

/** De quanto em quanto tempo (s) um seguidor recalcula o caminho quando não enxerga o jogador. */
export const LURE_REPATH_SEC = 0.7;

/** O alimento `item` atrai a espécie? */
export function attracts(species, item) {
  const f = FOOD[species];
  return !!f && !!item && f.items.includes(item);
}

/**
 * O animal deve estar em atração? Com histerese: entra a `raio`, só sai além de `raio + margem`.
 * @param {number} dist distância real (px) até o jogador
 * @param {boolean} wasLured já estava em atração no quadro anterior
 */
export function lureDecision(species, item, dist, wasLured) {
  const f = FOOD[species];
  if (!f || !attracts(species, item)) return false;
  const R = f.radiusTiles * 16;
  return dist <= (wasLured ? R + LURE_HYSTERESIS_PX : R);
}

/** Ponto onde o animal `id` fica em volta do jogador (cada um num lugar, sem se sobrepor). */
export function lureSlot(species, id, px, py) {
  const f = FOOD[species],
    a = (id * 2.399963) % 6.283185,
    r = f.standoffPx + (id % 3) * 6;
  return { x: px + Math.cos(a) * r, y: py + Math.sin(a) * r * 0.75 };
}
