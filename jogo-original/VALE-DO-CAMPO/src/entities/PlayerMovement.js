/**
 * Corrida (+30% de velocidade, gasta energia) e modificadores de velocidade do terreno (trilha, lama, subida, areia, neve, vau).
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { BED, FORD, GRASS, HN, MW, SAND, SCREE, SNOWG, TS } from '../config/constants.js';
import { extensible } from '../core/extensions.js';
import { S } from '../core/GameState.js';
import { $ } from '../ui/dom.js';
import { gid, grassWear, soilCompact } from '../world/GrassSystem.js';
import { elev, wl } from '../world/hydrology/Hydrology.js';
import { climate } from '../world/WeatherSystem.js';
import { ground } from '../world/World.js';

const terrainSpeed = extensible(function terrainSpeed() {
  const tx = Math.floor(S.px / TS),
    ty = Math.floor(S.py / TS);
  if (ground[ty * MW + tx] !== GRASS) return 1;
  const i = gid(S.px, S.py);
  if (i < 0) return 1;
  return 1 + (0.07 * soilCompact[i]) / 255 - (climate.wetness > 0.45 ? (0.14 * grassWear[i]) / 255 : 0); // trilha seca é mais rápida; lama atrasa
});

let running = false,
  runDust = 0;
const RUN_MULT = 1.3,
  RUN_COST = 0.5;

function setRun(v) {
  running = !!v;
  $('btnR').classList.toggle('on', running);
}

export function installTerrainSpeed() {
  terrainSpeed.extend(
    (_ts0) =>
      function () {
        const tx = Math.floor(S.px / TS),
          ty = Math.floor(S.py / TS),
          i = ty * MW + tx,
          j = Math.max(0, Math.min(HN - 1, (ty + S.fy) * MW + tx + S.fx)),
          up = elev[j] - elev[i];
        return (
          _ts0() *
          (wl[i] > 0.08 ? 0.78 : 1) *
          (up > 0.05 ? 1 - Math.min(0.25, up * 1.2) : up < -0.05 ? 1 + Math.min(0.1, -up * 0.5) : 1)
        );
      },
  ); // subida cansa, descida ajuda

  terrainSpeed.extend(
    (_ts1) =>
      function () {
        const g = ground[Math.floor(S.py / TS) * MW + Math.floor(S.px / TS)];
        return (
          _ts1() *
          (g === SAND ? 0.9 : g === SCREE ? 0.88 : g === SNOWG ? 0.78 : g === FORD ? 0.7 : g === BED ? 0.95 : 1)
        );
      },
  ); // areia, cascalho, neve e vau atrasam
}

/** Atualiza `runDust` a partir de outros módulos (as ligações importadas são somente leitura). */
export function setRunDust(value) {
  runDust = value;
  return value;
}

export { RUN_COST, RUN_MULT, runDust, running, setRun, terrainSpeed };
