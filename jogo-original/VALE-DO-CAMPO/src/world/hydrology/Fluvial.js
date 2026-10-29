/**
 * Dinâmica fluvial: meandros, desbarrancamento, deposição de areia, mata ciliar protegendo a margem e planície de inundação.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import {
  BIN,
  DAY_MIN,
  FORD,
  GRASS,
  HN,
  HOUSE,
  MH,
  MW,
  PATH,
  ROCK,
  SAND,
  SOIL,
  STONE,
  TREE,
  TS,
  WATER,
} from '../../config/constants.js';
import { S } from '../../core/GameState.js';
import { setShoreList, shoreList } from '../../entities/cow/Cow.js';
import { faShoreL, faShoreT, setFaShoreL, setFaShoreT } from '../../entities/wild/Fauna.js';
import { ctx } from '../../rendering/Canvas.js';
import { beep } from '../../systems/audio/AudioSystem.js';
import { fishWTt, setFishWTt } from '../../systems/Fishing.js';
import { toast } from '../../ui/Toast.js';
import { rleDec, rleEnc } from '../../utils/compression.js';
import { hash2 } from '../../utils/MathUtils.js';
import { ecoTrees } from '../ecology/TreeEcology.js';
import { grassDirty, setGrassDirty } from '../GrassSystem.js';
import {
  elev,
  ero,
  ev,
  gwt,
  hmod,
  hStat,
  HX0,
  HX1,
  HY0,
  HY1,
  mato,
  nut,
  om,
  sapl,
  seedAge,
  shade,
  sm,
  wearT,
  wl,
  WTc,
} from './Hydrology.js';
import {
  curQ,
  DEP,
  FLM,
  flowAt,
  flowInit,
  FLX,
  FLY,
  FQX,
  FQY,
  rainSm,
  rvWorld,
  setCurQ,
  WFX,
  WFY,
} from './RiverFlow.js';
import { INST } from '../Instances.js';
import { shroom } from '../Mushrooms.js';
import { rRings } from '../RainSystem.js';
import { crowd, treeFree } from '../Vegetation.js';
import { VIL } from '../Village.js';
import { WG, WGH, WGW, wImpulse, wSplash } from '../WaterSystem.js';
import { crops, ground, obj, wet } from '../World.js';
import { WORLD } from '../WorldData.js';

/* ============ DINÂMICA FLUVIAL: meandros, mata ciliar, assoreamento e planície de inundação ============
   1) MEANDROS  — a curvatura do canal (derivada do campo de correnteza) diz onde é a curva EXTERNA e a INTERNA.
                  Fora: água rápida e forte => erosão; a margem racha, vira barranco e desbarranca (terra -> rio).
                  Dentro: água lenta e rasa => deposição; vira banco de areia / praia fluvial (rio -> terra).
                  O sedimento é conservado: o que o rio "cobra" de um lado ele "devolve" do outro.
   2) MATA CILIAR — raízes de árvores (e o mato) amarram o solo: reduzem muito a erosão. Sem elas a margem
                  desmorona, o rio assoreia (fica raso e barrento). A mata se regenera sozinha perto da água.
   3) VÁRZEA    — com chuva forte a vazão sobe e o rio transborda sobre o terreno baixo e plano ao redor: a água perde
                  velocidade, deixa nutrientes, recarrega o lençol. Se a várzea é ocupada (casas, caminhos, represas,
                  margens concretadas) ela não "respira": o nível sobe mais e a cheia vira enchente destrutiva. */
const FV = {
  silt: 0,
  q: 0,
  amp: 1,
  occ: 0,
  armor: 0,
  cover: 0,
  pool: 2.5,
  sev: 0,
  acc: 0,
  dirty: false,
  lastRef: -99,
  tT: {},
  nBk: 0,
  nFl: 0,
  sealedN: 0,
  proneN: 0,
};

const FV_ERO = 0.7,
  FV_DEP = 0.5; // retração (fração de tile por dia de jogo) no pior caso · deposição

let fvBk = new Float32Array(HN),
  fvSd = new Float32Array(HN),
  fvFld = new Float32Array(HN),
  fvTgt = new Float32Array(HN),
  fvDep0 = new Float32Array(HN);

let fvCls = new Uint8Array(HN),
  fvBar = new Uint8Array(HN),
  fvWid = new Uint8Array(HN),
  fvRd = new Uint8Array(HN),
  fvBuilt = new Uint8Array(HN); // fvCls: 1 = virou rio por erosão · 2 = era rio e virou terra

let fvRw = new Uint8Array(HN),
  fvSkw = new Float32Array(HN),
  fvKap = new Float32Array(HN),
  fvOx = new Float32Array(HN),
  fvOy = new Float32Array(HN),
  fvRe = new Float32Array(HN);

let fvBankL = [],
  fvDepL = [],
  fvOrd = [],
  fvRip = [];

const FV8X = [1, -1, 0, 0, 1, 1, -1, -1],
  FV8Y = [0, 0, 1, -1, 1, -1, 1, -1];

const FV_OFF4 = [1, -1, MW, -MW];

function fvToast(key, msg, gap) {
  const n = performance.now() / 1000;
  if (n - (FV.tT[key] || -999) < gap) return;
  FV.tT[key] = n;
  toast(msg);
}

function fvNearPlayer(i, r) {
  const x = (i % MW) * TS + 8,
    y = ((i / MW) | 0) * TS + 8;
  return !S.inside && Math.hypot(x - S.px, y - S.py) < r;
}

