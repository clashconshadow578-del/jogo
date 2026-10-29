/**
 * Lobisomem noturno: só os olhos aparecem no escuro; é repelido pela tocha acesa; ataque derruba o jogador.
 *
 * Origem: Vale_do_Campo_V64.html (s08)
 */

import { MH, MW, TS, WATER } from '../config/constants.js';
import { S, sleeping } from '../core/GameState.js';
import { dormir } from '../core/TimeManager.js';
import { plAct } from './PlayerSprite.js';
import { vitals } from '../systems/Vitals.js';
import { ctx } from '../rendering/Canvas.js';
import { NT, NTD, torchHand, torchLit } from '../rendering/Torch.js';
import { beep, getAC } from '../systems/audio/AudioSystem.js';
import { toast } from '../ui/Toast.js';
import { LIGHT_A } from '../world/Instances.js';
import { ground, obj } from '../world/World.js';

const WF = {
  st: 'off',
  x: 0,
  y: 0,
  face: 1,
  ph: 0,
  t: 0,
  vis: 0,
  cd: 7,
  a: 0,
  dir: 1,
  sgn: 1,
  hurt: 0,
  sp: 0,
  stuck: 0,
};

/* --- lobisomem (só os olhos aparecem no escuro; é rápido) --- */
function wolfEnt(ents) {
  const W = WF;
  if (W.st === 'off' || S.inside) return;
  ents.push({ k: W.y, sh: [W.x, W.y, 16, 15], draw: () => drawWolf(W) });
}

function drawWolf(W) {
  const x = Math.round(W.x),
    y = Math.round(W.y),
    run = W.st !== 'watch';
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(W.face * 1.15, 1.15);
  ctx.imageSmoothingEnabled = false;
  const c1 = '#241d21',
    c2 = '#3a2f35',
    c3 = '#150f13';
  ctx.fillStyle = c3;
  for (const [ox, ph] of [
    [-9, 0],
    [-5, Math.PI],
    [5, Math.PI],
    [9, 0],
  ]) {
    const s = run ? Math.round(Math.sin(W.ph + ph) * 3) : 0;
    ctx.fillRect(ox + s, -6, 3, 6);
  }
  ctx.fillStyle = c1;
  ctx.beginPath();
  ctx.ellipse(-1, -10, 11, 5.5, 0, 0, 6.283);
  ctx.fill();
  ctx.fillStyle = c2;
  ctx.beginPath();
  ctx.ellipse(1, -12.5, 8, 3, 0, 0, 6.283);
  ctx.fill();
  ctx.fillStyle = c1;
  ctx.beginPath();
  ctx.ellipse(8, -12, 5, 5, 0, 0, 6.283);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(13, -15, 4.5, 3.6, 0, 0, 6.283);
  ctx.fill();
  ctx.fillRect(15, -14, 6, 3);
  ctx.fillStyle = c3;
  ctx.beginPath();
  ctx.moveTo(10, -18);
  ctx.lineTo(11.5, -23);
  ctx.lineTo(14, -18);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(13, -18);
  ctx.lineTo(15.5, -22);
  ctx.lineTo(16.5, -17);
  ctx.fill();
  ctx.strokeStyle = c1;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-11, -11);
  ctx.quadraticCurveTo(-17, -12 + Math.sin(W.ph * 0.5) * 2, -19, -7);
  ctx.stroke();
  if (W.st === 'charge') {
    ctx.fillStyle = '#e8e2d4';
    ctx.fillRect(17, -11, 1, 2);
    ctx.fillRect(19, -11, 1, 2);
  }
  ctx.restore();
}

function wolfFree(x, y) {
  const tx = Math.floor(x / TS),
    ty = Math.floor(y / TS);
  if (tx < 1 || ty < 1 || tx >= MW - 1 || ty >= MH - 1) return false;
  const i = ty * MW + tx;
  return obj[i] === 0 && ground[i] !== WATER;
}

