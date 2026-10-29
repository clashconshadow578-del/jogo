/**
 * Ovos: cada galinha adulta põe um ovo a cada 24 horas de jogo (um dia). O ovo é um objeto do mundo que o
 * jogador pode pegar; se ficar no chão por 3 dias de jogo, eclode num pintinho (uma única vez).
 *
 * Tempo: tudo usa o relógio do jogo (`worldMin()`, minutos absolutos do mundo), nunca o do computador. Por isso
 * dormir, sair da fazenda e voltar, salvar e recarregar não mudam os prazos. Os números estão em config/eggs.js.
 *
 * Este módulo substitui o antigo sistema de ninhos (ovos contados dentro do ninho): `restoreEggs` converte os
 * ovos de ninhos de saves antigos em ovos do mundo.
 *
 * Origem: novo (ovos e eclosão)
 */

import { MH, MW, TS } from '../../config/constants.js';
import { dueToHatch, EGG_CFG, firstLayAt, hatchAt, planLays } from '../../config/eggs.js';
import { extensible } from '../../core/extensions.js';
import { S, sleeping } from '../../core/GameState.js';
import { worldMin } from '../../core/TimeManager.js';
import { ctx } from '../../rendering/Canvas.js';
import { beep } from '../../systems/audio/AudioSystem.js';
import { solid } from '../../systems/CollisionSystem.js';
import { toast } from '../../ui/Toast.js';
import { INST } from '../../world/Instances.js';
import { chx, CHX_ADULT, chxCross, chxGenesFounder, chxWalkOK, mkChx } from './Chickens.js';

let eggs = [],
  eggId = 1;

/** Ovos do mundo (somente leitura para quem importa). */
export const getEggs = () => eggs;

export function resetEggs() {
  eggs = [];
  eggId = 1;
}

/* ============ POSTURA ============ */
function layPass(now) {
  for (const h of chx) {
    if (h.sex !== 'f' || h.age < CHX_ADULT || h.holder) continue;
    if (h.layNext == null) {
      h.layNext = firstLayAt(now, h.id); // acabou de ficar adulta (ou veio de um save antigo)
      continue;
    }
    if (now < h.layNext) continue;
    const { times, next } = planLays(now, h.layNext);
    let placed = 0;
    for (const t of times) {
      if (eggs.length >= EGG_CFG.maxEggsInWorld || !chxWalkOK(h.x, h.y)) break; // tenta de novo no próximo quadro
      const jx = ((eggId % 3) - 1) * 2,
        x = chxWalkOK(h.x + jx, h.y) ? h.x + jx : h.x;
      eggs.push({ id: eggId++, x, y: h.y, layT: t, hatchAt: hatchAt(t), hen: h.id });
      h.lastEgg = t;
      placed++;
    }
    h.layNext = placed === times.length ? next : times[placed];
  }
}

/* ============ ECLOSÃO ============ */
/**
 * Lugar válido para o pintinho nascer: o próprio ponto do ovo se o tile for livre. Se o tile do ovo ficou
 * sólido (não deveria: construir sobre ovo é recusado), usa um tile livre vizinho; nunca procura além de um
 * tile sólido, então o pintinho jamais nasce do outro lado de uma cerca. Sem lugar: null (o ovo espera).
 */
export function findHatchSpot(egg) {
  const sx = Math.floor(egg.x / TS),
    sy = Math.floor(egg.y / TS);
  if (!solid(sx, sy)) return chxWalkOK(egg.x, egg.y) ? { x: egg.x, y: egg.y } : { x: sx * TS + 8, y: sy * TS + 8 };
  for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) {
    const nx = sx + dx,
      ny = sy + dy;
    if (nx >= 0 && ny >= 0 && nx < MW && ny < MH && !solid(nx, ny)) return { x: nx * TS + 8, y: ny * TS + 8 };
  }
  return null;
}

function hatchPass(now) {
  for (const egg of eggs.slice()) {
    if (!dueToHatch(now, egg)) continue;
    if (chx.length >= EGG_CFG.maxChickens) continue; // galinheiro cheio: o ovo espera
    const spot = findHatchSpot(egg);
    if (!spot) continue; // sem lugar válido agora: tenta de novo depois
    eggs.splice(eggs.indexOf(egg), 1); // o ovo sai ANTES de nascer o pintinho: nunca eclode duas vezes
    const hen = chx.find((c) => c.id === egg.hen),
      roos = chx.filter((c) => c.sex === 'm' && c.age >= CHX_ADULT),
      roo = roos.length ? roos[(Math.random() * roos.length) | 0] : null,
      g = hen && roo ? chxCross(roo.g, hen.g) : chxGenesFounder();
    chx.push(mkChx({ x: spot.x, y: spot.y, sex: Math.random() < 0.5 ? 'm' : 'f', age: 0, mom: egg.hen, g }));
    if (INST.homeAct) toast('🐣 Um ovo eclodiu!');
  }
}

