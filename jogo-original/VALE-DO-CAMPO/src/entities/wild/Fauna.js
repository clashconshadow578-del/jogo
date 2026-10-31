/**
 * Fauna selvagem (cervo, lebre, galo-lira, raposa, javali): habitat, população, fuga, caça, combate, sprites e etiquetas.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { GRASS, HN, HOMEC, MH, MW, TREE, TS, WATER } from '../../config/constants.js';
import { S, sleeping } from '../../core/GameState.js';
import { nightF, sunInfo } from '../../core/TimeManager.js';
import { turnTo, wpick } from '../ai/Steering.js';
import { ATTN, ECO, HUNT, PLAYER_PREY, huntDecision } from '../../config/ecosystem.js';
import { dungTimer } from '../../config/feces.js';
import {
  animalTarget,
  ecoNight,
  ecoNow,
  ecoTick,
  evalPrey,
  hasLOS,
  memAdd,
  memFind,
  memNear,
  memPrune,
  claimPlayerHunt,
  percTick,
  playerTarget,
  releasePlayerHunt,
  senseTarget,
  setEcoHooks,
} from '../ai/Perception.js';
import { hurtPlayer } from '../PlayerHurt.js';
import { dropFeces } from '../../world/Feces.js';
import { carcassDone, carcassFx, carcT, carcUpd, FA_LF, faDie } from '../Carcass.js';
import { plAct } from '../PlayerSprite.js';
import { anaInit, anaInitA, anaSpawnAt, anaUpd } from './Anaconda.js';
import { harpyInit, harpyUpd } from './Harpy.js';
import { FA_WATER, faCrossPick, faCurrent, faMove, faWadeSpot } from './FaunaWater.js';
import { faTrail, FTT, jagFear, jagSeed, jagUpd, JG, setFTT, TRAILS } from './Jaguar.js';
import { faEatDrop, faFruitAt } from '../../features/amazon/AmazonEcology.js';
import { ctx } from '../../rendering/Canvas.js';
import { bakeImg } from '../../rendering/SpriteUtils.js';
import { statusTopOf } from '../../rendering/AnimalStatus.js';
import { torchLit } from '../../rendering/Torch.js';
import { solid } from '../../systems/CollisionSystem.js';
import { fishUpd } from '../../systems/Fishing.js';
import { toast } from '../../ui/Toast.js';
import { assetUrl } from '../../utils/assets.js';
import { rr } from '../../utils/Random.js';
import { DOOR } from '../../world/HouseInterior.js';
import { bio, mato, om, prox, seedAge, sm } from '../../world/hydrology/Hydrology.js';
import { TRAMPLE } from '../../config/trampling.js';
import { FARM_PREY } from '../../config/ecosystem.js';
import { farmPrey, farmUpdate } from '../farm/FarmPrey.js';
import { COBERTURA, plantStage } from '../../config/plants.js';
import { walkTrample } from '../../world/GrassSystem.js';
import { animalSpeed, trailK } from '../../world/Trails.js';
import { flowAt, FQX, FQY } from '../../world/hydrology/RiverFlow.js';
import { INST } from '../../world/Instances.js';
import { shroom } from '../../world/Mushrooms.js';
import { wCam, WG, WGW, wImpulse, wM } from '../../world/WaterSystem.js';
import { climate } from '../../world/WeatherSystem.js';
import { ground, obj } from '../../world/World.js';

/* ============ FAUNA SELVAGEM: cervo, lebre, galo-lira (presas) · raposa (predador) · javali (onívoro territorial) ============ */
const FA_SRC = {
  deer: {
    idle: assetUrl('sprites/animals/deer/idle.webp'),
    walk: assetUrl('sprites/animals/deer/walk.webp'),
    run: assetUrl('sprites/animals/deer/run.webp'),
    death: assetUrl('sprites/animals/deer/death.webp'),
  },
  hare: {
    idle: assetUrl('sprites/animals/hare/idle.webp'),
    walk: assetUrl('sprites/animals/hare/walk.webp'),
    run: assetUrl('sprites/animals/hare/run.webp'),
    death: assetUrl('sprites/animals/hare/death.webp'),
  },
  grouse: {
    idle: assetUrl('sprites/animals/grouse/idle.webp'),
    walk: assetUrl('sprites/animals/grouse/walk.webp'),
    fly: assetUrl('sprites/animals/grouse/fly.webp'),
    death: assetUrl('sprites/animals/grouse/death.webp'),
  },
  fox: {
    idle: assetUrl('sprites/animals/fox/idle.webp'),
    walk: assetUrl('sprites/animals/fox/walk.webp'),
    run: assetUrl('sprites/animals/fox/run.webp'),
    death: assetUrl('sprites/animals/fox/death.webp'),
  },
  boar: {
    idle: assetUrl('sprites/animals/boar/idle.webp'),
    walk: assetUrl('sprites/animals/boar/walk.webp'),
    run: assetUrl('sprites/animals/boar/run.webp'),
    death: assetUrl('sprites/animals/boar/death.webp'),
    attack: assetUrl('sprites/animals/boar/attack.webp'),
  },
};

function boarDark(c) {
  try {
    const x = c.getContext('2d'),
      d = x.getImageData(0, 0, c.width, c.height),
      p = d.data;
    for (let i = 0; i < p.length; i += 4) {
      if (p[i + 3] < 20) continue;
      const r = p[i],
        g = p[i + 1],
        b = p[i + 2],
        l = r * 0.3 + g * 0.59 + b * 0.11;
      if (l > 165) {
        p[i] = p[i + 1] = p[i + 2] = 245;
        continue;
      } // lábio/queixo branco (as "queixadas")
      if (b > r + 10) {
        p[i] = Math.round(r * 0.6);
        p[i + 1] = Math.round(g * 0.6);
        p[i + 2] = Math.round(b * 0.6);
        continue;
      } // crina azulada escura
      const k = 0.5;
      p[i] = Math.round(r * k + 10);
      p[i + 1] = Math.round(g * k + 7);
      p[i + 2] = Math.round(b * k + 6);
    } // pelagem marrom-escura/preta
    x.putImageData(d, 0, 0);
  } catch (e) {}
  return c;
}

const FA_SPR = {};

const FA_SP = {
  deer: {
    n: 'Cervo',
    e: '🦌',
    role: 'presa',
    diet: 'herbívoro',
    sc: 1.1,
    sw: 20,
    hh: 22,
    walk: 24,
    run: 64,
    fear: 92,
    stam: 6,
    col: '#a8ec8f',
    tip: 'vive em bandos na borda da mata e bebe água ao amanhecer e entardecer',
  },
  hare: {
    n: 'Lebre',
    e: '🐇',
    role: 'presa',
    diet: 'herbívoro',
    sc: 0.95,
    sw: 9,
    hh: 12,
    walk: 20,
    run: 78,
    fear: 78,
    stam: 4.5,
    col: '#a8ec8f',
    tip: 'esconde-se no mato alto e foge em zigue-zague',
  },
  grouse: {
    n: 'Galo-lira',
    e: '🐦',
    role: 'presa',
    diet: 'granívoro',
    sc: 1,
    sw: 10,
    hh: 14,
    walk: 16,
    run: 0,
    fear: 48,
    stam: 9,
    col: '#a8ec8f',
    tip: 'vive no chão da mata e levanta voo quando assustado',
  },
  fox: {
    n: 'Raposa',
    e: '🦊',
    role: 'predador',
    diet: 'carnívoro',
    sc: 1,
    sw: 14,
    hh: 16,
    walk: 22,
    run: 70,
    fear: 72,
    stam: 7,
    col: '#ff9d78',
    tip: 'caça lebres e aves ao anoitecer e foge de pessoas',
  },
  harpy: {
    n: 'Harpia',
    e: '🦅',
    role: 'predador de topo (aéreo)',
    diet: 'carnívoro',
    sc: 1,
    sw: 14,
    hh: 30,
    walk: 20,
    run: 62,
    fear: 60,
    stam: 9,
    col: '#ffb4a0',
    tip: 'Harpia harpyja · pousa na copa das sumaúmas (as gigantes são as preferidas) e passa a maior parte do dia parada, observando · caça animais da mata de um poleiro: rastreia, se posiciona e dá o razante com as garras · só ataca quem chega perto do ninho, depois de avisar levantando a crista e gritando · evita onças no chão e expulsa outras harpias da sua árvore',
  },
  boar: {
    n: 'Queixada',
    e: '🐗',
    role: 'onívoro gregário (bando)',
    diet: 'onívoro-frugívoro',
    sc: 0.95,
    sw: 16,
    hh: 16,
    walk: 22,
    run: 62,
    fear: 78,
    stam: 9,
    col: '#ffd27a',
    tip: 'Tayassu pecari · vive em bandos que seguem uma líder pela mata úmida e veredas · come frutos caídos (buriti, castanha, coquinhos), sementes, raízes, cogumelos, minhocas e, às vezes, carniça · fuça o solo, toma banho de lama e nada rios em grupo · caninos curtos e afiados: ao se sentir ameaçada ESTALA OS DENTES e o bando inteiro investe junto · cheiro forte de almíscar · predadores: onça-pintada e sucuri/jacaré na água (e gente)',
  },
  anaconda: {
    n: 'Sucuri',
    e: '🐍',
    role: 'predador de emboscada (semiaquático)',
    diet: 'carnívoro',
    sc: 0.75,
    sw: 30,
    hh: 10,
    walk: 22,
    run: 60,
    fear: 0,
    stam: 9,
    col: '#e0c068',
    tip: 'Eunectes murinus · maior cobra do mundo em peso (até ~6 m) · fica SUBMERSA na água rasa, só com olhos e narinas fora, esperando a presa vir beber · sente o calor da presa pelos lábios, por isso caça mais à noite · lenta em terra, o bote é um disparo de ~0,2 s · NÃO é venenosa: morde para prender e enrola o corpo; a presa morre por parada circulatória, não esmagada · engole inteira pela cabeça e fica com a barriga do tamanho da presa, letárgica por dias · foge de gente; um bando de queixadas a expulsa',
  },
  jaguar: {
    n: 'Onça-pintada',
    e: '🐆',
    role: 'predador de topo',
    diet: 'carnívoro',
    sc: 1.15,
    sw: 20,
    hh: 13,
    walk: 24,
    run: 84,
    fear: 0,
    stam: 3.2,
    col: '#ffb04a',
    tip: 'emboscadora solitária: espreita agachada, salta e morde a nuca da presa; nada, sobe em árvores e caça cervos e queixadas, sobretudo ao anoitecer; evita bandos grandes de queixadas',
  },
};