function wolfRepelled(x, y) {
  // o lobisomem tem medo do fogo: tocha acesa e lampiões da casa
  if (torchLit()) {
    const h = torchHand();
    if (Math.hypot(x - h[0], y - (S.py - 8)) < NT.R * 0.86) return true;
  }
  for (const L of LIGHT_A) if (Math.hypot(x - L[0], y - L[1]) < L[2] * 0.9) return true;
  return false;
}

function wolfMove(tx, ty, sp, dt) {
  const W = WF,
    dx = tx - W.x,
    dy = ty - W.y,
    d = Math.hypot(dx, dy);
  if (d < 1) return;
  const base = Math.atan2(dy, dx),
    step = Math.min(sp * dt, d + 10),
    s = W.sgn;
  for (const o of [0, 0.55, -0.55, 1.1, -1.1, 1.7, -1.7]) {
    const a = base + o * s,
      cx = Math.cos(a),
      cy = Math.sin(a);
    if (wolfFree(W.x + cx * (step + 5), W.y + cy * (step + 5)) && wolfFree(W.x + cx * step, W.y + cy * step)) {
      W.x += cx * step;
      W.y += cy * step;
      if (Math.abs(cx) > 0.25) W.face = cx > 0 ? 1 : -1;
      W.ph += sp * dt * 0.22;
      W.stuck = 0;
      return;
    }
  }
  W.stuck += dt;
  W.sgn = -W.sgn;
}

function howl() {
  try {
    const a = getAC();
    if (!a) return;
    const t = a.currentTime,
      o = a.createOscillator(),
      g = a.createGain(),
      f = a.createBiquadFilter();
    o.type = 'sawtooth';
    f.type = 'lowpass';
    f.frequency.value = 700;
    o.frequency.setValueAtTime(190, t);
    o.frequency.exponentialRampToValueAtTime(420, t + 0.7);
    o.frequency.exponentialRampToValueAtTime(260, t + 1.7);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
    o.connect(f);
    f.connect(g);
    g.connect(a.destination);
    o.start(t);
    o.stop(t + 1.9);
  } catch (e) {}
}

function wolfSpawn() {
  for (let k = 0; k < 14; k++) {
    const dx = (Math.random() * 2 - 1) * 215,
      dy = (Math.random() * 2 - 1) * 118;
    if (Math.hypot(dx, dy) < 165) continue; // nasce fora do alcance da tocha
    const x = S.px + dx,
      y = S.py + dy;
    if (!wolfFree(x, y) || wolfRepelled(x, y)) continue;
    Object.assign(WF, {
      x,
      y,
      st: 'watch',
      t: 1.7 + Math.random() * 1.4,
      vis: 0,
      face: dx < 0 ? 1 : -1,
      stuck: 0,
      a: Math.atan2(dy, dx),
      dir: Math.random() < 0.5 ? 1 : -1,
      sgn: Math.random() < 0.5 ? 1 : -1,
      sp: 0,
      ft: 3 + Math.random() * 3,
    });
    howl();
    if (!NT.warned) {
      NT.warned = true;
      toast('👀 Olhos na escuridão... mantenha a tocha na mão!');
    }
    return true;
  }
  return false;
}

function wolfBite() {
  const W = WF;
  S.vida = Math.max(0, S.vida - 32);
  vitals.quiet = 0;
  W.hurt = 0.8;
  W.st = 'retreat';
  W.t = 1.3 + Math.random() * 0.8;
  W.sp = 0;
  try {
    plAct(S.vida <= 0 ? 'Death' : 'Hit');
  } catch (e) {}
  beep(90, 0.18, 'sawtooth');
  toast('🐺 Mordido! Pegue a tocha!');
  if (S.vida <= 0) {
    window.NT_WOLF = 1;
    setTimeout(() => dormir(true), 1100);
  }
}

