/**
 * Pesca: espécies e raridades, peixes nadando vistos de cima, fisgada e cartão do peixe.
 *
 * Origem: Vale_do_Campo_V64.html (s07)
 */

import { MH, MW, TS, VH, VW, WATER } from '../config/constants.js';
import { S } from '../core/GameState.js';
import { fauna } from '../entities/wild/Fauna.js';
import { ctx } from '../rendering/Canvas.js';
import { rr } from '../utils/Random.js';
import { FV } from '../world/hydrology/Fluvial.js';
import { flowAt, FQX, FQY } from '../world/hydrology/RiverFlow.js';
import { wImpulse } from '../world/WaterSystem.js';
import { ground } from '../world/World.js';

/* Sistema de pesca (estilo Stardew Valley) */
const FSP = [
  {
    k: 'lambari',
    n: 'Lambari',
    rar: 0,
    len: 9,
    body: '#b9c8d0',
    back: '#7f97a6',
    belly: '#eef3f5',
    fin: '#8aa0ad',
    spd: 16,
    price: 12,
    cm: [8, 12],
  },
  {
    k: 'tilapia',
    n: 'Tilápia',
    rar: 0,
    len: 11,
    body: '#8fae8e',
    back: '#5f7f63',
    belly: '#d3dfc8',
    fin: '#6f8f73',
    spd: 13,
    price: 16,
    cm: [18, 30],
    pat: 'stripe',
    stripe: '#6b8a6c',
  },
  {
    k: 'carpa',
    n: 'Carpa',
    rar: 1,
    len: 14,
    body: '#d9923f',
    back: '#a8641f',
    belly: '#f2cf8a',
    fin: '#c47a2a',
    spd: 11,
    price: 40,
    cm: [35, 60],
  },
  {
    k: 'truta',
    n: 'Truta',
    rar: 1,
    len: 13,
    body: '#8fb87a',
    back: '#5c8a5b',
    belly: '#f0e6c0',
    fin: '#7aa56d',
    spd: 15,
    price: 46,
    pat: 'spots',
    spot: '#d94f5a',
    cm: [25, 45],
  },
  {
    k: 'dourado',
    n: 'Dourado',
    rar: 2,
    len: 16,
    body: '#f0b429',
    back: '#c98a14',
    belly: '#fff0a8',
    fin: '#e89a1a',
    spd: 14,
    price: 105,
    pat: 'stripe',
    stripe: '#ffd75e',
    cm: [40, 70],
  },
  {
    k: 'salmao',
    n: 'Salmão',
    rar: 2,
    len: 17,
    body: '#f08a78',
    back: '#a85a5a',
    belly: '#ffd6c8',
    fin: '#d9695c',
    spd: 15,
    price: 120,
    cm: [60, 90],
  },
  {
    k: 'pirarucu',
    n: 'Pirarucu rubro',
    rar: 3,
    len: 22,
    body: '#c0463c',
    back: '#6e2a3a',
    belly: '#f0b09a',
    fin: '#8e2f3a',
    spd: 12,
    price: 260,
    pat: 'spots',
    spot: '#ffd0a0',
    cm: [120, 180],
  },
  {
    k: 'leviata',
    n: 'Leviatã do Vale',
    rar: 4,
    len: 44,
    body: '#5a8fe0',
    back: '#2a3f8f',
    belly: '#bfe6ff',
    fin: '#7a5ae0',
    spd: 8,
    price: 1500,
    pat: 'glow',
    glow: '#7ff5ff',
    spot: '#ffd75e',
    cm: [300, 450],
  },
];

const FRN = ['Comum', 'Incomum', 'Raro', 'Épico', 'Mítico'],
  FRC = ['#d5dde2', '#7be08a', '#62b0ff', '#c98aff', '#ffd23f'],
  FRW = [60, 22, 12, 5, 1];

