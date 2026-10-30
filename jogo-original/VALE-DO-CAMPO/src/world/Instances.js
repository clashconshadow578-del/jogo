/**
 * Mundo de 10x10 regiões: troca de região ao cruzar a borda, empacotamento/desempacotamento, recuperação do tempo que passou e metadados persistentes.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { DAY_MIN, HN, HOMEC, MH, MW, OXP, OYP, TS, VILC, WATER, WN } from '../config/constants.js';
import { extensible } from '../core/extensions.js';
import { S, sleeping } from '../core/GameState.js';
import { update } from '../core/GameUpdate.js';
import { save } from '../core/SaveManager.js';
import { worldMin } from '../core/TimeManager.js';
import { CARC, ZONES } from '../entities/Carcass.js';
import { setShoreList, shoreList } from '../entities/cow/Cow.js';
import { gest, herd, updateHerd } from '../entities/cow/Herd.js';
import { chx, updateChx } from '../entities/farm/Chickens.js';
import { fox, updateFox } from '../entities/farm/FarmFoxes.js';
import { updateEggs } from '../entities/farm/Eggs.js';
import { ninhos, updateNinhos } from '../entities/farm/Nests.js';
import { updateWrm, wrm } from '../entities/farm/Worms.js';
import { GG } from '../entities/Giant.js';
import { npc, updateNpc } from '../entities/NPC.js';
import { WF } from '../entities/Werewolf.js';
import {
  faInitDone,
  faShoreL,
  faShoreT,
  fauna,
  setFaInitDone,
  setFaShoreL,
  setFaShoreT,
} from '../entities/wild/Fauna.js';
import { TRAILS } from '../entities/wild/Jaguar.js';
import { LKD, lkdT, setLkdT } from '../rendering/LakeRenderer.js';
import { blocked } from '../systems/CollisionSystem.js';
import { tilled } from '../systems/FarmingSystem.js';
import { FISH, FS } from '../systems/Fishing.js';
import { chop, chopHP } from '../systems/Woodcutting.js';
import { dlgOpen } from '../ui/Dialog.js';
import { fadeEl } from '../ui/dom.js';
import { toast } from '../ui/Toast.js';
import { pk, pkE, rleDec, rleEnc, upk, upkE } from '../utils/compression.js';
import { alel } from './Allelopathy.js';
import { bgTickAll, faEdge, fSnap, rainExposure, stashFauna, unstashFauna } from './BackgroundSim.js';
import { ecoDaily, ecoLoad, ecoPack } from './ecology/TreeEcology.js';
import {
  dust,
  grassBendX,
  grassBendY,
  grassDirty,
  grassGraze,
  grassWear,
  prints,
  recoverGrassDay,
  setGrassDirty,
  soilCompact,
} from './GrassSystem.js';
import { resetPlants } from './PlantSpecies.js';
import { fvAdvance, fvApply, fvPack } from './hydrology/Fluvial.js';
import {
  bio,
  ero,
  gwt,
  HCX,
  HCY,
  hmod,
  hydroAdvance,
  hydroDaily,
  hydroInit,
  hydroWin,
  lakeLevel,
  lakeStore,
  lakeThrCompute,
  lakeTile,
  mato,
  nut,
  om,
  sapl,
  seedAge,
  setHCX,
  setHCY,
  setLakeLevel,
  setLakeStore,
  sm,
  treeSeen,
  wl,
} from './hydrology/Hydrology.js';
import { IDBW } from './InstanceStore.js';
import { shroom, shroomDaily } from './Mushrooms.js';
import { rDrops, rHits, rRings, wetT } from './RainSystem.js';
import { TREE_PICK } from './Trees.js';
import { updateVendor } from './village/Vendor.js';
import { wA, wB, wDrops, wM } from './WaterSystem.js';
import { clouds } from './WeatherSystem.js';
import { crops, ground, LK, obj, setCrops, setGround, setLK, setObj, setWet, wet } from './World.js';
import { genNewChunk } from './WorldGen.js';

const INST = {
  cx: 2,
  cy: 3,
  homeAct: true,
  vilAct: false,
  busy: false,
  bg: {},
  rain: {},
  vis: { '2_3': 1 },
  homeLeft: 0,
};

const LIGHT_A_FULL = [
  [236 + OXP, 153 + OYP, 54, '255,176,90', 0.9],
  [268 + OXP, 153 + OYP, 54, '255,176,90', 0.9],
  [248 + OXP, 178 + OYP, 48, '255,196,120', 0.85],
  [312 + OXP, 196 + OYP, 46, '255,205,140', 0.75],
];

const LIGHT_A = LIGHT_A_FULL.slice();

const ckey = (cx, cy) => cx + '_' + cy;

function refreshFlags() {
  INST.homeAct = INST.cx === HOMEC.x && INST.cy === HOMEC.y;
  INST.vilAct = INST.cx === VILC.x && INST.cy === VILC.y;
  LIGHT_A.length = 0;
  if (INST.homeAct) LIGHT_A.push(...LIGHT_A_FULL);
}

/* ---------- empacotar / desempacotar a instância carregada ---------- */
const packChunk = extensible(function packChunk() {
  return {
    v: 1,
    day: S.day,
    min: S.min,
    g: rleEnc(ground),
    o: rleEnc(obj),
    w: rleEnc(wet),
    crops,
    lk: LK.slice(),
    ll: lakeLevel,
    ls: lakeStore,
    wl: pk(wl),
    sm: pk(sm),
    gwt: pk(gwt),
    hmod: rleEnc(hmod),
    mato: pk(mato, 1),
    seed: pk(seedAge, 1),
    sapl: pk(sapl),
    nut: pk(nut),
    om: pk(om),
    bio: pk(bio),
    ero: pkE(ero),
    lt: rleEnc(lakeTile),
    shr: rleEnc(shroom),
    al: pk(alel),
    fv: fvPack(),
    eco: ecoPack(),
  };
});

