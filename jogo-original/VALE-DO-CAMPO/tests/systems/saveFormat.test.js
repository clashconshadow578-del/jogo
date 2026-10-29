import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rleDec, rleEnc } from '../../src/utils/compression.js';

// Save real gerado pelo arquivo original (Vale_do_Campo_V64.html) durante os testes de regressão.
const save = JSON.parse(readFileSync(new URL('../fixtures/save-v64-original.json', import.meta.url), 'utf8'));
const N = 100 * 100;

test('o save do original usa as chaves de localStorage preservadas pelo projeto', () => {
  for (const k of ['valeDoCampo_v53m', 'valeDoCampo_hydro_v53m', 'valeDoCampo_weather_v3', 'valeDoCampo_inst_meta53m', 'valeDoCampo_alel_v2', 'valeDoCampo_amz_v1'])
    assert.ok(k in save, 'chave ausente: ' + k);
});

test('formato v19: mapa da região decodifica e reencoda de forma idêntica', () => {
  const d = JSON.parse(save.valeDoCampo_v53m);
  assert.equal(d.v, 19);
  assert.equal(d.mw, 100);
  for (const f of ['g', 'o', 'w']) {
    const a = rleDec(d[f], N);
    assert.equal(a.length, N);
    assert.equal(rleEnc(a), d[f], 'reencode de ' + f);
  }
  const ground = rleDec(d.g, N), obj = rleDec(d.o, N);
  assert.ok(ground.every((g) => g <= 9), 'tipos de chão válidos');
  assert.ok(obj.every((o) => o <= 4), 'tipos de objeto válidos');
  assert.equal(typeof d.S.day, 'number');
  assert.ok(d.S.inv && typeof d.S.inv === 'object');
});
