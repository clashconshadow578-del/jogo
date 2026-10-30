/**
 * Renderização de um quadro: câmera, chão, água, entidades ordenadas por Y, reflexos, mato, iluminação, vaga-lumes, clima, atmosfera e vinheta.
 *
 * O quadro é feito em três passes, sempre nesta ordem: `passGround` (fundo e chão), `passEntities` (tudo o que fica em pé, ordenado
 * por Y) e `passFinish` (luz, clima, atmosfera e vinheta; ele chama `passLight`, `passOverlays`, `passSky` e `passVignette`).
 * Dentro deles há camadas menores (`layerTerrain`, `layerRelief`, `layerWater`; `layerShadows`, `layerShoreline`, `layerEntities`).
 * Cada passe e cada camada é `extensible()`: é por aí que o PixiJS assume uma de cada vez, com o desenho em Canvas como plano B:
 *
 *   passGround.extend((prev) => function (v) { if (!pixiOk()) return prev.apply(this, arguments); ...desenha no Pixi... });
 *
 * `v` é a câmera do quadro (ver `viewFor`) e `ents` a lista de entidades (`collectEntities`).
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { MH, MW, TS, VH, VW } from '../config/constants.js';
import { extensible } from '../core/extensions.js';
import { frameNo } from '../core/GameLoop.js';
import { S } from '../core/GameState.js';
import { nightF } from '../core/TimeManager.js';
import { drawBubbles } from '../entities/animals/AnimalSocial.js';
import { drawPlayer } from '../entities/Player.js';
import { drawFaunaLabels } from '../entities/wild/Fauna.js';
import { drawAnimalStatus } from './AnimalStatus.js';
import { AB } from './Ablate.js';
import { drawAtmosphere } from './Atmosphere.js';
import { ctx } from './Canvas.js';
import { collectEntities } from './Entities.js';
import { glow } from './Effects.js';
import { lakeDepthTick, lakeEdge } from './LakeRenderer.js';
import { applyLighting } from './LightingSystem.js';
import { drawRelief } from './Relief.js';
import { contactShadow } from './ShadowSystem.js';
import { terrainDraw, terrainServed } from './TerrainCache.js';
import { drawTile, pixiPlanEnd, pixiPlanTiles } from './TileRenderer.js';
import { pixiGroundDraw } from './pixi/PixiGround.js';
import { getPixi } from './pixi/PixiBridge.js';
import { drawLightning, drawWeather } from './WeatherRenderer.js';
import { drawDust, drawPrints, drawTrampledGrass } from '../world/GrassSystem.js';
import { renderInterior } from '../world/HouseInterior.js';
import { fvBankFX } from '../world/hydrology/Fluvial.js';
import { drawHydro } from '../world/hydrology/Hydrology.js';
import { drawMato, hydroMatoList } from '../world/Vegetation.js';
import { drawReflections, drawSplash, drawWaterFX, wCam } from '../world/WaterSystem.js';
import { actRange } from '../world/World.js';

let vcam = null;

/* ============ RENDER ============ */
/** Esta entidade fica sem desenhar neste quadro (só o teste de desempenho liga isso; ver Ablate.js). */
function semDesenho(en) {
  if (AB.entidades) return true;
  const k = en.sh[4];
  return (
    (AB.arvores && k === 'tree') ||
    (AB.plantas && k === 'crop') ||
    (AB.outros && k !== 'tree' && k !== 'crop' && en.draw !== drawPlayer)
  );
}

/** Câmera e faixas de tiles de um quadro: tudo o que os passes precisam saber sobre "onde estamos olhando" (`t` em segundos, `h` hora do dia). */
function viewFor() {
  const t = performance.now() / 1000;
  const h = 6 + S.min / 60;
  const camX = Math.round(Math.min(Math.max(S.px - VW / 2, 0), MW * TS - VW));
  const camY = Math.round(Math.min(Math.max(S.py - VH / 2, 0), MH * TS - VH));
  const AR0 = actRange(),
    x0 = Math.max(AR0[0], Math.floor(camX / TS) - 1),
    x1 = Math.min(AR0[1], Math.floor((camX + VW) / TS) + 1);
  const y0 = Math.max(0, Math.floor(camY / TS) - 1),
    y1 = Math.min(MH - 1, Math.floor((camY + VH) / TS) + 1);

  // Tiles de chão/grama/hidrologia/mato (o que é desenhado tile a tile). Folga: 1 tile inteiro à esquerda e em cima (o
  // mato inclinado de um tile vizinho pode entrar 1-2 px na tela); à direita e embaixo, `floor(borda / TS)` já é o tile
  // que contém o primeiro pixel FORA da tela, então não há tile extra. Conferido por pixels: o quadro é idêntico ao da
  // folga antiga em 160 posições da câmera (tests/perf/posgrid.mjs). Árvores e entidades usam x0..y1, com folga maior.
  const gx0 = Math.max(AR0[0], Math.floor(camX / TS) - 1),
    gx1 = Math.min(AR0[1], Math.floor((camX + VW) / TS)),
    gy0 = Math.max(0, Math.floor(camY / TS) - 1),
    gy1 = Math.min(MH - 1, Math.floor((camY + VH) / TS));
  return { t, h, camX, camY, AR0, x0, x1, y0, y1, gx0, gx1, gy0, gy1 };
}

