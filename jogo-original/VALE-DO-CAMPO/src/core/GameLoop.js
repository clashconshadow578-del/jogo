/**
 * Laço principal (requestAnimationFrame): delta time limitado a 50 ms, governador adaptativo de resolução/qualidade por FPS, atualização, renderização e interface.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { gfx, Q, qDrop, setQDrop } from '../config/settings.js';
import { update } from './GameUpdate.js';
import { FPS_ON, fpsSample } from './FpsMeter.js';
import { applyRes, ctx, RS, VIG } from '../rendering/Canvas.js';
import { render } from '../rendering/Renderer.js';
import { updHome } from '../ui/HomeArrow.js';
import { renderHotbar } from '../ui/Hotbar.js';
import { updHUD } from '../ui/HUD.js';
import { syncDoorUI } from '../world/HouseInterior.js';

let frameNo = 0;

let last = performance.now(),
  fpsN = 0,
  fpsT = 0,
  qCool = 0,
  stableN = 0,
  stableNeed = 20,
  probeAge = 99;

function frame(now) {
  requestAnimationFrame(frame);
  const raw = now - last,
    dt = Math.max(0, Math.min(raw / 1000, 0.05));
  last = now;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (raw < 250) {
    fpsT += raw;
    if (++fpsN >= 24) {
      const avg = fpsT / fpsN;
      fpsN = 0;
      fpsT = 0; // governador: a resolução pesa mais que os efeitos, então cai primeiro; depois de um tempo estável ele TESTA subir de novo
      probeAge++;
      if (qCool > 0) {
        qCool--;
      } else if (gfx.res !== 'auto' && gfx.res !== undefined) {
      } // resolução fixa pelo jogador: não mexe
      else {
        const bad = avg > 19 && RS > 1 ? 1 : avg > 17.5 && Q() > 0 ? 2 : 0;
        if (bad) {
          if (probeAge <= 6) stableNeed = Math.min(stableNeed * 2, 320); // o teste de subida falhou: espera mais antes de tentar de novo
          if (bad === 1) {
            applyRes.cap = RS - 1;
            applyRes();
            qCool = 2;
          } else {
            setQDrop(qDrop + 1);
            qCool = 1;
          }
          stableN = 0;
          probeAge = 99;
        } else if (avg <= 17.8 && (qDrop > 0 || RS < applyRes.nat)) {
          // roda liso (não dá para medir folga pelo intervalo do vsync, então testamos)
          if (++stableN >= stableNeed) {
            if (qDrop > 0) setQDrop(qDrop - 1);
            else {
              applyRes.cap = RS + 1;
              applyRes();
            }
            qCool = 3;
            stableN = 0;
            probeAge = 0;
          }
        } else stableN = 0;
      }
    }
  }
  update(dt);
  const tFps = FPS_ON ? performance.now() : 0; // só com ?fps (FpsMeter.js)
  render();
  if (FPS_ON) fpsSample(performance.now() - tFps);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.drawImage(VIG, 0, 0);
  frameNo++;
  updHUD();
  syncDoorUI();
  updHome();
  if ((frameNo & 3) === 0) renderHotbar();
}

export function startLoop() {
  /* so inicia o loop depois que todos os scripts foram carregados (evita 'cbIn/carcUpd is not defined' no 1o frame) */
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', () => requestAnimationFrame(frame));
  else requestAnimationFrame(frame);
}

/** Atualiza `stableNeed` a partir de outros módulos (as ligações importadas são somente leitura). */
export function setStableNeed(value) {
  stableNeed = value;
  return value;
}

export { frameNo, stableNeed };
