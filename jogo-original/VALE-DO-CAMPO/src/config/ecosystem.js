/**
 * Ecossistema vivo: parâmetros por espécie (percepção, coragem, caça, camuflagem) e funções PURAS de decisão
 * (sem DOM, sem estado do jogo), para poderem ser testadas em `npm test`.
 *
 * Quem usa: entities/ai/Perception.js (percepção, memória, trava de caça ao jogador), entities/wild/Fauna.js
 * (raposa e presas), Jaguar.js, Anaconda.js e rendering/AnimalStatus.js (indicadores).
 *
 * Unidades: px (1 tile = 16 px), segundos reais (1 s real = 1 min do relógio do jogo), velocidades em px/s.
 */

import { DAY_MIN } from './constants.js';

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);

/* ============ percepção: cadência e memória ============ */
/** Intervalo entre testes de percepção de cada animal (s). Cada animal começa defasado para não testar todos no mesmo quadro. */
export const PERC_DT = 0.25;
/** Memória: no máximo `cap` lembranças por animal; cada uma expira em `ttl` segundos. */
export const MEM = { cap: 3, threatTtl: 22, lostTtl: 14, mergeR: 28 };

/** Atenção do animal conforme o que está fazendo: de cabeça baixa comendo ele enxerga menos que de cabeça erguida. */
export const ATTN = {
  forage: 0.65,
  rest: 0.4,
  drink: 0.55,
  wallow: 0.5,
  eat: 0.5,
  idle: 0.9,
  go: 1,
  alert: 1.25,
  freeze: 1.15,
  flee: 1,
  investigate: 1.1,
  stalk: 1.1,
  chase: 1.1,
  pant: 0.7,
  recover: 0.7,
  // galinhas (estados do bando de fazenda)
  ciscar: 0.65,
  andar: 0.9,
  banho: 0.5,
  vigia: 1.25,
  // galo-lira em exibição
  display: 1,
};

/* ============ parâmetros por espécie ============
   sight     alcance de visão de dia (px) · nightMul: fração que sobra à noite · hear: raio em que ouve movimento rápido
   vigil     0..1: quanto o bando/espécie mantém a cabeça erguida (aumenta ATTN de quem come/descansa)
   courage   0..1: tendência a encarar em vez de fugir
   herdAlarm raio (px) em que o alarme se espalha · alertFor: tempo olhando a ameaça antes de decidir [min,max]
   calmAfter s sem ameaça para voltar à rotina · avoidFor/avoidR: tempo e raio em que evita o lugar onde viu o predador */
export const ECO = {
  deer: {
    nose: 80, // sente o cheiro do predador a esta distância (px), mesmo escondido no mato
    sight: 215,
    nightMul: 0.55,
    hear: 60,
    vigil: 0.8,
    courage: 0.1,
    herdAlarm: 120,
    alertFor: [1.4, 2.8],
    calmAfter: 7,
    avoidFor: 30,
    avoidR: 90,
  },
  hare: {
    nose: 60, // sente o cheiro do predador a esta distância (px), mesmo escondido no mato
    sight: 135,
    nightMul: 0.6,
    hear: 75,
    vigil: 0.9,
    courage: 0.05,
    herdAlarm: 0,
    alertFor: [1.0, 2.2],
    calmAfter: 6,
    avoidFor: 24,
    avoidR: 80,
    freezeChance: 0.55,
    shelterR: 130,
  },
  grouse: {
    nose: 45, // sente o cheiro do predador a esta distância (px), mesmo escondido no mato
    sight: 115,
    nightMul: 0.45,
    hear: 55,
    vigil: 0.7,
    courage: 0.05,
    herdAlarm: 130,
    alertFor: [0.6, 1.4],
    calmAfter: 5,
    avoidFor: 20,
    avoidR: 70,
    display: 30,
    displayT: [3, 6],
    displayMaxHun: 0.55,
  },
  chicken: {
    sight: 125,
    nightMul: 0.4,
    hear: 55,
    vigil: 0.8,
    courage: 0,
    herdAlarm: 85,
    alertFor: [0.4, 0.9],
    calmAfter: 5,
    avoidFor: 0,
    avoidR: 0,
  },
  fox: {
    nose: 60,
    sight: 150,
    nightMul: 0.85,
    hear: 85,
    scent: 60,
    vigil: 0.6,
    courage: 0.4,
    herdAlarm: 0,
    alertFor: [0.8, 1.6],
    calmAfter: 6,
    avoidFor: 25,
    avoidR: 90,
  },
  boar: {
    nose: 70, // sente o cheiro do predador a esta distância (px), mesmo escondido no mato
    sight: 125,
    nightMul: 0.5,
    hear: 75,
    vigil: 0.6,
    courage: 0.6,
    herdAlarm: 140,
    alertFor: [1.2, 2.4],
    calmAfter: 8,
    avoidFor: 15,
    avoidR: 70,
  },
  jaguar: {
    sight: 195,
    nightMul: 0.78,
    hear: 95,
    scent: 420, // faro: sente o cheiro de qualquer presa de longe (px)
    scentAlways: true, // mesmo saciada (as outras só farejam com fome)
    vigil: 0.7,
    courage: 0.9,
    herdAlarm: 0,
    alertFor: [1, 2],
    calmAfter: 6,
    avoidFor: 0,
    avoidR: 0,
  },
  anaconda: {
    sight: 90,
    nightMul: 0.9,
    hear: 40,
    heat: 70,
    vigil: 0.5,
    courage: 0.3,
    herdAlarm: 0,
    alertFor: [1, 2],
    calmAfter: 8,
    avoidFor: 0,
    avoidR: 0,
  },
};

