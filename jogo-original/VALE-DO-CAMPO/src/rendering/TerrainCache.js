/**
 * Cache do terreno estático em blocos (EXPERIMENTAL, desligado por padrão: opção "Cache do chão" no menu, ou ?chunks na URL).
 * Guarda o terreno em blocos de 8x8 tiles (canvas pequenos), não numa imagem do tamanho do mapa.
 *
 * Antes, a cada quadro cada tile visível (~600) rodava drawTile + drawTrampledGrass + drawHydro: milhares de chamadas
 * de canvas e muito JavaScript por quadro, mesmo com o chão parado. No celular isso (e não a resolução) era o que
 * mais pesava. Agora os tiles ESTÁTICOS são pintados uma vez, com as mesmas funções de desenho de sempre, numa imagem do
 * tamanho do mapa, e cada quadro só copia a parte visível dela (1 drawImage). O que se mexe continua sendo desenhado ao
 * vivo, tile a tile, exatamente como antes.
 *
 * Fica ao vivo (nunca entra no cache): água, vau, neve (brilho animado), tiles ao lado de água/vau (bordas do lago,
 * areia úmida), poças e tiles ao redor delas, mudas, sementes, represas/canais, minhocas animadas, enchente, grama
 * pisoteada/dobrada/pastada e as bordas do mapa.
 *
 * Quando um tile do cache é refeito:
 *  - na hora: o terreno, a umidade do solo (wet) ou o tipo de brejo do tile mudou, ou o tile estava ao vivo no quadro anterior;
 *  - a cada ~1,5 s (escalonado por tile): umidade, nutrientes, húmus, estação etc. variam devagar;
 *  - de uma vez (com limite por quadro) quando o dia muda (a simulação diária mexe em tudo) e ao trocar o mapa
 *    (carregar jogo, mudar de região): os arrays `ground`/`wet` são substituídos e o cache é zerado.
 */

import { BED, FORD, GRASS, MH, MW, PATH, SAND, SCREE, SOIL, STONE, TS, WATER } from '../config/constants.js';
import { S } from '../core/GameState.js';
import { hash2 } from '../utils/MathUtils.js';
import { pdNear } from '../world/hydrology/Puddles.js';
import { fvFld } from '../world/hydrology/Fluvial.js';
import { WTc, bio, drawHydro, hmod, om, sapl, seedAge, wl } from '../world/hydrology/Hydrology.js';
import { tileStill, drawTrampledGrass } from '../world/GrassSystem.js';
import { gfx } from '../config/settings.js';
import { climate } from '../world/WeatherSystem.js';
import { ground, wet } from '../world/World.js';
import { mainCtx, setDrawCtx } from './Canvas.js';
import { drawTile } from './TileRenderer.js';

// EXPERIMENTAL e DESLIGADO por padrão: nos testes (emulação de celular) ele reduzia as chamadas de desenho, mas não
// trouxe ganho de tempo medível e, em alguns computadores, a tela piscava. Para testar, abra o jogo com ?cache na URL.
// Liga pela opção do menu ("Cache do chão") ou por ?chunks / ?cache na URL; ?nocache desliga sempre.
const enabled = () =>
  typeof location !== 'undefined' &&
  !/[?&]nocache\b/.test(location.search) &&
  (!!gfx.chunks || /[?&](cache|chunks)\b/.test(location.search));

const N = MW * MH,
  REFRESH = 300, // quadros (mínimo) entre refeitos "lentos" de cada tile; +0..29 por tile para escalonar
  STALE = 600, // tile no cache há tanto tempo (ex.: o jogador estava longe) que é refeito já, sem esperar o lote
  BURST = 32, // refeitos lentos só acontecem em quadros múltiplos disto (potência de 2)
  MARGIN = 5, // tiles de margem pintados de uma vez quando entra terreno novo
  BAKE_MAX = 260; // limite de tiles pintados por quadro (evita um engasgo ao entrar numa área nova)

const STATIC_TYPE = new Uint8Array(32);
for (const g of [GRASS, PATH, SOIL, STONE, SAND, SCREE, BED]) STATIC_TYPE[g] = 1;

const NB8 = [-MW - 1, -MW, -MW + 1, -1, 1, MW - 1, MW, MW + 1];

