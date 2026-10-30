/**
 * Galinhas: sprites recoloridos por genética (preta/vermelha/branca), rotina (ciscar, banho de terra, beber, fugir), hierarquia e caça a minhocas.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { lureDecision, lureSlot, LURE_REPATH_SEC, FOOD } from '../../config/animalFood.js';
import { CHICKEN, ECO } from '../../config/ecosystem.js';
import { dungTimer } from '../../config/feces.js';
import { dropFeces } from '../../world/Feces.js';
import { MH, MW, OX, OY, TS } from '../../config/constants.js';
import { extensible } from '../../core/extensions.js';
import { S, sleeping } from '../../core/GameState.js';
import { percTick, senseTarget } from '../ai/Perception.js';
import { findPath } from '../ai/Steering.js';
import { fox } from './FarmFoxes.js';
import { chxBreed, ninhos, setNinhos } from './Nests.js';
import { nearestWorm } from './Worms.js';
import { ctx } from '../../rendering/Canvas.js';
import { beep } from '../../systems/audio/AudioSystem.js';
import { solid } from '../../systems/CollisionSystem.js';
import { ITEMS } from '../../systems/InventorySystem.js';
import { toast } from '../../ui/Toast.js';
import { assetUrl } from '../../utils/assets.js';
import { nearestWater } from '../../world/World.js';

/* ============ GALINHAS (sprites próprios, genética de cor/sexo/porte/temperamento, rotina e ninhada) ============ */
const CHK_SHEETS = {
  idleL: assetUrl('sprites/animals/chicken/idleL.webp'),
  idleR: assetUrl('sprites/animals/chicken/idleR.webp'),
  runL: assetUrl('sprites/animals/chicken/runL.webp'),
  runR: assetUrl('sprites/animals/chicken/runR.webp'),
  eatL: assetUrl('sprites/animals/chicken/eatL.webp'),
  eatR: assetUrl('sprites/animals/chicken/eatR.webp'),
};

const CHK_IMG = {};

const CHK_TINT = { preta: [72, 70, 78], vermelha: [196, 110, 56], branca: [252, 250, 242] };

const CHK_CACHE = {};

function chxSprite(sheet, color) {
  const key = sheet + color;
  if (CHK_CACHE[key]) return CHK_CACHE[key];
  const im = CHK_IMG[sheet];
  if (!im || !im.complete || !im.naturalWidth) return null;
  const c = document.createElement('canvas');
  c.width = im.naturalWidth;
  c.height = im.naturalHeight;
  const x = c.getContext('2d');
  x.drawImage(im, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height),
    p = d.data,
    T = CHK_TINT[color] || CHK_TINT.branca;
  for (let i = 0; i < p.length; i += 4) {
    if (p[i + 3] < 8) continue;
    const r = p[i],
      g = p[i + 1],
      b = p[i + 2],
      mx = Math.max(r, g, b),
      mn = Math.min(r, g, b),
      lum = (r + g + b) / 3;
    if (lum > 110 && mx - mn < 45) {
      const k = lum / 200;
      p[i] = Math.min(255, T[0] * k);
      p[i + 1] = Math.min(255, T[1] * k);
      p[i + 2] = Math.min(255, T[2] * k);
    }
  } // só o corpo muda de cor; crista, bico e contorno ficam
  x.putImageData(d, 0, 0);
  return (CHK_CACHE[key] = c);
}

/* genética: N = preto (dominante), V = vermelha (dominante sobre branca), SZ = porte, TE = temperamento */
function chxGenesFounder() {
  const a = () => (Math.random() < 0.5 ? 'N' : 'n'),
    v = () => (Math.random() < 0.5 ? 'V' : 'v'),
    q = () => 0.85 + Math.random() * 0.3;
  return { N: [a(), a()], V: [v(), v()], SZ: [q(), q()], TE: [Math.random(), Math.random()] };
}

function chxCross(m, f) {
  const pick = (a, b) => [a[Math.random() < 0.5 ? 0 : 1], b[Math.random() < 0.5 ? 0 : 1]];
  return { N: pick(m.N, f.N), V: pick(m.V, f.V), SZ: pick(m.SZ, f.SZ), TE: pick(m.TE, f.TE) };
}

