/**
 * Correnteza: campo de fluxo que segue o canal do rio, empurra o jogador e anima partículas na água.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { FORD, MH, MW, TS, VH, VW, WATER } from '../../config/constants.js';
import { S } from '../../core/GameState.js';
import { sunInfo } from '../../core/TimeManager.js';
import { ctx } from '../../rendering/Canvas.js';
import { pBlocked } from '../../systems/CollisionSystem.js';
import { toast } from '../../ui/Toast.js';
import { vnoise } from '../../utils/Noise.js';
import { WTc } from './Hydrology.js';
import { INST } from '../Instances.js';
import { wCam, WG, WGH, WGW } from '../WaterSystem.js';
import { climate } from '../WeatherSystem.js';
import { ground } from '../World.js';
import { WORLD } from '../WorldData.js';

/* ============ CORRENTEZA REAL: campo de fluxo que segue o canal do rio ============
   1) Mundo: distância-pelo-canal até a foz (Dijkstra a partir do mar; bacias sem saída drenam para o ponto mais baixo).
   2) Direção = sentido de descida dessa distância (gradiente por mínimos quadrados) => acompanha curvas e meandros.
   3) Velocidade: mais rápida no talvegue (centro), lenta junto às margens (atrito), maior em trechos estreitos
      (continuidade), com poços e corredeiras; lagos quase parados; vau raso e suave; cheia após a chuva.
   O campo é físico: arrasta jogador, animais e peixes, e leva as ondas da superfície rio abaixo. */
let RVD = null;

const FLX = new Float32Array(MW * MH),
  FLY = new Float32Array(MW * MH),
  FLM = new Uint8Array(MW * MH),
  BDF = new Float32Array(MW * MH),
  DEP = new Float32Array(MW * MH); // DEP: profundidade relativa 0..1

let WFX = null,
  WFY = null,
  curQ = 0.8,
  rainSm = 0,
  FQX = 0,
  FQY = 0;
const FLP = [];

function rvWorld() {
  if (RVD) return RVD;
  const N = 1000,
    T = WORLD.T,
    Hh = WORLD.H,
    NN = N * N,
    D = new Float32Array(NN).fill(-1),
    vis = new Uint8Array(NN);
  const isR = (c) => c === 7 || c === 8 || c === 11,
    isS = (c) => c === 0 || c === 1;
  const hk = [],
    hv = []; // heap binário (chave, célula)
  const push = (k, v) => {
    let i = hk.length;
    hk.push(k);
    hv.push(v);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (hk[p] <= k) break;
      hk[i] = hk[p];
      hv[i] = hv[p];
      i = p;
    }
    hk[i] = k;
    hv[i] = v;
  };
  const pop = () => {
    const k0 = hk[0],
      v0 = hv[0],
      k = hk.pop(),
      v = hv.pop(),
      n = hk.length;
    if (n) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && hk[c + 1] < hk[c]) c++;
        if (hk[c] >= k) break;
        hk[i] = hk[c];
        hv[i] = hv[c];
        i = c;
      }
      hk[i] = k;
      hv[i] = v;
    }
    return [k0, v0];
  };
  const DX = [1, -1, 0, 0, 1, 1, -1, -1],
    DY = [0, 0, 1, -1, 1, -1, 1, -1];
  for (let s = 0; s < NN; s++) {
    if (vis[s] || !isR(T[s])) continue;
    const comp = [s];
    vis[s] = 1;
    let seeds = [],
      lo = s;
    for (let h = 0; h < comp.length; h++) {
      const c = comp[h],
        x = c % N,
        y = (c / N) | 0;
      if (Hh[c] < Hh[lo]) lo = c;
      let sea = false;
      for (let k = 0; k < 8; k++) {
        const X = x + DX[k],
          Y = y + DY[k];
        if (X < 0 || Y < 0 || X >= N || Y >= N) continue;
        const j = Y * N + X;
        if (isS(T[j])) sea = true;
        else if (isR(T[j]) && !vis[j]) {
          vis[j] = 1;
          comp.push(j);
        }
      }
      if (sea) seeds.push(c);
    }
    if (!seeds.length) seeds = [lo]; // bacia fechada: escoa para o ponto mais baixo
    for (const c of seeds) {
      D[c] = 0;
      push(0, c);
    }
  }
  while (hk.length) {
    const [d, c] = pop();
    if (d > D[c] + 1e-3) continue;
    const x = c % N,
      y = (c / N) | 0;
    for (let k = 0; k < 8; k++) {
      const X = x + DX[k],
        Y = y + DY[k];
      if (X < 0 || Y < 0 || X >= N || Y >= N) continue;
      const j = Y * N + X;
      if (!isR(T[j])) continue;
      const len = k < 4 ? 1 : 1.414,
        pen = Math.max(0, Hh[c] - Hh[j] - 3) * 0.25,
        nd = d + len + pen; // subir contra o declive custa caro: o rio corre morro abaixo
      if (D[j] < 0 || nd < D[j] - 1e-4) {
        D[j] = nd;
        push(nd, j);
      }
    }
  }
  RVD = D;
  return D;
}

