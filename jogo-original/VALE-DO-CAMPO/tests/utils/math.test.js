import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hash2, smooth, mixN } from '../../src/utils/MathUtils.js';
import { rngSeed } from '../../src/utils/Random.js';

test('hash2 é determinístico e fica em [0,1]', () => {
  for (let i = 0; i < 1000; i++) {
    const v = hash2(i * 31, i * 17 - 400);
    assert.ok(v >= 0 && v <= 1);
    assert.equal(v, hash2(i * 31, i * 17 - 400));
  }
  assert.notEqual(hash2(1, 2), hash2(2, 1));
});

test('smooth (smoothstep) e mixN', () => {
  assert.equal(smooth(0, 1, -1), 0);
  assert.equal(smooth(0, 1, 2), 1);
  assert.equal(smooth(0, 1, 0.5), 0.5);
  assert.equal(mixN(10, 20, 0.25), 12.5);
});

test('rngSeed reproduz a mesma sequência para a mesma semente', () => {
  const a = rngSeed(123), b = rngSeed(123), c = rngSeed(124);
  const sa = Array.from({ length: 20 }, a), sb = Array.from({ length: 20 }, b), sc = Array.from({ length: 20 }, c);
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, sc);
  assert.ok(sa.every((v) => v >= 0 && v < 1));
});
