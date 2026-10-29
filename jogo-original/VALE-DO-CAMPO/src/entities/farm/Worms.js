/**
 * Minhocas: vivem sob a terra, sobem com chuva/noite e são presa das galinhas.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { GRASS, MW, OX, OY, SOIL, TS } from '../../config/constants.js';
import { extensible } from '../../core/extensions.js';
import { S, sleeping } from '../../core/GameState.js';
import { sunInfo } from '../../core/TimeManager.js';
import { treesNear } from '../animals/AnimalSocial.js';
import { chx } from './Chickens.js';
import { ctx } from '../../rendering/Canvas.js';
import { solid } from '../../systems/CollisionSystem.js';
import { assetUrl } from '../../utils/assets.js';
import { rr } from '../../utils/Random.js';
import { wetT } from '../../world/RainSystem.js';
import { climate } from '../../world/WeatherSystem.js';
import { ground, obj } from '../../world/World.js';

/* ============ MINHOCAS: vivem sob a terra, sobem à superfície e são presa das galinhas ============ */
const WRM_IMG = new Image();

let wrm = [],
  wrmDay = -1;

function wrmSpawn(x, y) {
  if (x === undefined) {
    for (let k = 0; k < 60; k++) {
      const tx = OX + ((Math.random() * 96) | 0),
        ty = OY + ((Math.random() * 64) | 0),
        i = ty * MW + tx;
      if ((ground[i] !== GRASS && ground[i] !== SOIL) || obj[i] || solid(tx, ty)) continue;
      const shade = treesNear(tx * TS + 8, ty * TS + 8, 2) > 0 ? 0.5 : 0.2;
      if (Math.random() < shade + wetT[i] * 0.5) {
        x = tx * TS + 8;
        y = ty * TS + 8;
        break;
      }
    }
    if (x === undefined) return;
  }
  wrm.push({ x, y, st: 'sub', t: Math.random() * 60 + 10, fr: Math.random() * 2, eaten: false });
}

function wrmStart() {
  wrm = [];
  for (let k = 0; k < 80; k++) wrmSpawn();
  wrmDay = -1;
}

function wrmSave() {
  return wrm.map((w) => [w.x, w.y]);
}

function restoreWrm(arr) {
  if (!Array.isArray(arr) || !arr.length) {
    wrmStart();
    return;
  }
  wrm = arr.map(([x, y]) => ({ x, y, st: 'sub', t: Math.random() * 60 + 10, fr: 0, eaten: false }));
}

function wrmChance() {
  const h = 6 + S.min / 60,
    sunI = sunInfo(h);
  let p = 0.25;
  if (climate.rain > 0.1) p *= 3; // chuva: sobe para não afogar
  if (sunI.day < 0.05) p *= 1.8; // noite
  if (sunI.day > 0.5 && climate.cloud < 0.3) p *= 0.3; // sol direto: UV, foge pra dentro
  return Math.min(0.9, p);
}

const updateWrm = extensible(function updateWrm(dt) {
  if (sleeping) return;
  if (S.day !== wrmDay) {
    wrmDay = S.day; // reprodução diária (casulo simplificado)
    for (const w of wrm.slice()) {
      if (wrm.length >= 160) break;
      if (Math.random() < 0.08)
        wrm.push({ x: w.x + rr(-10, 10), y: w.y + rr(-10, 10), st: 'sub', t: 30, fr: 0, eaten: false });
    }
  }
  for (const w of wrm) {
    if (w.st === 'sub') {
      w.t -= dt;
      if (w.t <= 0) {
        if (Math.random() < wrmChance()) {
          w.st = 'surf';
          const h = 6 + S.min / 60;
          w.t = sunInfo(h).day > 0.5 && climate.cloud < 0.3 ? 4 : 10 + Math.random() * 8;
        } else w.t = 8 + Math.random() * 10;
      }
    } else {
      w.fr += dt;
      w.t -= dt;
      if (w.t <= 0) {
        w.st = 'sub';
        w.t = 40 + Math.random() * 110;
      }
    }
  }
  wrm = wrm.filter((w) => !w.eaten);
});

function nearestWorm(c, r) {
  let best = null,
    bd = r;
  for (const w of wrm) {
    if (w.st !== 'surf' || w.eaten) continue;
    const d = Math.hypot(w.x - c.x, w.y - c.y);
    if (d < bd && !chx.some((q) => q !== c && q.prey === w)) {
      bd = d;
      best = w;
    }
  }
  return best;
}

function drawWrm(w) {
  const f = Math.floor(w.fr * 4) % 2;
  if (WRM_IMG.complete && WRM_IMG.naturalWidth)
    ctx.drawImage(WRM_IMG, f * 8, 0, 8, 3, Math.round(w.x - 4), Math.round(w.y - 2), 8, 3);
  else {
    ctx.fillStyle = '#d68084';
    ctx.fillRect(w.x - 4, w.y - 1, 8, 2);
  }
}

export function loadWormSprite() {
  WRM_IMG.src = assetUrl('sprites/animals/worm.webp'); // 2 quadros de 8x3 px
}

export { drawWrm, nearestWorm, restoreWrm, updateWrm, wrm, wrmSave, wrmStart };
