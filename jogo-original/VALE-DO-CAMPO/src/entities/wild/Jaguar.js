/**
 * Onça-pintada: território, caça por espreita e bote, arrasto da presa, árvores, pesca, acasalamento e filhotes.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { MH, MW, TREE, TS, WATER, WN } from '../../config/constants.js';
import { S } from '../../core/GameState.js';
import { nightF, sunInfo } from '../../core/TimeManager.js';
import { turnTo, wpick } from '../ai/Steering.js';
import { ECO, HUNT, PLAYER_PREY, aggression, huntDecision, huntFor } from '../../config/ecosystem.js';
import {
  animalTarget as animalTargetOf,
  claimPlayerHunt,
  ecoNow,
  evalPrey,
  memAdd,
  percTick,
  playerFx,
  playerTarget,
  releasePlayerHunt,
  senseTarget,
} from '../ai/Perception.js';
import { carcassFx, carcT, faDie } from '../Carcass.js';
import { plAct } from '../PlayerSprite.js';
import { hurtPlayer } from '../PlayerHurt.js';
import {
  boarMates,
  FA_SP,
  faFlee,
  faFree,
  faGo,
  faPick,
  faRow,
  faShoreL,
  faShoreNear,
  faSpawn,
  faSpot,
  fauna,
} from './Fauna.js';
import { ctx } from '../../rendering/Canvas.js';
import { bakeImg } from '../../rendering/SpriteUtils.js';
import { beep } from '../../systems/audio/AudioSystem.js';
import { crossesFence } from '../../systems/FenceQuery.js';
import { FISH, isW } from '../../systems/Fishing.js';
import { toast } from '../../ui/Toast.js';
import { assetUrl } from '../../utils/assets.js';
import { rr } from '../../utils/Random.js';
import { bgAdd, fSnap } from '../../world/BackgroundSim.js';
import { INST } from '../../world/Instances.js';
import { WG, WGW, wImpulse, wM, wSplash } from '../../world/WaterSystem.js';
import { climate } from '../../world/WeatherSystem.js';
import { ground, obj } from '../../world/World.js';

/* ================= ONÇA-PINTADA (Panthera onca) =================
   Predador de topo, emboscador solitário (aqui: o casal fundador), crepuscular/noturno.
   Rastreia → esgueira-se agachada → salta e morde a nuca/crânio → arrasta a presa para a cobertura e come.
   Nada muito bem (pesca peixes), sobe em árvores para descansar e para emboscar de cima. */
const JG_META = {
  walk_d: [0, 8],
  walk_u: [1, 8],
  walk_l: [2, 4],
  walk_r: [3, 4],
  run_r: [4, 4],
  stalk_r: [5, 2],
  pounce_r: [6, 4],
  roar_r: [7, 4],
  rest_r: [8, 2],
  swim_r: [9, 4],
  swim_d: [10, 8],
  swim_u: [11, 8],
};

let JG_CV = null;
const JG_IMG = new Image();

const JG = {
  W: 96,
  H: 72,
  KID: 420,
  HP: 70,
  BITE: 9.5,
  prey: {
    deer: { hp: 32, ctr: 1.2, hun: 0.85, n: 'um cervo', w: 3 },
    boar: { hp: 38, ctr: 3.8, hun: 1, n: 'uma queixada', w: 1.6 },
    hare: { hp: 10, ctr: 0.5, hun: 0.3, n: 'uma lebre', w: 1 },
    grouse: { hp: 8, ctr: 0.3, hun: 0.2, n: 'um galo-lira', w: 0.8 },
    fox: { hp: 24, ctr: 1.6, hun: 0.35, n: 'uma raposa', w: 0.5 },
  },
};

function jFree(x, y) {
  for (const ox of [-3, 3]) {
    const tx = Math.floor((x + ox) / TS),
      ty = Math.floor(y / TS);
    if (tx < 1 || ty < 1 || tx >= MW - 1 || ty >= MH - 1 || obj[ty * MW + tx] !== 0) return false;
  }
  return true;
} // a onça atravessa água a nado

function jStep(a, tx, ty, sp, dt, turnK) {
  const dx = tx - a.x,
    dy = ty - a.y,
    d = Math.hypot(dx, dy);
  if (d < 2) return true;
  turnTo(a, Math.atan2(dy, dx), dt * (turnK || (a.state === 'pounce' || a.state === 'drop' ? 9 : 1.8)));
  const st = Math.min(d, sp * (a.sw ? 0.6 : 1) * dt);
  let ok = false;
  for (const off of [0, 0.7, -0.7, 1.4, -1.4]) {
    const an = a.dir + off,
      nx = a.x + Math.cos(an) * st,
      ny = a.y + Math.sin(an) * st;
    if (jFree(nx, ny)) {
      a.x = Math.max(TS * 2, Math.min(MW * TS - TS * 2, nx));
      a.y = Math.max(TS * 2, Math.min(MH * TS - TS * 2, ny));
      ok = true;
      break;
    }
  }
  a.mv = ok;
  a.stuck = ok ? Math.max(0, a.stuck - dt) : a.stuck + dt;
  return false;
}

function jagAct(h) {
  const n = nightF(h),
    c = 4 * n * (1 - n);
  return Math.min(1, 0.18 + 0.85 * c + 0.7 * n);
} // pico no crepúsculo e na noite

function jagMate(a) {
  let b = null,
    bd = 1e9;
  for (const q of fauna)
    if (q.sp === 'jaguar' && q !== a && q.state !== 'dead' && q.sex !== a.sex && q.age >= JG.KID) {
      const d = Math.hypot(q.x - a.x, q.y - a.y);
      if (d < bd) {
        bd = d;
        b = q;
      }
    }
  return b;
}

function jagCount() {
  let n = 0;
  for (const q of fauna) if (q.sp === 'jaguar' && q.state !== 'dead') n++;
  return n;
}

function jagMom(a) {
  let m = fauna.find((q) => q.id === a.mom && q.state !== 'dead' && q.sp === 'jaguar');
  if (m) return m;
  let bd = 400;
  for (const q of fauna)
    if (q.sp === 'jaguar' && q.sex === 'f' && q.age >= JG.KID && q.state !== 'dead') {
      const d = Math.hypot(q.x - a.x, q.y - a.y);
      if (d < bd) {
        bd = d;
        m = q;
      }
    }
  return m;
}

function jagHasCubs(a) {
  return fauna.some(
    (q) =>
      q.sp === 'jaguar' &&
      q.age < JG.KID &&
      q.state !== 'dead' &&
      Math.hypot(q.x - a.x, q.y - a.y) < 130 &&
      (q.mom === a.id || jagMom(q) === a),
  );
}

function jagOk(p) {
  return p && !p.gone && p.state !== 'dead' && p.state !== 'fly' && p.state !== 'land' && p.state !== 'fight';
}

/**
 * Procura a melhor presa que a onça DETECTA (visão, audição, faro quando faminta) e avalia a oportunidade:
 * chance de captura × valor (a fome só aumenta o valor) − custo/risco. Retorna { p, ev, dec, rank } ou null,
 * com dec 'attack' | 'observe'. Presas atrás de cercas são inacessíveis. Não depende de fome.
 */
function jagPrey(a, R, sport) {
  // faminta (aggr): enxerga oportunidade em mais presas, de mais longe, e aceita mais risco (ver huntFor em config/ecosystem.js)
  const HH = huntFor(HUNT.jaguar, aggression(a.hun));
  R = Math.max(R, HH.scanR);
  let best = null;
  for (const p of fauna) {
    const P = JG.prey[p.sp];
    if (
      !P ||
      p.state === 'dead' ||
      p.state === 'fight' ||
      p.state === 'fly' ||
      p.state === 'land' ||
      p.hunter ||
      p.gone
    )
      continue;
    if (Math.abs(p.x - a.x) > R || Math.abs(p.y - a.y) > R) continue;
    if (crossesFence(a.x, a.y, p.x, p.y)) continue; // cerca intransponível: presa inacessível
    const bm = p.sp === 'boar' ? boarMates(p, 55) : 0;
    if (bm >= 2 && a.hun < 0.85) continue; // bando de queixadas é perigoso demais
    const r = evalPrey(a, p, {
      hunt: HH,
      vPred: FA_SP.jaguar.run,
      vPrey: FA_SP[p.sp].run,
      value: P.hun,
      counter: Math.min(1, (P.ctr * (1 + bm * 0.9)) / 4),
      scanR: R,
      driveMul: sport ? 1.4 : 1,
    });
    if (!r) continue;
    r.dec = huntDecision(
      r.ev,
      HH,
      (Math.random() - 0.5) * 0.05 + ((a.bold == null ? 0.5 : a.bold) - 0.5) * 0.05,
    );
    if (r.dec === 'skip') continue;
    r.rank = r.ev.score * P.w * (p.age < 150 ? 1.4 : 1) * (0.8 + Math.random() * 0.4);
    if (!best || r.rank > best.rank) best = r;
  }
  return best;
}

/** Começa a lidar com uma presa detectada: espreita para atacar ('attack') ou só observa à distância sem se comprometer. */
function jagEngage(a, r, sport) {
  a.tgt = r.p;
  a.sport = sport;
  a.obsN = 0;
  a.lastSeen = { x: r.p.x, y: r.p.y, t: ecoNow() };
  a.loseT = 0;
  if (r.dec === 'attack') {
    a.state = 'stalk';
    a.t = 45;
  } else {
    a.state = 'observe';
    a.t = rr(3, 6);
  }
}