function fvReset() {
  fvBk.fill(0);
  fvSd.fill(0);
  fvFld.fill(0);
  fvTgt.fill(0);
  fvCls.fill(0);
  fvBar.fill(0);
  FV.silt = 0;
  FV.q = 0;
  FV.pool = 2.5;
  FV.acc = 0;
  FV.sev = 0;
  FV.dirty = false;
}

/* classe do mundo (tile): atualiza o mapa projetado e a "distância até a foz" para o campo de correnteza seguir o novo canal */
function fvSetWorld(i, c) {
  const N = 1000,
    wx0 = INST.cx * MW,
    wy0 = INST.cy * MH,
    x = i % MW,
    y = (i / MW) | 0,
    wi = (wy0 + y) * N + wx0 + x,
    D = rvWorld();
  let ok = true;
  if (c === 7) {
    let md = 1e9;
    for (let k = 0; k < 8; k++) {
      const X = wx0 + x + FV8X[k],
        Y = wy0 + y + FV8Y[k];
      if (X < 0 || Y < 0 || X >= N || Y >= N) continue;
      const j = Y * N + X,
        t = WORLD.T[j];
      if ((t === 7 || t === 8 || t === 11) && D[j] >= 0 && D[j] < md) md = D[j];
    }
    if (md < 1e9) D[wi] = md + 1;
    else {
      D[wi] = -1;
      ok = false;
    }
  } else D[wi] = -1;
  WORLD.T[wi] = c;
  WTc[i] = c;
  return ok;
}

function fvShade(i) {
  const x = i % MW,
    y = (i / MW) | 0;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const X = x + dx,
        Y = y + dy;
      if (X < 1 || Y < 1 || X >= MW - 1 || Y >= MH - 1) continue;
      const j = Y * MW + X;
      shade[j] = Math.max(-0.5, Math.min(0.5, elev[j + MW + 1] - elev[j - MW - 1]));
    }
}

