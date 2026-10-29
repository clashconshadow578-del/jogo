/**
 * Vida social do rebanho: nomes, preferências, humor (emojis), relacionamentos, conversas entre vacas e balões de fala.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { MH, MW, TREE, TS, VH, VW } from '../../config/constants.js';
import { S } from '../../core/GameState.js';
import { nightF } from '../../core/TimeManager.js';
import { cowCanWalk, cowFind } from '../cow/Cow.js';
import { bPh, bStage, coatOf } from '../cow/CowGenetics.js';
import { herd } from '../cow/Herd.js';
import { ctx } from '../../rendering/Canvas.js';
import { moo, mooKind, mooVol } from '../../systems/audio/AnimalSounds.js';
import { rr } from '../../utils/Random.js';
import { climate } from '../../world/WeatherSystem.js';
import { obj } from '../../world/World.js';

/* ============ EMOÇÕES, PREFERÊNCIAS E RELACIONAMENTOS DOS ANIMAIS ============ */
const ANI_NAMES = {
  f: ['Mimosa', 'Estrela', 'Flor', 'Pintada', 'Malhada', 'Bonita', 'Dengosa'],
  m: ['Trovão', 'Touro Bill', 'Valente', 'Rex', 'Bruto', 'Dom'],
};

const CALF_NAMES = ['Pipoca', 'Docinho', 'Bolinha', 'Fofinho', 'Mel', 'Pingo'];

function aniInit(c) {
  if (!c.pref)
    c.pref = {
      shade: 0.45 + Math.random() * 0.55,
      water: 0.5 + Math.random() * 1,
      food: 0.6 + Math.random() * 0.9,
      explore: 0.4 + Math.random() * 1.2,
      player: Math.random(),
      rain: Math.random() < 0.4,
    };
  if (!c.name) {
    const L = c.calf ? CALF_NAMES : ANI_NAMES[c.sex === 'm' ? 'm' : 'f'];
    c.name = L[Math.floor(Math.random() * L.length)];
  }
  if (!c.rel) c.rel = {};
  if (c.mooT == null) c.mooT = rr(15, 50);
}

function emo(c) {
  return c.calf ? '🐮' : c.sex === 'm' ? '🐂' : '🐄';
}

function relOf(a, b) {
  if (a.primeira && b.primeira && a !== b) return 0.9;
  aniInit(a);
  if (a.rel[b.id] == null) {
    let v;
    if ((a.calf && a.mom === b.id) || (b.calf && b.mom === a.id)) v = 0.9;
    else if (a.calf || b.calf) v = 0.3 + Math.random() * 0.5;
    else v = Math.random() < 0.28 ? -(0.3 + Math.random() * 0.6) : 0.1 + Math.random() * 0.8;
    a.rel[b.id] = v;
  }
  return a.rel[b.id];
}

function treesNear(x, y, r) {
  const cx = Math.floor(x / TS),
    cy = Math.floor(y / TS);
  let n = 0;
  for (let j = cy - r; j <= cy + r; j++)
    for (let i = cx - r; i <= cx + r; i++) {
      if (i < 0 || j < 0 || i >= MW || j >= MH) continue;
      if (obj[j * MW + i] === TREE) n++;
    }
  return n;
}

const BUB = [];
const PCD = {};

function say(c, txt, delay = 0, dur = 2.2) {
  BUB.push({ id: c.id, txt, t0: performance.now() + delay * 1000, dur: dur * 1000 });
  if (BUB.length > 40) BUB.shift();
}

