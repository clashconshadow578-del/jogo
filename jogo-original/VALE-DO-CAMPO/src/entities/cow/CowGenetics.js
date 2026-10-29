/**
 * Ciclo de vida e genética do gado: genes de pelagem e porte, fases (bezerro, jovem, adulto, senescência), pelagens geradas e morte.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { HN, MW, TS, WATER } from '../../config/constants.js';
import { cbIn, cowDeadAdd } from '../Carcass.js';
import { COW_CH, COW_CW, COW_IMG } from './CowRenderer.js';
import { gest, herd, setGest } from './Herd.js';
import { toast } from '../../ui/Toast.js';
import { rr } from '../../utils/Random.js';
import { om } from '../../world/hydrology/Hydrology.js';
import { ground } from '../../world/World.js';

/* ============ CICLO DE VIDA + GENÉTICA: zigoto -> filhote -> jovem -> adulto fértil -> senescência -> morte ============ */
const B_LIFE = 3000,
  B_MAT = 600,
  B_TINTS = [
    null,
    'rgba(150,92,42,.30)',
    'rgba(196,124,64,.30)',
    'rgba(110,112,128,.32)',
    'rgba(214,170,70,.28)',
    'rgba(228,228,234,.34)',
  ],
  bTintC = {};

const bClamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function coatFill(g, c) {
  // garante os genes de pelagem (saves antigos / fundadores)
  const rn = () => Math.floor(Math.random() * 1e9);
  if (!g.D) g.D = [1, 1];
  if (!g.C) g.C = [1, 1];
  if (!g.S) g.S = [1, Math.random() < 0.5 ? 1 : 0];
  if (!g.R) g.R = [0, 0];
  if (!g.Br) g.Br = [0, 0];
  if (!g.pat) g.pat = newPat();
  return g;
}

function newPat() {
  const R = Math.random;
  return {
    k: Math.floor(R() * 1e9),
    n: 1 + Math.floor(R() * 3),
    sock: R() < 0.35,
    blz: R() < 0.4, // sinais 100% aleatórios por animal
    bx: 5 + R() * 19,
    by: 3 + R() * 13,
    br: 2 + R() * 4.5,
    bx2: 5 + R() * 19,
    by2: 3 + R() * 13,
    br2: 1.5 + R() * 3.5,
    dk: R() < 0.3,
    sc: 2.2 + R() * 3.4,
  };
}

function bGenes(c) {
  if (c.g) return coatFill(c.g, c);
  const q = () => 0.82 + Math.random() * 0.36; // fundadores: 2 alelos por gene (diploide)
  // fêmea fundadora: vermelha, carrega diluição/chocolate, malhada; macho fundador: preto portador de vermelho, sólido
  const fem = c.id === 0 && !c.founder,
    mal = !!c.founder;
  const g = {
    B: fem ? [0, 0] : mal ? [1, 0] : c.black ? [1, Math.random() < 0.5 ? 1 : 0] : [0, 0],
    size: [q(), q()],
    vig: [q(), q()],
    fert: [q(), q()],
    spd: [q(), q()],
    tint: [Math.random(), Math.random()],
  };
  if (fem) {
    g.D = [1, 0];
    g.C = [1, 0];
    g.S = [1, 0];
    g.R = [0, 0];
    g.Br = [0, 0];
    g.pat = newPat();
    g.pat.blz = true;
  } else if (mal) {
    g.D = [1, 0];
    g.C = [1, 0];
    g.S = [0, 0];
    g.R = [0, 0];
    g.Br = [0, 0];
    g.pat = newPat();
  }
  return (c.g = coatFill(g, c));
}

function bPh(c) {
  const g = bGenes(c),
    a = (k) => (g[k][0] + g[k][1]) / 2;
  return { size: a('size'), vig: a('vig'), fert: a('fert'), spd: a('spd'), tint: a('tint') };
}

function bGam(g) {
  const p = (a) => a[Math.random() < 0.5 ? 0 : 1],
    m = (v, sp, lo, hi) => (Math.random() < 0.1 ? bClamp(v + (Math.random() - 0.5) * sp, lo, hi) : v); // meiose: 1 alelo aleatório por gene + mutação
  const o = { B: p(g.B) };
  if (Math.random() < 0.03) o.B = 1 - o.B;
  o.D = p(g.D);
  o.C = p(g.C);
  o.S = p(g.S);
  o.R = p(g.R);
  o.Br = p(g.Br);
  for (const k of ['D', 'C', 'S', 'R', 'Br']) if (Math.random() < 0.02) o[k] = 1 - o[k]; // mutação rara
  o.size = m(p(g.size), 0.2, 0.65, 1.45);
  o.vig = m(p(g.vig), 0.3, 0.6, 1.5);
  o.fert = m(p(g.fert), 0.3, 0.6, 1.5);
  o.spd = m(p(g.spd), 0.25, 0.7, 1.35);
  o.tint = m(p(g.tint), 0.5, 0, 1);
  return o;
}