/* ---- análise do canal: curvatura, lado externo/interno, largura, distância ao rio ---- */
function fvInit() {
  fvSkw.fill(0);
  fvKap.fill(0);
  fvOx.fill(0);
  fvOy.fill(0);
  fvWid.fill(0);
  fvRd.fill(255);
  fvRe.fill(0);
  fvRw.fill(0);
  fvBuilt.fill(0);
  const isW = (i) => ground[i] === WATER || ground[i] === FORD;
  const cx = new Float32Array(HN),
    cy = new Float32Array(HN),
    sx = new Float32Array(HN),
    sy = new Float32Array(HN);
  const samp = (x, y) => {
    const X = Math.round(x),
      Y = Math.round(y);
    if (X < 1 || Y < 1 || X >= MW - 1 || Y >= MH - 1) return -1;
    const j = Y * MW + X;
    return FLM[j] && WTc[j] === 7 && ground[j] === WATER ? j : -1;
  };
  for (let y = 1; y < MH - 1; y++)
    for (let x = 1; x < MW - 1; x++) {
      const i = y * MW + x;
      if (!FLM[i] || WTc[i] !== 7 || ground[i] !== WATER) continue;
      const m = Math.hypot(FLX[i], FLY[i]);
      if (m < 1e-3) continue;
      const ux = FLX[i] / m,
        uy = FLY[i] / m;
      for (const L of [6, 4, 3]) {
        const a = samp(x + ux * L, y + uy * L),
          b = samp(x - ux * L, y - uy * L);
        if (a < 0 || b < 0) continue;
        const ma = Math.hypot(FLX[a], FLY[a]),
          mb = Math.hypot(FLX[b], FLY[b]);
        if (ma < 1e-3 || mb < 1e-3) continue;
        cx[i] = (FLX[a] / ma - FLX[b] / mb) / (2 * L);
        cy[i] = (FLY[a] / ma - FLY[b] / mb) / (2 * L);
        break;
      }
    }
  for (let y = 1; y < MH - 1; y++)
    for (let x = 1; x < MW - 1; x++) {
      const i = y * MW + x;
      if (!FLM[i] || WTc[i] !== 7 || ground[i] !== WATER) continue;
      let ax = 0,
        ay = 0,
        n = 0;
      for (let oy = -2; oy <= 2; oy++)
        for (let ox = -2; ox <= 2; ox++) {
          const X = x + ox,
            Y = y + oy;
          if (X < 0 || Y < 0 || X >= MW || Y >= MH) continue;
          const j = Y * MW + X;
          if (FLM[j] && WTc[j] === 7 && (cx[j] || cy[j])) {
            ax += cx[j];
            ay += cy[j];
            n++;
          }
        }
      if (n >= 3) {
        sx[i] = ax / n;
        sy[i] = ay / n;
      }
    }
  const ray = (x, y, dx, dy) => {
    for (let d = 0.5; d <= 14; d += 0.5) {
      const X = Math.round(x + dx * d),
        Y = Math.round(y + dy * d);
      if (X < 0 || Y < 0 || X >= MW || Y >= MH) return -1;
      if (!isW(Y * MW + X)) return d;
    }
    return 14;
  };
  for (let y = 1; y < MH - 1; y++)
    for (let x = 1; x < MW - 1; x++) {
      const i = y * MW + x;
      if (!FLM[i] || WTc[i] !== 7 || ground[i] !== WATER) continue;
      const m = Math.hypot(FLX[i], FLY[i]);
      if (m < 1e-3) continue;
      const ux = FLX[i] / m,
        uy = FLY[i] / m;
      const w1 = ray(x, y, -uy, ux),
        w2 = ray(x, y, uy, -ux);
      if (w1 >= 0 && w2 >= 0) fvWid[i] = Math.min(255, Math.round(w1 + w2)); // largura medida de margem a margem
      const k = Math.hypot(sx[i], sy[i]);
      if (k < 1e-4) continue;
      fvKap[i] = k;
      fvOx[i] = -sx[i] / k;
      fvOy[i] = -sy[i] / k; // curvatura aponta para o centro da curva; a margem EXTERNA fica do lado oposto
      const dO = ray(x, y, fvOx[i], fvOy[i]),
        dI = ray(x, y, -fvOx[i], -fvOy[i]);
      if (dO < 0 || dI < 0) continue;
      const wgt = Math.min(1, Math.max(0, (k - 0.02) / 0.05));
      fvSkw[i] = ((dI - dO) / Math.max(1, dI + dO)) * wgt;
    } // +1 colado na margem externa · -1 colado na interna
  // correnteza mais forte rente à margem externa e fraca rente à interna (e a grade das ondas acompanha)
  for (let i = 0; i < HN; i++)
    if (FLM[i] && fvSkw[i]) {
      const f = Math.max(0.55, Math.min(1.45, 1 + 0.5 * fvSkw[i]));
      FLX[i] *= f;
      FLY[i] *= f;
    }
  if (WFX) {
    WFX.fill(0);
    WFY.fill(0);
    const q0 = curQ;
    setCurQ(1);
    for (let gy = 0; gy < WGH; gy++)
      for (let gx = 0; gx < WGW; gx++) {
        if (!FLM[(gy >> 2) * MW + (gx >> 2)]) continue;
        if (flowAt((gx + 0.5) * WG, (gy + 0.5) * WG) > 0) {
          const k = gy * WGW + gx;
          WFX[k] = FQX;
          WFY[k] = FQY;
        }
      }
    setCurQ(q0);
  }
  fvDep0.set(DEP);
  fvApplySilt();
  // distância ao rio (BFS) e nível da água do rio mais próximo
  const q = [];
  for (let i = 0; i < HN; i++) {
    if ((ground[i] === WATER && WTc[i] === 7) || ground[i] === FORD) {
      fvRd[i] = 0;
      fvRe[i] = elev[i] + (ground[i] === WATER ? 0.5 : 0);
      fvRw[i] = fvWid[i] || 4;
      q.push(i);
    }
  }
  for (let h = 0; h < q.length; h++) {
    const i = q[h],
      d = fvRd[i];
    if (d >= 14) continue;
    const x = i % MW;
    for (let k = 0; k < 4; k++) {
      if ((k === 0 && x >= MW - 1) || (k === 1 && x <= 0)) continue;
      const j = i + FV_OFF4[k];
      if (j < 0 || j >= HN || fvRd[j] !== 255 || ground[j] === WATER) continue;
      fvRd[j] = d + 1;
      fvRe[j] = fvRe[i];
      fvRw[j] = fvRw[i];
      q.push(j);
    }
  }
  fvOrd = q;
  fvRip = [];
  fvBankL = [];
  fvDepL = [];
  for (const i of q) {
    const d = fvRd[i];
    if (d >= 1 && d <= 4) fvRip.push(i);
  }
  for (let y = 1; y < MH - 1; y++)
    for (let x = 1; x < MW - 1; x++) {
      const i = y * MW + x,
        g = ground[i];
      if (g === WATER && WTc[i] === 7) {
        let land = false;
        for (let k = 0; k < 4; k++) {
          const gg = ground[i + FV_OFF4[k]];
          if (gg !== WATER && gg !== FORD) land = true;
        }
        if (land) fvDepL.push(i);
      } else if (g !== WATER && g !== FORD) {
        for (let k = 0; k < 4; k++) {
          const j = i + FV_OFF4[k];
          if (ground[j] === WATER && WTc[j] === 7) {
            fvBankL.push(i);
            break;
          }
        }
      }
    }
  fvMarkBuilt();
  FV.dirty = false;
}

function fvMarkBuilt() {
  // quintal das casas (e das vilas): terreno alto e já ocupado, não desbarranca nem alaga
  fvBuilt.fill(0);
  for (let y = 0; y < MH; y++)
    for (let x = 0; x < MW; x++) {
      if (obj[y * MW + x] !== HOUSE) continue;
      for (let dy = -3; dy <= 3; dy++)
        for (let dx = -3; dx <= 3; dx++) {
          const X = x + dx,
            Y = y + dy;
          if (X >= 0 && Y >= 0 && X < MW && Y < MH) fvBuilt[Y * MW + X] = 1;
        }
    }
  if (INST.vilAct && typeof VIL !== 'undefined')
    for (const v of VIL)
      for (let dy = -2; dy <= 7; dy++)
        for (let dx = -2; dx <= 11; dx++) {
          const X = v.x + dx,
            Y = v.y + dy;
          if (X >= 0 && Y >= 0 && X < MW && Y < MH) fvBuilt[Y * MW + X] = 1;
        }
}

