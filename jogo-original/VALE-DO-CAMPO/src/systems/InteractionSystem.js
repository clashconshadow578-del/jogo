/**
 * Ação do botão Usar (afagar animais, conversar, colher, usar a ferramenta selecionada) e do botão Dormir.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { CROP } from '../config/balance.js';
import { BIN, GRASS, MH, MW, PATH, SOIL, TS, WATER } from '../config/constants.js';
import { PLAYER_PREY } from '../config/ecosystem.js';
import { toolFx } from '../config/progression.js';
import { extensible } from '../core/extensions.js';
import { S } from '../core/GameState.js';
import { dormir } from '../core/TimeManager.js';
import { playerSnared, playerStruggle } from '../entities/ai/Perception.js';
import { aniInfo, aniInit, say } from '../entities/animals/AnimalSocial.js';
import { herd } from '../entities/cow/Herd.js';
import { chxInfoNear } from '../entities/farm/Chickens.js';
import { collectEggNear } from '../entities/farm/Eggs.js';
import { npc, npcPos } from '../entities/NPC.js';
import { spend } from '../entities/Player.js';
import { moo, mooKind } from './audio/AnimalSounds.js';
import { beep } from './audio/AudioSystem.js';
import { sell, tilled } from './FarmingSystem.js';
import { isFenceCode, isGateCode } from '../config/fences.js';
import { ITEMS } from './InventorySystem.js';
import { ITEM_PIECE, pickupPiece, placeInFront, useGate } from './Fences.js';
import { harvestCrop, newCropSeed } from './Progression.js';
import { harvestFeedback } from '../ui/HarvestFx.js';
import { axeCharge, plantTree } from './Woodcutting.js';
import { closeDlg, dlgOpen, talk } from '../ui/Dialog.js';
import { toast } from '../ui/Toast.js';
import { nearBed, nearDoor, useDoor } from '../world/HouseInterior.js';
import { INST } from '../world/Instances.js';
import { shroom } from '../world/Mushrooms.js';
import { cutMato, inspectMato } from '../world/Vegetation.js';
import { qAdd, qClose, qIdx, vilTalkNear } from '../world/village/Quests.js';
import { useBezerro, useChicken } from '../world/village/Vendor.js';
import { crops, ground, obj, wet } from '../world/World.js';

/* ============ AÇÕES ============ */
function target() {
  return { x: Math.floor(S.px / TS) + S.fx, y: Math.floor(S.py / TS) + S.fy };
}

/** Índices dos `n` tiles em linha a partir do alvo, na direção em que o jogador olha (para ao sair do mapa). */
function lineTiles(t, n) {
  const dx = S.fx || 0,
    dy = !S.fx && !S.fy ? 1 : S.fy || 0, // sem direção definida: para baixo
    out = [];
  for (let k = 0; k < n; k++) {
    const x = t.x + dx * k,
      y = t.y + dy * k;
    if (x < 0 || y < 0 || x >= MW || y >= MH) break;
    out.push(y * MW + x);
  }
  return out;
}