function chat(a, b) {
  const ra = relOf(a, b),
    rb = relOf(b, a),
    ea = emo(a),
    eb = emo(b),
    vv = mooVol(a);
  if (ra < -0.2 || rb < -0.2) {
    const hater = ra < rb ? a : b,
      other = hater === a ? b : a;
    say(a, ea + '💬', 0, 1.6);
    say(b, eb + (rb < -0.2 ? '😒' : '🙄'), 1, 1.8);
    say(hater, '😠💢', 2, 2);
    hater.avoid = other.id;
    hater.avoidT = 30;
    if (other.avoidT == null || rb < -0.2) {
      other.avoid = hater.id;
      other.avoidT = Math.max(other.avoidT || 0, 18);
    }
    a.rel[b.id] = Math.max(-1, ra - 0.03);
    b.rel[a.id] = Math.max(-1, rb - 0.03);
    setTimeout(() => moo('grunt', vv), 2000);
    hater.mood = '😠';
  } else if (ra > 0.35 && rb > 0.35) {
    say(a, ea + '💬', 0, 1.6);
    say(b, eb + '💕', 1, 2);
    say(a, '🥰🌿', 2, 2);
    a.rel[b.id] = Math.min(1, ra + 0.04);
    b.rel[a.id] = Math.min(1, rb + 0.04);
    setTimeout(() => moo(mooKind(b), vv * 0.7), 1000);
  } else {
    say(a, ea + '❓', 0, 1.6);
    say(b, eb + '🙂', 1, 1.8);
    a.rel[b.id] = Math.min(1, ra + 0.02);
    b.rel[a.id] = Math.min(1, rb + 0.02);
    setTimeout(() => moo(mooKind(b), vv * 0.5), 1000);
  }
}

function moodOf(c) {
  const h = 6 + S.min / 60,
    night = nightF(h) > 0.55,
    hot = h > 10.5 && h < 16 && climate.cloud < 0.55 && climate.rain < 0.15;
  if (c.pet > 0) return '😍';
  if (c.avoidT > 0) return '😠';
  if (hot && treesNear(c.x, c.y, 2) === 0) return '🥵';
  if (night) return '😴';
  if (c.thirst > 0.75) return '😩';
  if (c.hunger > 0.75) return '🤤';
  if (climate.rain > 0.3) return c.pref.rain ? '😊' : '😒';
  let fr = false,
    any = false;
  for (const q of herd) {
    if (q === c) continue;
    const d = Math.hypot(q.x - c.x, q.y - c.y);
    if (d < 150) any = true;
    if (d < 60 && relOf(c, q) > 0.35) fr = true;
  }
  if (fr) return '🥰';
  if (!any && c.social > 0.5 && !c.calf) return '😢';
  return '😊';
}

function aniFeel(c, dt) {
  aniInit(c);
  c.avoidT = Math.max(0, (c.avoidT || 0) - dt);
  c.mT = (c.mT || 0) - dt;
  if (c.mT <= 0) {
    c.mT = 1 + Math.random();
    const m = moodOf(c);
    if (m !== c.mood) {
      c.mood = m;
      if ((c.mCd || 0) <= 0 && mooVol(c) > 0.1) {
        say(c, m, 0, 2.4);
        c.mCd = 22;
      }
    }
  }
  c.mCd = Math.max(0, (c.mCd || 0) - dt);
  c.mooT -= dt;
  if (c.mooT <= 0) {
    c.mooT = rr(25, 70);
    const v = mooVol(c);
    if (v > 0.05 && c.state !== 'graze') {
      moo(mooKind(c), v);
      say(c, emo(c) + '🔊', 0, 1.6);
    }
  }
  if (c.calf) {
    c.callT = (c.callT || 0) - dt;
    const m = cowFind(c.mom);
    if (m && c.callT <= 0 && Math.hypot(m.x - c.x, m.y - c.y) > 80) {
      c.callT = rr(6, 11);
      const v = mooVol(c);
      moo('calf', v);
      say(c, '🐮❗', 0, 1.6);
    }
  }
}

function aniPairs(a, b, d, dt) {
  const ra = relOf(a, b),
    rb = relOf(b, a);
  if (d < 30) {
    const k = a.id + '_' + b.id,
      n = performance.now();
    if (!PCD[k] || n > PCD[k]) {
      PCD[k] = n + rr(14000, 26000);
      if (mooVol(a) > 0.03 || true) chat(a, b);
    }
  }
  if ((ra < -0.2 || rb < -0.2) && d < 55 && !a.calf && !b.calf) {
    for (const [x, y, r] of [
      [a, b, ra],
      [b, a, rb],
    ]) {
      if (r < -0.2) {
        x.avoid = y.id;
        x.avoidT = Math.max(x.avoidT || 0, 12);
        if (x.state !== 'walk') x.t = Math.min(x.t, 0.05);
      }
    }
    const nx = ((a.x - b.x) / Math.max(d, 1)) * 0.18,
      ny = ((a.y - b.y) / Math.max(d, 1)) * 0.18;
    if (cowCanWalk(a.x + nx, a.y + ny)) {
      a.x += nx;
      a.y += ny;
    }
    if (cowCanWalk(b.x - nx, b.y - ny)) {
      b.x -= nx;
      b.y -= ny;
    }
  }
}

