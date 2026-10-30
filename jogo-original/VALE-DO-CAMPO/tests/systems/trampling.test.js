// Regras puras do pisoteio e das trilhas (config/trampling.js): freada por fase, custo do caminho e regressão de fase.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FASE } from '../../src/config/plants.js';
import { TRAMPLE, matoDrag, pathCost, regressTo } from '../../src/config/trampling.js';

test('mato freia mais quanto mais fechado, e só a partir da fase 3', () => {
  assert.equal(matoDrag(0), 1);
  assert.equal(matoDrag(1), 1);
  assert.equal(matoDrag(2), 1);
  assert.ok(matoDrag(3) < 1 && matoDrag(4) < matoDrag(3));
  assert.ok(matoDrag(4) >= 0.4, 'o mato fechado cansa, mas não trava ninguém');
});

test('caminho: trilha barateia, mato fechado encarece, terreno liso custa 1', () => {
  assert.equal(pathCost(0, 0), 1);
  assert.ok(pathCost(1, 0) < 1);
  assert.ok(pathCost(0, 4) > 1);
  assert.ok(pathCost(1, 4) < pathCost(0, 4), 'uma trilha batida por dentro do mato ainda compensa');
  assert.ok(TRAMPLE.caminhoMato.length === 5);
});

test('pisoteio forte derruba fase 4 para a 2 e fase 3 para a 1; fraco não derruba; fases baixas ficam', () => {
  const f = (st, stress) => regressTo(st, stress);
  assert.equal(f(4, 0.1), null);
  assert.ok(f(4, 0.3) >= FASE[1] && f(4, 0.3) < FASE[2], 'cai dentro da fase 2');
  assert.ok(f(3, 0.3) > FASE[0] && f(3, 0.3) < FASE[1], 'cai dentro da fase 1');
  assert.equal(f(2, 0.9), null);
  assert.equal(f(1, 0.9), null);
});

test('só a fauna que pesa pisoteia; a sucuri não, a lebre quase nada', () => {
  assert.equal(TRAMPLE.peso.anaconda, 0);
  assert.ok(TRAMPLE.peso.boar >= 1 && TRAMPLE.peso.deer >= 1);
  assert.ok(TRAMPLE.peso.hare < 0.2 && TRAMPLE.peso.grouse < 0.2);
  for (const sp of ['deer', 'boar', 'jaguar', 'fox', 'hare', 'grouse', 'anaconda']) assert.ok(sp in TRAMPLE.peso, sp);
});
