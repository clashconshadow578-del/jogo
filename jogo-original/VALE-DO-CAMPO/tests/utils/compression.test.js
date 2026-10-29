import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rleEnc, rleDec, pk, upk, pkE, upkE } from '../../src/utils/compression.js';

test('RLE de zeros: ida e volta preserva os bytes', () => {
  const a = new Uint8Array(10000);
  for (let i = 0; i < a.length; i += 37) a[i] = (i * 7) % 256 || 1;
  a.fill(0, 2000, 5000);
  const s = rleEnc(a);
  assert.equal(typeof s, 'string');
  assert.deepEqual(rleDec(s, a.length), a);
  assert.ok(s.length < a.length, 'compacta sequências de zeros');
});

test('RLE: blocos de zeros maiores que 255 e vetor todo zerado', () => {
  const z = new Uint8Array(1000);
  assert.deepEqual(rleDec(rleEnc(z), 1000), z);
});

test('pk/upk quantiza 0..1 em 1/255', () => {
  const f = Float32Array.from({ length: 500 }, (_, i) => (i % 101) / 100);
  const out = new Float32Array(500);
  upk(pk(f), out);
  for (let i = 0; i < f.length; i++) assert.ok(Math.abs(out[i] - f[i]) <= 1 / 255 + 1e-6);
});

test('pkE/upkE cobre a faixa da erosão (-0,3 .. 0,6)', () => {
  const f = Float32Array.from([-0.3, -0.1, 0, 0.25, 0.6]);
  const out = new Float32Array(5);
  upkE(pkE(f), out);
  for (let i = 0; i < f.length; i++) assert.ok(Math.abs(out[i] - f[i]) < 0.004);
});