const unpackChunk = extensible(function unpackChunk(r) {
  setGround(rleDec(r.g, HN));
  setObj(rleDec(r.o, HN));
  setWet(rleDec(r.w, HN));
  setCrops(r.crops || {});
  setLK(r.lk);
  hydroInit();
  upk(r.wl, wl);
  upk(r.sm, sm);
  upk(r.gwt, gwt);
  hmod.set(rleDec(r.hmod, HN));
  upk(r.mato, mato, 1);
  upk(r.seed, seedAge, 1);
  upk(r.sapl, sapl);
  upk(r.nut, nut);
  upk(r.om, om);
  upk(r.bio, bio);
  upkE(r.ero, ero);
  setLakeStore(r.ls || 0);
  shroom.set(rleDec(r.shr, HN));
  lakeTile.set(rleDec(r.lt, HN));
  setLakeLevel(r.ll ?? 1);
  lakeThrCompute();
  try {
    upk(r.al, alel);
  } catch (e) {}
  fvApply(r.fv);
  ecoLoad(r.eco);
});

function resetRuntime() {
  resetPlants();
  grassWear.fill(0);
  grassBendX.fill(0);
  grassBendY.fill(0);
  soilCompact.fill(0);
  grassGraze.fill(0);
  prints.length = 0;
  dust.length = 0;
  setGrassDirty(true);
  rDrops.length = 0;
  rRings.length = 0;
  rHits.length = 0;
  wetT.fill(0);
  for (const k in TREE_PICK) delete TREE_PICK[k];
  setShoreList(null);
  setFaShoreL([]);
  setFaShoreT(-99);
  for (const k in tilled) delete tilled[k];
  fauna.length = 0;
  setFaInitDone(false);
  try {
    CARC.length = 0;
    ZONES.length = 0;
  } catch (e) {}
  try {
    LKD.fill(0);
    setLkdT(-99);
  } catch (e) {}
  try {
    wA.fill(0);
    wB.fill(0);
    wM.fill(0);
    wDrops.length = 0;
  } catch (e) {}
  try {
    chopHP.clear();
    for (const k in chop) delete chop[k];
  } catch (e) {}
  try {
    WF.st = 'off';
  } catch (e) {}
  try {
    GG.st = 'init';
  } catch (e) {}
  try {
    FISH.length = 0;
    FS.init = 0;
    TRAILS.length = 0;
  } catch (e) {}
  setHCX(-99);
  setHCY(-99);
  treeSeen.fill(0);
}

