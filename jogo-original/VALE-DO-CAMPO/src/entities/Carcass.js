/**
 * Carcaças: animais mortos se decompõem, atraem carniceiros e insetos, deixam manchas de nutrientes no solo.
 *
 * Origem: Vale_do_Campo_V64.html (s04)
 */

import { GRASS, HN, MW, TS, VH, VW, WATER } from '../config/constants.js';
import { S } from '../core/GameState.js';
import { herd } from './cow/Herd.js';
import { faGo, faRow, fauna } from './wild/Fauna.js';
import { ctx } from '../rendering/Canvas.js';
import { getAC } from '../systems/audio/AudioSystem.js';
import { toast } from '../ui/Toast.js';
import { mato, nut, om } from '../world/hydrology/Hydrology.js';
import { ground } from '../world/World.js';

/* Decomposição e Revitalização Ambiental */
const CARC = [],
  ZONES = [],
  FA_LF = { deer: 1.2, hare: 0.6, grouse: 0.7, fox: 1, boar: 1.2, jaguar: 1.7, anaconda: 4, harpy: 8 },
  FA_NM = {
    deer: 'Um cervo',
    hare: 'Uma lebre',
    grouse: 'Um galo-lira',
    fox: 'Uma raposa',
    boar: 'Uma queixada',
    anaconda: 'Uma sucuri',
    jaguar: 'Uma onça-pintada',
    harpy: 'Uma harpia',
  };

let cbSpd = 1,
  cbToast = 0,
  cbAcc = 0;

function carcT(x, y) {
  let n = 0;
  for (const a of fauna) if (a.state === 'dead' && Math.hypot(a.x - x, a.y - y) < 150) n++;
  for (const c of CARC) if (Math.hypot(c.x - x, c.y - y) < 150) n++;
  return n >= 5 ? 3 : 60;
} // >5 cadáveres: pula a decomposição lenta

function faDie(a) {
  a.state = 'dead';
  a.d0 = performance.now() / 1000;
  a.z = 0;
  a.row = faRow(a);
  a.t = carcT(a.x, a.y);
  if (Math.hypot(S.px - a.x, S.py - a.y) < 260)
    toast('🕊️ ' + (FA_NM[a.sp] || 'Um animal') + ' morreu de ' + (a.cause || 'velhice'));
}

function cowDeadAdd(c) {
  CARC.push({
    x: c.x,
    y: c.y,
    t: carcT(c.x, c.y),
    tot: 12,
    cow: 1,
    sz: c.calf ? 0.6 : 1,
    dir: c.dir > Math.PI / 2 || c.dir < -Math.PI / 2 ? -1 : 1,
  });
}

/** Galinha morta por um predador: penas e o corpinho no chão (some depressa e devolve matéria ao solo como as outras carcaças). */
function chxDeadAdd(c) {
  CARC.push({ x: c.x, y: c.y, t: carcT(c.x, c.y) * 0.5, tot: 6, chk: 1, sz: 0.6, dir: c.dir < 0 ? -1 : 1, col: c.color || 'branca' });
}