function fvApplySilt() {
  const k = 1 - 0.5 * FV.silt;
  for (let i = 0; i < HN; i++) if (FLM[i] && ground[i] === WATER) DEP[i] = fvDep0[i] * k;
} // rio assoreado = mais raso

/* recalcula o campo de correnteza depois de uma mudança no leito */
function fvRefresh() {
  flowInit();
  fvInit();
  FV.lastRef = performance.now() / 1000;
  setGrassDirty(true);
  try {
    setShoreList(null);
    setFaShoreL([]);
    setFaShoreT(-99);
    setFishWTt(-99);
  } catch (e) {}
}

/* ---- salvar/carregar: o chão já é salvo; aqui vão as marcas de "virou rio / virou terra", as barras de areia e o assoreamento ---- */
function fvPack() {
  return { c: rleEnc(fvCls), b: rleEnc(fvBar), s: +FV.silt.toFixed(3), p: +FV.pool.toFixed(2) };
}

function fvApply(d) {
  if (!d) return;
  try {
    if (d.c) fvCls.set(rleDec(d.c, HN));
    if (d.b) fvBar.set(rleDec(d.b, HN));
    FV.silt = d.s || 0;
    FV.pool = d.p == null ? 2.5 : d.p;
    let pend = [];
    for (let i = 0; i < HN; i++) {
      const c = fvCls[i];
      if (c === 2 && ground[i] !== WATER) fvSetWorld(i, ground[i] === SAND ? 2 : 3);
      else if (c === 1 && ground[i] === WATER) pend.push(i);
      else if (c === 1 || c === 2) {
        if (ground[i] === WATER && c === 2) {
          pend.push(i);
          fvCls[i] = 1;
        }
      }
    }
    for (let pass = 0; pass < 8 && pend.length; pass++) {
      const left = [];
      for (const i of pend) if (!fvSetWorld(i, 7)) left.push(i);
      if (left.length === pend.length) break;
      pend = left;
    }
    fvRefresh();
  } catch (e) {
    console.error('fvApply', e);
  }
}

/* ---- proteção da margem pelas raízes (mata ciliar) ---- */
function fvProt(i) {
  const x = i % MW,
    y = (i / MW) | 0;
  let p = 0;
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++) {
      const X = x + dx,
        Y = y + dy;
      if (X < 0 || Y < 0 || X >= MW || Y >= MH) continue;
      const j = Y * MW + X,
        d = Math.max(Math.abs(dx), Math.abs(dy));
      if (obj[j] === TREE) {
        const a = ecoTrees.get(j),
          r = a ? Math.min(1, 0.25 + (a.tamanhoRaiz || 1) / 3) : 0.5;
        p += r * (d === 0 ? 0.8 : d === 1 ? 0.4 : 0.18);
      } else if (sapl[j] > 0.3) p += 0.08 * (d < 2 ? 1 : 0.5);
    }
  return Math.min(1, p + (mato[i] / 255) * 0.25);
}

function fvSoil(i) {
  const g = ground[i];
  let f = g === GRASS ? 1 : g === SOIL ? 0.9 : g === SAND ? 1.8 : 0;
  if (!f || fvBuilt[i]) return 0; // caminho, pedra, vau e cascalho não cedem
  const o = obj[i];
  if (o === HOUSE || o === BIN) return 0;
  if (o === ROCK) f *= 0.15;
  if (hmod[i] === 1) f *= 0.05;
  return f;
}

/* ---- desbarrancamento: terra vira rio ---- */
function fvCollapse(i, quiet) {
  const x = i % MW,
    y = (i / MW) | 0,
    prot = fvProt(i),
    hadTree = obj[i] === TREE;
  ground[i] = WATER;
  obj[i] = 0;
  delete crops[i];
  sapl[i] = 0;
  seedAge[i] = 0;
  wl[i] = 0;
  fvFld[i] = 0;
  hmod[i] = 0;
  mato[i] = 0;
  shroom[i] = 0;
  wet[i] = 0;
  ero[i] = 0;
  fvBk[i] = 0;
  fvSd[i] = 0;
  fvBar[i] = 0;
  elev[i] -= 0.5;
  if (ecoTrees.has(i)) ecoTrees.delete(i);
  fvCls[i] = fvCls[i] === 2 ? 0 : 1;
  fvSetWorld(i, 7);
  fvShade(i);
  for (let k = 0; k < 8; k++) {
    const X = x + FV8X[k],
      Y = y + FV8Y[k];
    if (X >= 0 && Y >= 0 && X < MW && Y < MH) fvBk[Y * MW + X] *= 0.6;
  }
  FV.pool = Math.min(8, FV.pool + 1);
  FV.silt = Math.min(1, FV.silt + 0.02 + 0.07 * (1 - prot));
  FV.dirty = true;
  if (!quiet && fvNearPlayer(i, 260)) {
    const px = x * TS + 8,
      py = y * TS + 8;
    try {
      wImpulse(px, py, -1.2, 3);
      wSplash(px, py, 4, 0.8);
      rRings.push({ x: px, y: py, t: 0, w: 1.4, wat: 1 });
      beep(80, 0.25, 'triangle');
    } catch (e) {}
    fvToast(
      'col',
      hadTree
        ? '🌳 A margem desabou e levou uma árvore! Sem raízes, o rio come a terra.'
        : '🌊 A correnteza desbarrancou a margem (lado externo da curva).',
      25,
    );
  }
}