function chxPheno(c) {
  const g = c.g,
    color = g.N.includes('N') ? 'preta' : g.V.includes('V') ? 'vermelha' : 'branca';
  return { color, sz: (g.SZ[0] + g.SZ[1]) / 2, temp: (g.TE[0] + g.TE[1]) / 2 };
}

let chx = [],
  chxId = 1,
  chxDayLast = -1;

function mkChx(o) {
  return Object.assign(
    {
      id: chxId++,
      x: 0,
      y: 0,
      sex: 'f',
      age: 999,
      mom: -1,
      hunger: 80,
      thirst: 80,
      g: chxGenesFounder(),
      state: 'andar',
      t: 0,
      tx: 0,
      ty: 0,
      dir: 1,
    },
    o,
  );
}

function chxStart() {
  setNinhos([]);
  chx = [
    mkChx({ x: (18 + OX) * TS + 8, y: (20 + OY) * TS + 8, sex: 'm' }),
    mkChx({ x: (19 + OX) * TS + 8, y: (20 + OY) * TS + 8, sex: 'f' }),
  ];
  chxDayLast = -1;
}

function chxSave() {
  return chx.map((c) => ({
    id: c.id,
    sex: c.sex,
    g: c.g,
    age: c.age,
    mom: c.mom,
    x: c.x,
    y: c.y,
    hunger: c.hunger,
    thirst: c.thirst,
    nestId: c.nestId,
    broody: c.broody,
    layNext: c.layNext,
    lastEgg: c.lastEgg,
  }));
}

function restoreChx(arr) {
  if (!Array.isArray(arr) || !arr.length) {
    chxStart();
    return;
  }
  chx = arr.map((o) => mkChx(Object.assign({}, o, { state: 'andar', t: 0, tx: o.x, ty: o.y })));
  chxId = Math.max(...chx.map((c) => c.id)) + 1;
}

const CHX_ADULT = 300; // segundos de jogo até virar adulta(o)

function chxWalkOK(x, y) {
  const tx = Math.floor(x / TS),
    ty = Math.floor(y / TS);
  return tx >= 0 && ty >= 0 && tx < MW && ty < MH && !solid(tx, ty);
}

/** Alimento que o jogador tem na mão (item selecionado que ele possui), ou null. */
export function heldFood() {
  const it = ITEMS[S.sel];
  return it && S.inv[it.id] > 0 ? it.id : null;
}

/**
 * Anda até `step` px em direção a (tx,ty), em passos de até 2px e um eixo de cada vez: com cerca de 1 tile de
 * espessura a galinha nunca "atravessa" nem passa por uma quina na diagonal. Devolve se saiu do lugar.
 */
function chxMoveToward(c, tx, ty, step) {
  const d = Math.hypot(tx - c.x, ty - c.y);
  if (d < 0.001) return false;
  const total = Math.min(step, d),
    n = Math.max(1, Math.ceil(total / 2)),
    s1 = total / n;
  let moved = false;
  for (let k = 0; k < n; k++) {
    const rx = tx - c.x,
      ry = ty - c.y,
      rd = Math.hypot(rx, ry);
    if (rd < 0.001) break;
    const vx = (rx / rd) * s1,
      vy = (ry / rd) * s1;
    let m = false;
    if (Math.abs(vx) > 1e-6 && chxWalkOK(c.x + vx, c.y)) {
      c.x += vx;
      m = true;
    }
    if (Math.abs(vy) > 1e-6 && chxWalkOK(c.x, c.y + vy)) {
      c.y += vy;
      m = true;
    }
    if (!m) break;
    moved = true;
  }
  return moved;
}

/** Livre de sólidos num corredor de 6px (usado para suavizar caminhos: a galinha não raspa em quinas). */
const chxWide = (x, y) =>
  chxWalkOK(x - 3, y - 3) && chxWalkOK(x + 3, y - 3) && chxWalkOK(x - 3, y + 3) && chxWalkOK(x + 3, y + 3);