function fishSprites(sp) {
  if (sp.fr) return sp.fr;
  const L = sp.len,
    H = Math.max(4, Math.round(L * 0.38)),
    W = L + 4,
    Hh = H + 10,
    cy = Hh >> 1,
    tl = Math.max(2, Math.round(L * 0.24)),
    bl = L - tl;
  sp.fr = [];
  sp.W = W;
  sp.H = Hh;
  for (const wag of [-1, 0, 1, 0]) {
    const g = Array.from({ length: Hh }, () => Array(W).fill(null)),
      tops = [];
    let sd = sp.k.length * 7 + 3;
    const rnd = () => (sd = (sd * 9301 + 49297) % 233280) / 233280;
    for (let x = 0; x < L; x++) {
      let hb,
        off = 0;
      if (x < tl) {
        const u = (tl - x) / tl;
        hb = 1 + u * H * 0.5;
        off = Math.round(wag * u * 1.5);
      } else {
        const t = (x - tl) / bl;
        hb = (H / 2) * (t < 0.55 ? 0.5 + 0.5 * (t / 0.55) : 1 - ((t - 0.55) / 0.45) * 0.7);
        hb = Math.max(0.9, hb);
      }
      const top = Math.round(cy + off - hb),
        bot = Math.round(cy + off + hb);
      tops[x] = top;
      for (let y = top; y <= bot; y++) {
        let c;
        if (x < tl) c = sp.fin;
        else {
          const d = (y - (cy + off)) / hb;
          c = d > 0.38 ? sp.belly : d < -0.45 ? sp.back : sp.body;
        }
        g[y][x + 2] = c;
      }
      if (x >= tl && sp.pat === 'stripe') g[cy][x + 2] = sp.stripe;
      if (x >= tl && sp.pat === 'spots' && rnd() < 0.16)
        g[Math.max(top + 1, Math.min(bot - 1, cy - 1 + ((rnd() * 3) | 0)))][x + 2] = sp.spot;
      if (x >= tl && sp.pat === 'glow') {
        if (x % 4 === 0) g[top + 1][x + 2] = sp.glow;
        if (x % 6 === 2) g[cy][x + 2] = sp.spot;
      }
    }
    const fh = L >= 14 ? 3 : 2;
    for (let x = tl + Math.round(bl * 0.3); x <= tl + Math.round(bl * 0.58); x++) {
      const t = tops[x];
      for (let k = 1; k <= fh - (x % 2 ? 1 : 0); k++) g[t - k][x + 2] = sp.fin;
    }
    const px = tl + Math.round(bl * 0.42),
      bt = cy + Math.round(H * 0.5);
    for (let k = 0; k < 2; k++)
      if (g[bt + k]) {
        g[bt + k][px + 2] = sp.fin;
        g[bt + k][px + 3] = sp.fin;
      }
    if (sp.pat === 'glow') {
      for (let k = 1; k <= 4; k++) {
        g[tops[tl + Math.round(bl * 0.2)] - k][tl + Math.round(bl * 0.2) + 2] = sp.glow;
        g[tops[tl + Math.round(bl * 0.45)] - k - 1][tl + Math.round(bl * 0.45) + 2] = sp.glow;
      }
    }
    const ex = tl + Math.round(bl * 0.82) + 2,
      ey = cy - Math.round(H * 0.12);
    g[ey][ex] = '#101820';
    if (L >= 14) {
      g[ey][ex - 1] = '#fdfdfd';
    }
    const gx = tl + Math.round(bl * 0.7) + 2;
    for (let y = 0; y < Hh; y++) if (g[y][gx] && y > cy - H * 0.45 && y < cy + H * 0.45) g[y][gx] = sp.back;
    const o = [];
    for (let y = 0; y < Hh; y++)
      for (let x = 0; x < W; x++)
        if (!g[y][x]) {
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ]) {
            const v = (g[y + dy] || [])[x + dx];
            if (v) {
              o.push([x, y]);
              break;
            }
          }
        }
    const mk = () => {
        const c = document.createElement('canvas');
        c.width = W;
        c.height = Hh;
        return c;
      },
      c = mk(),
      x2 = c.getContext('2d');
    for (let y = 0; y < Hh; y++)
      for (let x = 0; x < W; x++)
        if (g[y][x]) {
          x2.fillStyle = g[y][x];
          x2.fillRect(x, y, 1, 1);
        }
    x2.fillStyle = '#14232e';
    for (const [x, y] of o) x2.fillRect(x, y, 1, 1);
    const u = mk(),
      ux = u.getContext('2d');
    ux.drawImage(c, 0, 0);
    ux.globalCompositeOperation = 'source-atop';
    ux.fillStyle = 'rgba(30,110,170,.30)';
    ux.fillRect(0, 0, W, Hh);
    const sh = mk(),
      sx = sh.getContext('2d');
    sx.drawImage(c, 0, 0);
    sx.globalCompositeOperation = 'source-in';
    sx.fillStyle = '#05141f';
    sx.fillRect(0, 0, W, Hh);
    sp.fr.push({ c, u, sh });
  }
  return sp.fr;
}

