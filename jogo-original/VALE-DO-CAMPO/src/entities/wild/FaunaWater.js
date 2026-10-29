/**
 * Animais na água: quem nada, até que profundidade vadeia, travessia de rios e efeito da correnteza.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { GRASS, MH, MW, TS, WATER } from '../../config/constants.js';
import { FA_SP, faFree } from './Fauna.js';
import { WTc } from '../../world/hydrology/Hydrology.js';
import { BDF, DEP, flowAt, FQX, FQY } from '../../world/hydrology/RiverFlow.js';
import { ground, obj } from '../../world/World.js';

/* ===== Animais na água: quem entra, até onde e como (comportamento por espécie) ===== */
const FA_WATER = {
  // v: velocidade nadando (fração da marcha) · wade: profundidade máxima (em tiles) que vadeia · sz: quanto a correnteza o carrega
  deer: { v: 0.62, wade: 2.2, sz: 0.9 },
  boar: { v: 0.55, wade: 2.2, sz: 0.95 },
  fox: { v: 0.5, wade: 1.7, sz: 1.1 },
  hare: { v: 0.38, wade: 1.4, sz: 1.3 },
  jaguar: { v: 0.8, wade: 9, sz: 0.8 },
  anaconda: { v: 1, wade: 99, sz: 0.15 },
};

function faWM(a) {
  // 0 = fica na terra · 1 = vadeia na beira · 2 = nada
  const s = a.state;
  if (a.cross || a.resc) return 2;
  if (s === 'flee') return a.sp === 'deer' || a.sp === 'boar' ? 2 : 1; // cervos e queixadas fogem para a água (queixadas nadam em bando); lebre e raposa só molham as patas
  if (s === 'drink' || s === 'wallow' || s === 'chase' || s === 'stalk' || s === 'charge' || s === 'retreat') return 1;
  if (s === 'go' && (a.after === 'drink' || a.after === 'wallow')) return 1;
  return 0;
}

function faMove(a, x, y) {
  if (faFree(x, y)) return true;
  const W = FA_WATER[a.sp];
  if (!W || a.sp === 'jaguar') return false;
  const wm = faWM(a);
  if (!wm) return false;
  for (const ox of [-3, 3]) {
    const tx = Math.floor((x + ox) / TS),
      ty = Math.floor(y / TS);
    if (tx < 1 || ty < 1 || tx >= MW - 1 || ty >= MH - 1) return false;
    const i = ty * MW + tx;
    if (obj[i] !== 0) return false;
    if (ground[i] === WATER) {
      const d = BDF[i],
        c = WTc[i];
      if (a.inW && d <= (BDF[Math.floor(a.y / TS) * MW + Math.floor(a.x / TS)] || 99) + 0.01) continue; // já na água: sempre pode ir para onde é mais raso (sair)
      if (wm === 1 && d > W.wade) return false;
      if (wm === 2 && c !== 7 && c !== 8 && d > W.wade) return false;
    }
  } // mar aberto: só raso
  return true;
}

function faRescue(a) {
  // sai da água pela margem mais próxima
  const tx = Math.floor(a.x / TS),
    ty = Math.floor(a.y / TS);
  let best = null,
    bd = 1e9;
  for (let y = ty - 14; y <= ty + 14; y++)
    for (let x = tx - 14; x <= tx + 14; x++) {
      if (x < 2 || y < 2 || x >= MW - 2 || y >= MH - 2) continue;
      const i = y * MW + x;
      if (ground[i] === WATER || obj[i] !== 0) continue;
      const px = x * TS + 8,
        py = y * TS + 8;
      if (!faFree(px, py)) continue;
      const d = Math.hypot(px - a.x, py - a.y);
      if (d < bd) {
        bd = d;
        best = [px, py];
      }
    }
  if (best) {
    a.resc = true;
    a.cross = false;
    a.gx = best[0];
    a.gy = best[1];
    a.spd = FA_SP[a.sp].walk * a.sz;
    a.after = 'rest';
    a.adur = 4;
    a.state = 'go';
    a.stuck = 0;
  }
}

function faWadeSpot(p) {
  const tx = Math.floor(p[0] / TS),
    ty = Math.floor(p[1] / TS);
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const x = tx + dx,
      y = ty + dy;
    if (x < 2 || y < 2 || x >= MW - 2 || y >= MH - 2) continue;
    const i = y * MW + x;
    if (ground[i] === WATER && obj[i] === 0 && BDF[i] <= 1.3 && (WTc[i] === 7 || WTc[i] === 8))
      return [x * TS + 8, y * TS + 8];
  }
  return null;
}

