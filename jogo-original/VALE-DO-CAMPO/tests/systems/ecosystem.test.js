import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAY_MIN, MW, MH, ROCK, TREE, FENCE, HOUSE, TS } from '../../src/config/constants.js';
import {
  CAMO,
  ECO,
  HUNT,
  PLAYER_PREY,
  aggression,
  huntFor,
  STATUS_COLORS,
  STATUS_LAYOUT,
  camouflage,
  canSwitch,
  detects,
  fmtAge,
  huntDecision,
  huntOpportunity,
  lifeStage,
  rearFactor,
  satToNeed,
  sightRange,
  statusScale,
  targetVisibility,
} from '../../src/config/ecosystem.js';
import {
  claimPlayerHunt,
  ecoTick,
  hasLOS,
  memAdd,
  memFind,
  memNear,
  occlusion,
  playerFx,
  playerHunter,
  playerHurtTruce,
  playerSlow,
  releasePlayerHunt,
  resetEcology,
  percTick,
} from '../../src/entities/ai/Perception.js';

/* ---------- camuflagem da sucuri ---------- */
test('camuflagem: água > mato alto > (mato baixo ≈ solo) > areia; parada > em movimento; perde ao atacar e recupera', () => {
  const w = camouflage({ kind: 'water' }),
    gh = camouflage({ kind: 'grass', mato: 1 }),
    gl = camouflage({ kind: 'grass', mato: 0 }),
    so = camouflage({ kind: 'soil' }),
    sa = camouflage({ kind: 'sand' });
  assert.ok(w > gh && gh > gl && gh > so && gl > sa && so > sa, [w, gh, gl, so, sa].join(','));
  assert.ok(camouflage({ kind: 'water', moving: true }) < w);
  assert.equal(camouflage({ kind: 'water', expose: CAMO.exposeT }), 0);
  const half = camouflage({ kind: 'water', expose: CAMO.exposeT / 2 });
  assert.ok(half > 0 && half < w);
  assert.ok(camouflage({ kind: 'grass', mato: 0.5, night: 1 }) > camouflage({ kind: 'grass', mato: 0.5, night: 0 }));
  for (const k of ['water', 'grass', 'soil', 'sand', 'path', 'stone', 'other']) {
    const c = camouflage({ kind: k, mato: 1, night: 1 });
    assert.ok(c >= 0 && c <= 1, k);
  }
});

test('camuflagem nunca torna a sucuri invisível por padrão (< 1)', () => {
  assert.ok(camouflage({ kind: 'water', night: 1 }) < 1);
});

/* ---------- visibilidade e detecção ---------- */
test('visibilidade: parado < andando < correndo; mato e camuflagem reduzem; tocha aumenta', () => {
  const still = targetVisibility({ moving: false }),
    walk = targetVisibility({ moving: true }),
    run = targetVisibility({ moving: true, running: true });
  assert.ok(still < walk && walk < run);
  assert.ok(targetVisibility({ moving: true, cover: 1 }) < walk);
  assert.ok(targetVisibility({ moving: true, camo: 0.9 }) < walk * 0.4);
  assert.ok(targetVisibility({ moving: true, lit: true }) > walk);
  assert.ok(targetVisibility({ moving: true, stalking: true }) < walk);
});

test('alcance de visão: cai à noite e com a cabeça baixa; atrás enxerga menos', () => {
  for (const sp of Object.keys(ECO)) {
    assert.ok(sightRange(sp, 1) < sightRange(sp, 0), sp);
    assert.ok(sightRange(sp, 0, 0.4) < sightRange(sp, 0, 1), sp);
  }
  assert.equal(rearFactor(1), 1);
  assert.ok(rearFactor(-1) < 0.6);
  assert.ok(rearFactor(-1) < rearFactor(-0.6));
});

test('detecção: visão exige alcance; oclusão total tapa; audição só de movimento rápido', () => {
  const base = { dist: 100, range: 150, vis: 1, occlusion: 0, rear: 1, hear: 60, loud: false };
  assert.equal(detects(base).seen, true);
  assert.equal(detects({ ...base, dist: 200 }).any, false);
  assert.equal(detects({ ...base, occlusion: 1 }).seen, false);
  assert.equal(detects({ ...base, dist: 25, occlusion: 1, loud: true }).heard, true);
  assert.equal(detects({ ...base, dist: 25, occlusion: 1, loud: false }).heard, false);
  assert.equal(detects({ ...base, dist: 50, occlusion: 1, loud: true }).heard, false, 'meia oclusão encurta a audição');
});

