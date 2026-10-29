/**
 * Conversores de saves de versões antigas (V17/V18, mapa 136 colunas). O V64 não os chama (saves antigos não se aplicam ao mundo projetado); foram mantidos para referência.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { MH, MW, OX, OXP, OY, OYP, TREE, TS } from '../config/constants.js';
import { S, setS } from './GameState.js';
import { FORCE_LK, FORCE_SEED, newGame, setFORCE_LK, setFORCE_SEED } from './NewGame.js';
import { cow } from '../entities/cow/Cow.js';
import { restoreHerd } from '../entities/cow/Herd.js';
import { restoreChx } from '../entities/farm/Chickens.js';
import { restoreNinhos } from '../entities/farm/Nests.js';
import { restoreWrm } from '../entities/farm/Worms.js';
import { INV0 } from '../systems/InventorySystem.js';
import { rleDec, rleEnc } from '../utils/compression.js';
import { ecoLoad } from '../world/ecology/TreeEcology.js';
import { grassDirty, setGrassDirty } from '../world/GrassSystem.js';
import { hydroInit } from '../world/hydrology/Hydrology.js';
import { crops, ground, LK, obj, setCrops, setLK, wet } from '../world/World.js';

/* ============ INSTÂNCIA (lado direito, atrás da parede) ============
   Mesma grade do mundo, então continua sendo simulada enquanto você está fora. */
const OLD_MW = 136;

function remapB(str) {
  if (!str) return str;
  const src = rleDec(str, OLD_MW * MH),
    out = new Uint8Array(MW * MH);
  for (let y = 0; y < MH; y++) for (let x = 0; x < OLD_MW; x++) out[y * MW + x] = src[y * OLD_MW + x];
  return rleEnc(out);
}

function migrateWidth(d) {
  d.g = remapB(d.g);
  d.o = remapB(d.o);
  d.w = remapB(d.w);
  const c = {};
  for (const k in d.crops || {}) {
    const i = +k;
    c[((i / OLD_MW) | 0) * MW + (i % OLD_MW)] = d.crops[k];
  }
  d.crops = c;
  if (Array.isArray(d.eco)) d.eco = d.eco.map((e) => [((e[0] / OLD_MW) | 0) * MW + (e[0] % OLD_MW), ...e.slice(1)]);
}

function migrateHydro(d) {
  for (const k of ['wl', 'sm', 'gwt', 'hmod', 'mato', 'seed', 'sapl', 'nut', 'om', 'bio', 'ero', 'lt', 'shr'])
    if (d[k]) d[k] = remapB(d[k]);
  d.mw = MW;
}

function migrateV18(d) {
  // save antigo (188x90): leva a fazenda para a instância inicial do mundo novo
  const ow = d.mw || 136,
    oh = 90,
    N = ow * oh,
    g0 = rleDec(d.g, N),
    o0 = rleDec(d.o, N),
    w0 = rleDec(d.w, N),
    FX = 20,
    FY = 13,
    dx = OX - FX,
    dy = OY - FY;
  const S0 = d.S;
  if (S0.lk) {
    setFORCE_LK(S0.lk.slice());
    FORCE_LK[0] += dx;
    FORCE_LK[1] += dy;
    FORCE_LK[2] += dx;
    FORCE_LK[3] += dy;
  }
  setFORCE_SEED(S0.seed | 0);
  newGame();
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 96; x++) {
      const oi = (y + FY) * ow + x + FX,
        ni = (y + OY) * MW + x + OX;
      ground[ni] = g0[oi];
      obj[ni] = o0[oi];
      wet[ni] = w0[oi];
    }
  setCrops({});
  for (const k in d.crops || {}) {
    const i = +k,
      x = i % ow,
      y = (i / ow) | 0;
    if (x >= FX && x < FX + 96 && y >= FY && y < FY + 64) crops[(y + dy) * MW + x + dx] = d.crops[k];
  }
  const sh = (o) => {
    if (o && typeof o.x === 'number') {
      o.x += dx * TS;
      o.y += dy * TS;
      if ('path' in o) o.path = null;
    }
  };
  S0.px += dx * TS;
  S0.py += dy * TS;
  const tx = S0.px / TS,
    ty = S0.py / TS;
  if (!(tx >= OX && tx < OX + 96 && ty >= OY && ty < OY + 64)) {
    S0.px = (15 + OX) * TS + 8;
    S0.py = (13 + OY) * TS + 8;
  }
  setS(S0);
  setLK(FORCE_LK || LK);
  if (S.lk) setLK([S.lk[0] + dx, S.lk[1] + dy, S.lk[2] + dx, S.lk[3] + dy, ...S.lk.slice(4)]);
  S.lk = LK;
  S.inv = { ...INV0, ...S.inv };
  if (d.cow) {
    Object.assign(cow, d.cow);
    sh(cow);
  }
  const arr = (a) => (Array.isArray(a) ? a : []);
  arr(d.herd).forEach(sh);
  arr(d.chx).forEach(sh);
  arr(d.wrm).forEach(sh);
  arr(d.ninhos).forEach(sh);
  restoreHerd(d.herd, d.gest);
  restoreChx(d.chx);
  restoreWrm(d.wrm);
  restoreNinhos(d.ninhos);
  const eco = arr(d.eco)
    .map((e) => {
      const i = e[0],
        x = i % ow,
        y = (i / ow) | 0;
      return x >= FX && x < FX + 96 && y >= FY && y < FY + 64 ? [(y + dy) * MW + x + dx, ...e.slice(1)] : null;
    })
    .filter(Boolean);
  setGrassDirty(true);
  hydroInit();
  ecoLoad(eco);
  return true;
}

function migrateV17(d) {
  // leva a fazenda do V17 (96x64) para o centro do mundo novo
  if (!d.ground || d.ground.length !== 96 * 64) return false;
  newGame();
  const OW = 96,
    OH = 64;
  for (let y = 0; y < OH; y++)
    for (let x = 0; x < OW; x++) {
      const oi = y * OW + x,
        ni = (y + OY) * MW + x + OX;
      ground[ni] = d.ground[oi];
      obj[ni] = d.obj[oi];
      wet[ni] = d.wet[oi];
      if ((x < 2 || y < 2 || x >= OW - 2 || y >= OH - 2) && obj[ni] === TREE) obj[ni] = 0;
    } // some o anel de árvores da borda antiga
  setCrops({});
  for (const k in d.crops) {
    const i = +k;
    crops[(((i / OW) | 0) + OY) * MW + (i % OW) + OX] = d.crops[k];
  }
  setS(d.S);
  S.px += OXP;
  S.py += OYP;
  if (S.lk) {
    setLK(S.lk.slice());
    LK[0] += OX;
    LK[1] += OY;
    LK[2] += OX;
    LK[3] += OY;
  } else setLK([34 + OX, 19 + OY, 72 + OX, 46 + OY, 1.3, 5, 3.5, 6, 4]);
  S.lk = LK;
  S.inv = { ...INV0, ...S.inv };
  if (d.cow) {
    Object.assign(cow, d.cow);
    cow.x += OXP;
    cow.y += OYP;
    cow.path = null;
  }
  if (Array.isArray(d.herd))
    for (const o of d.herd) {
      o.x += OXP;
      o.y += OYP;
    }
  restoreHerd(d.herd, d.gest);
  setGrassDirty(true);
  hydroInit();
  return true;
}