/* ---- deposição: rio vira banco de areia / praia fluvial ---- */
function fvDeposit(i, quiet) {
  const x = i % MW,
    y = (i / MW) | 0;
  ground[i] = SAND;
  obj[i] = 0;
  wl[i] = 0;
  fvFld[i] = 0;
  elev[i] += 0.5;
  fvSd[i] = 0;
  fvBar[i] = 1;
  fvBk[i] = 0;
  fvCls[i] = fvCls[i] === 1 ? 0 : 2;
  fvSetWorld(i, 2);
  fvShade(i);
  for (let k = 0; k < 8; k++) {
    const X = x + FV8X[k],
      Y = y + FV8Y[k];
    if (X >= 0 && Y >= 0 && X < MW && Y < MH) fvSd[Y * MW + X] *= 0.5;
  }
  FV.pool = Math.max(0, FV.pool - 1);
  FV.dirty = true;
  if (!quiet && fvNearPlayer(i, 200))
    fvToast('dep', '🏖️ Na curva interna a água corre devagar e deposita areia: nasce uma praia fluvial.', 60);
}

/* ---- passo principal (dt em segundos de jogo) ---- */
function fvStep(dt, quiet) {
  if (!fvOrd.length) return;
  if ((FV.bc = (FV.bc || 0) + 1) % 20 === 1) fvMarkBuilt();
  const dayF = dt / DAY_MIN,
    dtk = Math.min(12, dt / 5),
    season = Math.floor((S.day - 1) / 28) % 4;
  // vazão: sobe depressa com a chuva, desce devagar; solo/lençol saturados aumentam a resposta
  const sat = (typeof hStat === 'object' && hStat.gw) || 0.3,
    tg = Math.max(0, Math.min(1.2, (rainSm - 0.2) * 1.4 + (rainSm > 0.05 ? Math.max(0, sat - 0.45) * 0.4 : 0)));
  FV.q += (tg - FV.q) * (1 - Math.exp(-dt / (tg > FV.q ? 70 : 220)));
  // mata ciliar (cobertura de árvores na faixa de 1..3 tiles) e ocupação da várzea
  let plant = 0,
    trees = 0,
    bare = 0;
  for (const i of fvRip) {
    if (fvRd[i] > 3) continue;
    const o = obj[i];
    if (o === TREE || sapl[i] > 0.3) {
      trees++;
      plant++;
    } else if (ground[i] === GRASS && !o) {
      plant++;
      if (mato[i] < 40) bare++;
    }
  }
  FV.cover = plant ? Math.min(1, trees / plant / 0.4) : 0;
  let prone = 0,
    sealed = 0;
  for (const i of fvOrd) {
    const rd = fvRd[i];
    if (rd < 1 || rd > 10) continue;
    if (fvRe[i] + 0.9 - elev[i] > 0) {
      prone++;
      const g = ground[i];
      if (g === PATH || g === STONE || obj[i] === HOUSE || obj[i] === BIN || hmod[i] === 1) sealed++;
    }
  }
  FV.proneN = prone;
  FV.sealedN = sealed;
  FV.occ = prone > 30 ? sealed / prone : 0;
  let arm = 0;
  for (const i of fvBankL) {
    if (ground[i] === STONE || hmod[i] === 1 || obj[i] === HOUSE) arm++;
  }
  FV.armor = fvBankL.length ? arm / fvBankL.length : 0;
  FV.amp = 1 + 2 * Math.min(0.5, FV.occ) + Math.min(0.5, FV.armor); // sem espaço para espalhar, a água sobe mais
  FV.sev = FV.q * FV.amp;
  // ---- cheia: transbordamento sobre a várzea (só avança por tiles conectados ao rio e mais baixos que o nível da cheia) ----
  const H = FV.q * FV.amp,
    R = 3 + 8 * Math.min(1, H);
  for (const i of fvOrd) fvTgt[i] = 0;
  if (H > 0.06)
    for (const i of fvOrd) {
      const rd = fvRd[i],
        Rl = R * Math.max(0.35, Math.min(1, 0.3 + fvRw[i] / 9));
      if (rd < 1 || rd > Rl || fvBuilt[i]) continue;
      const x = i % MW;
      let con = false;
      for (let k = 0; k < 4; k++) {
        if ((k === 0 && x >= MW - 1) || (k === 1 && x <= 0)) continue;
        const j = i + FV_OFF4[k];
        if (j < 0 || j >= HN) continue;
        if (fvRd[j] < rd && (fvRd[j] === 0 || fvTgt[j] > 0.03)) {
          con = true;
          break;
        }
      }
      if (!con) continue;
      const d = fvRe[i] + H * (1 - rd / (Rl + 1)) - ev(i);
      if (d > 0.03) fvTgt[i] = Math.min(0.55, 0.06 + d * 0.9);
    }
  const kUp = 1 - Math.pow(0.55, dtk),
    kDn = 1 - Math.pow(0.88, dtk);
  let nFl = 0,
    washed = 0,
    fertil = 0;
  const win = (i) => {
    const x = i % MW,
      y = (i / MW) | 0;
    return x >= HX0 && x < HX1 && y >= HY0 && y < HY1;
  };
  for (const i of fvOrd) {
    if (fvRd[i] < 1) continue;
    const t = fvTgt[i],
      f = fvFld[i];
    let nf = f + (t - f) * (t > f ? kUp : kDn);
    if (nf < 0.012) nf = 0;
    fvFld[i] = nf;
    if (nf > 0) {
      nFl++;
      if (!win(i)) wl[i] = nf;
      if (nf > 0.05) {
        nut[i] = Math.min(1, nut[i] + 0.0035 * dtk * (0.5 + nf));
        om[i] = Math.min(1, om[i] + 0.0006 * dtk);
        sm[i] = Math.min(1, sm[i] + 0.05);
        gwt[i] = Math.min(1, gwt[i] + 0.012 * dtk);
        fertil++; // aluvião: terra fértil e lençol recarregado
        if (FV.sev > 1 && nf > 0.25) {
          if (crops[i]) {
            delete crops[i];
            washed++;
          }
          if (ground[i] === PATH && Math.random() < 0.03) ero[i] = Math.min(0.6, ero[i] + 0.04);
        }
      }
    } else if (f > 0 && !win(i)) wl[i] = 0;
  }
  FV.nFl = nFl;
  if (!quiet) {
    if (washed)
      fvToast(
        'wash',
        '⚠️ Enchente destrutiva! A várzea ocupada não tem por onde "respirar" e a água levou lavouras.',
        40,
      );
    else if (FV.sev > 1 && nFl > 25)
      fvToast('flood2', '⚠️ Enchente forte! Casas, caminhos e represas na várzea fazem o nível do rio subir.', 60);
    else if (fertil > 25)
      fvToast('flood', '🌾 O rio transbordou na várzea: a cheia deixa nutrientes na terra e recarrega o lençol.', 150);
  }
  // ---- meandros: erosão (curva externa) com proteção das raízes ----
  const col = [];
  let nBk = 0;
  for (const i of fvBankL) {
    const sf = fvSoil(i);
    if (!sf) {
      fvBk[i] = 0;
      continue;
    }
    let P = 0;
    for (let k = 0; k < 4; k++) {
      const j = i + FV_OFF4[k];
      if (j < 0 || j >= HN || ground[j] !== WATER || WTc[j] !== 7 || !FLM[j]) continue;
      const ox = FV_OFF4[k] === 1 ? 1 : FV_OFF4[k] === -1 ? -1 : 0,
        oy = FV_OFF4[k] === MW ? 1 : FV_OFF4[k] === -MW ? -1 : 0,
        align = -ox * fvOx[j] - oy * fvOy[j]; // direção água->margem x direção "para fora" da curva
      const sp = (Math.hypot(FLX[j], FLY[j]) / 26) * curQ,
        wf = Math.max(0.3, Math.min(1, fvWid[j] / 4)),
        outer = Math.max(0, align) * Math.min(1, Math.max(0, (fvKap[j] - 0.02) / 0.05));
      const p = (outer * (0.3 + 0.7 * Math.max(0, fvSkw[j])) * sp + FV.q * 0.3 * sp * (align > -0.5 ? 1 : 0.4)) * wf;
      if (p > P) P = p;
    }
    if (P < 0.001) {
      fvBk[i] = Math.max(0, fvBk[i] - dayF * 0.5);
      continue;
    }
    const prot = fvProt(i);
    fvBk[i] = Math.max(0, fvBk[i] + P * sf * (1 - 0.9 * prot) * FV_ERO * dayF - (prot > 0.5 ? dayF * 0.15 : 0));
    if (fvBk[i] > 0.6) nBk++;
    if (fvBk[i] >= 1) col.push(i);
  }
  FV.nBk = nBk;
  col.sort((a, b) => fvBk[b] - fvBk[a]);
  let nc = 0;
  for (const i of col) {
    if (nc >= (quiet ? 6 : 2)) break;
    const x = i % MW,
      y = (i / MW) | 0;
    if (x < 3 || y < 3 || x >= MW - 3 || y >= MH - 3) continue;
    if (!treeFree(i)) continue;
    fvCollapse(i, quiet);
    nc++;
  }
  // ---- meandros: deposição (curva interna / remansos rasos) ----
  let nd = 0;
  for (const i of fvDepL) {
    if (ground[i] !== WATER || WTc[i] !== 7) continue;
    const wid = fvWid[i];
    if (wid < 6) {
      fvSd[i] = Math.max(0, fvSd[i] - dayF * 0.3);
      continue;
    }
    const sp = Math.hypot(FLX[i], FLY[i]) / 26,
      inner = fvSkw[i] < -0.15 && fvKap[i] > 0.02;
    if (!(inner || sp < 0.28) || fvDep0[i] > 0.6) {
      fvSd[i] = Math.max(0, fvSd[i] - dayF * 0.3);
      continue;
    }
    const r =
      FV_DEP * (1 - Math.min(1, sp)) * (0.4 + 1.2 * FV.silt + 0.5 * FV.q) * (0.25 + 0.75 * Math.min(1, FV.pool / 2));
    fvSd[i] += r * dayF;
    if (fvSd[i] >= 1 && FV.pool >= 0.5 && nd < (quiet ? 4 : 1)) {
      const x = i % MW,
        y = (i / MW) | 0;
      if (x < 4 || y < 4 || x >= MW - 4 || y >= MH - 4 || !treeFree(i)) continue;
      let ford = false;
      for (let k = 0; k < 8; k++) if (ground[i + FV8X[k] + FV8Y[k] * MW] === FORD) ford = true;
      if (ford) continue;
      fvDeposit(i, quiet);
      nd++;
    }
  }
  FV.pool = Math.min(6, FV.pool + dayF * 0.15); // reposição lenta vinda de montante
  // ---- assoreamento: margem sem mata + chuva/cheia = rio barrento; mata ciliar filtra e limpa ----
  FV.silt = Math.max(
    0,
    Math.min(
      1,
      FV.silt +
        dayF *
          ((1 - FV.cover) * (0.3 * rainSm + 0.7 * FV.q) +
            (FV.sev > 1 ? 0.2 : 0) -
            (0.1 + 0.35 * FV.cover + 0.2 * FV.q)),
    ),
  );
  // ---- regeneração natural da mata ciliar (sementes trazidas pela água e pela fauna) ----
  if (fvRip.length && season !== 3) {
    const sf = [1.2, 1, 0.8][season];
    for (let n = 0; n < 10; n++) {
      const i = fvRip[(Math.random() * fvRip.length) | 0];
      if (
        ground[i] !== GRASS ||
        obj[i] ||
        crops[i] ||
        sapl[i] ||
        seedAge[i] ||
        fvBuilt[i] ||
        fvFld[i] > 0.02 ||
        wearT[i] > 0.12 ||
        sm[i] < 0.35
      )
        continue;
      const x = i % MW,
        y = (i / MW) | 0;
      if (x < 3 || y < 3 || x >= MW - 3 || y >= MH - 3) continue;
      let near = 0,
        bad = false;
      for (let dy = -2; dy <= 2 && !bad; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const X = x + dx,
            Y = y + dy;
          if (X < 0 || Y < 0 || X >= MW || Y >= MH) continue;
          const j = Y * MW + X,
            g = ground[j];
          if (g === PATH || g === SOIL || g === STONE || crops[j]) {
            bad = true;
            break;
          }
          if (obj[j] === TREE) near++;
        }
      if (bad) continue;
      const dens = fvRd[i] <= 2 ? 0.5 : fvRd[i] === 3 ? 0.38 : 0.25;
      if (near / 24 < dens * 0.7 && Math.random() < 0.003 * sf * (0.4 + nut[i]) * (dt / 5 > 1 ? 1 : dt / 5))
        seedAge[i] = 1;
    }
  }
  if (FV.dirty && (quiet || performance.now() / 1000 - FV.lastRef > 2.5)) fvRefresh();
  if (Math.abs(FV.silt - (FV._sA || 0)) > 0.04) {
    FV._sA = FV.silt;
    fvApplySilt();
  }
}

