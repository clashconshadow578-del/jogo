/**
 * Névoa física (condensação, vento, deposição nas copas) e alelopatia: aleloquímicos lixiviados das copas viajam com a água e afetam a germinação.
 *
 * Origem: Vale_do_Campo_V64.html (s12)
 */
/* ============ ALELOPATIA: neblina/orvalho/chuva lixiviam aleloquímicos das copas para o solo ============ */

import { GRASS, HN, MH, MW, TREE, TS, VH, VW, WATER } from '../config/constants.js';
import { S, sleeping } from '../core/GameState.js';
import { update } from '../core/GameUpdate.js';
import { ctx } from '../rendering/Canvas.js';
import { drawWeather } from '../rendering/WeatherRenderer.js';
import { toast } from '../ui/Toast.js';
import { pk, upk } from '../utils/compression.js';
import { hash2, smooth } from '../utils/MathUtils.js';
import {
  bio,
  drawHydro,
  elev,
  ev,
  hCnt,
  HX0,
  HX1,
  HY0,
  HY1,
  hydroDaily,
  hydroInit,
  hydroLoad,
  hydroSave,
  hydroStep,
  mato,
  om,
  prox,
  sapl,
  seedAge,
  sm,
  wl,
} from './hydrology/Hydrology.js';
import { shroom } from './Mushrooms.js';
import { drawTree, TREE_M, TREE_SETS, treeModel } from './Trees.js';
import { climate, rainAt, randomDay, windNow } from './WeatherSystem.js';
import { ground, obj } from './World.js';

const AL_POT = { meadow: 0.4, moss: 0.15, orchard: 0.12, flower: 0.25, autumn: 0.9 }; // potência aleloquímica por espécie (outono = tipo nogueira/eucalipto)

const AL_M = new Map();

const AKEY = 'valeDoCampo_alel_v2';
const alel = new Float32Array(HN); // concentração de aleloquímicos por tile (exportada para o empacotamento das instâncias)

// concentração = massa ÷ volume de água; alVol = volume de água do tile no último passo; alM = massa dissolvida; dripF = névoa coletada pela copa
const alVol = new Float32Array(HN),
  alM = new Float32Array(HN),
  alDn = new Float32Array(HN),
  dripF = new Float32Array(HN);

// vizinhança sob a copa: o pingo cai do centro para fora, com peso decrescente
const OFF = [];

const OFF3 = [];

// névoa = água em suspensão no ar (0..1 em cada tile); fogT é o buffer da advecção
const fogW = new Float32Array(HN),
  fogT = new Float32Array(HN);

let _fd = -1,
  _fi = 0,
  _td = -1,
  alMean = 0,
  fogMean = 0,
  fogMax = 0;

function season() {
  return Math.floor((S.day - 1) / 28) % 4;
}

function fogDay() {
  // há neblina hoje? (mais comum no outono e após dias úmidos)
  if (_fd !== S.day) {
    _fd = S.day;
    const ch = [0.55, 0.3, 0.7, 0.5][season()] + (climate.wetness > 0.35 ? 0.25 : 0);
    _fi = randomDay(S.day, 31) < ch ? 0.5 + 0.5 * randomDay(S.day, 32) : 0;
  }
  return _fi;
}

function fogBase() {
  // intensidade da condensação nesta hora: máxima de madrugada, some com o sol
  const h = 6 + S.min / 60;
  if (h >= 12) return 0;
  return (
    fogDay() *
    (1 - smooth(7.2, 9.8, h)) *
    (1 - Math.min(1, climate.rain * 2)) *
    (1 - 0.5 * Math.max(0, Math.min(1, climate.wind - 0.6)))
  );
}