function flowInit() {
  const D = rvWorld(),
    N = 1000,
    wx0 = INST.cx * MW,
    wy0 = INST.cy * MH,
    T = WORLD.T,
    P = 12,
    PW = MW + 2 * P,
    PH = MH + 2 * P;
  FLX.fill(0);
  FLY.fill(0);
  FLM.fill(0);
  BDF.fill(0);
  DEP.fill(0);
  FLP.length = 0;
  // distância às margens (chanfro) em grade com folga, para a largura/profundidade não "quebrarem" na borda da instância
  const dist = new Float32Array(PW * PH);
  for (let py = 0; py < PH; py++)
    for (let px = 0; px < PW; px++) {
      const ix = px - P,
        iy = py - P;
      let w;
      if (ix >= 0 && iy >= 0 && ix < MW && iy < MH) w = ground[iy * MW + ix] === WATER;
      else {
        const X = wx0 + ix,
          Y = wy0 + iy;
        if (X < 0 || Y < 0 || X >= N || Y >= N) w = true;
        else {
          const c = T[Y * N + X];
          w = c === 0 || c === 1 || c === 7 || c === 8;
        }
      }
      dist[py * PW + px] = w ? 1e4 : 0;
    }
  for (let y = 1; y < PH; y++)
    for (let x = 1; x < PW - 1; x++) {
      const i = y * PW + x;
      let d = dist[i];
      if (d === 0) continue;
      d = Math.min(d, dist[i - 1] + 1, dist[i - PW] + 1, dist[i - PW - 1] + 1.414, dist[i - PW + 1] + 1.414);
      dist[i] = d;
    }
  for (let y = PH - 2; y >= 0; y--)
    for (let x = PW - 2; x >= 1; x--) {
      const i = y * PW + x;
      let d = dist[i];
      if (d === 0) continue;
      d = Math.min(d, dist[i + 1] + 1, dist[i + PW] + 1, dist[i + PW + 1] + 1.414, dist[i + PW - 1] + 1.414);
      dist[i] = d;
    }
  const wl = new Float32Array(PW * PH),
    tm = new Float32Array(PW * PH); // largura local = maior distância à margem num raio de 5
  for (let y = 0; y < PH; y++)
    for (let x = 0; x < PW; x++) {
      let m = 0;
      for (let k = -5; k <= 5; k++) {
        const X = x + k;
        if (X >= 0 && X < PW) {
          const v = dist[y * PW + X];
          if (v < 1e3 && v > m) m = v;
        }
      }
      tm[y * PW + x] = m;
    }
  for (let y = 0; y < PH; y++)
    for (let x = 0; x < PW; x++) {
      let m = 0;
      for (let k = -5; k <= 5; k++) {
        const Y = y + k;
        if (Y >= 0 && Y < PH) {
          const v = tm[Y * PW + x];
          if (v > m) m = v;
        }
      }
      wl[y * PW + x] = m;
    }
  for (let y = 0; y < MH; y++)
    for (let x = 0; x < MW; x++) {
      const i = y * MW + x,
        pi = (y + P) * PW + x + P,
        d = Math.min(12, dist[pi] > 1e3 ? 12 : dist[pi]);
      BDF[i] = d;
      if (d <= 0) {
        DEP[i] = 0;
        continue;
      } // fundo: cresce da margem ao centro; canal estreito é fundo no meio, lago/mar só longe da beira
      const r = Math.max(0, Math.min(1, (d - 0.5) / (0.7 * Math.max(1.5, wl[pi])))),
        a = Math.max(0, Math.min(1, (d - 0.5) / 3.5)),
        u = Math.max(r * 0.9, a);
      DEP[i] = u * u * (3 - 2 * u);
    }
  const isR = (c) => c === 7 || c === 8 || c === 11;
  const ux = new Float32Array(MW * MH),
    uy = new Float32Array(MW * MH),
    sp = new Float32Array(MW * MH);
  for (let y = 0; y < MH; y++)
    for (let x = 0; x < MW; x++) {
      const i = y * MW + x,
        cls = WTc[i];
      if (!isR(cls) || !(ground[i] === WATER || ground[i] === FORD)) continue;
      const wx = wx0 + x,
        wy = wy0 + y,
        wi = wy * N + wx,
        D0 = D[wi];
      if (D0 < 0) continue;
      let vx = 0,
        vy = 0;
      for (let oy = -3; oy <= 3; oy++)
        for (let ox = -3; ox <= 3; ox++) {
          if (!ox && !oy) continue;
          const r2 = ox * ox + oy * oy;
          if (r2 > 10) continue;
          const X = wx + ox,
            Y = wy + oy;
          if (X < 0 || Y < 0 || X >= N || Y >= N) continue;
          const j = Y * N + X;
          if (D[j] < 0 || !isR(T[j])) continue;
          const dd = D0 - D[j];
          vx += (dd * ox) / r2;
          vy += (dd * oy) / r2;
        }
      const m = Math.hypot(vx, vy);
      if (m < 1e-3) continue;
      const Wl = wl[(y + P) * PW + x + P],
        d = cls === 11 ? Math.max(1.5, Wl * 0.7) : Math.max(1, BDF[i]);
      const lat = Math.pow(Math.max(0.12, Math.min(1, (d - 0.5) / (0.8 * Math.max(1.2, Wl)))), 0.7); // perfil lateral: atrito nas margens, talvegue no centro
      const nar = Math.max(0.55, Math.min(1.5, 2.4 / Math.sqrt(Wl + 1))); // trecho estreito => água mais rápida
      const pool = 0.85 + 0.3 * vnoise(wx, wy, 7, 9); // poços e corredeiras
      const kind = cls === 8 ? 0.1 : cls === 11 ? 0.55 : 1;
      ux[i] = vx / m;
      uy[i] = vy / m;
      sp[i] = 26 * lat * nar * pool * kind;
      FLM[i] = 1;
    }
  // suaviza a direção (média dos vizinhos de água) para tirar o serrilhado da malha
  for (let y = 1; y < MH - 1; y++)
    for (let x = 1; x < MW - 1; x++) {
      const i = y * MW + x;
      if (!FLM[i]) continue;
      let sx = 0,
        sy = 0,
        n = 0;
      for (let oy = -1; oy <= 1; oy++)
        for (let ox = -1; ox <= 1; ox++) {
          const j = i + oy * MW + ox;
          if (!FLM[j]) continue;
          const w = ox || oy ? 1 : 2;
          sx += ux[j] * w;
          sy += uy[j] * w;
          n += w;
        }
      const m = Math.hypot(sx, sy);
      if (m > 1e-3) {
        FLX[i] = (sx / m) * sp[i];
        FLY[i] = (sy / m) * sp[i];
      }
    }
  for (let i = 0; i < MW * MH; i++) if (FLM[i] && !FLX[i] && !FLY[i]) FLM[i] = 0;
  // grade das ondas (4px): a mesma correnteza, para a superfície escorrer rio abaixo
  if (!WFX || WFX.length !== WGW * WGH) {
    WFX = new Float32Array(WGW * WGH);
    WFY = new Float32Array(WGW * WGH);
  }
  WFX.fill(0);
  WFY.fill(0);
  const q0 = curQ;
  curQ = 1;
  for (let cy = 0; cy < WGH; cy++)
    for (let cx = 0; cx < WGW; cx++) {
      if (!FLM[(cy >> 2) * MW + (cx >> 2)]) continue;
      if (flowAt((cx + 0.5) * WG, (cy + 0.5) * WG) > 0) {
        const k = cy * WGW + cx;
        WFX[k] = FQX;
        WFY[k] = FQY;
      }
    }
  curQ = q0;
}