/** Atualização por quadro (e uma vez ao voltar para a fazenda): põe e choca o que já está na hora. */
export const updateEggs = extensible(function updateEggs() {
  if (sleeping || !INST.homeAct) return;
  const now = worldMin();
  layPass(now);
  hatchPass(now);
});

/* ============ COLETA ============ */
/** Ovo mais próximo de (x,y) dentro do alcance, ou null. */
export function eggNear(x, y, r = EGG_CFG.collectRadiusPx) {
  let best = null,
    bd = r;
  for (const e of eggs) {
    const d = Math.hypot(e.x - x, e.y - y);
    if (d <= bd) {
      bd = d;
      best = e;
    }
  }
  return best;
}

/** Há um ovo neste tile? (impede construir por cima) */
export const eggOnTile = (tx, ty) => eggs.some((e) => Math.floor(e.x / TS) === tx && Math.floor(e.y / TS) === ty);

/** Coleta o ovo mais próximo do jogador. Remove do mundo e soma ao inventário numa só operação. */
export function collectEggNear() {
  if (!INST.homeAct || S.inside) return false;
  const e = eggNear(S.px, S.py);
  if (!e) return false;
  eggs.splice(eggs.indexOf(e), 1);
  S.inv.ovo = (S.inv.ovo | 0) + 1;
  toast('🥚 +1 ovo');
  beep(740, 0.07, 'triangle');
  return true;
}

/* ============ SALVAMENTO ============ */
export const eggSave = () => eggs.map((e) => ({ id: e.id, x: e.x, y: e.y, layT: e.layT, hatchAt: e.hatchAt, hen: e.hen }));

/**
 * Restaura os ovos. Saves antigos não têm `arr`: os ovos que estavam contados dentro de ninhos viram ovos do
 * mundo, chocando a partir de agora (`ninhosAntigos` = lista de ninhos do save).
 */
export function restoreEggs(arr, ninhosAntigos) {
  eggs = [];
  if (Array.isArray(arr)) {
    eggs = arr.map((o) => ({ id: o.id, x: o.x, y: o.y, layT: o.layT, hatchAt: o.hatchAt, hen: o.hen }));
  } else if (Array.isArray(ninhosAntigos)) {
    const now = worldMin();
    for (const n of ninhosAntigos)
      for (let k = 0; k < (n.eggs | 0); k++)
        eggs.push({ id: 0, x: n.x + (k % 3) * 3 - 3, y: n.y, layT: now, hatchAt: hatchAt(now), hen: n.hen });
    for (const c of chx) {
      c.broody = false;
      c.nestId = undefined;
    }
  }
  let top = 0;
  for (const e of eggs) top = Math.max(top, e.id | 0);
  for (const e of eggs) if (!e.id) e.id = ++top; // ovos migrados não têm id
  eggId = top + 1;
}

/* ============ DESENHO ============ */
function drawEgg(e, now) {
  const x = Math.round(e.x),
    y = Math.round(e.y),
    prog = (now - e.layT) / EGG_CFG.incubationMin;
  ctx.fillStyle = 'rgba(0,0,0,.2)';
  ctx.fillRect(x - 2, y, 5, 1);
  ctx.fillStyle = '#a8946a'; // contorno
  ctx.fillRect(x - 1, y - 7, 3, 1);
  ctx.fillRect(x - 3, y - 6, 1, 5);
  ctx.fillRect(x + 3, y - 6, 1, 5);
  ctx.fillRect(x - 2, y - 7, 1, 1);
  ctx.fillRect(x + 2, y - 7, 1, 1);
  ctx.fillRect(x - 2, y - 1, 5, 1);
  ctx.fillStyle = '#f4ecd6';
  ctx.fillRect(x - 2, y - 6, 5, 5);
  ctx.fillRect(x - 1, y - 7 + 1, 3, 1);
  ctx.fillStyle = '#dccfae'; // lado na sombra
  ctx.fillRect(x + 2, y - 5, 1, 4);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x - 1, y - 5, 1, 2);
  if (prog > 0.85) {
    ctx.fillStyle = '#8a7a55'; // trinca: está quase eclodindo
    ctx.fillRect(x, y - 4, 1, 1);
    ctx.fillRect(x + 1, y - 3, 1, 1);
    ctx.fillRect(x - 1, y - 2, 1, 1);
  }
}

/** Fornecedor de entidades do Renderer. */
export function eggEntities(ents, camX, camY) {
  if (!INST.homeAct || S.inside || !eggs.length) return;
  const now = worldMin();
  for (const e of eggs) {
    if (e.x < camX - 8 || e.x > camX + 488 || e.y < camY - 8 || e.y > camY + 280) continue;
    ents.push({ k: e.y, sh: [e.x, e.y, 3, 3, 'egg'], draw: () => drawEgg(e, now) });
  }
}
