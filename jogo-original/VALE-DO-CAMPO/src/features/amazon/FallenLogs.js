/**
 * Troncos caídos: queda animada da árvore, decomposição em 5 fases ao longo de anos, mamangavas, bichos que moram no tronco e lenha.
 *
 * Origem: Vale_do_Campo_V64.html (s13)
 */

import { DAY_MIN, HN, MH, MW, TREE, TS, VH, VW } from '../../config/constants.js';
import { S, sleeping } from '../../core/GameState.js';
import { update } from '../../core/GameUpdate.js';
import { sunInfo, worldMin } from '../../core/TimeManager.js';
import { herd } from '../../entities/cow/Herd.js';
import { spend } from '../../entities/Player.js';
import { giveItem } from './AmazonItems.js';
import { spawnPT } from './AmazonRender.js';
import { amzSp, clamp, forestAround, M, SPN, validSeedTile, visTrees } from './AmazonTrees.js';
import { ctx } from '../../rendering/Canvas.js';
import { vcam } from '../../rendering/Renderer.js';
import { drawWeather } from '../../rendering/WeatherRenderer.js';
import { beep } from '../../systems/audio/AudioSystem.js';
import { actionA, target } from '../../systems/InteractionSystem.js';
import { ITEMS, TOOLS } from '../../systems/InventorySystem.js';
import { AXE_MAX, axeFrac, axeLast, chopHit, setAxeLast } from '../../systems/Woodcutting.js';
import { dlgOpen } from '../../ui/Dialog.js';
import { toast } from '../../ui/Toast.js';
import { damagePlayer } from '../../entities/PlayerHurt.js';
import { hash2 } from '../../utils/MathUtils.js';
import { ecoTrees } from '../../world/ecology/TreeEcology.js';
import { drawPrints } from '../../world/GrassSystem.js';
import { bio, nut, om, seedAge, sm } from '../../world/hydrology/Hydrology.js';
import { treeModel } from '../../world/Trees.js';
import { qAdd, qIdx } from '../../world/village/Quests.js';
import { climate } from '../../world/WeatherSystem.js';
import { crops, obj } from '../../world/World.js';

/* ============================================================================
   TRONCO CAÍDO · CICLO DO TRONCO BERÇÁRIO · MAMANGAVA (Xylocopa)
   - Ao derrubar uma árvore ela TOMBA (animação) e vira um tronco no chão.
   - Machado no tronco = mais madeira. Se ninguém mexer, o tronco passa pelas 5 fases:
     0 Queda e Choque de Luz (0-1 ano) · 1 Fungos e Musgos (1-5) · 2 Berçário Botânico (5-20)
     3 Refúgio e Moradia Animal (20-50) · 4 Integração ao Solo e Herança (50-100+)
   - Mamangavas perfuram o tronco (galerias circulares), polinizam por vibração e aceleram a decomposição.
   Tempo: 1 dia de jogo = LOG_YPD anos do ciclo (comprimido para dar para ver as 5 fases jogando).
   ============================================================================ */
const LOG_YPD = 3;

const PH_NM = [
  'Queda e Choque de Luz',
  'Invasão dos Fungos e Musgos',
  'Berçário Botânico',
  'Refúgio e Moradia Animal',
  'Integração ao Solo e Herança',
];

const PH_YR = ['0–1 ano', '1–5 anos', '5–20 anos', '20–50 anos', '50–100+ anos'];

const PH_TXT = [
  'A copa abriu uma clareira de luz: sementes dormentes ao redor germinam. Besouros perfuradores já abrem galerias na casca.',
  'Insetos abriram rachaduras e os esporos entraram. Fungos quebram a lignina; o tronco vira uma esponja que retém a chuva. Musgos e líquens cobrem a casca.',
  'A madeira macia e úmida é o berçário perfeito: samambaias e mudas germinam em cima do tronco, longe dos patógenos do solo e perto da luz.',
  'O miolo apodreceu e abriu ocos. Sapos, salamandras, cobras e camundongos fazem toca; pica-paus caçam larvas na madeira.',
  'O tronco desmorona em húmus escuro e devolve carbono, nitrogênio e minerais ao solo. As árvores que nasceram nele ficam com raízes "de pernas abertas".',
];

const YIELD_PH = [1, 1, 0.8, 0.5, 0.25]; // a madeira apodrece: rende menos com o tempo

let LOGS = [],
  FALLING = [],
  FX = [],
  BEES = [],
  CRIT = [],
  logId = 1,
  logDay = -1,
  beeSpawnT = 0,
  critT = 0,
  phT = 0,
  buzzT = 0;

const logYears = (L) => Math.max(0, ((worldMin() - L.born) / DAY_MIN) * LOG_YPD);

const logPhase = (y) => (y < 1 ? 0 : y < 5 ? 1 : y < 20 ? 2 : y < 50 ? 3 : 4);

const fxAdd = (o) => {
  if (FX.length < 320) FX.push(o);
};

function fxBurst(x, y, z, n, cols, sp, up, life, sz) {
  for (let q = 0; q < n; q++) {
    const a = Math.random() * 6.283,
      v = sp * (0.3 + Math.random());
    fxAdd({
      x,
      y,
      z,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v * 0.5,
      vz: up * (0.4 + Math.random()),
      life: life * (0.6 + Math.random() * 0.6),
      max: life,
      c: cols[q % cols.length],
      sz: sz || 1,
      g: 140,
    });
  }
}

/* ---------------- sprite da mamangava (pixel art, olhando p/ a direita) ---------------- */
function mkBee(yellow, wing) {
  const c = document.createElement('canvas');
  c.width = 14;
  c.height = 10;
  const g = c.getContext('2d');
  const R = (x, y, w, h, col) => {
    g.fillStyle = col;
    g.fillRect(x, y, w, h);
  };
  if (wing === 0) {
    R(4, 0, 5, 1, 'rgba(228,240,255,.85)');
    R(5, 1, 5, 2, 'rgba(200,224,255,.72)');
    R(9, 1, 1, 1, 'rgba(150,180,235,.9)');
  } else {
    R(2, 2, 7, 1, 'rgba(228,240,255,.8)');
    R(4, 3, 6, 1, 'rgba(200,224,255,.65)');
  }
  R(1, 5, 5, 4, '#1f1a45');
  R(2, 4, 3, 1, '#3a3188');
  R(2, 5, 2, 1, '#5b4fc4');
  R(1, 8, 5, 1, '#120f2a');
  R(0, 6, 1, 2, '#1f1a45');
  R(6, 4, 4, 4, yellow ? '#e3b236' : '#2b2366');
  R(7, 4, 2, 1, yellow ? '#f5d563' : '#4a40a0');
  R(10, 5, 3, 3, '#16122c');
  R(11, 5, 1, 1, '#aab8ff');
  R(12, 4, 1, 1, '#16122c');
  R(6, 8, 1, 1, '#0c0a18');
  R(8, 8, 1, 1, '#0c0a18');
  R(10, 8, 1, 1, '#0c0a18');
  return c;
}

const BEE_SP = [
  [mkBee(0, 0), mkBee(0, 1)],
  [mkBee(1, 0), mkBee(1, 1)],
];