/** A onça vê a presa agora? Guarda a última posição vista (se perder, só conhece essa posição). */
function jagSees(a, p, dt) {
  if (!percTick(a, dt, 'j')) return a.seeTgt;
  const s = senseTarget(a, animalTargetOf(p));
  // o faro (420 px) serve para ENCONTRAR a presa e ir até onde ela estava; acompanhá-la na corrida exige ver, ouvir ou estar bem perto
  a.seeTgt = s.seen || s.heard || (s.smelled && s.dist <= 150);
  if (a.seeTgt) {
    a.lastSeen = { x: p.x, y: p.y, t: ecoNow() };
    a.loseT = 0;
  } else a.loseT = (a.loseT || 0) + 0.25;
  return a.seeTgt;
}

/** Reavalia uma presa já detectada: 'attack' | 'observe' | 'skip'. */
function jagDecide(a, p) {
  const P = JG.prey[p.sp];
  if (!P) return 'skip';
  const HH = huntFor(HUNT.jaguar, aggression(a.hun)),
    bm = p.sp === 'boar' ? boarMates(p, 55) : 0,
    r = evalPrey(a, p, {
      hunt: HH,
      vPred: FA_SP.jaguar.run,
      vPrey: FA_SP[p.sp].run,
      value: P.hun,
      counter: Math.min(1, (P.ctr * (1 + bm * 0.9)) / 4),
      scanR: HH.scanR,
      driveMul: a.sport ? 1.4 : 1,
    });
  return r ? huntDecision(r.ev, HH, (Math.random() - 0.5) * 0.05) : 'skip';
}

/** Encerra uma tentativa de caça. `rest` = fôlego esgotado (pant). Só tenta de novo depois do intervalo. */
function jagGiveUp(a, rest, coolMul = 1) {
  const H = huntFor(HUNT.jaguar, aggression(a.hun));
  a.state = rest ? 'pant' : 'idle';
  a.t = rest ? H.recoverT : 2.5;
  a.cd = Math.max(a.cd, H.cool * coolMul * (0.8 + Math.random() * 0.5));
  a.tgt = null;
  a.lastSeen = null;
  a.obsN = 0;
  a.gapRef = null;
}

function jagCarrion(a) {
  const c = a.cache;
  if (
    c &&
    !c.gone &&
    c.state === 'dead' &&
    (c.meat == null ? 0.7 : c.meat) > 0.08 &&
    Math.hypot(c.x - a.x, c.y - a.y) < 700
  )
    return c;
  a.cache = null; // lembra onde deixou a presa; senão fareja carniça
  let b = null,
    bd = 340;
  for (const q of fauna) {
    if (q.sp === 'jaguar' || q.state !== 'dead' || q.gone || (q.meat == null ? 0.7 : q.meat) <= 0.08) continue;
    const d = Math.hypot(q.x - a.x, q.y - a.y);
    if (d < bd) {
      bd = d;
      b = q;
    }
  }
  return b;
}

function jagTrail(a) {
  let b = null,
    bd = 260;
  for (const q of TRAILS) {
    if (!JG.prey[q.sp]) continue;
    if (q.sp === 'boar' && a.hun < 0.5) continue;
    if ((q.sp === 'hare' || q.sp === 'grouse') && a.hun < 0.3) continue;
    if (q.sp === 'fox' && a.hun < 0.7) continue;
    const d = Math.hypot(q.x - a.x, q.y - a.y);
    if (d < bd && fauna.some((f) => f.id === q.id && f.state !== 'dead')) {
      bd = d;
      b = q;
    }
  }
  return b;
} // rastro/cheiro de presa viva

const TRAILS = [];
let FTN = 0,
  FTT = 0;

function faTrail(a) {
  if (a.lx == null) {
    a.lx = a.x;
    a.ly = a.y;
    return;
  }
  if (Math.hypot(a.x - a.lx, a.y - a.ly) > 12) {
    a.lx = a.x;
    a.ly = a.y;
    TRAILS.push({ id: a.id, sp: a.sp, x: a.x, y: a.y, t: FTT, n: ++FTN });
    if (TRAILS.length > 300) TRAILS.shift();
  }
}

function jagFear(a, f) {
  // raio-base de medo de cada presa: [passeando, à espreita, caçando]. O alcance REAL de detecção depende ainda de
  // linha de visão, atenção da presa, luz e movimento da onça (ver Perception.senseTarget).
  const t = {
    // passeando: as presas já ficam de olho numa onça visível a ~140 px (antes ~60: muitas nem ligavam para ela)
    // à espreita em chão ABERTO a presa a vê de longe e foge cedo (a onça precisa do mato alto para chegar perto: a camuflagem decide)
    deer: [150, 260, 220],
    hare: [110, 200, 170],
    grouse: [80, 130, 115],
    fox: [110, 170, 140],
    boar: [100, 170, 150],
  }[a.sp];
  if (!t) return 0;
  const st = f.state;
  if (st === 'stalk' || st === 'pstalk' || st === 'observe' || st === 'pobserve') return t[1];
  if (st === 'pounce' || st === 'chase' || st === 'pchase' || st === 'pattack' || st === 'drop' || st === 'charge')
    return t[2];
  if (st === 'rest' || st === 'perch' || st === 'eat' || st === 'climb' || st === 'drag' || st === 'mate')
    return t[0] * 0.7;
  return t[0];
}

function jagTree(a, R) {
  let best = null,
    bd = 1e9;
  const tx0 = Math.floor(a.x / TS),
    ty0 = Math.floor(a.y / TS),
    r = Math.ceil(R / TS);
  for (let ty = ty0 - r; ty <= ty0 + r; ty++)
    for (let tx = tx0 - r; tx <= tx0 + r; tx++) {
      if (tx < 2 || ty < 2 || tx >= MW - 2 || ty >= MH - 3) continue;
      if (obj[ty * MW + tx] !== TREE) continue;
      const bx = tx * TS + 8,
        by = ty * TS + TS + 6;
      if (!jFree(bx, by) || ground[(ty + 1) * MW + tx] === WATER) continue;
      const d = Math.hypot(bx - a.x, by - a.y) + Math.random() * 50;
      if (d < bd) {
        bd = d;
        best = [bx, by];
      }
    }
  return best;
}

function jagWater(p) {
  const tx = Math.floor(p[0] / TS),
    ty = Math.floor(p[1] / TS);
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const i = (ty + dy) * MW + tx + dx;
    if (ground[i] === WATER) {
      const k = ground[(ty + 2 * dy) * MW + tx + 2 * dx] === WATER ? 2 : 1;
      return [(tx + dx * k) * TS + 8, (ty + dy * k) * TS + 8];
    }
  }
  return null;
}

function jagFishTarget(a) {
  let b = null,
    bd = 1e9;
  for (const f of FISH) {
    if (f.sp.rar >= 4) continue;
    const d = Math.hypot(f.x - a.x, f.y - a.y) + Math.random() * 40;
    if (d < 300 && d < bd) {
      bd = d;
      b = f;
    }
  }
  return b;
}

function jagShoreFor(f) {
  faShoreNear({ x: f.x, y: f.y });
  let best = null,
    bd = 90;
  for (const q of faShoreL) {
    const d = Math.hypot(q[0] - f.x, q[1] - f.y);
    if (d < bd && jFree(q[0], q[1])) {
      bd = d;
      best = q;
    }
  }
  return best;
}

function jagFishPick(a) {
  let b = null,
    bs = -1e9;
  for (const f of FISH) {
    if (f.sp.rar >= 4 || !isW(f.x, f.y)) continue;
    const d = Math.hypot(f.x - a.x, f.y - a.y);
    if (d > 85) continue;
    const s = -d + f.sp.len * 1.6 - f.sp.spd * 1.2 + (f.st === 'flee' ? -60 : 0);
    if (s > bs) {
      bs = s;
      b = f;
    }
  }
  return b;
} // "estuda" qual peixe pegar: perto, grande e lento

function jagBirth(a) {
  const n = jagCount() >= 5 ? 1 : Math.random() < 0.45 ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const k = faSpawn('jaguar', a.x + rr(-6, 6), a.y + rr(3, 8), true);
    k.sex = Math.random() < 0.5 ? 'm' : 'f';
    k.mom = a.id;
    k.hx = a.hx;
    k.hy = a.hy;
    k.sz = 0.95;
    k.hun = 0.2;
    k.mcd = 0;
    if (!faFree(k.x, k.y)) {
      k.x = a.x;
      k.y = a.y;
    }
  }
  if (Math.hypot(S.px - a.x, S.py - a.y) < 320)
    toast('🐆 Nasce' + (n > 1 ? 'ram 2 filhotes' : ' um filhote') + ' de onça-pintada!');
}

function jagKill(p, f) {
  const P = JG.prey[p.sp];
  p.state = 'dead';
  p.t = carcT(p.x, p.y);
  p.d0 = performance.now() / 1000;
  p.z = 0;
  p.hunter = null;
  p.row = faRow(p);
  p.meat = P.hun * 1.1;
  f.cd = f.sport ? 15 : 40;
  f.tgt = p;
  f.atk = false;
  if (f.hun < 0.3) {
    // saciada: mata por instinto e deixa a carcaça no chão; volta depois, quando sentir fome
    f.cache = p;
    f.tgt = null;
    p.t = Math.max(p.t, 140);
    f.state = 'rest';
    f.t = rr(8, 20);
    f.sport = false;
    if (Math.hypot(S.px - p.x, S.py - p.y) < 280)
      toast('🐆 A onça matou ' + P.n + ' por instinto e abandonou a carcaça');
    return;
  }
  if (Math.hypot(S.px - p.x, S.py - p.y) < 280) toast('🐆 A onça caçou ' + P.n + ' (mordida na nuca)');
  f.sport = false;
  const c = faPick(f, 70, 'rest');
  f.gx = c ? c[0] : f.x;
  f.gy = c ? c[1] : f.y;
  f.state = 'drag';
  f.t = 5;
} // arrasta a presa para a cobertura

