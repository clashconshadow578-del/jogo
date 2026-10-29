/**
 * Controles de toque: joystick virtual (pointer events com captura) e botões Usar, Dormir, Entrar e Correr.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { S } from '../core/GameState.js';
import { running, setRun } from '../entities/PlayerMovement.js';
import { actionA, actionB } from '../systems/InteractionSystem.js';
import { $, hb, joy, knob } from './dom.js';
import { renderHotbar } from './Hotbar.js';
import { toast } from './Toast.js';
import { useDoor } from '../world/HouseInterior.js';

let joyX = 0,
  joyY = 0,
  joyId = null;

/* ============ ENTRADA ============ */
function setJoy(e) {
  const r = joy.getBoundingClientRect();
  const cx = r.left + r.width / 2,
    cy = r.top + r.height / 2;
  const dx = e.clientX - cx,
    dy = e.clientY - cy;
  const len = Math.hypot(dx, dy);
  const max = r.width / 2 - 30;
  const ux = len ? dx / len : 0,
    uy = len ? dy / len : 0;
  const lim = Math.min(len, max);
  knob.style.transform = `translate(${ux * lim}px,${uy * lim}px)`;
  let m = Math.min(len / max, 1);
  if (m < 0.12) {
    joyX = 0;
    joyY = 0;
  } else {
    m = (m - 0.12) / 0.88;
    joyX = ux * m;
    joyY = uy * m;
  }
}

const endJoy = (e) => {
  if (e.pointerId === joyId) {
    joyId = null;
    joyX = 0;
    joyY = 0;
    knob.style.transform = '';
  }
};

export function initJoystick() {
  joy.addEventListener('pointerdown', (e) => {
    joyId = e.pointerId;
    joy.setPointerCapture(e.pointerId);
    setJoy(e);
  });

  joy.addEventListener('pointermove', (e) => {
    if (e.pointerId === joyId) setJoy(e);
  });

  joy.addEventListener('pointerup', endJoy);

  joy.addEventListener('pointercancel', endJoy);
}

export function initActionButtons() {
  $('btnA').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    actionA();
  });

  $('btnB').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    actionB();
  });

  $('btnH').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    useDoor();
  });

  $('btnR').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (!running && S.energy <= 0) {
      toast('Sem energia para correr');
      return;
    }
    setRun(!running);
  });

  hb.addEventListener('pointerdown', (e) => {
    const s = e.target.closest('.slot');
    if (s) {
      S.sel = +s.dataset.i;
      renderHotbar();
    }
  });
}

export { joyX, joyY };
