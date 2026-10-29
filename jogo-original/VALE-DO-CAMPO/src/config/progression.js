/**
 * Progressão do jogador: evolução de ferramentas, qualidade e extras da colheita e recuperação de sementes.
 *
 * Todas as tabelas, preços e probabilidades ficam AQUI (nada de números soltos pelo código). As funções
 * são puras (recebem os dados e devolvem o resultado) para poderem ser testadas sem o jogo.
 *
 * Estado salvo em `S` (junto do save normal):
 *   S.up   = { tool: { hoe, can, scythe, axe }, seed: n }   níveis inteiros; 0 = básico
 *   S.qual = { cenoura: [boa, excelente, premium], ... }    quantas unidades de cada qualidade (o resto é Comum)
 *   S.missionsDone                                          missões concluídas e recebidas (global)
 *
 * Origem: novo (sistema de progressão)
 */

import { S } from '../core/GameState.js';
import { rngSeed } from '../utils/Random.js';

/* ===================================================================================================
 * 1. FERRAMENTAS
 * ================================================================================================= */

/** Ferramentas que podem ser melhoradas (a tocha e o que não é ferramenta ficam de fora). */
export const UPGRADABLE_TOOLS = ['hoe', 'can', 'scythe', 'axe'];

/** Nível máximo de uma ferramenta (0 = básico, 1..4 = melhorias I a IV). */
export const TOOL_MAX_LEVEL = 4;

/** Nome de cada nível, na ordem dos sprites (madeira, pedra, ferro, ouro, netherita). */
export const TOOL_TIER_NAMES = ['Básica', 'Pedra', 'Ferro', 'Ouro', 'Netherita'];

export const TOOL_NAMES = { hoe: 'Enxada', can: 'Regador', scythe: 'Foice', axe: 'Machado' };

/**
 * Missões concluídas (global) necessárias para liberar a melhoria 1, 2, 3 e 4.
 * A última é exceção ao passo de 3: libera com 10, não com 12.
 */
export const TOOL_UNLOCK_MISSIONS = [3, 6, 9, 10];

/** Preço em moedas da melhoria 1..4 (igual para todas as ferramentas; só moedas, sem materiais). */
export const TOOL_PRICES = [300, 900, 2500, 7000];

/**
 * Quem oferece cada melhoria (moradores que já existem na vila; nenhum personagem novo):
 *  Rosa (fazendeira): enxada e regador · Tomé (lenhador): machado · Luzia (coletora): foice
 *  Gil (plantador): recuperação de sementes
 */
export const UPGRADE_NPC = {
  Rosa: { kind: 'tools', tools: ['hoe', 'can'], title: 'Ferramentas de cultivo' },
  Tomé: { kind: 'tools', tools: ['axe'], title: 'Machado' },
  Luzia: { kind: 'tools', tools: ['scythe'], title: 'Foice' },
  Gil: { kind: 'seed', title: 'Sementes' },
};

/**
 * Efeitos por nível (índice = nível). Cada nível traz algo perceptível.
 *  hoe/can:  reach  = tiles trabalhados por uso, em linha na direção em que o jogador olha
 *  scythe:   radius = raio do corte (1 = 3x3, 2 = 5x5, 3 = 7x7)
 *  axe:      dmg    = multiplicador de dano por golpe; wood = madeira extra ao derrubar uma árvore
 *  energy:   multiplicador do custo de energia por uso (1 = custo normal)
 */
export const TOOL_FX = {
  hoe: { reach: [1, 2, 3, 3, 5], energy: [1, 1, 1, 0.75, 0.75] },
  can: { reach: [1, 2, 3, 3, 5], energy: [1, 1, 1, 0.75, 0.75] },
  scythe: { radius: [1, 2, 2, 3, 3], energy: [1, 1, 0.75, 0.75, 0.5] },
  axe: { dmg: [1, 1.25, 1.5, 1.75, 2], wood: [0, 0, 1, 1, 2], energy: [1, 1, 1, 1, 1] },
};

/** Nível atual de uma ferramenta (0 se o save é antigo ou o id não é melhorável). */
export function toolLevel(id) {
  const lv = S && S.up && S.up.tool ? S.up.tool[id] : 0;
  return lv > 0 ? Math.min(TOOL_MAX_LEVEL, lv | 0) : 0;
}

