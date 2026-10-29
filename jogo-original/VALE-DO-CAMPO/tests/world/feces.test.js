import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dungTimer, fecesAlpha, fliesFor, FECES } from '../../src/config/feces.js';

test('defecação: o animal defeca de tempos em tempos, nunca a cada quadro', () => {
  const o = {};
  let drops = 0;
  const dt = 0.5,
    total = 60 * 60; // 1 hora real
  for (let i = 0; i < total / dt; i++) if (dungTimer(o, dt, 70, 140)) drops++;
  assert.ok(drops >= 25 && drops <= 60, `uma defecação a cada ~70-140 s (${drops} em 1 h)`);
});

test('fezes somem devagar: plenas, depois esmaecem nos últimos segundos', () => {
  assert.equal(fecesAlpha(0, FECES.life), 1);
  assert.equal(fecesAlpha(FECES.life - FECES.fade - 1, FECES.life), 1);
  assert.ok(fecesAlpha(FECES.life - FECES.fade / 2, FECES.life) < 1);
  assert.equal(fecesAlpha(FECES.life, FECES.life), 0);
});

test('moscas: poucas e sempre limitadas', () => {
  assert.ok(fliesFor(0.55) >= 1);
  assert.ok(fliesFor(1.6) <= FECES.flyMax);
  assert.ok(fliesFor(1.6) >= fliesFor(0.55));
});