/* ---------- oclusão (linha de visão) ---------- */
test('oclusão: pedra/casa tapam; árvore tapa 0,45 cada; cerca deixa ver; origem/destino não contam', () => {
  const o = new Uint8Array(MW * MH);
  const at = (x, y, v) => (o[y * MW + x] = v);
  const P = (tx, ty) => [tx * TS + 8, ty * TS + 8];
  const [ax, ay] = P(10, 10),
    [bx, by] = P(20, 10);
  assert.equal(occlusion(ax, ay, bx, by, o), 0);
  at(15, 10, ROCK);
  assert.equal(occlusion(ax, ay, bx, by, o), 1);
  at(15, 10, HOUSE);
  assert.equal(occlusion(ax, ay, bx, by, o), 1);
  at(15, 10, FENCE);
  assert.equal(occlusion(ax, ay, bx, by, o), 0);
  at(15, 10, TREE);
  assert.ok(Math.abs(occlusion(ax, ay, bx, by, o) - 0.45) < 1e-9);
  assert.equal(hasLOS(ax, ay, bx, by, o), true);
  at(16, 10, TREE);
  assert.ok(occlusion(ax, ay, bx, by, o) >= 0.9);
  assert.equal(hasLOS(ax, ay, bx, by, o), false);
  const o2 = new Uint8Array(MW * MH);
  o2[10 * MW + 10] = TREE; // árvore no tile de origem
  o2[10 * MW + 20] = TREE; // e no de destino
  assert.equal(occlusion(ax, ay, bx, by, o2), 0);
});

/* ---------- caça: oportunidade ≠ fome ---------- */
const opp = (o) =>
  huntOpportunity({ need: 0.1, dist: 120, scanR: 320, vPred: 120, vPrey: 100, alert: 0, stamina: 1, value: 0.6, counter: 0.1, drive: HUNT.jaguar.drive, riskAv: HUNT.jaguar.riskAv, ...o });

test('oportunidade: aumenta com a fome do predador e diminui com a distância', () => {
  assert.ok(opp({ need: 0.9 }).score > opp({ need: 0.1 }).score);
  assert.ok(opp({ dist: 40 }).score > opp({ dist: 300 }).score);
  assert.ok(opp({ vPrey: 60 }).pCatch > opp({ vPrey: 130 }).pCatch);
  assert.ok(opp({ alert: 1 }).pCatch < opp({ alert: 0 }).pCatch);
  assert.ok(opp({ counter: 0.9 }).score < opp({ counter: 0 }).score);
});

test('saciado ainda pode observar (interesse ≠ fome); faminto ataca; presa fora de alcance é ignorada', () => {
  const sated = opp({ need: 0.05, dist: 90 }),
    hungry = opp({ need: 0.9, dist: 90 });
  assert.notEqual(huntDecision(sated, HUNT.jaguar), 'skip');
  assert.equal(huntDecision(hungry, HUNT.jaguar), 'attack');
  assert.equal(huntDecision(opp({ need: 0.05, dist: 320, vPrey: 125, counter: 0.9 }), HUNT.jaguar), 'skip');
  // saciado quase nunca ataca algo sem vantagem
  assert.notEqual(huntDecision(opp({ need: 0, dist: 200, vPrey: 118, counter: 0.5 }), HUNT.jaguar), 'attack');
});

test('histerese: só troca de estado depois da duração mínima, salvo emergência', () => {
  assert.equal(canSwitch(0.2, 1), false);
  assert.equal(canSwitch(1.2, 1), true);
  assert.equal(canSwitch(0.2, 1, true), true);
});