function jagBegin(p, f, bonus) {
  const B = JG.prey[p.sp];
  f.state = 'jfight';
  f.t = 14;
  f.fhp = JG.HP;
  f.tgt = p;
  f.atk = false;
  f.z = 0;
  p.state = 'fight';
  p.hunter = f;
  p.fhp = B.hp - (bonus || 0);
  p.z = 0;
  p.dir = Math.atan2(f.y - p.y, f.x - p.x);
  if (Math.hypot(S.px - p.x, S.py - p.y) < 280) toast('⚔️ A onça ataca ' + B.n + '!');
}

function jagLeave(a, dx, dy) {
  const W = MW * TS,
    H = MH * TS,
    nx = INST.cx + dx,
    ny = INST.cy + dy;
  if (nx < 0 || ny < 0 || nx >= WN || ny >= WN) return false;
  const o = fSnap(a);
  o.x = dx < 0 ? W - TS * 4 : dx > 0 ? TS * 4 : a.x;
  o.y = dy < 0 ? H - TS * 4 : dy > 0 ? TS * 4 : a.y;
  a.gone = true;
  bgAdd(nx, ny, o);
  return true;
}

function jagSeed() {
  S.jagDone = true;
  const p = faSpot('jaguar', 230) || faSpot('jaguar', 120);
  if (!p) return; // casal fundador: macho + fêmea
  for (const sex of ['m', 'f']) {
    const a = faSpawn('jaguar', p[0] + (sex === 'f' ? rr(14, 24) : 0), p[1] + (sex === 'f' ? rr(-8, 8) : 0), false);
    if (!faFree(a.x, a.y)) {
      a.x = p[0];
      a.y = p[1];
    }
    a.sex = sex;
    a.sz = sex === 'm' ? 1.08 : 0.94;
    a.hx = a.x;
    a.hy = a.y;
    a.hun = 0.25;
    a.mcd = 70;
    a.state = 'idle';
    a.t = rr(2, 5);
  }
}

function jagTryMate(a) {
  // acasalamento: macho e fêmea adultos próximos, saciados, com espaço no território
  if (a.sex === 'f' && a.mcd <= 0 && !(a.preg > 0) && a.hun < 0.6 && jagCount() < 5) {
    const m = jagMate(a);
    if (
      m &&
      m.mcd <= 0 &&
      m.hun < 0.65 &&
      (m.state === 'idle' || m.state === 'rest' || m.state === 'go') &&
      Math.hypot(m.x - a.x, m.y - a.y) < 60
    ) {
      for (const q of [a, m]) {
        q.state = 'mate';
        q.t = 5.5;
        q.mcd = 420;
        q.mv = false;
      }
      a.preg = 110;
      a.dir = Math.atan2(m.y - a.y, m.x - a.x);
      m.dir = a.dir + Math.PI;
      if (Math.hypot(S.px - a.x, S.py - a.y) < 320) {
        toast('🐆💕 O casal de onças acasalou (gestação de ~100 dias, aqui acelerada)');
        beep(150, 0.5, 'sawtooth');
      }
      return true;
    }
  }
  return false;
}

/* ============ o jogador como presa ============
   A onça o trata como qualquer outra presa: detecta (visão com linha de visão, audição se ele corre), avalia a
   oportunidade (a fome pesa, mas um predador saciado também pode observar/espreitar) e só então decide. */
const PL_JAG = { pstalk: 1, pchase: 1, pattack: 1, pinvest: 1, pobserve: 1 };
// estados em que a onça repara no jogador (os ocupados com presa/carcaça/filhotes ficam de fora)
const JG_LOOK = {
  idle: 1,
  go: 1,
  rest: 1,
  drink: 1,
  swim: 1,
  watch: 1,
  track: 1,
  roar: 1,
  pant: 1,
  observe: 1,
  investigate: 1,
};

function jagPlayerEval(a, h) {
  if (S.inside || a.age < JG.KID) return null;
  const ag = aggression(a.hun),
    H = huntFor(HUNT.jaguar, ag),
    spd = Math.hypot(S.vx || 0, S.vy || 0),
    r = evalPrey(
      a,
      { isPlayer: true, state: 'idle', x: S.px, y: S.py },
      {
        hunt: H,
        vPred: PLAYER_PREY.jaguar.burst,
        vPrey: Math.max(60, spd),
        value: 0.7,
        counter: 0.12,
        scanR: H.scanR,
        driveMul: 0.5 + jagAct(h) + 1.2 * ag, // crepuscular/noturna: mais interessada ao anoitecer; faminta, de qualquer hora
      },
    );
  if (!r) return null;
  r.dec = huntDecision(r.ev, H, (Math.random() - 0.5) * 0.05 + ((a.bold == null ? 0.5 : a.bold) - 0.5) * 0.05);
  return r;
}

/** A onça vê o jogador agora? Guarda a última posição/velocidade vistas em a.pl (nunca a posição atual de quem não vê). */
function jagSeesPlayer(a, dt) {
  if (S.inside) {
    a.seePl = false;
    return false;
  }
  if (a.seePl && a.state === 'pchase') {
    // contato visual contínuo durante a corrida: acompanha o jogador quadro a quadro
    a.pl = { x: S.px, y: S.py, vx: S.vx || 0, vy: S.vy || 0, sp: Math.hypot(S.vx || 0, S.vy || 0), t: ecoNow() };
  }
  if (!percTick(a, dt, 'q')) return a.seePl;
  const s = senseTarget(a, playerTarget());
  // contato = visão ou audição. O faro dá só uma noção vaga e NÃO entrega a posição atual de quem ela não vê/ouve
  a.seePl = s.seen || s.heard;
  if (a.seePl) {
    a.pl = { x: S.px, y: S.py, vx: S.vx || 0, vy: S.vy || 0, sp: Math.hypot(S.vx || 0, S.vy || 0), t: ecoNow() };
    a.loseT = 0;
  } else a.loseT = (a.loseT || 0) + 0.25;
  return a.seePl;
}

/** Verificação periódica: o jogador entrou no campo de percepção de uma onça que não está ocupada? */
function jagWatchPlayer(a, dt, h) {
  if (S.inside || !JG_LOOK[a.state] || !percTick(a, dt, 'w')) return;
  const pe = jagPlayerEval(a, h);
  if (!pe) {
    a.pdec = null;
    return;
  }
  const PP = PLAYER_PREY.jaguar;
  a.pl = { x: S.px, y: S.py, vx: S.vx || 0, vy: S.vy || 0, sp: Math.hypot(S.vx || 0, S.vy || 0), t: ecoNow() };
  a.seePl = true;
  a.loseT = 0;
  let dec = pe.dec;
  if (a.cd > 0 || crossesFence(a.x, a.y, S.px, S.py)) dec = 'skip'; // em intervalo, ou o jogador está atrás de cerca
  a.pdec = dec;
  a.pdecT = ecoNow();
  if (dec === 'attack' && claimPlayerHunt(a.id)) {
    a.state = 'pstalk';
    a.t = 28;
    a.startD = rr(PP.startDist[0], PP.startDist[1]);
    a.obsN = 0;
    a.bites = 0;
    a.tgt = null;
  } else if (dec !== 'skip') {
    a.state = 'pobserve'; // observar ≠ atacar: espera, estuda o jogador e depois decide
    a.t = rr(3, 6);
    a.obsN = 0;
    a.tgt = null;
  }
}

function jagPlayerGiveUp(a, cool) {
  const PP = PLAYER_PREY.jaguar;
  const fm = 1 - 0.75 * aggression(a.hun); // faminta quase não descansa entre as tentativas
  a.leapT = 0;
  a.z = 0;
  releasePlayerHunt(a.id, PP.cool * fm);
  a.state = 'idle';
  a.t = 2.5;
  a.cd = Math.max(a.cd, (cool == null ? PP.cool * (0.8 + Math.random() * 0.5) : cool) * fm);
  a.pl = null;
  a.bites = 0;
  a.atk = false;
  a.burstT = 0;
}

function jagBitePlayer(a) {
  const PP = PLAYER_PREY.jaguar;
  a.bites = (a.bites || 0) + 1;
  a.state = 'pattack';
  a.t = PP.biteGap;
  a.mv = false;
  a.atk = true;
  hurtPlayer({ dmg: PP.bite, from: a, label: '🐆 A onça te atacou!', source: 'A onça', kick: 190 });
  beep(110, 0.35, 'sawtooth');
}

