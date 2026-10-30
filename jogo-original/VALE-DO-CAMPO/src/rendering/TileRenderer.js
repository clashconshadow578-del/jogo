/**
 * Desenho dos tiles do chão (grama, caminho, pedra, terra arada, areia, cascalho, neve, vau, leito seco, água com espuma e brilho).
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { BED, FORD, GRASS, MH, MW, PATH, SAND, SCREE, SNOWG, SOIL, STONE, TS, WATER } from '../config/constants.js';
import { Q } from '../config/settings.js';
import { S } from '../core/GameState.js';
import { sunInfo } from '../core/TimeManager.js';
import { ctx } from './Canvas.js';
import { lakeDepthDraw, lakeEdge } from './LakeRenderer.js';
import { LEGACY_GROUND } from '../config/groundStyle.js';
import { SPR } from './Sprites.js';
import { hash2 } from '../utils/MathUtils.js';
import { idleGrassEnabled, idleGrassTile, markFusedTile, tileStill } from '../world/GrassSystem.js';
import { WTc, sapl, seedAge } from '../world/hydrology/Hydrology.js';
import { FLM, FLX, FLY } from '../world/hydrology/RiverFlow.js';
import { ground, wet } from '../world/World.js';

/* ===== Vau: leito de areia com pedras 3D visiveis atraves de agua transparente ===== */
const FS_TONE = [
  ['#3f423f', '#6e716c', '#a8aba4'],
  ['#494640', '#7a766c', '#b8b3a3'],
  ['#3b4147', '#656d76', '#9fa8b2'],
];

// Pintura da pedra em (x, y) num contexto qualquer. A pedra só depende de (w, h, k): são poucas variações (w 3-8, h 3-5,
// k 0-2), então cada uma é pintada UMA vez num sprite e depois só copiada (1 drawImage no lugar de 12 fillRect).
// A sombra translúcida é pintada primeiro e a pedra opaca por cima, como antes; só o arredondamento de 8 bits da
// sombra pode diferir em 1 nível.
function paintStone(g, x, y, w, h, k) {
  const c = FS_TONE[k];
  g.fillStyle = 'rgba(8,18,28,.42)';
  g.fillRect(x + 1, y + h - 1, w, 2);
  g.fillRect(x + 2, y + h + 1, w - 2, 1);
  g.fillStyle = c[0];
  g.fillRect(x + 1, y, w - 2, h);
  g.fillRect(x, y + 1, w, h - 2);
  g.fillStyle = c[1];
  g.fillRect(x + 1, y, w - 3, h - 1);
  g.fillRect(x, y + 1, w - 2, h - 3);
  g.fillStyle = c[2];
  g.fillRect(x + 1, y, Math.max(1, w - 4), 1);
  g.fillRect(x, y + 1, 1, Math.max(1, h - 4));
  g.fillRect(x + 1, y + 1, Math.max(1, w - 5), 1);
  g.fillStyle = 'rgba(255,255,255,.5)';
  g.fillRect(x + 1, y + 1, 1, 1);
}

const STONE_SPR = new Map();

function fordStone(x, y, w, h, k) {
  if (x !== (x | 0) || y !== (y | 0) || w > 15 || h > 15) return paintStone(ctx, x, y, w, h, k); // fora do padrão: desenha direto
  const key = k * 256 + w * 16 + h;
  let spr = STONE_SPR.get(key);
  if (!spr) {
    spr = document.createElement('canvas');
    spr.width = w + 2;
    spr.height = h + 2;
    paintStone(spr.getContext('2d'), 0, 0, w, h, k);
    STONE_SPR.set(key, spr);
  }
  ctx.drawImage(spr, x, y);
}

function fordLand(tx, ty) {
  const X = tx < 0 || ty < 0 || tx >= MW || ty >= MH ? FORD : ground[ty * MW + tx];
  return X !== WATER && X !== FORD && X !== BED;
}

