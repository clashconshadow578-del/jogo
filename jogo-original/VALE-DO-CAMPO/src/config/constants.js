/**
 * Constantes globais: resolução lógica (480x270), tamanho do tile, dimensões da instância (100x100), deslocamento da fazenda, tipos de chão e de objeto, duração do dia, posição da casa e da vila no mundo 10x10.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

const VW = 480,
  VH = 270,
  TS = 16,
  MW = 100,
  MH = 100; // 136 = mapa principal; 136..187 = instância atrás da parede   // mundo 2x maior em cada lado

const OX = 2,
  OY = 18,
  OXP = OX * TS,
  OYP = OY * TS; // a fazenda original fica no centro do mundo

/* ================= MUNDO 1000x1000 EM 10x10 INSTÂNCIAS (100x100 tiles cada) =================
   - Só a instância em que você está fica carregada por inteiro (arrays do mapa, hidrologia, ecologia).
   - As outras ficam guardadas de forma compacta (IndexedDB) e "vivem" de forma invisível:
     animais andam, mudam de instância, se reproduzem; o tempo corre; nuvens de chuva que cruzam a divisa molham a vizinha.
   - Ao voltar a uma instância, o que passou (dias, chuva, plantações, ecologia) é recuperado de uma vez, sem desenhar nada. */
const WN = 10,
  HOMEC = { x: 2, y: 3 },
  VILC = { x: 3, y: 3 },
  VOX = 112;

const GRASS = 0,
  PATH = 1,
  SOIL = 2,
  WATER = 3,
  STONE = 4,
  SAND = 5,
  SCREE = 6,
  SNOWG = 7,
  FORD = 8,
  BED = 9;

const TREE = 1,
  ROCK = 2,
  HOUSE = 3,
  BIN = 4,
  FENCE = 5, // cerca de madeira (sólida)
  GATE = 6, // portão fechado (sólido)
  GATE_OPEN = 7; // portão aberto (livre para passar)

const DAY_MIN = 1200; // 1200 minutos de jogo = 20 min reais (1 min de jogo por segundo)

/* ============ INICIALIZAÇÃO E LOOP ============ */
/* ============ HIDROLOGIA: rios naturais, chuva, solo, lençol freático ============ */
const HN = MW * MH;

export {
  BED,
  BIN,
  DAY_MIN,
  FENCE,
  FORD,
  GATE,
  GATE_OPEN,
  GRASS,
  HN,
  HOMEC,
  HOUSE,
  MH,
  MW,
  OX,
  OXP,
  OY,
  OYP,
  PATH,
  ROCK,
  SAND,
  SCREE,
  SNOWG,
  SOIL,
  STONE,
  TREE,
  TS,
  VH,
  VILC,
  VW,
  WATER,
  WN,
};
