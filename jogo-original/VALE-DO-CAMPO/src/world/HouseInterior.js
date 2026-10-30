/**
 * Interior da casa: porta, móveis com colisão, cama, iluminação noturna e entrada/saída com transição.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { SPEED } from '../config/balance.js';
import { OX, OY, TS, VH, VW } from '../config/constants.js';
import { S, sleeping } from '../core/GameState.js';
import { keys } from '../core/InputManager.js';
import { nightF } from '../core/TimeManager.js';
import { drawPlayer } from '../entities/Player.js';
import { ctx } from '../rendering/Canvas.js';
import { SPR } from '../rendering/Sprites.js';
import { dlgOpen } from '../ui/Dialog.js';
import { $, fadeEl } from '../ui/dom.js';
import { joyX, joyY } from '../ui/MobileControls.js';

const DOOR = { x: 15 + OX, y: 11 + OY };

// ---- interior ----
const ip = { x: 128, y: 52 };
let doorBusy = false;

const ROOM_W = 256,
  ROOM_H = 176;

// [sprite, x, y(base), colisão(altura da base que bloqueia, 0=nenhuma)]
const FURN = [
  ['bed', 14, 52, 39],
  ['shelf', 58, 44, 16],
  ['shelf2', 150, 50, 16],
  ['bookshelf', 212, 44, 14],
  ['barrel', 16, 164, 12],
  ['crate', 34, 164, 12],
  ['plant', 226, 164, 8],
  ['table', 176, 134, 22],
];

function furnBox(f) {
  const m = SPR[f[0]];
  return m && m.ready ? [f[1], f[2] - f[3], f[1] + m.w, f[2]] : null;
}

function inBlocked(x, y) {
  if (x < 16 || x > 240 || y < 46 || y > 164) return true;
  for (const f of FURN) {
    const b = furnBox(f);
    if (b && x + 4 > b[0] && x - 4 < b[2] && y + 2 > b[1] && y - 2 < b[3]) return true;
  }
  return false;
}

function nearBed() {
  const m = SPR.bed;
  return S.inside && m && m.ready && Math.hypot(ip.x - (14 + m.w / 2), ip.y - 52) < 30;
}

function nearDoor() {
  return S.inside
    ? ip.y < 62 && Math.abs(ip.x - 128) < 26
    : Math.hypot(S.px - (DOOR.x * TS + 8), S.py - (DOOR.y * TS + 8)) < 26;
}

function useDoor() {
  if (doorBusy || sleeping || dlgOpen || !nearDoor()) return;
  doorBusy = true;
  fadeEl.style.opacity = 1;
  setTimeout(() => {
    if (S.inside) {
      S.inside = false;
      S.px = DOOR.x * TS + 8;
      S.py = DOOR.y * TS + 10;
    } else {
      S.inside = true;
      ip.x = 128;
      ip.y = 54;
    }
    S.fx = 0;
    S.fy = 1;
    S.vx = S.vy = 0;
    fadeEl.style.opacity = 0;
    doorBusy = false;
  }, 350);
}

/**
 * Renasce dentro da casa, ao lado da cama (usado quando o personagem morre: dormir(true) chama isto). Cai na porta se a cama ainda não carregou.
 */
function respawnInHouse() {
  const m = SPR.bed,
    spots = m && m.ready ? [[14 + m.w / 2, 62], [14 + m.w + 12, 60], [128, 54]] : [[128, 54]];
  const pt = spots.find(([x, y]) => !inBlocked(x, y)) || [128, 54];
  S.inside = true;
  ip.x = pt[0];
  ip.y = pt[1];
  S.fx = 0;
  S.fy = 1;
  S.vx = S.vy = 0;
  S.mv = false;
  doorBusy = false;
}