/* ===== Peixes em vista de cima (corpo simétrico, nadadeiras peitorais, olhos dos dois lados) ===== */
function fishTopSprites(sp) {
  if (sp.td) return sp.td;
  const L = sp.len,
    H = Math.max(4, Math.round(L * 0.38)),
    W = L + 4,
    Hh = H + 10,
    cy = Hh >> 1,
    tl = Math.max(2, Math.round(L * 0.24)),
    bl = L - tl;
  sp.td = [];
  for (const wag of [-1, 0, 1, 0]) {
    const g = Array.from({ length: Hh }, () => Array(W).fill(null));
    let sd = sp.k.length * 7 + 3;
    const rnd = () => (sd = (sd * 9301 + 49297) % 233280) / 233280;
    const put = (x, y, c) => {
        if (y >= 0 && y < Hh && x >= 0 && x < W) g[y][x] = c;
      },
      hwA = [],
      ofA = [];
    for (let x = 0; x < L; x++) {
      let hw,
        off = 0;
      if (x < tl) {
        const u = (tl - x) / tl;
        hw = 0.7 + u * H * 0.42;
        off = wag * u * 1.6;
      } else {
        const t = (x - tl) / bl,
          p =
            t < 0.6
              ? 0.45 + 0.55 * Math.sin(((t / 0.6) * Math.PI) / 2)
              : 0.25 + 0.75 * Math.cos((((t - 0.6) / 0.4) * Math.PI) / 2);
        hw = Math.max(0.9, (H / 2) * 0.85 * p);
        off = wag * 0.35 * (1 - t);
      }
      hwA[x] = hw;
      ofA[x] = off;
      const top = Math.round(cy + off - hw),
        bot = Math.round(cy + off + hw);
      for (let y = top; y <= bot; y++) {
        let c;
        if (x < tl) c = sp.fin;
        else {
          const d = Math.abs((y - (cy + off)) / hw);
          c = d < 0.4 ? sp.back : d > 0.85 ? sp.belly : sp.body;
        }
        put(x + 2, y, c);
      }
      if (x >= tl) {
        const yc = Math.round(cy + off);
        if (sp.pat === 'stripe') put(x + 2, yc, sp.stripe);
        if (sp.pat === 'spots' && rnd() < 0.2) {
          const dy = ((rnd() * 3) | 0) - 1,
            sg = rnd() < 0.5 ? -1 : 1;
          put(x + 2, yc + sg * Math.max(0, Math.round(hw * 0.5)) + dy * 0, sp.spot);
        }
        if (sp.pat === 'glow') {
          if (x % 4 === 0) put(x + 2, yc, sp.glow);
          if (x % 6 === 2) {
            put(x + 2, yc - Math.round(hw * 0.55), sp.spot);
            put(x + 2, yc + Math.round(hw * 0.55), sp.spot);
          }
        }
      }
    }
    const fin = (fx, len) => {
      const x = tl + Math.round(bl * fx),
        hw = hwA[x],
        o = ofA[x];
      for (let k = 0; k < len; k++) {
        put(x - k + 2, Math.round(cy + o - hw) - 1 - k, sp.fin);
        put(x - k + 2, Math.round(cy + o + hw) + 1 + k, sp.fin);
      }
    };
    fin(0.58, 3);
    fin(0.28, 2);
    const ex = tl + Math.round(bl * 0.84),
      eh = Math.max(1, Math.round(hwA[ex] * 0.55));
    put(ex + 2, Math.round(cy + ofA[ex] - eh), '#101820');
    put(ex + 2, Math.round(cy + ofA[ex] + eh), '#101820');
    const o = [];
    for (let y = 0; y < Hh; y++)
      for (let x = 0; x < W; x++)
        if (!g[y][x]) {
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ]) {
            const v = (g[y + dy] || [])[x + dx];
            if (v) {
              o.push([x, y]);
              break;
            }
          }
        }
    const mk = () => {
        const c = document.createElement('canvas');
        c.width = W;
        c.height = Hh;
        return c;
      },
      c = mk(),
      x2 = c.getContext('2d');
    for (let y = 0; y < Hh; y++)
      for (let x = 0; x < W; x++)
        if (g[y][x]) {
          x2.fillStyle = g[y][x];
          x2.fillRect(x, y, 1, 1);
        }
    x2.fillStyle = '#14232e';
    for (const [x, y] of o) x2.fillRect(x, y, 1, 1);
    const u = mk(),
      ux = u.getContext('2d');
    ux.drawImage(c, 0, 0);
    ux.globalCompositeOperation = 'source-atop';
    ux.fillStyle = 'rgba(30,110,170,.30)';
    ux.fillRect(0, 0, W, Hh);
    const sh = mk(),
      sx = sh.getContext('2d');
    sx.drawImage(c, 0, 0);
    sx.globalCompositeOperation = 'source-in';
    sx.fillStyle = '#05141f';
    sx.fillRect(0, 0, W, Hh);
    sp.td.push({ c, u, sh });
  }
  return sp.td;
}

