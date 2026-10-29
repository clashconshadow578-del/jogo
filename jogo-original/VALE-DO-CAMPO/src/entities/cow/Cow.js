/**
 * Comportamento da vaca: máquina de estados (pastar, beber, sombra, descansar, seguir companhia), pastejo que come a grama e o mato.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { FOOD, lureDecision, lureSlot, LURE_REPATH_SEC } from '../../config/animalFood.js';
import { GRASS, HN, MH, MW, OX, OY, TREE, TS, WATER } from '../../config/constants.js';
import { S, sleeping } from '../../core/GameState.js';
import { nightF, sunInfo } from '../../core/TimeManager.js';
import { findPath, losWith, moveEnt, turnTo, wpick } from '../ai/Steering.js';
import { aniInit, relOf } from '../animals/AnimalSocial.js';
import { bTick } from './CowGenetics.js';
import { gest, herd } from './Herd.js';
import { npc } from '../NPC.js';
import { blocked } from '../../systems/CollisionSystem.js';
import { crossesFence } from '../../systems/FenceQuery.js';
import { heldFood } from '../farm/Chickens.js';
import { toast } from '../../ui/Toast.js';
import { rr } from '../../utils/Random.js';
import { GH, gid, GRASS_RES, grassDirty, grassGraze, grassWear, GW, setGrassDirty } from '../../world/GrassSystem.js';
import { drinkSpots, lakeLevel, mato, nut, setLakeLevel, wl } from '../../world/hydrology/Hydrology.js';
import { climate } from '../../world/WeatherSystem.js';
import { ground, obj } from '../../world/World.js';

function pickCowDir() {
  // animais preferem seguir caminhos já batidos
  let best = Math.random() * 6.283,
    bs = -1;
  for (let k = 0; k < 8; k++) {
    const a = Math.random() * 6.283,
      fx = cow.x + Math.cos(a) * 14,
      fy = cow.y + Math.sin(a) * 14;
    if (!cowCanWalk(fx, fy)) continue;
    const i = gid(fx, fy),
      sc = Math.random() * 0.6 + (i < 0 ? 0 : (grassWear[i] / 255) * 2.2);
    if (sc > bs) {
      bs = sc;
      best = a;
    }
  }
  return best;
}

let cow = { x: (22 + OX) * TS + 8, y: (17 + OY) * TS + 8, dir: 1, walk: 0, rest: 0, pet: 0, thirst: 0.5, hunger: 0.3 };

/**
 * A vaca pode estar em (x,y)? Três pontos de teste com a caixa de `blocked()` ao redor de cada um: a pegada
 * total fica com ~12px de largura, o que permite passar por um portão de 1 tile (16px) sem raspar na cerca.
 */
function cowCanWalk(x, y) {
  return (
    !blocked(x - 2, y - 2) &&
    !blocked(x + 2, y - 2) &&
    !blocked(x, y + 2) &&
    Math.hypot(x - ((22 + OX) * TS + 8), y - ((17 + OY) * TS + 8)) < 420
  );
}

let shoreList = null;

function shores() {
  // margens onde dá para beber/olhar a água
  if (shoreList) return shoreList;
  shoreList = [];
  for (let ty = 1; ty < MH - 1; ty++)
    for (let tx = 1; tx < MW - 1; tx++) {
      if (ground[ty * MW + tx] !== GRASS || obj[ty * MW + tx]) continue;
      for (const fx of [-1, 1])
        if (ground[ty * MW + tx + fx] === WATER) shoreList.push({ x: tx * TS + 8, y: ty * TS + 12, fx });
    }
  return shoreList;
}

function grazeAt(x, y, amt) {
  const cx = Math.floor(x / GRASS_RES),
    cy = Math.floor(y / GRASS_RES);
  for (let oy = -2; oy <= 2; oy++)
    for (let ox = -2; ox <= 2; ox++) {
      const gx = cx + ox,
        gy = cy + oy;
      if (gx < 0 || gy < 0 || gx >= GW || gy >= GH) continue;
      if (ground[Math.floor(gy / GRASS_RES) * MW + Math.floor(gx / GRASS_RES)] !== GRASS) continue;
      const f = Math.max(0, 1 - Math.hypot(ox, oy) / 2.8),
        id = gy * GW + gx;
      grassGraze[id] = Math.min(255, grassGraze[id] + Math.round(amt * f));
    }
  {
    const ti = Math.floor(y / TS) * MW + Math.floor(x / TS);
    if (ti >= 0 && ti < HN) {
      mato[ti] = Math.max(0, mato[ti] - amt * 0.9);
      nut[ti] = Math.min(1, nut[ti] + amt * 0.0004);
    }
  } // vaca come o mato
  setGrassDirty(true);
}

