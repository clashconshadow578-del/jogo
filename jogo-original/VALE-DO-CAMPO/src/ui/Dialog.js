/**
 * Caixa de diálogo das falas da aldeã.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { NPC_LINES } from '../entities/NPC.js';
import { dlg } from './dom.js';

let dlgOpen = false;

function talk() {
  const lines = NPC_LINES;
  dlg.textContent = lines[Math.floor(Math.random() * lines.length)];
  dlg.style.display = 'block';
  dlgOpen = true;
}

function closeDlg() {
  dlg.style.display = 'none';
  dlgOpen = false;
}

export { closeDlg, dlgOpen, talk };