/** Anda em direção à posição de atração (em linha reta se der, senão por caminho entre os tiles livres). */
function chxLureMove(c, dt, px, py) {
  const slot = lureSlot('galinha', c.id, px, py);
  let gx = slot.x,
    gy = slot.y;
  if (!chxWalkOK(gx, gy)) {
    gx = px;
    gy = py;
  }
  const dist = Math.hypot(gx - c.x, gy - c.y);
  if (dist < 3) {
    c.lpath = null;
    c.dir = px >= c.x ? 1 : -1;
    return false; // já chegou: fica parada olhando para o jogador
  }
  c.lureT = (c.lureT || 0) - dt;
  let straight = true;
  for (let k = 1; k <= Math.ceil(dist / 2); k++) {
    const f = (k * 2) / dist;
    if (f < 1 && !chxWide(c.x + (gx - c.x) * f, c.y + (gy - c.y) * f)) {
      straight = false;
      break;
    }
  }
  let tx = gx,
    ty = gy;
  if (!straight) {
    if (c.lureT <= 0 || !c.lpath) {
      c.lureT = LURE_REPATH_SEC;
      c.lpath = findPath(c.x, c.y, gx, gy, chxWide);
    }
    if (!c.lpath || !c.lpath.length) return false; // sem caminho (cercado): fica parada, sem tremer
    while (c.lpath.length > 1 && Math.hypot(c.lpath[0][0] - c.x, c.lpath[0][1] - c.y) < 3) c.lpath.shift();
    [tx, ty] = c.lpath[0];
  } else c.lpath = null;
  const moved = chxMoveToward(c, tx, ty, 38 * FOOD.galinha.speedMul * dt);
  if (Math.abs(tx - c.x) > 0.3) c.dir = tx > c.x ? 1 : -1;
  if (!moved) c.lureT = Math.min(c.lureT, 0); // encostou em algo: recalcula o caminho
  return moved;
}

function chxPick(c) {
  if (c.broody) {
    c.state = 'voltar';
    c.t = 0;
    return;
  }
  const r = Math.random();
  if (c.age >= CHX_ADULT && Math.random() < CHICKEN.lookP) {
    // vigilância: para, ergue a cabeça e olha em volta (vê mais longe nesse estado)
    c.state = 'vigia';
    c.t = CHICKEN.lookT[0] + Math.random() * (CHICKEN.lookT[1] - CHICKEN.lookT[0]);
    if (Math.random() < 0.5) c.dir = -c.dir;
    return;
  }
  c.state = r < 0.45 ? 'ciscar' : r < 0.55 && c.sex === 'f' && c.age >= CHX_ADULT ? 'banho' : 'andar';
  if (c.state === 'andar') {
    c.tx = c.x + (Math.random() - 0.5) * 60;
    c.ty = c.y + (Math.random() - 0.5) * 60;
    c.t = 6;
  } else c.t = c.state === 'ciscar' ? 2 + Math.random() * 3 : 6;
}

/** A galinha percebe uma raposa? Vê/ouve (com linha de visão: pedra e casa tapam, cerca não) ou ela está perto demais. */
function chxFoxThreat(c, dt) {
  if (!fox.length) return null;
  for (const f of fox) if (Math.hypot(f.x - c.x, f.y - c.y) < CHICKEN.nearR) return f; // perto demais: sempre assusta
  if (!percTick(c, dt, 'f')) return null; // olha ~4 vezes por segundo, não a cada quadro
  const o = { x: c.x, y: c.y, sp: 'chicken', state: c.state, dir: c.dir < 0 ? Math.PI : 0, id: c.id };
  for (const f of fox) {
    const s = senseTarget(o, {
      x: f.x,
      y: f.y,
      moving: true,
      running: false,
      stalking: false,
      frozen: false,
      cover: 0,
      camo: 0,
      lit: false,
    });
    if (s.seen || s.heard) return f;
  }
  return null;
}

/** Foge de um ponto (px) por ~1,5 s. */
function chxRun(c, x, y, t) {
  c.state = 'fugir';
  c.t = t;
  c.prey = null;
  const L = Math.hypot(c.x - x, c.y - y) || 1;
  c.tx = c.x + ((c.x - x) / L) * 60;
  c.ty = c.y + ((c.y - y) / L) * 60;
}