/* ----- NÉVOA FÍSICA: condensação, advecção pelo vento, deposição na copa e no solo ----- */
function fogStep() {
  const fb = fogBase(),
    c = Math.min(0.4, 0.1 + 0.15 * Math.max(0, windNow())); // Courant: fração do ar que avança por passo
  fogT.set(fogW);
  for (let i = 0; i < HN; i++) if (i % MW > 0) fogT[i] = fogW[i] + c * (fogW[i - 1] - fogW[i]); // advecção upwind: o vento empurra a névoa de oeste para leste
  dripF.fill(0);
  let sum = 0,
    n = 0,
    mx = 0;
  for (let y = 1; y < MH - 1; y++)
    for (let x = 1; x < MW - 1; x++) {
      const i = y * MW + x;
      let F = fogT[i];
      if (ground[i] === WATER)
        F = fb * 0.8; // lago: ar frio e úmido sobre a água
      else {
        const low = Math.max(0.25, Math.min(1.6, 1.25 - 0.28 * elev[i] + 0.6 * prox[i] + 0.35 * sm[i])); // ar frio drena para baixadas; perto da água e solo úmido condensa mais
        const T = fb * low;
        F += (T - F) * (T > F ? 0.012 : 0.03); // condensa devagar; o sol dissipa rápido
        if (F > 0.01) {
          if (obj[i] === TREE) {
            // a copa intercepta gotículas e pinga para o entorno
            const v = F * 0.0009;
            F -= v;
            dripF[i] = v;
            for (const o of OFF) {
              const jx = x + o[0],
                jy = y + o[1];
              if (jx < 1 || jy < 1 || jx >= MW - 1 || jy >= MH - 1) continue;
              const j = jy * MW + jx;
              if (ground[j] !== WATER) sm[j] = Math.min(1, sm[j] + v * o[2] * 0.5);
            }
          } else {
            // orvalho no solo: infiltra; se já está encharcado, forma poça
            const d = F * 0.0004 * (1 - sm[i]);
            F -= d;
            sm[i] = Math.min(1, sm[i] + d * 0.8);
            if (sm[i] > 0.85) wl[i] += d * 0.5;
          }
        }
      }
      fogT[i] = Math.max(0, Math.min(1, F));
      if (ground[i] !== WATER) {
        sum += fogT[i];
        n++;
        if (fogT[i] > mx) mx = fogT[i];
      }
    }
  fogW.set(fogT);
  fogMean = n ? sum / n : 0;
  fogMax = mx;
  climate.wetness = Math.min(1, climate.wetness + fogMean * 0.0004); // a névoa molha o chão
}

/* ----- ALELOPATIA FÍSICA: soluto dissolvido na água; viaja com o escoamento, dilui com a água, sorve e degrada ----- */
function alelStep() {
  // 1) massa dissolvida antes deste passo (concentração antiga × volume antigo)
  for (let y = HY0; y < HY1; y++)
    for (let x = HX0; x < HX1; x++) {
      const i = y * MW + x;
      if (ground[i] === WATER) {
        alM[i] = 0;
        alel[i] = 0;
        continue;
      }
      const V = 0.05 + 0.4 * sm[i] + wl[i];
      alM[i] = alel[i] * (alVol[i] || V);
    }
  // 2) pingo das copas: névoa coletada + chuva interceptada deslocam a solução do solo e trazem soluto da folhagem
  alDn.fill(0);
  for (let y = HY0; y < HY1; y++)
    for (let x = HX0; x < HX1; x++) {
      const i = y * MW + x;
      if (obj[i] !== TREE) continue;
      const m = treeModel(x, y),
        p = m && m.alp != null ? m.alp : ((m && AL_M.get(m)) ?? 0.3),
        v = dripF[i] + rainAt(x * TS + 8, y * TS + 8) * 0.0013 * 0.6,
        OFA = m && m.cr >= 2.2 ? OFF3 : OFF;
      if (v <= 0) continue;
      for (const o of OFA) {
        const jx = x + o[0],
          jy = y + o[1];
        if (jx < 1 || jy < 1 || jx >= MW - 1 || jy >= MH - 1) continue;
        const j = jy * MW + jx;
        if (ground[j] === WATER) continue;
        alM[j] += (p * 0.9 - alel[j]) * v * o[2];
      }
    } // mistura: a concentração tende à da água da copa
  // 3) escoamento superficial carrega o soluto morro abaixo, na mesma fração de água que escorre
  for (let y = HY0; y < HY1; y++)
    for (let x = HX0; x < HX1; x++) {
      const i = y * MW + x,
        w = wl[i];
      if (w < 0.003 || ground[i] === WATER) continue;
      const s = ev(i) + w;
      let best = s,
        bj = -1;
      for (let oy = -1; oy <= 1; oy++)
        for (let ox = -1; ox <= 1; ox++) {
          if (!ox && !oy) continue;
          const j = i + oy * MW + ox,
            ns = ev(j) + wl[j] + (ox && oy ? 0.03 : 0);
          if (ns < best) {
            best = ns;
            bj = j;
          }
        }
      if (bj < 0) continue;
      const vf = Math.min(w * 0.5, (s - best) * 0.5),
        out = alM[i] * Math.min(0.5, vf / (0.05 + 0.4 * sm[i] + w));
      alDn[i] -= out;
      alDn[bj] += out;
    }
  for (let y = HY0; y < HY1; y++)
    for (let x = HX0; x < HX1; x++) {
      const i = y * MW + x;
      alM[i] += alDn[i];
    }
  // 4) sorção na matéria orgânica e degradação microbiana (1ª ordem); concentração = massa ÷ volume
  let sum = 0,
    n = 0;
  for (let y = HY0; y < HY1; y++)
    for (let x = HX0; x < HX1; x++) {
      const i = y * MW + x;
      n++;
      if (ground[i] === WATER) {
        alel[i] = 0;
        alVol[i] = 0;
        continue;
      }
      const V = 0.05 + 0.4 * sm[i] + wl[i];
      let M = alM[i] * (1 - (0.00005 + 0.00012 * bio[i]) * (sm[i] > 0.2 ? 1 : 0.4) - Math.min(0.0003, om[i] * 0.0006));
      if (M < 0) M = 0;
      let a = Math.min(1, M / V);
      if (a < 0.001) {
        a = 0;
        M = 0;
      }
      alel[i] = a;
      alVol[i] = V;
      alM[i] = M;
      sum += a;
      bio[i] = Math.max(0, bio[i] - 0.00012 * a); // fauna do solo sofre
      if (seedAge[i] > 0 && a > 0.12) {
        // inibe germinação
        seedAge[i] = Math.max(1, seedAge[i] - 0.2 * (1 + bio[i]) * Math.min(1, a * 1.7));
        if (a > 0.7 && Math.random() < 0.002) seedAge[i] = 0;
      }
    }
  alMean = sum / Math.max(1, n);
}