/* ---------- jogador como presa: parâmetros de equilíbrio ---------- */
test('jogador como presa: onça é rápida mas não instantânea e dá para escapar', () => {
  const J = PLAYER_PREY.jaguar;
  const walk = 60,
    run = 78;
  assert.ok(J.burst > run * 1.15, 'burst acima de correr (a fome ainda soma +7%)');
  assert.ok(J.burst < run * 2.0, 'mas não absurdo');
  assert.ok(J.accel > 0 && J.accel < 10, 'acelera, não teleporta');
  assert.ok(J.burstT < 5, 'o fôlego acaba');
  assert.ok(J.bite < 30, 'não mata de uma vez');
  assert.equal(J.afterBiteCool, 0, 'sem trégua: a onça segue a perseguição depois de morder');
  assert.equal(J.bites, Infinity, 'sem limite de mordidas por investida: persegue até o jogador escapar');
  // distância que o burst cobre antes de acabar o fôlego vs. a vantagem do jogador correndo: precisa haver fuga possível
  const closing = (J.burst - run) * J.burstT;
  assert.ok(closing < J.giveUpDist, 'um jogador correndo que ganha distância escapa');
  assert.ok(walk < run);
});

test('sucuri: aviso curto; bote curto; presa TRAVA o jogador e dá para se debater para sair', () => {
  const A = PLAYER_PREY.anaconda;
  assert.ok(A.telegraph >= 0.25 && A.telegraph <= 0.8);
  assert.ok(A.dashT * A.dash < A.reach * 2.4, 'o bote não alcança muito além do alcance');
  assert.equal(A.holdSlow, 0, 'preso pela sucuri o jogador não anda');
  assert.ok(A.holdT >= 3 && A.holdT <= 7, 'a constrição dura alguns segundos');
  assert.ok(A.struggle > 0 && A.holdT / A.struggle <= 14, 'dá para se soltar se debatendo (poucos toques)');
  assert.ok(A.freeT >= 3, 'depois de soltar, o jogador tem tempo de fugir');
  assert.ok(A.holdBite * Math.ceil(A.holdT / A.holdEvery) < 100, 'a constrição inteira, sem se debater, ainda não mata sozinha de 100 de vida');
  assert.ok(A.minCamo > 0.3, 'sem camuflagem não há emboscada');
});

test('onça: bote (salto) é mais rápido que a corrida e curto; fome só deixa mais agressiva', () => {
  const J = PLAYER_PREY.jaguar;
  assert.ok(J.leap.speed > J.burst * 2, 'o salto é muito mais rápido que a corrida');
  assert.ok(J.leap.speed * J.leap.time < 100, 'mas curto: cobre menos de ~100 px');
  assert.ok(J.leap.range[0] < J.leap.range[1] && J.leap.range[1] <= J.leap.speed * J.leap.time, 'o salto alcança o que mira');
  assert.ok(J.bite >= 18, 'a mordida pesa');
  assert.equal(aggression(0), 0);
  assert.equal(aggression(0.35), 0, 'saciada ou com fome leve: comportamento normal');
  assert.ok(aggression(0.7) > 0.4 && aggression(0.7) < 0.8);
  assert.equal(aggression(1), 1);
  const calm = huntFor(HUNT.jaguar, 0),
    hot = huntFor(HUNT.jaguar, 1);
  assert.equal(calm.commitMin, HUNT.jaguar.commitMin);
  assert.ok(hot.commitMin < calm.commitMin && hot.drive > calm.drive && hot.riskAv < calm.riskAv, 'faminta ataca com mais facilidade e aceita mais risco');
  assert.ok(hot.giveUp > calm.giveUp && hot.cool < calm.cool, 'faminta persegue por mais tempo e descansa menos');
});

/* ---------- memória e trava de caça ---------- */
test('memória guarda posições com validade, limite de itens e expira', () => {
  resetEcology();
  const a = { id: 1 };
  memAdd(a, 'threat', 100, 100, 7);
  assert.ok(memFind(a, 'threat'));
  assert.ok(memNear(a, 110, 100, 30));
  assert.equal(memNear(a, 400, 400, 30), null);
  for (let i = 0; i < 10; i++) memAdd(a, 'threat', 500 + i * 100, 0, 100 + i);
  assert.ok(a.mem.length <= 3, 'cap de memória');
  ecoTick(60, 0); // passa o tempo
  assert.equal(memFind(a, 'threat'), null);
  assert.equal(a.mem.length, 0);
});

