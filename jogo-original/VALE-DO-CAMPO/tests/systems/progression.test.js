import { test } from 'node:test';
import assert from 'node:assert/strict';
import { S as _S, setS } from '../../src/core/GameState.js';
import {
  EXTRA_DROPS,
  QUALITIES,
  SEED_CFG,
  TOOL_FX,
  TOOL_MAX_LEVEL,
  TOOL_PRICES,
  TOOL_UNLOCK_MISSIONS,
  UPGRADABLE_TOOLS,
  evaluateSeedUpgrade,
  evaluateToolUpgrade,
  pickWeighted,
  rollHarvest,
  seedChance,
  seedUpgradePrice,
  toolBenefitText,
  toolFx,
  toolLevel,
  unitPrice,
  weightSum,
} from '../../src/config/progression.js';
import { PRICE } from '../../src/config/balance.js';
import {
  buySeedUpgrade,
  buyToolUpgrade,
  completeMission,
  harvestCrop,
  missionsDone,
  qualCounts,
  sellAll,
  sellValue,
  upState,
} from '../../src/systems/Progression.js';
import { rngSeed } from '../../src/utils/Random.js';

const fresh = (o = {}) =>
  setS({
    coins: 0,
    inv: { cenoura: 0, abobora: 0, milho: 0, seedC: 0, seedP: 0, seedM: 0, madeira: 0 },
    up: { tool: { hoe: 0, can: 0, scythe: 0, axe: 0 }, seed: 0 },
    qual: {},
    missionsDone: 0,
    ...o,
  });

/* ================================ FERRAMENTAS ================================ */

test('ferramentas: começam no nível básico', () => {
  fresh();
  for (const id of UPGRADABLE_TOOLS) assert.equal(toolLevel(id), 0);
});

test('ferramentas: save antigo (sem S.up) é lido como nível básico', () => {
  setS({ coins: 0, inv: {} });
  for (const id of UPGRADABLE_TOOLS) assert.equal(toolLevel(id), 0);
  assert.equal(upState().seed, 0); // cria o estado sob demanda
});

test('ferramentas: marcos de missões 3 / 6 / 9 / 10 (a última é exceção ao passo de 3)', () => {
  assert.deepEqual(TOOL_UNLOCK_MISSIONS, [3, 6, 9, 10]);
  const unlocked = (m) => TOOL_UNLOCK_MISSIONS.filter((x) => m >= x).length;
  const esperado = { 0: 0, 1: 0, 2: 0, 3: 1, 5: 1, 6: 2, 8: 2, 9: 3, 10: 4, 11: 4, 12: 4 };
  for (const [m, lv] of Object.entries(esperado)) assert.equal(unlocked(+m), lv, `${m} missões`);
  // a avaliação concorda: com 9 missões o nível 4 ainda está bloqueado; com 10 libera
  assert.equal(evaluateToolUpgrade({ level: 3, missions: 9, coins: 1e9 }).ok, false);
  assert.equal(evaluateToolUpgrade({ level: 3, missions: 10, coins: 1e9 }).ok, true);
});

test('ferramentas: bloqueada explica o motivo; sem moedas explica o que falta', () => {
  const bloq = evaluateToolUpgrade({ level: 0, missions: 1, coins: 1e9 });
  assert.equal(bloq.unlocked, false);
  assert.match(bloq.reason, /3 missões/);
  assert.match(bloq.reason, /faltam 2/);
  const pobre = evaluateToolUpgrade({ level: 0, missions: 3, coins: TOOL_PRICES[0] - 1 });
  assert.equal(pobre.ok, false);
  assert.match(pobre.reason, /Faltam 1 moedas/);
});

test('ferramentas: preços crescem a cada nível e só usam moedas', () => {
  assert.equal(TOOL_PRICES.length, TOOL_MAX_LEVEL);
  for (let i = 1; i < TOOL_PRICES.length; i++) assert.ok(TOOL_PRICES[i] > TOOL_PRICES[i - 1]);
});

