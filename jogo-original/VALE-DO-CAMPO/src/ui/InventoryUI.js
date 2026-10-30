/**
 * Janela de inventário (tecla I ou botão da mochila): grade de itens, descrição e moedas.
 *
 * Origem: Vale_do_Campo_V64.html (s10)
 */
/* Sistema de inventário */

import { PRICE } from '../config/balance.js';
import { QUALITIES, toolDisplayName } from '../config/progression.js';
import { S } from '../core/GameState.js';
import { itemIcon, ITEMS, TOOLS } from '../systems/InventorySystem.js';
import { bestQuality, qualCounts } from '../systems/Progression.js';
import { renderHotbar } from './Hotbar.js';

export function initInventoryUI() {
  const box = document.getElementById('inv'),
    G = document.getElementById('invG'),
    I = document.getElementById('invI'),
    C = document.getElementById('invC');

  let cur = null,
    sig = '';

  const open = () => box.classList.contains('on');

  /* marca da melhor qualidade no canto da célula */
  function qMark(id) {
    const b = bestQuality(id);
    return b ? `<i class="qs" style="color:${QUALITIES[b].color}">${QUALITIES[b].mark}</i>` : '';
  }

  /* quantas unidades de cada qualidade (só aparece se há alguma acima da comum) */
  function qLines(id) {
    const c = qualCounts(id);
    if (!(c[1] || c[2] || c[3])) return '';
    return (
      c
        .map((n, q) =>
          n
            ? `<span class="qline" style="color:${QUALITIES[q].color}">${QUALITIES[q].mark} ${QUALITIES[q].name}: ${n}</span>`
            : '',
        )
        .join('') + ''
    );
  }

  function rows() {
    return ITEMS.map((it, i) => ({ it, i, tool: TOOLS.includes(it.id), q: S.inv[it.id] || 0 })).filter(
      (r) => r.tool || r.q > 0,
    );
  }

  function render() {
    const R = rows(),
      s =
        S.sel +
        '|' +
        cur +
        '|' +
        S.coins +
        '|' +
        JSON.stringify(S.up && S.up.tool) +
        JSON.stringify(S.qual) +
        '|' +
        R.map((r) => r.it.id + r.q).join();
    if (s === sig) return;
    sig = s;
    if (cur == null || !R.some((r) => r.it.id === cur)) cur = (ITEMS[S.sel] || {}).id;
    let h = R.map(
      (r) =>
        `<div class="c ${r.it.id === cur ? 'sel' : ''}" data-id="${r.it.id}" data-i="${r.i}">${itemIcon(r.it.id)}${r.tool ? '' : `<b>${r.q}</b>${qMark(r.it.id)}`}</div>`,
    ).join('');
    for (let k = R.length; k < Math.max(16, Math.ceil(R.length / 4) * 4); k++) h += '<div class="c"></div>';
    const top = G.scrollTop;
    G.innerHTML = h;
    G.scrollTop = top;
    const r = R.find((x) => x.it.id === cur);
    I.innerHTML = r
      ? `<u>${toolDisplayName(r.it.id, r.it.n)}</u>${r.tool ? 'Ferramenta' : 'Qtd: ' + r.q}${PRICE[r.it.id] ? ' · ' + PRICE[r.it.id] + '$' : ''}<br>${qLines(r.it.id)}${r.i === S.sel ? 'Equipado' : 'Toque de novo: equipar'}`
      : '';
    C.innerHTML = `<i></i>${S.coins} moedas`;
  }

  function toggle(v) {
    box.classList.toggle('on', v);
    if (open()) {
      sig = '';
      cur = (ITEMS[S.sel] || {}).id;
      render();
    }
  }

  G.addEventListener('pointerdown', (e) => {
    const c = e.target.closest('.c');
    if (!c || !c.dataset.id) return;
    if (cur === c.dataset.id) {
      S.sel = +c.dataset.i;
      try {
        renderHotbar();
      } catch (_) {}
    }
    cur = c.dataset.id;
    sig = '';
    render();
  });

  document.getElementById('invX').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    toggle(false);
  });

  document.getElementById('invBtn').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    toggle();
  });

  addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'i' && !e.repeat) toggle();
    else if (k === 'escape' && open()) toggle(false);
  });

  setInterval(() => {
    if (!document.hidden && open()) render();
  }, 250);
}
