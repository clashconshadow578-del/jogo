/**
 * Clima persistente por estação: planejamento diário, células de nuvem que se movem com o vento, chuva local, umidade do solo e relâmpagos.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { MH, MW, TS } from '../config/constants.js';
import { gfx } from '../config/settings.js';
import { extensible } from '../core/extensions.js';
import { S, sleeping } from '../core/GameState.js';
import { audioCtx, rainGain, thunder, windGain } from '../systems/audio/WeatherAudio.js';
import { hash2, smooth } from '../utils/MathUtils.js';
import { rr } from '../utils/Random.js';
import { PMUL } from './hydrology/Hydrology.js';
import { crops, wet } from './World.js';

function pMulAt(x, y) {
  const tx = Math.floor(x / TS),
    ty = Math.floor(y / TS);
  return tx >= 0 && ty >= 0 && tx < MW && ty < MH ? PMUL[ty * MW + tx] : 1;
}

/* ============ CLIMA PERSISTENTE, CHUVA E ÁUDIO ============ */
const WEATHER_KEY = 'valeDoCampo_weather_v3';

let climate = {
  day: 0,
  kind: 0,
  start: 0,
  end: 0,
  rain: 0,
  cloud: 0,
  wetness: 0,
  wind: 0.65,
  flash: 0,
  boltWait: 8,
  thunderQueue: [],
  mode: 'auto',
  manualKind: 0,
};

const clouds = [];

function randomDay(d, salt) {
  return hash2(d * 13 + salt, Math.floor(d / 28) + salt * 17);
}

function planWeather() {
  if (climate.mode !== 'auto' || climate.day === S.day) return;
  const season = Math.floor((S.day - 1) / 28) % 4;
  const r = randomDay(S.day, 7),
    chance = [0.36, 0.42, 0.31, 0.26][season];
  climate.kind = r < 0.085 ? 3 : r < chance ? 2 : r < chance + 0.2 ? 1 : 0;
  climate.start = 55 + randomDay(S.day, 8) * 290;
  climate.end = Math.min(1190, climate.start + 260 + randomDay(S.day, 9) * 470);
  climate.wind = 0.35 + randomDay(S.day, 10) * 0.8;
  clouds.length = 0;
  climate.spawnN = 0;
  climate.day = S.day;
  climate.heavy = randomDay(S.day, 12);
  climate.boltWait = 7 + randomDay(S.day, 11) * 9;
  saveWeather();
}

function saveWeather() {
  try {
    localStorage.setItem(WEATHER_KEY, JSON.stringify({ ...climate, thunderQueue: [] }));
  } catch (e) {}
}

// Chuva local: células de nuvem se movem pelo mapa; só chove sob elas
const rainAt = extensible(function rainAt(x, y) {
  let m = 0;
  for (let k = 0; k < clouds.length; k++) {
    const c = clouds[k],
      dx = x - c.x,
      dy = y - c.y,
      q = dx * dx + dy * dy;
    if (q < c.r * c.r) {
      const v = c.pw * c.s * (1 - smooth(c.r * 0.55, c.r, Math.sqrt(q)));
      if (v > m) m = v;
    }
  }
  return m;
});

function cloudCover(x, y) {
  let m = 0;
  for (let k = 0; k < clouds.length; k++) {
    const c = clouds[k],
      R = c.r * 1.7,
      dx = x - c.x,
      dy = y - c.y,
      q = dx * dx + dy * dy;
    if (q < R * R) {
      const v = c.pw * 0.9 * (1 - smooth(c.r * 0.6, R, Math.sqrt(q)));
      if (v > m) m = v;
    }
  }
  return m;
}

function updateClouds(dt, manual) {
  const mk = climate.manualKind,
    min = S.min,
    W = 2400,
    H = 1700,
    lx = S.px - 1200,
    ly = S.py - 850,
    alive = manual ? mk >= 3 : climate.kind >= 2 && min > climate.start - 60 && min < climate.end,
    want = alive ? (manual ? mk - 1 : climate.kind === 3 ? 6 : 5) : 0,
    ms = [0.28, 0.78, 1][Math.max(0, mk - 3)];
  while (clouds.length < want) {
    const r = manual ? rr(150, 240) : rr(130, 230),
      n = (climate.spawnN = (climate.spawnN || 0) + 1);
    let x, y;
    if (manual) {
      if (!clouds.length) {
        x = S.px + rr(-50, 50);
        y = S.py + rr(-30, 30);
      } else {
        x = lx + rr(0, W);
        y = ly + rr(0, H);
      }
    } // manual: 1ª célula sobre o jogador, as outras espalhadas
    else if (!clouds.length && n === 1) {
      x = S.px - rr(260, 420);
      y = S.py + rr(-120, 120);
    } else if (n <= 3) {
      x = lx + rr(0, W);
      y = ly + rr(0, H);
    } else {
      x = lx - r * 1.5;
      y = ly + rr(0, H);
    }
    clouds.push({
      x,
      y,
      r,
      pw: manual ? 0.6 : 0,
      s: manual ? ms : Math.min(1, rr(0.55, 0.85) * (climate.kind === 3 ? 1.25 : 1)),
      vx: (2.5 + climate.wind * 4.5) * rr(0.8, 1.2),
      vy: rr(-2.5, 2.5),
    });
  }
  for (let i = clouds.length - 1; i >= 0; i--) {
    const c = clouds[i],
      on = alive && !(manual && i >= want);
    c.x += c.vx * (windNow() / Math.max(0.05, climate.wind)) * dt;
    c.y += c.vy * dt;
    if (manual && on) c.s = ms;
    c.pw += ((on ? 1 : 0) - c.pw) * Math.min(1, dt * (manual ? 0.4 : 0.08));
    if (c.x > lx + W + c.r * 1.5 || c.x < lx - c.r * 3 || c.y < ly - H * 0.3 || c.y > ly + H * 1.3) {
      c.x = lx - c.r * 1.5;
      c.y = ly + rr(0, H);
    }
    if ((c.y < ly && c.vy < 0) || (c.y > ly + H && c.vy > 0)) c.vy = -c.vy;
    if (!on && c.pw < 0.02) clouds.splice(i, 1);
  }
}