test('ferramentas: sem missões suficientes a compra é recusada e nada é cobrado', () => {
  fresh({ coins: 99999, missionsDone: 2 });
  const r = buyToolUpgrade('axe', 1);
  assert.equal(r.ok, false);
  assert.equal(toolLevel('axe'), 0);
  assert.equal(_S.coins, 99999);
});

test('ferramentas: falta de moedas impede a compra', () => {
  fresh({ coins: TOOL_PRICES[0] - 1, missionsDone: 3 });
  assert.equal(buyToolUpgrade('hoe', 1).ok, false);
  assert.equal(toolLevel('hoe'), 0);
  assert.equal(_S.coins, TOOL_PRICES[0] - 1);
});

test('ferramentas: compra válida desconta UMA vez e aplica o nível na hora', () => {
  fresh({ coins: 1000, missionsDone: 3 });
  const r = buyToolUpgrade('hoe', 1);
  assert.deepEqual([r.ok, r.level, r.price], [true, 1, TOOL_PRICES[0]]);
  assert.equal(_S.coins, 1000 - TOOL_PRICES[0]);
  assert.equal(toolLevel('hoe'), 1);
  assert.equal(toolFx('hoe').reach, TOOL_FX.hoe.reach[1]); // o efeito já vale
});

test('ferramentas: clique duplo / tela velha não compra o mesmo nível duas vezes', () => {
  fresh({ coins: 100000, missionsDone: 12 });
  assert.equal(buyToolUpgrade('can', 1).ok, true);
  const coins = _S.coins;
  assert.equal(buyToolUpgrade('can', 1).ok, false); // mesmo botão, tela desatualizada
  assert.equal(_S.coins, coins);
  assert.equal(toolLevel('can'), 1);
});

test('ferramentas: nunca passa do nível máximo e as outras ferramentas não mudam', () => {
  fresh({ coins: 1e9, missionsDone: 99 });
  for (let n = 1; n <= TOOL_MAX_LEVEL; n++) assert.equal(buyToolUpgrade('scythe', n).ok, true);
  const coins = _S.coins;
  const r = buyToolUpgrade('scythe', TOOL_MAX_LEVEL + 1);
  assert.equal(r.ok, false);
  assert.equal(buyToolUpgrade('scythe').ok, false);
  assert.equal(toolLevel('scythe'), TOOL_MAX_LEVEL);
  assert.equal(_S.coins, coins);
  assert.equal(toolLevel('axe'), 0);
  assert.equal(buyToolUpgrade('rod', 1).ok, false); // id que não é melhorável
});

test('ferramentas: a progressão de missões é global (vale para todas as ferramentas)', () => {
  fresh({ coins: 1e6, missionsDone: 3 });
  for (const id of UPGRADABLE_TOOLS) assert.equal(buyToolUpgrade(id, 1).ok, true, id);
});

test('ferramentas: cada nível tem efeito perceptível e tabelas completas', () => {
  for (const id of UPGRADABLE_TOOLS) {
    for (const k in TOOL_FX[id]) assert.equal(TOOL_FX[id][k].length, TOOL_MAX_LEVEL + 1, `${id}.${k}`);
    for (let lv = 1; lv <= TOOL_MAX_LEVEL; lv++)
      assert.notEqual(toolBenefitText(id, lv), toolBenefitText(id, lv - 1), `${id} nível ${lv} igual ao anterior`);
  }
  assert.equal(toolFx('hoe', 0).reach, 1); // básica = comportamento original
  assert.equal(toolFx('scythe', 0).radius, 1); // 3x3 original
  assert.equal(toolFx('axe', 0).dmg, 1);
});

test('ferramentas: o upgrade de ferramenta não mexe em qualidade, extras nem sementes', () => {
  fresh({ coins: 1e6, missionsDone: 12 });
  const antes = rollHarvest(123456, 0);
  for (const id of UPGRADABLE_TOOLS) for (let n = 1; n <= 4; n++) buyToolUpgrade(id, n);
  assert.deepEqual(rollHarvest(123456, upState().seed), antes);
});

/* ================================ MISSÕES ================================ */

