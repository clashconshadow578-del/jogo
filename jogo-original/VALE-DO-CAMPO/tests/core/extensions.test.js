import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extensible } from '../../src/core/extensions.js';

test('sem extensões, chama a função base com os mesmos argumentos', () => {
  const f = extensible(function soma(a, b) { return a + b; });
  assert.equal(f(2, 3), 5);
  assert.equal(f.name, 'soma');
  assert.equal(f.layers, 0);
});

test('camadas executam da mais recente para a mais antiga, como as reatribuições originais', () => {
  const log = [];
  const f = extensible(function base(x) { log.push('base:' + x); return x; });
  f.extend((prev) => function (x) { log.push('A'); return prev.apply(this, arguments) + 1; });
  f.extend((prev) => function (x) { log.push('B'); return prev(x) * 10; });
  assert.equal(f(1), 20);
  assert.deepEqual(log, ['B', 'A', 'base:1']);
  assert.equal(f.layers, 2);
});

test('uma camada pode interceptar sem chamar a anterior (padrão "se tratou, retorna")', () => {
  const f = extensible(() => 'base');
  f.extend((prev) => (k) => (k === 'especial' ? 'tratado' : prev(k)));
  assert.equal(f('especial'), 'tratado');
  assert.equal(f('outro'), 'base');
});

test('fábrica que não devolve função é rejeitada', () => {
  const f = extensible(() => 0);
  assert.throws(() => f.extend(() => 42), TypeError);
});