const state = new Uint8Array(N), // 0 = nunca pintado, 1 = no cache, 2 = estava ao vivo
  sig = new Int32Array(N), // assinatura "discreta" quando foi pintado
  epochOf = new Uint16Array(N),
  bakedAt = new Uint32Array(N), // quadro em que foi pintado
  served = new Uint8Array(N), // neste quadro o cache cobre o tile (não desenhar ao vivo)
  wornStamp = new Uint32Array(N), // memo por quadro de "grama pisoteada/dobrada/pastada?"
  wornVal = new Uint8Array(N);

// Armazenamento em BLOCOS de CHT x CHT tiles (cada um um canvas pequeno), em vez de um canvas do tamanho do mapa:
// pintar um tile só altera (e só reenvia à placa de vídeo) o bloco dele, não a imagem inteira.
const CHT = 8,
  CHS = CHT * TS,
  CWN = Math.ceil(MW / CHT),
  CHN = Math.ceil(MH / CHT);
const chunks = new Array(CWN * CHN).fill(null);
let anyChunk = false;

function chunkAt(cx, cy) {
  const k = cy * CWN + cx;
  let c = chunks[k];
  if (!c) {
    const cv = document.createElement('canvas');
    cv.width = CHS;
    cv.height = CHS;
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    c = chunks[k] = { cv, g };
    anyChunk = true;
  }
  return c;
}

let on = false,
  lastGround = null,
  lastWet = null,
  lastDay = -1,
  epoch = 0;

function reset() {
  state.fill(0);
  served.fill(0);
  for (const c of chunks) if (c) c.g.clearRect(0, 0, CHS, CHS);
}

// Grama com marcas é desenhada ao vivo e suas lâminas dobradas passam 1-2 px para a direita/baixo do próprio tile. No
// desenho original o tile seguinte (desenhado depois) cobria esse excesso; com o cache o vizinho já está pronto, então
// um tile NÃO pode ir para o cache se um vizinho desenhado antes dele (esquerda, cima-esquerda, cima, cima-direita)
// for grama com marcas.
function worn(i, tx, ty, frame) {
  if (wornStamp[i] !== frame) {
    wornStamp[i] = frame;
    wornVal[i] = ground[i] === GRASS && !tileStill(tx, ty) ? 1 : 0;
  }
  return wornVal[i] === 1;
}

function eligible(i, tx, ty, frame) {
  if (!on) return false;
  if (!STATIC_TYPE[ground[i]]) return false;
  if (tx <= 0 || ty <= 0 || tx >= MW - 1 || ty >= MH - 1) return false;
  for (let k = 0; k < 8; k++) {
    const h = ground[i + NB8[k]];
    if (h === WATER || h === FORD) return false;
  }
  if (sapl[i] > 0 || seedAge[i] > 0 || hmod[i] !== 0 || fvFld[i] > 0.03) return false;
  if (pdNear(i, tx, ty)) return false;
  // minhocas piscando (ver drawHydro): só aparecem com húmus/biologia alta e chão molhado
  if (bio[i] > 0.5 && (wl[i] > 0.02 || climate.rain > 0.2) && hash2(tx * 3, ty * 5) > 0.75) return false;
  if (worn(i, tx, ty, frame)) return false;
  if (worn(i - 1, tx - 1, ty, frame) || worn(i - MW - 1, tx - 1, ty - 1, frame)) return false;
  if (worn(i - MW, tx, ty - 1, frame) || worn(i - MW + 1, tx + 1, ty - 1, frame)) return false;
  return true;
}

function bake(tx, ty) {
  const x = tx * TS,
    y = ty * TS,
    cx = (tx / CHT) | 0,
    cy = (ty / CHT) | 0,
    bg = chunkAt(cx, cy).g;
  setDrawCtx(bg);
  bg.save();
  bg.setTransform(1, 0, 0, 1, -cx * CHS, -cy * CHS); // as funções de desenho usam coordenadas do mundo
  bg.beginPath();
  bg.rect(x, y, TS, TS);
  bg.clip();
  bg.clearRect(x, y, TS, TS);
  try {
    drawTile(tx, ty, 0);
    drawTrampledGrass(tx, ty, 0);
    drawHydro(tx, ty, 0);
  } finally {
    bg.restore();
    setDrawCtx(mainCtx);
  }
}