function jagPlan(a, h) {
  const I = FA_SP.jaguar,
    act = jagAct(h),
    kid = a.age < JG.KID,
    sp = I.walk * a.sz;
  if (kid) {
    const m = jagMom(a);
    if (m && Math.hypot(m.x - a.x, m.y - a.y) > 34 && m.state !== 'rest' && m.state !== 'perch') {
      faGo(a, m.x + rr(-18, 18), m.y + rr(6, 16), I.walk * 1.3, 'idle', rr(1, 3));
      return;
    }
    if (m && (m.state === 'rest' || m.state === 'perch' || m.state === 'eat')) {
      a.state = 'rest';
      a.t = rr(8, 20);
      return;
    }
    const p = faPick(a, 40, '');
    if (p) faGo(a, p[0], p[1], sp, 'idle', rr(1, 3));
    else {
      a.state = 'idle';
      a.t = 2;
    }
    return;
  } // brincando perto da mãe
  const ag = aggression(a.hun); // fome → agressividade: faminta quase só caça (não descansa nem passeia)
  if (ag > 0.5) a.cd = Math.min(a.cd, 4);
  const o = [];
  o.push(['wander', 14 * (0.3 + act) * (1 - 0.7 * ag)]);
  o.push(['rest', (1 - act) * 105 * (1 - a.hun * 0.6) * (1 - 0.9 * ag)]);
  if (a.thi > 0.45) o.push(['drink', 34 + a.thi * 110]);
  if (a.cd <= 0) o.push(['hunt', 14 + 34 * act + a.hun * 260 * (0.4 + act) + ag * 900]); // a fome pesa, mas não é pré-requisito: a oportunidade decide; faminta, caçar é o foco
  if (
    a.hun > 0.35 &&
    a.cd <= 0 &&
    !(a.fcd > 0) &&
    FISH.some((f) => f.sp.rar < 4 && Math.hypot(f.x - a.x, f.y - a.y) < 300)
  )
    o.push(['fish', 16 + a.hun * 45]);
  if (sunInfo(h).day > 0.6) o.push(['bathe', 3 + 10 * (1 - act)]);
  if (act > 0.35) o.push(['roar', a.sex === 'm' ? 5 : 2]);
  if (climate.rain > 0.3) o.push(['rest', 60 * (1 - 0.9 * ag)]);
  if (a.hun > 0.4 && jagCarrion(a)) o.push(['return', 45 + a.hun * 170]); // volta à presa abandonada (ou fareja carniça)
  if (a.mcd <= 0 && jagCount() < 5) {
    const m = jagMate(a);
    if (m && Math.hypot(m.x - a.x, m.y - a.y) > 60) o.push(['seek', 55]);
  }
  const k = wpick(o);
  if (k === 'hunt') {
    const sport = a.hun < 0.35, // saciada: se matar, é por instinto e deixa a carcaça
      r = jagPrey(a, HUNT.jaguar.scanR, sport);
    if (r) {
      jagEngage(a, r, sport);
      return;
    }
    if (a.hun > 0.4) {
      const tr = jagTrail(a);
      if (tr) {
        a.trkId = tr.id;
        a.trkN = tr.n - 1;
        a.sport = false;
        a.state = 'track';
        a.t = 45;
        return;
      }
    } // rastros recentes de presa são sinais reais: seguir é permitido; não há mais "conhecimento" de presas fora do campo de percepção
    a.cd = 6;
  }
  if (k === 'return') {
    const c = jagCarrion(a);
    if (c) {
      a.tgt = c;
      faGo(a, c.x, c.y, sp * 1.2, 'eat', 45);
      return;
    }
    a.state = 'idle';
    a.t = 2;
    return;
  }
  if (k === 'wander' || k === 'hunt') {
    let p = null;
    const m = jagMate(a);
    if (m && Math.hypot(m.x - a.x, m.y - a.y) > 150 && Math.random() < 0.5)
      p = [m.x + rr(-30, 30), m.y + rr(-30, 30)]; // o casal circula junto
    else if (Math.hypot(a.hx - a.x, a.hy - a.y) > 650)
      p = [a.hx + rr(-60, 60), a.hy + rr(-60, 60)]; // volta ao território
    else p = faPick(a, 150, '');
    if (p && jFree(p[0], p[1])) faGo(a, p[0], p[1], sp, 'idle', rr(1, 4));
    else {
      a.state = 'idle';
      a.t = 2;
    }
  } else if (k === 'seek') {
    const m = jagMate(a);
    if (m) faGo(a, m.x + rr(-14, 14), m.y + rr(-14, 14), sp, 'idle', 1.5);
    else {
      a.state = 'idle';
      a.t = 2;
    }
  } else if (k === 'rest') {
    const tr = Math.random() < 0.45 ? jagTree(a, 120) : null;
    if (tr)
      faGo(a, tr[0], tr[1], sp, 'climb', 3); // sobe numa árvore para descansar (e emboscar de cima)
    else {
      const p = faPick(a, 130, 'rest');
      if (p) faGo(a, p[0], p[1], sp, 'rest', rr(25, 60));
      else {
        a.state = 'idle';
        a.t = 2;
      }
    }
  } else if (k === 'drink') {
    const p = faShoreNear(a);
    if (p) faGo(a, p[0], p[1], sp, 'drink', rr(6, 10));
    else {
      a.thi = Math.max(0, a.thi - 0.3);
      a.state = 'idle';
      a.t = 2;
    }
  } else if (k === 'bathe') {
    const p = faShoreNear(a),
      w = p && jagWater(p);
    if (w) faGo(a, w[0], w[1], sp, 'swim', rr(8, 16));
    else {
      a.state = 'idle';
      a.t = 2;
    }
  } else if (k === 'fish') {
    const f = jagFishTarget(a),
      p = f && jagShoreFor(f);
    if (p) {
      a.fish = f;
      a.wtot = 0;
      faGo(a, p[0], p[1], I.walk * 0.6 * a.sz, 'angle', 22);
    } else {
      a.fcd = 15;
      a.state = 'idle';
      a.t = 2;
    }
  } // pesca: aproxima-se agachada da margem
  else if (k === 'roar') {
    a.state = 'roar';
    a.t = 2.3;
    if (Math.hypot(S.px - a.x, S.py - a.y) < 320) beep(95, 0.7, 'sawtooth');
  } else {
    a.state = 'idle';
    a.t = 2;
  }
}

const JG_BUSY = {
  dive: 1,
  stalk: 1,
  pounce: 1,
  chase: 1,
  jfight: 1,
  drag: 1,
  eat: 1,
  charge: 1,
  warn: 1,
  retreat: 1,
  climb: 1,
  descend: 1,
  drop: 1,
  mate: 1,
  roar: 1,
  disperse: 1,
  perch: 1,
  observe: 1,
  investigate: 1,
  pstalk: 1,
  pchase: 1,
  pattack: 1,
  pinvest: 1,
  pobserve: 1,
};