/** Efeitos da ferramenta no nível dado (padrão: o nível atual). */
export function toolFx(id, lv = toolLevel(id)) {
  const t = TOOL_FX[id];
  if (!t) return {};
  const out = {};
  for (const k in t) out[k] = t[k][Math.max(0, Math.min(TOOL_MAX_LEVEL, lv))];
  return out;
}

/** Nome para exibição, com o nível quando a ferramenta foi melhorada. */
export function toolDisplayName(id, baseName) {
  if (!UPGRADABLE_TOOLS.includes(id)) return baseName;
  const lv = toolLevel(id);
  return lv > 0 ? `${baseName} · ${TOOL_TIER_NAMES[lv]}` : baseName;
}

const pct = (x) => Math.round(x * 100);

/** Texto curto com o que a ferramenta faz no nível dado (para a interface). */
export function toolBenefitText(id, lv) {
  const f = toolFx(id, lv);
  const parts = [];
  if (id === 'hoe') parts.push(f.reach === 1 ? 'ara 1 tile por uso' : `ara ${f.reach} tiles em linha por uso`);
  if (id === 'can') parts.push(f.reach === 1 ? 'rega 1 tile por uso' : `rega ${f.reach} tiles em linha por uso`);
  if (id === 'scythe') {
    const n = f.radius * 2 + 1;
    parts.push(`corta mato em ${n}×${n} tiles`);
  }
  if (id === 'axe') {
    parts.push(`golpe ${pct(f.dmg)}% de dano`);
    if (f.wood > 0) parts.push(`+${f.wood} madeira por árvore`);
  }
  if (f.energy < 1) parts.push(`${pct(1 - f.energy)}% menos energia por uso`);
  return parts.join(' · ');
}

/**
 * Avalia a próxima melhoria de uma ferramenta. Função pura: não altera nada.
 * @param {{level:number, missions:number, coins:number}} st
 * @returns {{maxed:boolean, next:number, price:number, unlockAt:number, unlocked:boolean, affordable:boolean, ok:boolean, reason:string}}
 */
export function evaluateToolUpgrade(st) {
  const level = Math.max(0, Math.min(TOOL_MAX_LEVEL, st.level | 0));
  if (level >= TOOL_MAX_LEVEL)
    return {
      maxed: true,
      next: level,
      price: 0,
      unlockAt: 0,
      unlocked: true,
      affordable: true,
      ok: false,
      reason: 'Nível máximo alcançado',
    };
  const next = level + 1,
    price = TOOL_PRICES[next - 1],
    unlockAt = TOOL_UNLOCK_MISSIONS[next - 1],
    unlocked = st.missions >= unlockAt,
    affordable = st.coins >= price;
  let reason = '';
  if (!unlocked) {
    const faltam = unlockAt - st.missions;
    reason = `Bloqueada: conclua ${unlockAt} missões (faltam ${faltam})`;
  } else if (!affordable) reason = `Faltam ${price - st.coins} moedas`;
  return { maxed: false, next, price, unlockAt, unlocked, affordable, ok: unlocked && affordable, reason };
}

/* ===================================================================================================
 * 2. QUALIDADE E EXTRAS DA COLHEITA
 * ================================================================================================= */

/** Qualidades (índice = id). `weight` em % e soma EXATAMENTE 100; `mult` multiplica o preço de venda. */
export const QUALITIES = [
  { id: 0, key: 'comum', name: 'Comum', weight: 70, mult: 1.0, color: '#e9e9e9', mark: '' },
  { id: 1, key: 'boa', name: 'Boa', weight: 20, mult: 1.25, color: '#b9c7d6', mark: '★' },
  { id: 2, key: 'excelente', name: 'Excelente', weight: 8, mult: 1.75, color: '#ffd23f', mark: '★' },
  { id: 3, key: 'premium', name: 'Premium', weight: 2, mult: 2.5, color: '#c77dff', mark: '✦' },
];

/** Unidades extras além da 1ª, por colheita. Pesos em % e soma EXATAMENTE 100. */
export const EXTRA_DROPS = [
  { extra: 0, weight: 90 },
  { extra: 1, weight: 8 },
  { extra: 2, weight: 2 },
];

/** Soma dos pesos de uma tabela (usada para validar que dá 100). */
export function weightSum(table) {
  return table.reduce((s, r) => s + r.weight, 0);
}