test('missões: cada missão recebida soma exatamente 1 (global)', () => {
  fresh();
  assert.equal(missionsDone(), 0);
  completeMission();
  completeMission();
  assert.equal(missionsDone(), 2);
});

/* ================================ QUALIDADE ================================ */

test('qualidade: probabilidades e extras somam exatamente 100', () => {
  assert.equal(weightSum(QUALITIES), 100);
  assert.equal(weightSum(EXTRA_DROPS), 100);
  assert.deepEqual(QUALITIES.map((q) => q.weight), [70, 20, 8, 2]);
  assert.deepEqual(EXTRA_DROPS.map((e) => e.weight), [90, 8, 2]);
  assert.deepEqual(EXTRA_DROPS.map((e) => e.extra), [0, 1, 2]);
});

test('qualidade: multiplicadores de venda e arredondamento por unidade', () => {
  assert.deepEqual(QUALITIES.map((q) => q.mult), [1, 1.25, 1.75, 2.5]);
  assert.deepEqual([0, 1, 2, 3].map((q) => unitPrice(35, q)), [35, 44, 61, 88]); // 43,75 / 61,25 / 87,5
  assert.deepEqual([0, 1, 2, 3].map((q) => unitPrice(80, q)), [80, 100, 140, 200]);
});

test('qualidade: fronteiras do sorteio ponderado (sem erro de ponto flutuante)', () => {
  const q = (u) => pickWeighted(QUALITIES, u).id;
  assert.equal(q(0), 0);
  assert.equal(q(0.6999), 0);
  assert.equal(q(0.7), 1);
  assert.equal(q(0.8999), 1);
  assert.equal(q(0.9), 2);
  assert.equal(q(0.9799), 2);
  assert.equal(q(0.98), 3);
  assert.equal(q(0.999999), 3);
});

test('colheita: simulação estatística (qualidade, extras e semente) em 300 mil colheitas', () => {
  const N = 300000,
    r = rngSeed(2026),
    seedLvl = 0;
  const qc = [0, 0, 0, 0],
    ec = [0, 0, 0];
  let units = 0,
    seeds = 0,
    maxUnits = 0;
  for (let i = 0; i < N; i++) {
    const h = rollHarvest((r() * 4294967296) >>> 0, seedLvl);
    ec[h.extra]++;
    units += h.units.length;
    maxUnits = Math.max(maxUnits, h.units.length);
    for (const q of h.units) qc[q]++;
    if (h.seedBack) seeds++;
  }
  const near = (got, want, tol, what) => assert.ok(Math.abs(got - want) <= tol, `${what}: ${got.toFixed(4)} ≠ ${want} (±${tol})`);
  near(ec[0] / N, 0.9, 0.004, 'extra 0');
  near(ec[1] / N, 0.08, 0.004, 'extra 1');
  near(ec[2] / N, 0.02, 0.003, 'extra 2');
  near(qc[0] / units, 0.7, 0.005, 'comum');
  near(qc[1] / units, 0.2, 0.005, 'boa');
  near(qc[2] / units, 0.08, 0.004, 'excelente');
  near(qc[3] / units, 0.02, 0.003, 'premium');
  near(seeds / N, 0.25, 0.005, 'semente (básico)');
  assert.equal(maxUnits, 3, 'extras limitados a +2 unidades (1 + 2)');
  near(units / N, 1.12, 0.01, 'média de unidades por colheita (1 + 0,08 + 0,04)');
});

test('colheita: chance de semente bate com cada nível (25% … 95%)', () => {
  const N = 120000;
  for (let lv = 0; lv <= SEED_CFG.upgrades; lv++) {
    const r = rngSeed(500 + lv);
    let hit = 0;
    for (let i = 0; i < N; i++) if (rollHarvest((r() * 4294967296) >>> 0, lv).seedBack) hit++;
    assert.ok(Math.abs(hit / N - seedChance(lv)) < 0.006, `nível ${lv}: ${(hit / N).toFixed(4)} vs ${seedChance(lv)}`);
  }
});

