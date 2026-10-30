/**
 * Pós-processamento atmosférico: feixes de sol, bloom seletivo e poeira no ar.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { MH, MW, OXP, OYP, TS, VH, VW, WATER } from '../config/constants.js';
import { gfx, Q } from '../config/settings.js';
import { S } from '../core/GameState.js';
import { nightF, sunInfo } from '../core/TimeManager.js';
import { AB } from './Ablate.js';
import { ctx, fx, fxCanvas, gctx, glowCanvas } from './Canvas.js';
import { fillGlow } from './Effects.js';
import { hash2, smooth } from '../utils/MathUtils.js';
import { climate } from '../world/WeatherSystem.js';
import { actRange, ground } from '../world/World.js';

/* ============ EFEITOS ATMOSFÉRICOS E PÓS-PROCESSAMENTO ============ */
// As duas camadas só precisam ser limpas e compostas na tela (2 misturas de tela cheia) se algo foi pintado nelas.
const ATM_OFF = /[?&](noatm|safe)\b/.test(location.search); // diagnóstico: ?noatm = limpa e compõe as camadas sempre (original)
let fxDirty = ATM_OFF,
  glDirty = ATM_OFF;

function drawAtmosphere(t, h, camX, camY, ents) {
  const sun = sunInfo(h),
    quality = Q();
  if (fxDirty) fx.clearRect(0, 0, VW, VH);
  if (glDirty) gctx.clearRect(0, 0, VW, VH);
  let fxUsed = false,
    glUsed = false;
  const strength = sun.day * S.lum * (1 - climate.cloud * 0.9);
  if (gfx.rays && quality > 0 && strength > 0.03 && !AB.atmRaios) {
    const low = smooth(0, 0.13, sun.day) * (1 - smooth(0.5, 0.98, sun.day));
    const maxRays = quality === 1 ? 9 : quality === 2 ? 20 : 32;
    let count = 0;
    for (const en of ents) {
      if (en.sh[4] !== 'tree' || count >= maxRays) continue;
      const bx = en.sh[0] - camX,
        by = en.sh[1] - camY - 19;
      if (bx < -65 || bx > VW + 65 || by < -70 || by > VH + 70) continue;
      if (hash2(en.sh[0] | 0, en.sh[1] | 0) < 0.24) continue;
      count++;
      const length = (20 + 52 * low) * (quality >= 3 ? 1.15 : 1);
      const dx = sun.dirX * length,
        dy = sun.dirY * length;
      const warm = sun.warm;
      const col = warm > 0.5 ? '255,195,108' : '255,245,207';
      const opacity = (0.055 + 0.13 * low) * strength * (0.6 + 0.4 * hash2(bx | 0, by | 0));
      const cx = bx + dx * 0.5,
        cy = by + dy * 0.5;
      const grad = fx.createRadialGradient(bx, by, 1, cx, cy, length * 0.9);
      grad.addColorStop(0, `rgba(${col},${opacity})`);
      grad.addColorStop(0.5, `rgba(${col},${opacity * 0.55})`);
      grad.addColorStop(1, `rgba(${col},0)`);
      fxUsed = true;
      fx.fillStyle = grad;
      fx.beginPath();
      fx.moveTo(bx - 3, by);
      fx.lineTo(bx + 3, by);
      fx.lineTo(bx + dx + 13, by + dy);
      fx.lineTo(bx + dx - 13, by + dy);
      fx.closePath();
      fx.fill();
    }
  }
  if (gfx.particles && quality > 0 && !AB.atmParticulas) {
    const count = quality === 1 ? 14 : quality === 2 ? 30 : 52;
    for (let i = 0; i < count; i++) {
      const seed = hash2(i, 17),
        seed2 = hash2(i, 91);
      const x = (((seed * 1536 + Math.sin(t * (0.25 + seed * 0.4) + i) * 11 - camX) % 1536) + 1536) % 1536,
        y = (((seed2 * 1024 + Math.cos(t * 0.2 + i) * 7 - camY) % 1024) + 1024) % 1024;
      if (x < 0 || x > VW || y < 0 || y > VH) continue;
      const alpha = (0.1 + 0.23 * Math.sin(t * 1.3 + i) ** 2) * strength;
      fxUsed = true;
      fx.fillStyle = `rgba(255,234,169,${alpha})`;
      fx.fillRect(x | 0, y | 0, quality >= 3 && i % 5 === 0 ? 2 : 1, 1);
    }
  }
  // Reflexos na água, iluminação das janelas e fontes noturnas.
  const night = nightF(h) * S.lum;
  const lights = [
    [236 + OXP, 153 + OYP, 23],
    [266 + OXP, 153 + OYP, 23],
    [248 + OXP, 172 + OYP, 28],
    [312 + OXP, 196 + OYP, 22],
  ];
  if (night > 0.02) {
    for (const [lx, ly, r] of lights) {
      const x = lx - camX,
        y = ly - camY;
      if (x < -r || x > VW + r || y < -r || y > VH + r) continue;
      glUsed = true;
      fillGlow(gctx, x, y, r * (quality >= 2 ? 1.8 : 1.2), '255,185,94', 0.22 * night);
      fillGlow(gctx, x, y, r * 0.5, '255,228,156', 0.28 * night);
    }
  }
  if (quality >= 2 && strength > 0.1) {
    for (let ty = Math.max(0, Math.floor(camY / TS)); ty <= Math.min(MH - 1, Math.floor((camY + VH) / TS)); ty++) {
      const AR2 = actRange();
      for (
        let tx = Math.max(AR2[0], Math.floor(camX / TS));
        tx <= Math.min(AR2[1], Math.floor((camX + VW) / TS));
        tx++
      ) {
        if (ground[ty * MW + tx] !== WATER) continue;
        const twinkle = Math.sin(t * 2.5 + tx * 2.8 + ty * 1.9);
        if (twinkle > 0.76) {
          const x = tx * TS - camX + 8,
            y = ty * TS - camY + 7;
          glUsed = true;
          fillGlow(gctx, x, y, quality >= 3 ? 9 : 6, '255,232,173', (0.13 + 0.14 * twinkle) * strength);
        }
      }
    }
  }
  fxDirty = fxUsed || ATM_OFF;
  glDirty = glUsed || ATM_OFF;
  if (ATM_OFF) fxUsed = glUsed = true;
  if (!fxUsed && !glUsed) return; // camadas vazias: compô-las não mudaria nenhum pixel
  if (AB.atmCompor) return; // só o teste de desempenho
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (fxUsed) {
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(fxCanvas, 0, 0);
  }
  if (glUsed) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(glowCanvas, 0, 0);
  }
  ctx.restore();
}

export { drawAtmosphere };