function autoIcon() {
  const r = climate.rain,
    c = climate.cloud;
  return r > 0.45
    ? climate.kind === 3
      ? '⛈️ Tempestade'
      : '🌧️ Chuva'
    : r > 0.08
      ? '🌦️ Garoa'
      : c > 0.3
        ? '⛅ Nuvens'
        : '☀️ Sol';
}

function updateClimate(dt) {
  planWeather();
  const min = S.min,
    manual = climate.mode !== 'auto',
    active = manual ? climate.manualKind >= 3 : climate.kind >= 2 && min >= climate.start && min <= climate.end;
  const edge = manual ? 1 : active ? Math.min(1, (min - climate.start) / 45, (climate.end - min) / 45) : 0;
  const target = active
    ? Math.max(0, edge) *
      (manual
        ? climate.manualKind === 3
          ? 0.28
          : climate.manualKind === 4
            ? 0.78
            : 1
        : climate.kind === 3
          ? 1
          : 0.5 + (climate.heavy || 0) * 0.45)
    : 0;
  climate.gRain = target;
  updateClouds(dt, manual);
  const lt = Math.min(1, rainAt(S.px, S.py));
  climate.rain += (lt - climate.rain) * Math.min(1, dt * 0.5);
  const cloudy = manual
    ? climate.manualKind < 3
      ? [0, 0.32, 0.77][climate.manualKind]
      : Math.max(0.2, cloudCover(S.px, S.py))
    : Math.max(climate.kind === 1 ? 0.45 : 0, cloudCover(S.px, S.py));
  climate.cloud += (cloudy - climate.cloud) * Math.min(1, dt * 0.3);
  climate.wetness = Math.max(0, Math.min(1, climate.wetness + dt * (climate.rain * 0.013 - 0.0015)));
  if (clouds.length) {
    for (const k in crops) {
      const c = crops[k];
      if (c && rainAt((+k % MW) * TS + 8, ((+k / MW) | 0) * TS + 8) > 0.12) {
        c.w = true;
        wet[+k] = 1;
      }
    }
  }
  if ((manual ? climate.manualKind === 5 : climate.kind === 3) && climate.rain > 0.5 && !sleeping) {
    climate.boltWait -= dt;
    if (climate.boltWait <= 0) {
      const strength = 0.45 + Math.random() * 0.55;
      climate.flash = strength;
      climate.thunderQueue.push({ delay: 0.5 + Math.random() * 3, strength });
      climate.boltWait = 9 + Math.random() * 19;
    }
  }
  climate.flash = Math.max(0, climate.flash - dt * 3.6);
  for (let i = climate.thunderQueue.length - 1; i >= 0; i--) {
    const b = climate.thunderQueue[i];
    b.delay -= dt;
    if (b.delay <= 0) {
      thunder(b.strength);
      climate.thunderQueue.splice(i, 1);
    }
  }
  if (audioCtx) {
    const now = audioCtx.currentTime;
    {
      const q = Math.max(0, Math.min(1, (climate.rain - 0.45) / 0.5)),
        n = q * q * (3 - 2 * q);
      rainGain.gain.value = 0;
      windGain.gain.value = 0;
      if (n > 0.2 && Math.random() < dt * (2 + n * 5) * gfx.rainVol * 1.5 && audioCtx.state === 'running') {
        const o = audioCtx.createOscillator(),
          g = audioCtx.createGain(),
          t = audioCtx.currentTime,
          f = 700 + Math.random() * 900;
        o.type = 'sine';
        o.frequency.setValueAtTime(f, t);
        o.frequency.exponentialRampToValueAtTime(f * 1.6, t + 0.07);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.05 * n * (0.4 + Math.random() * 0.6), t + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
        o.connect(g).connect(audioCtx.destination);
        o.start(t);
        o.stop(t + 0.14);
      }
    }
  }
}

function windNow() {
  const t = performance.now() / 1000;
  return climate.wind * (0.8 + 0.3 * Math.sin(t / 6.3) + 0.12 * Math.sin(t / 1.9 + 1));
}

export function installOrographicRain() {
  rainAt.extend(
    (_ra) =>
      function (x, y) {
        const v = _ra(x, y);
        return v > 0 ? v * pMulAt(x, y) : v;
      },
  ); // chuva orografica: mais nas montanhas, menos na planicie
}

export function loadWeather() {
  try {
    const c = JSON.parse(localStorage.getItem(WEATHER_KEY) || 'null');
    if (c) Object.assign(climate, c);
  } catch (e) {}

  if (climate.mode !== 'auto') {
    climate.day = 0;
    climate.clouds = 0;
  } // clima sempre automático (sistema real por estação)

  climate.mode = 'auto';
  climate.manualKind = 0;
}

export { autoIcon, climate, clouds, rainAt, randomDay, saveWeather, updateClimate, windNow };
