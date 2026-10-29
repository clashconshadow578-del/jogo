/**
 * Salvamento e carregamento da partida em localStorage (chave 'valeDoCampo_v53m', formato v19) e salvamento automático (a cada 60 s, ao ocultar a aba e ao sair).
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { MH, MW } from '../config/constants.js';
import { S, setS } from './GameState.js';
import { cow } from '../entities/cow/Cow.js';
import { gest, herd, restoreHerd } from '../entities/cow/Herd.js';
import { chxSave, restoreChx } from '../entities/farm/Chickens.js';
import { eggSave, restoreEggs } from '../entities/farm/Eggs.js';
import { ninhoSave, restoreNinhos } from '../entities/farm/Nests.js';
import { restoreWrm, wrmSave } from '../entities/farm/Worms.js';
import { faInitDone, setFaInitDone } from '../entities/wild/Fauna.js';
import { INV0 } from '../systems/InventorySystem.js';
import { rleDec, rleEnc } from '../utils/compression.js';
import { materializeFauna } from '../world/BackgroundSim.js';
import { clearFeces } from '../world/Feces.js';
import { clearVitals } from '../systems/Vitals.js';
import { ecoLoad, ecoPack } from '../world/ecology/TreeEcology.js';
import { grassDirty, setGrassDirty } from '../world/GrassSystem.js';
import { HKEY_OLD, hydroInit, hydroLoad, hydroSave } from '../world/hydrology/Hydrology.js';
import { ckey, faSnapAll, INST, instLoadMeta, instSaveMeta, parkHome, refreshFlags } from '../world/Instances.js';
import { saveWeather } from '../world/WeatherSystem.js';
import { crops, ground, LK, obj, setCrops, setGround, setLK, setObj, setWet, wet } from '../world/World.js';

/* ============ CONFIG ============ */
const KEY = 'valeDoCampo_v1';

const KEY2 = 'valeDoCampo_v19';

const KEY3 = 'valeDoCampo_v53m';

function save() {
  const put = (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch (e) {
      try {
        localStorage.removeItem(KEY);
        localStorage.removeItem(HKEY_OLD);
        localStorage.setItem(k, v);
      } catch (e2) {}
    }
  };
  try {
    put(
      KEY3,
      JSON.stringify({
        v: 19,
        mw: MW,
        inst: { cx: INST.cx, cy: INST.cy },
        lk: LK,
        S,
        chx: chxSave(),
        wrm: wrmSave(),
        ninhos: ninhoSave(),
        eggs: eggSave(),
        g: rleEnc(ground),
        o: rleEnc(obj),
        w: rleEnc(wet),
        crops,
        cow,
        herd: herd.slice(1),
        eco: ecoPack(),
        fa: faSnapAll(),
        gest: gest ? { mom: gest.mom.id, dad: gest.dad.id, t: gest.t, total: gest.total } : null,
      }),
    );
    hydroSave();
    instSaveMeta();
    localStorage.removeItem(KEY);
    localStorage.removeItem(HKEY_OLD);
  } catch (e) {}
}

function load() {
  try {
    const r = localStorage.getItem(KEY3);
    if (!r) return false; // mapa novo: comeca um jogo novo (saves antigos nao se aplicam a este mundo)
    const d = JSON.parse(r);
    if (d.v !== 19 || !d.g) return false;
    INST.cx = d.inst.cx;
    INST.cy = d.inst.cy;
    refreshFlags();
    instLoadMeta();
    setGround(rleDec(d.g, MW * MH));
    setObj(rleDec(d.o, MW * MH));
    setWet(rleDec(d.w, MW * MH));
    setCrops(d.crops || {});
    setS(d.S);
    if (S.vida == null) S.vida = 100; // saves antigos: a vida não existia (a barra era a estamina)
    clearFeces(); // fezes e veneno não são salvos
    clearVitals();
    setLK(d.lk || S.lk || LK);
    S.lk = LK;
    S.inv = { ...INV0, ...S.inv };
    if (d.cow) Object.assign(cow, d.cow);
    restoreHerd(d.herd, d.gest);
    restoreChx(d.chx);
    restoreWrm(d.wrm);
    restoreNinhos(d.ninhos);
    restoreEggs(d.eggs, d.ninhos); // saves antigos: ovos dos ninhos viram ovos do mundo
    if (!Array.isArray(d.eggs)) restoreNinhos([]);
    if (INST.homeAct) parkHome(false);
    setGrassDirty(true);
    hydroInit();
    hydroLoad();
    ecoLoad(d.eco);
    if (Array.isArray(d.fa)) {
      delete INST.bg[ckey(INST.cx, INST.cy)];
      setFaInitDone(true);
      for (const o of d.fa) materializeFauna(o);
    }
    return true;
  } catch (e) {
    console.error('load', e);
    return false;
  }
}

export function initAutosave() {
  setInterval(() => {
    (window.requestIdleCallback || setTimeout)(() => {
      save();
      saveWeather();
    });
  }, 60000);

  addEventListener('pagehide', () => {
    save();
    saveWeather();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      save();
      saveWeather();
    }
  });
}

export { KEY, KEY3, load, save };