function fvTick(dt) {
  FV.acc += dt;
  if (FV.acc >= 5) {
    const d = Math.min(FV.acc, 30);
    FV.acc = 0;
    fvStep(d, false);
  }
}

function fvAdvance(sec) {
  // dormir / voltar a uma instância: o rio continua trabalhando
  sec = Math.max(0, Math.min(sec, DAY_MIN * 5));
  if (sec < 5) return;
  while (sec > 0) {
    const d = Math.min(sec, 60);
    fvStep(d, true);
    sec -= d;
  }
  if (FV.dirty) fvRefresh();
  fvApplySilt();
}

function fvDaily() {
  // bancos de areia velhos são colonizados pela vegetação (sucessão): só os que não encostam mais na água
  let ch = false;
  for (let i = 0; i < HN; i++) {
    if (!fvBar[i]) continue;
    if (ground[i] !== SAND) {
      fvBar[i] = 0;
      continue;
    }
    if (fvBar[i] < 250) fvBar[i]++;
    if (fvBar[i] >= 8) {
      let wet4 = false;
      for (let k = 0; k < 4; k++) {
        const g = ground[i + FV_OFF4[k]];
        if (g === WATER || g === FORD) wet4 = true;
      }
      if (!wet4 && sm[i] > 0.3) {
        ground[i] = GRASS;
        mato[i] = 0;
        nut[i] = Math.max(nut[i], 0.6);
        fvBar[i] = 0;
        if (fvCls[i] === 2) fvSetWorld(i, 3);
        ch = true;
      }
    }
  }
  if (ch) setGrassDirty(true);
}