/* ---------- entidades da fazenda (vaca, galinhas, minhocas, ninhos, raposa, moradora) ---------- */
function homeGroup() {
  const g = [];
  for (const q of herd) g.push(q);
  for (const a of chx) g.push(a);
  for (const a of wrm) g.push(a);
  for (const a of ninhos) g.push(a);
  for (const a of fox) g.push(a);
  g.push(npc);
  return g;
}

function parkHome(on) {
  for (const o of homeGroup()) {
    if (!o || typeof o.x !== 'number') continue;
    if (on) {
      if (o._px === undefined) {
        o._px = o.x;
        o._py = o.y;
      }
      o.x = o.y = -99999;
      if ('path' in o) o.path = null;
    } else if (o._px !== undefined) {
      o.x = o._px;
      o.y = o._py;
      delete o._px;
      delete o._py;
      if (o === npc) o.path = [];
    }
  }
}

function homeCatchUp(em) {
  // a fazenda "viveu" enquanto você estava fora: avança em passos rápidos e invisíveis
  const steps = Math.min(360, Math.floor(em / 0.5));
  for (let i = 0; i < steps; i++) {
    updateHerd(0.5);
    updateChx(0.5);
    updateNinhos(0.5);
    updateWrm(0.5);
    updateFox(0.5);
    updateNpc(0.5);
  }
  updateEggs(); // posturas e eclosões que venceram durante a ausência (relógio absoluto do jogo)
  if (gest && em > 180) gest.t += em - 180;
}

/* ---------- recuperar o tempo que passou numa instância ---------- */
function chunkCatchUp(rec, key) {
  const em = worldMin() - ((rec.day - 1) * DAY_MIN + rec.min);
  if (em < 3) return;
  const nd = Math.min(5, S.day - rec.day),
    rn = INST.rain[key] || 0;
  delete INST.rain[key];
  hydroWin();
  hydroAdvance(Math.min(30, Math.max(4, Math.floor(em / 8))));
  fvAdvance(em);
  if (rn > 1) {
    const f = Math.min(1, rn / 120);
    for (let i = 0; i < HN; i++)
      if (ground[i] !== WATER) {
        sm[i] = Math.min(1, sm[i] + 0.3 * f);
        gwt[i] = Math.min(1, gwt[i] + 0.12 * f);
      }
    if (f > 0.15) for (const k in crops) crops[k].w = true;
  }
  for (let d = 0; d < nd; d++) {
    shroomDaily();
    recoverGrassDay();
    hydroAdvance(20);
    hydroDaily();
    ecoDaily();
    for (const k in crops) {
      const c = crops[k];
      if (c && c.d < c.need && (c.w || sm[+k] > 0.45)) c.d++;
      if (c) c.w = false;
    }
  }
  if (nd > 0) wet.fill(0);
}

/* ---------- troca de instância ---------- */
async function goInstance(nx, ny, lx, ly) {
  if (INST.busy) return;
  INST.busy = true;
  try {
    fadeEl.style.opacity = 1;
    await IDBW.ready;
    await new Promise((r) => setTimeout(r, 320));
    const okey = ckey(INST.cx, INST.cy),
      nkey = ckey(nx, ny),
      oldPx = S.px,
      oldPy = S.py,
      wasHome = INST.homeAct;
    IDBW.put('c' + okey, packChunk());
    stashFauna();
    if (wasHome) {
      parkHome(true);
      INST.homeLeft = worldMin();
    }
    const rec = await IDBW.get('c' + nkey);
    INST.cx = nx;
    INST.cy = ny;
    refreshFlags();
    INST.vis[nkey] = 1;
    resetRuntime();
    S.px = lx;
    S.py = ly;
    if (rec && rec.g) {
      unpackChunk(rec);
    } else genNewChunk(nx, ny);
    rescuePlayer();
    S.lk = LK;
    for (const c of clouds) {
      c.x += lx - oldPx;
      c.y += ly - oldPy;
    }
    unstashFauna(nkey);
    if (INST.homeAct) {
      parkHome(false);
      homeCatchUp(worldMin() - INST.homeLeft);
    }
    if (rec && rec.g) chunkCatchUp(rec, nkey);
    hydroWin();
    save();
    toast('📍 Região ' + nx + ',' + ny + (INST.homeAct ? ' · Fazenda' : INST.vilAct ? ' · Vila' : ''));
  } catch (e) {
    console.error('goInstance', e);
  }
  fadeEl.style.opacity = 0;
  INST.busy = false;
}