/* ---------------- tronco: criação a partir da árvore derrubada ---------------- */
function snapTree(i, a) {
  const tx = i % MW,
    ty = (i / MW) | 0;
  let m = null,
    esp = '',
    st = 3,
    sp = null;
  if (a && a.amz) {
    m = a.model();
    esp = a.especie;
    st = a.st;
    sp = a.sp;
    if (st < 3) return null;
  } else {
    try {
      m = treeModel(tx, ty);
    } catch (e) {}
  }
  const H = (m && m.h) || 60,
    bw = (m && (m.bw || m.tw)) || 8;
  const bx = tx * TS + 8,
    by = (ty + 1) * TS;
  let dir = S.px < bx ? 1 : S.px > bx ? -1 : Math.random() < 0.5 ? 1 : -1;
  const len = clamp(Math.round(H * (esp === 'buriti' ? 0.72 : 0.6)), 16, 120);
  if (bx + dir * len < 8 || bx + dir * len > MW * TS - 8) dir = -dir;
  const wood0 = sp ? Math.max(2, Math.round((sp.wood[st - 1] || 1) * 1.6) + 1) : 3;
  return {
    i,
    x0: bx,
    y0: by,
    dir,
    len,
    th: clamp(Math.round(bw * 0.6), 4, 14),
    esp,
    st,
    sid: Math.max(0, SPN.indexOf(esp)),
    wood0,
    m,
    H,
  };
}

function startFall(s) {
  const L = {
    id: logId++,
    i: s.i,
    x0: s.x0,
    y0: s.y0,
    dir: s.dir,
    len: s.len,
    th: s.th,
    esp: s.esp,
    st: s.st,
    sid: s.sid,
    wood0: s.wood0,
    left: s.wood0,
    born: worldMin(),
    shr: 0,
    holes: [],
    plants: [],
    nursed: 0,
    ph: 0,
    falling: 1,
    shake: 0,
    cv: null,
    cvKey: '',
  };
  LOGS.push(L);
  FALLING.push({ L, m: s.m, t: 0, hit: false });
  return L;
}

function impact(F) {
  const L = F.L;
  L.falling = 0;
  L.born = worldMin();
  const X = L.x0 + L.dir * L.len * 0.5,
    Y = L.y0;
  beep(58, 0.4, 'sine');
  setTimeout(() => beep(44, 0.35, 'sine'), 70);
  fxBurst(X, Y, 2, 22, ['#a08a66', '#7a6a4e', '#c2b08a'], 34, 16, 0.9, 2);
  for (let q = 0; q < 16; q++)
    spawnPT({
      k: 'leaf',
      x: L.x0 + L.dir * (L.len * (0.4 + Math.random() * 0.6)),
      y: L.y0 + (Math.random() - 0.5) * 14,
      z: 4 + Math.random() * 20,
      vx: (Math.random() - 0.5) * 16,
      vy: (Math.random() - 0.5) * 8,
      vz: 6 + Math.random() * 10,
      t: Math.random() * 6,
      life: 3 + Math.random() * 2,
      c: ['#2f7a45', '#47a14c', '#6bb04a'][q % 3],
    });
  /* clareira de luz: sementes dormentes ao redor germinam */
  let n = 0;
  const tx = L.i % MW,
    ty = (L.i / MW) | 0;
  for (let k = 0; k < 14 && n < 4; k++) {
    const x = tx + Math.round((Math.random() - 0.5) * 10),
      y = ty + Math.round((Math.random() - 0.5) * 8),
      j = validSeedTile(x, y);
    if (j >= 0 && Math.random() < 0.5) {
      amzSp[j] = Math.random() < 0.4 && L.sid ? L.sid : 1 + Math.floor(Math.random() * 3);
      seedAge[j] = 1;
      n++;
    }
  }
  toast(
    '🌳 A árvore tombou! Use o MACHADO no tronco para tirar mais madeira — ou deixe-o no chão e a floresta o transforma em berçário.' +
      (n
        ? ' ☀️ A clareira de luz acordou ' +
          n +
          ' semente' +
          (n > 1 ? 's' : '') +
          ' adormecida' +
          (n > 1 ? 's' : '') +
          '.'
        : ''),
  );
}

/* ---------------- ação do jogador: machado / mão no tronco ---------------- */
function logRect(L) {
  const a = Math.min(L.x0, L.x0 + L.dir * L.len);
  return { x1: a, x2: a + L.len, y1: L.y0 - L.th / 2 - 3, y2: L.y0 + L.th / 2 + 3 };
}

function logAt(tx, ty) {
  const x1 = tx * TS - 2,
    x2 = tx * TS + TS + 2,
    y1 = ty * TS - 2,
    y2 = ty * TS + TS + 2;
  for (const L of LOGS) {
    if (L.falling) continue;
    const r = logRect(L);
    if (r.x2 >= x1 && r.x1 <= x2 && r.y2 >= y1 && r.y1 <= y2) return L;
  }
  return null;
}

function logPos(L, u, top) {
  return { x: L.x0 + L.dir * L.len * u, y: L.y0 + (top ? -L.th / 2 : 0) };
}

function removeLog(L) {
  const q = LOGS.indexOf(L);
  if (q >= 0) LOGS.splice(q, 1);
  for (let k = CRIT.length - 1; k >= 0; k--) if (CRIT[k].L === L) CRIT.splice(k, 1);
}

function chopLog(L) {
  const f = axeFrac(),
    mult = 1 + (AXE_MAX - 1) * f;
  setAxeLast(performance.now());
  spend();
  beep(140 + mult * 8, 0.07, 'sawtooth');
  L.shake = performance.now();
  const yrs = logYears(L),
    ph = logPhase(yrs);
  L.left = Math.min(L.left, Math.ceil(L.wood0 * YIELD_PH[ph]));
  const n = Math.min(L.left, 1 + (mult >= 7 ? 1 : 0) + (mult >= 13 ? 1 : 0));
  const mid = logPos(L, 0.3 + Math.random() * 0.5);
  fxBurst(
    mid.x,
    mid.y,
    L.th / 2,
    8,
    ph >= 3 ? ['#4a3a2a', '#6a5440'] : ['#d9b27c', '#b88a52', '#8a5a2a'],
    30,
    14,
    0.6,
    1,
  );
  if (L.holes.length && ph <= 3 && Math.random() < 0.55) {
    toast('🐝 Você atingiu o ninho! As mamangavas defendem as galerias (só as fêmeas picam, em último caso).');
    for (let q = 0; q < 2; q++) beeSpawnAt(mid.x, mid.y, L.th / 2 + 2, 'angry');
  }
  if (ph >= 3 && Math.random() < 0.5) {
    toast('🐸 Você desabrigou os moradores do tronco!');
    critFlee(L);
  }
  if (n <= 0) {
    removeLog(L);
    return;
  }
  L.left -= n;
  giveItem('madeira', n);
  qAdd('madeira', n);
  let msg = '🪓 Tronco: +' + n + ' madeira';
  if (ph >= 3) msg += ' (madeira já podre rende pouco)';
  if (L.left <= 0) {
    msg += ' · tronco aproveitado por inteiro';
    removeLog(L);
    fxBurst(mid.x, mid.y, 3, 20, ['#d9b27c', '#8a5a2a'], 40, 18, 0.8, 2);
    beep(90, 0.2, 'square');
  } else msg += ' · restam ~' + L.left;
  toast(msg);
}

