/**
 * Machado com carga (a força cresce enquanto se espera entre golpes), resistência das árvores, plantio de mudas e barra de força.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { GRASS, TREE } from '../config/constants.js';
import { TOOL_TIER_NAMES, toolFx, toolLevel } from '../config/progression.js';
import { extensible } from '../core/extensions.js';
import { S } from '../core/GameState.js';
import { spend } from '../entities/Player.js';
import { amzHPmax } from '../features/amazon/AmazonRender.js';
import { beep } from './audio/AudioSystem.js';
import { ITEMS } from './InventorySystem.js';
import { dlgOpen } from '../ui/Dialog.js';
import { toast } from '../ui/Toast.js';
import { fvChopWarn, fvPlantHint } from '../world/hydrology/Fluvial.js';
import { sapl, seedAge } from '../world/hydrology/Hydrology.js';
import { qAdd, qIdx } from '../world/village/Quests.js';
import { crops, ground, obj } from '../world/World.js';

const chop = {}; // machado: 6 golpes por árvore (reinicia se parar por 9s)

/* ===== Machado com carga: a força cresce enquanto você ESPERA entre um golpe e outro ===== */
const TREE_HP = 1000,
  AXE_BASE = 10,
  AXE_MAX = 16,
  AXE_CHARGE_MS = 1500; // carga cheia após 1,5 s sem bater

const chopHP = new Map(); // durabilidade restante de cada árvore (1000 no início)

let axeLast = -1e9; // momento do último golpe

function axeFrac() {
  return Math.min(1, (performance.now() - axeLast) / AXE_CHARGE_MS);
}

function axeBar() {
  let el = document.getElementById('axeBar');
  if (!el) {
    el = document.createElement('div');
    el.id = 'axeBar';
    el.style.cssText =
      'position:fixed;left:50%;bottom:172px;transform:translateX(-50%);width:170px;height:16px;background:rgba(0,0,0,.55);border:2px solid #ffd166;border-radius:8px;overflow:hidden;display:none;pointer-events:none;z-index:25';
    el.innerHTML =
      '<div id="axeFill" style="height:100%;width:0;background:linear-gradient(90deg,#ffd166,#ff7b29)"></div><div id="axeTxt" style="position:absolute;inset:0;text-align:center;font:bold 11px system-ui;line-height:16px;text-shadow:0 1px 2px #000"></div>';
    document.body.appendChild(el);
  }
  let holding = false;
  try {
    holding = ITEMS[S.sel].id === 'axe' && !S.inside;
  } catch (e) {}
  el.style.display = holding && !dlgOpen && qIdx === -1 ? 'block' : 'none';
  if (el.style.display === 'block') {
    const f = axeFrac();
    document.getElementById('axeFill').style.width = f * 100 + '%';
    document.getElementById('axeTxt').textContent = '🪓 x' + (1 + (AXE_MAX - 1) * f).toFixed(1);
  }
}

function axeCharge(i) {
  // um toque = um golpe, com a força da carga acumulada
  if (obj[i] !== TREE) {
    toast('Não há árvore aqui');
    return;
  }
  const f = axeFrac(),
    mult = 1 + (AXE_MAX - 1) * f,
    fx = toolFx('axe');
  axeLast = performance.now();
  chopHit(i, Math.round(AXE_BASE * mult * fx.dmg), mult); // machado melhorado: mais dano por golpe
  if (obj[i] !== TREE && fx.wood > 0) {
    // a árvore caiu neste golpe (as camadas amazônicas também zeram obj[i]): madeira extra do nível
    S.inv.madeira = (S.inv.madeira || 0) + fx.wood;
    qAdd('madeira', fx.wood);
    toast('🪓 Machado ' + TOOL_TIER_NAMES[toolLevel('axe')] + ': +' + fx.wood + ' madeira extra');
  }
}

const chopHit = extensible(function chopHit(i, dmg, mult) {
  if (obj[i] !== TREE) {
    toast('Não há árvore aqui');
    return;
  }
  const hp = (chopHP.has(i) ? chopHP.get(i) : amzHPmax ? amzHPmax(i) : TREE_HP) - dmg;
  spend(toolFx('axe').energy);
  beep(120 + mult * 10, 0.07, 'sawtooth');
  const c = chop[i] || (chop[i] = { n: 0, t: 0 });
  c.n++;
  c.t = performance.now();
  if (hp > 0) {
    chopHP.set(i, hp);
    toast(
      '🪓 x' +
        mult.toFixed(1) +
        ' · árvore ' +
        Math.max(0, Math.round((hp / (amzHPmax ? amzHPmax(i) : TREE_HP)) * 100)) +
        '%',
    );
    return;
  }
  chopHP.delete(i);
  delete chop[i];
  obj[i] = 0;
  fvChopWarn(i);
  const w = 1 + Math.floor(Math.random() * 3),
    sd = 1 + Math.floor(Math.random() * 2);
  S.inv.madeira = (S.inv.madeira || 0) + w;
  qAdd('madeira', w);
  S.inv.seedT = (S.inv.seedT || 0) + sd;
  beep(90, 0.25, 'square');
  toast('🌳 Árvore derrubada! +' + w + ' madeira, +' + sd + ' semente' + (sd > 1 ? 's' : ''));
});

function treeShake(i) {
  const c = chop[i];
  if (!c) return 0;
  const a = performance.now() - c.t;
  return a < 280 ? Math.sin(a * 0.05) * 1.6 * (1 - a / 280) : 0;
}

function plantTree(i) {
  if (!(S.inv.seedT > 0)) return;
  if (ground[i] !== GRASS || obj[i] || crops[i] || sapl[i]) {
    toast('Plante em grama livre');
    return;
  }
  sapl[i] = 0.01;
  seedAge[i] = 0;
  S.inv.seedT--;
  spend();
  beep(380, 0.05);
  toast('🌱 Muda plantada');
  fvPlantHint(i);
}

export function initAxeBar() {
  setInterval(() => {
    if (!document.hidden) axeBar();
  }, 50);
}

/** Atualiza `axeLast` a partir de outros módulos (as ligações importadas são somente leitura). */
export function setAxeLast(value) {
  axeLast = value;
  return value;
}

export { AXE_MAX, TREE_HP, axeCharge, axeFrac, axeLast, chop, chopHP, chopHit, plantTree, treeShake };