test('colheita: é determinística por planta (recarregar o save não muda o resultado)', () => {
  for (const rs of [1, 42, 987654321, 4294967295]) assert.deepEqual(rollHarvest(rs, 3), rollHarvest(rs, 3));
});

test('colheita: qualidade e extras não dependem do nível de sementes (sorteios independentes)', () => {
  const r = rngSeed(77);
  for (let i = 0; i < 2000; i++) {
    const rs = (r() * 4294967296) >>> 0,
      a = rollHarvest(rs, 0),
      b = rollHarvest(rs, 7);
    assert.deepEqual(a.units, b.units);
    assert.equal(a.extra, b.extra);
    if (a.seedBack) assert.ok(b.seedBack); // quem recupera no nível 0 recupera nos níveis maiores
  }
});

test('colheita: entrega exata no inventário, com qualidade registrada, e nunca processa duas vezes', () => {
  fresh();
  const crop = { k: 'cenoura', d: 3, need: 3, w: true, rs: 123 };
  const esperado = rollHarvest(123, 0);
  const res = harvestCrop(crop);
  assert.deepEqual(res.units, esperado.units);
  assert.equal(_S.inv.cenoura, esperado.units.length);
  assert.equal(_S.inv.seedC, esperado.seedBack ? 1 : 0);
  const c = qualCounts('cenoura');
  assert.equal(c[0] + c[1] + c[2] + c[3], _S.inv.cenoura);
  assert.equal(harvestCrop(crop), null); // mesmo objeto de novo: nada acontece
  assert.equal(_S.inv.cenoura, esperado.units.length);
});

test('colheita: planta de save antigo (sem rs) recebe semente na hora e continua válida', () => {
  fresh();
  const crop = { k: 'milho', d: 4, need: 4, w: false };
  const res = harvestCrop(crop);
  assert.ok(res && res.units.length >= 1);
  assert.equal(typeof crop.rs, 'number');
  assert.equal(_S.inv.milho, res.units.length);
});

test('colheita: culturas sem semente não geram item inválido', () => {
  fresh();
  const res = harvestCrop({ k: 'coisa-estranha', rs: 9 });
  assert.equal(res.seedBack, false);
  assert.equal(res.seedId, null);
  assert.deepEqual(Object.keys(_S.inv).filter((k) => k.startsWith('seed') && _S.inv[k] > 0), []);
});

test('venda: aplica o multiplicador de cada qualidade e zera o que vendeu', () => {
  fresh();
  _S.inv.cenoura = 10;
  _S.qual.cenoura = [4, 2, 1]; // 3 comuns, 4 boas, 2 excelentes, 1 premium
  const esperado = 3 * 35 + 4 * 44 + 2 * 61 + 1 * 88;
  assert.equal(sellValue(), esperado);
  assert.equal(sellAll(), esperado);
  assert.equal(_S.coins, esperado);
  assert.equal(_S.inv.cenoura, 0);
  assert.deepEqual(_S.qual.cenoura, [0, 0, 0]);
  assert.equal(sellAll(), 0); // nada para vender
  assert.equal(_S.coins, esperado); // não cobra nem paga de novo
});

test('venda: itens sem qualidade (cogumelo etc.) seguem o preço-base', () => {
  fresh();
  _S.inv.cogumelo = 4;
  assert.equal(sellAll(), 4 * PRICE.cogumelo);
});

test('inventário: se algo tirar itens por fora, a qualidade nunca passa do total', () => {
  fresh();
  _S.inv.abobora = 2;
  _S.qual.abobora = [3, 1, 1]; // inconsistente de propósito
  const c = qualCounts('abobora');
  assert.equal(c.reduce((a, b) => a + b, 0), 2);
  assert.ok(c.every((n) => n >= 0));
  assert.equal(c[3], 0); // tira da maior qualidade primeiro (nada de lucro indevido)
});

/* ================================ SEMENTES ================================ */