function carcassDone(x, y) {
  let z = null;
  for (const q of ZONES)
    if (Math.hypot(q.x - x, q.y - y) < 26) {
      z = q;
      break;
    }
  const day = S.day + S.min / 1080;
  if (z) {
    z.day = day;
    z.bl = 2.5;
    z.r = Math.min(46, z.r + 4);
    addProps(z, 4);
  } else {
    z = { x, y, r: 30, day, g: 0, bl: 2.5, props: [], ph: Math.random() * 9 };
    addProps(z, 9);
    ZONES.push(z);
    if (ZONES.length > 40) ZONES.shift();
  }
  const tx = Math.floor(x / TS),
    ty = Math.floor(y / TS); // solo extremamente fértil
  for (let oy = -2; oy <= 2; oy++)
    for (let ox = -2; ox <= 2; ox++) {
      const i = (ty + oy) * MW + tx + ox;
      if (i < 0 || i >= HN || ground[i] === WATER) continue;
      const w = 1 - Math.hypot(ox, oy) / 3.2;
      if (w <= 0) continue;
      om[i] = Math.min(1, om[i] + 0.5 * w);
      nut[i] = Math.min(1, nut[i] + 0.4 * w);
      if (ground[i] === GRASS) mato[i] = Math.min(255, mato[i] + 140 * w);
    }
  const d = Math.hypot(S.px - x, S.py - y);
  if (d < 420) {
    try {
      const a = getAC();
      if (a) {
        const v = 0.05 * (1 - d / 420),
          t = a.currentTime;
        [784, 1175, 1568].forEach((f, i) => {
          const o = a.createOscillator(),
            g = a.createGain();
          o.type = 'sine';
          o.frequency.value = f;
          g.gain.setValueAtTime(0.0001, t + i * 0.18);
          g.gain.linearRampToValueAtTime(v, t + i * 0.18 + 0.05);
          g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.18 + 2.2);
          o.connect(g).connect(a.destination);
          o.start(t + i * 0.18);
          o.stop(t + i * 0.18 + 2.3);
        });
      }
    } catch (e) {}
  }
}

function addProps(z, n) {
  for (let i = 0; i < n; i++) {
    const an = Math.random() * 6.283,
      r = Math.sqrt(Math.random()) * z.r * 0.9;
    z.props.push({
      dx: Math.cos(an) * r,
      dy: Math.sin(an) * r * 0.6,
      ty: (Math.random() * 3) | 0,
      h: 5 + Math.random() * 5,
      c: (Math.random() * 4) | 0,
      p: Math.random() * 6.28,
    });
  }
  if (z.props.length > 26) z.props.splice(0, z.props.length - 26);
}

function cbIn(x, y) {
  for (const z of ZONES) if (z.g > 0.6 && Math.hypot(x - z.x, (y - z.y) / 0.6) < z.r) return true;
  return false;
}

function carcUpd(dt) {
  cbAcc += dt;
  for (let i = CARC.length - 1; i >= 0; i--) {
    const c = CARC[i];
    c.t -= dt;
    if (c.t <= 0) {
      carcassDone(c.x, c.y);
      CARC.splice(i, 1);
    }
  }
  for (let i = ZONES.length - 1; i >= 0; i--) {
    const z = ZONES[i];
    z.g = Math.min(1, z.g + dt / 3);
    if (z.bl > 0) z.bl -= dt;
    if (S.day + S.min / 1080 - z.day >= 2) ZONES.splice(i, 1);
  } // dura ~2 dias de jogo
  if (cbAcc < 0.5) return;
  const d = cbAcc;
  cbAcc = 0;
  const inP = !S.inside && cbIn(S.px, S.py);
  cbSpd = inP ? 1.15 : 1;
  if (inP) {
    S.energy = Math.min(100, S.energy + d * 1.2);
    if (performance.now() - cbToast > 45000) {
      cbToast = performance.now();
      toast('✨ Solo fértil: energia regenera e você anda mais rápido');
    }
  }
  for (const c of herd)
    if (cbIn(c.x, c.y)) {
      c.hunger = Math.max(0, c.hunger - d * 0.03);
      c.thirst = Math.max(0, (c.thirst || 0) - d * 0.01);
    }
  for (const a of fauna) {
    if (a.state === 'dead') continue;
    if ((a.sp === 'deer' || a.sp === 'hare') && cbIn(a.x, a.y)) {
      a.hun = Math.max(0, a.hun - d * 0.03);
      a.stam = 1;
    }
    if (a.sp === 'fox' && a.state === 'idle' && a.hun > 0.5 && a.cd <= 0) {
      for (const q of fauna)
        if (q.state === 'dead' && q.t > 3 && Math.hypot(q.x - a.x, q.y - a.y) < 220) {
          faGo(a, q.x, q.y, 45, 'idle', 3);
          a.cd = 25;
          a.hun = Math.max(0, a.hun - 0.3);
          break;
        }
    }
  }
} // necrófagos atraídos