test('só um predador caça o jogador por vez; trégua depois de ferir', () => {
  resetEcology();
  assert.equal(claimPlayerHunt(1, 3), true);
  assert.equal(claimPlayerHunt(2, 3), false, 'outro predador não entra');
  assert.equal(claimPlayerHunt(1, 3), true, 'o dono renova');
  assert.equal(playerHunter(), 1);
  releasePlayerHunt(1);
  assert.equal(playerHunter(), 0);
  assert.equal(claimPlayerHunt(2, 3), true);
  playerHurtTruce(30);
  assert.equal(playerHunter(), 0);
  assert.equal(claimPlayerHunt(3, 3), false, 'trégua');
  ecoTick(31, 0);
  assert.equal(claimPlayerHunt(3, 3), true, 'depois da trégua volta');
});

test('percepção escalonada: cada consumidor tem o seu relógio e dispara ~a cada 0,25 s', () => {
  const a = { id: 3 };
  let n1 = 0,
    n2 = 0;
  for (let i = 0; i < 100; i++) {
    if (percTick(a, 0.05, 's')) n1++;
    if (percTick(a, 0.05, 'j')) n2++;
  }
  assert.ok(n1 >= 19 && n1 <= 21 && n2 >= 19 && n2 <= 21, n1 + ',' + n2); // 5 s / 0,25 s = 20
});

test('abraço da sucuri: reduz a velocidade só durante o tempo e some sozinho', () => {
  resetEcology();
  assert.equal(playerSlow(), 1);
  playerFx.snareUntil = 1.5;
  playerFx.snareSlow = 0.35;
  assert.equal(playerSlow(), 0.35);
  ecoTick(2, 0);
  assert.equal(playerSlow(), 1);
});

/* ---------- indicadores ---------- */
test('idade: formato curto e legível', () => {
  assert.equal(fmtAge(0), '0m');
  assert.equal(fmtAge(45.9), '45m');
  assert.equal(fmtAge(60), '1h');
  assert.equal(fmtAge(7 * 60 + 5), '7h');
  assert.equal(fmtAge(DAY_MIN), '1d 0h');
  assert.equal(fmtAge(2 * DAY_MIN + 5 * 60), '2d 5h');
  assert.equal(fmtAge(-5), '0m');
  assert.equal(fmtAge(undefined), '0m');
});

test('fase da vida', () => {
  assert.equal(lifeStage(10, 150, 800), 'filhote');
  assert.equal(lifeStage(300, 150, 800), 'adulto');
  assert.equal(lifeStage(700, 150, 800), 'idoso');
  assert.equal(lifeStage(700, 150, 0), 'adulto');
});

test('galinha: saciedade 0..100 vira necessidade 0..1', () => {
  assert.equal(satToNeed(100), 0);
  assert.equal(satToNeed(0), 1);
  assert.equal(satToNeed(25), 0.75);
  assert.equal(satToNeed(NaN), 1);
  assert.equal(satToNeed(300), 0);
});

test('indicadores: cores distintas, escala mínima legível, raio de 6 blocos coberto', () => {
  const { hunger, thirst, hungerCrit, thirstCrit } = STATUS_COLORS;
  assert.equal(new Set([hunger, thirst, hungerCrit, thirstCrit]).size, 4);
  assert.ok(STATUS_LAYOUT.showR >= 6 * TS, '6 blocos = 96 px');
  assert.ok(STATUS_LAYOUT.fadeFrom >= 6 * TS, 'opaco até 6 blocos');
  assert.ok(STATUS_LAYOUT.barH >= 3);
  assert.ok(statusScale(1) > statusScale(3), 'tela pequena → bloco maior');
  assert.ok(statusScale(0.5) <= 1.75 && statusScale(3) >= 1);
  // texto ≥ 10 px CSS e barra ≥ 3 px CSS na menor escala usada
  for (const css of [1, 1.5, 2, 3]) {
    const k = statusScale(css);
    assert.ok(7 * k * css >= 9.5 || k === 1.75, 'texto legível em css=' + css);
    assert.ok(STATUS_LAYOUT.barH * k * css >= 3);
  }
});
