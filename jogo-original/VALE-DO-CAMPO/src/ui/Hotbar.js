/**
 * Barra de itens inferior (só redesenha quando o inventário ou a seleção mudam).
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { QUALITIES, toolDisplayName } from '../config/progression.js';
import { S } from '../core/GameState.js';
import { itemIcon, TOOLS, visItems } from '../systems/InventorySystem.js';
import { bestQuality } from '../systems/Progression.js';
import { hb } from './dom.js';

let hbSig = '';

function renderHotbar() {
  const lv = JSON.stringify(S.up && S.up.tool) + JSON.stringify(S.qual); // ícone (nível) e marca de qualidade
  let sig = S.sel + JSON.stringify(S.inv) + lv;
  if (sig === hbSig) return;
  if (!visItems().some(([, i]) => i === S.sel)) {
    S.sel = 0;
    sig = S.sel + JSON.stringify(S.inv) + lv;
  }
  hbSig = sig;
  hb.innerHTML = visItems()
    .map(([it, i], n) => {
      const bq = TOOLS.includes(it.id) ? 0 : bestQuality(it.id),
        qm = bq ? `<i class="qs" style="color:${QUALITIES[bq].color}">${QUALITIES[bq].mark}</i>` : '',
        q = TOOLS.includes(it.id) ? '' : `<b>${S.inv[it.id]}</b>${qm}`;
      return `<div class="slot ${i === S.sel ? 'sel' : ''}" data-i="${i}" title="${toolDisplayName(it.id, it.n).replace(/"/g, '')}"><span class="n">${n + 1}</span><span class="i">${itemIcon(it.id)}</span>${q}</div>`;
    })
    .join('');
}

export { renderHotbar };
