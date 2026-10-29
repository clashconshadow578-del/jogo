/**
 * Progressão (estado e ações): missões concluídas, compra de melhorias de ferramentas e de sementes,
 * colheita com qualidade/extras/semente e venda com multiplicador de qualidade.
 * As regras e tabelas estão em config/progression.js; aqui só se lê e altera o estado `S`.
 *
 * Origem: novo (sistema de progressão)
 */

import { PRICE } from '../config/balance.js';
import {
  QUALITIES,
  SEED_OF,
  TOOL_MAX_LEVEL,
  UPGRADABLE_TOOLS,
  evaluateSeedUpgrade,
  evaluateToolUpgrade,
  rollHarvest,
  toolLevel,
  unitPrice,
} from '../config/progression.js';
import { S } from '../core/GameState.js';

/* ============ ESTADO (criado sob demanda: saves antigos continuam válidos) ============ */

/** `S.up`: níveis das ferramentas e das sementes. */
export function upState() {
  if (!S.up || typeof S.up !== 'object') S.up = { tool: {}, seed: 0 };
  if (!S.up.tool || typeof S.up.tool !== 'object') S.up.tool = {};
  for (const id of UPGRADABLE_TOOLS) if (!(S.up.tool[id] >= 0)) S.up.tool[id] = 0;
  if (!(S.up.seed >= 0)) S.up.seed = 0;
  return S.up;
}

let legacyMissions = () => 0;

/** Quests.js informa como contar as missões já recebidas em saves anteriores a este sistema. */
export function registerLegacyMissions(fn) {
  legacyMissions = fn;
}

/** Missões válidas concluídas (global). Só sobe quando a recompensa é recebida, uma vez por missão. */
export function missionsDone() {
  if (!(S.missionsDone >= 0)) S.missionsDone = legacyMissions() | 0;
  return S.missionsDone;
}

/** Registra uma missão recebida. Chamar apenas no instante em que a missão é encerrada. */
export function completeMission() {
  S.missionsDone = missionsDone() + 1;
  return S.missionsDone;
}

/* ============ FERRAMENTAS ============ */

export function toolStatus(id) {
  return evaluateToolUpgrade({ level: toolLevel(id), missions: missionsDone(), coins: S.coins });
}

/**
 * Compra a próxima melhoria da ferramenta. Tudo ou nada: se algo falhar, moedas e nível voltam ao que eram.
 * @param {string} id ferramenta
 * @param {number} [expectedNext] nível que a tela mostrava; se já mudou (clique duplo, tela velha), cancela
 */
export function buyToolUpgrade(id, expectedNext) {
  if (!UPGRADABLE_TOOLS.includes(id)) return { ok: false, reason: 'Ferramenta inválida' };
  const up = upState(),
    lvBefore = toolLevel(id),
    coinsBefore = S.coins;
  if (expectedNext != null && expectedNext !== lvBefore + 1)
    return { ok: false, reason: 'A tela estava desatualizada. Tente de novo.' };
  const ev = toolStatus(id);
  if (!ev.ok) return { ok: false, reason: ev.reason };
  try {
    S.coins -= ev.price;
    up.tool[id] = Math.min(TOOL_MAX_LEVEL, lvBefore + 1);
    return { ok: true, level: up.tool[id], price: ev.price };
  } catch (e) {
    S.coins = coinsBefore;
    up.tool[id] = lvBefore;
    return { ok: false, reason: 'Não foi possível concluir a compra' };
  }
}

/* ============ SEMENTES ============ */

export function seedStatus() {
  return evaluateSeedUpgrade({ level: upState().seed, coins: S.coins });
}