function jagUpd(a, I, h, dt) {
  const kid = a.age < JG.KID;
  a.hun = Math.max(0, a.hun - dt * 0.0052);
  a.sw = isW(a.x, a.y);
  a.mcd = Math.max(0, (a.mcd || 0) - dt);
  if (a.sex == null) a.sex = Math.random() < 0.5 ? 'm' : 'f';
  if (a.hx == null) {
    a.hx = a.x;
    a.hy = a.y;
  }
  const dP = S.inside ? 9999 : Math.hypot(S.px - a.x, S.py - a.y);
  if (a.hun >= 0.98) {
    a.starve = (a.starve || 0) + dt;
    if (a.starve > 300 && a.state !== 'jfight') {
      a.cause = 'fome';
      faDie(a);
      return;
    }
  } else a.starve = Math.max(0, (a.starve || 0) - dt * 2); // fome prolongada mata
  a.mchk = (a.mchk || 0) - dt;
  if (a.mchk <= 0) {
    a.mchk = 1;
    if (!kid && a.sex === 'f' && (a.state === 'idle' || a.state === 'rest' || a.state === 'go') && jagTryMate(a))
      return;
  }
  if (a.preg > 0) {
    a.preg -= dt;
    if (a.preg <= 0) {
      a.preg = 0;
      jagBirth(a);
    }
  }
  if (!kid && !a.mat) {
    a.mat = 1;
    if (a.age < JG.KID + 60 && a.age >= JG.KID && jagCount() > 3 && Math.random() < 0.75) {
      // jovem adulto dispersa para outra instância
      const dirs = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].filter((d) => {
        const nx = INST.cx + d[0],
          ny = INST.cy + d[1];
        return nx >= 0 && ny >= 0 && nx < WN && ny < WN;
      });
      if (dirs.length) {
        const d = dirs[(Math.random() * dirs.length) | 0];
        a.ddx = d[0];
        a.ddy = d[1];
        a.state = 'disperse';
        a.t = 150;
      }
    }
  }
  if (a.state !== a._ls) {
    a._ls = a.state;
    a.stT = 0;
  } else a.stT = (a.stT || 0) + dt; // há quanto tempo está neste estado
  if (!kid) jagWatchPlayer(a, dt, h); // o jogador também é uma presa possível: percepção → avaliação → decisão
  if (
    !kid &&
    (a.state === 'idle' || a.state === 'rest') &&
    a.cd <= 0 &&
    percTick(a, dt, 'o') &&
    (a.oscan = (a.oscan || 0) + 1) % 2 === 0
  ) {
    // percepção oportunista: mesmo parada ou descansando, a onça nota a presa que passa à vista (a cada ~0,5 s, defasada)
    const sport = a.hun < 0.35,
      r = jagPrey(a, HUNT.jaguar.scanR, sport);
    if (r) {
      jagEngage(a, r, sport);
      return;
    }
  }
  const st = a.state;
  // ===== pessoas: defesa territorial (fêmea com filhotes, macho ousado) e recuo quando não há interesse em caçar =====
  if (!S.inside && !JG_BUSY[st]) {
    const guard = a.sex === 'f' && !kid && jagHasCubs(a);
    if (dP < (guard ? 85 : 52) && !(a.pdec === 'attack' && ecoNow() - (a.pdecT || 0) < 0.6)) {
      if (!kid && (guard || (a.hun > 0.6 && a.bold > 0.5) || (a.sex === 'm' && a.bold > 0.75)) && a.cd <= 0) {
        a.state = 'warn';
        a.t = 2.4;
        return;
      }
      // (antes a onça RECUAVA correndo ao ficar perto de gente depois de atacar: parecia medo; predador não foge do jogador)
    }
  }
  switch (a.state) {
    case 'go': {
      const arr = jStep(a, a.gx, a.gy, a.spd, dt);
      if (arr || a.stuck > 1.2) {
        const nx = a.after;
        a.state = nx;
        a.t = a.adur || 3;
        a.stuck = 0;
        if (nx === 'climb') {
          if (arr) {
            a.dir = -1.5708;
            a.t = 2.2;
            a.z = 0;
          } else {
            a.state = 'idle';
            a.t = 2;
          }
        } else if (nx === 'swim') {
          a.sx = a.x;
          a.sy = a.y;
        } else if (nx === 'angle') {
          a.state = 'watch';
          a.t = rr(4, 8);
          a.mv = false;
        } else if (nx === 'eat') {
          a.t = 45;
        }
      }
      break;
    }
    case 'track': {
      a.t -= dt;
      const pr = fauna.find((q) => q.id === a.trkId && jagOk(q)); // segue o rastro até a presa
      if (pr && Math.hypot(pr.x - a.x, pr.y - a.y) < 150) {
        a.tgt = pr;
        a.state = 'stalk';
        a.t = 40;
        break;
      }
      let nx = null;
      for (const q of TRAILS) if (q.id === a.trkId && q.n > a.trkN && (!nx || q.n < nx.n)) nx = q;
      if (!nx || a.t <= 0 || !pr) {
        a.state = 'idle';
        a.t = 2;
        a.cd = 10;
        break;
      }
      jStep(a, nx.x, nx.y, I.walk * 1.05, dt);
      if (Math.hypot(nx.x - a.x, nx.y - a.y) < 7 || a.stuck > 1) {
        a.trkN = nx.n;
        a.stuck = 0;
      }
      break;
    }
    case 'watch': {
      a.t -= dt;
      a.wtot = (a.wtot || 0) + dt;
      a.mv = false;
      a.rt = (a.rt || 0) - dt;
      if (a.rt <= 0) {
        a.rt = 0.8;
        const f = jagFishPick(a);
        a.fish = f || null;
      } // reavalia qual peixe é o melhor
      const f = a.fish;
      if (f && FISH.indexOf(f) >= 0) turnTo(a, Math.atan2(f.y - a.y, f.x - a.x), dt * 3);
      if (a.wtot > 26 || (!f && a.wtot > 4)) {
        a.state = 'idle';
        a.t = 2;
        a.fcd = 20;
        a.fish = null;
        break;
      }
      if (a.t <= 0) {
        if (f && FISH.indexOf(f) >= 0 && Math.hypot(f.x - a.x, f.y - a.y) < 54 && f.st !== 'flee') {
          const lx = f.x + Math.cos(f.ang) * 6,
            ly = f.y + Math.sin(f.ang) * 6;
          a.pdir = Math.atan2(ly - a.y, lx - a.x);
          a.dir = a.pdir;
          a.state = 'dive';
          a.t = 0.6;
          a.pt = 0.6;
          a.tgt = f;
        } else a.t = 1.5;
      } // espera o peixe chegar ao alcance e salta
      break;
    }
    case 'dive': {
      a.t -= dt;
      a.z = Math.sin(Math.PI * Math.max(0, 1 - a.t / a.pt)) * 7;
      a.mv = true;
      const nx = a.x + Math.cos(a.pdir) * 95 * dt,
        ny = a.y + Math.sin(a.pdir) * 95 * dt;
      if (jFree(nx, ny)) {
        a.x = nx;
        a.y = ny;
      }
      if (a.t <= 0) {
        a.z = 0;
        wSplash(a.x, a.y, 12, 1.3);
        wImpulse(a.x, a.y, -1.3, 4);
        let hit = null;
        for (const f of FISH)
          if (
            Math.hypot(f.x - a.x, f.y - a.y) < 17 &&
            (!hit || Math.hypot(f.x - a.x, f.y - a.y) < Math.hypot(hit.x - a.x, hit.y - a.y))
          )
            hit = f;
        if (hit && Math.random() < 0.7) {
          FISH.splice(FISH.indexOf(hit), 1);
          a.hun = Math.max(0, a.hun - 0.18 - hit.sp.len / 90);
          a.fcd = 10;
          if (Math.hypot(S.px - a.x, S.py - a.y) < 300)
            toast('🐆 A onça mergulhou e pegou ' + (hit.sp.rar >= 2 ? 'um peixe grande' : 'um peixe'));
        } else a.fcd = 22; // errou: o peixe escapou
        a.fish = null;
        a.tgt = null;
        a.state = 'swim';
        a.t = 2.5;
        a.sx = a.x;
        a.sy = a.y;
      }
      break;
    }
    case 'retreat': {
      a.t -= dt;
      jStep(a, a.x + Math.cos(a.fang) * 30, a.y + Math.sin(a.fang) * 30, I.walk * 1.7, dt);
      if (a.stuck > 0.4) {
        a.fang += rr(1.5, 3);
        a.stuck = 0;
      }
      if (a.t <= 0) {
        a.state = 'idle';
        a.t = 2;
        a.cd = Math.max(a.cd, 5);
      }
      break;
    }
    case 'warn': {
      a.t -= dt;
      a.mv = false;
      turnTo(a, Math.atan2(S.py - a.y, S.px - a.x), dt * 3);
      if (a.t <= 1.6 && !a.growl) {
        a.growl = 1;
        if (dP < 300) beep(85, 0.8, 'sawtooth');
      }
      if (dP < 34 && a.cd <= 0) {
        a.state = 'charge';
        a.t = 2.2;
        a.growl = 0;
      } else if (dP > 110 || a.t <= 0) {
        a.growl = 0;
        a.state = 'idle'; // o aviso acabou: segue a vida (sem recuar correndo)
        a.t = 2.5;
        a.cd = 12;
      }
      break;
    }
    case 'charge': {
      a.t -= dt;
      jStep(a, S.px, S.py, I.run * 1.05, dt);
      if (dP < 15) {
        // acertou a investida: não recua; continua atacando enquanto o jogador estiver ao alcance (pattack)
        hurtPlayer({ dmg: 12, from: a, label: '🐆 A onça te atacou!', source: 'A onça', kick: 190 });
        claimPlayerHunt(a.id, 3);
        a.state = 'pattack';
        a.t = PLAYER_PREY.jaguar.biteGap;
        a.atk = true;
      } else if (a.t <= 0 || dP > 150) {
        a.state = 'idle'; // errou a investida: não foge, só para
        a.t = 2.5;
        a.cd = 20;
      }
      break;
    }
    case 'observe': {
      // espreita à distância, agachada e imóvel, estudando a presa antes de se comprometer
      const p = a.tgt;
      a.t -= dt;
      a.mv = false;
      if (!jagOk(p) || crossesFence(a.x, a.y, p.x, p.y)) {
        jagGiveUp(a, false, 0.6);
        break;
      }
      turnTo(a, Math.atan2(p.y - a.y, p.x - a.x), dt * 2);
      jagSees(a, p, dt);
      if ((a.loseT || 0) > 2) {
        jagGiveUp(a, false, 0.6);
        break;
      }
      if (a.t <= 0) {
        const dec = jagDecide(a, p);
        if (dec === 'attack') {
          a.state = 'stalk';
          a.t = 40;
          a.obsN = 0;
        } else if (dec === 'observe' && (a.obsN = (a.obsN || 0) + 1) < 3) a.t = rr(3, 5);
        else jagGiveUp(a, false);
      }
      break;
    }
    case 'investigate': {
      // perdeu a presa de vista: vai até a última posição vista, olha em volta por tempo limitado e desiste
      const ls = a.lastSeen;
      a.t -= dt;
      if (!ls) {
        jagGiveUp(a, false, 0.8);
        break;
      }
      if (Math.hypot(ls.x - a.x, ls.y - a.y) > 10 && a.stuck < 1.2) jStep(a, ls.x, ls.y, I.walk * 1.1 * a.sz, dt);
      else {
        a.mv = false;
        a.dir += Math.sin(a.t * 2) * dt * 2.5;
      }
      if (percTick(a, dt, 'v')) {
        const r = jagPrey(a, 160, a.hun < 0.35);
        if (r && r.dec === 'attack') {
          a.tgt = r.p;
          a.state = 'stalk';
          a.t = 40;
          a.obsN = 0;
          a.lastSeen = { x: r.p.x, y: r.p.y, t: ecoNow() };
          a.loseT = 0;
          break;
        }
      }
      if (a.t <= 0) jagGiveUp(a, false);
      break;
    }
    case 'stalk': {
      const p = a.tgt;
      if (!jagOk(p) || crossesFence(a.x, a.y, p.x, p.y)) {
        jagGiveUp(a, false, 0.5);
        break;
      }
      const d = Math.hypot(p.x - a.x, p.y - a.y);
      a.t -= dt;
      const seen = jagSees(a, p, dt),
        ls = a.lastSeen;
      if (!seen && (a.loseT || 0) > 1.5) {
        a.state = 'investigate';
        a.t = HUNT.jaguar.loseT;
        a.stuck = 0;
        break;
      }
      if (seen && p.state === 'flee') {
        if (d < 75 + 8 * aggression(a.hun) && a.stam > 0.4) {
          a.state = 'chase';
          a.t = HUNT.jaguar.giveUp * (1 + 0.6 * aggression(a.hun));
        } else jagGiveUp(a, false, 0.7);
        break;
      } // presa percebeu: ou persegue ou desiste
      const gx = seen || !ls ? p.x : ls.x,
        gy = seen || !ls ? p.y : ls.y;
      jStep(a, gx, gy, I.walk * 0.7 * a.sz, dt); // aproxima-se agachada, devagar
      if (seen && d < 72 && ecoNow() - (a.rckT || -99) > 6) {
        a.rckT = ecoNow(); // última checagem antes do bote: ainda vale a pena?
        const dec = jagDecide(a, p);
        if (dec !== 'attack') {
          if (dec === 'observe' && (a.obsN || 0) < 2) {
            a.obsN = (a.obsN || 0) + 1;
            a.state = 'observe';
            a.t = rr(3, 5);
          } else jagGiveUp(a, false);
          break;
        }
      }
      if (d < 40 && seen) {
        a.state = 'pounce';
        a.t = 0.55;
        a.pt = 0.55;
        a.pdir = Math.atan2(p.y - a.y, p.x - a.x);
      } else if (a.t <= 0 || d > 340) {
        a.state = 'idle';
        a.t = 3;
        a.cd = 12;
        a.tgt = null;
      }
      break;
    }
    case 'pounce': {
      const p = a.tgt;
      a.t -= dt;
      a.z = Math.sin(Math.PI * Math.max(0, 1 - a.t / a.pt)) * 7;
      if (jagOk(p)) a.pdir = Math.atan2(p.y - a.y, p.x - a.x);
      a.dir = a.pdir;
      a.mv = true;
      const nx = a.x + Math.cos(a.pdir) * 150 * dt,
        ny = a.y + Math.sin(a.pdir) * 150 * dt;
      if (jFree(nx, ny)) {
        a.x = nx;
        a.y = ny;
      }
      if (jagOk(p) && Math.hypot(p.x - a.x, p.y - a.y) < 11) {
        a.z = 0;
        if (p.sp === 'deer' && Math.random() < 0.28) {
          faFlee(p, { x: a.x, y: a.y });
          a.state = 'chase';
          a.t = 5;
        } // o cervo se esquiva do bote
        else if (p.hunter && p.hunter !== a) {
          a.state = 'idle';
          a.t = 2;
          a.cd = 8;
          a.tgt = null;
        } else jagBegin(p, a);
        break;
      }
      if (a.t <= 0) {
        a.z = 0;
        if (jagOk(p) && Math.hypot(p.x - a.x, p.y - a.y) < 80 && a.stam > 0.3) {
          a.state = 'chase';
          a.t = 5;
        } else {
          a.state = 'pant';
          a.t = 3.5;
          a.cd = 20;
          a.tgt = null;
        }
      }
      break;
    }
    case 'drop': {
      const p = a.tgt;
      a.t -= dt;
      a.z = Math.max(0, a.z - 40 * dt);
      a.mv = true;
      if (jagOk(p)) {
        a.pdir = Math.atan2(p.y - a.y, p.x - a.x);
        a.dir = a.pdir;
      }
      const nx = a.x + Math.cos(a.pdir) * 110 * dt,
        ny = a.y + Math.sin(a.pdir) * 110 * dt;
      if (jFree(nx, ny)) {
        a.x = nx;
        a.y = ny;
      }
      if (a.t <= 0) {
        a.z = 0;
        if (jagOk(p) && Math.hypot(p.x - a.x, p.y - a.y) < 16) jagBegin(p, a, 14);
        else {
          a.state = 'idle';
          a.t = 2;
          a.cd = 12;
          a.tgt = null;
        }
      }
      break;
    } // bote de cima: dano extra
    case 'chase': {
      const p = a.tgt;
      if (!jagOk(p) || crossesFence(a.x, a.y, p.x, p.y)) {
        jagGiveUp(a, false, 0.5);
        break;
      }
      if (a.stT < dt * 1.5) a.gapRef = null;
      const d = Math.hypot(p.x - a.x, p.y - a.y);
      a.t -= dt;
      const agC = aggression(a.hun); // faminta: corre mais rápido, gasta menos fôlego e só desiste quando a presa abre MUITA distância
      a.stam -= (dt / I.stam) * (1 - 0.15 * agC);
      const seen = jagSees(a, p, dt),
        ls = a.lastSeen;
      if (!seen && (a.loseT || 0) > 0.9) {
        a.state = 'investigate'; // não rastreia a posição atual de quem não vê
        a.t = HUNT.jaguar.loseT;
        a.stuck = 0;
        break;
      }
      const gx = seen || !ls ? p.x : ls.x,
        gy = seen || !ls ? p.y : ls.y,
        ramp = 0.6 + 0.4 * (1 - Math.exp(-3.6 * a.stT)); // aceleração: não é instantânea
      jStep(a, gx, gy, I.run * (1 + 0.05 * agC) * (a.stam > 0.1 ? 1 : 0.5) * ramp, dt);
      if (a.gapRef == null) {
        a.gapRef = d;
        a.gapT = 1.5;
        a.gapBad = 0;
      }
      a.gapT -= dt;
      if (a.gapT <= 0) {
        a.gapT = 1.5;
        a.gapBad = d > a.gapRef + 5 ? (a.gapBad || 0) + 1 : Math.max(0, (a.gapBad || 0) - 1); // a presa abre distância?
        a.gapRef = d;
      }
      if (d < 10) {
        if (p.hunter && p.hunter !== a) jagGiveUp(a, false, 0.4);
        else jagBegin(p, a);
      } else if (a.t <= 0 || a.stam <= 0 || d > 230 + 50 * agC || (a.gapBad || 0) >= 2 + Math.round(agC) || a.stuck > 0.8) {
        a.state = 'pant';
        a.t = HUNT.jaguar.recoverT;
        a.cd = 30;
        a.tgt = null;
        a.gapRef = null;
      }
      break;
    } // sprint curto: sem fôlego, ou presa mais rápida, desiste
    case 'pobserve': {
      const PP = PLAYER_PREY.jaguar;
      a.t -= dt;
      a.mv = false;
      const seen = jagSeesPlayer(a, dt),
        pl = a.pl;
      if (S.inside || !pl || (!seen && (a.loseT || 0) > 2)) {
        jagPlayerGiveUp(a, PP.cool * 0.5);
        break;
      }
      turnTo(a, Math.atan2(pl.y - a.y, pl.x - a.x), dt * 2);
      if (a.t <= 0) {
        const pe = jagPlayerEval(a, h),
          dec = pe && !crossesFence(a.x, a.y, S.px, S.py) ? pe.dec : 'skip';
        if (dec === 'attack' && claimPlayerHunt(a.id)) {
          a.state = 'pstalk';
          a.t = 28;
          a.startD = rr(PP.startDist[0], PP.startDist[1]);
          a.bites = 0;
        } else if (dec !== 'skip' && (a.obsN = (a.obsN || 0) + 1) < 3) a.t = rr(3, 5);
        else {
          a.state = 'idle'; // sem interesse: segue a vida
          a.t = 2.5;
          a.cd = Math.max(a.cd, PP.cool * 0.6);
          a.pl = null;
          releasePlayerHunt(a.id);
        }
      }
      break;
    }
    case 'pstalk': {
      const PP = PLAYER_PREY.jaguar;
      a.t -= dt;
      const seen = jagSeesPlayer(a, dt),
        pl = a.pl;
      if (S.inside || !pl) {
        jagPlayerGiveUp(a);
        break;
      }
      if (!seen && (a.loseT || 0) > 1.6) {
        a.state = 'pinvest';
        a.t = rr(PP.investigate[0], PP.investigate[1]);
        a.stuck = 0;
        break;
      }
      if (!claimPlayerHunt(a.id)) {
        a.state = 'pobserve'; // outro predador já caça o jogador: este só observa
        a.t = rr(3, 5);
        break;
      }
      const dd = Math.hypot(pl.x - a.x, pl.y - a.y);
      if (crossesFence(a.x, a.y, pl.x, pl.y) || dd > PP.giveUpDist || a.t <= 0) {
        jagPlayerGiveUp(a);
        break;
      }
      const fleeing = seen && pl.sp > 68; // o jogador corre: instinto de perseguição
      if (dd <= (a.startD || 90) || (fleeing && dd < PP.startDist[1] + 40)) {
        a.state = 'pchase';
        a.t = 999; // sem prazo: a perseguição acaba quando o jogador escapa (ver pchase)
        a.burstT = 0;
        a.stuck = 0;
        break;
      }
      jStep(a, pl.x, pl.y, I.walk * 0.75 * a.sz, dt); // aproxima-se agachada, devagar
      break;
    }
    case 'pchase': {
      const PP = PLAYER_PREY.jaguar;
      a.t -= dt;
      a.burstT = (a.burstT || 0) + dt;
      const seen = jagSeesPlayer(a, dt),
        pl = a.pl;
      if (S.inside || !pl || !claimPlayerHunt(a.id, 1.5)) {
        jagPlayerGiveUp(a);
        break;
      }
      if (!seen && (a.loseT || 0) > PP.lostGrace) {
        a.state = 'pinvest'; // perdeu o contato visual: investiga onde viu o jogador pela última vez
        a.t = rr(PP.investigate[0], PP.investigate[1]);
        a.stuck = 0;
        break;
      }
      const dd = Math.hypot(pl.x - a.x, pl.y - a.y),
        k = 1 - Math.exp(-PP.accel * a.burstT),
        fatigue = a.burstT <= PP.burstT ? 1 : Math.max(0.45, 1 - (a.burstT - PP.burstT) * 0.55),
        agP = aggression(a.hun),
        v = (I.walk * 0.9 + (PP.burst * (1 + 0.07 * agP) - I.walk * 0.9) * k) * fatigue; // aceleração rápida, sem salto instantâneo de velocidade
      // a onça ESTIMA a velocidade do jogador com atraso (leadLag): uma guinada brusca engana a interceptação por um instante
      if (a.burstT <= dt * 1.5 || a.pvx == null) {
        a.pvx = pl.vx;
        a.pvy = pl.vy;
      } else {
        const kv = Math.min(1, dt / PP.leadLag);
        a.pvx += (pl.vx - a.pvx) * kv;
        a.pvy += (pl.vy - a.pvy) * kv;
      }
      const tl = Math.min(0.9, dd / Math.max(60, v)) * 0.7, // intercepta a posição futura (estimada) do jogador
        gx = seen ? pl.x + a.pvx * tl : pl.x,
        gy = seen ? pl.y + a.pvy * tl : pl.y;
      // SALTO: perto o bastante, a onça se lança sobre o jogador num disparo curtíssimo e muito rápido, derruba e morde
      const L = PP.leap;
      if (a.leapT > 0) {
        a.leapT -= dt;
        a.z = Math.sin(Math.PI * Math.max(0, 1 - a.leapT / L.time)) * 8;
        // o salto vai reto para onde o jogador ESTAVA ao saltar (não corrige no ar): um passo de lado no último instante a faz errar
        jStep(a, a.x + Math.cos(a.pdir) * 60, a.y + Math.sin(a.pdir) * 60, L.speed, dt, 9);
        if (dP <= PP.biteReach + 2 && !S.inside) {
          a.leapT = 0;
          a.z = 0;
          playerFx.snareUntil = ecoNow() + L.pin; // derrubado: não anda por um instante
          playerFx.snareSlow = 0;
          jagBitePlayer(a);
          break;
        }
        if (a.leapT <= 0) a.z = 0;
        break;
      }
      if (seen && !S.inside && dd >= L.range[0] && dd <= L.range[1] && ecoNow() - (a.leapAt || -99) > L.cd && ecoNow() >= playerFx.freeUntil) {
        a.leapT = L.time;
        a.leapAt = ecoNow();
        a.pdir = Math.atan2(S.py - a.y, S.px - a.x);
        break;
      }
      jStep(a, gx, gy, v, dt, 1.8 * PP.turn);
      if (seen && dP <= PP.biteReach && !S.inside) {
        jagBitePlayer(a);
        break;
      }
      if (!seen && a.stuck > 0.6 && (a.loseT || 0) > 0 && a.burstT <= PP.burstT + 1 && a.t > 0) {
        // barrada por um obstáculo sem ver o jogador: em vez de bufar, vai com cautela ao último ponto visto
        a.state = 'pinvest';
        a.t = rr(PP.investigate[0], PP.investigate[1]);
        a.stuck = 0;
        break;
      }
      if ((a.burstT > PP.burstT * (1 + 0.3 * agP) + 1 && dd > 40) || dd > PP.giveUpDist * (1 + 0.4 * agP) || a.stuck > 0.6) {
        // o jogador escapou: ficou longe (distância), travou em obstáculo (árvore, cerca) ou o fôlego acabou e ele já está fora de alcance
        releasePlayerHunt(a.id, PP.cool);
        a.state = 'pant';
        a.t = HUNT.jaguar.recoverT;
        a.cd = Math.max(a.cd, PP.cool * (0.8 + Math.random() * 0.4) * (1 - 0.75 * agP));
        a.pl = null;
        a.bites = 0;
      }
      break;
    }
    case 'pattack': {
      const PP = PLAYER_PREY.jaguar;
      a.t -= dt;
      a.mv = false;
      turnTo(a, Math.atan2(S.py - a.y, S.px - a.x), dt * 4);
      if (a.t <= 0) {
        a.atk = false;
        if ((a.bites || 0) < PP.bites && dP < 26 && !S.inside && S.vida > 0) jagBitePlayer(a);
        else if (!S.inside && S.vida > 0) {
          // o jogador escapou do alcance da mordida: continua a perseguição (sem recuar e sem trégua)
          a.state = 'pchase';
          a.t = 999;
          a.stuck = 0;
        } else {
          jagPlayerGiveUp(a, PP.cool * 0.5);
        }
      }
      break;
    }
    case 'pinvest': {
      const PP = PLAYER_PREY.jaguar,
        pl = a.pl;
      a.t -= dt;
      if (!pl || S.inside) {
        jagPlayerGiveUp(a);
        break;
      }
      const seen = jagSeesPlayer(a, dt);
      if (seen) {
        const pe = jagPlayerEval(a, h);
        if (pe && pe.dec === 'attack' && !crossesFence(a.x, a.y, S.px, S.py) && claimPlayerHunt(a.id)) {
          a.state = 'pstalk';
          a.t = 28;
          a.startD = rr(PP.startDist[0], PP.startDist[1]);
          break;
        }
      }
      if (Math.hypot(pl.x - a.x, pl.y - a.y) > 10 && a.stuck < 1.2) jStep(a, pl.x, pl.y, I.walk * 1.1 * a.sz, dt);
      else {
        a.mv = false;
        a.dir += Math.sin(a.t * 2) * dt * 2.5; // olha em volta
      }
      if (a.t <= 0) jagPlayerGiveUp(a); // desistiu: não rastreia a posição atual do jogador
      break;
    }
    case 'jfight': {
      const p = a.tgt;
      a.t -= dt;
      a.mv = false;
      if (!p || p.gone || p.state !== 'fight') {
        a.state = 'idle';
        a.t = 2;
        a.cd = 8;
        a.tgt = null;
        a.atk = false;
        break;
      }
      const B = JG.prey[p.sp],
        ang = Math.atan2(p.y - a.y, p.x - a.x);
      turnTo(a, ang, dt * 4);
      a.atk = Math.sin(a.t * 12) > 0;
      p.fhp -= JG.BITE * dt * (0.7 + Math.random() * 0.6);
      a.fhp -=
        B.ctr * (p.sp === 'boar' ? 1 + Math.min(4, boarMates(p, 60)) * 0.9 : 1) * dt * (0.6 + Math.random() * 0.8); // o bando morde a onça junto
      if (p.fhp <= 0) {
        jagKill(p, a);
        break;
      }
      if (a.fhp <= 0 || a.t <= 0) {
        a.state = 'pant';
        a.t = 5;
        a.cd = 25;
        a.tgt = null;
        a.atk = false;
        p.state = 'flee';
        p.hunter = null;
        p.t = 3;
        p.zz = 0;
        p.fang = ang + rr(-0.4, 0.4);
      }
      break;
    }
    case 'drag': {
      const p = a.tgt;
      a.t -= dt;
      const arr = jStep(a, a.gx, a.gy, I.walk * 0.7, dt);
      if (p && p.state === 'dead') {
        p.x = a.x - Math.cos(a.dir) * 9;
        p.y = a.y - Math.sin(a.dir) * 9;
        p.row = faRow(p);
      }
      if (arr || a.t <= 0 || a.stuck > 0.8) {
        a.state = 'eat';
        a.t = 45;
        a.mv = false;
        a.cache = p;
      }
      break;
    }
    case 'eat': {
      a.t -= dt;
      a.mv = false;
      const p = a.tgt; // come até saciar; o que sobra fica na carcaça para voltar depois
      if (!p || p.gone || p.state !== 'dead' || Math.hypot(p.x - a.x, p.y - a.y) > 28) {
        a.tgt = null;
        a.state = 'rest';
        a.t = rr(20, 40);
        break;
      }
      if (p.meat == null) p.meat = 0.7;
      turnTo(a, Math.atan2(p.y - a.y, p.x - a.x), dt * 2);
      if (a.hun > 0.06 && p.meat > 0 && a.t > 0) {
        const g = Math.min(p.meat, 0.045 * dt);
        p.meat -= g;
        a.hun = Math.max(0, a.hun - g);
        p.t = Math.max(p.t, 140);
        for (const q of fauna)
          if (
            q !== a &&
            q.sp === 'jaguar' &&
            q.state !== 'dead' &&
            q.hun > 0.1 &&
            Math.hypot(q.x - p.x, q.y - p.y) < 45
          ) {
            const g2 = Math.min(p.meat, 0.03 * dt);
            p.meat -= g2;
            q.hun = Math.max(0, q.hun - g2);
          }
      } // parceiro e filhotes comem junto
      else {
        a.cache = p.meat > 0.08 ? p : null;
        a.tgt = null;
        a.state = 'rest';
        a.t = rr(30, 60);
        if (p.meat <= 0.08) p.t = Math.min(p.t, 25);
      }
      break;
    }
    case 'climb': {
      a.t -= dt;
      a.mv = false;
      a.dir = -1.5708;
      a.z = 20 * (1 - Math.max(0, a.t) / 2.2);
      if (a.t <= 0) {
        a.z = 20;
        a.state = 'perch';
        a.t = rr(25, 70);
      }
      break;
    }
    case 'perch': {
      a.t -= dt;
      a.mv = false;
      a.z = 20;
      a.hun = Math.min(1, a.hun + dt * 0.001);
      if (a.cd <= 0 && !kid) {
        const r = jagPrey(a, 48),
          p = r && r.dec === 'attack' ? r.p : null;
        if (p) {
          a.tgt = p;
          a.state = 'drop';
          a.t = 0.5;
          a.pdir = Math.atan2(p.y - a.y, p.x - a.x);
          break;
        }
      } // emboscada a partir da árvore
      if (a.t <= 0) {
        a.state = 'descend';
        a.t = 1.8;
        a.dir = 1.5708;
      }
      break;
    }
    case 'descend': {
      a.t -= dt;
      a.mv = false;
      a.dir = 1.5708;
      a.z = (20 * Math.max(0, a.t)) / 1.8;
      if (a.t <= 0) {
        a.z = 0;
        a.state = 'idle';
        a.t = 2;
      }
      break;
    }
    case 'swim': {
      a.t -= dt;
      a.rip = (a.rip || 0) - dt;
      a.z = 0;
      if (!a.sx || Math.hypot(a.sx - a.x, a.sy - a.y) < 4) {
        const an = Math.random() * 6.283;
        a.sx = a.x + Math.cos(an) * 18;
        a.sy = a.y + Math.sin(an) * 18;
        if (!isW(a.sx, a.sy)) {
          a.sx = a.x;
          a.sy = a.y;
        }
      }
      jStep(a, a.sx, a.sy, I.walk * 0.8, dt);
      if (a.rip <= 0) {
        a.rip = 0.7;
        wImpulse(a.x, a.y, -0.8, 3);
      }
      if (a.t <= 0) jagPlan(a, h);
      break;
    }
    case 'drink': {
      a.t -= dt;
      a.mv = false;
      a.thi = Math.max(0, a.thi - dt * 0.15);
      a.rip = (a.rip || 0) - dt;
      if (a.rip <= 0) {
        a.rip = 0.8;
        for (const [ox, oy] of [
          [-9, 0],
          [9, 0],
          [0, 9],
          [0, -9],
        ]) {
          const ci = (((a.y + oy) / WG) | 0) * WGW + (((a.x + ox) / WG) | 0);
          if (wM[ci]) {
            wImpulse(a.x + ox, a.y + oy, -0.7, 2);
            break;
          }
        }
      }
      if (a.t <= 0) jagPlan(a, h);
      break;
    }
    case 'disperse': {
      a.t -= dt;
      const W = MW * TS,
        H = MH * TS,
        tx = a.ddx < 0 ? TS * 3 : a.ddx > 0 ? W - TS * 3 : a.x,
        ty = a.ddy < 0 ? TS * 3 : a.ddy > 0 ? H - TS * 3 : a.y;
      const arr = jStep(a, tx, ty, I.walk * 1.3, dt);
      if (arr || a.t <= 0 || Math.hypot(tx - a.x, ty - a.y) < TS * 2) {
        if (!jagLeave(a, a.ddx, a.ddy)) {
          a.state = 'idle';
          a.t = 3;
        }
      }
      break;
    }
    default: {
      // idle, rest, roar, pant, mate
      a.t -= dt;
      if (a.state !== 'go') a.mv = false;
      if (a.state === 'rest') {
        a.hun = Math.min(1, a.hun + dt * 0.0008);
      }
      if (a.t <= 0) jagPlan(a, h);
    }
  }
}

