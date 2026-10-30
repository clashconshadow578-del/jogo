/**
 * Janela de fabricação (botão 🔨 ou tecla C): lista as receitas, mostra o que cada uma gasta, o que você tem
 * e explica o que falta. A fabricação em si é de systems/Crafting.js.
 *
 * Origem: novo (sistema de cercas)
 */

import { MATERIAL_NAMES, RECIPES } from '../config/crafting.js';
import { S } from '../core/GameState.js';
import { beep } from '../systems/audio/AudioSystem.js';
import { craft } from '../systems/Crafting.js';
import { itemIcon } from '../systems/InventorySystem.js';
import { toast } from './Toast.js';

let panel = null,
  btn = null;

const isOpen = () => !!panel && panel.style.display === 'block';

function render() {
  if (!panel) return;
  let h =
    '<div style="display:flex;justify-content:space-between;align-items:center"><b>🔨 Fabricação</b>' +
    '<button id="craftX" style="background:#555;color:#fff;border:0;border-radius:6px;padding:4px 10px">Fechar</button></div>';
  for (const r of RECIPES) {
    const lack = [];
    const cost = Object.entries(r.cost)
      .map(([k, n]) => {
        const have = S.inv[k] | 0,
          ok = have >= n;
        if (!ok) lack.push(`${n - have} ${MATERIAL_NAMES[k] || k}`);
        return `<span style="color:${ok ? '#9be89b' : '#ff8d8d'}">${n} ${MATERIAL_NAMES[k] || k} (${have})</span>`;
      })
      .join(' · ');
    h +=
      `<div style="margin-top:10px;padding:8px;border:1px solid rgba(217,164,65,.35);border-radius:8px;display:flex;gap:10px;align-items:center">` +
      `<div style="width:36px;flex:none">${itemIcon(r.id)}</div>` +
      `<div style="flex:1;font-size:13px"><b>${r.name}</b> <span style="opacity:.7">(você tem ${S.inv[r.id] | 0})</span><br>${cost}` +
      (lack.length ? `<br><span style="opacity:.8">Faltam ${lack.join(' e ')}</span>` : '') +
      `</div><button data-craft="${r.id}" style="padding:8px 12px;border:0;border-radius:6px;color:#fff;background:${lack.length ? '#555' : '#2e7d32'}">Fabricar</button></div>`;
  }
  h +=
    '<div style="margin-top:8px;font-size:12px;opacity:.75">Com a peça na mão, use o botão Usar para colocá-la à frente. O machado recolhe cercas e portões.</div>';
  panel.innerHTML = h;
}

export function toggleCrafting(v) {
  if (!panel) return;
  const on = v === undefined ? !isOpen() : v;
  panel.style.display = on ? 'block' : 'none';
  if (on) render();
}

export function initCraftingUI() {
  panel = document.createElement('div');
  panel.id = 'craft';
  panel.style.cssText =
    'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(420px,92%);background:rgba(30,18,6,.96);border:2px solid #d9a441;border-radius:10px;padding:12px 14px;max-height:78vh;overflow-y:auto;display:none;font-size:15px;color:#fff;z-index:25;line-height:1.35;user-select:none';
  document.body.appendChild(panel);

  btn = document.createElement('button');
  btn.id = 'craftBtn';
  btn.setAttribute('aria-label', 'Fabricação');
  btn.textContent = '🔨';
  document.body.appendChild(btn);
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    toggleCrafting();
  });

  panel.addEventListener('click', (e) => {
    const t = e.target;
    if (t.id === 'craftX') return toggleCrafting(false);
    const id = t.dataset && t.dataset.craft;
    if (!id) return;
    const r = craft(id);
    if (r.ok) {
      toast('🔨 Fabricado: ' + RECIPES.find((x) => x.id === id).name);
      beep(520, 0.08, 'triangle');
    } else toast(r.reason);
    render();
  });

  addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (k === 'c') toggleCrafting();
    else if (k === 'escape' && isOpen()) toggleCrafting(false);
  });
  setInterval(() => {
    if (!document.hidden && isOpen()) render();
  }, 500);
}
