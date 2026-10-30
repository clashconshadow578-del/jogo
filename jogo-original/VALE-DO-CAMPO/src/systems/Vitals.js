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

/** Picadas de abelha: com STING_LIMIT picadas em STING_WINDOW s reais o personagem desmaia (nuvem de abelhas, não uma ferroada solta). */
export const STING_LIMIT = 14;
export const STING_WINDOW = 25;
/** Desmaio por picadas: horas de jogo desacordado (acorda depois disso) e quanto o tempo acelera enquanto isso (cada s real = 1 min de jogo × KO_SPEED). */
export const KO_HOURS = 6;
export const KO_SPEED = 8;
/** O que sobra ao acordar: vida mínima e estamina mínima (não acorda morto nem zerado). */
export const KO_WAKE_VIDA = 40;
export const KO_WAKE_ENERGY = 40;

/** Registra uma picada em `lista` (instantes em s), descarta as velhas e diz se já são muitas. Devolve { lista, ko }. */
export function stingTrack(lista, now, win = STING_WINDOW, limit = STING_LIMIT) {
  const l = lista.filter((t) => now - t <= win);
  l.push(now);
  return { lista: l, ko: l.length >= limit };
}

/** Coração batendo: começa abaixo de HEART_FROM de vida; do ritmo calmo (HEART_BPM[0]) ao desesperado (HEART_BPM[1]) quando a vida chega a zero. */
export const HEART_FROM = 40;
export const HEART_BPM = [64, 170];
export const HEART_VOL = [0.45, 1.6]; // ganho antes do volume geral do jogo (0,22): sobe junto com o medo

/**
 * Batida do coração para uma vida: null se a vida está em HEART_FROM ou mais (ou já zerou). Quanto menor a vida, mais rápido e mais forte.
 * @returns {{bpm:number, interval:number, vol:number, fear:number}|null} `fear` 0..1 (0 em HEART_FROM, 1 sem vida).
 */
export function heartbeat(vida) {
  if (!(vida < HEART_FROM) || vida <= 0) return null;
  const fear = Math.min(1, (HEART_FROM - vida) / HEART_FROM),
    bpm = HEART_BPM[0] + (HEART_BPM[1] - HEART_BPM[0]) * fear;
  return { bpm, interval: 60 / bpm, vol: HEART_VOL[0] + (HEART_VOL[1] - HEART_VOL[0]) * fear, fear };
}

/** `quiet`: s desde a última ferida · `venom`: estamina que o veneno ainda vai consumir. */
export const vitals = { quiet: 99, venom: 0, stings: [] };

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
  vitals.stings = [];
}