function logAction() {
  if (qIdx !== -1 || dlgOpen || S.inside || sleeping || !LOGS.length) return false;
  for (const q of herd) if (Math.hypot(q.x - S.px, q.y - S.py) < 24) return false;
  const t = target();
  if (t.x < 0 || t.y < 0 || t.x >= MW || t.y >= MH) return false;
  const L = logAt(t.x, t.y);
  if (!L) return false;
  const item = (ITEMS[S.sel] || {}).id;
  if (item === 'axe') {
    chopLog(L);
    return true;
  }
  if (!TOOLS.includes(item)) return false;
  const yrs = logYears(L),
    ph = logPhase(yrs);
  let msg = '';
  if (L.shr > 0) {
    const n = L.shr;
    L.shr = 0;
    S.inv.cogumelo = (S.inv.cogumelo || 0) + n;
    qAdd('cogumelo', n);
    beep(700, 0.08, 'triangle');
    msg = '🍄 ' + n + ' cogumelo' + (n > 1 ? 's' : '') + ' colhido' + (n > 1 ? 's' : '') + ' do tronco · ';
  }
  msg +=
    '🪵 Fase ' + (ph + 1) + '/5 · ' + PH_NM[ph] + ' (' + PH_YR[ph] + ') · ~' + Math.floor(yrs) + ' anos. ' + PH_TXT[ph];
  if (L.holes.length) msg += ' 🐝 ' + L.holes.length + ' galeria' + (L.holes.length > 1 ? 's' : '') + ' de mamangava.';
  toast(msg);
  return true;
}

/* ---------------- ciclo diário e fases ---------------- */
function nearView(x, y, m) {
  return Math.abs(x - S.px) < VW / 2 + (m || 0) && Math.abs(y - S.py) < VH / 2 + (m || 0);
}

function logPhaseUp(L, ph, quiet) {
  L.ph = ph;
  if (quiet) return;
  if (nearView(L.x0, L.y0, 120))
    toast('🪵 O tronco entrou na fase ' + (ph + 1) + '/5: ' + PH_NM[ph] + ' (' + PH_YR[ph] + '). ' + PH_TXT[ph]);
}

function logCollapse(L) {
  const tx = L.i % MW,
    ty = (L.i / MW) | 0,
    span = Math.ceil(L.len / TS);
  for (let k = 0; k <= span; k++) {
    const x = tx + L.dir * k;
    if (x < 0 || x >= MW) continue;
    for (let dy = -1; dy <= 1; dy++) {
      const y = ty + dy;
      if (y < 0 || y >= MH) continue;
      const j = y * MW + x;
      nut[j] = Math.min(1, nut[j] + 0.35);
      om[j] = Math.min(1, om[j] + 0.45);
      bio[j] = Math.min(1, bio[j] + 0.2);
      sm[j] = Math.min(1, sm[j] + 0.1);
    }
  }
  if (nearView(L.x0, L.y0, 120)) {
    toast(
      '🌱 O tronco desmoronou em húmus: carbono, nitrogênio e minerais voltaram ao solo' +
        (L.nursed ? ' — as árvores que nasceram nele agora firmam raízes "de pernas abertas".' : '.'),
    );
    fxBurst(L.x0 + L.dir * L.len * 0.5, L.y0, 2, 26, ['#3b2d22', '#4b3a2a', '#2b2018'], 30, 12, 1.2, 2);
  }
  removeLog(L);
}

function logsDaily() {
  const raining = climate.kind >= 3;
  for (const L of LOGS.slice()) {
    if (L.falling) continue;
    const yrs = logYears(L),
      ph = logPhase(yrs);
    if (yrs >= 100) {
      logCollapse(L);
      continue;
    }
    if (ph > L.ph) logPhaseUp(L, ph);
    const tx = L.i % MW,
      ty = (L.i / MW) | 0,
      span = Math.ceil(L.len / TS);
    if (ph <= 3 && L.holes.length < 4 && Math.random() < 0.22)
      L.holes.push([0.12 + Math.random() * 0.76, Math.random() < 0.5 ? 0 : 1]); // mamangava perfura galeria circular
    if (ph >= 1) {
      if (L.shr < (ph >= 3 ? 5 : 4) && Math.random() < (raining ? 0.6 : 0.3)) L.shr++; // fungos frutificam
      for (let k = 0; k <= span; k++) {
        const x = tx + L.dir * k;
        if (x < 0 || x >= MW) continue;
        for (let dy = 0; dy <= 1; dy++) {
          const j = (ty + dy) * MW + x;
          if (j >= 0 && j < HN) {
            sm[j] = Math.min(1, sm[j] + 0.03);
          }
        }
      } // esponja gigante
    }
    if (ph >= 2) {
      if (L.plants.length < (ph === 2 ? 5 : ph === 3 ? 7 : 9) && Math.random() < 0.5)
        L.plants.push([
          0.08 + Math.random() * 0.84,
          ph >= 3 && Math.random() < 0.4 ? 2 : Math.random() < 0.55 ? 0 : 1,
          L.plants.length,
        ]);
      if (L.plants.length >= 3 && L.nursed < 2 && L.sid && Math.random() < 0.12) {
        // uma planta-berçário vira árvore ao lado
        for (let k = 0; k < 10; k++) {
          const x = tx + L.dir * Math.floor(Math.random() * (span + 1)) + Math.round((Math.random() - 0.5) * 3),
            y = ty + Math.round((Math.random() - 0.5) * 3),
            j = validSeedTile(x, y);
          if (j >= 0) {
            amzSp[j] = L.sid;
            seedAge[j] = 1;
            L.nursed++;
            if (nearView(L.x0, L.y0, 120))
              toast('🌱 Uma muda nascida no tronco criou raízes e passou ao solo — a nova geração da floresta.');
            break;
          }
        }
      }
    }
  }
}

/* ---------------- mamangavas ---------------- */
function beeSpawnAt(x, y, z, st) {
  if (BEES.length >= 9) return null;
  const b = {
    x,
    y,
    z,
    vx: 0,
    vy: 0,
    tx: x,
    ty: y,
    tz: z,
    st: st || 'fly',
    t: 0,
    ph: Math.random() * 6.28,
    yel: Math.random() < 0.4 ? 1 : 0,
    face: 1,
    L: null,
    stung: 0,
    crop: -1,
    tree: null,
    pol: 0,
    life: 0,
  };
  BEES.push(b);
  return b;
}