function wolfTick(dt) {
  const W = WF,
    h = 6 + S.min / 60,
    nd = NTD(h),
    active = nd > 0.55 && !S.inside && !sleeping;
  W.hurt = Math.max(0, W.hurt - dt);
  if (W.st === 'off') {
    if (active) {
      W.cd -= dt;
      if (W.cd <= 0 && !wolfSpawn()) W.cd = 2;
    }
    return;
  }
  if (!active) {
    W.vis = Math.max(0, W.vis - dt * 1.5);
    if (W.vis <= 0) {
      W.st = 'off';
      W.cd = 8 + Math.random() * 10;
    }
    return;
  }
  W.vis = Math.min(1, W.vis + dt * (W.st === 'watch' ? 1.4 : 3));
  const px = S.px,
    py = S.py - 4,
    dx = W.x - px,
    dy = W.y - py,
    d = Math.hypot(dx, dy) || 1,
    lit = torchLit(),
    ux = dx / d,
    uy = dy / d;
  if ((W.st === 'charge' || W.st === 'stalk' || W.st === 'watch') && wolfRepelled(W.x, W.y)) {
    W.st = 'recoil';
    W.t = 0.8;
    W.sp = 0;
  } // recua do fogo
  switch (W.st) {
    case 'watch':
      W.face = dx < 0 ? 1 : -1;
      W.t -= dt;
      if (W.t <= 0) {
        if (lit) {
          W.st = 'stalk';
          W.t = 9 + Math.random() * 7;
          W.ft = 2.5 + Math.random() * 3;
        } else {
          W.st = 'charge';
          W.t = 7;
        }
        W.sp = 0;
      }
      break;
    case 'charge':
      W.sp = Math.min(215, W.sp + dt * 900);
      wolfMove(px, py, W.sp, dt); // muito rápido (jogador: 60–78 px/s)
      if (d < 13) {
        if (lit) {
          W.st = 'recoil';
          W.t = 1;
        } else wolfBite();
      }
      W.t -= dt;
      if (W.t <= 0) {
        W.st = 'leave';
        W.t = 4;
      }
      break;
    case 'stalk': {
      // com a tocha acesa: rodeia no limite da luz e faz investidas
      if (!lit) {
        W.st = 'charge';
        W.t = 7;
        W.sp = 0;
        break;
      }
      const Rc = NT.R * 1.12,
        a = Math.atan2(dy, dx) + W.dir * 0.5;
      wolfMove(px + Math.cos(a) * Rc, py + Math.sin(a) * Rc, 150, dt);
      W.ft -= dt;
      if (W.ft <= 0) {
        W.st = 'charge';
        W.t = 4;
        W.sp = 0;
      }
      W.t -= dt;
      if (W.t <= 0) {
        W.st = 'leave';
        W.t = 4;
      }
      break;
    }
    case 'recoil':
      wolfMove(W.x + ux * 60, W.y + uy * 60, 220, dt);
      W.t -= dt;
      if (W.t <= 0) {
        if (lit) {
          W.st = 'stalk';
          W.t = 7 + Math.random() * 6;
          W.ft = 2.5 + Math.random() * 3;
        } else {
          W.st = 'watch';
          W.t = 1 + Math.random();
        }
      }
      break;
    case 'retreat':
      wolfMove(W.x + ux * 80, W.y + uy * 80, 210, dt);
      W.t -= dt;
      if (W.t <= 0) {
        W.st = 'watch';
        W.t = 1.2 + Math.random() * 1.2;
      }
      break;
    case 'leave':
      wolfMove(W.x + ux * 80, W.y + uy * 80, 230, dt);
      W.t -= dt;
      if (d > 270 || W.t < -3) {
        W.st = 'off';
        W.cd = 20 + Math.random() * 25;
      }
      break;
  }
  if (W.stuck > 2.5) {
    W.st = 'off';
    W.cd = 6;
    W.stuck = 0;
  }
}

export { WF, wolfEnt, wolfTick };
