/**
 * Iluminação: cor ambiente por hora, lightmap com luz do céu + luz direta recortada pelas sombras, luzes pontuais das janelas, brilho do sol/lua e névoa dourada.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { OXP, OYP, VH, VW } from '../config/constants.js';
import { gfx, Q } from '../config/settings.js';
import { extensible } from '../core/extensions.js';
import { S } from '../core/GameState.js';
import { nightF, sunInfo } from '../core/TimeManager.js';
import { AB } from './Ablate.js';
import { ctx, mkC } from './Canvas.js';
import { casterShadow } from './ShadowSystem.js';
import { NTK, torchApply } from './Torch.js';
import { hash2, smooth } from '../utils/MathUtils.js';
import { INST, LIGHT_A } from '../world/Instances.js';
import { climate, clouds } from '../world/WeatherSystem.js';

// Cores ambiente (multiplicam a cena) por hora do jogo: 6h até 26h (2h da manhã)
const AMB = [
  [6, 255, 185, 150],
  [8, 255, 232, 205],
  [11, 255, 255, 250],
  [15, 255, 250, 235],
  [17.5, 255, 190, 140],
  [19.5, 215, 120, 150],
  [21, 110, 110, 185],
  [24, 80, 85, 160],
  [26, 120, 120, 190],
];

/* ============ ILUMINAÇÃO ============ */
const ambient = extensible(function ambient(h) {
  let c = null;
  if (h <= AMB[0][0]) c = AMB[0].slice(1);
  for (let i = 0; !c && i < AMB.length - 1; i++) {
    const a = AMB[i],
      b = AMB[i + 1];
    if (h <= b[0]) {
      const f = (h - a[0]) / (b[0] - a[0]);
      c = [1, 2, 3].map((j) => a[j] + (b[j] - a[j]) * f);
    }
  }
  if (!c) c = AMB[AMB.length - 1].slice(1);
  return c.map((v, i) => Math.max(34, 255 - (255 - v) * S.lum - climate.cloud * [36, 30, 19][i]));
});

const LM = mkC(VW, VH),
  lm = LM.getContext('2d'),
  SL = mkC(VW, VH),
  sl = SL.getContext('2d');

const SHH = mkC(VW, VH),
  shH = SHH.getContext('2d'),
  SHS = mkC(VW, VH),
  shS = SHS.getContext('2d'),
  SHM = mkC(VW, VH),
  shM = SHM.getContext('2d');

const BL = [mkC(VW >> 1, VH >> 1), mkC(VW >> 2, VH >> 2)];

function blurTo(dst, src, i) {
  const b = BL[i],
    bc = b.getContext('2d');
  bc.imageSmoothingEnabled = true;
  bc.imageSmoothingQuality = 'low';
  bc.clearRect(0, 0, b.width, b.height);
  bc.drawImage(src, 0, 0, b.width, b.height);
  dst.imageSmoothingEnabled = true;
  dst.imageSmoothingQuality = 'low';
  dst.drawImage(b, 0, 0, VW, VH);
}