function drawFord(tx, ty, x, y, t) {
  const r = (k) => hash2(tx * 13 + k * 7, ty * 17 + k * 3),
    day = Q() > 0 ? sunInfo(6 + S.min / 60).day : 0.6;
  // 1) leito de areia e cascalho
  ctx.fillStyle = '#a2ae88';
  ctx.fillRect(x, y, TS, TS);
  ctx.fillStyle = '#98a07e';
  for (let k = 0; k < 2; k++)
    ctx.fillRect(x + ((r(1 + k) * 10) | 0), y + 2 + k * 7 + ((r(3 + k) * 3) | 0), 5 + ((r(5 + k) * 3) | 0), 1); // marcas de correnteza na areia
  ctx.fillStyle = '#c4c9a6';
  for (let k = 0; k < 4; k++) ctx.fillRect(x + ((r(8 + k) * 15) | 0), y + ((r(12 + k) * 15) | 0), 1, 1);
  ctx.fillStyle = '#808869';
  for (let k = 0; k < 3; k++) ctx.fillRect(x + ((r(16 + k) * 15) | 0), y + ((r(20 + k) * 15) | 0), 1, 1);
  // 2) pedras do fundo (vistas atraves da agua)
  const ns = 1 + ((r(24) * 3) | 0);
  for (let k = 0; k < ns; k++) {
    const w = 3 + ((r(30 + k) * 4) | 0),
      h = 3 + ((r(40 + k) * 2) | 0);
    fordStone(
      x + 1 + ((r(50 + k) * (TS - w - 3)) | 0),
      y + 1 + ((r(60 + k) * (TS - h - 4)) | 0),
      w,
      h,
      (r(70 + k) * 3) | 0,
    );
  }
  // 3) agua transparente: tinge o fundo sem esconde-lo, mais funda onde o vau encontra o rio
  ctx.fillStyle = 'rgba(47,117,180,.8)';
  ctx.fillRect(x, y, TS, TS); // mesma cor da agua do rio, mas transparente: o leito aparece
  const dp = ty * MW + tx,
    wetN = (j) => ground[j] === WATER;
  const fade = (x0, y0, x1, y1, rx, ry, rw, rh) => {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, 'rgba(47,117,180,1)');
    g.addColorStop(1, 'rgba(47,117,180,0)');
    ctx.fillStyle = g;
    ctx.fillRect(rx, ry, rw, rh);
  };
  if (wetN(dp - MW)) fade(x, y, x, y + 8, x, y, TS, 8); // onde o vau encontra o rio, a agua o engole sem emenda
  if (wetN(dp + MW)) fade(x, y + TS, x, y + TS - 8, x, y + TS - 8, TS, 8);
  if (wetN(dp - 1)) fade(x, y, x + 8, y, x, y, 8, TS);
  if (wetN(dp + 1)) fade(x + TS, y, x + TS - 8, y, x + TS - 8, y, 8, TS);
  // 4) caustica / ondulacao na superficie
  for (let k = 0; k < 3; k++) {
    ctx.fillStyle = `rgba(205,236,255,${((0.18 + 0.2 * day) * (0.4 + 0.6 * Math.max(0, Math.sin(t * 1.6 + tx * 2.3 + ty * 1.9 + k * 2.1)))).toFixed(2)})`;
    ctx.fillRect(x + ((tx * 5 + k * 6) % 13), y + 2 + k * 5 + ((tx + ty + k) % 2), 3, 1);
  } // brilho no lugar (o movimento vem dos filetes da correnteza)
  if (Q() > 0) {
    const sh = Math.sin(t * 2 + tx * 1.9 + ty * 3.2);
    if (sh > 0.5) {
      ctx.fillStyle = `rgba(255,242,198,${((0.16 + 0.22 * sh) * day).toFixed(3)})`;
      ctx.fillRect(x + ((tx * 11 + Math.floor(t * 2)) % 13), y + ((ty * 7) % 13), 3, 1);
    }
  }
  // 5) pedra que emerge da agua, com anel de espuma
  if (r(80) < 0.4) {
    const w = 6 + ((r(81) * 3) | 0),
      h = 5 + ((r(82) * 2) | 0),
      px = x + 1 + ((r(83) * (TS - w - 3)) | 0),
      py = y + 2 + ((r(84) * (TS - h - 5)) | 0),
      a = 0.35 + 0.2 * Math.sin(t * 3 + tx + ty);
    ctx.fillStyle = `rgba(235,248,255,${a.toFixed(2)})`;
    ctx.fillRect(px - 1, py + h - 1, w + 2, 3);
    ctx.fillRect(px - 2, py + h, w + 4, 1);
    ctx.fillStyle = 'rgba(6,30,70,.35)';
    ctx.fillRect(px + 2, py + h, w + 1, 2);
    fordStone(px, py, w, h, (r(85) * 3) | 0);
    ctx.fillStyle = `rgba(235,248,255,${(a + 0.1).toFixed(2)})`;
    ctx.fillRect(px, py + h, w, 1);
  }
  // 6) margem: areia molhada e espuma onde o vau toca a terra
  const E = (fx, fy, fw, fh, sx, sy, sw, sh2, k) => {
    if (r(90 + k) < 0.3) return;
    ctx.fillStyle = 'rgba(214,200,152,.55)';
    ctx.fillRect(x + fx, y + fy, fw, fh);
    ctx.fillStyle = `rgba(255,255,255,${(0.22 + 0.16 * Math.sin(t * 1.8 + tx * 0.9 + ty * 0.6)).toFixed(2)})`;
    ctx.fillRect(x + sx, y + sy, sw, sh2);
  };
  if (fordLand(tx, ty - 1)) E(0, 0, TS, 1, 0, 1, TS, 1, 0);
  if (fordLand(tx, ty + 1)) E(0, TS - 1, TS, 1, 0, TS - 2, TS, 1, 1);
  if (fordLand(tx - 1, ty)) E(0, 0, 1, TS, 1, 0, 1, TS, 2);
  if (fordLand(tx + 1, ty)) E(TS - 1, 0, 1, TS, TS - 2, 0, 1, TS, 3);
}

