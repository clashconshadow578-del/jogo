/**
 * Criação de um jogo novo: gera a instância inicial, o estado S, a hidrologia, o casal de vacas, as galinhas e as minhocas.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { HOMEC, OX, OY, TS } from '../config/constants.js';
import { extensible } from './extensions.js';
import { S, setS } from './GameState.js';
import { cow } from '../entities/cow/Cow.js';
import { gest, herd, setGest, spawnBlack } from '../entities/cow/Herd.js';
import { chxStart } from '../entities/farm/Chickens.js';
import { resetEggs } from '../entities/farm/Eggs.js';
import { wrmStart } from '../entities/farm/Worms.js';
import { npc, NPC_HOME } from '../entities/NPC.js';
import { fvSeedRiparian } from '../world/hydrology/Fluvial.js';
import { qReset } from '../world/village/Quests.js';
import { hydroInit } from '../world/hydrology/Hydrology.js';
import { INST, MKEY, parkHome, refreshFlags, resetRuntime } from '../world/Instances.js';
import { IDBW } from '../world/InstanceStore.js';
import { LK } from '../world/World.js';
import { clearFeces } from '../world/Feces.js';
import { clearVitals } from '../systems/Vitals.js';
import { genTiles } from '../world/WorldGen.js';

let FORCE_LK = null,
  FORCE_SEED = null;

function newGameBase() {
  if (typeof cow !== 'undefined')
    Object.assign(cow, {
      x: (22 + OX) * TS + 8,
      y: (17 + OY) * TS + 8,
      dir: 1,
      walk: 0,
      rest: 0,
      pet: 0,
      state: 'rest',
      t: 2,
      eat: false,
      thirst: 0.4,
      hunger: 0.3,
      path: null,
    });
  if (typeof npc !== 'undefined')
    Object.assign(npc, {
      x: NPC_HOME.x * TS + 8,
      y: NPC_HOME.y * TS + 8,
      state: 'idle',
      t: 2,
      inside: false,
      path: [],
    });
  INST.cx = HOMEC.x;
  INST.cy = HOMEC.y;
  INST.bg = {};
  INST.rain = {};
  INST.vis = { '2_3': 1 };
  INST.homeLeft = 0;
  refreshFlags();
  try {
    parkHome(false);
  } catch (e) {}
  IDBW.clear();
  clearFeces();
  clearVitals();
  try {
    localStorage.removeItem(MKEY);
  } catch (e) {}
  resetRuntime();
  const seed = FORCE_SEED != null ? FORCE_SEED : (Math.random() * 1e9) | 0;
  FORCE_SEED = null;
  genTiles(HOMEC.x, HOMEC.y, seed);
  setS({
    day: 1,
    min: 0,
    coins: 50,
    energy: 100, // estamina
    vida: 100, // vida (❤): o que os animais tiram
    inv: {
      seedC: 0,
      seedP: 0,
      seedM: 0,
      seedT: 0,
      cenoura: 0,
      abobora: 0,
      milho: 0,
      madeira: 0,
      seedB: 0,
      seedK: 0,
      seedS: 0,
      buriti: 0,
      palha: 0,
      ourico: 0,
      castanha: 0,
      vagem: 0,
      paina: 0,
    },
    sel: 0,
    up: { tool: { hoe: 0, can: 0, scythe: 0, axe: 0 }, seed: 0 }, // progressão: ferramentas começam no nível básico
    qual: {},
    missionsDone: 0,
    px: (15 + OX) * TS + 8,
    py: (13 + OY) * TS + 8,
    fx: 0,
    fy: 1,
    walk: 0,
    lum: 1,
    seed,
    lk: LK,
  });
  hydroInit();
  fvSeedRiparian();
  herd.length = 1;
  setGest(null);
  cow.preg = false;
  cow.bonds = {};
  cow.age = 999;
  cow.calf = false;
  cow.g = null;
  cow.dead = false;
  cow.black = false;
  cow.sex = 'f';
  cow.name = null;
  cow.id = 0;
  cow.founder = 0;
  spawnBlack();
  cow.primeira = true;
  herd[1].primeira = true;
  cow.bonds[herd[1].id] = 0.6;
  herd[1].bonds[cow.id] = 0.6;
}

const newGame = extensible(function newGame() {
  newGameBase();
  qReset(); // missões e melhorias recomeçam juntas
  chxStart();
  resetEggs();
  wrmStart();
});

/** Atualiza `FORCE_LK` a partir de outros módulos (as ligações importadas são somente leitura). */
export function setFORCE_LK(value) {
  FORCE_LK = value;
  return value;
}

/** Atualiza `FORCE_SEED` a partir de outros módulos (as ligações importadas são somente leitura). */
export function setFORCE_SEED(value) {
  FORCE_SEED = value;
  return value;
}

export { FORCE_LK, FORCE_SEED, newGame };