function beePick(b) {
  const opts = [];
  let bestL = null,
    bd = 260;
  for (const L of LOGS) {
    if (L.falling || logPhase(logYears(L)) > 3) continue;
    const d = Math.hypot(L.x0 + (L.dir * L.len) / 2 - b.x, L.y0 - b.y);
    if (d < bd) {
      bd = d;
      bestL = L;
    }
  }
  if (bestL) opts.push(['log', 3, bestL]);
  let ci = -1,
    cd = 170;
  for (const k in crops) {
    const i = +k,
      x = (i % MW) * TS + 8,
      y = ((i / MW) | 0) * TS + 8,
      d = Math.hypot(x - b.x, y - b.y);
    if (d < cd && Math.random() < 0.4) {
      cd = d;
      ci = i;
    }
  }
  if (ci >= 0) opts.push(['crop', 2, ci]);
  const tl = visTrees.filter((a) => a.st >= 4 && Math.hypot(a.x * TS - b.x, a.y * TS - b.y) < 230);
  if (tl.length) opts.push(['tree', 1.5, tl[(Math.random() * tl.length) | 0]]);
  opts.push(['wander', 1, null]);
  let tot = 0;
  for (const o of opts) tot += o[1];
  let r = Math.random() * tot,
    pick = opts[opts.length - 1];
  for (const o of opts) {
    r -= o[1];
    if (r <= 0) {
      pick = o;
      break;
    }
  }
  b.L = null;
  b.crop = -1;
  b.tree = null;
  b.t = 0;
  b.pol = 0;
  if (pick[0] === 'log') {
    const L = pick[2];
    b.L = L;
    const u =
      L.holes.length && Math.random() < 0.8
        ? L.holes[(Math.random() * L.holes.length) | 0][0]
        : 0.15 + Math.random() * 0.7;
    const p = logPos(L, u, true);
    b.tx = p.x;
    b.ty = p.y + L.th / 2;
    b.tz = L.th / 2 + 2;
    b.hu = u;
    b.st = 'goto';
    b.kind = 'log';
  } else if (pick[0] === 'crop') {
    b.crop = pick[2];
    b.tx = (pick[2] % MW) * TS + 8;
    b.ty = ((pick[2] / MW) | 0) * TS + 8;
    b.tz = 7;
    b.st = 'goto';
    b.kind = 'crop';
  } else if (pick[0] === 'tree') {
    const a = pick[2];
    b.tree = a;
    b.tx = a.x * TS + 8 + (Math.random() - 0.5) * 20;
    b.ty = (a.y + 1) * TS;
    b.tz = Math.max(24, (a.model() ? a.model().h : 60) * 0.55);
    b.st = 'goto';
    b.kind = 'tree';
  } else {
    const a = Math.random() * 6.283,
      r = 40 + Math.random() * 90;
    b.tx = clamp(b.x + Math.cos(a) * r, 8, MW * TS - 8);
    b.ty = clamp(b.y + Math.sin(a) * r * 0.6, 8, MH * TS - 8);
    b.tz = 8 + Math.random() * 18;
    b.st = 'goto';
    b.kind = 'wander';
  }
}

function beeArrive(b) {
  if (b.kind === 'log' && b.L && LOGS.includes(b.L)) {
    const L = b.L;
    if (L.holes.length < 3 && Math.random() < 0.7) {
      b.st = 'drill';
      b.t = 0;
    } else {
      b.st = 'enter';
      b.t = 0;
    }
  } else if (b.kind === 'crop' || b.kind === 'tree') {
    b.st = 'buzz';
    b.t = 0;
  } else {
    b.st = 'hover';
    b.t = 0;
  }
}

function beeFinish(b) {
  if (b.st === 'drill' && b.L && LOGS.includes(b.L)) {
    b.L.holes.push([b.hu, Math.random() < 0.5 ? 0 : 1]);
  }
  if (b.st === 'buzz') {
    fxBurst(b.x, b.y, b.z, 8, ['#ffe27a', '#ffd23c', '#fff2b0'], 14, 8, 0.9, 1);
    if (b.kind === 'crop') {
      const c = crops[b.crop];
      if (c && typeof c.d === 'number') {
        c.d += 0.25;
      }
    }
    if (typeof S === 'object') {
      S.pollin = (S.pollin || 0) + 1;
    }
  }
  beePick(b);
}

function beeUpdate(b, dt) {
  b.life += dt;
  b.t += dt;
  const st = b.st;
  if (st === 'enter') {
    // entra na galeria e some por alguns segundos
    if (b.t > 3 + Math.random() * 0.01) {
      b.st = 'goto';
      b.tx = b.x + (Math.random() - 0.5) * 60;
      b.ty = b.y + (Math.random() - 0.5) * 30;
      b.tz = 10;
      b.kind = 'wander';
      b.t = 0;
    }
    return;
  }
  let tx = b.tx,
    ty = b.ty,
    tz = b.tz,
    vmax = 62,
    jit = 0;
  if (st === 'angry') {
    tx = S.px;
    ty = S.py - 4;
    tz = 7;
    vmax = 88;
    if (b.t > 7) {
      b.st = 'goto';
      beePick(b);
    }
  } else if (st === 'drill' || st === 'buzz' || st === 'hover') {
    vmax = 0;
    jit = st === 'hover' ? 0.35 : 0.9;
  }
  const dx = tx - b.x,
    dy = ty - b.y,
    dist = Math.hypot(dx, dy);
  const k = Math.min(1, dt * 3.2);
  if (vmax > 0 && dist > 1) {
    b.vx += ((dx / dist) * vmax - b.vx) * k;
    b.vy += ((dy / dist) * vmax * 0.8 - b.vy) * k;
  } else {
    b.vx *= 1 - k;
    b.vy *= 1 - k;
  }
  b.vx += Math.sin(b.life * 8 + b.ph) * 10 * dt;
  b.vy += Math.cos(b.life * 6.3 + b.ph) * 8 * dt;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.z += (tz - b.z) * Math.min(1, dt * 3) + Math.sin(b.life * 13 + b.ph) * (jit ? 0.12 : 0.25);
  if (Math.abs(b.vx) > 6) b.face = b.vx > 0 ? 1 : -1;
  if (jit) {
    b.x += Math.sin(b.life * 70) * jit * 0.5;
  }
  if (st === 'goto' && dist < 3.5) beeArrive(b);
  else if (st === 'drill') {
    if (Math.random() < dt * 14)
      fxAdd({
        x: b.x,
        y: b.y + 1,
        z: b.z - 2,
        vx: (Math.random() - 0.5) * 10,
        vy: 2,
        vz: -4,
        life: 0.6,
        max: 0.6,
        c: '#d9b27c',
        sz: 1,
        g: 60,
      });
    if (b.t > 4.5) beeFinish(b);
  } else if (st === 'buzz') {
    if (Math.random() < dt * 10)
      fxAdd({
        x: b.x,
        y: b.y,
        z: b.z - 1,
        vx: (Math.random() - 0.5) * 14,
        vy: (Math.random() - 0.5) * 6,
        vz: 3,
        life: 0.7,
        max: 0.7,
        c: '#ffe27a',
        sz: 1,
        g: 30,
      });
    if (b.t > 2.3) beeFinish(b);
  } else if (st === 'hover') {
    if (b.t > 1.4) beePick(b);
  } else if (st === 'angry') {
    if (!b.stung && Math.hypot(b.x - S.px, b.y - (S.py - 4)) < 7) {
      b.stung = 1;
      damagePlayer(10, 'Uma mamangava');
      toast('🐝 Ferroada de mamangava! −10 de vida (a fêmea só pica quando o ninho é atacado)');
      beep(260, 0.15, 'sawtooth');
      b.st = 'goto';
      beePick(b);
    }
  }
}