function bCross(m, d) {
  const a = bGam(bGenes(m)),
    b = bGam(bGenes(d)); // fecundação: gameta da mãe + gameta do pai = zigoto novo
  return {
    B: [a.B, b.B],
    D: [a.D, b.D],
    C: [a.C, b.C],
    S: [a.S, b.S],
    R: [a.R, b.R],
    Br: [a.Br, b.Br],
    pat: newPat(),
    size: [a.size, b.size],
    vig: [a.vig, b.vig],
    fert: [a.fert, b.fert],
    spd: [a.spd, b.spd],
    tint: [a.tint, b.tint],
  };
}

const bLife = (c) => B_LIFE * bPh(c).vig,
  bMat = (c) => B_MAT * (1.15 - 0.15 * bPh(c).fert);

function bStage(c) {
  const a = c.age || 0;
  return a < 360 ? 'filhote' : a < bMat(c) ? 'jovem' : a < bLife(c) * 0.7 ? 'adulto' : 'idoso';
}

function bFert(c) {
  const a = c.age || 0;
  return !c.calf && a >= bMat(c) && a < bLife(c) * 0.85;
}

function bGrow(c) {
  const a = c.age || 0;
  if (c.calf) return 0.5 + 0.5 * Math.min(1, a / 360);
  const m = bMat(c);
  return a < m ? 0.9 + (0.1 * (a - 360)) / Math.max(1, m - 360) : 1;
}

const COAT_CACHE = {};
let COAT_N = 0;

function coatOf(c) {
  const g = bGenes(c),
    black = !!(g.B[0] || g.B[1]),
    dil = !(g.D[0] || g.D[1]),
    choc = !(g.C[0] || g.C[1]),
    ns = g.S[0] + g.S[1],
    roan = !!(g.R[0] || g.R[1]),
    brin = !!(g.Br[0] || g.Br[1]);
  let base, nm;
  if (black) {
    if (choc && dil) {
      base = [158, 126, 110];
      nm = 'chocolate diluído';
    } else if (choc) {
      base = [96, 60, 44];
      nm = 'chocolate';
    } else if (dil) {
      base = [128, 130, 142];
      nm = 'cinza prata';
    } else {
      base = [30, 28, 33];
      nm = 'preto';
    }
  } else {
    if (dil) {
      base = [226, 188, 128];
      nm = 'creme';
    } else {
      base = [164, 72, 38];
      nm = 'vermelho';
    }
  }
  const w = [0.03, 0.5, 0.82][ns],
    pat = ns === 0 ? 'sólido' : ns === 1 ? 'malhado' : 'quase branco';
  return {
    base,
    black,
    dil,
    choc,
    w,
    roan,
    brin,
    nm: nm + (brin ? ' tigrado' : '') + (roan ? ' ruão' : '') + ' ' + pat,
  };
}

function cN(x, y, s) {
  x /= s;
  y /= s;
  const xi = Math.floor(x),
    yi = Math.floor(y),
    fx = x - xi,
    fy = y - yi,
    u = fx * fx * (3 - 2 * fx),
    v = fy * fy * (3 - 2 * fy);
  const h = (a, b) => {
    let n = (a * 374761393 + b * 668265263 + s * 2246822519) | 0;
    n = ((n ^ (n >>> 13)) * 1274126177) | 0;
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };
  return (h(xi, yi) * (1 - u) + h(xi + 1, yi) * u) * (1 - v) + (h(xi, yi + 1) * (1 - u) + h(xi + 1, yi + 1) * u) * v;
}