/** Chamado de alarme: as galinhas ao alcance da voz fogem do ponto onde quem chamou viu a raposa (sem ver a raposa elas mesmas). */
function chxCall(c, f) {
  c.callCd = CHICKEN.callCd;
  c.alarmT = CHICKEN.callT;
  const dP = Math.hypot(c.x - S.px, c.y - S.py);
  if (!S.inside && dP < 150) beep(900 + Math.random() * 140, 0.05, 'square');
  for (const q of chx) {
    if (q === c || q.holder || Math.hypot(q.x - c.x, q.y - c.y) > ECO.chicken.herdAlarm) continue;
    q.alarmT = CHICKEN.callT * 0.8;
    q.callCd = Math.max(q.callCd || 0, CHICKEN.callCd * 0.7); // quem só repete o chamado não dispara outra cascata
    if (q.state !== 'fugir') chxRun(q, f.x, f.y, 1.2 + Math.random() * 0.6);
  }
}

function chxRank(c) {
  return (c.sex === 'm' && c.age >= CHX_ADULT ? 1.5 : 0) + chxPheno(c).temp;
} // ordem de bicada

const updateChx = extensible(function updateChx(dt) {
  if (sleeping) return;
  if (S.day !== chxDayLast) {
    chxDayLast = S.day;
    chxBreed();
  }
  for (const c of chx) {
    if (c.holder) {
      c.age += dt;
      continue;
    } // presa carregada pela raposa: a posição é da raposa
    c.age += dt;
    if (dungTimer(c, dt, 150, 260)) dropFeces(c.x, c.y, 0.5, 'chicken');
    c.hunger = Math.max(0, c.hunger - 0.18 * dt);
    c.thirst = Math.max(0, c.thirst - 0.25 * dt);
    c.wcd = (c.wcd || 0) - dt;
    c.alarmT = Math.max(0, (c.alarmT || 0) - dt);
    c.callCd = Math.max(0, (c.callCd || 0) - dt);
    {
      // vigilância: percepção por visão/audição (alcance varia com o que a galinha está fazendo e com a hora) + chamado de alarme
      const fz = chxFoxThreat(c, dt);
      if (fz) {
        if (c.state !== 'fugir') chxRun(c, fz.x, fz.y, 1.5);
        if (c.callCd <= 0) chxCall(c, fz);
      }
    }
    const dP = Math.hypot(c.x - S.px, c.y - S.py);
    c.cacaCd = Math.max(0, (c.cacaCd || 0) - dt);
    {
      // atração por alimento na mão: só se não há raposa por perto; perde o interesse fora do raio (com histerese)
      const foxNear = fox.some((f) => Math.hypot(f.x - c.x, f.y - c.y) < 50),
        want = !S.inside && !foxNear && lureDecision('galinha', heldFood(), dP, c.state === 'atrai');
      if (want && c.state !== 'atrai') {
        c.state = 'atrai';
        c.prey = null;
        c.lpath = null;
        c.lureT = 0;
      } else if (!want && c.state === 'atrai') {
        c.lpath = null;
        c.tx = c.x;
        c.ty = c.y;
        chxPick(c); // volta ao comportamento normal
      }
    }
    if (c.thirst < 35 && (c.state === 'andar' || c.state === 'ciscar') && c.wcd <= 0) {
      const wt = nearestWater(c, 300);
      if (wt) {
        c.state = 'beber';
        c.water = wt;
        c.t = 25;
        c.prey = null;
      } else c.wcd = 5;
    }
    if (
      c.state !== 'fugir' &&
      c.state !== 'banho' &&
      c.state !== 'caca' &&
      c.state !== 'beber' &&
      c.state !== 'bebendo' &&
      c.state !== 'choca' &&
      c.state !== 'voltar' &&
      c.state !== 'cava' &&
      c.state !== 'atrai' &&
      dP >= 34 &&
      c.hunger < 75 &&
      c.cacaCd <= 0
    ) {
      const wv = nearestWorm(c, 320);
      if (wv) {
        c.state = 'caca';
        c.prey = wv;
        c.t = 8;
      }
    }
    if (c.state !== 'fugir' && c.state !== 'atrai' && dP < 34) {
      c.state = 'fugir';
      c.prey = null;
      c.t = 1.2 + Math.random() * 0.6;
      const L = dP || 1;
      c.tx = c.x + ((c.x - S.px) / L) * 60;
      c.ty = c.y + ((c.y - S.py) / L) * 60;
    }
    let sp = 0;
    if (c.state === 'atrai') {
      c.lureMoving = chxLureMove(c, dt, S.px, S.py);
    } else if (c.state === 'vigia') {
      c.t -= dt; // parada, de cabeça erguida
      if (c.t <= 0) chxPick(c);
    } else if (c.state === 'fugir') {
      sp = 44;
      c.t -= dt;
      if (c.t <= 0) chxPick(c);
    } else if (c.state === 'caca') {
      const w = c.prey;
      if (!w || w.eaten || w.st !== 'surf' || (c.t -= dt) <= 0) {
        c.state = 'andar';
        c.prey = null;
        c.tx = c.x;
        c.ty = c.y;
      } else {
        c.tx = w.x;
        c.ty = w.y;
        sp = 40;
        if (Math.hypot(w.x - c.x, w.y - c.y) < 5) {
          w.eaten = true;
          c.prey = null;
          c.state = 'ciscar';
          c.t = 2;
          sp = 0;
          c.hunger = Math.min(100, c.hunger + 40);
        }
      }
    } else if (c.state === 'voltar') {
      const n = ninhos.find((q) => q.id === c.nestId);
      if (!n) {
        c.broody = false;
        c.state = 'andar';
      } else {
        c.tx = n.x;
        c.ty = n.y;
        sp = 18;
        if (Math.hypot(n.x - c.x, n.y - c.y) < 3) c.state = 'choca';
      }
    } else if (c.state === 'choca') {
      const n = ninhos.find((q) => q.id === c.nestId);
      if (!n || !c.broody) {
        c.broody = false;
        c.state = 'andar';
      } else {
        c.x = n.x;
        c.y = n.y;
      }
    } else if (c.state === 'cava') {
      c.t -= dt;
      if (c.t <= 0) chxPick(c);
    } else if (c.state === 'beber') {
      const wt = c.water;
      c.tx = wt.x;
      c.ty = wt.y;
      sp = 20;
      c.t -= dt;
      if (Math.hypot(wt.x - c.x, wt.y - c.y) < 16) {
        c.state = 'bebendo';
        c.t = 3;
        sp = 0;
      } else if (c.t <= 0) {
        c.state = 'andar';
        c.wcd = 5;
      }
    } else if (c.state === 'bebendo') {
      c.thirst = Math.min(100, c.thirst + 22 * dt);
      c.t -= dt;
      if (c.t <= 0) chxPick(c);
    } else if (c.state === 'ciscar' || c.state === 'banho') {
      if (c.state === 'ciscar') c.hunger = Math.min(100, c.hunger + 1.2 * dt);
      c.t -= dt;
      if (c.t <= 0) chxPick(c);
    } else {
      const mom = c.age < CHX_ADULT ? chx.find((q) => q.id === c.mom) : null; // pintinho segue a mãe
      if (mom && Math.hypot(mom.x - c.x, mom.y - c.y) > 24) {
        c.tx = mom.x;
        c.ty = mom.y;
        c.t = 2;
      }
      const dx = c.tx - c.x,
        dy = c.ty - c.y,
        d = Math.hypot(dx, dy);
      c.t -= dt;
      if (d < 2 || c.t <= 0) {
        if (!(mom && d > 24)) chxPick(c);
      } else sp = c.age < CHX_ADULT ? 22 : 14;
    }
    if (sp > 0) {
      const dx = c.tx - c.x,
        dy = c.ty - c.y,
        d = Math.hypot(dx, dy) || 1,
        st = Math.min(sp * dt, d);
      if (!chxMoveToward(c, c.tx, c.ty, st)) {
        c.tx = c.x;
        c.ty = c.y;
        c.t = 0;
        if (c.state === 'caca') c.cacaCd = 5; // minhoca do outro lado de uma cerca: não insiste a cada quadro
      }
      if (Math.abs(dx) > 0.3) c.dir = dx > 0 ? 1 : -1;
    }
    for (const q of chx) {
      if (q === c || q.state === 'fugir') continue;
      const ex = c.x - q.x,
        ey = c.y - q.y,
        ed = Math.hypot(ex, ey);
      if (ed > 0 && ed < 12 && chxRank(q) > chxRank(c)) {
        const nx = c.x + (ex / ed) * 6 * dt,
          ny = c.y + (ey / ed) * 6 * dt;
        if (chxWalkOK(nx, ny)) {
          c.x = nx;
          c.y = ny;
        }
      }
    } // quem é mais baixo na hierarquia se afasta
  }
});

