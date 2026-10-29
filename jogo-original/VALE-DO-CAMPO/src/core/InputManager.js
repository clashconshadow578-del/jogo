/**
 * Teclado: teclas pressionadas (WASD/setas, Shift), ação (Espaço/E), dormir (X), atalhos 1-9 da hotbar.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { S } from './GameState.js';
import { actionA, actionB } from '../systems/InteractionSystem.js';
import { visItems } from '../systems/InventorySystem.js';
import { renderHotbar } from '../ui/Hotbar.js';

const keys = {};

export function initKeyboard() {
  addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    keys[k] = true;
    if ((k === ' ' || k === 'e') && !e.repeat) {
      e.preventDefault();
      actionA();
    }
    if (k === 'x' && !e.repeat) actionB();
    if (/^[1-9]$/.test(k)) {
      const v = visItems()[+k - 1];
      if (v) {
        S.sel = v[1];
        renderHotbar();
      }
    }
    if (k.startsWith('arrow')) e.preventDefault();
  });

  addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
  });

  document.addEventListener('contextmenu', (e) => e.preventDefault());
}

export { keys };