function carcassFx(x, y, t) {
  const n = performance.now() / 1000;
  ctx.save();
  for (let i = 0; i < 5; i++) {
    const a = n * (2.5 + i * 0.7) + i * 1.9,
      r = 5 + i * 1.6;
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y - 8 + Math.sin(a * 1.3) * r * 0.6 - i), 1, 1);
  }
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 3; i++) {
    const p = (n * 0.5 + i / 3) % 1;
    ctx.fillStyle = 'rgba(150,255,120,' + 0.5 * (1 - p) + ')';
    ctx.fillRect(Math.round(x - 6 + i * 6 + Math.sin(n + i) * 2), Math.round(y - 4 - p * 14), 1, 1);
  }
  ctx.restore();
}

function drawCowCarc(c) {
  if (c.chk) return drawChkCarc(c);
  const k = c.t < 2 ? c.t / 2 : 1,
    s = c.sz;
  ctx.save();
  ctx.globalAlpha = k;
  ctx.translate(c.x, c.y + (1 - k) * 4);
  ctx.scale(c.dir * s, s);
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.beginPath();
  ctx.ellipse(0, 1, 12, 4, 0, 0, 6.283);
  ctx.fill();
  ctx.fillStyle = '#83533c';
  ctx.beginPath();
  ctx.ellipse(0, -3, 11, 5, 0, 0, 6.283);
  ctx.fill();
  ctx.fillStyle = '#fff2d8';
  ctx.fillRect(-4, -7, 5, 3);
  ctx.fillRect(3, -4, 4, 3);
  ctx.fillStyle = '#50372d';
  ctx.fillRect(-9, -9, 1, 5);
  ctx.fillRect(-5, -9, 1, 5);
  ctx.fillRect(5, -9, 1, 5);
  ctx.fillRect(9, -8, 1, 5);
  ctx.fillStyle = '#83533c';
  ctx.fillRect(10, -6, 5, 4);
  ctx.fillStyle = '#302b30';
  ctx.fillRect(13, -5, 1, 1);
  ctx.restore();
  if (c.t > 2) carcassFx(c.x, c.y, c.t);
}

const CB_COL = [
  ['#ff7ad9', '#fff2a8'],
  ['#7af0ff', '#ffffff'],
  ['#ffd75e', '#fff'],
  ['#b48cff', '#ffe0ff'],
];

