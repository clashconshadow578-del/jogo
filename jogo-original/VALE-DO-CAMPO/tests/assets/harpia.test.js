// As folhas de sprites da harpia (tools/harpia/make-harpia.py): os 4 arquivos existem, têm o tamanho que a configuração gerada diz, e a configuração é coerente.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { HARPIA_FOLHAS } from '../../src/config/harpiaSprites.js';
import { HARPIA } from '../../src/config/harpia.js';

const dir = fileURLToPath(new URL('../../public/assets/sprites/animals/harpy/', import.meta.url));

/** Largura e altura de um WebP sem perdas (VP8L), lidas do cabeçalho. */
function tamanhoWebp(file) {
  const b = fs.readFileSync(file);
  assert.equal(b.toString('latin1', 0, 4), 'RIFF');
  assert.equal(b.toString('latin1', 8, 12), 'WEBP');
  const fmt = b.toString('latin1', 12, 16);
  if (fmt === 'VP8L') {
    const v = b.readUInt32LE(21);
    return { w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1 };
  }
  if (fmt === 'VP8X') return { w: b.readUIntLE(24, 3) + 1, h: b.readUIntLE(27, 3) + 1 };
  throw new Error('formato inesperado ' + fmt);
}

test('harpia: 4 folhas (andar, parada, voo, razante) com o tamanho da configuração', () => {
  assert.deepEqual(Object.keys(HARPIA_FOLHAS).sort(), ['andar', 'parada', 'razante', 'voo']);
  const n = { andar: 18, parada: 23, voo: 12, razante: 12 };
  for (const [nome, f] of Object.entries(HARPIA_FOLHAS)) {
    const t = tamanhoWebp(dir + nome + '.webp');
    assert.equal(t.w, f.cols * f.w, `${nome}: largura`);
    assert.equal(t.h, f.rows * f.h, `${nome}: altura`);
    assert.equal(f.n, n[nome], `${nome}: quadros`);
    assert.ok(f.n <= f.cols * f.rows && f.n > (f.rows - 1) * f.cols, `${nome}: a grade tem os quadros e nenhuma linha vazia`);
    assert.ok(f.ax > 0 && f.ax < f.w && f.ay > 0 && f.ay <= f.h, `${nome}: âncora dentro do quadro`);
  }
});

test('harpia: a configuração é coerente', () => {
  const P = HARPIA.presas;
  for (const sp of ['hare', 'grouse', 'chicken', 'deer', 'boar']) assert.ok(P[sp] && P[sp].value > 0 && P[sp].n, `presa ${sp}`);
  for (const sp of ['jaguar', 'fox', 'anaconda', 'cow', 'calf']) assert.ok(!P[sp], `${sp} não é presa da harpia`);
  assert.ok(P.deer.cria && P.boar.cria && !P.hare.cria, 'cervo e queixada só filhote');
  assert.ok(HARPIA.defesa.ataqueR < HARPIA.defesa.avisoR, 'ataca só mais perto do que avisa');
  assert.equal(HARPIA.casal, 2);
  assert.ok(HARPIA.som.alcance > 280 * 2, 'o grito chega bem mais longe que o mugido da vaca (280 px)');
});
