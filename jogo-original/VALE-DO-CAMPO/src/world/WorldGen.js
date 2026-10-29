/**
 * Geração procedural de uma região a partir do mapa projetado: árvores, pedras, passagens entre regiões, a fazenda e a vila.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import {
  BED,
  BIN,
  FORD,
  GRASS,
  HOMEC,
  HOUSE,
  MH,
  MW,
  OX,
  OY,
  PATH,
  ROCK,
  SAND,
  SCREE,
  SNOWG,
  STONE,
  TREE,
  VILC,
  WATER,
  WN,
} from '../config/constants.js';
import { extensible } from '../core/extensions.js';
import { S } from '../core/GameState.js';
import { setShoreList, shoreList } from '../entities/cow/Cow.js';
import { smooth } from '../utils/MathUtils.js';
import { vnoise } from '../utils/Noise.js';
import { rngSeed } from '../utils/Random.js';
import { ecoStarted, ecoSync, ecoTrees, setEcoStarted, setEcoTrees } from './ecology/TreeEcology.js';
import { fvSeedRiparian } from './hydrology/Fluvial.js';
import { hydroInit } from './hydrology/Hydrology.js';
import { TREE_PICK } from './Trees.js';
import { VIL } from './Village.js';
import { crops, ground, LK, obj, setCrops, setGround, setLK, setObj, setWet, wet } from './World.js';
import { WORLD } from './WorldData.js';

/* ---------- geração procedural de uma instância ---------- */
function carveInstance() {
  // a vila: parede (x=24..75, y=19..70), passagem a oeste (y=44..46)
  for (let x = 24; x <= 75; x++)
    for (const y of [19, 70]) {
      const i = y * MW + x;
      ground[i] = GRASS;
      obj[i] = ROCK;
    }
  for (let y = 19; y <= 70; y++) {
    const i = y * MW + 75;
    ground[i] = GRASS;
    obj[i] = ROCK;
  }
  for (let y = 19; y <= 70; y++) {
    if (y >= 44 && y <= 46) continue;
    const i = y * MW + 24;
    ground[i] = GRASS;
    obj[i] = ROCK;
  }
  for (let y = 20; y <= 69; y++)
    for (let x = 25; x <= 74; x++) {
      const i = y * MW + x;
      ground[i] = GRASS;
      obj[i] = 0;
    }
  for (const v of VIL)
    for (let y = v.y; y < v.y + 3; y++)
      for (let x = v.x; x < v.x + 9; x++) {
        const i = y * MW + x;
        obj[i] = HOUSE;
        ground[i] = GRASS;
      }
  for (const v of VIL) {
    let x = v.x + 4,
      y = v.y + 3;
    const road = (x, y) => {
      const i = y * MW + x;
      if (obj[i] !== HOUSE) {
        ground[i] = PATH;
        obj[i] = 0;
      }
    };
    while (x !== 49) {
      road(x, y);
      x += x < 49 ? 1 : -1;
    }
    while (y !== 45) {
      road(x, y);
      y += y < 45 ? 1 : -1;
    }
    road(x, y);
  }
  for (let y = 41; y <= 49; y++)
    for (let x = 45; x <= 53; x++) {
      const i = y * MW + x;
      ground[i] = STONE;
      obj[i] = 0;
    }
  for (let x = 0; x <= 25; x++)
    for (let y = 44; y <= 46; y++) {
      const i = y * MW + x;
      ground[i] = PATH;
      obj[i] = 0;
    } // caminho até a passagem
}

