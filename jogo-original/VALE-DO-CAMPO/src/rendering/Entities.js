/**
 * Entidades do quadro: reúne tudo o que fica em pé no mundo (cogumelos, árvores, plantações, pedras, bichos, casas, gente e o
 * jogador) numa lista com a chave de ordenação Y (`k`). Aqui só se decide O QUE existe e ONDE; cada entidade traz a sua função
 * `draw`. A ORDEM em que os grupos entram na lista importa: `ents.sort` é estável e chaves iguais mantêm essa ordem.
 *
 * Origem: Vale_do_Campo_V64.html (s02); separado de Renderer.js na Fase 5 do plano de migração.
 */

import { MH, MW, OXP, OYP, ROCK, TREE, TS, VH, VW } from '../config/constants.js';
import { S } from '../core/GameState.js';
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
import { drawHarpy } from '../entities/wild/Harpy.js';
import { drawFauna, FA_SP, fauna } from '../entities/wild/Fauna.js';
import { drawJag } from '../entities/wild/Jaguar.js';
import { amzBig, amzPad } from '../features/amazon/AmazonTrees.js';
import { cropModel, drawCrop } from '../systems/FarmingSystem.js';
import { fishDrawEnts } from '../systems/Fishing.js';
import { treeShake } from '../systems/Woodcutting.js';
import { INST } from '../world/Instances.js';
import { drawShroom, shroom } from '../world/Mushrooms.js';
import { treeModel } from '../world/Trees.js';
import { drawVilHouse, VIL } from '../world/Village.js';
import { drawQNpc, QNPC } from '../world/village/Quests.js';
import { drawVendor, VEND } from '../world/village/Vendor.js';
import { crops, inAct, obj } from '../world/World.js';
import { drawBin, drawHouse, drawRock } from './Sprites.js';
import { drawTree } from './TreeRenderer.js';

/**
 * Fornecedores extras de entidades desenháveis. Cada função recebe (ents, camX, camY) e faz
 * ents.push({ k: yDeOrdenacao, sh: [x, y, largura, altura, tipo], draw: () => {...} }).
 * Exemplo de uso em README.md ("Como adicionar novos animais").
 */
export const entityProviders = [];

/** Cogumelos, árvores, plantações e pedras: o que está preso a um tile (inclui as árvores grandes da Amazônia logo fora da tela, por causa da copa). */
function collectTiles(ents, v) {
  const { AR0, x0, x1, y0, y1 } = v;
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
}

/** Fauna selvagem (onça, anaconda e os demais bichos). */
function collectFauna(ents, v) {
  const { camX, camY } = v;
  for (const a of fauna) {
    const mg = a.sp === 'anaconda' ? 150 : 40,
      ay = a.sp === 'harpy' ? a.y - a.z : a.y; // a harpia pousada na copa aparece bem acima da base da árvore
    if (a.x < camX - mg || a.x > camX + VW + mg || ay < camY - mg || ay > camY + VH + mg + 20 || !inAct(a.x, a.y))
      continue;
    const alta = a.sp === 'harpy' && a.z > 12; // no ar (ou na copa): desenhada por cima das árvores
    ents.push({
      k: alta ? a.y + 600 : a.z > 6 ? a.y + 32 : a.y,
      sh: alta
        ? [a.x, a.y, Math.max(5, 16 - a.z * 0.05), Math.max(2, 4 - a.z * 0.012)] // sombra no chão, menor e mais fraca quanto mais alto
        : a.sw || a.sp === 'anaconda' || (a.sp === 'jaguar' && a.z > 6)
          ? [a.x, a.y, 1, 1]
          : [a.x, a.y, FA_SP[a.sp].sw, FA_SP[a.sp].hh],
      draw: () =>
        a.sp === 'jaguar'
          ? drawJag(a)
          : a.sp === 'anaconda'
            ? drawAna(a)
            : a.sp === 'harpy'
              ? drawHarpy(a)
              : drawFauna(a),
    });
  }
}

/** Aldeia: casas e vendedor. */
function collectVillage(ents) {
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
}

/** Bichos da fazenda: minhocas, ninhos, raposas e galinhas. */
function collectFarmAnimals(ents) {
  for (const w of wrm)
    if (w.st === 'surf' && inAct(w.x, w.y))
      ents.push({ k: w.y - 1, sh: [w.x, w.y, 6, 2, 'worm'], draw: () => drawWrm(w) });
  for (const n of ninhos)
    if (inAct(n.x, n.y)) ents.push({ k: n.y - 2, sh: [n.x, n.y, 12, 6, 'nest'], draw: () => drawNinho(n) });
  for (const f of fox) if (inAct(f.x, f.y)) ents.push({ k: f.y, sh: [f.x, f.y, 8, 8, 'fox'], draw: () => drawFox(f) });
  for (const c of chx)
    if (inAct(c.x, c.y)) ents.push({ k: c.y, sh: [c.x, c.y, 8, 10, 'chicken'], draw: () => drawChx(c) });
}

/** Moradores com missão. */
function collectQuestNpcs(ents) {
  if (INST.vilAct)
    for (let i = 0; i < QNPC.length; i++) {
      const p = QNPC[i];
      if (inAct(p.px, p.py)) ents.push({ k: p.py, sh: [p.px, p.py, 8, 14, 'person'], draw: () => drawQNpc(i) });
    }
}

/** A casa e a lixeira. */
function collectHome(ents) {
  if (INST.homeAct) {
    ents.push({ k: 176 + OYP, sh: [278 + OXP, 176 + OYP, 136, 44, 'house'], draw: drawHouse });
    ents.push({ k: 208 + OYP, sh: [312 + OXP, 208 + OYP, 12, 12], draw: drawBin });
  }
}

/** Vacas e bezerros. */
function collectHerd(ents) {
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
}

/** O aldeão que passeia. */
function collectVillager(ents) {
  const n = npcPos();
  if (!npc.inside && inAct(n.x, n.y)) ents.push({ k: n.y, sh: [n.x, n.y, 8, 14, 'person'], draw: drawVillager });
}

/** Reúne tudo o que é desenhado em pé no mundo, cada coisa com sua chave de ordenação Y. A ordem dos grupos abaixo é a do jogo original. */
export function collectEntities(v) {
  const { camX, camY } = v;
  const ents = [];
  collectTiles(ents, v);
  collectFauna(ents, v);
  carcDrawEnts(ents, camX, camY);
  fishDrawEnts(ents, camX, camY);
  collectVillage(ents);
  collectFarmAnimals(ents);
  collectQuestNpcs(ents);
  collectHome(ents);
  collectHerd(ents);
  collectVillager(ents);
  if (wolfEnt) wolfEnt(ents);
  for (const add of entityProviders) add(ents, camX, camY);
  ents.push({ k: S.py, sh: [S.px, S.py, 8, 14, 'person'], draw: drawPlayer });
  return ents;
}