function fRoll() {
  let r = Math.random() * 100,
    t = 0,
    ri = 4;
  for (let i = 0; i < 5; i++) {
    t += FRW[i];
    if (r < t) {
      ri = i;
      break;
    }
  }
  const l = FSP.filter((s) => s.rar === ri);
  return l[(Math.random() * l.length) | 0];
}

const FISH = [],
  FS = {
    st: null,
    t: 0,
    dir: 'Down',
    flip: false,
    hold: false,
    fish: null,
    bx: 0,
    by: 0,
    tx: 0,
    ty: 0,
    cx: 0,
    cy: 0,
    biteT: 0,
    sacc: 0,
    nl: 0,
    init: 0,
    lastCard: 0,
  };

function isW(x, y) {
  const tx = Math.floor(x / TS),
    ty = Math.floor(y / TS);
  return tx >= 0 && ty >= 0 && tx < MW && ty < MH && ground[ty * MW + tx] === WATER;
}

function wOK(x, y, r) {
  return isW(x, y) && isW(x + r, y) && isW(x - r, y) && isW(x, y + r) && isW(x, y - r);
}

const angD = (a, b) => {
  let d = b - a;
  while (d > Math.PI) d -= 6.283;
  while (d < -Math.PI) d += 6.283;
  return d;
};

let fishWT = [],
  fishWTt = -99,
  fishAcc = 0;

function fishWaterList() {
  const now = performance.now() / 1000;
  if (now - fishWTt > 40) {
    fishWTt = now;
    fishWT = [];
    for (let ty = 3; ty < MH - 3; ty += 2)
      for (let tx = 3; tx < MW - 3; tx += 2) {
        const x = tx * TS + 8,
          y = ty * TS + 8;
        if (wOK(x, y, 6)) fishWT.push([x, y]);
      }
  }
  return fishWT;
}

function fSpawn() {
  const L = fishWaterList();
  if (!L.length) return;
  if (Math.random() < FV.silt * 0.8) return; // rio barrento tem menos peixe
  if (FISH.length >= Math.min(18, Math.max(0, Math.floor(L.length / 8)))) return;
  for (let k = 0; k < 8; k++) {
    const q = L[(Math.random() * L.length) | 0];
    let sp = fRoll();
    if (sp.rar === 4 && FISH.some((f) => f.sp.rar === 4)) sp = FSP[(Math.random() * 2) | 0];
    const x = q[0] + rr(-8, 8),
      y = q[1] + rr(-8, 8),
      r = sp.rar === 4 ? 22 : Math.max(5, sp.len * 0.55);
    if (!wOK(x, y, r)) continue;
    if (!S.inside && Math.hypot(x - S.px, y - S.py) < 45) continue;
    FISH.push({
      sp,
      x,
      y,
      ang: Math.random() * 6.283,
      tang: 0,
      t: 0,
      st: 'wander',
      ph: Math.random() * 9,
      fl: 0,
      nt: null,
    });
    return;
  }
}

function fishFear(f) {
  let best = null; // peixes desviam do jogador e das onças
  if (!S.inside) {
    const d = Math.hypot(S.px - f.x, S.py - f.y);
    if (d < (S.mv ? 46 : 30)) best = { x: S.px, y: S.py, d };
  }
  for (const a of fauna) {
    if (a.sp !== 'jaguar' || a.state === 'dead') continue;
    const crouch = a.state === 'watch' || (a.state === 'go' && a.after === 'angle'),
      d = Math.hypot(a.x - f.x, a.y - f.y),
      R = a.state === 'dive' ? 70 : crouch ? 20 : a.sw ? 38 : 26;
    if (d < R && (!best || d < best.d)) best = { x: a.x, y: a.y, d, jd: a.state === 'dive' };
  }
  return best;
}