/* ============ galinhas (bando da fazenda) ============
   lookP     chance de, ao escolher a próxima ação, parar para vigiar (cabeça erguida; alcance de visão maior) · lookT: duração (s)
   callT     tempo (s) que o chamado de alarme fica visível/audível · callCd: intervalo mínimo entre chamados da mesma galinha
   nearR     distância (px) em que sente a raposa mesmo sem vê-la (como era antes: perto demais sempre assusta) */
export const CHICKEN = { lookP: 0.09, lookT: [1, 2.2], callT: 1.4, callCd: 4, nearR: 50 };

/* ============ predadores ============
   drive       interesse em presa mesmo saciado (0..~0.4): faz observar/espreitar sem fome
   commitMin   pontuação mínima para ATACAR · observeMin: pontuação mínima para só observar/espreitar
   giveUp      tempo máximo de perseguição (s) · loseT: tempo investigando a última posição vista (s)
   recoverT    descanso depois de uma tentativa frustrada · cool: intervalo mínimo entre tentativas (s)
   riskAv      aversão a risco (presa que revida custa mais) */
export const HUNT = {
  fox: {
    drive: 0.14,
    commitMin: 0.14,
    observeMin: 0.05,
    giveUp: 7,
    loseT: 4,
    recoverT: 3.5,
    cool: 14,
    riskAv: 0.9,
    scanR: 190,
  },
  jaguar: {
    drive: 0.16, // saciada: interesse normal (a fome sobe tudo isto: ver aggression/huntFor)
    commitMin: 0.16,
    observeMin: 0.06,
    giveUp: 6, // s de perseguição (a faminta persiste mais: ver huntFor)
    loseT: 7,
    recoverT: 4,
    cool: 22, // s entre tentativas (a faminta quase não descansa: ver huntFor)
    riskAv: 0.55,
    scanR: 320, // saciada; faminta enxerga oportunidade até 1,5× mais longe (huntFor)
  },
  anaconda: {
    drive: 0.08,
    commitMin: 0.2,
    observeMin: 0.08,
    giveUp: 30,
    loseT: 10,
    recoverT: 6,
    cool: 40,
    riskAv: 0.8,
    scanR: 70,
  },
};

/** Quanto aumenta o alcance de visão/audição/faro dos animais sobre um jogador DESMAIADO (deitado, indefeso, cheirando a sangue): presa fácil. */
export const KO_RANGE = 2.6;

/* ============ fome → agressividade do predador ============ */
/**
 * Quão agressivo (0..1) o predador está por fome: 0 até ~35% de fome (comportamento normal), sobe até 1 em ~90%. Faminto ele deixa de
 * observar e passa a caçar de verdade: aceita mais risco, comete a caçada com menos oportunidade, persegue por mais tempo e quase não descansa.
 */
export const aggression = (hun) => clamp(((hun || 0) - 0.35) / 0.55);

/** Parâmetros de caça (HUNT) ajustados pela agressividade `ag` (0..1). Devolve uma cópia: HUNT em si nunca muda. */
export function huntFor(h, ag) {
  return {
    ...h,
    drive: h.drive + 0.25 * ag,
    commitMin: h.commitMin * (1 - 0.7 * ag),
    observeMin: h.observeMin * (1 - 0.7 * ag),
    riskAv: h.riskAv * (1 - 0.6 * ag),
    giveUp: h.giveUp * (1 + 0.6 * ag),
    cool: h.cool * (1 - 0.75 * ag),
    scanR: h.scanR * (1 + 0.5 * ag),
  };
}

