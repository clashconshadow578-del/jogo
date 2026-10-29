import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAY_MIN, FENCE, GATE, GATE_OPEN, GRASS, SAND, WATER, FORD, BED, SOIL, TS } from '../../src/config/constants.js';
import {
  FRAME,
  checkBuildTile,
  entityTouchesTile,
  fenceFrame,
  fenceMask,
  isFenceCode,
  isGateCode,
} from '../../src/config/fences.js';
import { RECIPES, missingMaterials } from '../../src/config/crafting.js';
import { FOOD, LURE_HYSTERESIS_PX, attracts, lureDecision, lureSlot } from '../../src/config/animalFood.js';
import { EGG_CFG, dueToHatch, dueToLay, firstLayAt, hatchAt, nextLayAt, planLays } from '../../src/config/eggs.js';

const free = { inBounds: true, ground: GRASS, obj: 0, hasCrop: false, hasNest: false, hasShroom: false, hasSapling: false, inside: false };

/* ---------- códigos e autotile ---------- */
test('códigos de cerca e portão', () => {
  assert.ok(isFenceCode(FENCE) && isFenceCode(GATE) && isFenceCode(GATE_OPEN));
  assert.ok(!isFenceCode(0) && !isFenceCode(99));
  assert.ok(isGateCode(GATE) && isGateCode(GATE_OPEN) && !isGateCode(FENCE));
});

test('máscara de conexões: N=1 E=2 S=4 O=8', () => {
  assert.equal(fenceMask(0, 0, 0, 0), 0);
  assert.equal(fenceMask(1, 0, 0, 0), 1);
  assert.equal(fenceMask(0, 1, 0, 0), 2);
  assert.equal(fenceMask(0, 0, 1, 0), 4);
  assert.equal(fenceMask(0, 0, 0, 1), 8);
  assert.equal(fenceMask(1, 1, 1, 1), 15);
});

test('cada uma das 16 combinações de vizinhos dá um quadro distinto, sempre de 0 a 15', () => {
  const seen = new Set();
  for (let m = 0; m < 16; m++) {
    const f = fenceFrame(FENCE, !!(m & 1), !!(m & 2), !!(m & 4), !!(m & 8));
    assert.equal(f, m);
    seen.add(f);
  }
  assert.equal(seen.size, 16);
});

test('portões: horizontal por padrão, vertical só com vizinhos N/S sem L/O; aberto usa outro quadro', () => {
  assert.equal(fenceFrame(GATE, 0, 1, 0, 1), FRAME.GATE_H_CLOSED);
  assert.equal(fenceFrame(GATE, 0, 0, 0, 0), FRAME.GATE_H_CLOSED);
  assert.equal(fenceFrame(GATE_OPEN, 0, 1, 0, 1), FRAME.GATE_H_OPEN);
  assert.equal(fenceFrame(GATE, 1, 0, 1, 0), FRAME.GATE_V_CLOSED);
  assert.equal(fenceFrame(GATE_OPEN, 1, 0, 1, 0), FRAME.GATE_V_OPEN);
  // vizinhos nos dois eixos (canto): fica horizontal
  assert.equal(fenceFrame(GATE, 1, 1, 0, 0), FRAME.GATE_H_CLOSED);
  assert.equal(FRAME.COUNT, 20);
});

/* ---------- onde pode construir ---------- */
test('construção: tile livre é válido', () => {
  assert.deepEqual(checkBuildTile(free), { ok: true, reason: '' });
  assert.ok(checkBuildTile({ ...free, ground: SOIL }).ok);
  assert.ok(checkBuildTile({ ...free, ground: SAND }).ok);
});

test('construção: recusa água, vau, piso interno, fora do mapa, casa, objeto, plantação, muda, cogumelo e ninho', () => {
  for (const w of [
    { ground: WATER },
    { ground: FORD },
    { ground: BED },
    { inBounds: false },
    { inside: true },
    { obj: FENCE },
    { obj: 3 },
    { hasCrop: true },
    { hasSapling: true },
    { hasShroom: true },
    { hasNest: true },
  ]) {
    const r = checkBuildTile({ ...free, ...w });
    assert.equal(r.ok, false, JSON.stringify(w));
    assert.ok(r.reason.length > 3);
  }
});

test('colisão da caixa da entidade com um tile (mesmas medidas de blocked)', () => {
  const tx = 10,
    ty = 10,
    cx = tx * TS + 8,
    cy = ty * TS + 8;
  assert.ok(entityTouchesTile(cx, cy, tx, ty));
  assert.ok(entityTouchesTile(tx * TS - 3, cy, tx, ty)); // x+3,9 invade o tile
  assert.ok(!entityTouchesTile(tx * TS - 4.5, cy, tx, ty));
  assert.ok(!entityTouchesTile(cx, ty * TS - 3.5 - 3, tx, ty));
  // margem de segurança alarga a caixa
  assert.ok(!entityTouchesTile(tx * TS - 6, cy, tx, ty));
  assert.ok(entityTouchesTile(tx * TS - 6, cy, tx, ty, 3));
});

/* ---------- fabricação ---------- */
test('receitas: cerca = 5 madeira; portão = 10 madeira + 2 fibra vegetal (palha)', () => {
  const f = RECIPES.find((r) => r.id === 'fence'),
    g = RECIPES.find((r) => r.id === 'gate');
  assert.deepEqual(f.cost, { madeira: 5 });
  assert.deepEqual(g.cost, { madeira: 10, palha: 2 });
  assert.equal(f.yields, 1);
  assert.equal(g.yields, 1);
});

