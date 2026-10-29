/**
 * Aldeã da fazenda: rotina com estados (passear, entrar em casa, olhar o jogador), caminho até a porta e falas.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { MW, OX, OXP, OY, OYP, TS, WATER } from '../config/constants.js';
import { extensible } from '../core/extensions.js';
import { S, sleeping } from '../core/GameState.js';
import { findPath, moveEnt, turnTo, wpick } from './ai/Steering.js';
import { cow, shores } from './cow/Cow.js';
import { drawPerson } from '../rendering/Characters.js';
import { blocked, solid } from '../systems/CollisionSystem.js';
import { dlgOpen } from '../ui/Dialog.js';
import { rr } from '../utils/Random.js';
import { climate } from '../world/WeatherSystem.js';
import { crops, ground } from '../world/World.js';

const NPC_HOME = { x: 25 + OX, y: 18 + OY };

const NPC_LINES = [
  'Bom dia, viajante! O solo daqui é generoso.',
  'Plante cenouras cedo. Elas crescem rápido.',
  'Quando escurecer, cuidado perto do lago.',
  'Dormir cedo é o segredo de um bom dia de trabalho.',
];

function npcPos() {
  return { x: npc.x, y: npc.y };
}

/* ---------- ALDEÃ ---------- */
var npc = {
  x: NPC_HOME.x * TS + 8,
  y: NPC_HOME.y * TS + 8,
  dir: 1.57,
  state: 'idle',
  t: 2,
  path: [],
  after: 'idle',
  afterT: 3,
  sp: 20,
  step: 0,
  inside: false,
  lookT: 0,
  mv: false,
  walkP: 0,
};

let NPC_DOOR = { x: 256 + OXP, y: 184 + OYP };

function doorSpot() {
  for (const [tx, ty] of [
    [16, 11],
    [15, 11],
    [17, 11],
    [16, 12],
    [15, 12],
    [17, 12],
    [14, 11],
    [18, 11],
  ].map((p) => [p[0] + OX, p[1] + OY]))
    if (!solid(tx, ty) && !blocked(tx * TS + 8, ty * TS + 6)) {
      NPC_DOOR = { x: tx * TS + 8, y: ty * TS + 6 };
      return NPC_DOOR;
    }
  return null;
}

function npcCan(x, y) {
  return !blocked(x, y);
}

function npcGo(x, y, after, t, face) {
  const p = findPath(npc.x, npc.y, x, y);
  if (!p || !p.length) {
    npc.state = 'idle';
    npc.t = rr(1, 3);
    return;
  }
  npc.goT = 0;
  npc.path = p;
  npc.after = after;
  npc.afterT = t;
  npc.arrDir = face;
  npc.sp = rr(15, 27);
  npc.state = 'go';
  npc.stuck = 0;
}

function npcNext() {
  const n = npc,
    h = 6 + S.min / 60,
    night = h >= 20.8 || h < 6.3,
    rain = climate.rain > 0.35;
  if ((night || rain) && doorSpot()) {
    npcGo(NPC_DOOR.x, NPC_DOOR.y, 'inside', 1e9, null);
    return;
  }
  const cl = Object.keys(crops),
    sh = shores(),
    o = [
      ['wander', 26],
      ['idle', 14],
      ['cow', 16],
    ];
  if (cl.length) o.push(['crops', h < 10 ? 48 : 30]);
  if (sh.length) o.push(['gaze', 10]);
  const k = wpick(o);
  if (k === 'idle') {
    n.state = 'idle';
    n.t = rr(3, 9);
    return;
  }
  if (k === 'wander') {
    for (let i = 0; i < 12; i++) {
      const tx = NPC_HOME.x + Math.round(rr(-9, 9)),
        ty = NPC_HOME.y + Math.round(rr(-7, 7));
      if (!solid(tx, ty) && ground[ty * MW + tx] !== WATER) {
        npcGo(tx * TS + 8, ty * TS + 8, 'idle', rr(1.5, 5), null);
        return;
      }
    }
    n.state = 'idle';
    n.t = 2;
    return;
  }
  if (k === 'crops') {
    const i = +cl[Math.floor(Math.random() * cl.length)],
      tx = i % MW,
      ty = (i / MW) | 0,
      below = !solid(tx, ty + 1),
      sy = below ? ty + 1 : ty - 1;
    if (solid(tx, sy)) {
      n.state = 'idle';
      n.t = 2;
      return;
    }
    npcGo(tx * TS + 8, sy * TS + 8, 'work', rr(5, 12), below ? -1.57 : 1.57);
    return;
  }
  if (k === 'cow') {
    const sd = Math.random() < 0.5 ? -1 : 1;
    npcGo(cow.x + sd * 22, cow.y, 'chat', rr(3, 6), null);
    return;
  }
  if (k === 'gaze') {
    const s = sh[Math.floor(Math.random() * sh.length)];
    npcGo(s.x, s.y - 2, 'gaze', rr(6, 14), s.fx > 0 ? 0 : Math.PI);
  }
}