function faCrossPick(a, sp) {
  // procura a outra margem, já descontando o que a correnteza vai arrastar
  const W = FA_WATER[a.sp];
  if (!W) return null;
  let best = null,
    bs = -1e9;
  for (let k = 0; k < 14; k++) {
    const an = Math.random() * 6.283,
      ca = Math.cos(an),
      sa = Math.sin(an);
    let inWt = 0,
      wat = 0,
      mid = null,
      land = null;
    for (let d = 6; d <= 170; d += 6) {
      const x = a.x + ca * d,
        y = a.y + sa * d,
        tx = Math.floor(x / TS),
        ty = Math.floor(y / TS);
      if (tx < 2 || ty < 2 || tx >= MW - 2 || ty >= MH - 2) break;
      const i = ty * MW + tx;
      if (obj[i] !== 0) break;
      if (ground[i] === WATER) {
        if (WTc[i] !== 7 && WTc[i] !== 8) break;
        wat++;
        inWt = 1;
        if (!mid) mid = [x, y];
      } else if (inWt) {
        if (faFree(x, y) && ground[i] === GRASS) {
          land = [x + ca * 8, y + sa * 8];
        }
        break;
      }
    }
    if (!land || wat < 2 || wat > 11 || !faFree(land[0], land[1])) continue;
    const m = flowAt(mid[0], mid[1]) * (0.1 + 0.8 * DEP[Math.floor(mid[1] / TS) * MW + Math.floor(mid[0] / TS)]);
    if (m > sp * W.v * 1.05) continue; // correnteza que arrasta demais: não atravessa
    const s = Math.random() - wat * 0.04;
    if (s > bs) {
      bs = s;
      best = land;
    }
  }
  return best;
}

function faCurrent(a, dt) {
  if (a.state === 'fly' || a.state === 'perch' || a.state === 'land' || a.z > 3) {
    a.inW = false;
    a.wd = 0;
    return;
  }
  const tx = Math.floor(a.x / TS),
    ty = Math.floor(a.y / TS);
  if (tx < 0 || ty < 0 || tx >= MW || ty >= MH) return;
  const i = ty * MW + tx,
    jag = a.sp === 'jaguar' || a.sp === 'anaconda';
  if (ground[i] !== WATER) {
    a.inW = false;
    a.wd = 0;
    a.dk = 0;
    a.wf = 1;
    if (!jag) a.sw = false;
    a.resc = false;
    if (a.cross && a.state !== 'go') a.cross = false;
    return;
  }
  const W = FA_WATER[a.sp] || { v: 0.5, wade: 1.5, sz: 1 },
    wd = DEP[i];
  a.inW = true;
  a.wd = wd;
  const k = (0.1 + 0.8 * wd) * W.sz;
  a.dk = k;
  if (a.cross && a.state !== 'go' && a.state !== 'flee') a.cross = false;
  if (!jag) {
    a.sw = wd > 0.35;
    a.wf = wd < 0.35 ? 0.85 : W.v * (a.stam < 0.25 ? 0.7 : 1);
  }
  if (flowAt(a.x, a.y) > 0.5) {
    const kk = a.state === 'dead' ? 1 : k,
      dx = FQX * kk * dt,
      dy = FQY * kk * dt; // a água leva o animal (carcaças flutuam rio abaixo)
    const ok = (x, y) => {
      const t2 = Math.floor(x / TS),
        t3 = Math.floor(y / TS);
      return t2 >= 2 && t3 >= 2 && t2 < MW - 2 && t3 < MH - 2 && obj[t3 * MW + t2] === 0;
    };
    if (ok(a.x + dx, a.y)) a.x += dx;
    if (ok(a.x, a.y + dy)) a.y += dy;
  }
  if (!jag && a.state !== 'dead') {
    if (a.sw) {
      a.stam = Math.max(0, a.stam - dt / (FA_SP[a.sp].stam * 1.6));
    } // nadar cansa
    a.rcd = (a.rcd || 0) - dt;
    if (
      a.sw &&
      a.rcd <= 0 &&
      ((a.stam < 0.2 && !a.resc) ||
        (!a.cross &&
          a.state !== 'go' &&
          a.state !== 'flee' &&
          a.state !== 'drink' &&
          a.state !== 'wallow' &&
          a.state !== 'fight' &&
          a.state !== 'eat'))
    ) {
      a.rcd = 0.6;
      faRescue(a);
    }
  }
}

export { FA_WATER, faCrossPick, faCurrent, faMove, faWadeSpot };