function genTiles(cx, cy, seed) {
  const home = cx === HOMEC.x && cy === HOMEC.y,
    vil = cx === VILC.x && cy === VILC.y;
  const h32 = (a, b) => (Math.imul(a + 7, 73856093) ^ Math.imul(b + 13, 19349663) ^ seed) >>> 0;
  const hasN = (dx, dy) => cx + dx >= 0 && cx + dx < WN && cy + dy >= 0 && cy + dy < WN;
  const rnd = rngSeed(seed ^ h32(cx, cy)),
    wx0 = cx * MW,
    wy0 = cy * MH;
  setLK([-99, -99, -99, -99, 1.3, 5, 3.5, 6, 4]); // (legado) os lagos agora vem do mapa projetado
  for (const k in TREE_PICK) delete TREE_PICK[k];
  setShoreList(null);
  setGround(new Uint8Array(MW * MH));
  setObj(new Uint8Array(MW * MH));
  setWet(new Uint8Array(MW * MH));
  setCrops({});
  for (let y = 0; y < MH; y++)
    for (let x = 0; x < MW; x++) {
      const i = y * MW + x,
        wi = (wy0 + y) * 1000 + wx0 + x,
        c = WORLD.T[wi];
      ground[i] = T_GROUND[c];
      if (c === 0 || c === 1 || c === 7 || c === 8 || c === 10 || c === 11) continue; // sem objetos na agua, no vau nem no leito do canal
      if (
        (x >= MW - 2 && !hasN(1, 0)) ||
        (x < 2 && !hasN(-1, 0)) ||
        (y >= MH - 2 && !hasN(0, 1)) ||
        (y < 2 && !hasN(0, -1))
      ) {
        // anel so na borda do mundo
        if (c === 3 || c === 4 || c === 9) {
          if (rnd() < 0.75) obj[i] = TREE;
        } else if (c === 5 || c === 6) {
          if (rnd() < 0.9) obj[i] = ROCK;
        }
        continue;
      }
      const inF = home && x >= OX && x < OX + 96 && y >= OY && y < OY + 64,
        hh = WORLD.H[wi] / 4 - 40;
      let fd = inF
        ? 0.05
        : 0.025 + 0.3 * smooth(0.52, 0.78, vnoise(x + wx0, y + wy0, 20, 11)) + 0.05 * vnoise(x + wx0, y + wy0, 6, 12); // florestas continuas entre instancias
      fd *= c === 3 ? 1 : c === 4 ? (hh < 80 ? 0.85 : 0.45) : c === 9 ? 0.5 : 0; // flora provisoria (a definitiva vira depois): so planicie, colina e brejo
      const rk = c === 5 ? 0.07 : c === 6 ? 0.03 : c === 2 ? 0.003 : c === 4 ? 0.02 : inF ? 0.015 : 0.012;
      if (rnd() < fd) obj[i] = TREE;
      else if (rnd() < rk) obj[i] = ROCK;
    }
  for (let y = 0; y < MH; y++)
    for (let x = 0; x < MW; x++) {
      // faixa de 3 tiles livre nas bordas ligadas a outra instancia (passagem); rios viram vau
      if (
        (x < 3 && hasN(-1, 0)) ||
        (x >= MW - 3 && hasN(1, 0)) ||
        (y < 3 && hasN(0, -1)) ||
        (y >= MH - 3 && hasN(0, 1))
      ) {
        const i = y * MW + x;
        obj[i] = 0;
        if (WORLD.T[(wy0 + y) * 1000 + wx0 + x] === 7) ground[i] = FORD;
      }
    }
  if (home) {
    for (let y = 5; y <= 14; y++) for (let x = 12; x <= 20; x++) obj[(y + OY) * MW + x + OX] = 0;
    for (let y = 8; y <= 10; y++) for (let x = 14; x <= 17; x++) obj[(y + OY) * MW + x + OX] = HOUSE;
    obj[(12 + OY) * MW + 19 + OX] = BIN;
    for (let y = 11; y <= 22; y++) {
      const i = (y + OY) * MW + 15 + OX;
      ground[i] = ground[i] === WATER ? FORD : PATH;
      obj[i] = 0;
    } // o caminho da casa cruza o rio por um vau
  }
  if (vil) carveInstance();
}

const genNewChunk = extensible(function genNewChunk(nx, ny) {
  genTiles(nx, ny, S.seed | 0);
  hydroInit();
  fvSeedRiparian();
  setEcoTrees(new Map());
  setEcoStarted(false);
  ecoSync();
});

const T_GROUND = [WATER, WATER, SAND, GRASS, GRASS, SCREE, SNOWG, WATER, WATER, GRASS, BED, FORD]; // classe do mapa -> chao do jogo

export { genNewChunk, genTiles };