function flowAt(x, y) {
  // velocidade da água (px/s) no ponto; devolve o módulo e deixa o vetor em FQX/FQY
  FQX = 0;
  FQY = 0;
  if (x < 0 || y < 0 || x >= MW * TS || y >= MH * TS) return 0;
  const ti = Math.floor(y / TS) * MW + Math.floor(x / TS);
  if (!FLM[ti] || (ground[ti] !== WATER && ground[ti] !== FORD)) return 0;
  const gx = x / TS - 0.5,
    gy = y / TS - 0.5,
    x0 = Math.floor(gx),
    y0 = Math.floor(gy),
    fx = gx - x0,
    fy = gy - y0;
  let sx = 0,
    sy = 0,
    sw = 0;
  for (let k = 0; k < 4; k++) {
    const ix = x0 + (k & 1),
      iy = y0 + (k >> 1);
    if (ix < 0 || iy < 0 || ix >= MW || iy >= MH) continue;
    const j = iy * MW + ix;
    if (!FLM[j]) continue;
    const w = (k & 1 ? fx : 1 - fx) * (k >> 1 ? fy : 1 - fy);
    sx += FLX[j] * w;
    sy += FLY[j] * w;
    sw += w;
  }
  if (sw <= 1e-4) return 0;
  FQX = (sx / sw) * curQ;
  FQY = (sy / sw) * curQ;
  return Math.hypot(FQX, FQY);
}