function drawChx(c) {
  const ph = chxPheno(c),
    sc = c.age < CHX_ADULT ? 0.62 : c.sex === 'm' ? 1.12 : 1;
  const base =
      c.state === 'fugir' || c.state === 'caca' || (c.state === 'atrai' && c.lureMoving)
        ? 'run'
        : c.state === 'ciscar' || c.state === 'cava' || c.state === 'atrai'
          ? 'eat'
          : 'idle',
    side = c.dir < 0 ? 'L' : 'R',
    sheet = base + side;
  const t = performance.now() / 1000,
    fps = base === 'run' ? 12 : base === 'eat' ? 8 : 4,
    n = base === 'eat' ? 8 : 4,
    fr = Math.floor(t * fps) % n;
  const sx = c.state === 'banho' ? Math.sin(t * 30 + c.id) * 1.4 : 0,
    cv = chxSprite(sheet, ph.color);
  ctx.fillStyle = 'rgba(0,0,0,.22)';
  ctx.beginPath();
  ctx.ellipse(c.x, c.y + 1, 4 * sc, 1.6 * sc, 0, 0, 6.283);
  ctx.fill();
  if (cv) ctx.drawImage(cv, fr * 16, 0, 16, 16, c.x - 8 * sc + sx, c.y - 14 * sc, 16 * sc, 16 * sc);
  else {
    ctx.fillStyle = '#fff';
    ctx.fillRect(c.x - 3, c.y - 6, 6, 6);
  }
  if (c.alarmT > 0) {
    // chamado de alarme: dois arcos de "som" de cada lado da cabeça
    const k = Math.min(1, c.alarmT / 0.6),
      hy = c.y - 9 * sc;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,238,170,' + (0.85 * k).toFixed(2) + ')';
    ctx.lineWidth = 0.9;
    for (let i = 0; i < 2; i++) {
      const r = 4 + i * 2.6 + (1 - k) * 2;
      ctx.beginPath();
      ctx.arc(c.x, hy, r, -0.85, 0.85);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(c.x, hy, r, Math.PI - 0.85, Math.PI + 0.85);
      ctx.stroke();
    }
    ctx.restore();
  }
  // fome/sede/idade: rendering/AnimalStatus.js
  if (c.state === 'banho') {
    ctx.fillStyle = 'rgba(150,110,70,.6)';
    for (let i = 0; i < 4; i++) ctx.fillRect(c.x - 6 + ((t * 20 + i * 7) % 12), c.y - 1 + ((i * 3) % 3), 1, 1);
  } // poeira do banho de terra
}