/** Camada: fundo e chão (cache do terreno, tiles, trilhas e hidrologia). Com `?pixi`, a grama parada vem do PixiJS. */
const layerTerrain = extensible(function layerTerrain(v) {
  const { t, camX, camY, x0, x1, y0, y1, gx0, gx1, gy0, gy1 } = v;
  // 1) fundo + chão
  lakeDepthTick(t);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#5aa846';
  ctx.fillRect(0, 0, VW, VH);
  ctx.setTransform(1, 0, 0, 1, -camX, -camY);
  terrainDraw(x0, x1, y0, y1, frameNo); // tiles estáticos vêm de um cache (1 cópia); o resto é desenhado ao vivo abaixo
  if (getPixi()) {
    // só com ?pixi (fase 2): a grama parada vem da GPU; sem isso (ou se falhar) tudo é desenhado ao vivo como sempre.
    // Fica DEPOIS do cache do chão: o cache também usa drawTile e não pode pular tiles.
    const plan = pixiPlanTiles(gx0, gx1, gy0, gy1, terrainServed);
    if (plan && !pixiGroundDraw(ctx, plan, gx0, gx1, gy0, gy1)) pixiPlanEnd();
  }
  for (let ty = gy0; ty <= gy1; ty++)
    for (let tx = gx0; tx <= gx1; tx++) {
      if (terrainServed[ty * MW + tx]) continue;
      drawTile(tx, ty, t);
      drawTrampledGrass(tx, ty, t);
      if (!AB.hidro) drawHydro(tx, ty, t);
    }
  pixiPlanEnd();
});

/** Camada: relevo e pegadas. */
const layerRelief = extensible(function layerRelief(v) {
  const { x0, x1, y0, y1 } = v;
  if (!AB.relevo) drawRelief(x0, x1, y0, y1);
  drawPrints();
});

/** Camada: efeitos da água que ficam sobre o chão. */
const layerWater = extensible(function layerWater(v) {
  const { t, camX, camY, x0, x1, y0, y1 } = v;
  wCam.x = camX;
  wCam.y = camY;
  if (!AB.agua) drawWaterFX(t, camX, camY, x0, x1, y0, y1);
});

/** Passe 1: fundo + chão (tiles, trilhas, hidrologia), relevo, pegadas e a água que fica sobre o chão, nesta ordem. */
/** Camada: o chão por inteiro (terreno + relevo e pegadas) numa só etapa: o PixiJS desenha as duas juntas, sem canvas no meio. */
const layerBase = extensible(function layerBase(v) {
  layerTerrain(v);
  layerRelief(v);
});

const passGround = extensible(function passGround(v) {
  layerBase(v);
  layerWater(v);
});

/** Camada: sombras de contato sob cada entidade (antes da ordenação por Y: seguem a ordem em que as entidades foram reunidas). */
const layerShadows = extensible(function layerShadows(v, ents) {
  const fillBefore = ctx.fillStyle; // contactShadow não faz mais save/restore por entidade: devolvemos o fillStyle aqui
  if (!AB.sombras)
    for (const en of ents) {
      if (en.draw === drawPlayer && (S.wetK || 0) > 0.3) continue;
      contactShadow(en.sh[0], en.sh[1], en.sh[2]);
    }
  ctx.fillStyle = fillBefore;
});

/** Camada: reflexos na água e bordas do lago e das margens (as bordas ficam sempre acima da água). */
const layerShoreline = extensible(function layerShoreline(v, ents) {
  const { t, gx0, gx1, gy0, gy1 } = v;
  if (!AB.agua) drawReflections(ents, t);
  if (!AB.agua)
    for (let ty = gy0; ty <= gy1; ty++)
      for (let tx = gx0; tx <= gx1; tx++) {
        lakeEdge(tx, ty);
        fvBankFX(tx, ty);
      } // bordas sempre acima da água
});