function drawDecal(z) {
  const k = z.g * Math.min(1, (2 - (S.day + S.min / 1080 - z.day)) * 4 + 0.2);
  if (k <= 0) return;
  const n = performance.now() / 1000;
  ctx.save();
  ctx.globalAlpha = Math.min(1, k);
  let g = ctx.createRadialGradient(z.x, z.y, 2, z.x, z.y, z.r);
  g.addColorStop(0, 'rgba(45,28,18,.7)');
  g.addColorStop(0.6, 'rgba(60,40,24,.4)');
  g.addColorStop(1, 'rgba(60,40,24,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(z.x, z.y, z.r, z.r * 0.6, 0, 0, 6.283);
  ctx.fill();
  ctx.globalCompositeOperation = 'lighter';
  g = ctx.createRadialGradient(z.x, z.y, 0, z.x, z.y, z.r);
  g.addColorStop(0, 'rgba(120,255,150,' + (0.16 + 0.05 * Math.sin(n * 1.5 + z.ph)) + ')');
  g.addColorStop(1, 'rgba(120,255,150,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(z.x, z.y, z.r, z.r * 0.6, 0, 0, 6.283);
  ctx.fill();
  if (z.bl > 0) {
    const b = z.bl / 2.5,
      h = 46 * (1 - b * 0.3);
    g = ctx.createLinearGradient(0, z.y, 0, z.y - h);
    g.addColorStop(0, 'rgba(190,255,200,' + 0.55 * b + ')');
    g.addColorStop(1, 'rgba(190,255,200,0)');
    ctx.fillStyle = g;
    ctx.fillRect(z.x - 9, z.y - h, 18, h);
  }
  ctx.restore();
}

function drawProp(z, p) {
  const k = z.g * Math.min(1, (2 - (S.day + S.min / 1080 - z.day)) * 4 + 0.2);
  if (k <= 0) return;
  const n = performance.now() / 1000,
    x = Math.round(z.x + p.dx),
    y = Math.round(z.y + p.dy),
    h = Math.round(p.h * k),
    sw = Math.round(Math.sin(n * 1.6 + p.p) * 1.2);
  ctx.save();
  ctx.globalAlpha = Math.min(1, k);
  const col = CB_COL[p.c];
  if (p.ty === 0) {
    ctx.fillStyle = '#4fae48';
    ctx.fillRect(x + sw, y - h, 1, h);
    ctx.fillStyle = '#7fd45a';
    ctx.fillRect(x - 2 + (sw >> 1), y - h + 2, 1, h - 2);
    ctx.fillRect(x + 2 + sw, y - h + 1, 1, h - 1);
  } else if (p.ty === 1) {
    ctx.fillStyle = '#4fae48';
    ctx.fillRect(x, y - h, 1, h);
    ctx.fillStyle = col[0];
    ctx.fillRect(x - 1 + sw, y - h - 2, 3, 3);
    ctx.fillStyle = col[1];
    ctx.fillRect(x + sw, y - h - 1, 1, 1);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = col[0].replace('#', '#') + '33';
    ctx.beginPath();
    ctx.arc(x + sw, y - h - 1, 4, 0, 6.283);
    ctx.fill();
  } else {
    ctx.fillStyle = '#f4efe0';
    ctx.fillRect(x, y - Math.max(2, h >> 1), 1, Math.max(2, h >> 1));
    ctx.fillStyle = col[0];
    ctx.fillRect(x - 2, y - Math.max(2, h >> 1) - 2, 5, 2);
    ctx.fillStyle = col[1];
    ctx.fillRect(x - 1, y - Math.max(2, h >> 1) - 2, 1, 1);
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = col[0] + '30';
    ctx.beginPath();
    ctx.arc(x, y - 3, 5 + Math.sin(n * 2 + p.p), 0, 6.283);
    ctx.fill();
  }
  ctx.restore();
}

const CHK_CARC = { preta: '#4a4850', vermelha: '#b86a38', branca: '#f4f2ea' };
function drawChkCarc(c) {
  const k = c.t < 2 ? c.t / 2 : 1;
  ctx.save();
  ctx.globalAlpha = k;
  ctx.translate(Math.round(c.x), Math.round(c.y));
  ctx.fillStyle = 'rgba(0,0,0,.22)';
  ctx.beginPath();
  ctx.ellipse(0, 1, 6, 2.2, 0, 0, 6.283);
  ctx.fill();
  ctx.fillStyle = CHK_CARC[c.col] || CHK_CARC.branca; // corpo e penas espalhadas
  ctx.beginPath();
  ctx.ellipse(0, -1, 4.5, 2.6, 0, 0, 6.283);
  ctx.fill();
  ctx.fillRect(-7, 0, 2, 1);
  ctx.fillRect(5, -2, 2, 1);
  ctx.fillRect(-2, 2, 1, 1);
  ctx.fillStyle = '#9b2f2f';
  ctx.fillRect(c.dir * 4, -2, 1, 1);
  ctx.restore();
}

function carcDrawEnts(ents, cx, cy) {
  for (const c of CARC)
    if (c.x > cx - 40 && c.x < cx + VW + 40 && c.y > cy - 40 && c.y < cy + VH + 60)
      ents.push({ k: c.y, sh: [c.x, c.y, 1, 1], draw: () => drawCowCarc(c) });
  for (const z of ZONES) {
    if (z.x < cx - 60 || z.x > cx + VW + 60 || z.y < cy - 60 || z.y > cy + VH + 80) continue;
    ents.push({ k: z.y - 3000, sh: [z.x, z.y, 1, 1], draw: () => drawDecal(z) });
    for (const p of z.props)
      ents.push({ k: z.y + p.dy, sh: [z.x + p.dx, z.y + p.dy, 1, 1], draw: () => drawProp(z, p) });
  }
}

export { CARC, FA_LF, ZONES, carcDrawEnts, carcT, carcUpd, carcassDone, carcassFx, cbIn, cbSpd, chxDeadAdd, cowDeadAdd, faDie };
