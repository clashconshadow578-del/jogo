/**
 * HUD de texto (dia, estação, clima, hora, moedas) e barra de vida/energia.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { S } from '../core/GameState.js';
import { $, hud } from './dom.js';
import { autoIcon, climate } from '../world/WeatherSystem.js';

let hudSig = '';

/* ============ HUD E HOTBAR (DOM) ============ */
function updHUD() {
  const tot = 360 + S.min;
  const hh = Math.floor(tot / 60) % 24,
    mm = Math.floor(tot % 60);
  const season = ['Primavera', 'Verão', 'Outono', 'Inverno'][Math.floor((S.day - 1) / 28) % 4];
  const sig =
    S.day +
    season +
    hh +
    ':' +
    mm +
    S.coins +
    Math.round(S.energy) +
    Math.round(S.vida) +
    climate.kind +
    climate.mode +
    climate.manualKind +
    Math.round(climate.rain * 4) +
    '/' +
    Math.round(climate.cloud * 4);
  if (sig === hudSig) return;
  hudSig = sig;
  hud.innerHTML = `Dia ${S.day} · ${season} · ${climate.mode === 'auto' ? autoIcon() : ['☀️ Sol', '⛅ Parcial', '☁️ Nublado', '🌦️ Garoa', '🌧️ Chuva forte', '⛈️ Tempestade'][climate.manualKind]}<br>${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} · ${S.coins} moedas`;
  try {
    // ❤ vida (o que os animais tiram) e ⚡ estamina (o que correr e agir gastam) são medidores separados
    const v = $('vida'),
      p = Math.max(0, Math.min(100, S.vida));
    v.style.setProperty('--p', p + '%');
    v.querySelector('.t').textContent = '❤ ' + Math.round(p) + '/100';
    v.classList.toggle('low', p < 25);
    const st = $('stam'),
      e = Math.max(0, Math.min(100, S.energy));
    st.style.setProperty('--p', e + '%');
    st.querySelector('.t').textContent = '⚡ ' + Math.round(e) + '/100';
    st.classList.toggle('low', e < 20);
  } catch (e) {}
}

export { updHUD };