function fMove(f, dt) {
  const sp = f.sp;
  let spd = sp.spd * (0.55 + 0.45 * Math.sin((performance.now() / 1000) * 0.7 + f.ph));
  let th = fishFear(f);
  if (th && th.jd) {
    if (f.nt == null) f.nt = Math.random() < 0.45;
    if (!f.nt) th = null;
  } else if (!th) f.nt = null; // só parte dos peixes percebe o bote a tempo
  if (th && f.st !== 'flee') {
    f.st = 'flee';
    f.fl = 1.1 + Math.random() * 1.3;
    f.tang = Math.atan2(f.y - th.y, f.x - th.x) + rr(-0.5, 0.5);
    if (Math.random() < 0.8) wImpulse(f.x, f.y, -0.5, 2);
  }
  if (f.st === 'flee') {
    f.fl -= dt;
    spd *= 2.8;
    if (f.fl <= 0) {
      f.st = 'wander';
      f.nt = null;
    }
  } else {
    f.t -= dt;
    if (f.t <= 0) {
      f.tang = f.ang + rr(-1.2, 1.2);
      f.t = 1.5 + Math.random() * 2.5;
      const m = flowAt(f.x, f.y);
      if (m > 5 && Math.random() < 0.75) f.tang = Math.atan2(-FQY, -FQX) + rr(-0.6, 0.6);
    }
  } // peixes encaram a correnteza (reotaxia)
  const tr = f.st === 'flee' ? 6 : 2.4,
    da = angD(f.ang, f.tang);
  f.ang += Math.max(-dt * tr, Math.min(dt * tr, da));
  {
    const m = flowAt(f.x, f.y);
    if (m > 1) {
      const ddx = FQX * 0.1 * dt,
        ddy = FQY * 0.1 * dt;
      if (isW(f.x + ddx, f.y + ddy)) {
        f.x += ddx;
        f.y += ddy;
      }
    }
  } // a água arrasta o peixe
  if (spd > 0) {
    const nx = f.x + Math.cos(f.ang) * spd * dt,
      ny = f.y + Math.sin(f.ang) * spd * dt,
      r = Math.max(4, sp.len * 0.45),
      nox = nx + Math.cos(f.ang) * r,
      noy = ny + Math.sin(f.ang) * r;
    if (isW(nx, ny) && isW(nox, noy)) {
      f.x = nx;
      f.y = ny;
    } else {
      f.ang += 2.2 * (Math.random() < 0.5 ? 1 : -1);
      f.tang = f.ang;
      f.t = 1;
    }
  }
}

function fishUpd(dt) {
  if (S.inside) return;
  fishAcc += dt;
  if (!FS.init) {
    FS.init = 1;
    for (let i = 0; i < 16; i++) fSpawn();
  }
  if (fishAcc > 20) {
    fishAcc = 0;
    fSpawn();
  }
  for (const f of FISH) fMove(f, dt);
}

function fishFrame() {
  return 0;
}

function drawFish(f) {
  const fr = fishTopSprites(f.sp)[Math.floor((performance.now() / 1000) * (f.st === 'flee' ? 10 : 5) + f.ph) % 4],
    a = Math.round(f.ang / 0.3927) * 0.3927;
  ctx.save();
  ctx.translate(Math.round(f.x) + 2, Math.round(f.y) + 4);
  ctx.rotate(a);
  ctx.globalAlpha = 0.28;
  ctx.drawImage(fr.sh, -fr.sh.width / 2, -fr.sh.height / 2);
  ctx.restore(); // sombra no fundo
  ctx.save();
  ctx.translate(Math.round(f.x), Math.round(f.y));
  ctx.rotate(a);
  ctx.globalAlpha = 1;
  ctx.drawImage(fr.u, -fr.u.width / 2, -fr.u.height / 2);
  if (f.sp.rar >= 3) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.12 + 0.06 * Math.sin(performance.now() / 300 + f.ph);
    ctx.drawImage(fr.c, -fr.c.width / 2, -fr.c.height / 2);
  }
  ctx.restore();
}

function fishDrawEnts(ents, cx, cy) {
  if (S.inside) return;
  for (const f of FISH) {
    if (f.x < cx - 50 || f.x > cx + VW + 50 || f.y < cy - 50 || f.y > cy + VH + 50) continue;
    ents.push({ k: -1e6, sh: [f.x, f.y, 1, 1], draw: () => drawFish(f) });
  }
}

/** Atualiza `fishWTt` a partir de outros módulos (as ligações importadas são somente leitura). */
export function setFishWTt(value) {
  fishWTt = value;
  return value;
}

export { FISH, FS, fishDrawEnts, fishFrame, fishUpd, fishWTt, isW };