/* ============ o jogador como presa ============
   Velocidades do jogador (balance.js): andar ≈ 60 px/s, correr ≈ 78 px/s (+30%).
   Regra: predador NÃO foge do jogador. Persegue e morde até o jogador escapar: por distância (giveUpDist/reach/chaseR),
   por perder o contato visual (atrás de árvores e casas) ou por ficar travado num obstáculo (árvore, cerca). */
export const PLAYER_PREY = {
  fox: {
    bite: 8, // vida por mordida
    biteR: 13, // alcance da mordida (px)
    biteGap: 1.1, // s entre mordidas
    kick: 120, // empurrão do golpe (px/s)
    speed: 0.95, // fração da velocidade de corrida da raposa (≈ 66 px/s: o jogador que corre a supera)
    reach: 190, // longe demais: desiste
    lostGrace: 1.2, // s sem ver o jogador antes de desistir
    stuckT: 0.5, // s travada num obstáculo antes de desistir
  },
  jaguar: {
    burst: 94, // velocidade de perseguição (≈2× andar, ≈1,5× correr): fugir em linha reta quase nunca funciona
    accel: 5.5, // 1/s: rapidez com que a velocidade sobe até o burst (63% em 0,18 s)
    turn: 0.15, // fração da agilidade de giro durante o burst: uma guinada brusca ainda a faz errar, mas bem menos
    startDist: [60, 95], // distância em que a espreita vira corrida [mín,máx]: ela só arranca bem de perto (quem reage cedo escapa)
    biteReach: 18, // alcance da mordida (px)
    bite: 18, // vida perdida por mordida
    bites: Infinity, // sem limite: morde até o jogador morrer ou escapar
    biteGap: 0.75, // intervalo entre mordidas (s)
    giveUpDist: 280, // longe demais: desiste
    leadLag: 0.45, // s: atraso com que a onça estima a velocidade do jogador (guinadas bruscas enganam a interceptação)
    burstT: 1.9, // s de corrida em velocidade máxima; depois o fôlego acaba e a velocidade cai até ~45% em 1 s
    afterBiteCool: 0, // (sem trégua: depois de morder, a onça continua a perseguição)
    lostGrace: 1.2, // s correndo na última direção vista antes de investigar
    investigate: [5, 8], // s procurando na última posição vista
    cool: 22, // s sem caçar o jogador depois de desistir (a faminta quase não descansa: ver aggr)
    // bote: a onça SALTA sobre o jogador quando chega perto (disparo curto e muito rápido), prende por um instante e morde
    leap: { range: [22, 36], speed: 320, time: 0.22, pin: 0.7, cd: 2.5 },
  },
  anaconda: {
    reach: 38, // alcance do bote contra o jogador (px)
    telegraph: 0.45, // s de aviso (corpo se contrai) antes do bote: dá para reagir (sair de lado) se for rápido
    bite: 20,
    holdT: 5, // s presos (constrição)
    holdSlow: 0, // fração da velocidade enquanto preso: 0 = travado, não anda
    struggle: 0.5, // s a menos de aperto por toque em Usar (o jogador se debate)
    freeT: 4, // s em que ela não volta a prender depois de soltar (dá tempo de fugir)
    cool: 22,
    chance: 0.7, // chance base de investir quando o jogador entra no alcance e as condições são boas (sobe com a fome)
    minCamo: 0.35, // só embosca se a camuflagem estiver pelo menos nisso (à vista, ela prefere fugir)
    stayCamo: 0.5, // camuflada assim, ela fica parada até o jogador chegar ao alcance (em vez de fugir aos 72 px)
    dash: 300, // velocidade do bote (px/s)
    dashT: 0.25, // duração máxima do bote (s): ~57 px, pouco além do alcance
    hitR: 10, // distância em que o bote acerta o jogador
    defendBite: 14, // mordida de defesa quando pisam nela
    defendR: 24,
    fleeR: 72, // distância em que ela deixa a emboscada e passa a perseguir (não foge)
    chaseR: 110, // longe demais: desiste da perseguição
    crawlLand: 16, // px/s rastejando em terra (lenta: o jogador escapa andando)
    crawlWater: 40, // px/s na água
    holdBite: 12, // dano da constrição a cada aperto (vida)
    holdEvery: 1, // s entre apertos enquanto prende
    kick: 25, // empurrão (pequeno: ela prende, não arremessa)
    stayAfterMiss: 0.5, // chance de continuar escondida na água depois de errar (senão muda de lugar)
    truce: 0, // (sem trégua: nenhum predador dá trégua ao jogador)
  },
};