/* ===== Chão parado fundido: textura + variação de região, desenhadas UMA vez por tile ===== */
let fuseLayer = null,
  fuseCtx = null,
  fuseBaked = null;

// Mantém a mesma ordem e fórmulas do desenho normal de drawTile (textura -> variação de região).
function bakeGrassFused(tex) {
  if (fuseLayer) return;
  fuseLayer = document.createElement('canvas');
  fuseLayer.width = MW * TS;
  fuseLayer.height = MH * TS;
  fuseCtx = fuseLayer.getContext('2d');
  fuseBaked = true;
  // Pintada INTEIRA uma vez e nunca mais alterada (alterar um canvas grande que é lido todo quadro pode piscar a tela).
  const c = fuseCtx,
    GT = tex.img.width / TS;
  for (let ty = 0; ty < MH; ty++)
    for (let tx = 0; tx < MW; tx++) {
      const x = tx * TS,
        y = ty * TS,
        terrainNoise = (hash2(Math.floor(tx / 5), Math.floor(ty / 5)) - 0.5) * 5;
      c.drawImage(tex.img, (tx % GT) * TS, (ty % GT) * TS, TS, TS, x, y, TS, TS);
      if (terrainNoise > 0.7) {
        c.fillStyle = `rgba(255,248,190,${(terrainNoise * 0.012).toFixed(3)})`;
        c.fillRect(x, y, TS, TS);
      } else if (terrainNoise < -0.7) {
        c.fillStyle = `rgba(30,60,20,${(-terrainNoise * 0.016).toFixed(3)})`;
        c.fillRect(x, y, TS, TS);
      }
    }
}

/* ===== Fase 2 (?pixi): grama parada desenhada pelo PixiJS =====
 * Antes do laço de tiles, pixiPlanTiles escolhe os tiles de grama parada cuja base o PixiJS vai pôr no quadro de uma vez
 * (PixiGround.js), recortados só nesses tiles; os demais continuam sendo desenhados ao vivo, sem nenhuma mudança. drawTile
 * pula a cópia dos tiles marcados. Um tile só é marcado se for exatamente o caso do ramo "grama parada fundida" de drawTile
 * E nenhum vizinho desenhado antes dele (esquerda, cima-esquerda, cima, cima-direita) pode ter vazado sobre ele: no
 * desenho original o tile era pintado depois e cobria o vazamento (lâminas dobradas passam 1-2 px, mudas/sementes idem). */
const pixiStamp = new Uint32Array(MW * MH);
let pixiNow = 0,
  pixiCount = 0;

// "Este tile está parado?" (tileStill) calculado UMA vez por tile e por quadro: o plano consulta cada tile e seus vizinhos.
// Dentro do plano idleGrassTile(tx, ty) == tileStill(tx, ty), porque o modo parado já foi confirmado ligado (idleGrassEnabled).
const stillStamp = new Uint32Array(MW * MH),
  stillVal = new Uint8Array(MW * MH);

function stillOnce(tx, ty, i) {
  if (stillStamp[i] !== pixiCount) {
    stillStamp[i] = pixiCount;
    stillVal[i] = tileStill(tx, ty) ? 1 : 0;
  }
  return stillVal[i] === 1;
}

// O tile vizinho j (desenhado antes) pode deixar algo passar para dentro do tile seguinte? (muda/semente, ou grama com marcas)
function spills(j) {
  return sapl[j] > 0 || seedAge[j] > 0 || (ground[j] === GRASS && !stillOnce(j % MW, (j / MW) | 0, j));
}