const applyLighting = extensible(function applyLighting(t, h, camX, camY, ents) {
  const lit = ambient(h),
    sun = sunInfo(h),
    cl = climate.cloud,
    lum = S.lum,
    q = Q();
  const AL = applyLighting;
  AL.n = (AL.n | 0) + 1;
  const SHM_ = gfx.sh || 'lite',
    per = SHM_ === 'full' ? 2 : 3;
  let ox = 0,
    oy = 0,
    _skip = false; // otimização: refaz luz/sombra a cada 2 quadros e reaproveita (deslocado pela câmera) nos outros
  if (AL.ok && AL.n % per && !window.LIGHT_FULL) {
    ox = AL.cx - camX;
    oy = AL.cy - camY;
    if (Math.abs(ox) <= 12 && Math.abs(oy) <= 12) _skip = true;
    else {
      ox = 0;
      oy = 0;
    }
  }
  if (!_skip) {
    AL.cx = camX;
    AL.cy = camY;
    AL.ok = true;
  }
  const nf = nightF(h) * lum;
  const sunS = smooth(0, 0.2, sun.day) * (1 - cl * 0.88) * lum;
  const moon = sunInfo(h - 12.5),
    moonS = smooth(18.8, 20.4, h) * smooth(0, 0.25, moon.day) * (1 - cl * 0.75) * lum;
  const useSun = sunS >= moonS,
    key = useSun ? sun : moon,
    ks = Math.max(sunS, moonS);
  // luz do céu (preenchimento azulado nas sombras) + luz direta (quente) = exposição original
  let A = lit.slice(),
    D = [0, 0, 0];
  if (useSun && sunS > 0.01) {
    A = lit.map((v, i) => v * (1 - sunS * [0.4, 0.34, 0.2][i]));
    D = lit.map((v, i) => v - A[i]);
  } else if (moonS > 0.01) {
    D = [34, 48, 84].map((v) => v * moonS * (NTK ? 1 - 0.9 * NTK(h) * S.lum : 1));
  }
  let vx = 0,
    vy = 0;
  if (!_skip) {
    for (const c of [shH, shS]) {
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, VW, VH);
      c.setTransform(1, 0, 0, 1, -camX, -camY);
      c.fillStyle = c.strokeStyle = '#000';
    }
    if (SHM_ !== 'off' && ks > 0.02 && !(NTK && !useSun && NTK(h) > 0.5)) {
      const m = key.shadow;
      vx = key.dirX * m;
      vy = key.dirY * m;
      for (const en of ents) {
        if (AB.luzSombras) break; // só o teste de desempenho
        const s = en.sh,
          rc = s[6] || 0;
        if (s[0] < camX - 240 - rc || s[0] > camX + VW + 240 + rc || s[1] < camY - 80 - rc || s[1] > camY + VH + 240)
          continue;
        casterShadow(shS, s, vx, vy, 1);
        if (SHM_ === 'full') casterShadow(shH, s, vx, vy, 0.45);
      }
      if (useSun && sunS > 0.12 && !AB.luzSombras) {
        const W = 1936,
          spd = 5 + climate.wind * 14;
        for (let i = 0; i < 5; i++) {
          let cx = ((hash2(i, 5) * W + t * spd) % W) - 200,
            cy = hash2(i, 9) * 1024;
          cx += Math.round((camX - cx) / W) * W;
          cy += Math.round((camY - cy) / 1024) * 1024;
          const rx = 50 + hash2(i, 2) * 70;
          shS.fillStyle = `rgba(0,0,0,${0.26 + 0.5 * cl})`;
          shS.beginPath();
          shS.ellipse(cx, cy, rx, rx * 0.5, 0, 0, 6.283);
          shS.fill();
        }
        for (const c of clouds) {
          shS.fillStyle = `rgba(0,0,0,${0.55 * c.pw})`;
          shS.beginPath();
          shS.ellipse(c.x, c.y, c.r * 1.4, c.r * 0.9, 0, 0, 6.283);
          shS.fill();
        }
      }
    }
    // máscara final: penumbra larga (longe do objeto) + borda nítida (perto da base)
    shM.setTransform(1, 0, 0, 1, 0, 0);
    shM.globalCompositeOperation = 'source-over';
    shM.clearRect(0, 0, VW, VH);
    if (SHM_ !== 'off' && !AB.luzBlur) {
      blurTo(shM, SHS, q ? 1 : 0);
      if (SHM_ === 'full') blurTo(shM, SHH, 0);
    }
    if (q >= 2 && ks > 0.05 && !AB.luzSombras && !(NTK && !useSun && NTK(h) > 0.5)) {
      shM.globalCompositeOperation = 'destination-out';
      for (const en of ents) {
        if (en.sh[4] !== 'tree') continue;
        const cx = en.sh[0] + vx * 19 - camX,
          cy = en.sh[1] + vy * 19 - camY;
        if (cx < -30 || cx > VW + 30 || cy < -30 || cy > VH + 30) continue;
        for (let j = 0; j < 7; j++) {
          const a = hash2(en.sh[0] | 0, j + 3) * 6.283 + Math.sin(t * 0.7 + j) * 0.5,
            rr = 3 + hash2(j, en.sh[1] | 0) * 9;
          shM.fillStyle = `rgba(0,0,0,${0.35 + 0.3 * Math.sin(t * 2.1 + j * 1.7 + en.sh[0]) ** 2})`;
          shM.beginPath();
          shM.arc(
            cx + Math.cos(a) * rr + Math.sin(t * 1.3 + j) * 0.8,
            cy + Math.sin(a) * rr * 0.7,
            1 + hash2(j, 7) * 1.3,
            0,
            6.283,
          );
          shM.fill();
        }
      }
      shM.globalCompositeOperation = 'source-over';
    }
    // luz direta recortada pelas sombras
    sl.setTransform(1, 0, 0, 1, 0, 0);
    sl.globalCompositeOperation = 'source-over';
    sl.fillStyle = `rgb(${D[0] | 0},${D[1] | 0},${D[2] | 0})`;
    sl.fillRect(0, 0, VW, VH);
    sl.globalCompositeOperation = 'destination-out';
    sl.drawImage(SHM, 0, 0);
    sl.globalCompositeOperation = 'source-over';
    // lightmap = céu + luz direta + luzes pontuais
    lm.setTransform(1, 0, 0, 1, 0, 0);
    lm.globalAlpha = 1;
    lm.globalCompositeOperation = 'source-over';
    lm.fillStyle = `rgb(${A[0] | 0},${A[1] | 0},${A[2] | 0})`;
    lm.fillRect(0, 0, VW, VH);
    lm.globalCompositeOperation = 'lighter';
    lm.drawImage(SL, 0, 0);
    if (nf > 0.02) {
      lm.setTransform(1, 0, 0, 1, -camX, -camY);
      const fl = 0.93 + 0.05 * Math.sin(t * 9) + 0.03 * Math.sin(t * 23 + 1.7);
      for (const [x, y, r, col, a] of LIGHT_A) {
        const g = lm.createRadialGradient(x, y, 1, x, y, r * fl);
        g.addColorStop(0, `rgba(${col},${a * nf})`);
        g.addColorStop(0.18, `rgba(${col},${a * nf * 0.6})`);
        g.addColorStop(0.5, `rgba(${col},${a * nf * 0.2})`);
        g.addColorStop(1, `rgba(${col},0)`);
        lm.fillStyle = g;
        lm.fillRect(x - r, y - r, 2 * r, 2 * r);
      }
      const gg = lm.createLinearGradient(0, 176 + OYP, 0, 216 + OYP);
      gg.addColorStop(0, `rgba(255,185,100,${0.4 * nf * fl * (INST.homeAct ? 1 : 0)})`);
      gg.addColorStop(1, 'rgba(255,185,100,0)');
      lm.fillStyle = gg;
      for (const [a, b] of [
        [236 + OXP, 236 + OXP],
        [268 + OXP, 268 + OXP],
      ]) {
        lm.beginPath();
        lm.moveTo(a - 7, 176 + OYP);
        lm.lineTo(b + 7, 176 + OYP);
        lm.lineTo(b + 13, 216 + OYP);
        lm.lineTo(a - 13, 216 + OYP);
        lm.closePath();
        lm.fill();
      }
    }
    if (torchApply) torchApply(lm, t, h, camX, camY, ents);
  } // fim do bloco recalculado
  if (AB.luzFinal) return; // só o teste de desempenho: sem a composição final na tela
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(LM, ox, oy);
  ctx.globalCompositeOperation = 'lighter';
  if (sunS > 0.05) {
    ctx.globalAlpha = 0.2 * (0.5 + 0.5 * sun.warm);
    ctx.drawImage(SL, ox, oy);
    ctx.globalAlpha = 1;
  } // brilho de superexposição nas áreas ao sol
  ctx.globalCompositeOperation = 'source-over';
  if (nf > 0.02) {
    ctx.setTransform(1, 0, 0, 1, -camX, -camY);
    ctx.fillStyle = `rgba(255,214,128,${Math.min(1, nf * 1.3) * 0.92})`;
  } // janelas emissivas
  // brilho do sol/lua cruzando o topo da tela (esquerda -> direita)
  if (ks > 0.03) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const gx = VW * (0.5 - 0.66 * Math.cos(key.az)),
      gy = -28 + 78 * (1 - Math.sqrt(key.day)),
      low = 1 - smooth(0.1, 0.6, key.day),
      R = useSun ? 190 : 120,
      gl = ctx.createRadialGradient(gx, gy, 2, gx, gy, R),
      c = useSun ? (low > 0.4 ? '255,176,96' : '255,238,196') : '196,214,255',
      a = (useSun ? 0.26 + 0.2 * low : 0.1) * ks;
    gl.addColorStop(0, `rgba(${c},${a})`);
    gl.addColorStop(0.35, `rgba(${c},${a * 0.35})`);
    gl.addColorStop(1, `rgba(${c},0)`);
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = gl;
    ctx.fillRect(0, 0, VW, VH);
    ctx.globalCompositeOperation = 'source-over';
  }
  // névoa dourada vinda do lado do sol
  const gold = useSun ? sunS * (1 - smooth(0.1, 0.55, sun.day)) : 0;
  if (gold > 0.04) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const sx = key.dirX < 0 ? VW : 0,
      gr = ctx.createLinearGradient(sx, 0, VW - sx, 0);
    gr.addColorStop(0, `rgba(255,168,84,${0.17 * gold})`);
    gr.addColorStop(0.7, 'rgba(255,168,84,0)');
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, VW, VH);
    ctx.globalCompositeOperation = 'source-over';
  }
});

export { ambient, applyLighting, blurTo };