let bgAcc = 0,
  edgeAcc = 0;

function instTick(dt) {
  if (INST.busy || sleeping) return;
  rainExposure(dt);
  bgAcc += dt;
  if (bgAcc >= 2) {
    bgAcc = 0;
    bgTickAll();
  }
  edgeAcc += dt;
  if (edgeAcc >= 3) {
    edgeAcc = 0;
    faEdge();
  }
  if (S.inside || dlgOpen) return;
  const lo = TS + 0.6,
    hiX = MW * TS - TS - 0.6,
    hiY = MH * TS - TS - 0.6,
    vx = S.vx || 0,
    vy = S.vy || 0;
  let dx = 0,
    dy = 0;
  if (S.px <= lo && vx < -3) dx = -1;
  else if (S.px >= hiX && vx > 3) dx = 1;
  else if (S.py <= lo && vy < -3) dy = -1;
  else if (S.py >= hiY && vy > 3) dy = 1;
  if (!dx && !dy) return;
  const nx = INST.cx + dx,
    ny = INST.cy + dy;
  if (nx < 0 || ny < 0 || nx >= WN || ny >= WN) return;
  goInstance(
    nx,
    ny,
    dx < 0 ? (MW - 3) * TS + 8 : dx > 0 ? 2 * TS + 8 : S.px,
    dy < 0 ? (MH - 3) * TS + 8 : dy > 0 ? 2 * TS + 8 : S.py,
  );
}

/* ---------- meta-dados persistentes (animais fora da tela, chuva acumulada, instâncias visitadas) ---------- */
const MKEY = 'valeDoCampo_inst_meta53m';

function instSaveMeta() {
  try {
    localStorage.setItem(MKEY, JSON.stringify({ bg: INST.bg, rain: INST.rain, vis: INST.vis, hl: INST.homeLeft }));
  } catch (e) {}
}

function instLoadMeta() {
  try {
    const m = JSON.parse(localStorage.getItem(MKEY) || 'null');
    if (m) {
      INST.bg = m.bg || {};
      INST.rain = m.rain || {};
      INST.vis = m.vis || {};
      INST.homeLeft = m.hl || 0;
    }
  } catch (e) {}
}

function faSnapAll() {
  const a = [];
  for (const f of fauna) if (f.state !== 'dead' && !f.gone) a.push(fSnap(f));
  return a;
}

function rescuePlayer() {
  // ao trocar de instancia, nunca ficar preso em agua/pedra
  if (!blocked(S.px, S.py)) return;
  for (let r = 1; r <= 40; r++)
    for (let k = 0; k < 16; k++) {
      const a = k * 0.3927,
        x = S.px + Math.cos(a) * r * TS,
        y = S.py + Math.sin(a) * r * TS;
      if (x > TS * 2 && y > TS * 2 && x < MW * TS - TS * 2 && y < MH * TS - TS * 2 && !blocked(x, y)) {
        S.px = x;
        S.py = y;
        return;
      }
    }
}

export function installHomeGuards() {
  // Fora da fazenda (ou da vila) as rotinas desses habitantes ficam suspensas; ao voltar, homeCatchUp() as avança.
  // Observação: o original também listava 'ggTick', mas essa função ainda não existia quando o laço rodava,
  // por isso nunca foi protegida — o comportamento foi mantido.
  for (const f of [updateHerd, updateChx, updateNinhos, updateWrm, updateFox, updateNpc])
    f.extend(
      (prev) =>
        function () {
          return INST.homeAct ? prev.apply(this, arguments) : undefined;
        },
    );
  updateVendor.extend(
    (prev) =>
      function () {
        return INST.vilAct ? prev.apply(this, arguments) : undefined;
      },
  );
}

export function installInstanceUpdate() {
  update.extend(
    (_u) =>
      function (dt) {
        if (INST.busy) return;
        _u.apply(this, arguments);
        instTick(dt);
      },
  );
}

export {
  INST,
  LIGHT_A,
  MKEY,
  ckey,
  faSnapAll,
  instLoadMeta,
  instSaveMeta,
  packChunk,
  parkHome,
  refreshFlags,
  resetRuntime,
  unpackChunk,
};