function chxInfoNear() {
  let best = null,
    bd = 22;
  for (const c of chx) {
    const d = Math.hypot(c.x - S.px, c.y - S.py);
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  if (!best) return false;
  const ph = chxPheno(best);
  toast(
    '🐔 ' +
      (best.age < CHX_ADULT ? 'Pintinho' : best.sex === 'm' ? 'Galo' : 'Galinha') +
      ' · ' +
      ph.color +
      ' · porte ' +
      ph.sz.toFixed(2) +
      ' · temperamento ' +
      (ph.temp > 0.6 ? 'ousada' : ph.temp < 0.4 ? 'tímida' : 'equilibrada') +
      ' · fome ' +
      Math.round(best.hunger) +
      '% · sede ' +
      Math.round(best.thirst) +
      '%',
  );
  return true;
}

export function loadChickenSprites() {
  for (const k in CHK_SHEETS) {
    const im = new Image();
    im.src = CHK_SHEETS[k];
    CHK_IMG[k] = im;
  }
}

/** Atualiza `chx` a partir de outros módulos (as ligações importadas são somente leitura). */
export function setChx(value) {
  chx = value;
  return value;
}

export {
  CHX_ADULT,
  chx,
  chxCross,
  chxGenesFounder,
  chxInfoNear,
  chxPheno,
  chxPick,
  chxSave,
  chxStart,
  chxWalkOK,
  drawChx,
  mkChx,
  restoreChx,
  updateChx,
};
