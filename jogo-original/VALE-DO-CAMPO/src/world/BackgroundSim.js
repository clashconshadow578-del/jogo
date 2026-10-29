/**
 * Simulação invisível das regiões fora da tela: animais andam, mudam de região, se reproduzem e são predados; chuva das nuvens que cruzam a divisa.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { MH, MW, TS, WATER, WN } from '../config/constants.js';
import { worldMin } from '../core/TimeManager.js';
import { anaInitA } from '../entities/wild/Anaconda.js';
import { faFree, faInitDone, faSpawn, fauna, setFaInitDone } from '../entities/wild/Fauna.js';
import { ckey, INST } from './Instances.js';
import { clouds } from './WeatherSystem.js';
import { ground } from './World.js';

/* ---------- animais fora da tela: simulação invisível e barata ---------- */
const FA_TG = { deer: 3, hare: 5, grouse: 4, fox: 2, boar: 5 };

const fSnap = (a) => ({
  sp: a.sp,
  x: a.x,
  y: a.y,
  hun: a.hun,
  thi: a.thi,
  age: a.age,
  bold: a.bold,
  sz: a.sz,
  herd: a.herd,
  sex: a.sex,
  pg: a.preg || 0,
  dg: a.dg || 0,
  dK: a.dgK || 0,
});

function snapFree(x, y) {
  const W = MW * TS,
    H = MH * TS;
  x = Math.max(TS * 3, Math.min(W - TS * 3, x));
  y = Math.max(TS * 3, Math.min(H - TS * 3, y));
  if (faFree(x, y) && ground[Math.floor(y / TS) * MW + Math.floor(x / TS)] !== WATER) return [x, y];
  for (let r = 8; r <= 320; r += 8)
    for (let k = 0; k < 12; k++) {
      const an = k * 0.5236 + r * 0.1,
        nx = x + Math.cos(an) * r,
        ny = y + Math.sin(an) * r;
      if (
        nx > TS * 3 &&
        ny > TS * 3 &&
        nx < W - TS * 3 &&
        ny < H - TS * 3 &&
        faFree(nx, ny) &&
        ground[Math.floor(ny / TS) * MW + Math.floor(nx / TS)] !== WATER
      )
        return [nx, ny];
    }
  return [x, y];
}

function materializeFauna(o) {
  const p = snapFree(o.x, o.y),
    a = faSpawn(o.sp, p[0], p[1], false);
  a.hun = o.hun;
  a.thi = o.thi;
  a.age = o.age;
  a.bold = o.bold;
  a.sz = o.sz;
  a.herd = o.herd;
  if (o.sp === 'anaconda') {
    anaInitA(a);
    a.hun = o.hun;
    a.dg = o.dg || 0;
    a.dgK = o.dK || 0;
    a.dg0 = 1;
  }
  if (o.sex) {
    a.sex = o.sex;
    a.preg = o.pg || 0;
    a.hx = a.x;
    a.hy = a.y;
    a.mcd = 60;
  }
  return a;
}

function stashFauna() {
  const arr = [];
  for (const a of fauna) {
    if (a.state === 'dead' || a.gone) continue;
    arr.push(fSnap(a));
  }
  INST.bg[ckey(INST.cx, INST.cy)] = { f: arr, t: worldMin(), acc: 0 };
}

function unstashFauna(key) {
  const r = INST.bg[key];
  delete INST.bg[key];
  fauna.length = 0;
  if (!r) {
    setFaInitDone(false);
    return;
  }
  setFaInitDone(true);
  for (const o of r.f) materializeFauna(o);
}

function bgAdd(nx, ny, a) {
  if (nx === INST.cx && ny === INST.cy) {
    materializeFauna(a);
    return;
  }
  const k = ckey(nx, ny);
  (INST.bg[k] || (INST.bg[k] = { f: [], t: worldMin(), acc: 0 })).f.push(a);
}

