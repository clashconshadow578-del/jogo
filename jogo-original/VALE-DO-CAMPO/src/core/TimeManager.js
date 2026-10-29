/**
 * Tempo do jogo: minuto absoluto do mundo, posição do sol/lua (direção e comprimento das sombras), fator noturno e o sono (avança o dia, cresce plantações, recupera a grama).
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { DAY_MIN } from '../config/constants.js';
import { S, setSleeping, sleeping } from './GameState.js';
import { save } from './SaveManager.js';
import { fadeEl } from '../ui/dom.js';
import { toast } from '../ui/Toast.js';
import { smooth } from '../utils/MathUtils.js';
import { ecoDaily } from '../world/ecology/TreeEcology.js';
import { recoverGrassDay } from '../world/GrassSystem.js';
import { fvAdvance } from '../world/hydrology/Fluvial.js';
import { hydroAdvance, hydroDaily, nut } from '../world/hydrology/Hydrology.js';
import { shroomDaily } from '../world/Mushrooms.js';
import { climate } from '../world/WeatherSystem.js';
import { crops, wet } from '../world/World.js';
import { clearVitals, VIDA_MAX } from '../systems/Vitals.js';

const worldMin = () => (S.day - 1) * DAY_MIN + S.min;

function sunInfo(h) {
  // Sol nasce à ESQUERDA da tela, passa pelo alto (norte, hemisfério sul) ao meio-dia e se põe à DIREITA.
  // dirX/dirY = direção da SOMBRA no chão (oposta ao sol); shadow = comprimento por px de altura = 1/tan(altura do sol).
  const az = (Math.PI * (h - 6)) / 13,
    day = Math.max(0, Math.sin(az));
  const dx = Math.cos(az),
    dy = 0.14,
    L = Math.hypot(dx, dy); // sol: manhã à esquerda, meio-dia no centro, entardecer à direita; altura fixa no meio da tela
  const alpha = ((4 + 64 * Math.pow(day, 0.85)) * Math.PI) / 180;
  return {
    day,
    az,
    dirX: dx / L,
    dirY: dy / L,
    elevation: Math.max(0.04, day),
    shadow: Math.min(3.2, 1 / Math.tan(alpha)),
    warm: 1 - smooth(0.15, 0.8, day),
  };
}

function dormir(auto) {
  if (sleeping) return;
  setSleeping(true);
  fadeEl.style.opacity = 1;
  setTimeout(() => {
    fvAdvance(Math.max(0, DAY_MIN - S.min));
    S.day++;
    shroomDaily();
    recoverGrassDay();
    S.min = 0;
    S.energy = 100;
    S.vida = VIDA_MAX;
    clearVitals();
    wet.fill(0);
    hydroAdvance(40);
    hydroDaily();
    ecoDaily();
    climate.day = 0;
    climate.rain = 0;
    climate.wetness = Math.max(0, climate.wetness - 0.3);
    for (const k in crops) {
      const c = crops[k];
      if (c.w && c.d < c.need) {
        const nn = nut[+k];
        if (!(nn < 0.25 && Math.random() < 0.5)) {
          c.d++;
          if (nn > 0.75 && c.d < c.need && Math.random() < 0.25) c.d++;
        }
        nut[+k] = Math.max(0.02, nn - 0.05);
      }
      c.w = false;
    }
    save();
    toast(
      auto
        ? (window.NT_WOLF
            ? ((window.NT_WOLF = 0), '🐺 O lobisomem te derrubou! Dia ')
            : window.NT_KILL
              ? (() => {
                  const who = window.NT_KILL;
                  window.NT_KILL = 0;
                  return who + ' te derrubou! Dia ';
                })()
              : 'Você desmaiou de cansaço! Dia ') + S.day
        : 'Bom dia! Dia ' + S.day,
    );
    fadeEl.style.opacity = 0;
    setTimeout(() => {
      setSleeping(false);
    }, 400);
  }, 500);
}

function nightF(h) {
  const n = Math.min(1, Math.max(0, (h - 18.5) / 1.5));
  const m = h < 7 ? 7 - h : 0;
  return Math.max(n, m);
}

export { dormir, nightF, sunInfo, worldMin };