function spillFree(tx, ty, i) {
  if (tx <= 0 || ty <= 0 || tx >= MW - 1) return false;
  return !(spills(i - 1) || spills(i - MW - 1) || spills(i - MW) || spills(i - MW + 1));
}

/**
 * Devolve { fuse, path, n } (a imagem pronta, o recorte e a quantidade de tiles cobertos) ou null se nada será coberto.
 * `served` (opcional) marca os tiles que o cache do chão já entregou neste quadro (com umidade/poças dentro): esses ficam de fora.
 */
function pixiPlanTiles(gx0, gx1, gy0, gy1, served) {
  pixiNow = 0;
  const tex = LEGACY_GROUND ? null : SPR.grass;
  if (!tex || !tex.ready || !idleGrassEnabled()) return null;
  if (!fuseBaked) bakeGrassFused(tex);
  const stamp = ++pixiCount;
  const path = new Path2D(),
    runs = []; // os mesmos retângulos do `path`, como números (x, y, largura): o contexto PixiJS não tem clip
  let n = 0;
  for (let ty = gy0; ty <= gy1; ty++) {
    let run = -1;
    for (let tx = gx0; tx <= gx1 + 1; tx++) {
      const i = ty * MW + tx;
      const ok =
        tx <= gx1 &&
        ground[i] === GRASS &&
        WTc[i] !== 9 &&
        !(served && served[i]) &&
        stillOnce(tx, ty, i) &&
        noWaterAround(tx, ty) &&
        spillFree(tx, ty, i);
      if (ok) {
        pixiStamp[i] = stamp;
        n++;
        if (run < 0) run = tx;
      } else if (run >= 0) {
        runs.push(run * TS, ty * TS, (tx - run) * TS);
        path.rect(run * TS, ty * TS, (tx - run) * TS, TS); // sequência de tiles vizinhos na mesma linha = 1 retângulo
        run = -1;
      }
    }
  }
  if (!n) return null;
  pixiNow = stamp;
  return { fuse: fuseLayer, path, runs, n };
}

/** Fim do laço de tiles do quadro: drawTile volta a desenhar tudo (cache do chão, interior...). */
function pixiPlanEnd() {
  pixiNow = 0;
}

// Sem água nos 8 vizinhos => lakeEdge(tx, ty) retorna sem desenhar (ver LakeRenderer.lakeEdge).
function noWaterAround(tx, ty) {
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const X = tx + dx,
        Y = ty + dy;
      if (X >= 0 && Y >= 0 && X < MW && Y < MH && ground[Y * MW + X] === WATER) return false;
    }
  return true;
}

