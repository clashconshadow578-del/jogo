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