// Animais da fazenda como presas (entities/farm/FarmPrey.js): precisam das mesmas colunas que as espécies selvagens (velocidade, fôlego, porte).
for (const k in FARM_PREY) {
  const F = FARM_PREY[k];
  FA_SP[k] = { n: F.n, e: F.e, role: 'presa (fazenda)', diet: 'herbívoro', sc: 1, sw: F.sw, hh: F.hh, walk: F.walk, run: F.run, fear: F.fear, stam: F.stam, col: '#fff', tip: '' };
}

const FA_ST = {
  flee: '💨',
  fly: '💨',
  alert: '❗',
  stalk: '🎯',
  chase: '🎯',
  eat: '🍖',
  rest: '💤',
  forage: '🌿',
  drink: '💧',
  wallow: '🛁',
  warn: '💢',
  charge: '💢',
  retreat: '💨',
  fight: '⚔️',
  pant: '😮‍💨',
  swim: '🏊',
  climb: '🧗',
  descend: '🧗',
  perch: '🌳',
  display: '🪶',
  pounce: '🎯',
  drop: '🎯',
  jfight: '⚔️',
  drag: '🍖',
  roar: '📢',
  mate: '💕',
  disperse: '🧭',
  warn: '💢',
  angle: '🐟',
  track: '🐾',
  watch: '👀',
  dive: '💦',
  observe: '👀',
  investigate: '🔍',
  freeze: '🧊',
  recover: '😮‍💨',
  pstalk: '🎯',
  pchase: '💨',
  pattack: '⚔️',
  pinvest: '🔍',
  coil: '⚠️',
};

/* cobertura vegetal (mato alto) e tocha do jogador alimentam a percepção dos animais */
setEcoHooks({
  coverAt: (x, y) => {
    const tx = Math.floor(x / TS),
      ty = Math.floor(y / TS);
    return tx < 0 || ty < 0 || tx >= MW || ty >= MH ? 0 : COBERTURA[plantStage(mato[ty * MW + tx])]; // mato alto esconde (config/plants.js)
  },
  playerLit: () => {
    try {
      return torchLit();
    } catch (e) {
      return false;
    }
  },
});

let boarClkT = 0,
  boarSmellT = 0;

function boarMates(a, r) {
  let n = 0;
  for (const q of fauna)
    if (q.sp === 'boar' && q !== a && q.state !== 'dead' && q.state !== 'fight' && Math.hypot(q.x - a.x, q.y - a.y) < r)
      n++;
  return n;
}

const fauna = [];
let faId = 1,
  faMgr = 0,
  harpyTent = 0, // quantas vezes já tentou criar o casal de harpias (as árvores adultas podem demorar a existir)
  faInitDone = false;
const faSeen = {};
let faShoreL = [],
  faShoreT = -99;

function faFree(x, y) {
  for (const ox of [-3, 3]) {
    const tx = Math.floor((x + ox) / TS),
      ty = Math.floor(y / TS);
    if (tx < 1 || ty < 1 || tx >= MW - 1 || ty >= MH - 1 || solid(tx, ty)) return false;
  }
  return true;
}

function faTrees(tx, ty, r) {
  let n = 0,
    t = 0;
  for (let y = ty - r; y <= ty + r; y++)
    for (let x = tx - r; x <= tx + r; x++) {
      t++;
      if (x >= 0 && y >= 0 && x < MW && y < MH && obj[y * MW + x] === TREE) n++;
    }
  return n / t;
}

function faHab(sp, tx, ty, kind) {
  // preferência de habitat de cada espécie
  const i = ty * MW + tx,
    d = faTrees(tx, ty, 3),
    pw = prox[i],
    mt = mato[i] / 255,
    dh = Math.hypot(tx - DOOR.x, ty - DOOR.y);
  let s = 0;
  if (sp === 'deer')
    s = 1 - Math.abs(d - 0.28) * 2.2 + mt * 0.7 + pw * 0.5; // borda de floresta + pasto + água
  else if (sp === 'hare')
    s = 1 - Math.abs(d - 0.2) * 2.5 + mt * 1.4 - pw * 0.6; // mato alto = esconderijo, longe da água
  else if (sp === 'grouse')
    s = d * 1.6 + mt * 0.6 - pw * 0.4; // chão da mata
  else if (sp === 'fox')
    s = 1 - Math.abs(d - 0.35) * 2 + mt * 0.8; // caça na borda da mata
  else if (sp === 'jaguar')
    s = d * 1.5 + pw * 1.1 + mt * 0.3; // onça: mata fechada perto de água
  else s = d * 1.3 + pw * 1.3 + sm[i] * 0.9; // queixada: mata densa, solo úmido e veredas perto d'água
  if (kind === 'rest') s += d * (sp === 'fox' || sp === 'boar' || sp === 'jaguar' ? 2.2 : 1.6);
  if (kind === 'shelter') s += d * 2.5;
  if (sp !== 'hare' && sp !== 'grouse' && dh < 10) s -= (10 - dh) * 0.25; // evita a casa
  return s;
}

function faFood(a, tx, ty) {
  const i = ty * MW + tx;
  if (ground[i] !== GRASS) return 0; // alimento preferido de cada espécie
  if (a.sp === 'deer' || a.sp === 'hare') return mato[i] / 255;
  if (a.sp === 'grouse') return (seedAge[i] > 0 ? 0.8 : 0) + (shroom[i] ? 0.5 : 0);
  if (a.sp === 'boar')
    return (
      (shroom[i] ? 1 : 0) +
      (seedAge[i] > 0 ? 0.7 : 0) +
      (mato[i] / 255) * 0.3 +
      (typeof faFruitAt === 'function' ? faFruitAt(tx, ty) : 0)
    ); // frutos caídos, sementes, raízes, cogumelos
  return 0;
}