function fvSeedRiparian() {
  // mundo novo: já nasce com mata ciliar (mais densa junto à água)
  let n = 0;
  for (const i of fvRip) {
    if (ground[i] !== GRASS || obj[i] || crops[i] || fvBuilt[i]) continue;
    const x = i % MW,
      y = (i / MW) | 0;
    if (x < 3 || y < 3 || x >= MW - 3 || y >= MH - 3) continue;
    if (Math.hypot(x * TS + 8 - S.px, y * TS + 8 - S.py) < TS * 5) continue;
    let bad = false;
    for (let dy = -2; dy <= 2 && !bad; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const X = x + dx,
          Y = y + dy;
        if (X < 0 || Y < 0 || X >= MW || Y >= MH) continue;
        const g = ground[Y * MW + X];
        if (g === PATH || g === STONE || g === SOIL || g === FORD) {
          bad = true;
          break;
        }
      }
    if (bad) continue;
    const rd = fvRd[i],
      dens = rd <= 1 ? 0.5 : rd === 2 ? 0.42 : rd === 3 ? 0.3 : 0.18;
    if (Math.random() > dens * 0.55 || crowd(i) > 1) continue;
    obj[i] = TREE;
    n++;
  }
  return n;
}

function fvChopWarn(i) {
  if (i != null && fvRd[i] >= 1 && fvRd[i] <= 4)
    fvToast('chop', '🌳 Era mata ciliar: sem as raízes essa margem fica frágil e o rio assoreia.', 60);
}

