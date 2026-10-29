import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { worldDecode } from '../../src/world/WorldData.js';

// Somas de verificação calculadas com o decodificador do arquivo original sobre o mesmo mapa.
const fnv = (a) => { let x = 2166136261; for (let i = 0; i < a.length; i++) { x ^= a[i] & 255; x = Math.imul(x, 16777619); x ^= a[i] >> 8; x = Math.imul(x, 16777619); } return x >>> 0; };

test('world.bin decodifica no mesmo mundo 1000x1000 do original', () => {
  const bytes = new Uint8Array(readFileSync(new URL('../../public/assets/data/world.bin', import.meta.url)));
  const W = worldDecode(bytes);
  assert.equal(W.W, 1000);
  assert.equal(W.T.length, 1000 * 1000);
  assert.equal(W.P.length, 250 * 250);
  assert.equal(fnv(W.T), 3497619878, 'classes do terreno');
  assert.equal(fnv(W.H), 2919043790, 'alturas');
  assert.equal(fnv(W.P), 2455573873, 'multiplicador de chuva');
  assert.ok(W.T.every((c) => c <= 11), 'classes válidas (0..11)');
});
