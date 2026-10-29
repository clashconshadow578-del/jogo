/**
 * Seta na borda da tela apontando para a casa quando ela está longe (inclusive em outra região).
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { HOMEC, MH, MW, TS } from '../config/constants.js';
import { S, sleeping } from '../core/GameState.js';
import { $ } from './dom.js';
import { DOOR } from '../world/HouseInterior.js';
import { INST } from '../world/Instances.js';

const homeEl = $('home'),
  homeArrow = $('homeArrow'),
  homeTxt = $('homeTxt');
let homeShown = false,
  homeLbl = '';

function updHome() {
  // seta apontando para a casa quando ela está longe
  const hx = DOOR.x * TS + 8 + (HOMEC.x - INST.cx) * MW * TS - S.px,
    hy = DOOR.y * TS + 8 + (HOMEC.y - INST.cy) * MH * TS - S.py,
    d = Math.hypot(hx, hy),
    show = !S.inside && !sleeping && d > 20 * TS;
  if (show !== homeShown) {
    homeShown = show;
    homeEl.style.opacity = show ? 1 : 0;
  }
  if (!show) return;
  const ux = hx / d,
    uy = hy / d,
    rx = Math.max(60, innerWidth / 2 - 64),
    ry = Math.max(60, innerHeight / 2 - 132),
    t = 1 / Math.sqrt((ux / rx) ** 2 + (uy / ry) ** 2);
  homeEl.style.transform = `translate(${(ux * t).toFixed(1)}px,${(uy * t).toFixed(1)}px)`;
  homeArrow.style.transform = `rotate(${(Math.atan2(hy, hx) * 57.2958 + 90).toFixed(0)}deg)`;
  const lb = '🏠 ' + Math.round(d / TS) + ' m';
  if (lb !== homeLbl) {
    homeLbl = lb;
    homeTxt.textContent = lb;
  }
}

export { updHome };