function drawJag(a) {
  const im = JG_CV;
  if (!im) return;
  if (a.state === 'perch') return; // escondida na copa até descer
  const M = JG_META,
    W = JG.W,
    H = JG.H,
    now = performance.now() / 1000;
  const c = Math.cos(a.dir),
    s = Math.sin(a.dir),
    horiz = Math.abs(c) >= Math.abs(s) * 0.9;
  if (horiz && Math.abs(c) > 0.15) a.fl = c < 0;
  const left = !!a.fl,
    down = s > 0,
    st = a.state;
  let key,
    flip = false,
    fps = 8,
    sy = 1,
    still = false;
  if (st === 'dead') {
    key = 'rest_r';
    flip = left;
    still = true;
  } else if (st === 'dive' || st === 'pounce' || st === 'drop' || st === 'pattack') {
    if (horiz) {
      key = 'pounce_r';
      flip = left;
    } else {
      key = down ? 'walk_d' : 'walk_u';
      sy = 1.12;
    }
  } else if (st === 'climb') {
    key = 'walk_u';
    fps = 9;
  } else if (st === 'descend') {
    key = 'walk_d';
    fps = 9;
  } else if (st === 'perch') {
    key = 'rest_r';
    flip = left;
    fps = 1.5;
  } else if (a.sw) {
    if (horiz) {
      key = 'swim_r';
      flip = left;
      fps = 5;
    } else {
      key = down ? 'swim_d' : 'swim_u';
      fps = 5;
    }
  } else if (st === 'roar' || st === 'warn' || st === 'jfight') {
    key = 'roar_r';
    flip = left;
    fps = st === 'jfight' ? 10 : 5;
  } else if (st === 'pounce' || st === 'drop') {
    if (horiz) {
      key = 'pounce_r';
      flip = left;
    } else {
      key = down ? 'walk_d' : 'walk_u';
      sy = 1.12;
    }
  } else if (st === 'watch' || (st === 'go' && a.after === 'angle')) {
    if (horiz) {
      key = 'stalk_r';
      flip = left;
      fps = 5;
      still = st === 'watch';
    } else {
      key = down ? 'walk_d' : 'walk_u';
      sy = 0.9;
      fps = 5;
      still = st === 'watch';
    }
  } else if (st === 'stalk' || st === 'pstalk' || st === 'observe' || st === 'pobserve') {
    if (horiz) {
      key = 'stalk_r';
      flip = left;
      fps = 6;
      still = (st === 'observe' || st === 'pobserve') && !a.mv;
    } else {
      key = down ? 'walk_d' : 'walk_u';
      sy = 0.9;
      fps = 5;
    }
  } else if (st === 'drink') {
    key = 'stalk_r';
    flip = left;
    still = true;
  } else if (a.mv && (st === 'chase' || st === 'pchase' || st === 'charge' || st === 'retreat')) {
    if (horiz) {
      key = 'run_r';
      flip = left;
      fps = 12;
    } else {
      key = down ? 'walk_d' : 'walk_u';
      fps = 13;
    }
  } else if (a.mv) {
    key = horiz ? (left ? 'walk_l' : 'walk_r') : down ? 'walk_d' : 'walk_u';
    fps = horiz ? 6 : 9;
  } else if (st === 'rest' || st === 'eat' || st === 'pant') {
    key = 'rest_r';
    flip = left;
    fps = 1.5;
  } else {
    key = horiz ? (left ? 'walk_l' : 'walk_r') : down ? 'walk_d' : 'walk_u';
    still = true;
  }
  const [row, n] = M[key];
  let fr = still ? 0 : Math.floor((now + a.t0) * fps) % n;
  if (st === 'pounce' || st === 'drop' || st === 'dive')
    fr = Math.min(n - 1, Math.floor((1 - Math.max(0, a.t) / (a.pt || 0.55)) * n));
  if (key === 'rest_r' && st === 'dead') fr = 1;
  const kid = a.age < JG.KID ? 0.5 + (0.5 * a.age) / JG.KID : 1,
    ds = 0.5 * a.sz * kid,
    dw = W * ds,
    dh = H * ds;
  let by = a.y + 3 - a.z;
  if (a.sw) by += 12 * ds + Math.sin(now * 3 + a.t0) * 0.7;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  if (st === 'dead' && a.t < 2) {
    ctx.globalAlpha = Math.max(0, a.t / 2);
    ctx.translate(0, (2 - a.t) * 3.5);
  }
  ctx.translate(Math.round(a.x), by);
  if (flip) ctx.scale(-1, 1);
  if (sy !== 1) ctx.scale(1, sy);
  ctx.drawImage(im, fr * W, row * H, W, H, -dw / 2, -(H - 2) * ds, dw, dh);
  ctx.restore();
  if (a.sw) {
    ctx.save();
    ctx.strokeStyle = 'rgba(225,242,255,.6)';
    ctx.lineWidth = 0.8;
    for (let k = 0; k < 2; k++) {
      const p = (now * 0.9 + k * 0.5 + a.t0) % 1;
      ctx.globalAlpha = (1 - p) * 0.8;
      ctx.beginPath();
      ctx.ellipse(a.x, a.y + 1, 6 + p * 10, 2.2 + p * 3.4, 0, 0, 6.283);
      ctx.stroke();
    }
    ctx.restore();
  }
  if (st === 'dead' && a.t > 2) carcassFx(a.x, a.y, a.t);
}

export function loadJaguarSprite() {
  JG_IMG.onload = () => {
    JG_CV = bakeImg(JG_IMG);
  };
  JG_IMG.src = assetUrl('sprites/animals/jaguar.webp');
}

/** Atualiza `FTT` a partir de outros módulos (as ligações importadas são somente leitura). */
export function setFTT(value) {
  FTT = value;
  return value;
}

export { FTT, JG, TRAILS, drawJag, faTrail, jagFear, jagSeed, jagUpd, jagWater };