function alelDaily() {
  // efeitos biológicos acumulados por dia (a degradação já ocorre a cada passo)
  const sg = [1.3, 1, 0.6, 0.05][season()];
  for (let i = 0; i < HN; i++) {
    const a = alel[i];
    if (a < 0.001) continue;
    const k = Math.min(1, a * 1.4);
    if (ground[i] === GRASS) mato[i] *= 1 - 0.38 * k; // inibe o mato
    if (sapl[i] > 0) {
      if (sm[i] > 0.3) sapl[i] = Math.max(0.01, sapl[i] - 0.05 * sg * sm[i] * k); // freia o crescimento da muda
      if (k > 0.8 && sapl[i] < 0.35 && Math.random() < 0.25) sapl[i] = 0;
    }
    if (shroom[i] && a > 0.5 && Math.random() < 0.4) shroom[i] = 0;
  }
}

function alelLoad() {
  try {
    const d = JSON.parse(localStorage.getItem(AKEY) || 'null');
    if (d && d.v === 1) upk(d.a, alel);
  } catch (e) {}
}

// solo contaminado ganha um tom arroxeado-amarronzado

// névoa desenhada a partir do campo físico fogW (interpolado): o que se vê é a água no ar naquele ponto
function fogAt(fx, fy) {
  const x0 = Math.max(0, Math.min(MW - 1, Math.floor(fx))),
    y0 = Math.max(0, Math.min(MH - 1, Math.floor(fy))),
    x1 = Math.min(MW - 1, x0 + 1),
    y1 = Math.min(MH - 1, y0 + 1),
    u = Math.max(0, Math.min(1, fx - x0)),
    v = Math.max(0, Math.min(1, fy - y0));
  return (
    fogW[y0 * MW + x0] * (1 - u) * (1 - v) +
    fogW[y0 * MW + x1] * u * (1 - v) +
    fogW[y1 * MW + x0] * (1 - u) * v +
    fogW[y1 * MW + x1] * u * v
  );
}

// orvalho pingando das copas: taxa segue a névoa realmente coletada naquela copa

// aviso matinal, uma vez por dia