test('sementes: chance inicial 25%, +10 pontos por melhoria, teto exato de 95%', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map(seedChance), [0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95]);
  assert.equal(seedChance(8), 0.95);
  assert.equal(seedChance(1000), 0.95);
  for (let lv = 1; lv <= 7; lv++) assert.equal(Math.round((seedChance(lv) - seedChance(lv - 1)) * 100), 10);
});

test('sementes: preços 35.000 × 1,20^(n−1) conferem com a tabela de referência', () => {
  const ref = [35000, 42000, 50400, 60480, 72576, 87091, 104509];
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map(seedUpgradePrice), ref);
  // e cada melhoria custa 20% a mais que a anterior (com o arredondamento de sempre)
  for (let n = 2; n <= 7; n++) assert.ok(Math.abs(seedUpgradePrice(n) - Math.round(seedUpgradePrice(n - 1) * 1.2)) <= 1);
  assert.equal(
    ref.reduce((a, b) => a + b, 0),
    452056,
  ); // custo total para chegar a 95%
});

test('sementes: sem moedas não compra; com moedas compra uma vez; o máximo bloqueia', () => {
  fresh({ coins: 34999 });
  assert.equal(buySeedUpgrade(1).ok, false);
  assert.equal(_S.coins, 34999);
  assert.equal(upState().seed, 0);

  fresh({ coins: 1e7 });
  let gasto = 0;
  for (let n = 1; n <= 7; n++) {
    const r = buySeedUpgrade(n);
    assert.equal(r.ok, true, `melhoria ${n}`);
    assert.equal(r.price, seedUpgradePrice(n));
    gasto += r.price;
  }
  assert.equal(_S.coins, 1e7 - gasto);
  assert.equal(upState().seed, 7);
  assert.equal(seedChance(upState().seed), 0.95);
  const coins = _S.coins;
  assert.equal(buySeedUpgrade(8).ok, false);
  assert.equal(buySeedUpgrade().ok, false);
  assert.equal(_S.coins, coins);
  assert.equal(upState().seed, 7);
  assert.equal(evaluateSeedUpgrade({ level: 7, coins: 1e9 }).maxed, true);
});

test('sementes: tela velha não compra o mesmo nível duas vezes', () => {
  fresh({ coins: 1e6 });
  assert.equal(buySeedUpgrade(1).ok, true);
  const coins = _S.coins;
  assert.equal(buySeedUpgrade(1).ok, false);
  assert.equal(_S.coins, coins);
  assert.equal(upState().seed, 1);
});

/* ================================ PERSISTÊNCIA ================================ */

test('persistência: salvar e carregar (JSON) preserva níveis, qualidade, missões e moedas', () => {
  fresh({ coins: 1e6, missionsDone: 10 });
  buyToolUpgrade('axe', 1);
  buyToolUpgrade('axe', 2);
  buySeedUpgrade(1);
  harvestCrop({ k: 'abobora', rs: 31337 });
  completeMission();
  const salvo = JSON.stringify(_S);
  const antes = { coins: _S.coins, inv: { ..._S.inv }, qual: JSON.stringify(_S.qual), missions: missionsDone() };

  setS(JSON.parse(salvo)); // "recarrega"
  assert.equal(toolLevel('axe'), 2);
  assert.equal(upState().seed, 1);
  assert.equal(_S.coins, antes.coins);
  assert.deepEqual(_S.inv, antes.inv);
  assert.equal(JSON.stringify(_S.qual), antes.qual);
  assert.equal(missionsDone(), antes.missions);
  // recarregar não devolve moedas nem repete a compra: o nível 2 já foi pago
  assert.equal(buyToolUpgrade('axe', 2).ok, false);
  assert.equal(_S.coins, antes.coins);
});

test('persistência: save de antes do sistema (sem up/qual/missionsDone) carrega sem erro', () => {
  setS({ coins: 77, inv: { cenoura: 3 } });
  assert.equal(toolLevel('hoe'), 0);
  assert.equal(upState().seed, 0);
  assert.equal(missionsDone(), 0);
  assert.deepEqual(qualCounts('cenoura'), [3, 0, 0, 0]);
  assert.equal(sellAll(), 3 * 35);
});