function flowTick(dt) {
  rainSm += ((climate.rain || 0) - rainSm) * Math.min(1, dt / 60); // a vazão sobe devagar depois da chuva e baixa na estiagem
  curQ = 0.8 + 0.9 * Math.min(1, rainSm * 1.2);
  playerCurrent(dt);
  flowParts(dt);
}

let _curToastT = -99;

function playerCurrent(dt) {
  // o rio arrasta o jogador: forte onde é fundo e rápido, quase nada na beira e no vau
  S.curM = 0;
  const tx = Math.floor(S.px / TS),
    ty = Math.floor(S.py / TS);
  if (tx < 0 || ty < 0 || tx >= MW || ty >= MH) return;
  const i = ty * MW + tx,
    g = ground[i];
  let k;
  if (g === WATER && FLM[i]) k = 0.1 + 0.8 * DEP[i];
  else if (g === FORD && FLM[i]) k = 0.2;
  else return;
  const m = flowAt(S.px, S.py);
  if (m < 1) return;
  const vx = FQX * k,
    vy = FQY * k;
  S.curM = Math.hypot(vx, vy);
  const dx = vx * dt,
    dy = vy * dt;
  if (!pBlocked(S.px + dx, S.py)) S.px += dx;
  if (!pBlocked(S.px, S.py + dy)) S.py += dy;
  const mv = (S.vx || 0) * (S.vx || 0) + (S.vy || 0) * (S.vy || 0) > 25;
  if (mv && S.curM > 8) S.energy = Math.max(0, S.energy - (dt * 0.35 * S.curM) / 20); // lutar contra a correnteza cansa
  const now = performance.now() / 1000;
  if (S.curM > 14 && now - _curToastT > 45) {
    _curToastT = now;
    toast('🌊 A correnteza te arrasta! Atravesse pelo vau ou nade com ela.');
  }
}