/* ---------- VACA ---------- */
function losCow(x0, y0, x1, y1) {
  return losWith(cowCanWalk, x0, y0, x1, y1);
}

function cowStart(x, y, after, t, fx, sp) {
  const c = cow;
  c.gx = x;
  c.gy = y;
  c.after = after;
  c.afterT = t;
  c.arrFx = fx || 0;
  c.sp = sp || c.spd * (nightF(6 + S.min / 60) > 0.55 ? 0.7 : 1) * rr(0.8, 1.2);
  c.state = 'walk';
  c.stuck = 0;
  c.walkT = 0;
}

function grazeSpot() {
  let best = null,
    bs = -9;
  for (let k = 0; k < 24; k++) {
    const a = Math.random() * 6.283,
      d = rr(8, 110),
      x = cow.x + Math.cos(a) * d,
      y = cow.y + Math.sin(a) * d;
    if (
      !cowCanWalk(x, y) ||
      ground[Math.floor(y / TS) * MW + Math.floor(x / TS)] !== GRASS ||
      !losCow(cow.x, cow.y, x, y)
    )
      continue;
    const i = gid(x + (Math.cos(a) < 0 ? -10 : 10), y - 1),
      sc =
        (i < 0 ? 0 : (255 - grassGraze[i]) / 255 - (grassWear[i] / 255) * 1.5) +
        Math.random() * 0.35 -
        d / 260 +
        (mato[Math.floor(y / TS) * MW + Math.floor(x / TS)] / 255) * 1.4; // prefere capim alto e intacto
    if (sc > bs) {
      bs = sc;
      best = { x, y, fx: Math.cos(a) < 0 ? -1 : 1 };
    }
  }
  return best;
}

function cowGoal(rmin, rmax) {
  for (let k = 0; k < 10; k++) {
    const a = Math.random() * 6.283,
      d = rr(rmin, rmax),
      x = cow.x + Math.cos(a) * d,
      y = cow.y + Math.sin(a) * d;
    if (cowCanWalk(x, y) && losCow(cow.x, cow.y, x, y)) return { x, y };
  }
  return null;
}

function cowShade() {
  const h = 6 + S.min / 60,
    sn = sunInfo(h);
  let best = null,
    bd = 1e9;
  for (let ty = 0; ty < MH; ty++)
    for (let tx = 0; tx < MW; tx++) {
      if (obj[ty * MW + tx] !== TREE) continue;
      const bx = tx * TS + 8,
        by = (ty + 1) * TS,
        d = Math.hypot(bx - cow.x, by - cow.y);
      if (d > 140 || d >= bd) continue;
      for (const m of [10, 16]) {
        const x = bx + sn.dirX * m,
          y = by + sn.dirY * m + 4;
        if (cowCanWalk(x, y) && losCow(cow.x, cow.y, x, y)) {
          bd = d;
          best = { x, y };
          break;
        }
      }
    }
  return best;
}

function cowGo(x, y, after, t, fx, sp) {
  // anda por caminho (desvia de árvores/lago)
  const c = cow,
    p = findPath(c.x, c.y, x, y, cowCanWalk);
  if (!p || !p.length) {
    c.state = 'rest';
    c.t = rr(1.5, 3);
    return false;
  }
  c.path = p;
  c.after = after;
  c.afterT = t;
  c.arrFx = fx || 0;
  c.sp = sp || c.spd * (c.calf ? 1.4 : 1) * (nightF(6 + S.min / 60) > 0.55 ? 0.7 : 1) * rr(0.9, 1.25);
  c.state = 'walk';
  c.stuck = 0;
  c.walkT = 0;
  return true;
}