function beesUpdate(dt) {
  const day = sunInfo(6 + S.min / 60).day > 0.12,
    bad = climate.kind >= 3;
  let want = 0;
  if (day && !bad) {
    let nl = 0;
    for (const L of LOGS)
      if (!L.falling && Math.abs(L.x0 - S.px) < 300 && Math.abs(L.y0 - S.py) < 220 && logPhase(logYears(L)) <= 3) nl++;
    const px = Math.floor(S.px / TS),
      py = Math.floor(S.py / TS);
    if (nl || forestAround({ x: px, y: py }, 8) >= 3) want = clamp(1 + nl * 2, 1, 6);
  }
  const calm = BEES.filter((b) => b.st !== 'angry').length;
  beeSpawnT -= dt;
  if (calm < want && beeSpawnT <= 0) {
    beeSpawnT = 2.5;
    const a = Math.random() * 6.283,
      r = VW / 2 + 40 + Math.random() * 60;
    const b = beeSpawnAt(
      clamp(S.px + Math.cos(a) * r, 8, MW * TS - 8),
      clamp(S.py + Math.sin(a) * r * 0.6, 8, MH * TS - 8),
      10 + Math.random() * 10,
    );
    if (b) beePick(b);
  }
  for (let q = BEES.length - 1; q >= 0; q--) {
    const b = BEES[q];
    if (!b.tx && b.st === 'fly') beePick(b);
    beeUpdate(b, dt);
    const far = Math.hypot(b.x - S.px, b.y - S.py) > 420;
    if (far || (b.st !== 'angry' && calm > want && b.life > 14 && !nearView(b.x, b.y, 30))) BEES.splice(q, 1);
  }
  /* zumbido grave quando perto */
  buzzT -= dt;
  if (buzzT <= 0) {
    for (const b of BEES) {
      if (b.st === 'enter') continue;
      const d = Math.hypot(b.x - S.px, b.y - S.py);
      if (d < 70) {
        buzzT = 0.55 + Math.random() * 0.3;
        beep(95 + Math.random() * 25, 0.1, 'sawtooth');
        if (!S.beeSeen && d < 60) {
          S.beeSeen = 1;
          toast(
            '🐝 Mamangava (Xylocopa): abelha solitária e grande, que perfura troncos caídos para fazer ninho e poliniza por vibração (buzz pollination). Não é agressiva.',
          );
        }
        break;
      }
    }
  }
}

/* ---------------- bichos que moram no tronco (fase 3+) ---------------- */
function critFlee(L) {
  for (const c of CRIT) if (c.L === L) c.flee = 1;
}

function critSpawn() {
  const cand = LOGS.filter((L) => !L.falling && L.ph >= 2 && nearView(L.x0 + (L.dir * L.len) / 2, L.y0, -40));
  if (!cand.length || CRIT.length >= 3) return;
  const L = cand[(Math.random() * cand.length) | 0],
    day = sunInfo(6 + S.min / 60).day > 0.15;
  const pool =
    L.ph === 2
      ? ['sal']
      : L.ph === 3
        ? day
          ? ['frog', 'sal', 'snake', 'mouse', 'wood', 'wood']
          : ['frog', 'sal', 'snake', 'mouse']
        : day
          ? ['frog', 'mouse', 'wood']
          : ['frog', 'mouse'];
  const k = pool[(Math.random() * pool.length) | 0];
  const hu = k === 'wood' ? 0.55 + Math.random() * 0.4 : 0.3;
  CRIT.push({
    k,
    L,
    hu,
    t: 0,
    life: k === 'wood' ? 5 : k === 'snake' ? 7 : 7,
    seq: 0,
    flee: 0,
    seed: Math.random() * 10,
  });
}

function critUpdate(dt) {
  critT -= dt;
  if (critT <= 0) {
    critT = 3 + Math.random() * 3;
    if (Math.random() < 0.5) critSpawn();
  }
  for (let q = CRIT.length - 1; q >= 0; q--) {
    const c = CRIT[q];
    c.t += dt;
    if (!LOGS.includes(c.L) || c.t > c.life + (c.flee ? -c.life + 1 : 0)) {
      CRIT.splice(q, 1);
      continue;
    }
    if (c.k === 'wood' && ((c.t * 5) | 0) !== (((c.t - dt) * 5) | 0) && c.t < c.life - 1) {
      beep(1100 + Math.random() * 200, 0.02, 'square');
      const p = logPos(c.L, c.hu, true);
      fxAdd({
        x: p.x + c.L.dir * 2,
        y: p.y,
        z: c.L.th * 0.6,
        vx: (Math.random() - 0.5) * 14,
        vy: 3,
        vz: 6,
        life: 0.5,
        max: 0.5,
        c: '#c9a36a',
        sz: 1,
        g: 90,
      });
    }
  }
}

function critDraw(c) {
  const L = c.L,
    t = c.t,
    hole = logPos(L, c.hu, false),
    base = L.y0 + L.th / 2;
  const fade = Math.min(1, t * 2, (c.life - t) * 2);
  if (fade <= 0) return;
  const R = (x, y, w, h, col) => {
    ctx.fillStyle = col;
    ctx.fillRect(Math.round(x), Math.round(y), w, h);
  };
  ctx.globalAlpha = fade;
  if (c.k === 'frog') {
    const hops = 3,
      per = 0.9,
      seg = Math.min(hops * 2 - 1, Math.floor(t / per)),
      ph = (t % per) / per,
      go = seg < hops;
    const ang = c.seed * 2.3,
      ex = Math.cos(ang) * (10 + seg * 4),
      ey = Math.abs(Math.sin(ang)) * 5 + 3;
    const k = go ? (seg + ph) / hops : Math.max(0, 1 - (seg - hops + 1 + ph) / hops);
    const x = hole.x + ex * k,
      y = base + ey * k,
      z = Math.sin(ph * 3.1416) * 5;
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.fillRect(Math.round(x - 2), Math.round(y + 1), 5, 1);
    R(x - 2, y - 2 - z, 5, 3, '#4e9a3e');
    R(x - 2, y - 3 - z, 2, 1, '#6cc050');
    R(x + 1, y - 3 - z, 1, 1, '#101010');
    R(x - 2, y - 3 - z, 1, 1, '#101010');
    R(x - 3, y - 1 - z, 1, 2, '#3d7a30');
    R(x + 3, y - 1 - z, 1, 2, '#3d7a30');
    R(x - 1, y - 1 - z, 3, 1, '#c9e08a');
  } else if (c.k === 'sal') {
    const u = clamp(c.hu + t * 0.05 * (c.flee ? -1 : 1), 0.05, 0.95),
      p = logPos(L, u, true),
      x = p.x,
      y = p.y - 1;
    R(x - 3, y - 1, 7, 2, '#2a2a1e');
    R(x - 3, y - 1, 1, 1, '#e0761f');
    R(x, y - 1, 1, 1, '#e0761f');
    R(x + 2, y - 1, 1, 1, '#e0761f');
    R(x + 4, y, 2, 1, '#2a2a1e');
    R(x - 4, y, 1, 1, '#2a2a1e');
  } else if (c.k === 'snake') {
    const reach = Math.sin(Math.min(1, t / c.life) * 3.1416) * 26,
      dirx = L.dir;
    for (let s = 0; s < 14; s++) {
      const d = s * 1.6,
        off = Math.sin(s * 0.9 + t * 6) * 1.5;
      if (d > reach) break;
      const x = hole.x + dirx * (reach - d) * 0.9 + 0,
        y = base + 2 + off;
      R(x, y, 2, 2, s === 0 ? '#c0c070' : s % 3 ? '#6e8a34' : '#5a4a22');
    }
  } else if (c.k === 'mouse') {
    const run = Math.sin(Math.min(1, t / c.life) * 3.1416) * 22,
      x = hole.x + L.dir * run,
      y = base + 3;
    R(x - 2, y - 2, 5, 3, '#8a8478');
    R(x + (L.dir > 0 ? 2 : -3), y - 2, 1, 1, '#101010');
    R(x + (L.dir > 0 ? 3 : -4), y - 1, 1, 1, '#d9a0a0');
    R(x - L.dir * 4, y - 1, 3, 1, '#c9a0a0');
    R(x - 1, y - 3, 2, 1, '#b0a89a');
  } else if (c.k === 'wood') {
    const p = logPos(L, c.hu, true),
      peck = ((t * 10) | 0) % 2,
      out = t > c.life - 1 ? (t - (c.life - 1)) * 60 : 0,
      x = p.x + L.dir * out * 0.5,
      y = p.y - 5 - out * 0.8,
      d = -L.dir;
    R(x - 2, y - 2, 5, 8, '#16161a');
    R(x - 1, y + 1, 3, 4, '#ece6d8');
    R(x + d * 2 + (peck ? d : 0), y - 3, 3, 3, '#16161a');
    R(x + d * 3 + (peck ? d : 0), y - 4, 1, 1, '#d63a3a');
    R(x + d * 4 + (peck ? d : 0), y - 2, 2, 1, '#e8d9a0');
    R(x - L.dir * 3, y + 4, 1, 4, '#16161a');
    R(x - 1, y, 1, 1, '#ece6d8');
  }
  ctx.globalAlpha = 1;
}