function npcArrive() {
  const n = npc;
  n.state = n.after;
  n.t = n.afterT;
  n.look = undefined;
  if (n.arrDir != null) n.dir = n.arrDir;
  if (n.state === 'inside') n.inside = true;
}

const updateNpc = extensible(function updateNpc(dt) {
  const n = npc,
    h = 6 + S.min / 60;
  if (sleeping) return;
  n.mv = false;
  if (n.inside) {
    if (!(h >= 20.8 || h < 6.3) && climate.rain < 0.2) {
      n.inside = false;
      n.x = NPC_DOOR.x;
      n.y = NPC_DOOR.y + 4;
      n.state = 'idle';
      n.t = 1.5;
    }
    return;
  }
  if (dlgOpen && Math.hypot(S.px - n.x, S.py - n.y) < 44 && n.state !== 'talk') n.state = 'talk';
  if (n.state === 'talk') {
    turnTo(n, Math.atan2(S.py - n.y, S.px - n.x), dt);
    if (!dlgOpen) {
      n.state = 'idle';
      n.t = rr(1, 2.5);
    }
    return;
  }
  n.t -= dt;
  switch (n.state) {
    case 'idle':
      n.lookT -= dt;
      if (n.lookT <= 0) {
        n.lookT = rr(1, 3.2);
        n.look = n.dir + rr(-2.2, 2.2);
      }
      turnTo(n, n.look ?? n.dir, dt);
      if (n.t <= 0) npcNext();
      break;
    case 'go': {
      n.goT = (n.goT || 0) + dt;
      const w = n.path[0];
      if (!w) {
        npcArrive();
        break;
      }
      if (moveEnt(n, w[0], w[1], n.sp, dt, npcCan)) n.path.shift();
      if (n.stuck > 1.2 || n.goT > 40) {
        n.path.length = 0;
        n.state = 'idle';
        n.t = rr(1, 2);
      }
      break;
    }
    case 'work':
      n.walkP += dt * 5;
      if (n.t <= 0) npcNext();
      break;
    case 'chat':
      cow.pet = Math.max(cow.pet, 0.6);
      turnTo(n, Math.atan2(cow.y - n.y, cow.x - n.x), dt);
      if (n.t <= 0) npcNext();
      break;
    case 'gaze':
      if (n.t <= 0) npcNext();
      break;
  }
});

function drawVillager() {
  const n = npc,
    c = Math.cos(n.dir),
    s = Math.sin(n.dir),
    face = Math.abs(c) > Math.abs(s) ? (c > 0 ? 1 : -1) : s > 0 ? 0 : 2;
  drawPerson(
    n.x,
    n.y - (n.state === 'work' ? Math.round(Math.abs(Math.sin(n.walkP))) : 0),
    '#d64545',
    '#ffd166',
    n.mv ? n.step * 0.55 : 0,
    face,
  );
}

export { NPC_HOME, NPC_LINES, drawVillager, npc, npcPos, updateNpc };