function moveInside(dt) {
  const kx = Math.max(
      -1,
      Math.min(1, (keys['d'] || keys['arrowright'] ? 1 : 0) - (keys['a'] || keys['arrowleft'] ? 1 : 0) + joyX),
    ),
    ky = Math.max(
      -1,
      Math.min(1, (keys['s'] || keys['arrowdown'] ? 1 : 0) - (keys['w'] || keys['arrowup'] ? 1 : 0) + joyY),
    ),
    mag = Math.hypot(kx, ky);
  S.mv = false;
  S.vx = S.vy = 0;
  if (sleeping || doorBusy || dlgOpen || mag < 0.12) return;
  const sp = SPEED * 0.85 * Math.min(mag, 1),
    dx = (kx / mag) * sp * dt,
    dy = (ky / mag) * sp * dt;
  if (!inBlocked(ip.x + dx, ip.y)) ip.x += dx;
  if (!inBlocked(ip.x, ip.y + dy)) ip.y += dy;
  S.mv = true;
  S.walk += Math.hypot(dx, dy) * 0.2;
  if (Math.abs(kx) > Math.abs(ky)) {
    S.fx = kx > 0 ? 1 : -1;
    S.fy = 0;
  } else {
    S.fy = ky > 0 ? 1 : -1;
    S.fx = 0;
  }
}

function renderInterior() {
  const ox = Math.round((VW - ROOM_W) / 2),
    oy = Math.round((VH - ROOM_H) / 2),
    t = performance.now() / 1000;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#120d0a';
  ctx.fillRect(0, 0, VW, VH);
  ctx.setTransform(1, 0, 0, 1, ox, oy);
  ctx.imageSmoothingEnabled = false;
  const W = SPR.wall,
    F = SPR.floor;
  if (!(W.ready && F.ready && SPR.door.ready)) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, ROOM_W, ROOM_H);
  ctx.clip();
  for (let x = 0; x < ROOM_W; x += 48) ctx.drawImage(W.img, x, 0);
  for (let y = 32; y < ROOM_H; y += 16) for (let x = 0; x < ROOM_W; x += 48) ctx.drawImage(F.img, x, y);
  ctx.restore();
  ctx.fillStyle = '#2a1d14';
  ctx.fillRect(0, 32, 8, ROOM_H - 32);
  ctx.fillRect(ROOM_W - 8, 32, 8, ROOM_H - 32);
  ctx.fillRect(0, ROOM_H - 8, ROOM_W, 8);
  ctx.drawImage(SPR.door.img, 116, 5);
  if (SPR.rug.ready) ctx.drawImage(SPR.rug.img, 102, 84);
  const L = [];
  for (const f of FURN) {
    const m = SPR[f[0]];
    if (m.ready) L.push([f[2], () => ctx.drawImage(m.img, f[1], f[2] - m.h)]);
  }
  L.push([
    ip.y,
    () => {
      const a = S.px,
        b = S.py;
      S.px = ip.x;
      S.py = ip.y;
      drawPlayer();
      S.px = a;
      S.py = b;
    },
  ]);
  L.sort((a, b) => a[0] - b[0]);
  for (const l of L) l[1]();
  const h = 6 + S.min / 60,
    nf = nightF(h);
  if (nf > 0.02) {
    ctx.fillStyle = `rgba(12,18,52,${0.5 * nf})`;
    ctx.fillRect(0, 0, ROOM_W, ROOM_H);
  }
  const lamp = ctx.createRadialGradient(128, 70, 6, 128, 70, 120);
  lamp.addColorStop(0, `rgba(255,200,120,${0.1 + 0.22 * nf})`);
  lamp.addColorStop(1, 'rgba(255,200,120,0)');
  ctx.fillStyle = lamp;
  ctx.fillRect(0, 0, ROOM_W, ROOM_H);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function syncDoorUI() {
  const d = $('btnH'),
    b = $('btnB'),
    n = nearDoor() && !doorBusy && !sleeping;
  d.style.display = n ? '' : 'none';
  d.textContent = S.inside ? 'Sair' : 'Entrar';
  b.style.display = nearBed() ? '' : 'none';
}

export { DOOR, moveInside, nearBed, nearDoor, renderInterior, respawnInHouse, syncDoorUI, useDoor };