function drawTile(tx, ty, t) {
  const i = ty * MW + tx,
    x = tx * TS,
    y = ty * TS,
    g = ground[i];
  const h = ((tx * 374761393 + ty * 668265263) >>> 0) % 5;
  if (g === GRASS) {
    // Tile de grama parado (sem pisoteio/dobra/pasto), fora do brejo e longe da água: textura + variação de região +
    // lâminas já prontas numa camada → 1 drawImage no lugar de ~3 chamadas + cálculos. Idêntico ao desenho abaixo.
    if (pixiNow !== 0 && pixiStamp[i] === pixiNow) {
      markFusedTile(i); // a base deste tile já foi posta no quadro pelo PixiJS (pixiPlanTiles)
      return;
    }
    const ftex = LEGACY_GROUND ? null : SPR.grass;
    if (ftex && ftex.ready && WTc[i] !== 9 && noWaterAround(tx, ty) && idleGrassTile(tx, ty)) {
      if (!fuseBaked) bakeGrassFused(ftex);
      ctx.drawImage(fuseLayer, x, y, TS, TS, x, y, TS, TS);
      markFusedTile(i);
      return; // lakeEdge não desenharia nada aqui (sem água nos 8 vizinhos)
    }
    markFusedTile(-1);
    const terrainNoise = (hash2(Math.floor(tx / 5), Math.floor(ty / 5)) - 0.5) * 5;
    const tex = LEGACY_GROUND ? null : SPR.grass;
    if (tex && tex.ready) {
      // textura de grama rasteira (256x256 = 16x16 tiles, sem emendas): cada tile pega o seu pedaço
      const GT = tex.img.width / TS;
      ctx.drawImage(tex.img, (tx % GT) * TS, (ty % GT) * TS, TS, TS, x, y, TS, TS);
      // leve variação de claro/escuro por região (blocos de 5x5 tiles) para quebrar a repetição
      if (terrainNoise > 0.7) {
        ctx.fillStyle = `rgba(255,248,190,${(terrainNoise * 0.012).toFixed(3)})`;
        ctx.fillRect(x, y, TS, TS);
      } else if (terrainNoise < -0.7) {
        ctx.fillStyle = `rgba(30,60,20,${(-terrainNoise * 0.016).toFixed(3)})`;
        ctx.fillRect(x, y, TS, TS);
      }
    } else {
      // reserva enquanto a textura carrega (ou se o arquivo faltar): grama lisa com fiapos
      const green = 188 + terrainNoise;
      ctx.fillStyle = `rgb(${Math.round(105 + terrainNoise * 0.65)},${Math.round(green)},${Math.round(75 + terrainNoise * 0.55)})`;
      ctx.fillRect(x, y, TS, TS);
      const v = hash2(tx, ty);
      ctx.fillStyle = v > 0.5 ? '#4c983c' : '#9cda65';
      if (v > 0.22) {
        ctx.fillRect(x + 3 + ((v * 7) | 0), y + 6, 1, 3);
        ctx.fillRect(x + 5 + ((v * 7) | 0), y + 5, 1, 3);
      }
      if (v > 0.8) {
        ctx.fillStyle = '#f7e4a3';
        ctx.fillRect(x + 11, y + 9, 2, 2);
      }
      if (v > 0.62) {
        ctx.fillStyle = 'rgba(30,78,34,.28)';
        ctx.fillRect(x + 1, y + 13, 5, 1);
      }
    }
    if (WTc[i] === 9) {
      ctx.fillStyle = 'rgba(40,110,96,.30)';
      ctx.fillRect(x, y, TS, TS);
      const r = hash2(tx * 3, ty * 7); // brejo: verde azulado com juncos
      if (r > 0.45) {
        ctx.fillStyle = '#2e6b4a';
        ctx.fillRect(x + 3 + ((r * 8) | 0), y + 4, 1, 6);
        ctx.fillRect(x + 4 + ((r * 8) | 0), y + 3, 1, 7);
      }
      if (r > 0.8) {
        ctx.fillStyle = '#8a6a3a';
        ctx.fillRect(x + 10, y + 2, 1, 4);
      }
    }
  } else if (g === PATH) {
    ctx.fillStyle = '#d9b77e';
    ctx.fillRect(x, y, TS, TS);
    ctx.fillStyle = '#c4a064';
    ctx.fillRect(x + ((h * 3) % 12), y + ((h * 5) % 12), 2, 2);
  } else if (g === STONE) {
    ctx.fillStyle = '#8d9296';
    ctx.fillRect(x, y, TS, TS);
    ctx.fillStyle = '#a9aeb2';
    ctx.fillRect(x + ((h * 3) % 10) + 1, y + ((h * 7) % 9) + 1, 5, 4);
    ctx.fillStyle = '#6c7176';
    ctx.fillRect(x, y + 7, TS, 1);
    ctx.fillRect(x + 8, y, 1, TS);
  } else if (g === SOIL) {
    ctx.fillStyle = wet[i] ? '#62402a' : '#9a6b43';
    ctx.fillRect(x, y, TS, TS);
    ctx.fillStyle = wet[i] ? '#50331f' : '#80532f';
    ctx.fillRect(x, y + 4, TS, 2);
    ctx.fillRect(x, y + 11, TS, 2);
  } else if (g === SAND) {
    const v = hash2(tx, ty),
      wetS = ground[i + 1] === WATER || ground[i - 1] === WATER || ground[i + MW] === WATER || ground[i - MW] === WATER;
    ctx.fillStyle = wetS ? '#d6c58c' : '#e8d9a2';
    ctx.fillRect(x, y, TS, TS);
    ctx.fillStyle = v > 0.5 ? '#d9c88e' : '#f1e5b5';
    ctx.fillRect(x + ((v * 11) | 0) + 1, y + ((h * 3) % 12), 2, 1);
    ctx.fillRect(x + ((((v * 97) % 1) * 13) | 0), y + ((h * 5) % 13) + 1, 1, 1);
    if (v > 0.92) {
      ctx.fillStyle = '#fff6df';
      ctx.fillRect(x + 3, y + 9, 2, 2);
    } else if (v < 0.05) {
      ctx.fillStyle = '#b3a173';
      ctx.fillRect(x + 6, y + 4, 3, 2);
    }
  } else if (g === SCREE) {
    const v = hash2(tx, ty);
    ctx.fillStyle = v > 0.5 ? '#8b857a' : '#847e73';
    ctx.fillRect(x, y, TS, TS);
    ctx.fillStyle = '#6d685f';
    ctx.fillRect(x + ((h * 3) % 11) + 1, y + ((h * 7) % 9) + 2, 4, 3);
    ctx.fillStyle = '#a39d92';
    ctx.fillRect(x + ((h * 5) % 10) + 2, y + ((h * 2) % 8) + 1, 3, 2);
    if (v > 0.7) {
      ctx.fillStyle = '#5e5a52';
      ctx.fillRect(x + 9, y + 11, 3, 2);
    }
  } else if (g === SNOWG) {
    const v = hash2(tx, ty);
    ctx.fillStyle = '#eef4fa';
    ctx.fillRect(x, y, TS, TS);
    ctx.fillStyle = v > 0.5 ? '#dbe7f2' : '#e4eef7';
    ctx.fillRect(x + ((h * 3) % 10), y + ((h * 5) % 10) + 3, 5, 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + ((h * 7) % 12) + 1, y + ((h * 3) % 9), 2, 1);
    if (v > 0.85) {
      ctx.fillStyle = '#b9cde0';
      ctx.fillRect(x + 4, y + 10, 3, 1);
    }
    if (Math.sin(t * 3 + tx * 2.1 + ty * 1.3) > 0.93) {
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.fillRect(x + ((tx * 7) % 13) + 1, y + ((ty * 5) % 13) + 1, 1, 1);
    }
  } else if (g === FORD) {
    drawFord(tx, ty, x, y, t);
  } else if (g === BED) {
    ctx.fillStyle = '#b8a888';
    ctx.fillRect(x, y, TS, TS);
    ctx.fillStyle = '#9a8c72';
    ctx.fillRect(x + ((h * 3) % 11) + 1, y + ((h * 5) % 10) + 2, 3, 2);
    ctx.fillRect(x + ((h * 7) % 12), y + ((h * 2) % 9) + 6, 2, 2);
    ctx.fillStyle = '#d3c7a8';
    ctx.fillRect(x + ((h * 2) % 12) + 1, y + ((h * 4) % 10) + 1, 2, 1);
    ctx.fillStyle = 'rgba(60,50,35,.18)';
    ctx.fillRect(x, y + TS - 2, TS, 2);
  } else if (g === WATER) {
    ctx.fillStyle = '#2f75b4';
    ctx.fillRect(x, y, TS, TS);
    lakeDepthDraw(tx, ty, x, y);
    if (ground[i - MW] === SAND || ground[i + MW] === SAND || ground[i - 1] === SAND || ground[i + 1] === SAND) {
      // espuma de onda na praia
      ctx.fillStyle = `rgba(255,255,255,${(0.26 + 0.2 * Math.sin(t * 1.6 + tx * 0.9 + ty * 0.6)).toFixed(2)})`;
      if (ground[i - MW] === SAND) ctx.fillRect(x, y, TS, 2);
      if (ground[i + MW] === SAND) ctx.fillRect(x, y + TS - 2, TS, 2);
      if (ground[i - 1] === SAND) ctx.fillRect(x, y, 2, TS);
      if (ground[i + 1] === SAND) ctx.fillRect(x + TS - 2, y, 2, TS);
    }
    if (!FLM[i] || FLX[i] * FLX[i] + FLY[i] * FLY[i] < 16) {
      // agua parada (lago/mar): brilho que pisca no lugar, sem direcao
      const sx = (tx * 7 + ty * 3) % 12;
      ctx.fillStyle = `rgba(190,230,255,${(0.22 + 0.3 * Math.max(0, Math.sin(t * 1.3 + tx * 2.1 + ty * 1.7))).toFixed(2)})`;
      ctx.fillRect(x + sx, y + 4 + (ty % 3) * 4, 3, 1);
    }
    if (Q() > 0) {
      const shimmer = Math.sin(t * 2 + tx * 1.9 + ty * 3.2);
      if (shimmer > 0.5) {
        ctx.fillStyle = `rgba(255,242,198,${(0.16 + 0.22 * shimmer) * sunInfo(6 + S.min / 60).day})`;
        ctx.fillRect(x + ((tx * 11 + Math.floor(t * 2)) % 13), y + ((ty * 7) % 13), 3, 1);
      }
    }
  }
  lakeEdge(tx, ty);
}

export { drawTile, pixiPlanEnd, pixiPlanTiles };