const actionA = extensible(function actionA() {
  if (playerSnared()) {
    // preso pela sucuri (ou derrubado pela onça): Usar vira "se debater" e afrouxa o aperto
    playerStruggle(PLAYER_PREY.anaconda.struggle);
    beep(150, 0.05, 'square');
    return;
  }
  if (qIdx !== -1) {
    qClose();
    return;
  }
  if (dlgOpen) {
    closeDlg();
    return;
  }
  if (S.inside) {
    if (nearDoor()) useDoor();
    else if (nearBed()) toast('Use o botão Dormir para deitar na cama');
    return;
  }
  const building = !!ITEM_PIECE[ITEMS[S.sel].id] && S.inv[ITEMS[S.sel].id] > 0; // cerca/portão na mão: Usar constrói
  if (!building) {
    let pc = null;
    for (const q of herd) if (Math.hypot(q.x - S.px, q.y - S.py) < 24) pc = q;
    if (pc) {
      pc.pet = 1.5;
      qAdd('pet');
      pc.eat = false;
      aniInit(pc);
      pc.mood = '😍';
      say(pc, '😍💕', 0, 2.4);
      moo(mooKind(pc), 0.9);
      pc.rel[0] = pc.rel[0];
      toast(aniInfo(pc));
      return;
    }
  }
  if (collectEggNear()) return; // ovo no chão tem prioridade sobre os avisos da galinha
  if (!building) {
    if (chxInfoNear()) return;
    if (INST.vilAct && vilTalkNear()) return;
    const n = npcPos();
    if (!npc.inside && Math.hypot(n.x - S.px, n.y - S.py) < 26) {
      talk();
      return;
    }
  }
  const t = target();
  if (t.x < 0 || t.y < 0 || t.x >= MW || t.y >= MH) return;
  const i = t.y * MW + t.x;
  if (obj[i] === BIN) {
    sell();
    return;
  }
  if (shroom[i]) {
    const nS = shroom[i];
    shroom[i] = 0;
    S.inv.cogumelo = (S.inv.cogumelo || 0) + nS;
    qAdd('cogumelo', nS);
    toast('🍄 ' + nS + ' cogumelo' + (nS > 1 ? 's' : '') + ' colhido' + (nS > 1 ? 's' : '') + '!');
    beep(700, 0.08, 'triangle');
    return;
  }
  {
    // cercas: portão abre/fecha com Usar; o machado recolhe peças; cerca/portão na mão coloca à frente
    const held = ITEMS[S.sel].id;
    if (isFenceCode(obj[i]) && held === 'axe') {
      pickupPiece(i);
      return;
    }
    if (isGateCode(obj[i])) {
      useGate(i);
      return;
    }
    if (ITEM_PIECE[held] && S.inv[held] > 0) {
      placeInFront(held);
      return;
    }
  }
  const c = crops[i];
  if (c && c.d >= c.need) {
    delete crops[i]; // sai do mapa ANTES de pagar: o mesmo evento nunca rende duas vezes
    const res = harvestCrop(c); // qualidade, unidades extras e semente de volta (ver config/progression.js)
    qAdd('crop');
    harvestFeedback(res);
    return;
  }
  if (S.energy <= 0) {
    toast('Você está exausto. Vá dormir em casa.');
    return;
  }
  const item = ITEMS[S.sel].id;
  if (item === 'hoe') {
    // só dá para arar grama e caminho; ferramentas melhoradas aram uma linha de tiles à frente
    const fx = toolFx('hoe');
    let did = 0;
    for (const j of lineTiles(t, fx.reach)) {
      if (obj[j] !== 0 || ground[j] === WATER) break; // obstáculo corta a linha
      if (ground[j] === GRASS || ground[j] === PATH) {
        ground[j] = SOIL;
        tilled[j] = 0;
        did++;
      }
    }
    if (did) {
      spend(fx.energy);
      beep(220, 0.05);
    }
  } else if (item === 'can') {
    const fx = toolFx('can');
    let did = 0;
    for (const j of lineTiles(t, fx.reach)) {
      if (obj[j] !== 0) break;
      if (ground[j] === SOIL) {
        wet[j] = 1;
        if (crops[j]) crops[j].w = true;
        did++;
      }
    }
    if (did) {
      spend(fx.energy);
      beep(520, 0.05, 'sine');
    }
  } else if (item === 'scythe') {
    cutMato(t.x, t.y);
  } else if (item === 'axe') {
    axeCharge(i);
  } else if (item === 'bezerro') {
    useBezerro();
  } else if (item === 'galinha') {
    useChicken();
  } else if (item === 'seedT') {
    plantTree(i);
  } else if (item === 'seedC' || item === 'seedP' || item === 'seedM') {
    if (ground[i] === SOIL && !c && S.inv[item] > 0) {
      crops[i] = { k: CROP[item].k, d: 0, need: CROP[item].need, w: false, rs: newCropSeed() };
      S.inv[item]--;
      spend();
      beep(380, 0.05);
      qAdd('plant');
    }
  } else inspectMato(i); // com as mãos (item que não é ferramenta): olha o mato e lê o que a planta é na vida real
});

function actionB() {
  if (dlgOpen) return;
  if (nearBed()) dormir(false);
  else toast('Entre na casa e chegue perto da cama para dormir');
}

export { actionA, actionB, target };