function fvPlantHint(i) {
  if (fvRd[i] >= 1 && fvRd[i] <= 4)
    fvToast('plant', '🌱 Mata ciliar! As raízes vão amarrar a margem e segurar a erosão.', 60);
}

function fvInfo() {
  return ` · Cheia ${Math.round(Math.min(1.5, FV.sev) * 100)}% · Várzea ocupada ${Math.round(FV.occ * 100)}% · Mata ciliar ${Math.round(FV.cover * 100)}% · Assoreamento ${Math.round(FV.silt * 100)}% · Barrancos ${FV.nBk}`;
}

/* ---- desenho: água barrenta, barranco rachando, areia se acumulando, lama da cheia ---- */
function fvDraw(i, tx, ty, x, y, g) {
  if (g === WATER) {
    if (WTc[i] !== 7) return;
    if (FV.silt > 0.04) {
      ctx.fillStyle = `rgba(186,130,64,${Math.min(0.68, FV.silt * 0.95).toFixed(2)})`;
      ctx.fillRect(x, y, TS, TS);
    }
    const s = fvSd[i];
    if (s > 0.2) {
      const n = Math.min(6, 2 + Math.floor(s * 5));
      ctx.fillStyle = `rgba(226,205,142,${Math.min(0.75, 0.25 + s * 0.5).toFixed(2)})`;
      for (let k = 0; k < n; k++) {
        const r = hash2(tx * 7 + k * 3, ty * 5 + k);
        ctx.fillRect(
          x + 1 + Math.floor(r * 12),
          y + 1 + Math.floor(hash2(k + tx * 2, ty * 9) * 12),
          2 + (k & 1),
          1 + ((k >> 1) & 1),
        );
      }
    }
    return;
  }
  if (fvFld[i] > 0.03 && FV.silt > 0.08) {
    ctx.fillStyle = `rgba(140,98,52,${Math.min(0.28, FV.silt * 0.35).toFixed(2)})`;
    ctx.fillRect(x, y, TS, TS);
  } // água da cheia carrega lama
  if (g === SAND && fvBar[i] > 0 && fvBar[i] < 3) {
    ctx.fillStyle = 'rgba(255,243,200,.18)';
    ctx.fillRect(x, y, TS, TS);
  } // areia recém-depositada, clara e úmida
}

function fvBankFX(tx, ty) {
  // desenhado POR CIMA da borda da água: corte de terra nua, rachaduras e torrões caindo no rio
  const i = ty * MW + tx,
    b = fvBk[i],
    g = ground[i];
  if (b < 0.2 || g === WATER || g === FORD) return;
  const a = Math.min(1, (b - 0.2) / 0.8),
    x = tx * TS,
    y = ty * TS,
    th = 1 + Math.round(a * 3),
    C = ['#6e4a2c', '#8a5f38', '#5a3a22', '#7a5230'];
  for (let side = 0; side < 4; side++) {
    const j = i + FV_OFF4[side];
    if (ground[j] !== WATER) continue;
    for (let p = 0; p < TS; p++) {
      const h = hash2(tx * 16 + p + side * 7, ty * 11 + side),
        t = th + (h < 0.4 ? 1 : 0) - (h > 0.85 ? 1 : 0);
      if (t <= 0) continue;
      ctx.fillStyle = C[(h * 4) | 0];
      if (side === 0) ctx.fillRect(x + TS - t, y + p, t, 1);
      else if (side === 1) ctx.fillRect(x, y + p, t, 1);
      else if (side === 2) ctx.fillRect(x + p, y + TS - t, 1, t);
      else ctx.fillRect(x + p, y, 1, t);
    }
    if (a > 0.4) {
      ctx.fillStyle = 'rgba(38,24,12,.55)';
      for (let p = 1; p < TS - 1; p += 2) {
        if (hash2(tx * 3 + p, ty * 5 + side) < 0.45) continue;
        if (side === 0) ctx.fillRect(x + TS - th - 2, y + p, 1, 2);
        else if (side === 1) ctx.fillRect(x + th + 1, y + p, 1, 2);
        else if (side === 2) ctx.fillRect(x + p, y + TS - th - 2, 2, 1);
        else ctx.fillRect(x + p, y + th + 1, 2, 1);
      }
    } // rachaduras paralelas à margem
    if (a > 0.7) {
      ctx.fillStyle = 'rgba(96,66,40,.75)';
      for (let k = 0; k < 2; k++) {
        const p = 2 + Math.floor(hash2(tx * 9 + k, ty * 13 + side) * 11); // torrões já caindo na água
        if (side === 0) ctx.fillRect(x + TS + 1 + k, y + p, 2, 2);
        else if (side === 1) ctx.fillRect(x - 3 - k, y + p, 2, 2);
        else if (side === 2) ctx.fillRect(x + p, y + TS + 1 + k, 2, 2);
        else ctx.fillRect(x + p, y - 3 - k, 2, 2);
      }
    }
  }
}

export {
  FV,
  fvAdvance,
  fvApply,
  fvBankFX,
  fvChopWarn,
  fvDaily,
  fvDraw,
  fvFld,
  fvInfo,
  fvInit,
  fvPack,
  fvPlantHint,
  fvReset,
  fvSeedRiparian,
  fvTick,
};