function cowFar(rmin, rmax) {
  for (let k = 0; k < 14; k++) {
    const a = Math.random() * 6.283,
      d = rr(rmin, rmax),
      x = cow.x + Math.cos(a) * d,
      y = cow.y + Math.sin(a) * d;
    if (cowCanWalk(x, y)) return { x, y };
  }
  return null;
}

function cowAtWater() {
  const c = cow,
    tx = Math.floor(c.x / TS),
    ty = Math.floor(c.y / TS),
    i = ty * MW + tx;
  if (c.src === 'wet')
    return (
      wl[i] > 0.04 ||
      (c.srcI != null &&
        wl[c.srcI] > 0.04 &&
        Math.abs((c.srcI % MW) - tx) <= 1 &&
        Math.abs(((c.srcI / MW) | 0) - ty) <= 1)
    );
  return ground[i - 1] === WATER || ground[i + 1] === WATER || ground[i - MW] === WATER || ground[i + MW] === WATER;
}

function cowArrive() {
  const c = cow;
  c.path = null;
  c.state = c.after;
  c.t = c.afterT;
  if (c.arrFx) c.fx = c.arrFx;
  c.bite = 0;
  if (c.state === 'drink' && !cowAtWater()) {
    c.state = 'rest';
    c.t = 1;
    return;
  }
  if (c.after === 'rest' && c.arrFx === 0 && Math.hypot(S.px - c.x, S.py - c.y) < 40)
    c.look = Math.atan2(S.py - c.y, S.px - c.x);
}

function cowFind(id) {
  for (const q of herd) if (q.id === id) return q;
  return null;
}

// Preferência social: bezerro segue a mãe; adultos sociais preferem andar com a companheira de maior vínculo
function cowCompanion(c) {
  if (c.calf) {
    const m = cowFind(c.mom);
    if (m) return m;
  }
  if (gest && (c === gest.mom || c === gest.dad)) return c === gest.mom ? gest.dad : gest.mom;
  if (c.indep) return null;
  let best = null,
    bs = -9;
  for (const q of herd) {
    if (q === c || q.calf || relOf(c, q) < -0.2) continue;
    const sc = (c.bonds[q.id] || 0) + 0.2 - Math.hypot(q.x - c.x, q.y - c.y) / 1500;
    if (sc > bs) {
      bs = sc;
      best = q;
    }
  }
  return best;
}

