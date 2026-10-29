/**
 * Água viva: simulação de ondas em grade 4 px, impulsos do jogador/chuva/vaca bebendo, reflexos do céu e do sol, respingos.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { MH, MW, TS, VH, VW, WATER } from '../config/constants.js';
import { S } from '../core/GameState.js';
import { sunInfo } from '../core/TimeManager.js';
import { herd } from '../entities/cow/Herd.js';
import { drawPlayer } from '../entities/Player.js';
import { ctx } from '../rendering/Canvas.js';
import { pBlocked } from '../systems/CollisionSystem.js';
import { curQ, drawFlowParts, drawFlowPartsSlow, flowTick, WFX, WFY } from './hydrology/RiverFlow.js';
import { climate } from './WeatherSystem.js';
import { ground } from './World.js';

const WG = 4,
  WGW = (MW * TS) / WG,
  WGH = (MH * TS) / WG;

let wA = new Float32Array(WGW * WGH),
  wB = new Float32Array(WGW * WGH),
  wM = new Uint8Array(WGW * WGH);

const wDrops = [],
  wCam = { x: 0, y: 0 };
let wAcc = 0,
  wMaskT = -9,
  wPrev = false,
  wCowT = 0,
  wIdle = 0;

const wClamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function wWin() {
  return [
    Math.max(1, ((wCam.x / WG) | 0) - 3),
    Math.min(WGW - 2, (((wCam.x + VW) / WG) | 0) + 3),
    Math.max(1, ((wCam.y / WG) | 0) - 3),
    Math.min(WGH - 2, (((wCam.y + VH) / WG) | 0) + 3),
  ];
}

function wMask(w) {
  for (let cy = w[2]; cy <= w[3]; cy++)
    for (let cx = w[0]; cx <= w[1]; cx++) wM[cy * WGW + cx] = ground[(cy >> 2) * MW + (cx >> 2)] === WATER ? 1 : 0;
}

function wImpulse(px, py, amp, r) {
  const cx = (px / WG) | 0,
    cy = (py / WG) | 0;
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) {
      const d = Math.hypot(dx, dy);
      if (d > r) continue;
      const x = cx + dx,
        y = cy + dy;
      if (x < 1 || y < 1 || x >= WGW - 1 || y >= WGH - 1) continue;
      const i = y * WGW + x;
      if (wM[i]) wA[i] += amp * (1 - d / (r + 0.5));
    }
}

function wStep(w) {
  const qa = curQ / (WG * 60);
  for (let cy = w[2]; cy <= w[3]; cy++) {
    let i = cy * WGW + w[0];
    for (let cx = w[0]; cx <= w[1]; cx++, i++) {
      if (!wM[i]) {
        wB[i] = 0;
        continue;
      }
      const c = wA[i];
      const l = wM[i - 1] ? wA[i - 1] : c,
        r = wM[i + 1] ? wA[i + 1] : c,
        u = wM[i - WGW] ? wA[i - WGW] : c,
        d = wM[i + WGW] ? wA[i + WGW] : c;
      let v = ((l + r + u + d) * 0.5 - wB[i]) * 0.9;
      if (WFX) {
        const fx = WFX[i] * qa,
          fy = WFY[i] * qa; // a correnteza leva a ondulação rio abaixo
        if (fx || fy) {
          const ax = Math.min(0.45, Math.abs(fx)),
            ay = Math.min(0.45, Math.abs(fy)),
            sx = fx > 0 ? i - 1 : i + 1,
            sy = fy > 0 ? i - WGW : i + WGW;
          v = v * (1 - ax - ay) + (wM[sx] ? wA[sx] : 0) * ax + (wM[sy] ? wA[sy] : 0) * ay;
        }
      }
      wB[i] = v;
    }
  }
  const T = wA;
  wA = wB;
  wB = T;
}

function wSplash(x, y, n, p) {
  for (let k = 0; k < n; k++) {
    const a = Math.random() * 6.283,
      s = 10 + Math.random() * 30 * p;
    wDrops.push({ x, y, y0: y, vx: Math.cos(a) * s, vy: -(40 + Math.random() * 70 * p), z: 0 });
  }
}

function wCovAt(x, y) {
  return ground[Math.floor(y / TS) * MW + Math.floor(x / TS)] === WATER ? 1 : 0;
}

function waterTick(dt) {
  const now = performance.now() / 1000;
  dt = Math.min(dt, 0.05);
  const cov =
    (wCovAt(S.px, S.py) * 2 +
      wCovAt(S.px - 4, S.py - 2) +
      wCovAt(S.px + 4, S.py - 2) +
      wCovAt(S.px - 4, S.py + 2) +
      wCovAt(S.px + 4, S.py + 2)) /
    6;
  S.wetK = (S.wetK || 0) + (cov - (S.wetK || 0)) * Math.min(1, dt * 7);
  if (S.wetK < 0.01 && cov === 0) S.wetK = 0;
  const w = wWin();
  if (now - wMaskT > 0.5) {
    wMask(w);
    wMaskT = now;
  }
  flowTick(dt);
  const sp = Math.hypot(S.vx || 0, S.vy || 0),
    wet = S.wetK;
  // entrar/sair: splash (ação -> onda)
  const inW = cov > 0.5;
  if (inW !== wPrev) {
    wPrev = inW;
    wImpulse(S.px, S.py + 2, -3.2, 2);
    wSplash(S.px, S.py + 1, inW ? 10 : 6, 0.8);
  }
  if (wet > 0.12) {
    if (S.mv) {
      wImpulse(S.px, S.py + 1, -(0.22 + sp * 0.006) * wet, 1);
      if (Math.random() < 0.25) wSplash(S.px, S.py + 1, 1, 0.6);
    } else {
      wIdle -= dt;
      if (wIdle <= 0) {
        wIdle = 0.7;
        wImpulse(S.px, S.py + 1, -0.35 * wet, 1);
      }
    }
    // reação: a onda empurra o personagem e faz ele balançar
    const cx = (S.px / WG) | 0,
      cy = (S.py / WG) | 0,
      i = cy * WGW + cx;
    if (i > WGW && i < wA.length - WGW) {
      const fx = wA[i - 1] - wA[i + 1],
        fy = wA[i - WGW] - wA[i + WGW];
      const nx = wClamp(fx * 45, -22, 22) * dt * wet,
        ny = wClamp(fy * 45, -22, 22) * dt * wet;
      if (!pBlocked(S.px + nx, S.py)) S.px += nx;
      if (!pBlocked(S.px, S.py + ny)) S.py += ny;
      S.wBob = (S.wBob || 0) * 0.85 + wA[i] * 0.15;
    }
  } else S.wBob = 0;
  // vaca bebendo, chuva e vento
  wCowT -= dt;
  if (wCowT <= 0) {
    wCowT = 0.7;
    for (const q of herd)
      if (q.state === 'drink')
        for (const [ox, oy] of [
          [-9, 0],
          [9, 0],
          [0, 9],
          [0, -9],
        ]) {
          const ci = (((q.y + oy) / WG) | 0) * WGW + (((q.x + ox) / WG) | 0);
          if (wM[ci]) {
            wImpulse(q.x + ox, q.y + oy, -0.8, 2);
            break;
          }
        }
  }
  wAcc += dt;
  let st = 0;
  while (wAcc >= 1 / 60 && st < 2) {
    wAcc -= 1 / 60;
    st++;
    const rn = Math.floor((climate.rain || 0) * 3) + 1;
    for (let k = 0; k < rn; k++) {
      if (k > 0 && Math.random() > (climate.rain || 0) * 1.2) continue;
      const cx = (w[0] + Math.random() * (w[1] - w[0])) | 0,
        cy = (w[2] + Math.random() * (w[3] - w[2])) | 0,
        i = cy * WGW + cx;
      if (wM[i]) wA[i] += (Math.random() - 0.5) * (k ? 1.2 : 0.2) * (0.6 + climate.wind);
    }
    wStep(w);
  }
  for (let i = wDrops.length - 1; i >= 0; i--) {
    const d = wDrops[i];
    d.vy += 260 * dt;
    d.x += d.vx * dt;
    d.y += d.vy * dt * 0.6;
    d.z += dt;
    if (d.y >= d.y0 && d.vy > 0) {
      if (wCovAt(d.x, d.y0)) wImpulse(d.x, d.y0, -0.5, 1);
      wDrops.splice(i, 1);
    } else if (d.z > 1) wDrops.splice(i, 1);
  }
}

const wQ = [...Array(10)].map((_, k) => ({
  w: `rgba(235,248,255,${((k + 1) * 0.055).toFixed(3)})`,
  d: `rgba(8,38,92,${((k + 1) * 0.05).toFixed(3)})`,
}));

function drawWaterFX(t, camX, camY, x0, x1, y0, y1) {
  const h = 6 + S.min / 60,
    sunI = sunInfo(h),
    day = sunI.day,
    cl = climate.cloud || 0,
    sunWX = camX + VW * (0.5 - 0.42 * sunI.dirX),
    sigW = VW * 0.16; // reflexo do sol segue a posição real do sol
  // reflexo do céu (cor muda com a hora do dia)
  const warm = day > 0.02 && day < 0.5 ? Math.max(0, 1 - Math.abs(day - 0.25) * 4) : 0;
  const r = Math.round(25 + 135 * day + warm * 90),
    g = Math.round(40 + 165 * day + warm * -10),
    b = Math.round(95 + 160 * day - warm * 90);
  ctx.beginPath();
  for (let ty = y0; ty <= y1; ty++)
    for (let tx = x0; tx <= x1; tx++) if (ground[ty * MW + tx] === WATER) ctx.rect(tx * TS, ty * TS, TS, TS);
  ctx.save();
  ctx.clip();
  const gr = ctx.createLinearGradient(0, camY, 0, camY + VH);
  gr.addColorStop(0, `rgba(${r},${g},${b},.30)`);
  gr.addColorStop(1, `rgba(${r},${g},${b},.08)`);
  ctx.fillStyle = gr;
  ctx.fillRect(camX, camY, VW, VH);
  // brilho do sol que balança
  if (day > 0.25) {
    const gx = sunWX + Math.sin(t * 0.4) * 6,
      gy = camY + VH * 0.5;
    const sg = ctx.createRadialGradient(gx, gy, 4, gx, gy, 140);
    sg.addColorStop(0, `rgba(255,244,205,${0.22 * day * (1 - cl * 0.8)})`);
    sg.addColorStop(1, 'rgba(255,244,205,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(camX, camY, VW, VH);
  }
  ctx.restore();
  // ondas: luz/sombra pelo gradiente da superfície + cintilações
  const w = wWin(),
    sp = day * (1 - cl * 0.7);
  for (let cy = w[2]; cy <= w[3]; cy++) {
    let i = cy * WGW + w[0];
    for (let cx = w[0]; cx <= w[1]; cx++, i++) {
      if (!wM[i]) continue;
      const s = wA[i - 1] - wA[i + 1] + (wA[i - WGW] - wA[i + WGW]);
      const a = s < 0 ? -s : s;
      if (a > 0.05) {
        const k = Math.min(9, (a * 3) | 0);
        ctx.fillStyle = s > 0 ? wQ[k].w : wQ[k].d;
        ctx.fillRect(cx * WG, cy * WG, WG, WG);
      } else if (sp > 0.15) {
        const m = Math.sin(cx * 0.83 + t * 1.9 + cy * 0.37) * Math.sin(cy * 1.1 - t * 1.4 + cx * 0.5);
        const rf = Math.exp(-((cx * WG - sunWX) ** 2) / (2 * sigW * sigW)); // cintilações concentradas no caminho do reflexo do sol
        if (m > 0.9 - 0.2 * rf) {
          ctx.fillStyle = `rgba(255,248,215,${(0.18 + 0.3 * (m - 0.9 + 0.2 * rf) * 10 + 0.35 * rf) * sp})`;
          ctx.fillRect(cx * WG, cy * WG, WG, rf > 0.4 ? 2 : 1);
        }
      }
    }
  }
  if (/[?&](noflow|safe)\b/.test(location.search)) drawFlowPartsSlow(t);
  else drawFlowParts(t, camX, camY);
}

function drawReflections(ents, t) {
  const pw = (S.wetK || 0) > 0.05;
  for (const en of ents) {
    if (pw && en.draw === drawPlayer) continue;
    const sh = en.sh;
    if (sh[4] === 'house') continue;
    const bx = sh[0],
      by = en.k;
    if (bx < wCam.x - 30 || bx > wCam.x + VW + 30 || by < wCam.y - 8 || by > wCam.y + VH + 50) continue;
    const rh = Math.min(40, Math.max(10, sh[3] || 14)),
      ty0 = Math.floor((by + 2) / TS),
      ty1 = Math.floor((by + rh) / TS);
    if (ty0 < 0 || ty1 >= MH) continue;
    let any = false;
    ctx.beginPath();
    for (let ty = ty0; ty <= ty1; ty++)
      for (let tx = Math.floor((bx - 16) / TS); tx <= Math.floor((bx + 16) / TS); tx++)
        if (tx >= 0 && tx < MW && ground[ty * MW + tx] === WATER) {
          ctx.rect(tx * TS, Math.max(ty * TS, by), TS, TS);
          if (ty === ty0 && Math.abs(tx * TS + 8 - bx) < 14) any = true;
        }
    if (!any) continue;
    const k = Math.sin(t * 1.7 + bx * 0.3) * 0.07;
    ctx.save();
    ctx.clip();
    ctx.globalAlpha = 0.36;
    ctx.transform(1, 0, k, 1, -k * by, 0);
    ctx.translate(0, 2 * by);
    ctx.scale(1, -1);
    en.draw();
    ctx.restore();
  }
}

function drawSplash() {
  if (!wDrops.length) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, -wCam.x, -wCam.y);
  for (const d of wDrops) {
    ctx.fillStyle = `rgba(225,244,255,${Math.max(0, 1 - d.z) * 0.9})`;
    ctx.fillRect(Math.round(d.x), Math.round(d.y), 1.5, 1.5);
  }
  ctx.restore();
}

export {
  WG,
  WGH,
  WGW,
  drawReflections,
  drawSplash,
  drawWaterFX,
  wA,
  wB,
  wCam,
  wClamp,
  wDrops,
  wImpulse,
  wM,
  wSplash,
  waterTick,
};