/* ============ camuflagem da sucuri ============ */
export const CAMO = {
  water: 0.88,
  grassMax: 0.84, // mato alto fechado (fase 4): a sucuri some nele (quase como na água, 0,88)
  grassMin: 0.3,
  soil: 0.35,
  sand: 0.1,
  path: 0.12,
  stone: 0.1,
  other: 0.2,
  nightBonus: 0.1,
  moveMul: 0.7,
  exposeT: 6,
};

/** Cor do ambiente (RGB) em que a sucuri se mistura, por tipo de chão. */
export const CAMO_RGB = {
  water: [52, 108, 118],
  grass: [72, 120, 52],
  soil: [104, 74, 48],
  sand: [196, 178, 124],
  path: [138, 112, 74],
  stone: [118, 118, 112],
  other: [72, 120, 52],
};

/**
 * Camuflagem (0..1) de uma sucuri. 0 = totalmente à vista, 1 = confundida com o ambiente.
 * @param {{kind:'water'|'grass'|'soil'|'sand'|'path'|'stone'|'other', mato?:number, night?:number, moving?:boolean, expose?:number}} e
 */
export function camouflage(e) {
  let c;
  if (e.kind === 'water') c = CAMO.water;
  else if (e.kind === 'grass') c = CAMO.grassMin + (CAMO.grassMax - CAMO.grassMin) * clamp(e.mato || 0);
  else c = CAMO[e.kind] != null ? CAMO[e.kind] : CAMO.other;
  c += CAMO.nightBonus * clamp(e.night || 0);
  if (e.moving) c *= CAMO.moveMul;
  const ex = clamp((e.expose || 0) / CAMO.exposeT);
  c *= 1 - ex; // depois de atacar, perde a vantagem e a recupera aos poucos
  return clamp(c);
}

/* ============ visibilidade ============ */
/** Fator (0.08..1.8) que multiplica o alcance de quem observa, conforme o estado de quem é observado. */
export function targetVisibility(t) {
  let v = 1;
  if (t.running) v *= 1.35;
  else if (!t.moving) v *= 0.6;
  if (t.stalking) v *= 0.6; // espreitar reduz (agachado, devagar) mas não torna invisível
  if (t.frozen) v *= 0.5;
  v *= 1 - 0.5 * clamp(t.cover || 0);
  v *= 1 - 0.85 * clamp(t.camo || 0);
  if (t.lit) v *= 1.5;
  return clamp(v, 0.08, 1.8);
}

/** Alcance de visão (px) de uma espécie nas condições dadas (noite 0..1; atenção = ATTN do estado). */
export function sightRange(sp, night = 0, attn = 1) {
  const P = ECO[sp];
  if (!P) return 0;
  // espécies vigilantes (cervo, lebre) mantêm parte da atenção mesmo comendo ou descansando
  const at = attn < 1 ? attn + (1 - attn) * 0.4 * P.vigil : attn;
  return P.sight * (1 - (1 - P.nightMul) * clamp(night)) * at * (0.7 + 0.3 * P.vigil);
}

/** Fator por direção: bem menos sensível ao que está atrás. `cosFront` = cos do ângulo entre a frente e o alvo. */
export function rearFactor(cosFront) {
  return cosFront >= -0.35 ? 1 : 0.5 + 0.5 * clamp((cosFront + 1) / 0.65);
}

/**
 * Detecta? Visão: alcance × visibilidade do alvo × (1 − oclusão) × fator traseiro.
 * Audição: só movimento rápido, atravessa meia oclusão.
 */
export function detects({ dist, range, vis = 1, occlusion = 0, rear = 1, hear = 0, loud = false }) {
  const seen = dist <= range * vis * (1 - clamp(occlusion)) * rear;
  const heard = loud && hear > 0 && dist <= hear * (1 - 0.5 * clamp(occlusion));
  return { seen, heard, any: seen || heard };
}

/* ============ decisão de caça: oportunidade ≠ fome ============ */
/**
 * Avalia uma oportunidade de caça. A fome só aumenta o VALOR da presa; o interesse (`drive`) existe mesmo saciado.
 * @param {object} o
 *   need      fome do predador 0..1
 *   dist      distância até a presa (px)
 *   scanR     raio máximo de interesse
 *   vPred     velocidade de perseguição do predador
 *   vPrey     velocidade de fuga da presa
 *   alert     a presa já percebeu o predador? (0..1)
 *   stamina   fôlego do predador 0..1
 *   value     tamanho da refeição 0..1+
 *   counter   perigo de a presa revidar 0..1
 *   cover     cobertura vegetal que ajuda o predador 0..1
 *   drive     interesse base saciado · riskAv: aversão a risco
 *   fleeing   a presa está correndo (estimula a perseguição)
 * @returns {{score:number, pCatch:number, benefit:number, cost:number}}
 */