/* ---------------- desenho do tronco (cache em canvas) ---------------- */
const PAL = [
  ['#7a5230', '#9a6c3e', '#4f3320', '#cfa66c'],
  ['#6e4e30', '#8a7a62', '#43301f', '#c4a06a'],
  ['#5e4a34', '#6f5c44', '#3c2d20', '#a89070'],
  ['#4c3b2c', '#5a4938', '#2c2118', '#6a5640'],
  ['#3b2d22', '#47382b', '#231a13', '#4a3a2c'],
];

function logCv(L, yrs, ph) {
  const k = ph >= 4 ? 1 - 0.45 * clamp((yrs - 50) / 50, 0, 1) : ph === 3 ? 0.95 : 1,
    th = Math.max(3, Math.round(L.th * k));
  const key =
    ph +
    '|' +
    L.shr +
    '|' +
    L.holes.length +
    '|' +
    L.plants.length +
    '|' +
    th +
    '|' +
    (ph >= 2 ? Math.floor(yrs / (ph >= 3 ? 6 : 2)) : 0);
  if (L.cv && L.cvKey === key) return L.cv;
  const w = L.len + 12,
    h = th + 26,
    cy = 22 + (th >> 1),
    c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d'),
    P = PAL[ph],
    hs = (a, b) => hash2(a + L.id * 131, b);
  const R = (x, y, ww, hh, col) => {
    g.fillStyle = col;
    g.fillRect(x, y, ww, hh);
  };
  for (let u = 0; u <= L.len; u++) {
    const r = (th / 2) * (1 - (0.2 * u) / L.len),
      y1 = Math.round(cy - r),
      y2 = Math.round(cy + r),
      hh = Math.max(1, y2 - y1);
    for (let j = 0; j < hh; j++) {
      const kk = j / hh;
      let col = kk < 0.2 ? P[1] : kk > 0.7 ? P[2] : P[0];
      const n = hs(u, j);
      if (n < 0.1) col = P[2];
      else if (n > 0.95) col = P[1];
      R(4 + u, y1 + j, 1, 1, col);
    }
  }
  /* ponta quebrada com tocos de galho */
  if (ph <= 2) {
    for (let s = 0; s < 2; s++) {
      const u = L.len - 2 - s * 5;
      if (u > 0) R(4 + u, Math.round(cy - th / 2) - 2, 1, 3, P[2]);
    }
  }
  R(4 + L.len, Math.round(cy - (th / 2) * 0.8), 1, Math.max(2, Math.round(th * 0.8)), P[2]);
  /* face cortada da base (com anéis); a partir da fase 3 o miolo apodreceu: oco */
  for (let j = 0; j < th; j++) R(3, Math.round(cy - th / 2) + j, 2, 1, P[3]);
  R(3, Math.round(cy), 2, 1, '#a67c48');
  if (th > 6) R(3, Math.round(cy - th / 4), 2, 1, '#b58a54');
  if (ph >= 3 && L.st >= 3) {
    R(3, Math.round(cy - th / 4), 2, Math.max(2, Math.round(th / 2)), '#150d08');
    R(5, Math.round(cy - th / 5), 1, Math.max(2, Math.round(th / 2.5)), '#1f150d');
  }
  /* besouros: galerias minúsculas */
  if (ph <= 1) {
    for (let u = 3; u < L.len; u += 4) {
      const n = hs(u, 77);
      if (n < 0.5) {
        const yy = Math.round(cy - th / 2 + 1 + hs(u, 5) * (th - 3));
        R(4 + u, yy, 1, 1, '#1b130b');
        if (n < 0.2) R(5 + u, yy, 1, 1, '#1b130b');
      }
    }
  }
  /* galerias circulares das mamangavas (1–2 cm) */
  for (const hl of L.holes) {
    const hx = 4 + Math.round(hl[0] * L.len),
      hy = hl[1] ? Math.round(cy + th * 0.1) : Math.round(cy - th / 2 + 1);
    R(hx - 1, hy - 2, 3, 1, '#d9b27c');
    R(hx - 2, hy - 1, 5, 2, '#d9b27c');
    R(hx - 1, hy + 1, 3, 1, '#b88a52');
    R(hx - 1, hy - 1, 3, 2, '#0e0805');
    R(hx, hy + 2, 1, 1, '#e6c690');
  }
  /* musgo, líquen, fungos de prateleira */
  if (ph >= 1) {
    const cov = [0, 0.28, 0.5, 0.72, 0.88][ph];
    for (let u = 0; u <= L.len; u++) {
      const n = hs(u >> 2, 9);
      if (n < cov) {
        const r = (th / 2) * (1 - (0.2 * u) / L.len),
          yt = Math.round(cy - r);
        R(
          4 + u,
          yt - (hs(u, 3) < 0.4 ? 1 : 0),
          1,
          2 + (hs(u, 4) < 0.3 ? 1 : 0),
          hs(u, 6) < 0.5 ? '#2e6a2a' : '#3f8a34',
        );
        if (hs(u, 8) < 0.15) R(4 + u, yt + 2, 1, 1, '#63b048');
        if (ph >= 2 && hs(u, 12) < cov * 0.5) R(4 + u, Math.round(cy + r) - 2, 1, 2, '#2a5a25');
      } else if (hs(u, 21) < 0.04 * ph) R(4 + u, Math.round(cy - th / 2 + 1 + hs(u, 22) * (th - 2)), 1, 1, '#b9c2a8');
    }
    for (let q = 0; q < Math.min(4, ph + 1); q++) {
      const u = Math.round(hs(q, 31) * (L.len - 8)) + 4,
        y = Math.round(cy + (th / 2) * (0.2 + hs(q, 32) * 0.5));
      R(4 + u, y, 3, 1, '#e0b068');
      R(5 + u, y + 1, 2, 1, '#a8743a');
    }
  }
  for (let q = 0; q < L.shr; q++) {
    const u = Math.round(hs(q, 41) * (L.len - 6)) + 3,
      r = (th / 2) * (1 - (0.2 * u) / L.len),
      yt = Math.round(cy - r) - 1;
    R(4 + u, yt - 2, 1, 3, '#ece4d0');
    R(2 + u, yt - 3, 5, 1, hs(q, 42) < 0.5 ? '#c9783a' : '#e0c890');
    R(3 + u, yt - 4, 3, 1, hs(q, 42) < 0.5 ? '#e08a4a' : '#f0e0b0');
  }
  /* berçário: samambaias, mudas e arbustos nascendo no tronco */
  const grow = ph === 2 ? clamp((yrs - 5) / 15, 0, 1) : 1;
  for (const pl of L.plants) {
    const u = Math.round(pl[0] * (L.len - 6)) + 3,
      r = (th / 2) * (1 - (0.2 * u) / L.len),
      yt = Math.round(cy - r),
      sc = 0.5 + 0.5 * clamp(grow * (1 - pl[2] * 0.06), 0.2, 1),
      big = ph >= 4 ? 1.5 : ph === 3 ? 1.2 : 1;
    const x = 4 + u;
    if (pl[1] === 0) {
      const ht = Math.round((4 + hs(pl[2], 51) * 3) * sc * big);
      R(x, yt - ht, 1, ht, '#2f8a3e');
      R(x - 2, yt - ht + 1, 2, 1, '#3fae52');
      R(x + 1, yt - ht + 1, 2, 1, '#3fae52');
      R(x - 3, yt - ht + 2, 1, 1, '#2f8a3e');
      R(x + 3, yt - ht + 2, 1, 1, '#2f8a3e');
      R(x - 1, yt - ht - 1, 3, 1, '#7fd06a');
    } else if (pl[1] === 1) {
      const ht = Math.round((5 + hs(pl[2], 52) * 3) * sc * big);
      R(x, yt - ht, 1, ht, '#6a4a2a');
      R(x - 2, yt - ht, 2, 1, '#4ac05a');
      R(x + 1, yt - ht - 1, 2, 1, '#6fd06a');
      R(x - 1, yt - ht - 1, 1, 1, '#2f9a45');
      R(x, yt - ht - 2, 1, 1, '#8fe07a');
    } else {
      const ht = Math.round((6 + hs(pl[2], 53) * 4) * sc * big);
      R(x, yt - ht, 1, ht, '#5a3e22');
      R(x - 3, yt - ht - 3, 7, 3, '#2f8a3e');
      R(x - 2, yt - ht - 4, 5, 1, '#4aa84a');
      R(x - 1, yt - ht - 5, 3, 1, '#6fd06a');
      R(x - 3, yt - ht - 1, 2, 1, '#256a30');
    }
  }
  L.cv = { cv: c, cy, th };
  L.cvKey = key;
  return L.cv;
}

