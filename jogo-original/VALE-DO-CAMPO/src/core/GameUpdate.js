/**
 * Atualização lógica de um quadro: relógio do jogo, clima, chuva, animais, hidrologia, movimento do jogador (aceleração, corrida, terreno), água, pisoteio da grama e desmaio ao fim do dia.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { SPEED } from '../config/balance.js';
import { DAY_MIN, MH, MW, TS, WATER } from '../config/constants.js';
import { extensible } from './extensions.js';
import { S, sleeping } from './GameState.js';
import { keys } from './InputManager.js';
import { dormir } from './TimeManager.js';
import { playerFx, playerSlow } from '../entities/ai/Perception.js';
import { heartbeatTick } from '../systems/audio/Heartbeat.js';
import { vitalsTick } from '../entities/PlayerHurt.js';
import { cbSpd } from '../entities/Carcass.js';
import { herd, updateHerd } from '../entities/cow/Herd.js';
import { updateChx } from '../entities/farm/Chickens.js';
import { updateFox } from '../entities/farm/FarmFoxes.js';
import { updateEggs } from '../entities/farm/Eggs.js';
import { updateNinhos } from '../entities/farm/Nests.js';
import { updateWrm } from '../entities/farm/Worms.js';
import { npcPos, updateNpc } from '../entities/NPC.js';
import { RUN_COST, RUN_MULT, runDust, running, setRun, setRunDust, terrainSpeed } from '../entities/PlayerMovement.js';
import { updateFauna } from '../entities/wild/Fauna.js';
import { fecesTick } from '../world/Feces.js';
import { sfxTick } from '../systems/audio/AmbientSounds.js';
import { pBlocked } from '../systems/CollisionSystem.js';
import { tillTick } from '../systems/FarmingSystem.js';
import { dlgOpen } from '../ui/Dialog.js';
import { joyX, joyY } from '../ui/MobileControls.js';
import { toast } from '../ui/Toast.js';
import { dust, fadeTrails, relaxGrass, updateTrail, walkTrample } from '../world/GrassSystem.js';
import { moveInside } from '../world/HouseInterior.js';
import { hydroTick } from '../world/hydrology/Hydrology.js';
import { INST } from '../world/Instances.js';
import { rainWorld } from '../world/RainSystem.js';
import { updateVendor } from '../world/village/Vendor.js';
import { waterTick } from '../world/WaterSystem.js';
import { climate, updateClimate } from '../world/WeatherSystem.js';
import { ground } from '../world/World.js';

/* ============ ATUALIZAÇÃO ============ */
const update = extensible(function update(dt) {
  if (!sleeping) S.min += dt;
  updateClimate(dt);
  rainWorld(dt);
  updateVendor(dt);
  updateChx(dt);
  updateNinhos(dt);
  updateEggs(dt);
  updateWrm(dt);
  updateFox(dt);
  hydroTick(dt);
  updateHerd(dt);
  updateFauna(dt);
  if (!sleeping) {
    fecesTick(dt);
    vitalsTick(dt);
    heartbeatTick(); // vida baixa: coração batendo cada vez mais rápido e forte
  }
  updateNpc(dt);
  tillTick(dt);
  sfxTick(dt);
  const kx = S.inside ? 0 : (keys['d'] || keys['arrowright'] ? 1 : 0) - (keys['a'] || keys['arrowleft'] ? 1 : 0) + joyX;
  const ky = S.inside ? 0 : (keys['s'] || keys['arrowdown'] ? 1 : 0) - (keys['w'] || keys['arrowup'] ? 1 : 0) + joyY;
  const ix = Math.max(-1, Math.min(1, kx)),
    iy = Math.max(-1, Math.min(1, ky));
  const mag = Math.hypot(ix, iy);
  // movimento suave: aceleração/desaceleração, direção sem tremer na diagonal, passos proporcionais à distância
  if (playerFx.ko) S.vx = S.vy = 0; // desmaiado: deitado, não anda nem é empurrado
  const can = !sleeping && !dlgOpen && !playerFx.ko && mag > 0.12,
    ts = can ? terrainSpeed() * (1 - 0.38 * (S.wetK || 0)) * playerSlow() : 1; // playerSlow: preso pela sucuri
  const wantRun = (running || keys['shift']) && can && !S.inside;
  if (wantRun && S.energy <= 0) {
    setRun(false);
    toast('Sem energia para correr');
  }
  const runNow = wantRun && S.energy > 0,
    rk = (runNow ? RUN_MULT : 1) * cbSpd;
  if (runNow) {
    S.energy = Math.max(0, S.energy - RUN_COST * dt);
    setRunDust(runDust - dt); // correr: +30% de velocidade, -0,5% de energia por segundo
    if (runDust <= 0) {
      setRunDust(0.11);
      if (climate.wetness < 0.3 && ground[Math.floor(S.py / TS) * MW + Math.floor(S.px / TS)] !== WATER) {
        dust.push({
          x: S.px - S.fx * 3,
          y: S.py - 1,
          vx: (Math.random() - 0.5) * 8 - S.fx * 10,
          vy: -3 - Math.random() * 4,
          t: 0,
          r: 1 + Math.random() * 1.5,
        });
        if (dust.length > 50) dust.shift();
      }
    }
  }
  const tvx = can ? (ix / mag) * SPEED * rk * Math.min(mag, 1) * ts : 0,
    tvy = can ? (iy / mag) * SPEED * rk * Math.min(mag, 1) * ts : 0;
  const kk = Math.min(1, dt * (can ? 14 : 20));
  S.vx = (S.vx || 0) + (tvx - (S.vx || 0)) * kk;
  S.vy = (S.vy || 0) + (tvy - (S.vy || 0)) * kk;
  if (!can && Math.hypot(S.vx, S.vy) < 3) {
    S.vx = 0;
    S.vy = 0;
  }
  S.mv = false;
  if (Math.hypot(S.vx, S.vy) > 1) {
    const dx = S.vx * dt,
      dy = S.vy * dt;
    let mx = 0,
      my = 0;
    if (!pBlocked(S.px + dx, S.py)) {
      S.px += dx;
      mx = dx;
    } else S.vx = 0;
    if (!pBlocked(S.px, S.py + dy)) {
      S.py += dy;
      my = dy;
    } else S.vy = 0;
    const dist = Math.hypot(mx, my);
    S.mv = dist > 0.05;
    S.walk += dist * 0.2;
    if (can) {
      const ax = Math.abs(ix),
        ay = Math.abs(iy),
        horiz = S.fx !== 0;
      if ((horiz && ay > ax * 1.3) || (!horiz && ax > ay * 1.3) || (S.fx === 0 && S.fy === 0)) {
        if (ax > ay) {
          S.fx = ix > 0 ? 1 : -1;
          S.fy = 0;
        } else {
          S.fy = iy > 0 ? 1 : -1;
          S.fx = 0;
        }
      } else if (horiz) {
        S.fx = ix > 0 ? 1 : ix < 0 ? -1 : S.fx;
      } else {
        S.fy = iy > 0 ? 1 : iy < 0 ? -1 : S.fy;
      }
    }
  }
  if (!S.inside) waterTick(dt);
  if (S.inside) moveInside(dt);
  if (!sleeping) {
    const n = npcPos();
    if ((S.wetK || 0) < 0.2) walkTrample('p', S.px, S.py, 1, 'p');
    if (INST.homeAct) {
      walkTrample('n', n.x, n.y, 0.8, 'n');
      for (let k = 0; k < herd.length; k++) {
        const q = herd[k];
        walkTrample('c' + k, q.x, q.y, q.calf ? 0.5 : 1.1, 'cow');
      }
    }
    updateTrail(dt);
    relaxGrass(dt);
    fadeTrails(dt);
  }
  S.px = Math.max(TS, Math.min(MW * TS - TS, S.px));
  S.py = Math.max(TS, Math.min(MH * TS - TS, S.py));
  if (!sleeping && S.min >= DAY_MIN) dormir(true);
});

export { update };