export function initAllelopathy() {
  for (const s in TREE_SETS) for (const n of TREE_SETS[s]) AL_M.set(TREE_M[n], AL_POT[s]);
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++) {
      const d = Math.hypot(dx, dy);
      if (d <= 2.25) OFF.push([dx, dy, Math.max(0, 1 - d * 0.38)]);
    }
  for (let dy = -4; dy <= 4; dy++)
    for (let dx = -4; dx <= 4; dx++) {
      const d = Math.hypot(dx, dy);
      if (d <= 4.3) OFF3.push([dx, dy, Math.max(0, 1 - d * 0.22) * 0.55]);
    } // copas largas (sumaúma/castanheira)
  hydroStep.extend(
    (_hs) =>
      function () {
        _hs.apply(this, arguments);
        fogStep();
        alelStep();
        if (hCnt % 5 === 0) {
          const el = document.getElementById('hydroInfo');
          if (el) el.textContent += ` · Névoa ${Math.round(fogMean * 100)}% · Alelopatia ${Math.round(alMean * 100)}%`;
        }
      },
  );
  hydroDaily.extend(
    (_hd) =>
      function () {
        _hd.apply(this, arguments);
        alelDaily();
      },
  );
  hydroInit.extend(
    (_hi) =>
      function () {
        _hi.apply(this, arguments);
        alel.fill(0);
        alVol.fill(0);
        fogW.fill(0);
        fogT.fill(0);
        _fd = -1;
      },
  );
  hydroSave.extend(
    (_hsv) =>
      function () {
        _hsv.apply(this, arguments);
        try {
          localStorage.setItem(AKEY, JSON.stringify({ v: 1, a: pk(alel) }));
        } catch (e) {}
      },
  );
  hydroLoad.extend(
    (_hl) =>
      function () {
        _hl.apply(this, arguments);
        alelLoad();
      },
  );
  drawHydro.extend(
    (_dh) =>
      function (tx, ty, t) {
        _dh.apply(this, arguments);
        const i = ty * MW + tx,
          a = alel[i];
        if (a > 0.22 && ground[i] !== WATER) {
          ctx.fillStyle = `rgba(104,62,92,${Math.min(0.22, (a - 0.22) * 0.36)})`;
          ctx.fillRect(tx * TS, ty * TS, TS, TS);
        }
      },
  );
  drawWeather.extend(
    (_dw) =>
      function (t, camX, camY) {
        _dw.apply(this, arguments);
        if (fogMax < 0.02) return;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        const C = 8,
          FW = VW / C,
          FH = Math.ceil(VH / C);
        if (!drawWeather.fc) {
          const c = document.createElement('canvas');
          c.width = FW;
          c.height = FH;
          drawWeather.fc = c;
          drawWeather.fx = c.getContext('2d');
          drawWeather.fd = drawWeather.fx.createImageData(FW, FH);
        }
        const D = drawWeather.fd.data;
        let any = false;
        for (let j = 0; j < FH; j++)
          for (let k = 0; k < FW; k++) {
            const f = fogAt((camX + k * C + C / 2) / TS - 0.5, (camY + j * C + C / 2) / TS - 0.5),
              o = (j * FW + k) * 4;
            if (f > 0.02) {
              D[o] = 224;
              D[o + 1] = 234;
              D[o + 2] = 240;
              D[o + 3] = Math.round(Math.min(0.4, f * 0.42) * 255);
              any = true;
            } else D[o + 3] = 0;
          }
        if (any) {
          drawWeather.fx.putImageData(drawWeather.fd, 0, 0);
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(drawWeather.fc, 0, 0, FW * C, FH * C);
        }
        ctx.restore();
      },
  );
  drawTree.extend(
    (_dt) =>
      function (x, y, tx, ty) {
        _dt.apply(this, arguments);
        const f = tx != null && ty != null ? fogW[ty * MW + tx] : fogMean,
          r = climate.rain;
        if (f < 0.15 && r < 0.05) return;
        const m = tx != null && treeModel(tx, ty);
        if (!m || !m.ready) return;
        const t = performance.now() / 1000,
          k = Math.max(f, r);
        ctx.fillStyle = 'rgba(200,222,236,.85)';
        for (let q = 0; q < 3; q++) {
          const ph = (t * (0.5 + 0.3 * k) + q * 0.37 + hash2(tx + q, ty * 3)) % 1,
            px = Math.round(x + (hash2(tx * 5 + q, ty) - 0.5) * m.w * 0.55),
            py = Math.round(y - m.h * 0.3 + ph * m.h * 0.3);
          ctx.fillRect(px, py, 1, 2);
        }
      },
  );
  update.extend(
    (_up2) =>
      function (dt) {
        _up2.apply(this, arguments);
        if (_td !== S.day && !sleeping && fogBase() > 0.3) {
          _td = S.day;
          toast('🌫️ Neblina matinal: as árvores lixiviam aleloquímicos no solo');
        }
      },
  );

  window.fogBase = fogBase;
  window.alResetFog = function () {
    _fd = -1;
  };

  alelLoad();
}

export { alel };
