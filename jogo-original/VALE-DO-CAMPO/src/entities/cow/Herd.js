/**
 * Rebanho: vaca fundadora, boi preto, vínculo, acasalamento, gestação (indicador na tela) e nascimento de bezerros.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { OX, OY, TS } from '../../config/constants.js';
import { extensible } from '../../core/extensions.js';
import { sleeping } from '../../core/GameState.js';
import { aniFeel, aniPairs, relOf } from '../animals/AnimalSocial.js';
import { cow, cowCanWalk, cowFind, setCow, updateCow } from './Cow.js';
import { bCross, bFert, bPh, bReap, coatOf } from './CowGenetics.js';
import { moo } from '../../systems/audio/AnimalSounds.js';
import { beep } from '../../systems/audio/AudioSystem.js';
import { toast } from '../../ui/Toast.js';
import { rr } from '../../utils/Random.js';
import { dungTimer } from '../../config/feces.js';
import { dropFeces } from '../../world/Feces.js';

let cowId = 1,
  gest = null;

const herd = []; // herd[0] = vaca fundadora (adicionada em initFounderCow)

function mkCow(o) {
  return Object.assign(
    {
      id: cowId++,
      x: 0,
      y: 0,
      dir: 1,
      walk: false,
      pet: 0,
      thirst: 0.3,
      hunger: 0.3,
      state: 'rest',
      t: 2,
      fx: -1,
      black: false,
      sex: 'f',
      age: 999,
      calf: false,
      mom: -1,
      social: 0.4,
      indep: false,
      bonds: {},
      preg: false,
      mateCd: 0,
      bold: Math.random(),
    },
    o,
  );
}

function spawnBlack() {
  herd.push(mkCow({ x: (24 + OX) * TS + 8, y: (18 + OY) * TS + 8, black: true, sex: 'm', founder: 1, social: 0.9 }));
}

const gestEl = document.createElement('div');

function restoreHerd(arr, g) {
  herd.length = 1;
  gest = null;
  cow.preg = false;
  if (Array.isArray(arr))
    for (const o of arr) {
      o.path = null;
      o.state = 'rest';
      o.t = 1;
      herd.push(mkCow(o));
      cowId = Math.max(cowId, (o.id || 0) + 1);
    }
  if (g) {
    const m = cowFind(g.mom),
      d = cowFind(g.dad);
    if (m && d) {
      gest = { mom: m, dad: d, t: g.t, total: g.total };
      m.preg = true;
    }
  }
}

function startMating(a, b) {
  const mom = a.sex === 'f' ? a : b,
    dad = mom === a ? b : a;
  mom.preg = true;
  gest = { mom, dad, t: 0, total: 150 };
  toast('💕 Acasalamento! O filhote nasce em 2:30');
  beep(520, 0.15, 'triangle');
}

function birth() {
  const m = gest.mom,
    d = gest.dad,
    n = Math.random() < 0.08 * (bPh(m).fert + bPh(d).fert) ? 2 : 1,
    ks = [];
  for (let i = 0; i < n; i++) {
    const g = bCross(m, d),
      male = Math.random() < 0.5,
      black = !!(g.B[0] || g.B[1]); // cada filhote: genoma novo e aleatório
    const k = mkCow({
      x: m.x + rr(-6, 6),
      y: m.y + rr(4, 9),
      black,
      sex: male ? 'm' : 'f',
      age: 0,
      calf: true,
      mom: m.id,
      social: 1,
      g,
    });
    if (!cowCanWalk(k.x, k.y)) {
      k.x = m.x;
      k.y = m.y;
    }
    herd.push(k);
    ks.push(k);
  }
  m.preg = false;
  m.mateCd = d.mateCd = 600;
  m.bonds[d.id] = d.bonds[m.id] = 0.3;
  gest = null;
  toast(
    '🐮 Nasceu ' +
      (n > 1 ? 'gêmeos!' : (ks[0].sex === 'm' ? 'um bezerro' : 'uma bezerra') + ' ' + coatOf(ks[0]).nm + '!') +
      ' 🧬',
  );
  beep(660, 0.2, 'triangle');
  moo('calf', 0.8);
}

function updateGest(dt) {
  if (!gest) {
    if (gestEl.style.display !== 'none') gestEl.style.display = 'none';
    return;
  }
  gest.t += dt;
  const r = Math.max(0, Math.ceil(gest.total - gest.t)),
    txt = '❤️ Filhote em ' + Math.floor(r / 60) + ':' + String(r % 60).padStart(2, '0');
  if (gestEl.textContent !== txt) gestEl.textContent = txt;
  if (gestEl.style.display !== 'block') gestEl.style.display = 'block';
  if (gest.t >= gest.total) birth();
}

function herdSocial(dt) {
  for (const a of herd) {
    a.mateCd = Math.max(0, (a.mateCd || 0) - dt);
    aniFeel(a, dt);
  }
  for (let i = 0; i < herd.length; i++)
    for (let j = i + 1; j < herd.length; j++) {
      const a = herd[i],
        b = herd[j],
        d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < 9 && d > 0.1) {
        const nx = ((a.x - b.x) / d) * 0.25,
          ny = ((a.y - b.y) / d) * 0.25;
        if (cowCanWalk(a.x + nx, a.y + ny)) {
          a.x += nx;
          a.y += ny;
        }
        if (cowCanWalk(b.x - nx, b.y - ny)) {
          b.x -= nx;
          b.y -= ny;
        }
      }
      aniPairs(a, b, d, dt);
      if (a.calf || b.calf) continue;
      const okp = relOf(a, b) > -0.2 && relOf(b, a) > -0.2;
      const v = Math.min(1, Math.max(0, (a.bonds[b.id] || 0) + (d < 70 && okp ? dt / 90 : -dt / 300)));
      a.bonds[b.id] = v;
      b.bonds[a.id] = v; // ~90s juntas = vínculo máximo
      if (
        okp &&
        !gest &&
        v >= 1 &&
        herd.length < 8 &&
        !a.mateCd &&
        !b.mateCd &&
        a.sex !== b.sex &&
        bFert(a) &&
        bFert(b) &&
        Math.random() < 0.03
      )
        startMating(a, b);
    }
}

const updateHerd = extensible(function updateHerd(dt) {
  if (sleeping) return;
  herdSocial(dt);
  for (const c of herd) {
    setCow(c);
    updateCow(dt);
    if (!c.dead && dungTimer(c, dt, 90, 180)) dropFeces(c.x, c.y, c.calf ? 0.6 : 1.5, 'cow');
  }
  bReap();
  setCow(herd[0]);
  updateGest(dt);
});

export function initFounderCow() {
  herd.push(cow);
  Object.assign(cow, {
    id: 0,
    black: false,
    sex: 'f',
    age: 999,
    calf: false,
    mom: -1,
    social: 0.35,
    indep: false,
    bonds: {},
    preg: false,
    mateCd: 0,
    bold: cow.bold == null ? Math.random() : cow.bold,
  });
}

export function initGestationBadge() {
  gestEl.style.cssText =
    'position:fixed;top:76px;right:10px;display:none;background:rgba(48,10,28,.78);border:1px solid #ff7aa9;border-radius:8px;padding:4px 9px;font-size:12px;pointer-events:none;text-shadow:0 1px 3px #000';
  document.body.appendChild(gestEl);
}

/** Atualiza `gest` a partir de outros módulos (as ligações importadas são somente leitura). */
export function setGest(value) {
  gest = value;
  return value;
}

export { gest, herd, mkCow, restoreHerd, spawnBlack, updateHerd };
