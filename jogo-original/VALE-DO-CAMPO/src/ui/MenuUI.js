/**
 * Menu de opções (iluminação, sombras, resolução, qualidade, efeitos, volumes, novo jogo) e painel de clima.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { gfx, qDrop, setQDrop, storeGraphics } from '../config/settings.js';
import { S } from '../core/GameState.js';
import { newGame } from '../core/NewGame.js';
import { KEY } from '../core/SaveManager.js';
import { applyRes } from '../rendering/Canvas.js';
import { unlockWeatherAudio } from '../systems/audio/WeatherAudio.js';
import { $, joy, lumIn, menu } from './dom.js';
import { toast } from './Toast.js';
import { climate, saveWeather } from '../world/WeatherSystem.js';

/* Painel de clima manual e automático, persistente. */
const WEATHER_CHOICES = [
  ['☀️', 'Ensolarado'],
  ['⛅', 'Parcialmente nublado'],
  ['☁️', 'Nublado'],
  ['🌦️', 'Chuva fraca'],
  ['🌧️', 'Chuva forte'],
  ['⛈️', 'Tempestade'],
  ['🔄', 'Automático'],
];

function refreshWeatherButtons() {
  const target = $('weatherOptions');
  target.innerHTML = WEATHER_CHOICES.map(
    ([icon, name], i) =>
      `<button type="button" data-weather="${i}" class="${(i === 6 ? climate.mode === 'auto' : climate.mode === 'manual' && climate.manualKind === i) ? 'active' : ''}">${icon} ${name}</button>`,
  ).join('');
  $('weatherBtn').textContent = climate.mode === 'auto' ? '⛅' : WEATHER_CHOICES[climate.manualKind][0];
}

export function initMenu() {
  $('weatherBtn').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    unlockWeatherAudio();
    const panel = $('weatherPanel');
    panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
    menu.style.display = 'none';
    refreshWeatherButtons();
  });

  $('weatherOptions').addEventListener('click', (e) => {
    const button = e.target.closest('[data-weather]');
    if (!button) return;
    const i = Number(button.dataset.weather);
    climate.mode = 'auto';
    climate.manualKind = 0;
    saveWeather();
    refreshWeatherButtons();
    toast('Clima: ' + WEATHER_CHOICES[i][1]);
    $('weatherPanel').style.display = 'none';
  });

  refreshWeatherButtons();

  $('menuBtn').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
    $('weatherPanel').style.display = 'none';
  });

  lumIn.addEventListener('input', () => {
    S.lum = +lumIn.value;
  });

  $('resetBtn').addEventListener('click', () => {
    if (confirm('Começar um novo jogo? O progresso salvo será apagado.')) {
      localStorage.removeItem(KEY);
      newGame();
      lumIn.value = S.lum;
      menu.style.display = 'none';
      toast('Novo jogo iniciado');
    }
  });
}

export function initSettingsControls() {
  lumIn.value = S.lum;

  $('resolution').value = gfx.res || 'auto';
  $('resolution').addEventListener('change', (e) => {
    gfx.res = e.target.value;
    applyRes.cap = applyRes.mob ? 2 : 3;
    applyRes();
    storeGraphics();
  });

  $('quality').value = gfx.quality;
  $('shadowQ').value = gfx.sh || 'lite';
  $('shadowQ').addEventListener('change', (e) => {
    gfx.sh = e.target.value;
    storeGraphics();
  });
  $('rays').checked = gfx.rays;
  $('particles').checked = gfx.particles;
  $('chunks').checked = !!gfx.chunks;

  $('quality').addEventListener('change', (e) => {
    gfx.quality = e.target.value;
    setQDrop(0);
    storeGraphics();
  });

  $('rays').addEventListener('change', (e) => {
    gfx.rays = e.target.checked;
    storeGraphics();
  });

  $('chunks').addEventListener('change', (e) => {
    gfx.chunks = e.target.checked;
    storeGraphics();
  });

  $('particles').addEventListener('change', (e) => {
    gfx.particles = e.target.checked;
    storeGraphics();
  });

  $('rainVol').value = gfx.rainVol;
  $('thunderVol').value = gfx.thunderVol;
  $('flashes').checked = gfx.flashes;

  $('rainVol').addEventListener('input', (e) => {
    gfx.rainVol = +e.target.value;
    storeGraphics();
  });

  $('thunderVol').addEventListener('input', (e) => {
    gfx.thunderVol = +e.target.value;
    storeGraphics();
  });

  $('flashes').addEventListener('change', (e) => {
    gfx.flashes = e.target.checked;
    storeGraphics();
  });

  for (const el of [joy, $('btnA'), $('btnB'), $('menuBtn'), $('weatherBtn')])
    el.addEventListener('pointerdown', unlockWeatherAudio, { passive: true });

  addEventListener('keydown', unlockWeatherAudio, { once: true });
}