export function huntOpportunity(o) {
  const R = Math.max(1, o.scanR || 200),
    d = clamp(o.dist / R),
    edge = clamp((o.vPred - o.vPrey) / Math.max(1, o.vPred), -1, 1),
    alert = clamp(o.alert || 0),
    stamina = o.stamina == null ? 1 : clamp(o.stamina);
  const pCatch = clamp(
    0.4 + 0.45 * edge + 0.22 * (1 - alert) - 0.3 * d + 0.12 * clamp(o.cover || 0) + 0.1 * stamina - 0.1,
    0.02,
    0.97,
  );
  const need = clamp(o.need),
    value = o.value == null ? 0.5 : o.value;
  const benefit = value * (0.18 + 0.82 * need) + (o.drive || 0) + (o.fleeing ? 0.1 : 0);
  const cost = 0.22 * d + (o.riskAv == null ? 0.7 : o.riskAv) * clamp(o.counter || 0) * 0.5 + 0.2 * (1 - stamina);
  return { score: pCatch * benefit - cost, pCatch, benefit, cost };
}

/** Resolve o resultado da avaliação em 'attack' | 'observe' | 'skip'. `noise` (−0.03..0.03) quebra empates sem tornar o bicho previsível. */
export function huntDecision(ev, hunt, noise = 0) {
  const s = ev.score + noise;
  if (s >= hunt.commitMin) return 'attack';
  if (s >= hunt.observeMin) return 'observe';
  return 'skip';
}

/* ============ histerese de estados ============ */
/**
 * Impede oscilar entre estados opostos (perseguir ↔ fugir): um estado só pode ser trocado por outro depois
 * de `minDur` segundos, salvo emergência.
 */
export function canSwitch(elapsed, minDur, emergency = false) {
  return emergency || elapsed >= minDur;
}

/* ============ idade e necessidades (indicadores) ============ */
/** Idade em minutos do relógio do jogo (1 s real = 1 min) → texto curto: "45m", "7h", "2d 5h". 1 dia = 1200 min. */
export function fmtAge(min) {
  const m = Math.max(0, Math.floor(+min || 0));
  if (m < 60) return m + 'm';
  const d = Math.floor(m / DAY_MIN),
    h = Math.floor((m % DAY_MIN) / 60);
  return d > 0 ? d + 'd ' + h + 'h' : h + 'h';
}

/** Fase da vida: 'filhote' | 'adulto' | 'idoso'. `life` = idade em que morre de velhice (se conhecida). */
export function lifeStage(age, kidAge, life) {
  if (age < kidAge) return 'filhote';
  if (life && life > 0 && age >= life * 0.82) return 'idoso';
  return 'adulto';
}

/** Galinha guarda saciedade 0..100 (100 = cheia); os indicadores usam necessidade 0..1 (1 = faminta). */
export const satToNeed = (sat) => clamp(1 - (+sat || 0) / 100);

/** Paleta dos indicadores (distintos por matiz E por posição/ícone). */
export const STATUS_COLORS = {
  hunger: '#ff9f1c',
  hungerCrit: '#ff4a3f',
  thirst: '#3aa8ff',
  thirstCrit: '#b06cff',
  bg: 'rgba(8,10,14,.9)',
  edge: 'rgba(0,0,0,.9)',
  stage: { filhote: '#9be37d', adulto: '#f2f2f2', idoso: '#ffd166' },
};

/** Layout (px lógicos 480×270) do bloco de indicadores. */
export const STATUS_LAYOUT = { barW: 20, barH: 3, gap: 1, icon: 5, pad: 2, textH: 7, showR: 120, fadeFrom: 104 };

/**
 * Escala mínima do bloco para continuar legível em telas pequenas: `cssPerLogical` = pixels CSS por pixel lógico
 * (largura da janela ÷ 480, limitada pela altura ÷ 270). Garante ≥ ~3 px CSS de altura de barra e texto ≥ ~10 px CSS.
 */
export function statusScale(cssPerLogical) {
  const k = cssPerLogical > 0 ? 10 / (7 * cssPerLogical) : 1.5;
  return clamp(Math.ceil(k * 4) / 4, 1, 1.75);
}