// Decide o próximo interesse pela necessidade: sede, fome, calor, companhia, curiosidade, vontade de passear
function cowNext() {
  const c = cow,
    h = 6 + S.min / 60,
    night = nightF(h) > 0.55,
    hot = h > 10.5 && h < 16 && climate.cloud < 0.55 && climate.rain < 0.15,
    rain = climate.rain > 0.3,
    near = Math.hypot(S.px - c.x, S.py - c.y);
  {
    const av = c.avoidT > 0 && c.avoid != null ? cowFind(c.avoid) : null;
    if (av) {
      const dd = Math.hypot(c.x - av.x, c.y - av.y);
      if (dd < 100) {
        const an = Math.atan2(c.y - av.y, c.x - av.x) + rr(-0.6, 0.6),
          L = rr(60, 110),
          x = c.x + Math.cos(an) * L,
          y = c.y + Math.sin(an) * L;
        if (cowCanWalk(x, y)) {
          cowGo(x, y, 'rest', rr(3, 8), Math.cos(an) < 0 ? -1 : 1, c.spd * 1.35);
          return;
        }
      }
    }
  }
  const th = c.thirst,
    hu = c.hunger,
    sh = th > 0.3 ? drinkSpots() : [];
  c.lookT = 0;
  const pal = cowCompanion(c),
    pd = pal ? Math.hypot(pal.x - c.x, pal.y - c.y) : 0,
    paired = !!(gest && (c === gest.mom || c === gest.dad));
  const tie = pal ? (c.calf ? 1 : paired ? 0.9 : c.social * (0.4 + (c.bonds[pal.id] || 0) * 0.6)) : 0,
    roam = 1 - tie * 0.85;
  const o = [['rest', night ? 90 : rain ? 40 : 10]];
  aniInit(c);
  const pf = c.pref;
  if (!night) o.push(['graze', (hu > 0.25 ? hu * 170 : 12) * pf.food]);
  o.push(['wander', (night ? 5 : 22) * (c.calf ? 0.8 : roam)]);
  if (!night && !rain && !c.calf) o.push(['explore', 18 * roam * pf.explore]);
  if ((c.shadeCd || 0) <= 0 && !c.calf && !night && !rain)
    o.push(['shade', hot ? 55 + pf.shade * 60 : 6 + pf.shade * 34]);
  if (sh.length) o.push(['drink', (th > 0.6 ? 600 : th * 170) * pf.water]);
  if (!night && near < 140 && c.bold > 0.4 && !c.calf) o.push(['curious', 18 * roam * (0.4 + pf.player * 1.2)]);
  if (pal && pd > (c.calf ? 26 : 40)) o.push(['join', c.calf ? 600 : paired ? 350 : tie * 220]);
  const k = wpick(o);
  if (k === 'rest') {
    c.state = 'rest';
    c.t = night ? rr(10, 25) : rr(2, 6);
    return;
  }
  if (k === 'graze') {
    const g = grazeSpot();
    if (g) cowGo(g.x, g.y, 'graze', rr(10, 24), g.fx);
    else {
      c.state = 'graze';
      c.t = rr(6, 12);
    }
    return;
  }
  if (k === 'wander' || k === 'explore') {
    // alguns sorteios: um destino do outro lado de uma cerca não tem caminho, então tenta outro
    for (let n = 0; n < 4; n++) {
      const g = k === 'wander' ? cowFar(35, 110) : cowFar(90, 230);
      if (g && cowGo(g.x, g.y, 'rest', k === 'wander' ? rr(1, 3) : rr(2, 6))) return;
    }
    c.state = 'rest';
    c.t = 2;
    return;
  }
  if (k === 'shade') {
    c.shadeCd = 50;
    const g = cowShade();
    if (g && Math.hypot(g.x - c.x, g.y - c.y) > 6) cowGo(g.x, g.y, 'rest', rr(10, 22) + pf.shade * 14);
    else {
      c.state = 'rest';
      c.t = rr(3, 6);
    }
    return;
  }
  if (k === 'drink') {
    let g = sh[0],
      bd = 1e9;
    for (const q of sh) {
      const d = Math.hypot(q.x - c.x, q.y - c.y) + Math.random() * 30;
      if (d < bd) {
        bd = d;
        g = q;
      }
    }
    c.src = g.src;
    c.srcI = g.i;
    cowGo(g.x, g.y, 'drink', 14, g.fx, c.spd * 1.3);
    return;
  }
  if (k === 'curious') {
    const d = Math.max(1, near),
      x = S.px + ((c.x - S.px) / d) * 28,
      y = S.py + ((c.y - S.py) / d) * 28;
    if (cowCanWalk(x, y)) cowGo(x, y, 'rest', rr(3, 7), 0, c.spd * 0.9);
    else {
      c.state = 'rest';
      c.t = 2;
    }
    return;
  }
  if (k === 'join') {
    const r = c.calf ? rr(10, 20) : rr(18, 32);
    for (let t = 0; t < 8; t++) {
      const a = Math.random() * 6.283,
        x = pal.x + Math.cos(a) * r,
        y = pal.y + Math.sin(a) * r;
      if (cowCanWalk(x, y)) {
        const gz = pal.state === 'graze' || (pal.state === 'walk' && pal.after === 'graze');
        cowGo(
          x,
          y,
          gz ? 'graze' : 'rest',
          gz ? rr(8, 16) : rr(2, 6),
          Math.cos(a) < 0 ? -1 : 1,
          c.calf || paired ? c.spd * 1.5 : c.spd * 1.2,
        );
        return;
      }
    }
    c.state = 'rest';
    c.t = 2;
  }
}

/**
 * Atração por alimento: a vaca vem até o jogador que segura cenoura, abóbora ou milho. Anda em linha reta se
 * enxerga o ponto de parada e, se não, por caminho entre os tiles livres (portão fechado e cerca contam como
 * parede). Sem caminho, fica parada, sem tremer. Nunca é teletransportada.
 */