function drawLog(L) {
  const yrs = logYears(L),
    ph = logPhase(yrs),
    C = logCv(L, yrs, ph),
    X = Math.round(L.x0),
    Y = Math.round(L.y0);
  const sk = L.shake && performance.now() - L.shake < 260 ? Math.sin((performance.now() - L.shake) * 0.06) * 1.4 : 0;
  ctx.fillStyle = 'rgba(0,0,0,.24)';
  ctx.beginPath();
  ctx.ellipse(X + (L.dir * L.len) / 2, Y + C.th / 2 + 1, L.len / 2 + 1, C.th / 2 + 2, 0, 0, 6.283);
  ctx.fill();
  ctx.save();
  ctx.translate(X + sk, Y);
  ctx.scale(L.dir, 1);
  ctx.drawImage(C.cv, -4, -C.cy);
  ctx.restore();
  /* copa caída (folhas murcham e somem em ~1,5 ano) */
  if (yrs < 1.6) {
    const m = L.esp && M[L.esp] ? M[L.esp][L.st] : null,
      a = yrs < 0.6 ? 1 : 1 - (yrs - 0.6);
    if (m && m.ready && a > 0) {
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(X + sk, Y);
      ctx.rotate((L.dir * Math.PI) / 2);
      ctx.drawImage(m.img, -m.w / 2, -m.h + 2);
      ctx.restore();
    }
  }
  /* besouros caminhando na casca */
  if (ph <= 1 && nearView(L.x0, L.y0, 0)) {
    const tt = performance.now() / 1000;
    for (let q = 0; q < 2; q++) {
      const u = 0.2 + (Math.sin(tt * 0.4 + q * 3) + 1) / 4 + q * 0.3,
        p = logPos(L, u, true);
      ctx.fillStyle = '#0d0907';
      ctx.fillRect(Math.round(p.x), Math.round(p.y + 1 + q), 2, 1);
    }
  }
}

