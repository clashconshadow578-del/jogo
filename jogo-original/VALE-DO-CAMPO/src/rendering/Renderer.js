/**
 * Renderização de um quadro: câmera, chão, água, entidades ordenadas por Y, reflexos, mato, iluminação, vaga-lumes, clima, atmosfera e vinheta.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { MH, MW, OXP, OYP, ROCK, TREE, TS, VH, VW } from '../config/constants.js';
import { frameNo } from '../core/GameLoop.js';
import { S } from '../core/GameState.js';
import { nightF } from '../core/TimeManager.js';
import { drawBubbles } from '../entities/animals/AnimalSocial.js';
import { carcDrawEnts } from '../entities/Carcass.js';
import { cow, setCow } from '../entities/cow/Cow.js';
import { drawCow } from '../entities/cow/CowRenderer.js';
import { herd } from '../entities/cow/Herd.js';
import { chx, drawChx } from '../entities/farm/Chickens.js';
import { drawFox, fox } from '../entities/farm/FarmFoxes.js';
import { drawNinho, ninhos } from '../entities/farm/Nests.js';
import { drawWrm, wrm } from '../entities/farm/Worms.js';
import { drawVillager, npc, npcPos } from '../entities/NPC.js';
import { drawPlayer } from '../entities/Player.js';
import { wolfEnt } from '../entities/Werewolf.js';
import { drawAna } from '../entities/wild/Anaconda.js';
import { drawFauna, drawFaunaLabels, FA_SP, fauna } from '../entities/wild/Fauna.js';
import { drawAnimalStatus } from './AnimalStatus.js';
import { drawJag } from '../entities/wild/Jaguar.js';
import { amzBig, amzPad } from '../features/amazon/AmazonTrees.js';
import { drawAtmosphere } from './Atmosphere.js';
import { ctx } from './Canvas.js';
import { glow } from './Effects.js';
import { lakeDepthTick, lakeEdge } from './LakeRenderer.js';
import { applyLighting } from './LightingSystem.js';
import { drawRelief } from './Relief.js';
import { contactShadow } from './ShadowSystem.js';
import { drawBin, drawHouse, drawRock } from './Sprites.js';
import { terrainDraw, terrainServed } from './TerrainCache.js';
import { drawTile } from './TileRenderer.js';
import { drawLightning, drawWeather } from './WeatherRenderer.js';
import { cropModel, drawCrop } from '../systems/FarmingSystem.js';
import { fishDrawEnts } from '../systems/Fishing.js';
import { treeShake } from '../systems/Woodcutting.js';
import { smooth } from '../utils/MathUtils.js';
import { drawDust, drawPrints, drawTrampledGrass } from '../world/GrassSystem.js';
import { renderInterior } from '../world/HouseInterior.js';
import { fvBankFX } from '../world/hydrology/Fluvial.js';
import { drawHydro } from '../world/hydrology/Hydrology.js';
import { INST } from '../world/Instances.js';
import { drawShroom, shroom } from '../world/Mushrooms.js';
import { drawTree, treeModel } from '../world/Trees.js';
import { drawMato, hydroMatoList } from '../world/Vegetation.js';
import { drawVilHouse, VIL } from '../world/Village.js';
import { drawQNpc, QNPC } from '../world/village/Quests.js';
import { drawVendor, VEND } from '../world/village/Vendor.js';
import { drawReflections, drawSplash, drawWaterFX, wCam } from '../world/WaterSystem.js';
import { climate } from '../world/WeatherSystem.js';
import { actRange, crops, inAct, obj } from '../world/World.js';

let vcam = null;

/* ============ RENDER ============ */
/**
 * Fornecedores extras de entidades desenháveis. Cada função recebe (ents, camX, camY) e faz
 * ents.push({ k: yDeOrdenacao, sh: [x, y, largura, altura, tipo], draw: () => {...} }).
 * Exemplo de uso em README.md ("Como adicionar novos animais").
 */