/**
 * Atualiza o cache dos tiles visíveis e copia a região para a tela (a transformação da câmera já está aplicada).
 * Depois disso, só os tiles com `terrainServed[i] === 0` precisam ser desenhados ao vivo.
 */
function terrainDraw(x0, x1, y0, y1, frame) {
  on = enabled();
  if (!on) {
    // desligado: tudo é desenhado ao vivo, como no original (e nada de canvas alocado)
    if (anyChunk) served.fill(0);
    return;
  }
  if (ground !== lastGround || wet !== lastWet) {
    lastGround = ground;
    lastWet = wet;
    reset();
  }
  if (S.day !== lastDay) {
    lastDay = S.day;
    epoch = (epoch + 1) & 0xffff;
  }
  // Pintar no cache invalida a cópia que o navegador guarda do canvas (ele é lido todo quadro): fazer isso em TODO quadro
  // custava mais do que o desenho ao vivo. Por isso os refeitos "lentos" (idade/dia) só rodam a cada BURST quadros,
  // juntos; e quando entra terreno novo na tela pintamos também uma faixa de margem de uma vez (andar não pinta todo quadro).
  const burst = (frame & (BURST - 1)) === 0;
  let budget = BAKE_MAX,
    fresh = false;
  for (let ty = y0; ty <= y1; ty++)
    for (let tx = x0; tx <= x1; tx++) {
      const i = ty * MW + tx;
      if (!eligible(i, tx, ty, frame + 1)) {
        state[i] = 2;
        served[i] = 0;
        continue;
      }
      const s = ground[i] | (wet[i] << 8) | (WTc[i] << 16),
        age = frame - bakedAt[i];
      const urgent = state[i] !== 1 || sig[i] !== s || age >= STALE,
        lazy = epochOf[i] !== epoch || age >= REFRESH + (i % 30);
      if (urgent || (lazy && burst)) {
        if (budget <= 0) {
          served[i] = 0;
          continue;
        }
        budget--;
        bake(tx, ty);
        state[i] = 1;
        sig[i] = s;
        epochOf[i] = epoch;
        bakedAt[i] = frame;
        if (urgent) fresh = true;
      }
      served[i] = 1;
    }
  if (fresh && budget > 0) {
    // margem: terreno logo fora da tela que ainda não está no cache
    const mx0 = Math.max(1, x0 - MARGIN),
      mx1 = Math.min(MW - 2, x1 + MARGIN),
      my0 = Math.max(1, y0 - MARGIN),
      my1 = Math.min(MH - 2, y1 + MARGIN);
    for (let ty = my0; ty <= my1 && budget > 0; ty++)
      for (let tx = mx0; tx <= mx1 && budget > 0; tx++) {
        if (tx >= x0 && tx <= x1 && ty >= y0 && ty <= y1) continue;
        const i = ty * MW + tx;
        if (state[i] === 1 || !eligible(i, tx, ty, frame + 1)) continue;
        budget--;
        bake(tx, ty);
        state[i] = 1;
        sig[i] = ground[i] | (wet[i] << 8) | (WTc[i] << 16);
        epochOf[i] = epoch;
        bakedAt[i] = frame;
      }
  }
  // copia a parte visível: uma cópia por bloco que cruza a tela (~20)
  for (let cy = (y0 / CHT) | 0; (cy <= y1 / CHT) | 0; cy++)
    for (let cx = (x0 / CHT) | 0; (cx <= x1 / CHT) | 0; cx++) {
      const c = chunks[cy * CWN + cx];
      if (!c) continue;
      const tx0 = Math.max(x0, cx * CHT),
        tx1 = Math.min(x1, cx * CHT + CHT - 1),
        ty0 = Math.max(y0, cy * CHT),
        ty1 = Math.min(y1, cy * CHT + CHT - 1),
        w = (tx1 - tx0 + 1) * TS,
        h = (ty1 - ty0 + 1) * TS;
      mainCtx.drawImage(c.cv, tx0 * TS - cx * CHS, ty0 * TS - cy * CHS, w, h, tx0 * TS, ty0 * TS, w, h);
    }
}

export { terrainDraw, served as terrainServed };