/** Camada: as entidades já ordenadas por Y, com o mato cobrindo os pés. */
const layerEntities = extensible(function layerEntities(v, ents) {
  const { t, gx0, gx1, gy0, gy1 } = v;
  const ML = hydroMatoList(gx0, gx1, gy0, gy1);
  let mi = 0; // mato cobre os pés do personagem, da vaca e do aldeão
  for (const en of ents) {
    while (mi < ML.length && ML[mi].k <= en.k) {
      if (!AB.mato) drawMato(ML[mi].tx, ML[mi].ty, t, ML[mi].i);
      mi++;
    }
    if (!semDesenho(en)) en.draw();
  }
  while (mi < ML.length) {
    if (!AB.mato) drawMato(ML[mi].tx, ML[mi].ty, t, ML[mi].i);
    mi++;
  }
});

/** Passe 2: sombras de contato, ordem Y, reflexos, bordas do lago e o desenho de cada entidade (o mato cobre os pés), nesta ordem. */
const passEntities = extensible(function passEntities(v, ents) {
  layerShadows(v, ents);
  ents.sort((a, b) => a.k - b.k);
  layerShoreline(v, ents);
  layerEntities(v, ents);
});

/** Passe 3a (luz): poeira, respingos e a iluminação (mapa de luz e sombras projetadas). */
const passLight = extensible(function passLight(v, ents) {
  const { t, h, camX, camY } = v;
  drawDust();
  if (!AB.agua) drawSplash();
  if (!AB.luz) applyLighting(t, h, camX, camY, ents);
});

/** Passe 3b (por cima da luz): balões, estados dos bichos, etiquetas e vaga-lumes. */
const passOverlays = extensible(function passOverlays(v) {
  const { t, h, camX, camY } = v;
  drawBubbles(camX, camY);
  drawAnimalStatus();
  drawFaunaLabels();
  // vaga-lumes (aditivo)
  const nf = nightF(h) * S.lum;
  if (nf > 0.02) {
    ctx.setTransform(1, 0, 0, 1, -camX, -camY);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 8; i++) {
      const fx0 = 200 + ((i * 37) % 240) + Math.sin(t * 0.5 + i) * 10,
        fy0 = 100 + ((i * 53) % 200) + Math.cos(t * 0.4 + i) * 8;
      glow(fx0, fy0, 6, '210,255,120', 0.5 * nf * (0.6 + 0.4 * Math.sin(t * 3 + i)));
    }
    ctx.globalCompositeOperation = 'source-over';
  }
});

/** Passe 3c (céu): clima (chuva, nuvens), raios de sol, bloom, poeira atmosférica e relâmpago. */
const passSky = extensible(function passSky(v, ents) {
  const { t, h, camX, camY } = v;
  if (!AB.clima) drawWeather(t, camX, camY);
  // 4b) Raios de sol, bloom seletivo e poeira atmosférica
  if (!AB.atm) drawAtmosphere(t, h, camX, camY, ents);
  if (!AB.clima) drawLightning();
});

/** Passe 3d: vinheta (escurece as bordas, mais forte à noite). */
const passVignette = extensible(function passVignette(v) {
  const { h } = v;
  // 5) vinheta
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const vig = ctx.createRadialGradient(VW / 2, VH / 2, VH * 0.35, VW / 2, VH / 2, VW * 0.65);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, `rgba(0,0,0,${(0.2 + 0.3 * nightF(h)) * S.lum})`);
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, VW, VH);
});

/** Passe 3: acabamento, sempre nesta ordem: luz, sobreposições, céu e vinheta (cada etapa também é `extensible()`). */
const passFinish = extensible(function passFinish(v, ents) {
  passLight(v, ents);
  passOverlays(v);
  passSky(v, ents);
  passVignette(v);
});

function render() {
  if (S.inside) {
    renderInterior();
    return;
  }
  const v = viewFor();
  vcam = { x: v.camX, y: v.camY };
  passGround(v);
  const ents = collectEntities(v);
  passEntities(v, ents);
  passFinish(v, ents);
}

export {
  layerBase,
  layerEntities,
  layerRelief,
  layerShadows,
  layerShoreline,
  layerTerrain,
  layerWater,
  passEntities,
  passFinish,
  passGround,
  passLight,
  passOverlays,
  passSky,
  passVignette,
  render,
  vcam,
  viewFor,
};
// Compatibilidade: `entityProviders` e `collectEntities` agora moram em rendering/Entities.js (o jogo e o README ainda importam daqui).
export { collectEntities, entityProviders } from './Entities.js';