function flowParts(dt) {
  const cx = wCam.x,
    cy = wCam.y;
  let tries = 0;
  while (FLP.length < 280 && tries++ < 40) {
    const x = cx + Math.random() * VW,
      y = cy + Math.random() * VH,
      m = flowAt(x, y);
    if (m < 4 || Math.random() > Math.min(1, m / 16)) continue;
    FLP.push({
      x,
      y,
      a: 0,
      life: 1.8 + Math.random() * 2,
      ph: Math.random() * 6.283,
      dk: Math.random() < 0.3,
      tr: [[x, y]],
    });
  }
  for (let n = FLP.length - 1; n >= 0; n--) {
    const p = FLP[n];
    p.a += dt;
    const m = flowAt(p.x, p.y);
    if (m < 2 || p.a > p.life || p.x < cx - 24 || p.x > cx + VW + 24 || p.y < cy - 24 || p.y > cy + VH + 24) {
      FLP.splice(n, 1);
      continue;
    }
    const ux = FQX / m,
      uy = FQY / m,
      w = Math.sin(p.a * 2.6 + p.ph) * 0.14 * m,
      vx = FQX - uy * w,
      vy = FQY + ux * w; // leve serpentear lateral
    const lx = p.x,
      ly = p.y;
    p.x += vx * dt;
    p.y += vy * dt;
    const dd = Math.hypot(p.x - lx, p.y - ly),
      steps = Math.max(1, Math.floor(dd));
    for (let s = 1; s <= steps; s++) p.tr.unshift([lx + ((p.x - lx) * s) / steps, ly + ((p.y - ly) * s) / steps]);
    const L = Math.max(6, Math.min(20, Math.round(5 + m * 0.55)));
    if (p.tr.length > L) p.tr.length = L;
  }
}

const FL_PAL = [...Array(8)].map((_, k) => ({
  l: `rgba(228,246,255,${((k + 1) * 0.115).toFixed(3)})`,
  d: `rgba(10,48,108,${((k + 1) * 0.085).toFixed(3)})`,
}));

/* ===== Filetes de espuma/brilho em UM buffer de pixels =====
 * Eram ~3.000 fillRect de 1px por quadro (um por ponto de cada rastro). Agora cada ponto é misturado (mesma conta de
 * transparência "over") num buffer RGBA do tamanho da tela e enviado de uma vez: putImageData + drawImage.
 * Só difere do desenho antigo por arredondamento de 1 nível de cor. O desenho antigo continua em drawFlowPartsSlow. */
const FL_RGB = { l: [228, 246, 255], d: [10, 48, 108] },
  FL_A = [...Array(8)].map((_, k) => ({ l: +((k + 1) * 0.115).toFixed(3), d: +((k + 1) * 0.085).toFixed(3) }));
let flCv = null,
  flG = null,
  flImg = null,
  flBox = null;

