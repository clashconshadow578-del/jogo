/**
 * Vida e estamina do personagem.
 *   Vida (❤, S.vida): o que os animais tiram ao atacar. Não gasta com ações; volta devagar quando o jogador não apanha há um tempo.
 *   Estamina (⚡, S.energy): o que correr e agir gasta; comida e o sono recuperam. Veneno de abelha drena a estamina aos poucos.
 *
 * Funções puras (sem DOM) para poderem ser testadas em `npm test`. O estado vivo fica em `vitals` (não é salvo).
 *
 * Origem: novo (vida separada da estamina).
 */

export const VIDA_MAX = 100;
/** Segundos reais sem apanhar até a vida começar a voltar. */
export const REGEN_QUIET = 10;
/** Vida recuperada por segundo real (1 s real ≈ 1 min do relógio do jogo). */
export const REGEN_RATE = 0.2;
/** Estamina que o veneno consome por segundo real enquanto age. */
export const VENOM_RATE = 1.2;
/** Teto do veneno acumulado (estamina), para uma nuvem de abelhas não zerar a estamina de uma vez. */
export const VENOM_MAX = 30;

/** `quiet`: s desde a última ferida · `venom`: estamina que o veneno ainda vai consumir. */
export const vitals = { quiet: 99, venom: 0 };

/** Vida depois de `dt` segundos. Só cura depois de REGEN_QUIET segundos sem ser ferido. */
export function regenVida(vida, dt, quietT) {
  if (quietT < REGEN_QUIET || vida >= VIDA_MAX) return vida;
  return Math.min(VIDA_MAX, vida + REGEN_RATE * dt);
}

/** Quanto de veneno vira estamina perdida neste passo (`take`) e quanto ainda sobra (`left`). */
export function venomDrain(venom, dt) {
  const take = Math.max(0, Math.min(venom, VENOM_RATE * dt));
  return { take, left: venom - take };
}

/** Acrescenta veneno (estamina a consumir), respeitando o teto. */
export function addVenom(current, n) {
  return Math.min(VENOM_MAX, current + n);
}

/** Zera o que é temporário (ao dormir, ao carregar um jogo ou começar outro). */
export function clearVitals() {
  vitals.quiet = 99;
  vitals.venom = 0;
}