function bgLife(r) {
  const cnt = {};
  for (const a of r.f) cnt[a.sp] = (cnt[a.sp] || 0) + 1;
  if (cnt.fox) {
    const prey = r.f.findIndex((a) => a.sp === 'hare' || a.sp === 'grouse');
    if (prey >= 0 && Math.random() < 0.4 * cnt.fox) r.f.splice(prey, 1);
    else if (prey < 0 && Math.random() < 0.2) {
      const fi = r.f.findIndex((a) => a.sp === 'fox');
      if (fi >= 0) r.f.splice(fi, 1);
    }
  }
  if (cnt.jaguar) {
    // onças fora da tela: caçam cervos/queixadas (e, se preciso, lebres/aves), morrem de fome sem presas e se reproduzem
    for (const j of r.f.filter((a) => a.sp === 'jaguar' && a.age >= 420)) {
      if (j.hun > 0.45) {
        let pi = r.f.findIndex((a) => a.sp === 'deer');
        if (pi < 0) pi = r.f.findIndex((a) => a.sp === 'boar');
        if (pi < 0 && j.hun > 0.6) pi = r.f.findIndex((a) => a.sp === 'hare' || a.sp === 'grouse');
        if (pi >= 0 && Math.random() < 0.55) {
          r.f.splice(pi, 1);
          j.hun = Math.max(0, j.hun - 0.8);
        } else if (pi < 0 && j.hun > 0.95 && Math.random() < 0.25) {
          const ji = r.f.indexOf(j);
          if (ji >= 0) r.f.splice(ji, 1);
        }
      }
    }
    const J = r.f.filter((a) => a.sp === 'jaguar'),
      m = J.find((a) => a.sex === 'm' && a.age >= 420),
      f = J.find((a) => a.sex === 'f' && a.age >= 420);
    if (m && f && J.length < 4 && m.hun < 0.6 && f.hun < 0.6 && Math.random() < 0.15)
      r.f.push({
        sp: 'jaguar',
        x: f.x + (Math.random() - 0.5) * 20,
        y: f.y + (Math.random() - 0.5) * 20,
        hun: 0.2,
        thi: 0.2,
        age: 0,
        bold: Math.random(),
        sz: 0.95,
        herd: 0,
        sex: Math.random() < 0.5 ? 'm' : 'f',
        pg: 0,
      });
  }
  for (const sp in FA_TG) {
    if ((cnt[sp] || 0) >= 2 && cnt[sp] < FA_TG[sp] + 2 && Math.random() < 0.3) {
      const p = r.f.find((a) => a.sp === sp);
      r.f.push({
        sp,
        x: p.x + (Math.random() - 0.5) * 30,
        y: p.y + (Math.random() - 0.5) * 30,
        hun: 0.3,
        thi: 0.2,
        age: 0,
        bold: p.bold,
        sz: p.sz,
        herd: p.herd,
      });
    }
  }
  if (r.f.length > 24) r.f.splice(0, r.f.length - 24);
}

function bgTickAll() {
  const wm = worldMin(),
    W = MW * TS,
    H = MH * TS;
  for (const k of Object.keys(INST.bg)) {
    const r = INST.bg[k];
    if (!r) continue;
    const el = Math.min(wm - r.t, 900);
    r.t = wm;
    if (el <= 0) continue;
    const [cx, cy] = k.split('_').map(Number);
    for (let i = r.f.length - 1; i >= 0; i--) {
      const a = r.f[i],
        sp = a.sp === 'hare' || a.sp === 'fox' ? 14 : a.sp === 'grouse' ? 6 : 9;
      const an = Math.random() * 6.283,
        d = sp * el * (0.25 + Math.random() * 0.5);
      a.x += Math.cos(an) * d;
      a.y += Math.sin(an) * d;
      a.hun = Math.min(1, a.hun + el / 3000);
      a.age += el;
      let dx = 0,
        dy = 0;
      if (a.x < 0) dx = -1;
      else if (a.x >= W) dx = 1;
      if (a.y < 0) dy = -1;
      else if (a.y >= H) dy = 1;
      if (dx || dy) {
        const nx = cx + dx,
          ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= WN || ny >= WN) {
          a.x = Math.max(8, Math.min(W - 8, a.x));
          a.y = Math.max(8, Math.min(H - 8, a.y));
        } else {
          a.x = (a.x + W) % W;
          a.y = (a.y + H) % H;
          r.f.splice(i, 1);
          bgAdd(nx, ny, a);
        }
      }
    }
    r.acc += el;
    while (r.acc >= 300) {
      r.acc -= 300;
      bgLife(r);
    }
  }
}

function faEdge() {
  // animais da instância atual que chegam à borda podem passar para a vizinha
  const W = MW * TS,
    H = MH * TS;
  for (let i = fauna.length - 1; i >= 0; i--) {
    const a = fauna[i];
    if (a.state === 'dead' || a.state === 'fight' || a.state === 'fly') continue;
    let dx = 0,
      dy = 0;
    if (a.x < TS * 4) dx = -1;
    else if (a.x > W - TS * 4) dx = 1;
    if (a.y < TS * 4) dy = -1;
    else if (a.y > H - TS * 4) dy = 1;
    if (!dx && !dy) continue;
    const nx = INST.cx + dx,
      ny = INST.cy + dy;
    if (nx < 0 || ny < 0 || nx >= WN || ny >= WN || Math.random() > 0.35) continue;
    const o = fSnap(a);
    o.x = dx < 0 ? W - TS * 4 : dx > 0 ? TS * 4 : a.x;
    o.y = dy < 0 ? H - TS * 4 : dy > 0 ? TS * 4 : a.y;
    fauna.splice(i, 1);
    bgAdd(nx, ny, o);
  }
}

function rainExposure(dt) {
  // nuvens que estão sobre outra instância molham aquela instância
  for (const c of clouds) {
    if (c.pw < 0.25) continue;
    const ox = Math.floor(c.x / (MW * TS)),
      oy = Math.floor(c.y / (MH * TS));
    if (!ox && !oy) continue;
    const nx = INST.cx + ox,
      ny = INST.cy + oy;
    if (nx < 0 || ny < 0 || nx >= WN || ny >= WN) continue;
    const k = ckey(nx, ny);
    INST.rain[k] = Math.min(600, (INST.rain[k] || 0) + c.pw * (c.s || 0.5) * dt);
  }
}

export { bgAdd, bgTickAll, fSnap, faEdge, materializeFauna, rainExposure, stashFauna, unstashFauna };