/**
 * Sorteio ponderado: `u` em [0,1) escolhe a linha cuja faixa cumulativa contém u*100.
 * Pesos inteiros, então não há erro de ponto flutuante nas fronteiras.
 */
export function pickWeighted(table, u) {
  const total = weightSum(table);
  let acc = 0;
  const x = u * total;
  for (const row of table) {
    acc += row.weight;
    if (x < acc) return row;
  }
  return table[table.length - 1];
}

/** Preço de venda de UMA unidade: preço-base × multiplicador, arredondado ao inteiro mais próximo. */
export function unitPrice(base, qualityId) {
  const q = QUALITIES[qualityId] || QUALITIES[0];
  return Math.round(base * q.mult);
}

/* ===================================================================================================
 * 3. SEMENTES
 * ================================================================================================= */

/** semente que cada cultura devolve (só culturas plantadas por semente entram aqui) */
export const SEED_OF = { cenoura: 'seedC', abobora: 'seedP', milho: 'seedM' };

export const SEED_CFG = {
  basePct: 25, // chance inicial (%)
  stepPct: 10, // cada melhoria soma exatamente 10 pontos percentuais
  maxPct: 95, // teto absoluto: nada pode passar disso
  upgrades: 7, // I..VII (25% -> 95%)
  firstPrice: 35000,
  growth: 1.2, // cada melhoria custa 20% mais que a anterior
};

/** Chance (0..1) de recuperar a semente no nível dado. Nunca passa de 95%. */
export function seedChance(level) {
  const lv = Math.max(0, Math.min(SEED_CFG.upgrades, level | 0));
  return Math.min(SEED_CFG.maxPct, SEED_CFG.basePct + SEED_CFG.stepPct * lv) / 100;
}

/** Preço da melhoria n (1..7): 35.000 × 1,20^(n−1), arredondado ao inteiro mais próximo. */
export function seedUpgradePrice(n) {
  return Math.round(SEED_CFG.firstPrice * Math.pow(SEED_CFG.growth, n - 1));
}

/**
 * Avalia a próxima melhoria de sementes. Função pura.
 * @param {{level:number, coins:number}} st
 */
export function evaluateSeedUpgrade(st) {
  const level = Math.max(0, Math.min(SEED_CFG.upgrades, st.level | 0));
  if (level >= SEED_CFG.upgrades)
    return {
      maxed: true,
      level,
      next: level,
      price: 0,
      affordable: true,
      ok: false,
      chanceNow: seedChance(level),
      chanceNext: seedChance(level),
      reason: 'Recuperação de sementes no nível máximo (95%)',
    };
  const next = level + 1,
    price = seedUpgradePrice(next),
    affordable = st.coins >= price;
  return {
    maxed: false,
    level,
    next,
    price,
    affordable,
    ok: affordable,
    chanceNow: seedChance(level),
    chanceNext: seedChance(next),
    reason: affordable ? '' : `Faltam ${price - st.coins} moedas`,
  };
}

/* ===================================================================================================
 * 4. SORTEIO DA COLHEITA
 * ================================================================================================= */

/**
 * Resolve uma colheita a partir da semente numérica guardada na própria plantação (`crop.rs`).
 *
 * Por que determinístico: o resultado é decidido quando a planta nasce, e não no clique. Recarregar o
 * save e colher de novo dá exatamente o mesmo resultado, então não dá para "forçar" um item raro
 * recarregando. Os três sorteios são independentes entre si (extras, qualidade por unidade e semente),
 * e a semente usa um sorteio próprio, que não depende do nível de melhoria até a hora da comparação.
 *
 * @param {number} rs semente numérica da plantação
 * @param {number} seedLevel nível atual de recuperação de sementes
 * @returns {{units:number[], extra:number, seedBack:boolean}} qualidade (id) de cada unidade produzida
 */
export function rollHarvest(rs, seedLevel) {
  const r = rngSeed(rs >>> 0);
  const extra = pickWeighted(EXTRA_DROPS, r()).extra;
  const units = [];
  for (let k = 0; k < 1 + extra; k++) units.push(pickWeighted(QUALITIES, r()).id);
  const seedBack = r() < seedChance(seedLevel);
  return { units, extra, seedBack };
}