test('missingMaterials: lista exatamente o que falta', () => {
  const g = RECIPES.find((r) => r.id === 'gate');
  assert.equal(missingMaterials({ madeira: 10, palha: 2 }, g).ok, true);
  assert.equal(missingMaterials({ madeira: 99, palha: 2 }, g).ok, true);
  const r = missingMaterials({ madeira: 9, palha: 1 }, g);
  assert.equal(r.ok, false);
  assert.deepEqual(r.missing, [
    { id: 'madeira', need: 10, have: 9 },
    { id: 'palha', need: 2, have: 1 },
  ]);
  assert.deepEqual(missingMaterials({}, RECIPES[0]).missing, [{ id: 'madeira', need: 5, have: 0 }]);
});

/* ---------- atração por alimento ---------- */
test('quais alimentos atraem cada espécie', () => {
  for (const it of ['cenoura', 'abobora', 'milho']) assert.ok(attracts('vaca', it), it);
  for (const it of ['milho', 'seedC', 'seedP', 'seedM']) assert.ok(attracts('galinha', it), it);
  assert.ok(!attracts('vaca', 'madeira'));
  assert.ok(!attracts('galinha', 'cenoura'));
  assert.ok(!attracts('vaca', null));
  assert.ok(!attracts('peixe', 'milho'));
});

test('raios: vaca 6 tiles, galinha 5 tiles', () => {
  assert.equal(FOOD.vaca.radiusTiles, 6);
  assert.equal(FOOD.galinha.radiusTiles, 5);
});

test('histerese: entra no raio, só sai além do raio + margem', () => {
  const Rv = 6 * 16;
  assert.equal(lureDecision('vaca', 'cenoura', Rv - 1, false), true);
  assert.equal(lureDecision('vaca', 'cenoura', Rv + 1, false), false);
  assert.equal(lureDecision('vaca', 'cenoura', Rv + 1, true), true);
  assert.equal(lureDecision('vaca', 'cenoura', Rv + LURE_HYSTERESIS_PX, true), true);
  assert.equal(lureDecision('vaca', 'cenoura', Rv + LURE_HYSTERESIS_PX + 0.5, true), false);
  assert.equal(lureDecision('galinha', 'milho', 5 * 16 + 1, false), false);
  assert.equal(lureDecision('galinha', 'madeira', 10, true), false);
});

test('lureSlot: cada animal tem seu ponto, perto do jogador e sem sobrepor', () => {
  const pts = [];
  for (let id = 0; id < 6; id++) {
    const p = lureSlot('galinha', id, 200, 200);
    assert.ok(Math.hypot(p.x - 200, p.y - 200) <= FOOD.galinha.standoffPx + 14);
    pts.push(p);
  }
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++) assert.ok(Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) > 3);
  assert.deepEqual(lureSlot('vaca', 3, 0, 0), lureSlot('vaca', 3, 0, 0)); // determinístico: nada de tremedeira
});

/* ---------- ovos ---------- */
test('intervalos de ovo usam o relógio do jogo: 24h = 1 dia, eclosão = 3 dias', () => {
  assert.equal(EGG_CFG.layIntervalMin, DAY_MIN);
  assert.equal(EGG_CFG.incubationMin, 3 * DAY_MIN);
  assert.equal(EGG_CFG.maxChickens, 30);
  assert.equal(nextLayAt(1000), 1000 + DAY_MIN);
  assert.equal(hatchAt(1000), 1000 + 3 * DAY_MIN);
});

test('dueToLay / dueToHatch', () => {
  assert.equal(dueToLay(99, 100), false);
  assert.equal(dueToLay(100, 100), true);
  assert.equal(dueToHatch(100, { hatchAt: 101 }), false);
  assert.equal(dueToHatch(101, { hatchAt: 101 }), true);
});

test('primeira postura: dentro do primeiro dia, deslocada por galinha', () => {
  const t = new Set();
  for (let id = 1; id <= 20; id++) {
    const d = firstLayAt(5000, id) - 5000;
    assert.ok(d >= 0.25 * DAY_MIN && d <= DAY_MIN, 'id ' + id + ': ' + d);
    t.add(Math.round(d));
  }
  assert.ok(t.size > 15, 'as galinhas não põem todas ao mesmo tempo');
});

test('planLays: nada antes da hora; um ovo na hora; próxima 24h depois da anterior', () => {
  assert.deepEqual(planLays(99, 100), { times: [], next: 100 });
  const a = planLays(100, 100);
  assert.deepEqual(a.times, [100]);
  assert.equal(a.next, 100 + DAY_MIN);
  // atraso de 2 dias e meio: posturas datadas nos horários certos, sem acumular de uma vez além do limite
  const b = planLays(100 + 2.5 * DAY_MIN, 100);
  assert.deepEqual(b.times, [100, 100 + DAY_MIN, 100 + 2 * DAY_MIN]);
  assert.equal(b.next, 100 + 3 * DAY_MIN);
});

test('planLays: ausência muito longa é limitada e a próxima postura volta a ficar 24h à frente', () => {
  const now = 50 * DAY_MIN,
    r = planLays(now, 0);
  assert.equal(r.times.length, EGG_CFG.maxLaysPerUpdate);
  assert.equal(r.next, now + DAY_MIN);
  assert.equal(planLays(now, 0, 1).times.length, 1);
});

test('planLays independe do tamanho do passo de tempo (dt): chamar a cada instante dá as mesmas datas', () => {
  for (const step of [0.1, 1, 7, 90, 600]) {
    let next = 123,
      laid = [];
    for (let now = 0; now <= 5 * DAY_MIN; now += step) {
      const r = planLays(now, next);
      laid.push(...r.times);
      next = r.next;
    }
    assert.deepEqual(laid, [123, 123 + DAY_MIN, 123 + 2 * DAY_MIN, 123 + 3 * DAY_MIN, 123 + 4 * DAY_MIN], 'passo ' + step);
  }
});