/* ---------------- camada superior: árvore caindo, partículas, mamangavas, etiqueta ---------------- */
function drawTopLogs(camX, camY) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (const F of FALLING) {
    const L = F.L,
      m = F.m;
    if (!m || !m.ready) continue;
    const t = F.t,
      a = t < 1 ? (Math.PI / 2) * t * t * (0.6 + 0.4 * t) : Math.PI / 2 - Math.sin(((t - 1) / 0.35) * Math.PI) * 0.1;
    ctx.save();
    ctx.translate(Math.round(L.x0 - camX), Math.round(L.y0 - camY));
    ctx.rotate(L.dir * a);
    ctx.drawImage(m.img, Math.round(-m.w / 2), -m.h + 2);
    ctx.restore();
  }
  for (const f of FX) {
    const X = Math.round(f.x - camX),
      Y = Math.round(f.y - f.z - camY);
    if (X < -4 || X > VW + 4 || Y < -4 || Y > VH + 4) continue;
    ctx.globalAlpha = clamp((f.life / f.max) * 1.4, 0, 1);
    ctx.fillStyle = f.c;
    ctx.fillRect(X, Y, f.sz, f.sz);
  }
  ctx.globalAlpha = 1;
  const tt = performance.now();
  for (const b of BEES) {
    if (b.st === 'enter') continue;
    const X = b.x - camX,
      Y = b.y - camY;
    if (X < -12 || X > VW + 12 || Y < -30 || Y > VH + 12) continue;
    ctx.fillStyle = 'rgba(0,0,0,.26)';
    const sw = clamp(5 - b.z * 0.08, 2, 5);
    ctx.beginPath();
    ctx.ellipse(Math.round(X), Math.round(Y + 1), sw, 1.3, 0, 0, 6.283);
    ctx.fill();
    const sp = BEE_SP[b.yel][((tt / 32) | 0) % 2];
    ctx.save();
    ctx.translate(Math.round(X), Math.round(Y - b.z));
    ctx.scale(b.face, 1);
    ctx.drawImage(sp, -7, -6);
    ctx.restore();
  }
  /* etiqueta do tronco quando o jogador está perto */
  for (const L of LOGS) {
    if (L.falling) continue;
    const r = logRect(L);
    if (S.px < r.x1 - 26 || S.px > r.x2 + 26 || S.py < r.y1 - 30 || S.py > r.y2 + 30) continue;
    const yrs = logYears(L),
      ph = logPhase(yrs),
      l1 = '🪵 Tronco · fase ' + (ph + 1) + '/5 · ' + PH_NM[ph],
      l2 =
        '~' +
        Math.floor(yrs) +
        ' anos · madeira restante ~' +
        Math.min(L.left, Math.ceil(L.wood0 * YIELD_PH[ph])) +
        (L.holes.length ? ' · 🐝 ' + L.holes.length : '') +
        (L.shr ? ' · 🍄 ' + L.shr : '');
    ctx.font = '7px "Segoe UI",system-ui,sans-serif';
    ctx.textAlign = 'center';
    const w = Math.max(ctx.measureText(l1).width, ctx.measureText(l2).width) + 8,
      x = clamp((r.x1 + r.x2) / 2 - camX, w / 2 + 2, VW - w / 2 - 2),
      y = Math.max(16, r.y1 - camY - 34 - (L.plants.length ? 6 : 0));
    ctx.fillStyle = 'rgba(12,14,10,.72)';
    ctx.fillRect(Math.round(x - w / 2), Math.round(y), Math.round(w), 20);
    ctx.fillStyle = '#ffe9b0';
    ctx.fillText(l1, Math.round(x), Math.round(y + 8));
    ctx.fillStyle = '#cfe6c0';
    ctx.fillText(l2, Math.round(x), Math.round(y + 17));
    break;
  }
  ctx.restore();
}

/* ---------------- laço de atualização ---------------- */

/* ---------------- salvar / carregar ---------------- */
function logsPack() {
  return LOGS.map((l) => {
    const o = Object.assign({}, l);
    delete o.cv;
    delete o.cvKey;
    delete o.shake;
    o.falling = 0;
    return o;
  });
}

function logsLoad(a) {
  LOGS = [];
  FALLING.length = 0;
  BEES.length = 0;
  CRIT.length = 0;
  FX.length = 0;
  if (Array.isArray(a))
    for (const o of a) {
      const l = Object.assign({ shr: 0, holes: [], plants: [], nursed: 0, ph: 0 }, o, {
        cv: null,
        cvKey: '',
        falling: 0,
        shake: 0,
      });
      l.ph = logPhase(logYears(l));
      LOGS.push(l);
      logId = Math.max(logId, (l.id | 0) + 1);
    }
}

export function installFallenLogs() {
  actionA.extend(
    (_aLog) =>
      function () {
        try {
          if (logAction()) return;
        } catch (e) {
          console.error('log action', e);
        }
        return _aLog.apply(this, arguments);
      },
  );

  chopHit.extend(
    (_chLog) =>
      function (i, dmg, mult) {
        const had = obj[i] === TREE,
          a = ecoTrees.get(i);
        let s = null;
        if (had) {
          try {
            s = snapTree(i, a);
          } catch (e) {
            console.error(e);
          }
        }
        _chLog.apply(this, arguments);
        if (had && s && obj[i] !== TREE) startFall(s);
      },
  );

  drawPrints.extend(
    (_dprL) =>
      function () {
        _dprL.apply(this, arguments);
        if (S.inside || (!LOGS.length && !CRIT.length)) return;
        const cx = vcam ? vcam.x : 0,
          cy = vcam ? vcam.y : 0;
        for (const L of LOGS) {
          if (L.falling) continue;
          if (L.x0 + L.len < cx - 40 || L.x0 - L.len > cx + VW + 40 || L.y0 < cy - 60 || L.y0 > cy + VH + 60) continue;
          drawLog(L);
        }
        for (const c of CRIT) critDraw(c);
      },
  );

  drawWeather.extend(
    (_dwLg) =>
      function (t, camX, camY) {
        _dwLg.apply(this, arguments);
        if (S.inside || (!FALLING.length && !FX.length && !BEES.length && !LOGS.length)) return;
        try {
          drawTopLogs(camX, camY);
        } catch (e) {
          if (!window.__lgErr) {
            window.__lgErr = 1;
            console.error('logs draw', e);
          }
        }
      },
  );

  update.extend(
    (_updLg) =>
      function (dt) {
        _updLg.apply(this, arguments);
        if (sleeping || S.inside) return;
        try {
          if (S.day !== logDay) {
            const first = logDay < 0;
            logDay = S.day;
            if (!first) logsDaily();
          }
          for (let q = FALLING.length - 1; q >= 0; q--) {
            const F = FALLING[q];
            F.t += dt;
            if (!F.hit && F.t >= 1) {
              F.hit = true;
              impact(F);
            }
            if (F.t >= 1.4) FALLING.splice(q, 1);
          }
          for (let q = FX.length - 1; q >= 0; q--) {
            const f = FX[q];
            f.life -= dt;
            if (f.life <= 0) {
              FX.splice(q, 1);
              continue;
            }
            f.vz -= f.g * dt;
            f.x += f.vx * dt;
            f.y += f.vy * dt;
            f.z += f.vz * dt;
            if (f.z < 0) {
              f.z = 0;
              f.vz = 0;
              f.vx *= 0.6;
              f.vy *= 0.6;
            }
          }
          phT -= dt;
          if (phT <= 0) {
            phT = 1;
            for (const L of LOGS.slice()) {
              if (L.falling) continue;
              const y = logYears(L);
              if (y >= 100) {
                logCollapse(L);
                continue;
              }
              const ph = logPhase(y);
              if (ph > L.ph) logPhaseUp(L, ph);
            }
          }
          beesUpdate(dt);
          critUpdate(dt);
        } catch (e) {
          if (!window.__lgErr2) {
            window.__lgErr2 = 1;
            console.error('logs update', e);
          }
        }
      },
  );

  window.TRONCO = {
    logs: () => LOGS,
    bees: () => BEES,
    crit: () => CRIT,
    fall: (i) => {
      const a = ecoTrees.get(i);
      const s = snapTree(i, a);
      if (s) {
        obj[i] = 0;
        ecoTrees.delete(i);
        startFall(s);
      }
    },
    age: (y) => {
      for (const L of LOGS) L.born -= (y / LOG_YPD) * DAY_MIN;
    },
    daily: logsDaily,
    spawnBee: (x, y) => {
      const b = beeSpawnAt(x, y, 10);
      if (b) beePick(b);
      return b;
    },
  };
}

export { FALLING, LOGS, fxAdd, logsLoad, logsPack };
