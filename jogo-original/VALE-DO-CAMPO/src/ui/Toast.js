/**
 * Avisos temporários no centro da tela.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { $ } from './dom.js';

let toastT = 0;

function toast(msg, color) {
  const el = $('toast');
  el.textContent = msg;
  el.style.color = color || '';
  el.style.opacity = 1;
  clearTimeout(toastT);
  toastT = setTimeout(() => (el.style.opacity = 0), 1800);
}

export { toast };