function drawBubbles(camX, camY) {
  const n = performance.now();
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, -camX, -camY);
  ctx.font = '9px "Segoe UI Emoji","Apple Color Emoji",sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const seen = {};
  for (let i = BUB.length - 1; i >= 0; i--) {
    const b = BUB[i];
    if (n > b.t0 + b.dur) {
      BUB.splice(i, 1);
      continue;
    }
    if (n < b.t0 || seen[b.id]) continue;
    const c = cowFind(b.id);
    if (!c) continue;
    if (c.x < camX - 20 || c.x > camX + VW + 20 || c.y < camY - 10 || c.y > camY + VH + 40) continue;
    seen[b.id] = 1;
    const k = (n - b.t0) / b.dur,
      al = k < 0.1 ? k / 0.1 : k > 0.8 ? (1 - k) / 0.2 : 1,
      sz = c.calf ? 0.7 : 1,
      w = ctx.measureText(b.txt).width + 8,
      hh = 14,
      x = Math.round(c.x),
      y = Math.round(c.y - (c.calf ? 18 : 30) * sz - Math.sin(k * 3) * 1.5);
    ctx.globalAlpha = al;
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = 'rgba(0,0,0,.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - w / 2 + 3, y - hh / 2);
    ctx.lineTo(x + w / 2 - 3, y - hh / 2);
    ctx.quadraticCurveTo(x + w / 2, y - hh / 2, x + w / 2, y - hh / 2 + 3);
    ctx.lineTo(x + w / 2, y + hh / 2 - 3);
    ctx.quadraticCurveTo(x + w / 2, y + hh / 2, x + w / 2 - 3, y + hh / 2);
    ctx.lineTo(x + 3, y + hh / 2);
    ctx.lineTo(x, y + hh / 2 + 4);
    ctx.lineTo(x - 3, y + hh / 2);
    ctx.lineTo(x - w / 2 + 3, y + hh / 2);
    ctx.quadraticCurveTo(x - w / 2, y + hh / 2, x - w / 2, y + hh / 2 - 3);
    ctx.lineTo(x - w / 2, y - hh / 2 + 3);
    ctx.quadraticCurveTo(x - w / 2, y - hh / 2, x - w / 2 + 3, y - hh / 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#000';
    ctx.fillText(b.txt, x, y + 1);
  }
  ctx.restore();
}

function aniInfo(c) {
  aniInit(c);
  const p = c.pref,
    L = [],
    pp = bPh(c);
  L.push(bStage(c) + ' ' + Math.floor((c.age || 0) / 60) + 'min');
  L.push('🎨 ' + coatOf(c).nm);
  L.push('🧬 porte ' + pp.size.toFixed(2) + ' · vigor ' + pp.vig.toFixed(2) + ' · fert. ' + pp.fert.toFixed(2));
  if (p.shade > 0.7) L.push('sombra 🌳');
  if (p.water > 1) L.push('água 💧');
  if (p.food > 1.1) L.push('pasto 🌿');
  if (p.explore > 1) L.push('passear 🐾');
  if (p.player > 0.6) L.push('carinho 🤗');
  if (p.rain) L.push('chuva 🌧️');
  let best = null,
    bs = -2,
    worst = null,
    ws = 2;
  for (const q of herd) {
    if (q === c) continue;
    const r = relOf(c, q);
    if (r > bs) {
      bs = r;
      best = q;
    }
    if (r < ws) {
      ws = r;
      worst = q;
    }
  }
  return (
    c.name +
    ' ' +
    (c.mood || '😊') +
    (L.length ? ' · gosta de ' + L.join(', ') : '') +
    (best && bs > 0.35 ? ' · ama ' + best.name : '') +
    (worst && ws < -0.2 ? ' · evita ' + worst.name : '')
  );
}

export { aniFeel, aniInfo, aniInit, aniPairs, drawBubbles, relOf, say, treesNear };