export function buySeedUpgrade(expectedNext) {
  const up = upState(),
    lvBefore = up.seed,
    coinsBefore = S.coins;
  if (expectedNext != null && expectedNext !== lvBefore + 1)
    return { ok: false, reason: 'A tela estava desatualizada. Tente de novo.' };
  const ev = seedStatus();
  if (!ev.ok) return { ok: false, reason: ev.reason };
  try {
    S.coins -= ev.price;
    up.seed = lvBefore + 1;
    return { ok: true, level: up.seed, price: ev.price };
  } catch (e) {
    S.coins = coinsBefore;
    up.seed = lvBefore;
    return { ok: false, reason: 'Não foi possível concluir a compra' };
  }
}

/* ============ COLHEITA ============ */

/** Semente numérica de uma plantação nova: fixa o resultado da colheita desde o plantio. */
export function newCropSeed() {
  return (Math.random() * 4294967296) >>> 0;
}

/**
 * Entrega ao inventário o que uma colheita madura rendeu. Chamar UMA vez por planta, logo depois de
 * removê-la do mapa; `crop.done` impede que o mesmo objeto seja processado de novo.
 * @returns {null | {units:number[], extra:number, seedBack:boolean, seedId:string|null, key:string}}
 */
export function harvestCrop(crop) {
  if (!crop || crop.done) return null;
  crop.done = true;
  if (crop.rs == null) crop.rs = newCropSeed(); // planta de um save antigo
  const r = rollHarvest(crop.rs, upState().seed),
    key = crop.k;
  S.inv[key] = (S.inv[key] || 0) + r.units.length;
  const qa = qualArray(key);
  for (const q of r.units) if (q > 0) qa[q - 1]++;
  const seedId = SEED_OF[key] || null;
  const seedBack = r.seedBack && !!seedId;
  if (seedBack) S.inv[seedId] = (S.inv[seedId] || 0) + 1;
  return { units: r.units, extra: r.extra, seedBack, seedId, key };
}

/* ============ QUALIDADE NO INVENTÁRIO ============ */

function qualArray(key) {
  if (!S.qual || typeof S.qual !== 'object') S.qual = {};
  const a = S.qual[key];
  if (!Array.isArray(a) || a.length !== 3) S.qual[key] = [0, 0, 0];
  return S.qual[key];
}

/**
 * Quantas unidades de cada qualidade [comum, boa, excelente, premium] existem no inventário.
 * A soma sempre bate com o total do item (se algo tirou itens por fora, tira-se da maior qualidade).
 */
export function qualCounts(key) {
  const total = Math.max(0, S.inv[key] | 0),
    a = S.qual && Array.isArray(S.qual[key]) ? S.qual[key].map((n) => Math.max(0, n | 0)) : [0, 0, 0];
  let extra = a[0] + a[1] + a[2] - total;
  for (let q = 2; q >= 0 && extra > 0; q--) {
    const d = Math.min(a[q], extra);
    a[q] -= d;
    extra -= d;
  }
  return [total - (a[0] + a[1] + a[2]), a[0], a[1], a[2]];
}

/** Maior qualidade presente (0..3) de um item, para a marca na hotbar/inventário. */
export function bestQuality(key) {
  const c = qualCounts(key);
  for (let q = 3; q > 0; q--) if (c[q] > 0) return q;
  return 0;
}

/* ============ VENDA ============ */

/** Vende tudo o que tem preço, com o multiplicador de cada qualidade. Devolve o total (0 se nada). */
export function sellAll() {
  let total = 0;
  for (const k in PRICE) {
    const n = S.inv[k] | 0;
    if (n <= 0) continue;
    const c = qualCounts(k);
    for (let q = 0; q < QUALITIES.length; q++) total += c[q] * unitPrice(PRICE[k], q);
    S.inv[k] = 0;
    if (S.qual && S.qual[k]) S.qual[k] = [0, 0, 0];
  }
  if (total > 0) S.coins += total;
  return total;
}

/** Quanto renderia vender tudo agora (para exibição). */
export function sellValue() {
  let total = 0;
  for (const k in PRICE) {
    const c = qualCounts(k);
    for (let q = 0; q < QUALITIES.length; q++) total += c[q] * unitPrice(PRICE[k], q);
  }
  return total;
}