function cowLure(c, dt) {
  c.state = 'atrai';
  c.eat = false;
  const px = S.px,
    py = S.py,
    f = FOOD.vaca,
    dP = Math.hypot(px - c.x, py - c.y),
    a = Math.atan2(py - c.y, px - c.x);
  turnTo(c, a, dt);
  if (Math.abs(Math.cos(a)) > 0.3) c.fx = Math.cos(a) < 0 ? -1 : 1;
  if (dP <= f.standoffPx) {
    c.lpath = null; // chegou: fica perto, olhando para o jogador
    return;
  }
  const slot = lureSlot('vaca', c.id, px, py);
  let gx = slot.x,
    gy = slot.y;
  if (!cowCanWalk(gx, gy)) {
    gx = px;
    gy = py;
  }
  let tx = gx,
    ty = gy;
  if (losCow(c.x, c.y, gx, gy)) c.lpath = null;
  else {
    c.lureT = (c.lureT || 0) - dt;
    if (c.lureT <= 0 || !c.lpath) {
      c.lureT = LURE_REPATH_SEC;
      c.lpath = findPath(c.x, c.y, gx, gy, cowCanWalk);
    }
    if (!c.lpath || !c.lpath.length) return; // sem rota (cercada): espera parada
    [tx, ty] = c.lpath[0];
  }
  const arrived = moveEnt(c, tx, ty, c.spd * (c.calf ? 1.4 : 1) * 1.3 * f.speedMul, dt, cowCanWalk);
  c.walk = c.mv;
  if (arrived && c.lpath) c.lpath.shift();
  if (c.stuck > 0.8) c.lureT = 0; // encostou em algo: recalcula o caminho
}