function faAct(sp, h) {
  const n = nightF(h),
    c = 4 * n * (1 - n);
  let v =
    sp === 'deer'
      ? 0.25 + 0.9 * c + 0.25 * n
      : sp === 'hare'
        ? 0.2 + 0.5 * c + 0.5 * n
        : sp === 'grouse'
          ? 1 - 0.9 * n
          : sp === 'fox'
            ? 0.15 + 0.5 * c + 0.7 * n
            : sp === 'boar'
              ? 0.35 + 0.65 * (1 - n)
              : 0.2 + 0.5 * c + 0.5 * n;
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// Quanto o caminho (x0,y0) -> (x1,y1) segue trilha batida: média da trilha em 3 pontos do trajeto (0-1).
function faWorn(x0, y0, x1, y1) {
  let t = 0;
  for (let k = 1; k <= 3; k++) {
    const i = Math.floor((y0 + ((y1 - y0) * k) / 3) / TS) * MW + Math.floor((x0 + ((x1 - x0) * k) / 3) / TS);
    if (i >= 0 && i < HN) t += trailK(i);
  }
  return t / 3;
}

// A fauna também pisoteia: cada espécie com o seu peso (config/trampling.js); cervo e queixada deixam pegada de casco.
function faTrample(a) {
  const w = TRAMPLE.peso[a.sp];
  if (w) walkTrample('f' + a.id, a.x, a.y, w * (a.age < 999 ? 0.5 : 1), a.sp === 'deer' || a.sp === 'boar' ? 'cow' : 'n');
}

function faPick(a, R, kind) {
  let best = null,
    bs = -1e9;
  for (let k = 0; k < 10; k++) {
    const an = Math.random() * 6.283,
      d = R * (0.3 + Math.random() * 0.7),
      x = a.x + Math.cos(an) * d,
      y = a.y + Math.sin(an) * d;
    if (!faFree(x, y)) continue;
    const s =
      faHab(a.sp, Math.floor(x / TS), Math.floor(y / TS), kind) +
      (kind === '' ? faFood(a, Math.floor(x / TS), Math.floor(y / TS)) * (0.6 + a.hun * 2.2) : 0) -
      (d / R) * 0.6 +
      faWorn(a.x, a.y, x, y) * 0.9 - // prefere seguir trilhas já batidas (gasta menos energia)
      (a.mem && a.mem.length && memNear(a, x, y, (ECO[a.sp] || {}).avoidR || 0) ? 1.4 : 0) + // evita onde viu o predador
      Math.random() * 0.35;
    if (s > bs) {
      bs = s;
      best = [x, y];
    }
  }
  return best;
}

function faShoreNear(a) {
  const now = performance.now() / 1000;
  if (now - faShoreT > 30) {
    faShoreT = now;
    faShoreL = [];
    for (let ty = 2; ty < MH - 2; ty++)
      for (let tx = 2; tx < MW - 2; tx++) {
        const i = ty * MW + tx;
        if (ground[i] !== GRASS || obj[i]) continue;
        if (ground[i - 1] === WATER || ground[i + 1] === WATER || ground[i - MW] === WATER || ground[i + MW] === WATER)
          faShoreL.push([tx * TS + 8, ty * TS + 8]);
      }
  }
  let best = null,
    bd = 400;
  for (const p of faShoreL) {
    const d = Math.hypot(p[0] - a.x, p[1] - a.y) + Math.random() * 60;
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}

function faSpawn(sp, x, y, kid) {
  const a = {
    id: faId++,
    sp,
    x,
    y,
    dir: Math.random() * 6.283,
    state: 'idle',
    t: rr(1, 4),
    hun: Math.random() * 0.5,
    thi: Math.random() * 0.4,
    stam: 1,
    stuck: 0,
    z: 0,
    mv: false,
    age: kid ? 0 : 999,
    bold: 0.3 + Math.random() * 0.7,
    cd: 0,
    row: 0,
    sz: 0.92 + Math.random() * 0.16,
    t0: Math.random() * 5,
    herd: 0,
  };
  fauna.push(a);
  return a;
}

function faSpot(sp, minD) {
  let best = null,
    bs = -1e9;
  for (let k = 0; k < 50; k++) {
    const tx = Math.max(2, Math.min(MW - 3, Math.round(S.px / TS + rr(-62, 62)))),
      ty = Math.max(2, Math.min(MH - 3, Math.round(S.py / TS + rr(-40, 40)))),
      x = tx * TS + 8,
      y = ty * TS + 8;
    if (
      !faFree(x, y) ||
      ground[ty * MW + tx] !== GRASS ||
      Math.hypot(x - S.px, y - S.py) < minD ||
      Math.hypot(tx - DOOR.x, ty - DOOR.y) < 12
    )
      continue;
    const s = faHab(sp, tx, ty, '') + Math.random() * 0.5;
    if (s > bs) {
      bs = s;
      best = [x, y];
    }
  }
  return best;
}

function faInit() {
  for (const [sp, n] of [
    ['deer', 3],
    ['hare', 4],
    ['grouse', 3],
    ['fox', 1],
    ['boar', 5],
  ]) {
    let p = faSpot(sp, 150);
    if (!p) continue;
    for (let k = 0; k < n; k++) {
      const a = faSpawn(sp, p[0] + (k ? rr(-14, 14) : 0), p[1] + (k ? rr(-14, 14) : 0), false);
      if (!faFree(a.x, a.y)) {
        a.x = p[0];
        a.y = p[1];
      }
      a.herd = sp === 'deer' || sp === 'boar' ? 1 : 0;
    }
  }
  try {
    anaInit();
  } catch (e) {
    console.error('anaInit', e);
  }
  try {
    harpyInit(); // o casal de harpias na sumaúma adulta (se as árvores ainda não existem, faManage tenta de novo)
  } catch (e) {
    console.error('harpyInit', e);
  }
  if (INST.cx === HOMEC.x && INST.cy === HOMEC.y) {
    if (!S.jagDone) jagSeed();
  } // casal fundador de onças no mapa inicial
  else if (Math.random() < 0.12) {
    const p = faSpot('jaguar', 150);
    if (p) {
      const a = faSpawn('jaguar', p[0], p[1], false);
      a.sex = Math.random() < 0.5 ? 'm' : 'f';
      a.hx = a.x;
      a.hy = a.y;
      a.sz = a.sex === 'm' ? 1.08 : 0.94;
      a.mcd = 60;
    }
  }
}

function faManage(dt) {
  faMgr += dt;
  if (faMgr < 18) return;
  faMgr = 0;
  for (const a of fauna) if (a.state !== 'dead' && Math.hypot(a.x - S.px, a.y - S.py) > 1e9) a.gone = true;
  const cnt = {};
  for (const a of fauna) if (a.state !== 'dead') cnt[a.sp] = (cnt[a.sp] || 0) + 1;
  const prey = (cnt.hare || 0) + (cnt.grouse || 0),
    tg = { deer: 3, hare: 5, grouse: 4, fox: prey >= 7 ? 2 : 1, boar: 5 }; // reprodução / imigração conforme alimento e habitat
  for (const sp in tg) {
    if ((cnt[sp] || 0) >= tg[sp]) continue;
    const par = fauna.find((a) => a.sp === sp && a.state !== 'dead' && a.age > 200 && a.hun < 0.7);
    if (par && sp !== 'fox' && Math.random() < (sp === 'boar' ? 0.5 : 0.7)) {
      const k = faSpawn(sp, par.x + rr(-8, 8), par.y + rr(4, 9), true);
      if (!faFree(k.x, k.y)) {
        k.x = par.x;
        k.y = par.y;
      }
      k.herd = par.herd;
      continue;
    }
    if ((sp === 'fox' && prey < 3) || Math.random() < 0.5) continue;
    const p = faSpot(sp, 170);
    if (p) faSpawn(sp, p[0], p[1], false);
  }
  {
    const ac = cnt.anaconda || 0;
    if (ac < 1 && Math.random() < 0.02) {
      try {
        const w = anaSpawnAt();
        if (w) {
          const a = faSpawn('anaconda', w[0], w[1], false);
          anaInitA(a);
        }
      } catch (e) {}
    }
  } // raramente chega uma sucuri nova
  if (!(cnt.harpy > 0) && (harpyTent++ < 40 || Math.random() < 0.02)) {
    try {
      harpyInit(); // as árvores amazônicas adultas só existem depois do começo do jogo: tenta de novo; depois, raramente chega um novo casal
    } catch (e) {}
  }
  const jc = cnt.jaguar || 0; // onças: reprodução é interna; só chega um indivíduo novo de vez em quando, se houver presas
  if (S.jagDone && jc < 2 && (cnt.deer || 0) + (cnt.boar || 0) >= 3 && Math.random() < 0.04) {
    const ad = fauna.filter((a) => a.sp === 'jaguar' && a.state !== 'dead' && a.age >= JG.KID);
    if (jc === 0 || ad.length === 1) {
      const p = faSpot('jaguar', 220);
      if (p) {
        const a = faSpawn('jaguar', p[0], p[1], false);
        a.sex = ad.length ? (ad[0].sex === 'm' ? 'f' : 'm') : Math.random() < 0.5 ? 'm' : 'f';
        a.hx = a.x;
        a.hy = a.y;
        a.sz = a.sex === 'm' ? 1.08 : 0.94;
        a.mcd = 60;
      }
    }
  }
}

function faStep(a, tx, ty, sp, dt, fly) {
  const dx = tx - a.x,
    dy = ty - a.y,
    d = Math.hypot(dx, dy);
  if (d < 2) return true;
  let ang = Math.atan2(dy, dx);
  const wf = fly ? 1 : a.inW ? a.wf || 0.6 : 1,
    v = sp * wf * (fly || a.inW ? 1 : animalSpeed(a.x, a.y)); // mato fechado freia, trilha batida acelera
  if (!fly && a.inW && a.dk > 0 && flowAt(a.x, a.y) > 1) {
    const hx = (dx / d) * v - FQX * a.dk,
      hy = (dy / d) * v - FQY * a.dk;
    if (Math.hypot(hx, hy) > 4) ang = Math.atan2(hy, hx);
  } // nada em ângulo contra a correnteza (ferry glide)
  turnTo(a, ang, dt * 1.6);
  const st = Math.min(d, v * dt);
  let ok = false;
  for (const off of [0, 0.7, -0.7, 1.4, -1.4]) {
    const an = a.dir + off,
      nx = a.x + Math.cos(an) * st,
      ny = a.y + Math.sin(an) * st;
    if (fly || faMove(a, nx, ny)) {
      a.x = Math.max(TS * 2, Math.min(MW * TS - TS * 2, nx));
      a.y = Math.max(TS * 2, Math.min(MH * TS - TS * 2, ny));
      ok = true;
      break;
    }
  }
  a.mv = ok;
  if (ok && !fly && !a.inW) faTrample(a);
  a.stuck = ok ? Math.max(0, a.stuck - dt) : a.stuck + dt;
  return false;
}

function faGo(a, x, y, sp, after, dur) {
  a.gx = x;
  a.gy = y;
  a.spd = sp;
  a.after = after;
  a.adur = dur;
  a.state = 'go';
  a.stuck = 0;
}

function faRow(a) {
  const c = Math.cos(a.dir),
    s = Math.sin(a.dir);
  return Math.abs(c) > Math.abs(s) ? (c < 0 ? 2 : 3) : s > 0 ? 0 : 1;
}

/* valor da refeição e perigo de revide das presas da raposa */
const FOX_PREY = {
  hare: { value: 0.4, counter: 0.28 },
  grouse: { value: 0.3, counter: 0.18 },
  chicken: { value: 0.45, counter: 0.1 }, // galinha da fazenda: a raposa é uma raposa comum, caça o que ela detecta
};

/**
 * A raposa procura presas que ela DETECTA (visão/audição, com linha de visão) e avalia cada oportunidade:
 * probabilidade de captura × valor (a fome só aumenta o valor) − custo/risco. Retorna a melhor { p, ev, dec }
 * ('attack' | 'observe' | 'skip') ou null. Não depende de fome.
 */
function foxScan(a) {
  const I = FA_SP.fox,
    H = HUNT.fox;
  let best = null;
  for (const p of fauna.concat(farmPrey())) {
    const F = FOX_PREY[p.sp];
    if (!F || p.state === 'dead' || p.state === 'fly' || p.state === 'land' || p.state === 'fight' || p.hunter)
      continue;
    if (Math.abs(p.x - a.x) > H.scanR || Math.abs(p.y - a.y) > H.scanR) continue;
    const r = evalPrey(a, p, {
      hunt: H,
      vPred: I.run,
      vPrey: p.sp === 'grouse' ? 88 * 0.6 : FA_SP[p.sp].run, // ave tem de levantar voo: conta como foge menos que lebre
      value: F.value,
      counter: F.counter,
    });
    if (!r) continue;
    r.dec = huntDecision(r.ev, H, (Math.random() - 0.5) * 0.05);
    if (!best || r.ev.score > best.ev.score) best = r;
  }
  return best;
}

/** A raposa vê o alvo agora? Atualiza a última posição vista (para investigar se perder). */
function foxSees(a, p, dt) {
  if (!percTick(a, dt, 'f')) return a.seeTgt;
  const s = senseTarget(a, animalTarget(p));
  a.seeTgt = s.any;
  if (s.any) {
    a.lastSeen = { x: p.x, y: p.y, t: ecoNow() };
    a.loseT = 0;
  } else a.loseT = (a.loseT || 0) + 0.25;
  return a.seeTgt;
}

function foxOk(p) {
  return !!p && !p.gone && p.state !== 'dead' && p.state !== 'fly' && p.state !== 'land' && p.state !== 'fight';
}

/** Reavalia a presa que a raposa já detecta: 'attack' | 'observe' | 'skip'. */
function foxDecide(a, p) {
  const F = FOX_PREY[p.sp];
  if (!F) return 'skip';
  const r = evalPrey(a, p, {
    hunt: HUNT.fox,
    vPred: FA_SP.fox.run,
    vPrey: FA_SP[p.sp].run,
    value: F.value,
    counter: F.counter,
  });
  return r ? huntDecision(r.ev, HUNT.fox, (Math.random() - 0.5) * 0.05) : 'skip';
}

/** Desiste de uma caça: descansa (pant) e só tenta de novo depois do intervalo da espécie. */
function foxGiveUp(a, H, rest) {
  a.state = rest ? 'pant' : 'idle';
  a.t = rest ? H.recoverT : 2.5;
  a.cd = H.cool * (0.8 + Math.random() * 0.5);
  a.tgt = null;
  a.lastSeen = null;
  a.obsN = 0;
}

/* raio-base de medo (px) de lebre e galo-lira diante da raposa, conforme o que ela faz */
const FOX_FEAR = { hare: { walk: 38, stalk: 85, chase: 125 }, grouse: { walk: 24, stalk: 50, chase: 72 } };
const ANA_FEAR = 60;
// raio-base de medo (px) diante da harpia: passeando, rastreando, no razante
const HARPY_FEAR = {
  hare: { walk: 45, stalk: 95, stoop: 190 },
  grouse: { walk: 40, stalk: 80, stoop: 170 },
  deer: { walk: 0, stalk: 0, stoop: 60 },
  boar: { walk: 0, stalk: 0, stoop: 60 },
};
const FOX_HUNTING = { stalk: 1, chase: 1, observe: 1, investigate: 1 };

/**
 * Percepção de ameaças de presas e raposa. Um animal só reage ao que DETECTA: distância, visão (alcance da espécie,
 * de noite, atenção do que está fazendo), linha de visão (árvores/pedras tapam), movimento do predador (quem espreita
 * é difícil de ver), camuflagem e audição de movimento rápido. Roda a cada PERC_DT (defasado por animal); entre os testes
 * devolve o último resultado. Cada ameaça detectada vira uma lembrança curta (posição, validade ~22 s).
 * Retorna { x, y, d, r, src, id } ou null.
 */
function faSense(a, I, dt, withPlayer) {
  if (!percTick(a, dt, 's')) return a.thc || null;
  memPrune(a);
  const P = ECO[a.sp] || ECO.deer;
  let attn = ATTN[a.state] != null ? ATTN[a.state] : 1;
  if (attn < 1) attn += (1 - attn) * P.vigil * 0.5; // bichos vigilantes comem de cabeça meio erguida
  if (ecoNow() < (a.nerv || 0)) attn *= 1.2; // ainda tenso depois de um susto: acalma aos poucos
  const nk = 1 - (1 - P.nightMul) * ecoNight();
  let mates = 0; // bando: mais olhos = alcance de detecção maior (cervo, queixada, galo-lira)
  if (P.herdAlarm)
    for (const f of fauna)
      if (f !== a && f.sp === a.sp && f.state !== 'dead' && Math.abs(f.x - a.x) < 70 && Math.abs(f.y - a.y) < 70)
        mates++;
  const k = attn * nk * (1 + 0.12 * Math.min(4, mates));
  let th = null,
    bu = 1e9;
  const take = (src, id, x, y, s) => {
    if (!s.any) return;
    const r = s.seen ? s.eff : P.hear,
      u = s.dist / Math.max(1, r);
    if (u < bu) {
      bu = u;
      th = { x, y, d: s.dist, r: Math.max(r, s.dist), src, id };
    }
  };
  if (withPlayer && !S.inside) take('player', -1, S.px, S.py, senseTarget(a, playerTarget(), I.fear * k));
  if (a.sp === 'boar') a.seePl = !S.inside && senseTarget(a, playerTarget(), I.fear * 1.3 * k).any; // a queixada só reage a quem percebe
  for (const f of fauna) {
    if (f === a || f.state === 'dead' || f.gone || f.state === 'perch') continue;
    if (Math.abs(f.x - a.x) > 260 || Math.abs(f.y - a.y) > 260) continue;
    if (f.sp === 'jaguar') {
      const r0 = jagFear(a, f);
      if (r0) take('jaguar', f.id, f.x, f.y, senseTarget(a, animalTarget(f), r0 * k));
    } else if (f.sp === 'fox' && (a.sp === 'hare' || a.sp === 'grouse')) {
      const F = FOX_FEAR[a.sp],
        r0 = f.state === 'chase' ? F.chase : FOX_HUNTING[f.state] ? F.stalk : F.walk;
      take('fox', f.id, f.x, f.y, senseTarget(a, animalTarget(f), r0 * k));
    } else if (f.sp === 'anaconda' && a.sp !== 'anaconda' && f.state !== 'dead') {
      take('anaconda', f.id, f.x, f.y, senseTarget(a, animalTarget(f), ANA_FEAR * k));
    } else if (f.sp === 'harpy' && HARPY_FEAR[a.sp]) {
      // a sombra e o grito de uma ave de rapina: quem é presa dela (lebre, galo-lira, filhotes) a percebe de longe, mais ainda no razante
      const F = HARPY_FEAR[a.sp];
      take('harpy', f.id, f.x, f.y, senseTarget(a, animalTarget(f), (f.state === 'hstoop' || f.state === 'hdefend' ? F.stoop : f.state === 'htrack' || f.state === 'hprep' ? F.stalk : F.walk) * k));
    }
  }
  if (th) {
    memAdd(a, 'threat', th.x, th.y, th.id, { src: th.src });
    a.nerv = ecoNow() + P.calmAfter;
  }
  a.thc = th;
  return th;
}

/** O alarme de um membro do bando (cervo, queixada, galo-lira) alcança os vizinhos da mesma espécie: é comunicação, não onisciência. */
function faAlarm(a, th) {
  const P = ECO[a.sp];
  if (!P || !P.herdAlarm) return;
  for (const q of fauna) {
    if (
      q === a ||
      q.sp !== a.sp ||
      q.state === 'dead' ||
      q.state === 'flee' ||
      q.state === 'fly' ||
      q.state === 'fight'
    )
      continue;
    if (Math.hypot(q.x - a.x, q.y - a.y) > P.herdAlarm) continue;
    memAdd(q, 'threat', th.x, th.y, th.id, { src: th.src });
    q.nerv = ecoNow() + P.calmAfter;
    if (a.sp === 'boar') {
      if (
        q.state !== 'warn' &&
        q.state !== 'charge' &&
        q.state !== 'retreat' &&
        q.state !== 'alert' &&
        q.state !== 'eat'
      ) {
        q.state = 'alert';
        q.t = rr(P.alertFor[0], P.alertFor[1]);
        q.th = th;
      }
    } else if (q.state !== 'eat') {
      q.state = a.sp === 'grouse' ? 'fly' : 'flee';
      q.t = a.sp === 'grouse' ? rr(1.8, 2.8) : rr(2.5, 4);
      q.fang = a.fang + rr(-0.4, 0.4);
      q.zz = 0;
    }
  }
}

/** Ponto seguro para a fuga (lebre procura mato alto/árvores; os outros, qualquer lado oposto à ameaça). Retorna ângulo. */
function faSafeAngle(a, th) {
  const away = Math.atan2(a.y - th.y, a.x - th.x),
    R = (ECO[a.sp] || {}).shelterR || 0;
  if (!R) return away + rr(-0.6, 0.6);
  let best = away,
    bs = -1e9;
  for (let k = 0; k < 8; k++) {
    const an = away + (k - 3.5) * 0.4,
      x = a.x + Math.cos(an) * R,
      y = a.y + Math.sin(an) * R;
    if (!faFree(x, y)) continue;
    const s =
      faHab(a.sp, Math.floor(x / TS), Math.floor(y / TS), 'shelter') - Math.abs(an - away) * 0.5 + Math.random() * 0.2;
    if (s > bs) {
      bs = s;
      best = an;
    }
  }
  return best;
}

function faFlee(a, th) {
  a.state = a.sp === 'grouse' ? 'fly' : 'flee';
  a.t = a.sp === 'grouse' ? rr(1.8, 2.8) : rr(2.5, 4);
  a.zz = 0;
  a.fleeExt = 0;
  a.fang = a.sp === 'hare' && th.src ? faSafeAngle(a, th) : Math.atan2(a.y - th.y, a.x - th.x) + rr(-0.6, 0.6);
  if (th.src) {
    memAdd(a, 'threat', th.x, th.y, th.id, { src: th.src });
    a.nerv = ecoNow() + (ECO[a.sp] || ECO.deer).calmAfter;
    faAlarm(a, th); // cervo, queixada e galo-lira avisam o bando
  } else if (a.sp === 'deer')
    for (const q of fauna)
      if (
        q !== a &&
        q.sp === 'deer' &&
        q.state !== 'dead' &&
        q.state !== 'flee' &&
        Math.hypot(q.x - a.x, q.y - a.y) < 110
      ) {
        q.state = 'flee';
        q.t = rr(2.5, 4);
        q.fang = a.fang + rr(-0.4, 0.4);
        q.zz = 0;
      }
}

function faKill(p, f) {
  p.state = 'dead';
  p.t = carcT(p.x, p.y);
  p.d0 = performance.now() / 1000;
  p.z = 0;
  p.row = faRow(p);
  f.state = 'eat';
  f.t = 8;
  f.tgt = p;
  f.cd = 10;
  f.hun = Math.max(0, f.hun - 0.75);
  if (Math.hypot(S.px - p.x, S.py - p.y) < 170)
    toast('🦊 A raposa caçou ' + (p.sp === 'hare' ? 'uma lebre' : p.sp === 'chicken' ? 'uma galinha' : 'um galo-lira'));
}

const FA_BATTLE = { hare: { hp: 10, ctr: 2.6 }, grouse: { hp: 8, ctr: 1.6 }, chicken: { hp: 5, ctr: 0.9 }, fox: { hp: 24, bite: 3.6 } }; // batalha: vida e dano por segundo

function faBegin(p, f) {
  const B = FA_BATTLE[p.sp];
  f.state = 'fight';
  f.t = 22;
  f.fhp = FA_BATTLE.fox.hp;
  f.tgt = p;
  f.cd = 10;
  f.atk = false;
  p.state = 'fight';
  p.hunter = f;
  p.fhp = B.hp;
  p.z = 0;
  p.dir = Math.atan2(f.y - p.y, f.x - p.x);
  if (Math.hypot(S.px - p.x, S.py - p.y) < 170)
    toast('⚔️ A raposa ataca ' + (p.sp === 'hare' ? 'uma lebre' : 'um galo-lira') + '!');
}

function faFight(f, dt) {
  const p = f.tgt;
  f.t -= dt;
  if (!p || p.gone || p.state !== 'fight') {
    f.state = 'idle';
    f.t = 2;
    f.cd = 8;
    f.tgt = null;
    f.atk = false;
    return;
  }
  const B = FA_BATTLE[p.sp],
    F = FA_BATTLE.fox;
  turnTo(f, Math.atan2(p.y - f.y, p.x - f.x), dt * 4);
  f.atk = Math.sin(f.t * 12) > 0; // mordidas em pulsos
  p.fhp -= F.bite * dt * (0.7 + Math.random() * 0.6);
  f.fhp -= B.ctr * dt * (0.6 + Math.random() * 0.8);
  if (p.fhp <= 0) {
    faKill(p, f);
    return;
  }
  if (f.fhp <= 0 || f.t <= 0) {
    const ang = Math.atan2(p.y - f.y, p.x - f.x);
    f.state = 'pant';
    f.t = 4;
    f.cd = 18;
    f.tgt = null;
    f.atk = false;
    p.state = 'flee';
    p.hunter = null;
    p.t = 3;
    p.zz = 0;
    p.fang = ang + rr(-0.4, 0.4);
  }
}

function faPlan(a, I, h) {
  const act = faAct(a.sp, h),
    o = [];
  o.push(['forage', 28 + a.hun * 90]);
  o.push(['wander', 16 * (0.4 + act)]);
  o.push(['rest', (1 - act) * 100 * (1 - a.hun * 0.5)]);
  if (a.thi > 0.5) o.push(['drink', 30 + a.thi * 110]);
  if (climate.rain > 0.3 && a.sp !== 'boar') o.push(['shelter', 70]);
  if (a.sp === 'boar' && sunInfo(h).day > 0.5 && a.thi > 0.25) o.push(['wallow', 45]);
  if (a.sp === 'grouse' && a.sex === 'm' && a.age >= 150 && a.hun < ECO.grouse.displayMaxHun && act > 0.35 && !a.nerv)
    o.push(['display', ECO.grouse.display]); // galo-lira macho, calmo e saciado: exibição (peito estufado, saltinhos)
  if (a.sp === 'fox' && a.cd <= 0) o.push(['hunt', 24 + a.hun * 170 * (0.4 + act) + 36 * act]); // a fome pesa, mas não é pré-requisito: oportunidade decide
  if ((a.sp === 'deer' || a.sp === 'boar' || a.sp === 'fox') && !a.resc && a.stam > 0.7)
    o.push(['cross', a.sp === 'fox' ? 4 : 9]);
  const k = wpick(o),
    sp = I.walk * a.sz;
  if (k === 'hunt') {
    const r = foxScan(a); // só presas que ela detecta; a decisão (atacar / só observar / ignorar) vem da avaliação
    if (r && r.dec !== 'skip') {
      a.tgt = r.p;
      a.obsN = 0;
      a.lastSeen = { x: r.p.x, y: r.p.y, t: ecoNow() };
      a.loseT = 0;
      a.state = r.dec === 'attack' ? 'stalk' : 'observe';
      a.t = r.dec === 'attack' ? 40 : rr(2, 4);
      return;
    }
    a.cd = 6;
  }
  if (k === 'display') {
    a.state = 'display';
    a.t = rr(ECO.grouse.displayT[0], ECO.grouse.displayT[1]);
    a.mv = false;
    return;
  }
  if (k === 'cross') {
    const p = faCrossPick(a, sp);
    if (p) {
      a.cross = true;
      faGo(a, p[0], p[1], sp, 'forage', rr(5, 10));
    } else {
      a.state = 'idle';
      a.t = 2;
    }
    return;
  }
  if (k === 'forage' || k === 'wander' || k === 'hunt') {
    let p = null,
      lead = null;
    if (a.sp === 'deer' || a.sp === 'boar')
      for (const q of fauna)
        if (q.sp === a.sp && q.state !== 'dead' && q.id < a.id) {
          lead = q;
          break;
        } // seguidores acompanham o líder do bando
    if (
      lead &&
      Math.hypot(lead.x - a.x, lead.y - a.y) > (a.sp === 'boar' ? 28 : 40) &&
      Math.random() < (a.sp === 'boar' ? 0.92 : 0.8)
    )
      p = [lead.x + rr(-22, 22), lead.y + rr(-22, 22)];
    else p = faPick(a, k === 'wander' ? 130 : 60, '');
    if (p && faFree(p[0], p[1])) faGo(a, p[0], p[1], sp, 'forage', k === 'wander' ? rr(2, 5) : rr(7, 15));
    else {
      a.state = 'idle';
      a.t = 2;
    }
  } else if (k === 'rest' || k === 'shelter') {
    const p = faPick(a, 130, k === 'rest' ? 'rest' : 'shelter');
    if (p) faGo(a, p[0], p[1], sp, 'rest', rr(12, 30));
    else {
      a.state = 'idle';
      a.t = 2;
    }
  } else {
    const p = faShoreNear(a);
    if (p) {
      let q = p;
      if (FA_WATER[a.sp] && a.sp !== 'hare' && Math.random() < (k === 'wallow' ? 0.9 : 0.4)) {
        const w = faWadeSpot(p);
        if (w) q = w;
      } // entra na beira da água para beber/chafurdar
      faGo(a, q[0], q[1], sp, k, k === 'drink' ? rr(5, 9) : rr(10, 18));
    } else {
      a.thi = Math.max(0, a.thi - 0.3);
      a.state = 'idle';
      a.t = 2;
    }
  }
}

/* ===== raposa x jogador: persegue e morde até o jogador escapar (por distância, por perdê-lo de vista ou por travar num obstáculo) ===== */
function foxPlayerGiveUp(a) {
  releasePlayerHunt(a.id);
  a.state = 'pant';
  a.t = HUNT.fox.recoverT;
  a.pl = null;
  a.tgt = null;
  a.lastSeen = null;
  a.loseT = 0;
  a.stuck = 0;
}

function foxPlayerUpd(a, dt, th0) {
  const P = PLAYER_PREY.fox;
  if (a.state === 'eat' || a.state === 'fly' || a.state === 'land' || a.state === 'fight' || a.state === 'dead')
    return false;
  if (a.state !== 'pchase') {
    if (!th0 || th0.src !== 'player' || S.inside || sleeping) return false;
    if (a.state === 'pant' && (a.t -= dt) > 0) {
      a.mv = false; // recuperando o fôlego, parada: não foge
      return true;
    }
    if (!claimPlayerHunt(a.id)) {
      a.state = 'alert'; // outro predador já caça o jogador: só observa
      a.t = 1.2;
      a.mv = false;
      return true;
    }
    a.state = 'pchase';
    a.t = 999; // sem prazo: a perseguição termina pela fuga do jogador
    a.loseT = 0;
    a.stuck = 0;
    a.bgap = 0;
  }
  const s = senseTarget(a, playerTarget());
  a.loseT = s.any ? 0 : (a.loseT || 0) + dt;
  const dd = Math.hypot(S.px - a.x, S.py - a.y);
  if (
    S.inside ||
    sleeping ||
    dd > P.reach ||
    a.loseT > P.lostGrace ||
    a.stuck > P.stuckT ||
    !claimPlayerHunt(a.id, 1.5)
  ) {
    foxPlayerGiveUp(a);
    return true;
  }
  a.bgap = Math.max(0, (a.bgap || 0) - dt);
  if (dd <= P.biteR) {
    a.mv = false;
    turnTo(a, Math.atan2(S.py - a.y, S.px - a.x), dt * 6);
    if (a.bgap <= 0) {
      a.bgap = P.biteGap;
      hurtPlayer({ dmg: P.bite, from: a, label: '🦊 A raposa te mordeu!', kick: P.kick, source: 'A raposa' });
    }
  } else faStep(a, S.px, S.py, FA_SP.fox.run * P.speed, dt, false);
  return true;
}

function faUpd(a, dt) {
  const I = FA_SP[a.sp],
    h = 6 + S.min / 60;
  a.age += dt;
  a.cd = Math.max(0, a.cd - dt);
  a.hun = Math.min(1, a.hun + dt * 0.006);
  a.thi = Math.min(1, a.thi + dt * 0.007);
  a.mv = false;
  if (a.dz && a.state !== 'display') {
    a.dz = false; // exibição interrompida (ameaça, etc.): o saltinho não fica preso no ar
    if (a.state !== 'fly' && a.state !== 'land') a.z = 0;
  }
  if (a.life == null) a.life = a.age + rr(500, 900) * (FA_LF[a.sp] || 1) + (a.age < 999 ? 300 : 0);
  if (
    a.state !== 'dead' &&
    a.state !== 'fight' &&
    a.state !== 'fly' &&
    a.state !== 'land' &&
    !(a.sp === 'fox' && a.state === 'eat') &&
    a.age >= a.life
  )
    faDie(a);
  if (a.state === 'dead') {
    a.t -= dt;
    if (a.t <= 0) {
      a.gone = true;
      carcassDone(a.x, a.y);
    }
    return;
  }
  if (a.state === 'fight') {
    if (a.sp === 'fox') faFight(a, dt);
    return;
  } // presa sendo atacada: a raposa conduz a luta
  a.stam = Math.min(1, a.stam + dt / (I.stam * 2.2));
  const dP = S.inside ? 9999 : Math.hypot(S.px - a.x, S.py - a.y),
    ti = Math.floor(a.y / TS) * MW + Math.floor(a.x / TS);
  if (!faSeen[a.sp] && dP < 120) {
    faSeen[a.sp] = 1;
    toast(I.e + ' ' + I.n + ' — ' + I.role + ' (' + I.diet + '): ' + I.tip + '.');
  }
  if (a.z > 0 && a.state !== 'fly' && a.sp !== 'jaguar' && a.sp !== 'harpy') a.z = Math.max(0, a.z - 60 * dt);
  if (dungTimer(a, dt, 70, 140) && a.state !== 'fly') {
    dropFeces(a.x, a.y, a.sz, a.sp); // fezes no chão (com moscas por cima)
    if (ti >= 0 && ti < HN && ground[ti] !== WATER) om[ti] = Math.min(1, om[ti] + 0.04); // esterco -> solo
  }
  const st = a.state;
  if (a.sp === 'jaguar') {
    jagUpd(a, I, h, dt);
    return;
  }
  if (a.sp === 'anaconda') {
    anaUpd(a, I, h, dt);
    return;
  }
  if (a.sp === 'harpy') {
    harpyUpd(a, I, h, dt);
    return;
  }
  const th0 = faSense(a, I, dt, a.sp !== 'boar'); // percepção (visão, audição, memória): só reage ao que detecta
  if (
    a.sp === 'fox' &&
    !th0 &&
    a.cd <= 0 &&
    (st === 'idle' || st === 'rest' || st === 'forage') &&
    percTick(a, dt, 'o') &&
    (a.oscan = (a.oscan || 0) + 1) % 2 === 0
  ) {
    // percepção oportunista: a raposa nota a presa que passa à vista mesmo parada ou comendo (a cada ~0,5 s, defasada)
    const r = foxScan(a);
    if (r && r.dec !== 'skip') {
      a.tgt = r.p;
      a.obsN = 0;
      a.lastSeen = { x: r.p.x, y: r.p.y, t: ecoNow() };
      a.loseT = 0;
      a.state = r.dec === 'attack' ? 'stalk' : 'observe';
      a.t = r.dec === 'attack' ? 40 : rr(2, 4);
      return;
    }
  }
  // ===== queixada: o bando estala os dentes e investe junto =====
  if (a.sp === 'fox' && foxPlayerUpd(a, dt, th0)) return; // raposa não foge de gente: persegue e morde
  if (a.sp === 'boar' && !S.inside && st !== 'eat') {
    const mates = boarMates(a, 70);
    if (
      mates >= 1 &&
      st !== 'warn' &&
      st !== 'charge' &&
      st !== 'retreat' &&
      a.seePl &&
      dP < I.fear * 1.25 &&
      a.cd <= 0
    ) {
      for (const q of fauna)
        if (
          q.sp === 'boar' &&
          q !== a &&
          q.state !== 'dead' &&
          (q.state === 'warn' || q.state === 'charge') &&
          Math.hypot(q.x - a.x, q.y - a.y) < 90
        ) {
          a.state = 'warn';
          a.t = 1.2;
          break;
        }
    } // alarme contagia o bando
    if (st === 'warn' && !a.clk) {
      a.clk = 1;
      if (dP < 140 && !boarClkT) {
        boarClkT = 1;
        toast('🦷 Estalar de dentes! O bando de queixadas está te avisando — afaste-se');
        setTimeout(() => (boarClkT = 0), 9000);
      }
    }
    if (st !== 'warn') a.clk = 0;
    if (dP < 110 && mates >= 2 && !boarSmellT) {
      boarSmellT = 1;
      toast('🐗 Cheiro forte de almíscar: há um bando de queixadas por perto');
      setTimeout(() => (boarSmellT = 0), 150000);
    }
    if (st === 'charge') {
      a.t -= dt;
      faStep(a, S.px, S.py, I.run * 1.1, dt, false);
      a.atk = dP < 30;
      if (dP < 15) {
        hurtPlayer({
          dmg: 8,
          from: a,
          label: '🐗 A queixada te mordeu com os caninos!',
          kick: 170,
          source: 'A queixada',
        });
        a.cd = 10;
        a.state = 'retreat';
        a.t = 2.5;
        a.fang = Math.atan2(a.y - S.py, a.x - S.px);
        a.atk = false;
      } else if (a.t <= 0 || dP > 150) {
        a.state = 'retreat';
        a.t = 2;
        a.fang = Math.atan2(a.y - S.py, a.x - S.px);
        a.cd = 6;
        a.atk = false;
      }
      return;
    }
    if (st === 'retreat') {
      a.t -= dt;
      faStep(a, a.x + Math.cos(a.fang) * 30, a.y + Math.sin(a.fang) * 30, I.run * 0.8, dt, false);
      if (a.stuck > 0.4) {
        a.fang += rr(1.5, 3);
        a.stuck = 0;
      }
      if (a.t <= 0) {
        a.state = 'idle';
        a.t = 3;
      }
      return;
    }
    if (st === 'warn') {
      a.t -= dt;
      turnTo(a, Math.atan2(S.py - a.y, S.px - a.x), dt * 2);
      if (dP < 46 && a.cd <= 0 && (a.bold > 0.4 || mates >= 2)) {
        a.state = 'charge';
        a.t = 2.5;
      } else if (dP > 100 || a.t <= 0) {
        a.state = 'idle';
        a.t = 2.5;
      }
      return;
    }
    if (a.seePl && dP < I.fear && a.cd <= 0 && st !== 'go') {
      a.state = 'warn';
      a.t = 1.5;
      return;
    }
    if (dP < 50 && a.cd > 0) {
      a.state = 'retreat';
      a.t = 1.5;
      a.fang = Math.atan2(a.y - S.py, a.x - S.px);
      return;
    }
  }
  if (a.sp === 'boar' && st !== 'eat' && st !== 'fly' && st !== 'flee' && st !== 'charge') {
    const jt = th0; // queixada diante da onça: sozinha ou tímida foge; em bando (3+) o grupo faz roda e enfrenta
    if (jt) {
      a.th = jt;
      const bm = boarMates(a, 70);
      if (bm < 2 && a.bold < 0.6) {
        faFlee(a, jt);
        return;
      }
      if (bm >= 2 && jt.d < 40 && a.cd <= 0) {
        a.state = 'warn';
        a.t = 1.5;
      } else if (st !== 'alert' && st !== 'warn') {
        a.state = 'alert';
        a.t = rr(ECO.boar.alertFor[0], ECO.boar.alertFor[1]);
        faAlarm(a, jt); // alerta coletivo: o bando inteiro olha na mesma direção
      }
    }
  }
  // ===== presas e raposa: reação às ameaças detectadas =====
  if (a.sp !== 'boar' && st !== 'eat' && st !== 'fly' && st !== 'land' && st !== 'flee') {
    const th = th0,
      hunting = a.sp === 'fox' && FOX_HUNTING[st]; // raposa caçando só desiste diante de perigo real
    if (th && (!hunting || th.d <= th.r * 0.5 || (th.src === 'player' && dP < 35))) {
      const P = ECO[a.sp];
      a.th = th;
      a.thT = 0;
      if (hunting) {
        a.cd = Math.max(a.cd, 10);
        a.tgt = null;
        a.lastSeen = null;
      }
      // diante da onça a presa foge cedo (antes ficava de "alerta" olhando até a onça chegar): predador à vista não é para ficar perto
      const near =
        th.d <= th.r * (th.src === 'jaguar' ? 0.95 : a.sp === 'grouse' ? 0.8 : 0.68) ||
        ((st === 'alert' || st === 'freeze') && th.d <= th.r * 0.74);
      if (a.sp === 'fox' || near) {
        faFlee(a, th);
        return;
      }
      if (a.sp === 'hare' && st !== 'freeze' && st !== 'alert' && Math.random() < P.freezeChance) {
        a.state = 'freeze'; // imobilidade defensiva: fica quieta, bem menos visível, e só corre se o perigo chegar perto
        a.t = rr(P.alertFor[0] * 1.5, P.alertFor[1] * 1.5);
      } else if (st !== 'alert' && st !== 'freeze') {
        a.state = 'alert';
        a.t = rr(P.alertFor[0], P.alertFor[1]);
        if (a.sp === 'grouse') faAlarm(a, th); // chamado de alarme
      }
    } else if (!th && (st === 'alert' || st === 'freeze')) a.thT = (a.thT || 0) + dt;
  }
  switch (a.state) {
    case 'go': {
      const arr = faStep(a, a.gx, a.gy, a.spd, dt, false);
      if (arr || a.stuck > 1.2) {
        a.state = a.after;
        a.t = a.adur || 3;
        a.stuck = 0;
      }
      break;
    }
    case 'flee': {
      a.t -= dt;
      a.zz -= dt;
      if (a.zz <= 0) {
        a.zz = a.sp === 'hare' ? 0.45 : 1.2;
        a.fang += rr(-0.7, 0.7) * (a.sp === 'hare' ? 1 : 0.4);
      } // lebre foge em zigue-zague
      a.stam -= dt / I.stam;
      faStep(
        a,
        a.x + Math.cos(a.fang) * 30,
        a.y + Math.sin(a.fang) * 30,
        I.run * (a.stam > 0.15 ? 1 : 0.55) * a.sz,
        dt,
        false,
      );
      if (a.stuck > 0.4) {
        a.fang += rr(1.5, 3);
        a.stuck = 0;
      }
      if (a.t <= 0) {
        const th = th0,
          mt = th ? null : memFind(a, 'threat'); // perdeu de vista, mas lembra de onde veio o perigo
        if (th && th.d < th.r * 1.4) {
          a.t = 1.5;
          a.fang = a.sp === 'hare' ? faSafeAngle(a, th) : Math.atan2(a.y - th.y, a.x - th.x) + rr(-0.5, 0.5);
        } else if (mt && (a.fleeExt || 0) < 2 && Math.hypot(mt.x - a.x, mt.y - a.y) < 100) {
          a.fleeExt = (a.fleeExt || 0) + 1;
          a.t = 1.2;
          a.fang = Math.atan2(a.y - mt.y, a.x - mt.x) + rr(-0.5, 0.5);
        } else {
          a.state = 'alert'; // olha para trás antes de relaxar; a rotina volta aos poucos
          a.t = rr(ECO[a.sp].alertFor[0], ECO[a.sp].alertFor[1]);
          a.th = mt ? { x: mt.x, y: mt.y } : null;
        }
      }
      break;
    }
    case 'fly': {
      a.t -= dt;
      a.z = Math.min(16, a.z + 50 * dt);
      faStep(a, a.x + Math.cos(a.fang) * 30, a.y + Math.sin(a.fang) * 30, 88, dt, true);
      if (a.t <= 0) {
        a.state = 'land';
        a.t = 0.7;
      }
      break;
    }
    case 'land': {
      a.t -= dt;
      a.z = Math.max(0, a.z - 30 * dt);
      faStep(a, a.x + Math.cos(a.fang) * 30, a.y + Math.sin(a.fang) * 30, 30, dt, true);
      if (a.t <= 0 && faFree(a.x, a.y)) {
        a.z = 0;
        a.state = 'idle';
        a.t = rr(3, 5);
      } else if (a.t <= 0) {
        a.t = 0.3;
      }
      break;
    }
    case 'display': {
      // exibição do galo-lira: parado, de peito estufado, com saltinhos curtos; qualquer ameaça interrompe (o resto da IA cuida disso)
      a.t -= dt;
      a.mv = false;
      a.dz = true;
      a.z = Math.abs(Math.sin((performance.now() / 1000) * 7 + a.t0)) * 1.6;
      if (a.t <= 0) {
        a.z = 0;
        a.dz = false;
        faPlan(a, I, h);
      }
      break;
    }
    case 'alert': {
      a.t -= dt;
      if (a.th) turnTo(a, Math.atan2(a.th.y - a.y, a.th.x - a.x), dt * 2);
      if (a.t <= 0) faPlan(a, I, h);
      break;
    }
    case 'freeze': {
      a.t -= dt;
      a.mv = false; // imóvel: bem mais difícil de enxergar
      if (a.th) turnTo(a, Math.atan2(a.th.y - a.y, a.th.x - a.x), dt * 1.5);
      if (a.t <= 0) faPlan(a, I, h);
      break;
    }
    case 'observe': {
      // a raposa fica parada olhando a presa antes de decidir se vale a pena: observar ≠ atacar
      const p = a.tgt;
      a.t -= dt;
      a.mv = false;
      if (!foxOk(p)) {
        foxGiveUp(a, HUNT.fox, false);
        break;
      }
      turnTo(a, Math.atan2(p.y - a.y, p.x - a.x), dt * 2);
      foxSees(a, p, dt);
      if ((a.loseT || 0) > 1.5) {
        foxGiveUp(a, HUNT.fox, false);
        break;
      }
      if (a.t <= 0) {
        const dec = foxDecide(a, p);
        if (dec === 'attack') {
          a.state = 'stalk';
          a.t = 30;
          a.obsN = 0;
        } else if (dec === 'observe' && (a.obsN = (a.obsN || 0) + 1) < 3) a.t = rr(2, 3.5);
        else foxGiveUp(a, HUNT.fox, false);
      }
      break;
    }
    case 'stalk': {
      const p = a.tgt,
        H = HUNT.fox;
      if (!foxOk(p)) {
        foxGiveUp(a, H, false);
        break;
      }
      const d = Math.hypot(p.x - a.x, p.y - a.y);
      a.t -= dt;
      const seen = foxSees(a, p, dt),
        ls = a.lastSeen;
      if (!seen && (a.loseT || 0) > 1.2) {
        a.state = 'investigate'; // perdeu a presa de vista: vai até onde a viu pela última vez
        a.t = H.loseT;
        a.stuck = 0;
        break;
      }
      const gx = seen || !ls ? p.x : ls.x,
        gy = seen || !ls ? p.y : ls.y; // sem contato visual, só conhece a última posição vista
      faStep(a, gx, gy, I.walk * 1.15, dt, false);
      if (d < 46 && seen) {
        const dec = foxDecide(a, p);
        if (dec === 'attack') {
          a.state = 'chase';
          a.t = H.giveUp;
          a.gapRef = d;
          a.gapT = 1.5;
          a.gapBad = 0;
        } else if (dec === 'observe' && (a.obsN || 0) < 2) {
          a.obsN = (a.obsN || 0) + 1;
          a.state = 'observe';
          a.t = rr(1.5, 3);
        } else foxGiveUp(a, H, false);
      } else if (a.t <= 0 || d > 230 || a.stuck > 1.2) {
        a.state = 'idle';
        a.t = 3;
        a.cd = 14;
        a.tgt = null;
      }
      break;
    }
    case 'chase': {
      const p = a.tgt,
        H = HUNT.fox;
      if (!foxOk(p)) {
        foxGiveUp(a, H, false);
        a.cd = 10;
        break;
      }
      const d = Math.hypot(p.x - a.x, p.y - a.y);
      a.t -= dt;
      a.stam -= dt / I.stam;
      const seen = foxSees(a, p, dt),
        ls = a.lastSeen;
      if (!seen && (a.loseT || 0) > 0.8) {
        a.state = 'investigate'; // não rastreia a posição atual de quem não vê: corre até onde o viu
        a.t = H.loseT;
        a.stuck = 0;
        break;
      }
      const gx = seen || !ls ? p.x : ls.x,
        gy = seen || !ls ? p.y : ls.y;
      faStep(a, gx, gy, I.run * (a.stam > 0.1 ? 1 : 0.55), dt, false);
      a.gapT -= dt;
      if (a.gapT <= 0) {
        a.gapT = 1.5;
        a.gapBad = d > (a.gapRef || d) + 5 ? (a.gapBad || 0) + 1 : Math.max(0, (a.gapBad || 0) - 1); // a presa está abrindo distância?
        a.gapRef = d;
      }
      if (d < 9) {
        if (p.hunter && p.hunter !== a) foxGiveUp(a, H, false);
        else faBegin(p, a);
      } else if (a.t <= 0 || a.stam <= 0 || d > 240 || (a.gapBad || 0) >= 2 || a.stuck > 1) {
        foxGiveUp(a, H, true); // perseguição inviável: descansa (pant) e desiste
      }
      break;
    }
    case 'investigate': {
      // vai à última posição vista, olha em volta por tempo limitado e desiste
      const ls = a.lastSeen,
        H = HUNT.fox;
      a.t -= dt;
      if (!ls) {
        foxGiveUp(a, H, false);
        break;
      }
      if (Math.hypot(ls.x - a.x, ls.y - a.y) > 10 && a.stuck < 1.2) faStep(a, ls.x, ls.y, I.walk * 1.2, dt, false);
      else a.dir += Math.sin(a.t * 2.2) * dt * 3; // olha em volta
      if (percTick(a, dt, 'i')) {
        const r = foxScan(a);
        if (r && r.dec === 'attack') {
          a.tgt = r.p;
          a.state = 'stalk';
          a.t = 30;
          a.obsN = 0;
          a.lastSeen = { x: r.p.x, y: r.p.y, t: ecoNow() };
          a.loseT = 0;
          break;
        }
      }
      if (a.t <= 0) foxGiveUp(a, H, false);
      break;
    }
    case 'eat': {
      a.t -= dt;
      if (a.t <= 0) {
        if (a.tgt) a.tgt.t = Math.min(a.tgt.t, 1.5);
        a.tgt = null;
        faPlan(a, I, h);
      }
      break;
    }
    default: {
      // idle, forage, rest, drink, wallow, pant
      a.t -= dt;
      if (a.state === 'forage') {
        if (ti >= 0 && ti < HN && ground[ti] === GRASS) {
          // come a comida preferida; a fome só cai ao comer
          if (a.sp === 'deer' || a.sp === 'hare') {
            const g = Math.min(mato[ti], 5 * dt);
            mato[ti] -= g;
            a.hun = Math.max(0, a.hun - (g / 255) * 0.9);
          } // pastejo: capim
          else if (a.sp === 'grouse') {
            if (seedAge[ti] > 0) {
              seedAge[ti] = 0;
              a.hun = Math.max(0, a.hun - 0.35);
            }
            if (shroom[ti]) {
              shroom[ti] = 0;
              a.hun = Math.max(0, a.hun - 0.25);
            }
          } // sementes e cogumelos
          else if (a.sp === 'boar') {
            const g = Math.min(mato[ti], 9 * dt);
            mato[ti] -= g;
            bio[ti] = Math.min(1, bio[ti] + 0.02 * dt);
            om[ti] = Math.min(1, om[ti] + 0.004 * dt);
            a.hun = Math.max(0, a.hun - (g / 255) * 0.3 - dt * 0.012);
            if (shroom[ti]) {
              shroom[ti] = 0;
              a.hun = Math.max(0, a.hun - 0.35);
            }
            if (seedAge[ti] > 0 && Math.random() < dt * 0.5) {
              seedAge[ti] = 0;
              a.hun = Math.max(0, a.hun - 0.12);
            }
            if (faEatDrop) faEatDrop(a);
          }
        } // queixada: frutos caídos, cogumelos, raízes e invertebrados — revira o solo
        else a.hun = Math.max(0, a.hun - dt * 0.01);
      } else if (a.state === 'drink' || a.state === 'wallow') {
        a.thi = Math.max(0, a.thi - dt * (a.state === 'drink' ? 0.15 : 0.05));
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
      } // ondas na água
      if (a.t <= 0) faPlan(a, I, h);
    }
  }
}

function updateFauna(dt) {
  if (sleeping) return;
  dt = Math.min(dt, 0.05);
  setFTT(FTT + dt);
  ecoTick(dt, nightF(6 + S.min / 60)); // relógio e luz da percepção/memória
  if (TRAILS.length && TRAILS[0].t < FTT - 150) while (TRAILS.length && TRAILS[0].t < FTT - 150) TRAILS.shift();
  if (!faInitDone) {
    faInitDone = true;
    faInit();
  }
  if (!S.jagDone && INST.cx === HOMEC.x && INST.cy === HOMEC.y) jagSeed(); // saves antigos: o casal aparece no mapa inicial
  faManage(dt);
  farmUpdate(dt); // vacas e galinhas como presas dos predadores selvagens (espelhos)
  carcUpd(dt);
  fishUpd(dt);
  for (let i = fauna.length - 1; i >= 0; i--) {
    const a = fauna[i];
    faUpd(a, dt);
    faCurrent(a, dt);
    if (a.mv && a.sp !== 'jaguar' && a.sp !== 'harpy' && a.state !== 'dead') faTrail(a);
    if (a.gone) {
      const ti = Math.floor(a.y / TS) * MW + Math.floor(a.x / TS);
      if (ti >= 0 && ti < HN) om[ti] = Math.min(1, om[ti] + 0.25);
      fauna.splice(i, 1);
    }
  }
} // carcaça vira matéria orgânica

function faSheet(a) {
  if (a.state === 'dead') return 'death';
  if (a.state === 'fly' || (a.state === 'land' && a.z > 2)) return 'fly';
  if (a.atk && (a.state === 'charge' || a.state === 'fight')) return 'attack';
  if (a.mv)
    return a.state === 'flee' ||
      a.state === 'chase' ||
      a.state === 'charge' ||
      a.state === 'retreat' ||
      a.state === 'pchase'
      ? 'run'
      : 'walk';
  return 'idle';
}

function drawFauna(a) {
  const I = FA_SP[a.sp],
    W = FA_SPR[a.sp],
    key = faSheet(a),
    im = W[key] || W.walk;
  if (!im || !im.complete || !im.naturalWidth) return;
  const n = Math.max(1, im.naturalWidth >> 5),
    now = performance.now() / 1000,
    fps = { idle: 3, walk: 8, run: 12, fly: 14, attack: 9, death: 7 }[key] || 8;
  const fr = key === 'death' ? Math.min(n - 1, Math.floor((now - a.d0) * fps)) : Math.floor((now + a.t0) * fps) % n,
    row = key === 'death' ? a.row : faRow(a);
  const kid = a.age < 150 ? 0.62 + (0.38 * a.age) / 150 : 1,
    s32 = Math.round(32 * I.sc * a.sz * kid);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (a.state === 'dead' && a.t < 2) {
    ctx.globalAlpha = Math.max(0, a.t / 2);
    ctx.translate(0, (2 - a.t) * 3.5);
  }
  const wd = a.state === 'dead' ? 0 : a.wd || 0;
  let wly = 0;
  if (wd > 0) {
    wly = a.y + Math.round(s32 * 0.125) - Math.round(s32 * (0.1 + 0.32 * wd));
    ctx.beginPath();
    ctx.rect(a.x - s32, a.y - s32 * 1.4, s32 * 2, wly - (a.y - s32 * 1.4));
    ctx.clip();
    ctx.translate(0, Math.round(3 * wd));
  } // corpo afundado ate a linha d'agua
  ctx.drawImage(
    im,
    fr * 32,
    row * 32,
    32,
    32,
    Math.round(a.x - s32 / 2),
    Math.round(a.y - s32 * 0.875 - a.z),
    s32,
    s32,
  );
  ctx.restore();
  if (wd > 0) {
    ctx.save();
    ctx.fillStyle = 'rgba(225,244,255,.55)';
    ctx.fillRect(Math.round(a.x - s32 * 0.3), wly, Math.round(s32 * 0.6), 1);
    ctx.strokeStyle = 'rgba(225,242,255,.6)';
    ctx.lineWidth = 0.8;
    for (let k = 0; k < 2; k++) {
      const p = (now * 0.9 + k * 0.5 + a.t0) % 1;
      ctx.globalAlpha = (1 - p) * 0.7 * Math.min(1, wd + 0.3);
      ctx.beginPath();
      ctx.ellipse(a.x, a.y + 1, 5 + p * 8, 2 + p * 3, 0, 0, 6.283);
      ctx.stroke();
    }
    ctx.restore();
  }
  if (a.state === 'dead' && a.t > 2) carcassFx(a.x, a.y, a.t);
}

function drawFaunaLabels() {
  if (S.inside || !fauna.length) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, -wCam.x, -wCam.y);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = 'rgba(0,0,0,.85)';
  for (const a of fauna) {
    if (a.state === 'dead' || a.state === 'perch') continue;
    const dP = Math.hypot(S.px - a.x, S.py - a.y);
    if (dP > 80 || (a.hide && dP > 34)) continue;
    const I = FA_SP[a.sp],
      kid = a.age < (a.sp === 'jaguar' ? JG.KID : 150),
      st0 = statusTopOf(a), // com o bloco de fome/sede/idade à mostra, o nome fica logo acima dele
      y = st0 != null ? st0 - 8 : a.y - 32 * I.sc * a.sz * (kid ? 0.8 : 1) - a.z - 6,
      s = a.state === 'go' ? a.after : a.state;
    ctx.globalAlpha = Math.max(0, Math.min(1, (80 - dP) / 25));
    ctx.font = 'bold 7.5px system-ui,"Segoe UI",Arial,sans-serif';
    const l1 = I.e + ' ' + I.n + (kid ? ' (filhote)' : ''),
      l2 = I.role + ' · ' + I.diet + ' ' + (FA_ST[s] || '');
    ctx.strokeText(l1, a.x, y - 4);
    ctx.fillStyle = I.col;
    ctx.fillText(l1, a.x, y - 4);
    ctx.font = '6.5px system-ui,"Segoe UI",Arial,sans-serif';
    ctx.strokeText(l2, a.x, y + 4);
    ctx.fillStyle = '#fff';
    ctx.fillText(l2, a.x, y + 4);
  }
  ctx.restore();
}

export function loadFaunaSprites() {
  for (const sp in FA_SRC) {
    FA_SPR[sp] = {};
    for (const k in FA_SRC[sp]) {
      const im = new Image();
      im.onload = () => {
        FA_SPR[sp][k] = sp === 'boar' ? boarDark(bakeImg(im)) : bakeImg(im);
      };
      im.src = FA_SRC[sp][k];
      FA_SPR[sp][k] = im;
    }
  }
}

/**
 * Linhas transparentes no topo do quadro de 32 px (o menor valor entre todos os quadros de 'idle' e 'walk'): onde o desenho do
 * bicho realmente começa. Usado pelo indicador para encostar na cabeça de cada espécie. null enquanto a folha não carregou.
 */
const FA_TOP = {};
export function faSpriteTop(sp) {
  if (FA_TOP[sp] != null) return FA_TOP[sp];
  const W = FA_SPR[sp];
  if (!W) return null;
  let best = 32,
    ready = false;
  for (const k of ['idle', 'walk']) {
    const im = W[k];
    const w = im && (im.naturalWidth || im.width),
      h = im && (im.naturalHeight || im.height);
    if (!im || im.complete === false || !w || !h) continue;
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(im, 0, 0);
    const d = g.getImageData(0, 0, w, h).data;
    for (let fy = 0; fy < h >> 5; fy++)
      for (let fx = 0; fx < w >> 5; fx++)
        for (let y = 0; y < Math.min(32, best); y++) {
          let n = 0;
          for (let x = 0; x < 32; x++) if (d[((fy * 32 + y) * w + fx * 32 + x) * 4 + 3] > 100) n++;
          if (n >= 2) {
            best = y;
            break;
          }
        }
    ready = true;
  }
  if (!ready) return null;
  FA_TOP[sp] = best;
  return best;
}

/** Atualiza `faInitDone` a partir de outros módulos (as ligações importadas são somente leitura). */
export function setFaInitDone(value) {
  faInitDone = value;
  return value;
}

/** Atualiza `faShoreL` a partir de outros módulos (as ligações importadas são somente leitura). */
export function setFaShoreL(value) {
  faShoreL = value;
  return value;
}

/** Atualiza `faShoreT` a partir de outros módulos (as ligações importadas são somente leitura). */
export function setFaShoreT(value) {
  faShoreT = value;
  return value;
}

export {
  FA_SP,
  FA_ST,
  boarMates,
  drawFauna,
  drawFaunaLabels,
  faFlee,
  faFree,
  faGo,
  faInitDone,
  faPick,
  faRow,
  faShoreL,
  faShoreNear,
  faShoreT,
  faSpawn,
  faSpot,
  faStep,
  fauna,
  updateFauna,
};