function coatSheet(c) {
  const ct = coatOf(c),
    g = bGenes(c),
    P = g.pat,
    tint = bPh(c).tint,
    old = (c.age || 0) > bLife(c) * 0.7;
  const key = [ct.base.join(','), ct.w, ct.roan ? 1 : 0, ct.brin ? 1 : 0, P.k, Math.round(tint * 8), old ? 1 : 0].join(
    '|',
  );
  if (COAT_CACHE[key]) return COAT_CACHE[key];
  const src = COW_IMG;
  if (!src.naturalWidth) return src;
  const W = src.naturalWidth,
    H = src.naturalHeight,
    cv2 = document.createElement('canvas');
  cv2.width = W;
  cv2.height = H;
  const x2 = cv2.getContext('2d');
  x2.drawImage(src, 0, 0);
  const d = x2.getImageData(0, 0, W, H),
    px = d.data,
    fw = COW_CW,
    fh = COW_CH,
    sd = P.k % 9973;
  const thr = 0.5 + (ct.w - 0.5) * 0.55,
    lt = 0.86 + 0.28 * tint;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (!px[i + 3]) continue;
      const r = px[i],
        gg = px[i + 1],
        b = px[i + 2],
        L = r * 0.3 + gg * 0.59 + b * 0.11;
      if (r > 190 && r - gg > 40 && r - b > 35) continue; // focinho rosado
      if (L < 62) continue; // contorno / olhos / cascos
      const row = Math.floor(y / fh),
        lx0 = x % fw,
        ly = y % fh,
        lx = row === 2 || row === 5 ? fw - 1 - lx0 : lx0; // lados espelhados coerentes
      let n = 0.6 * cN(lx, ly, P.sc + (sd % 3) * 0.01 + 0.5) + 0.4 * cN(lx + 40, ly + 17, P.sc * 0.5 + 0.4);
      let white = ct.w <= 0.03 ? false : n < thr;
      if (ct.w > 0.8) white = n < thr;
      const dd = (a, b, r) => Math.hypot(lx - a, ly - b) < r;
      if (P.n >= 1 && dd(P.bx, P.by, P.br * (ct.w < 0.1 ? 1 : 0.6))) white = true; // sinais brancos aleatórios
      if (P.n >= 2 && dd(P.bx2, P.by2, P.br2)) white = true;
      if (P.sock && ly >= fh - 6 && cN(lx, ly, 2.5) < 0.62) white = true;
      if (P.dk && n > 0.7 && n < 0.76 && ct.w > 0.4) white = false;
      let sh = L >= 150 ? L / 236 : L / 105;
      sh = bClamp(sh, 0.55, 1.12);
      let col;
      if (white) {
        col = [246, 240, 228];
        if (ct.w > 0.8 && cN(lx * 3, ly * 3, 2) > 0.8) col = ct.base;
      } else {
        col = ct.base;
        if (ct.brin) {
          const st = Math.sin(lx * 0.9 + ly * 1.3 + cN(lx, ly, 3) * 5);
          if (st > 0.35) col = col.map((v) => v * 0.55);
        }
        if (ct.roan && cN(lx * 7 + 11, ly * 7 + 3, 1.7) > 0.45)
          col = [
            Math.min(255, col[0] * 0.4 + 170),
            Math.min(255, col[1] * 0.4 + 168),
            Math.min(255, col[2] * 0.4 + 162),
          ];
      }
      const f = white ? 1 : lt;
      let R = col[0] * sh * f,
        G = col[1] * sh * f,
        B = col[2] * sh * f;
      if (old) {
        R = R * 0.7 + 95;
        G = G * 0.7 + 95;
        B = B * 0.7 + 98;
        R *= 0.9;
        G *= 0.9;
        B *= 0.9;
      }
      px[i] = bClamp(R, 0, 255);
      px[i + 1] = bClamp(G, 0, 255);
      px[i + 2] = bClamp(B, 0, 255);
    }
  x2.putImageData(d, 0, 0);
  if (++COAT_N > 60) {
    for (const k in COAT_CACHE) delete COAT_CACHE[k];
    COAT_N = 1;
  }
  return (COAT_CACHE[key] = cv2);
}

function bImg(c) {
  return coatSheet(c);
}

function bTick(c, dt) {
  c._dg = (c._dg == null ? rr(20, 40) : c._dg) - dt;
  if (c._dg <= 0) {
    c._dg = rr(30, 60);
    const ti = Math.floor(c.y / TS) * MW + Math.floor(c.x / TS);
    if (ti >= 0 && ti < HN && ground[ti] !== WATER) om[ti] = Math.min(1, om[ti] + 0.06);
  } // esterco = matéria orgânica
  const L = bLife(c),
    a = c.age || 0,
    p = bPh(c),
    st = bStage(c);
  c.lifeF = p.spd * (a > L * 0.7 ? Math.max(0.55, 1 - ((a - L * 0.7) / (L * 0.3)) * 0.45) : 1); // senescência: movimento mais lento
  if (c._st && c._st !== st) {
    if (st === 'adulto') toast('🌱 ' + (c.name || 'Um animal') + ' atingiu a maturidade sexual');
    else if (st === 'idoso') toast('👴 ' + (c.name || 'Um animal') + ' entrou em senescência');
  }
  c._st = st;
  if (cbIn(c.x, c.y)) c.lifeF *= 1.18;
  if (a >= L && herd.length > 1 && !c.dead) {
    c.dead = true;
    toast('🕊️ ' + (c.name || 'Um animal') + ' morreu de velhice');
  }
}

function bReap() {
  for (let k = herd.length - 1; k >= 0; k--) {
    const c = herd[k];
    if (!c.dead) continue;
    cowDeadAdd(c);
    if (gest && gest.mom === c) setGest(null);
    const tx = Math.floor(c.x / TS),
      ty = Math.floor(c.y / TS); // matéria volta ao ecossistema: solo mais fértil
    for (const [ox, oy, w] of [
      [0, 0, 0.3],
      [1, 0, 0.1],
      [-1, 0, 0.1],
      [0, 1, 0.1],
      [0, -1, 0.1],
    ]) {
      const i = (ty + oy) * MW + tx + ox;
      if (i >= 0 && i < HN) om[i] = Math.min(1, om[i] + w * 2);
    }
    if (k === 0) {
      const nx = herd[1];
      for (const key of Object.keys(c)) delete c[key];
      Object.assign(c, nx);
      herd.splice(1, 1);
      if (gest) {
        if (gest.mom === nx) gest.mom = c;
        if (gest.dad === nx) gest.dad = c;
      }
    } // herd[0] é o objeto "cow": herda o próximo animal
    else herd.splice(k, 1);
  }
}

export { bCross, bFert, bGrow, bImg, bPh, bReap, bStage, bTick, coatOf, newPat };