function updateCow(dt) {
  if (sleeping) return;
  const c = cow;
  if (!cowCanWalk(c.x, c.y)) {
    for (let r = 8; r <= 120; r += 8)
      for (let k = 0; k < 6.28; k += 0.5) {
        const x = c.x + Math.cos(k) * r,
          y = c.y + Math.sin(k) * r;
        if (cowCanWalk(x, y) && !crossesFence(c.x, c.y, x, y)) {
          // nunca "teletransporta" para o outro lado de uma cerca
          c.x = x;
          c.y = y;
          c.path = null;
          c.state = 'rest';
          c.t = 1;
          r = 999;
          break;
        }
      }
  } // sai de dentro de árvore/pedra
  if (c.spd == null || c.spd < 14) c.spd = rr(15, 22);
  if (c.bold == null) c.bold = Math.random();
  if (c.hunger == null) c.hunger = 0.3;
  if (!c.state) {
    c.state = 'rest';
    c.t = 2;
  }
  if (!c.fx) c.fx = -1;
  c.pet = Math.max(0, c.pet - dt);
  c.walk = false;
  c.eat = false;
  c.shadeCd = Math.max(0, (c.shadeCd || 0) - dt);
  c.thirst = Math.min(
    1,
    (c.thirst == null ? 0.3 : c.thirst) + dt * 0.008 * (Math.floor((S.day - 1) / 28) % 4 === 1 ? 1.6 : 1),
  );
  c.hunger = Math.min(1, c.hunger + dt * 0.004);
  c.age = (c.age || 0) + dt;
  bTick(c, dt);
  if (c.calf && c.age >= 360) {
    c.calf = false;
    c.indep = Math.random() < 0.5;
    c.social = c.indep ? 0.15 : 0.7;
    toast('🐄 Um bezerro virou adulto' + (c.indep ? ' e foi viver por conta própria' : ' e ficou com o rebanho'));
  }
  if (c.pet > 0) {
    // carinho: para e olha para quem está perto
    c.state = 'pet';
    const t =
        !npc.inside && Math.hypot(npc.x - c.x, npc.y - c.y) < Math.hypot(S.px - c.x, S.py - c.y)
          ? npc
          : { x: S.px, y: S.py },
      a = Math.atan2(t.y - c.y, t.x - c.x);
    turnTo(c, a, dt);
    if (Math.abs(Math.cos(a)) > 0.3) c.fx = Math.cos(a) < 0 ? -1 : 1;
    return;
  }
  if (c.state === 'pet') {
    c.state = 'rest';
    c.t = rr(1, 2.5);
  }
  {
    const want = !S.inside && lureDecision('vaca', heldFood(), Math.hypot(S.px - c.x, S.py - c.y), c.state === 'atrai');
    if (want) {
      if (c.state !== 'atrai') {
        c.path = null;
        c.lpath = null;
        c.lureT = 0;
      }
      cowLure(c, dt);
      return;
    }
    if (c.state === 'atrai') {
      // perdeu o interesse (saiu do raio ou guardou o alimento): volta à rotina normal
      c.state = 'rest';
      c.t = rr(1, 2.5);
      c.lpath = null;
      c.path = null;
    }
  }
  c.t = (c.t || 0) - dt;
  switch (c.state) {
    case 'rest':
      c.lookT = (c.lookT || 0) - dt;
      if (c.lookT <= 0) {
        c.lookT = rr(2, 6);
        c.look = [0, 1.57, 3.14, -1.57][Math.floor(Math.random() * 4)];
        if (Math.abs(Math.cos(c.look)) > 0.5) c.fx = Math.cos(c.look) < 0 ? -1 : 1;
      }
      turnTo(c, c.look ?? c.dir, dt);
      if (c.t <= 0) cowNext();
      break;
    case 'walk': {
      c.walkT = (c.walkT || 0) + dt;
      const w = c.path && c.path[0];
      if (!w) {
        cowArrive();
        break;
      }
      if (moveEnt(c, w[0], w[1], c.sp, dt, cowCanWalk)) c.path.shift();
      c.walk = c.mv;
      if (!c.path.length) {
        cowArrive();
        break;
      }
      if (c.stuck > 1.5 || c.walkT > 60) {
        c.path = null;
        c.state = 'rest';
        c.t = rr(1, 2);
      }
      break;
    }
    case 'graze': {
      c.eat = true;
      c.bite = (c.bite || 0) + dt;
      if (c.bite > 0.62) {
        c.bite = 0;
        const hx = c.x + c.fx * 10,
          hy = c.y - 1,
          i = gid(hx, hy),
          g0 = i >= 0 ? grassGraze[i] : 255;
        grazeAt(hx, hy, 46);
        if (i >= 0 && g0 < 130 && grassGraze[i] >= 130) c.hunger = Math.max(0, c.hunger - 0.05); // +5% de comida por mato comido

        if (i >= 0 && grassGraze[i] >= 130 && c.t > 1.5) {
          const x = c.x + c.fx * rr(5, 9),
            y = c.y + rr(-3, 3);
          if (cowCanWalk(x, y) && ground[Math.floor(y / TS) * MW + Math.floor(x / TS)] === GRASS) {
            const rest = c.t;
            cowGo(x, y, 'graze', rest, c.fx, 7);
          } else if (Math.random() < 0.5) c.fx = -c.fx;
          else c.t = 0;
        }
      }
      if (c.t <= 0 || c.hunger < 0.04 || c.thirst > 0.75) {
        c.state = 'rest';
        c.t = rr(1, 3);
      }
      break;
    }
    case 'drink': {
      c.eat = true;
      const dr = Math.min(c.thirst, dt * 0.25);
      c.thirst = Math.max(0, c.thirst - dr); // dr = fração da bebida cheia (0..1)
      if (c.src === 'lake')
        setLakeLevel(Math.max(0.08, lakeLevel - dr * 0.005)); // bebida cheia = 0,5% do lago
      else if (c.src === 'wet' && c.srcI != null) wl[c.srcI] = Math.max(0, wl[c.srcI] - dr * 0.12);
      if (c.thirst <= 0.02 || c.t <= 0) {
        c.state = 'rest';
        c.t = rr(2, 4);
      }
      break;
    }
    default:
      c.state = 'rest';
      c.t = 1;
  }
}

/** Atualiza `cow` a partir de outros módulos (as ligações importadas são somente leitura). */
export function setCow(value) {
  cow = value;
  return value;
}

/** Atualiza `shoreList` a partir de outros módulos (as ligações importadas são somente leitura). */
export function setShoreList(value) {
  shoreList = value;
  return value;
}

export { cow, cowCanWalk, cowFind, shoreList, shores, updateCow };