function drawFlowParts(t, camX, camY) {
  if (!FLP.length) return;
  if (camX === undefined || camY === undefined) return drawFlowPartsSlow(t);
  if (!flCv) {
    flCv = document.createElement('canvas');
    flCv.width = VW;
    flCv.height = VH;
    flG = flCv.getContext('2d');
    flImg = flG.createImageData(VW, VH);
  }
  const D = flImg.data;
  if (flBox) {
    // apaga só o que foi pintado no quadro anterior
    for (let y = flBox.y0; y <= flBox.y1; y++) D.fill(0, (y * VW + flBox.x0) * 4, (y * VW + flBox.x1 + 1) * 4);
    flG.clearRect(flBox.x0, flBox.y0, flBox.x1 - flBox.x0 + 1, flBox.y1 - flBox.y0 + 1);
    flBox = null;
  }
  const day = sunInfo(6 + S.min / 60).day,
    base = 0.55 + 0.45 * day;
  let bx0 = VW,
    by0 = VH,
    bx1 = -1,
    by1 = -1;
  for (const p of FLP) {
    const L = p.tr.length;
    if (L < 2) continue;
    const fade = Math.min(1, p.a / 0.5, (p.life - p.a) / 0.6);
    if (fade <= 0) continue;
    const rgb = p.dk ? FL_RGB.d : FL_RGB.l;
    for (let k = 0; k < L; k++) {
      const q = p.tr[k],
        X = Math.round(q[0]),
        Y = Math.round(q[1]),
        ti = Math.floor(Y / TS) * MW + Math.floor(X / TS);
      if (ti < 0 || ti >= MW * MH || !FLM[ti] || (ground[ti] !== WATER && ground[ti] !== FORD)) continue;
      const f = 1 - k / L,
        a = Math.min(7, Math.floor(f * f * 8.4 * fade * base));
      if (a < 0) continue;
      const sx = X - camX,
        sy = Y + (p.dk ? 1 : 0) - camY;
      if (sx < 0 || sy < 0 || sx >= VW || sy >= VH) continue;
      const sa = p.dk ? FL_A[a].d : FL_A[a].l,
        o = (sy * VW + sx) * 4,
        A0 = D[o + 3];
      if (A0 === 0) {
        D[o] = rgb[0];
        D[o + 1] = rgb[1];
        D[o + 2] = rgb[2];
        D[o + 3] = sa * 255;
      } else {
        const k0 = (A0 / 255) * (1 - sa),
          oa = sa + k0;
        D[o] = (rgb[0] * sa + D[o] * k0) / oa;
        D[o + 1] = (rgb[1] * sa + D[o + 1] * k0) / oa;
        D[o + 2] = (rgb[2] * sa + D[o + 2] * k0) / oa;
        D[o + 3] = oa * 255;
      }
      if (sx < bx0) bx0 = sx;
      if (sx > bx1) bx1 = sx;
      if (sy < by0) by0 = sy;
      if (sy > by1) by1 = sy;
    }
  }
  if (bx1 < 0) return;
  const w = bx1 - bx0 + 1,
    h = by1 - by0 + 1;
  flG.putImageData(flImg, 0, 0, bx0, by0, w, h);
  ctx.drawImage(flCv, bx0, by0, w, h, camX + bx0, camY + by0, w, h);
  flBox = { x0: bx0, y0: by0, x1: bx1, y1: by1 };
}

function drawFlowPartsSlow(t) {
  // filetes de espuma/brilho que escorrem pelo traçado real do rio (pixel a pixel, nunca em quadrado)
  if (!FLP.length) return;
  const day = sunInfo(6 + S.min / 60).day,
    base = 0.55 + 0.45 * day;
  for (const p of FLP) {
    const L = p.tr.length;
    if (L < 2) continue;
    const fade = Math.min(1, p.a / 0.5, (p.life - p.a) / 0.6);
    if (fade <= 0) continue;
    for (let k = 0; k < L; k++) {
      const q = p.tr[k],
        X = Math.round(q[0]),
        Y = Math.round(q[1]),
        ti = Math.floor(Y / TS) * MW + Math.floor(X / TS);
      if (ti < 0 || ti >= MW * MH || !FLM[ti] || (ground[ti] !== WATER && ground[ti] !== FORD)) continue;
      const f = 1 - k / L,
        a = Math.min(7, Math.floor(f * f * 8.4 * fade * base));
      if (a < 0) continue;
      if (p.dk) {
        ctx.fillStyle = FL_PAL[a].d;
        ctx.fillRect(X, Y + 1, 1, 1);
      } else {
        ctx.fillStyle = FL_PAL[a].l;
        ctx.fillRect(X, Y, 1, 1);
      }
    }
  }
}

/** Atualiza `curQ` a partir de outros módulos (as ligações importadas são somente leitura). */
export function setCurQ(value) {
  curQ = value;
  return value;
}

export {
  BDF,
  DEP,
  FLM,
  FLX,
  FLY,
  FQX,
  FQY,
  WFX,
  WFY,
  curQ,
  drawFlowParts,
  drawFlowPartsSlow,
  flowAt,
  flowInit,
  flowTick,
  rainSm,
  rvWorld,
};