export const entityProviders = [];
function render() {
  if (S.inside) {
    renderInterior();
    return;
  }
  const t = performance.now() / 1000;
  const h = 6 + S.min / 60;
  const camX = Math.round(Math.min(Math.max(S.px - VW / 2, 0), MW * TS - VW));
  const camY = Math.round(Math.min(Math.max(S.py - VH / 2, 0), MH * TS - VH));
  vcam = { x: camX, y: camY };
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

  // 1) fundo + chão
  lakeDepthTick(t);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#5aa846';
  ctx.fillRect(0, 0, VW, VH);
  ctx.setTransform(1, 0, 0, 1, -camX, -camY);
  terrainDraw(x0, x1, y0, y1, frameNo); // tiles estáticos vêm de um cache (1 cópia); o resto é desenhado ao vivo abaixo
  for (let ty = gy0; ty <= gy1; ty++)
    for (let tx = gx0; tx <= gx1; tx++) {
      if (terrainServed[ty * MW + tx]) continue;
      drawTile(tx, ty, t);
      drawTrampledGrass(tx, ty, t);
      drawHydro(tx, ty, t);
    }
  drawRelief(x0, x1, y0, y1);
  drawPrints();
  wCam.x = camX;
  wCam.y = camY;
  drawWaterFX(t, camX, camY, x0, x1, y0, y1);

  // 2) entidades (Y-sort) e sombras
  const sunS = (h - 6) / 14;
  const e = sunS >= 0 && sunS <= 1 ? Math.sin(Math.PI * sunS) : 0;
  const shA = 0.4 * smooth(0, 0.12, e) * S.lum * (1 - climate.cloud * 0.95);
  const ents = [];
  const AP = amzPad ? amzPad() : null,
    ax0 = AP ? Math.max(AR0[0], x0 - AP.x) : x0,
    ax1 = AP ? Math.min(AR0[1], x1 + AP.x) : x1,
    ay0 = AP ? Math.max(0, y0 - AP.up) : y0,
    ay1 = AP ? Math.min(MH - 1, y1 + AP.dn) : y1;
  for (let ty = ay0; ty <= ay1; ty++)
    for (let tx = ax0; tx <= ax1; tx++) {
      const o = obj[ty * MW + tx];
      if (ty < y0 || ty > y1 || tx < x0 || tx > x1) {
        if (o !== TREE || !amzBig(tx, ty)) continue;
      } else {
        const sI = shroom[ty * MW + tx];
        if (sI && !o)
          ents.push({
            k: (ty + 1) * TS - 2,
            sh: [tx * TS + 8, (ty + 1) * TS - 2, 6, 3],
            draw: () => drawShroom(tx * TS + 8, (ty + 1) * TS - 3, sI),
          });
      }
      if (o === TREE) {
        const bx = tx * TS + 8,
          by = (ty + 1) * TS,
          tm = treeModel(tx, ty);
        ents.push({
          k: by,
          sh: [bx, by, (tm && tm.cw) || 18, (tm && tm.rh) || 26, 'tree', tm, (tm && tm.reach) || 0],
          draw: () => drawTree(bx + treeShake(ty * MW + tx), by, tx, ty),
        });
      }
      {
        const cr = crops[ty * MW + tx];
        if (cr && !o) {
          const cm = cropModel(cr),
            bx = tx * TS + 8,
            by = (ty + 1) * TS - 1;
          ents.push({
            k: by,
            sh: [bx, by, 10, (cm && cm.h) || 12, 'crop', cm],
            draw: () => drawCrop(cr, bx, by, cropModel(cr)),
          });
        }
      }
      if (o === TREE) {
      } else if (o === ROCK) {
        const bx = tx * TS + 8,
          by = (ty + 1) * TS;
        ents.push({ k: by, sh: [bx, by, 12, 6], draw: () => drawRock(bx, by) });
      }
    }
  for (const a of fauna) {
    const mg = a.sp === 'anaconda' ? 150 : 40;
    if (a.x < camX - mg || a.x > camX + VW + mg || a.y < camY - mg || a.y > camY + VH + mg + 20 || !inAct(a.x, a.y))
      continue;
    ents.push({
      k: a.z > 6 ? a.y + 32 : a.y,
      sh:
        a.sw || a.sp === 'anaconda' || (a.sp === 'jaguar' && a.z > 6)
          ? [a.x, a.y, 1, 1]
          : [a.x, a.y, FA_SP[a.sp].sw, FA_SP[a.sp].hh],
      draw: () => (a.sp === 'jaguar' ? drawJag(a) : a.sp === 'anaconda' ? drawAna(a) : drawFauna(a)),
    });
  }
  carcDrawEnts(ents, camX, camY);
  fishDrawEnts(ents, camX, camY);
  if (INST.vilAct)
    for (const v of VIL)
      if (inAct(v.x * TS, v.y * TS))
        ents.push({
          k: (v.y + 3) * TS,
          sh: [v.x * TS + 4.5 * TS, (v.y + 3) * TS, 60, 10, 'house'],
          draw: () => drawVilHouse(v),
        });
  if (INST.vilAct && inAct(VEND.x, VEND.y))
    ents.push({ k: VEND.y, sh: [VEND.x, VEND.y, 8, 14, 'person'], draw: drawVendor });
  for (const w of wrm)
    if (w.st === 'surf' && inAct(w.x, w.y))
      ents.push({ k: w.y - 1, sh: [w.x, w.y, 6, 2, 'worm'], draw: () => drawWrm(w) });
  for (const n of ninhos)
    if (inAct(n.x, n.y)) ents.push({ k: n.y - 2, sh: [n.x, n.y, 12, 6, 'nest'], draw: () => drawNinho(n) });
  for (const f of fox) if (inAct(f.x, f.y)) ents.push({ k: f.y, sh: [f.x, f.y, 8, 8, 'fox'], draw: () => drawFox(f) });
  for (const c of chx)
    if (inAct(c.x, c.y)) ents.push({ k: c.y, sh: [c.x, c.y, 8, 10, 'chicken'], draw: () => drawChx(c) });
  if (INST.vilAct)
    for (let i = 0; i < QNPC.length; i++) {
      const p = QNPC[i];
      if (inAct(p.px, p.py)) ents.push({ k: p.py, sh: [p.px, p.py, 8, 14, 'person'], draw: () => drawQNpc(i) });
    }
  if (INST.homeAct) {
    ents.push({ k: 176 + OYP, sh: [278 + OXP, 176 + OYP, 136, 44, 'house'], draw: drawHouse });
    ents.push({ k: 208 + OYP, sh: [312 + OXP, 208 + OYP, 12, 12], draw: drawBin });
  }
  for (const q of herd)
    if (inAct(q.x, q.y))
      ents.push({
        k: q.y,
        sh: [q.x, q.y, q.calf ? 12 : 20, q.calf ? 8 : 13, 'cow'],
        draw: () => {
          const o = cow;
          setCow(q);
          drawCow();
          setCow(o);
        },
      });
  const n = npcPos();
  if (!npc.inside && inAct(n.x, n.y)) ents.push({ k: n.y, sh: [n.x, n.y, 8, 14, 'person'], draw: drawVillager });
  if (wolfEnt) wolfEnt(ents);
  for (const add of entityProviders) add(ents, camX, camY);
  ents.push({ k: S.py, sh: [S.px, S.py, 8, 14, 'person'], draw: drawPlayer });

  const fillBefore = ctx.fillStyle; // contactShadow não faz mais save/restore por entidade: devolvemos o fillStyle aqui
  for (const en of ents) {
    if (en.draw === drawPlayer && (S.wetK || 0) > 0.3) continue;
    contactShadow(en.sh[0], en.sh[1], en.sh[2]);
  }
  ctx.fillStyle = fillBefore;
  ents.sort((a, b) => a.k - b.k);
  drawReflections(ents, t);
  for (let ty = gy0; ty <= gy1; ty++)
    for (let tx = gx0; tx <= gx1; tx++) {
      lakeEdge(tx, ty);
      fvBankFX(tx, ty);
    } // bordas sempre acima da água
  const ML = hydroMatoList(gx0, gx1, gy0, gy1);
  let mi = 0; // mato cobre os pés do personagem, da vaca e do aldeão
  for (const en of ents) {
    while (mi < ML.length && ML[mi].k <= en.k) {
      drawMato(ML[mi].tx, ML[mi].ty, t, ML[mi].i);
      mi++;
    }
    en.draw();
  }
  while (mi < ML.length) {
    drawMato(ML[mi].tx, ML[mi].ty, t, ML[mi].i);
    mi++;
  }
  drawDust();
  drawSplash();
  applyLighting(t, h, camX, camY, ents);
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

  drawWeather(t, camX, camY);
  // 4b) Raios de sol, bloom seletivo e poeira atmosférica
  drawAtmosphere(t, h, camX, camY, ents);
  drawLightning();
  // 5) vinheta
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const v = ctx.createRadialGradient(VW / 2, VH / 2, VH * 0.35, VW / 2, VH / 2, VW * 0.65);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, `rgba(0,0,0,${(0.2 + 0.3 * nightF(h)) * S.lum})`);
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, VW, VH);
}

export { render, vcam };
