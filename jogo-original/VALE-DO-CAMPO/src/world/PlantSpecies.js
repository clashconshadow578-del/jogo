/**
 * Qual planta (helicônia ou samambaia) é o mato de cada tile, e em que fase está.
 *
 * A espécie sai do ambiente do tile (sombra das árvores ao redor, umidade do solo, nutrientes, água parada) e fica
 * guardada enquanto o mato existe, para a planta não trocar de espécie quando o tempo muda. Não é salva: depois de
 * carregar, cada tile reescolhe pelo mesmo ambiente e pela mesma semente por tile (hash).
 */

import { HN, MH, MW, TREE } from '../config/constants.js';
import { HEL, PLANTS, SAM, plantStage } from '../config/plants.js';
import { TRAMPLE, regressTo } from '../config/trampling.js';
import { hash2 } from '../utils/MathUtils.js';
import { mato, nut, sm, wl } from './hydrology/Hydrology.js';
import { obj } from './World.js';

const plantSp = new Uint8Array(HN);

/** Sombra de copa no tile: árvores no quadrado 5x5 ao redor (0 = sol aberto, 1 = mata fechada). */
export function canopyAt(i) {
  const tx = i % MW,
    ty = (i / MW) | 0;
  let n = 0;
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++) {
      const x = tx + dx,
        y = ty + dy;
      if (x >= 0 && y >= 0 && x < MW && y < MH && obj[y * MW + x] === TREE) n++;
    }
  return Math.min(1, n / 7);
}

// Quão bem o ambiente serve à espécie: perto do ideal de luz, umidade e nutrientes; água parada ajuda ou atrapalha.
function fit(p, canopy, wet, rich, flood) {
  const f =
    (1 - Math.abs(canopy - p.luz)) *
    (1 - 0.8 * Math.abs(wet - p.umidade)) *
    (0.4 + 0.6 * (1 - Math.abs(rich - p.nutrientes))) *
    (flood > 0.05 ? p.aguaParada : 1);
  return Math.max(0.02, f);
}

function pick(i) {
  const h = fit(PLANTS[HEL], canopyAt(i), sm[i], nut[i], wl[i]),
    s = fit(PLANTS[SAM], canopyAt(i), sm[i], nut[i], wl[i]);
  return hash2((i % MW) * 3 + 7, ((i / MW) | 0) * 5 + 1) < h / (h + s) ? HEL : SAM;
}

/** Espécie (HEL, SAM) do mato do tile, ou 0 se o tile ainda não tem mato. */
export function speciesAt(i) {
  if (mato[i] <= 12) {
    plantSp[i] = 0;
    return 0;
  }
  return plantSp[i] || (plantSp[i] = pick(i));
}

/** Fase 0-4 do mato do tile (0 = nada para desenhar). */
export function stageAt(i) {
  return plantStage(mato[i]);
}

/** Multiplicador do crescimento do mato do tile conforme a espécie (1 enquanto ainda não há mato). */
export function growthRate(i) {
  const p = PLANTS[speciesAt(i)];
  return p ? p.ritmo : 1;
}

/**
 * O tile está sendo pisoteado (`stress` = desgaste médio 0-1, acima do limite): o mato perde mais quanto maior o desgaste e,
 * em pisoteio forte, a planta grande regride de fase de uma vez (fase 4 cai para a 2, fase 3 para a 1).
 */
export function plantTrampled(i, stress) {
  const to = regressTo(plantStage(mato[i]), stress);
  if (to !== null && mato[i] > to) mato[i] = to;
  mato[i] = Math.max(0, mato[i] - (TRAMPLE.perdaPorPasso + TRAMPLE.perdaPorDesgaste * stress));
}

/** Um dia na vida da planta do tile: a helicônia que floresceu perde o caule; a samambaia sofre em solo encharcado. */
export function plantDaily(i) {
  const p = PLANTS[speciesAt(i)];
  if (!p) return;
  if (p.florescerMorre && plantStage(mato[i]) === 4 && Math.random() < p.florescerMorre)
    mato[i] = Math.max(0, mato[i] - p.florescerQueda);
  else if (p.aguaParada < 0.5 && wl[i] > 0.1) mato[i] = Math.max(0, mato[i] - 6);
  // sem pisoteio o mato fecha: a helicônia adulta sombreia e sufoca brotos e plantas jovens ao lado
  if (plantStage(mato[i]) <= 2) {
    let n = 0;
    for (const j of [i - 1, i + 1, i - MW, i + MW])
      if (j >= 0 && j < HN && speciesAt(j) === HEL && plantStage(mato[j]) === 4) n++;
    if (n) mato[i] = Math.max(0, mato[i] - TRAMPLE.sombraDaHelikonia * n);
  }
}

/** Quanto os herbívoros gostam do mato do tile (0-1): as samambaias têm toxinas. */
export function palatability(i) {
  const p = PLANTS[speciesAt(i)];
  return p ? p.palatavel : 1;
}

/** Esquece as espécies (troca de região: os tiles são outros). */
export function resetPlants() {
  plantSp.fill(0);
}
