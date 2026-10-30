import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addVenom, regenVida, REGEN_QUIET, VENOM_MAX, VENOM_RATE, VIDA_MAX, venomDrain } from '../../src/systems/Vitals.js';
import { PLAYER_PREY } from '../../src/config/ecosystem.js';

test('vida não cura enquanto o jogador está apanhando; cura depois do silêncio', () => {
  assert.equal(regenVida(40, 1, 0), 40, 'acabou de ser ferido: não cura');
  assert.equal(regenVida(40, 1, REGEN_QUIET - 0.1), 40, 'quase lá: ainda não');
  assert.ok(regenVida(40, 1, REGEN_QUIET) > 40, 'depois do silêncio, volta devagar');
  assert.equal(regenVida(VIDA_MAX, 5, 999), VIDA_MAX, 'não passa do máximo');
  assert.ok(regenVida(99.99, 60, 999) <= VIDA_MAX);
});

test('veneno drena a estamina aos poucos e acaba', () => {
  let venom = 3,
    total = 0;
  for (let i = 0; i < 1000 && venom > 0; i++) {
    const r = venomDrain(venom, 0.1);
    venom = r.left;
    total += r.take;
  }
  assert.equal(venom, 0, 'o veneno termina');
  assert.ok(Math.abs(total - 3) < 1e-9, 'toda a dose vira estamina perdida');
  assert.ok(venomDrain(5, 0.1).take <= VENOM_RATE * 0.1 + 1e-9, 'por quadro, no máximo a taxa do veneno');
});

test('picadas acumulam veneno com teto', () => {
  let v = 0;
  for (let i = 0; i < 100; i++) v = addVenom(v, 3);
  assert.equal(v, VENOM_MAX);
});

test('raposa persegue e morde: dano pequeno, escapa por distância, fôlego e obstáculo', () => {
  const F = PLAYER_PREY.fox;
  assert.ok(F.bite > 0 && F.bite < 20, 'mordida pequena');
  assert.ok(F.speed < 1, 'a raposa é um pouco mais lenta que correr: quem corre escapa');
  assert.ok(F.reach > F.biteR && F.lostGrace > 0 && F.stuckT > 0, 'há condições de fuga');
});

test('sucuri persegue (sem trégua) e rasteja devagar em terra', () => {
  const A = PLAYER_PREY.anaconda;
  assert.equal(A.truce, 0);
  assert.ok(A.crawlLand < 60 && A.crawlLand < A.crawlWater, 'em terra é mais lenta que o jogador andando');
  assert.ok(A.chaseR > A.fleeR, 'persegue além do alcance em que antes fugia');
});

import { KO_HOURS, KO_SPEED, STING_LIMIT, STING_WINDOW, stingTrack } from '../../src/systems/Vitals.js';

test('picadas: muitas em pouco tempo derrubam; espaçadas não; a janela esquece as velhas', () => {
  let l = [],
    ko = false;
  for (let k = 0; k < STING_LIMIT - 1; k++) ({ lista: l, ko } = stingTrack(l, k * 0.5));
  assert.equal(ko, false, 'uma a menos que o limite ainda não derruba');
  ({ lista: l, ko } = stingTrack(l, (STING_LIMIT - 1) * 0.5));
  assert.equal(ko, true, 'a picada do limite derruba');
  // espaçadas (uma a cada janela): nunca acumulam
  l = [];
  for (let k = 0; k < 40; k++) ({ lista: l, ko } = stingTrack(l, k * (STING_WINDOW + 1)));
  assert.equal(ko, false);
  assert.ok(l.length <= 2, 'as velhas saem da lista');
  assert.ok(KO_HOURS >= 4 && KO_HOURS <= 8, 'acorda horas depois (~6 h)');
  assert.ok(KO_SPEED > 1, 'o tempo passa mais rápido desmaiado');
});

import { HEART_BPM, HEART_FROM, HEART_VOL, heartbeat } from '../../src/systems/Vitals.js';

test('coração: só abaixo de 40% de vida; cada ponto a menos bate mais rápido e mais forte', () => {
  assert.equal(heartbeat(100), null);
  assert.equal(heartbeat(HEART_FROM), null, 'em 40% ainda não');
  assert.equal(heartbeat(0), null, 'sem vida não há batida');
  const h39 = heartbeat(HEART_FROM - 1),
    h20 = heartbeat(20),
    h5 = heartbeat(5),
    h1 = heartbeat(1);
  assert.ok(h39 && h20 && h5 && h1);
  assert.ok(h39.bpm < h20.bpm && h20.bpm < h5.bpm && h5.bpm < h1.bpm, 'mais rápido a cada ponto perdido');
  assert.ok(h39.vol < h20.vol && h20.vol < h5.vol && h5.vol < h1.vol, 'mais forte a cada ponto perdido');
  assert.ok(h39.interval > h1.interval, 'o intervalo encurta');
  assert.ok(h39.bpm >= HEART_BPM[0] && h1.bpm <= HEART_BPM[1] && h1.vol <= HEART_VOL[1]);
  for (let v = 38; v >= 1; v--) assert.ok(heartbeat(v).bpm > heartbeat(v + 1).bpm && heartbeat(v).vol > heartbeat(v + 1).vol, 'monótono em ' + v);
});
