/**
 * Abelhas nativas: colmeias nas árvores, coleta de mel, enxame agressivo quando a árvore é cortada e rainha procurando novo abrigo.
 *
 * Origem: Vale_do_Campo_V64.html (s13)
 */

import { PRICE } from '../../config/balance.js';
import { DAY_MIN, HN, MH, MW, TREE, TS, VH, VW, WATER } from '../../config/constants.js';
import { S, sleeping } from '../../core/GameState.js';
import { update } from '../../core/GameUpdate.js';
import { sunInfo, worldMin } from '../../core/TimeManager.js';
import { carcT } from '../../entities/Carcass.js';
import { cow } from '../../entities/cow/Cow.js';
import { herd } from '../../entities/cow/Herd.js';
import { chx, setChx } from '../../entities/farm/Chickens.js';
import { fox, setFox } from '../../entities/farm/FarmFoxes.js';
import { damagePlayer, envenenar } from '../../entities/PlayerHurt.js';
import { faRow, fauna } from '../../entities/wild/Fauna.js';
import { eat, giveItem } from './AmazonItems.js';
import { spawnPT } from './AmazonRender.js';
import { clamp, visTrees } from './AmazonTrees.js';
import { FALLING, fxAdd, LOGS } from './FallenLogs.js';
import { drawLitter, litter, litterDaily } from './Litter.js';
import { ctx } from '../../rendering/Canvas.js';
import { vcam } from '../../rendering/Renderer.js';
import { drawWeather } from '../../rendering/WeatherRenderer.js';
import { beep } from '../../systems/audio/AudioSystem.js';
import { actionA, target } from '../../systems/InteractionSystem.js';
import { ICONS, INV0, ITEMS, TOOLS } from '../../systems/InventorySystem.js';
import { chopHit } from '../../systems/Woodcutting.js';
import { dlgOpen } from '../../ui/Dialog.js';
import { toast } from '../../ui/Toast.js';
import { rleDec } from '../../utils/compression.js';
import { ecoTrees } from '../../world/ecology/TreeEcology.js';
import { drawPrints } from '../../world/GrassSystem.js';
import { qAdd, qIdx } from '../../world/village/Quests.js';
import { climate } from '../../world/WeatherSystem.js';
import { crops, ground, obj } from '../../world/World.js';

/* ---------------- colmeias ---------------- */
let HIVES = [],
  HIVE_INIT = false,
  hvId = 1,
  hvDay = -1,
  hvSeedT = 3,
  stingT = 0,
  stingBeepT = 0,
  hvBuzzT = 0;

const VEN = new WeakMap(),
  VLIM = { cow: 30, chx: 5, fox: 9, hare: 4, grouse: 4, deer: 22, boar: 22, jaguar: 30 };

const hvNearView = (x, y, m) => Math.abs(x - S.px) < VW / 2 + (m || 0) && Math.abs(y - S.py) < VH / 2 + (m || 0);

function mkHive(i, a, size) {
  const m = a.model(),
    bw = (m && (m.bw || m.tw)) || 8,
    H = (m && m.h) || 60,
    side = Math.random() < 0.5 ? -1 : 1,
    tx = i % MW,
    ty = (i / MW) | 0;
  return {
    id: hvId++,
    i,
    x: tx * TS + 8 + side * (bw * 0.3 + 2),
    y: (ty + 1) * TS,
    z: Math.round(H * (0.36 + 0.14 * Math.random())),
    side,
    size,
    honey: Math.round(size * 8),
    state: 'tree',
    queen: true,
    angry: 0,
    qt: 0,
    qx: 0,
    qy: 0,
    qz: 0,
    tgt: -1,
    lost: 0,
    pol: 0,
    born: worldMin(),
    bees: [],
    log: null,
    zh: 0,
    T: [],
    Tt: 0,
  };
}

function hiveSeed() {
  HIVE_INIT = true;
  for (const [i, a] of ecoTrees) {
    if (HIVES.length >= 7) break;
    if (!a.amz || a.st < 4 || obj[i] !== TREE || a.estagio === 'morta') continue;
    if (Math.random() < 0.05) HIVES.push(mkHive(i, a, 0.3 + Math.random() * 0.6));
  }
}

function hvFreeSite(x, y, minD) {
  const L = [];
  for (const [i, a] of ecoTrees) {
    if (!a.amz || a.st < 3 || obj[i] !== TREE || a.estagio === 'morta') continue;
    if (HIVES.some((h) => h.i === i && (h.state === 'tree' || h.state === 'moving'))) continue;
    const d = Math.hypot(a.x * TS + 8 - x, a.y * TS - y);
    if (d >= minD && d < 750) L.push([d, i, a]);
  }
  L.sort((p, q) => p[0] - q[0]);
  if (!L.length) return null;
  const p = L[Math.min(L.length - 1, (Math.random() * 3) | 0)];
  return p;
}

const hvCenter = (H) =>
  H.state === 'tree'
    ? { x: H.x, y: H.y, z: H.z }
    : H.state === 'ground'
      ? { x: H.x, y: H.y, z: 3 }
      : { x: H.qx, y: H.qy, z: H.qz };

function hvTargets(cx, cy, R) {
  const T = [],
    pw = ground[Math.floor(S.py / TS) * MW + Math.floor(S.px / TS)] === WATER;
  if (!S.inside && !pw && S.vida > 0 && Math.hypot(S.px - cx, S.py - cy) < R)
    T.push({ k: 'pl', o: S, x: S.px, y: S.py - 6 });
  for (const c of herd)
    if (!c.dead && Math.hypot(c.x - cx, c.y - cy) < R) T.push({ k: 'cow', o: c, x: c.x, y: c.y - 6 });
  for (const c of chx) if (Math.hypot(c.x - cx, c.y - cy) < R) T.push({ k: 'chx', o: c, x: c.x, y: c.y - 3 });
  for (const f of fox) if (Math.hypot(f.x - cx, f.y - cy) < R) T.push({ k: 'fox', o: f, x: f.x, y: f.y - 4 });
  for (const a of fauna)
    if (a.state !== 'dead' && !a.gone && Math.hypot(a.x - cx, a.y - cy) < R)
      T.push({ k: 'fa', o: a, x: a.x, y: a.y - 5 });
  return T;
}

function hvKill(t) {
  const o = t.o;
  try {
    if (t.k === 'cow') {
      if (herd.length > 1 && o !== cow && !o.dead) {
        o.dead = true;
        toast('🐝 ' + (o.name || 'Uma vaca') + ' morreu com as ferroadas das abelhas');
      }
    } else if (t.k === 'chx') {
      setChx(chx.filter((q) => q !== o));
      if (hvNearView(o.x, o.y, 40)) toast('🐝 Uma galinha morreu com as ferroadas');
    } else if (t.k === 'fox') {
      if (o.prey) {
        o.prey.holder = null;
        o.prey.state = 'andar';
        o.prey = null;
      }
      setFox(fox.filter((q) => q !== o));
      if (hvNearView(o.x, o.y, 40)) toast('🐝 Uma raposa foi morta pelas abelhas');
    } else if (t.k === 'fa') {
      try {
        o.state = 'dead';
        o.t = carcT(o.x, o.y);
        o.d0 = performance.now() / 1000;
        o.z = 0;
        o.row = faRow(o);
      } catch (e) {
        o.gone = true;
      }
      if (hvNearView(o.x, o.y, 40)) toast('🐝 Um animal selvagem morreu com as ferroadas das abelhas');
    }
  } catch (e) {
    console.error('hvKill', e);
  }
}

function hvSting(t, H) {
  H.angry = Math.max(H.angry, 20);
  if (t.k === 'pl') {
    // ferroada: tira vida e deixa veneno, que drena a estamina aos poucos (depois de um tempo, a estamina cai sozinha)
    damagePlayer(2.5, 'Abelhas');
    envenenar(3);
    const n = performance.now();
    if (n - stingT > 4500) {
      stingT = n;
      toast('🐝 Ferroadas! Vida perdida e veneno: a estamina cai aos poucos. Corra para longe da colmeia ou entre na água!');
    }
    if (n - stingBeepT > 250) {
      stingBeepT = n;
      beep(330, 0.05, 'sawtooth');
    }
    return;
  }
  const key = t.k === 'fa' ? t.o.sp || 'x' : t.k,
    v = (VEN.get(t.o) || 0) + 1;
  VEN.set(t.o, v);
  if (v >= (VLIM[key] || 14)) {
    VEN.delete(t.o);
    hvKill(t);
  }
}

function hvQueenLeaves(H) {
  const s = hvFreeSite(H.x, H.y, 60);
  if (!s) {
    H.qt = 45;
    return;
  }
  const [d, i, a] = s,
    N = mkHive(i, a, 0.06);
  N.state = 'moving';
  N.qx = H.x;
  N.qy = H.y;
  N.qz = 6;
  N.tgt = i;
  N.bees = H.bees;
  N.lost = H.lost;
  H.bees = [];
  H.queen = false;
  H.state = 'ground';
  H.angry = 0;
  H.abandon = 1;
  H.born = worldMin();
  HIVES.push(N);
  if (hvNearView(H.x, H.y, 160))
    toast(
      '👑 A rainha, protegida pelas operárias, partiu para fundar uma nova colmeia em outra árvore. O favo caído ficou para trás.',
    );
}

function hvDaily() {
  for (const H of HIVES.slice()) {
    if (H.state === 'tree' && obj[H.i] !== TREE) {
      H.state = 'ground';
      H.x = (H.i % MW) * TS + 8 + H.side * 8;
      H.y = ((H.i / MW) | 0) * TS + 14;
      H.z = 0;
      H.angry = 90;
      H.qt = 0;
    }
    if (H.queen && (H.state === 'tree' || H.state === 'ground')) {
      H.size = Math.min(1, H.size + (H.state === 'tree' ? 0.09 : 0.02));
      H.honey = Math.min(40, H.honey + H.size * 1.6);
      H.lost = Math.max(0, H.lost - 3);
      if (H.size > 0.25) {
        for (const k in crops) {
          const c = crops[k],
            x = (k % MW) * TS + 8,
            y = ((k / MW) | 0) * TS + 8;
          if (typeof c.d === 'number' && Math.hypot(x - H.x, y - H.y) < 220) {
            c.d += 0.3 * H.size;
          }
        }
      } // polinização
      if (H.state === 'tree' && H.size >= 0.85 && HIVES.length < 12 && Math.random() < 0.08) {
        // enxameação: metade da colônia sai com a rainha
        const s = hvFreeSite(H.x, H.y, 50);
        if (s) {
          const N = mkHive(s[1], s[2], 0.06);
          N.state = 'moving';
          N.qx = H.x;
          N.qy = H.y;
          N.qz = H.z;
          N.tgt = s[1];
          HIVES.push(N);
          H.size *= 0.6;
          if (hvNearView(H.x, H.y, 160))
            toast('🐝 Enxame! Uma nova rainha partiu com parte das abelhas para fundar outra colmeia.');
        }
      }
    }
    if (H.abandon && worldMin() - H.born > 4 * DAY_MIN) {
      HIVES.splice(HIVES.indexOf(H), 1);
    } // favo abandonado é consumido por traças
  }
}

function hvAction() {
  if (qIdx !== -1 || dlgOpen || S.inside || sleeping || !HIVES.length) return false;
  const t = target();
  if (t.x < 0 || t.y < 0 || t.x >= MW || t.y >= MH) return false;
  const px = t.x * TS + 8,
    py = t.y * TS + 8;
  let H = null;
  for (const h of HIVES)
    if (h.state === 'ground' && Math.hypot(h.x - px, h.y - py) < 16) {
      H = h;
      break;
    }
  if (!H) return false;
  const item = (ITEMS[S.sel] || {}).id;
  if (!(item === 'axe' || TOOLS.includes(item))) return false;
  if (H.angry > 0 && H.queen) {
    toast('🐝 As abelhas estão BRAVAS! Afaste-se e espere elas se acalmarem (ou a rainha partir).');
    H.angry = Math.max(H.angry, 30);
    return true;
  }
  if (H.honey >= 1) {
    const n = Math.max(1, Math.floor(H.honey));
    H.honey = 0;
    giveItem('mel', n);
    qAdd('mel', n);
    beep(560, 0.08, 'triangle');
    toast(
      '🍯 Você colheu ' +
        n +
        ' porção(ões) de mel do favo' +
        (H.queen ? '. As abelhas toleram porque estão calmas — mas não abuse.' : '.'),
    );
    if (H.queen) H.size = Math.max(0.05, H.size * 0.7);
    else HIVES.splice(HIVES.indexOf(H), 1);
    return true;
  }
  toast(
    '🐝 Colmeia ' +
      (H.queen ? 'com rainha' : 'abandonada') +
      ' · sem mel por enquanto. Operária ~1,2 cm vive ~6 semanas; rainha ~2 cm; a abelha que ferroa morre.',
  );
  return true;
}

/* ---------------- abelhas individuais ---------------- */
function bzMove(b, tx, ty, tz, sp, dt, jit) {
  const dx = tx - b.x,
    dy = ty - b.y,
    d = Math.hypot(dx, dy),
    k = Math.min(1, dt * 4);
  if (d > 0.8) {
    b.vx += ((dx / d) * sp - b.vx) * k;
    b.vy += ((dy / d) * sp * 0.85 - b.vy) * k;
  } else {
    b.vx *= 1 - k;
    b.vy *= 1 - k;
  }
  b.x += b.vx * dt + (jit ? (Math.random() - 0.5) * jit : 0);
  b.y += b.vy * dt + (jit ? (Math.random() - 0.5) * jit * 0.5 : 0);
  b.z += (tz - b.z) * Math.min(1, dt * 4);
  if (Math.abs(b.vx) > 5) b.f = b.vx > 0 ? 1 : -1;
  return d;
}

function hvSim(H, dt, C, day) {
  const angry = H.angry > 0 && H.queen,
    want = H.queen ? clamp(Math.round(4 + H.size * 18 - H.lost * 0.6), 3, 24) : 0;
  const tt = performance.now() / 1000;
  while (H.bees.length < want && H.bees.length < want && Math.random() < dt * 6) {
    H.bees.push({
      x: C.x,
      y: C.y,
      z: C.z,
      vx: 0,
      vy: 0,
      m: 'orb',
      t: 0,
      ph: Math.random() * 6.28,
      r: 7 + Math.random() * 18,
      f: 1,
      tx: C.x,
      ty: C.y,
      tz: C.z,
      tgt: null,
    });
  }
  while (H.bees.length > want) H.bees.pop();
  H.Tt -= dt;
  if (angry && H.Tt <= 0) {
    H.Tt = 0.35;
    H.T = hvTargets(C.x, C.y, H.state === 'moving' ? 70 : 130);
  }
  if (!angry) H.T = [];
  for (let q = H.bees.length - 1; q >= 0; q--) {
    const b = H.bees[q];
    b.t -= dt;
    if (angry) {
      if (b.m !== 'att' && b.m !== 'prot') {
        b.m = Math.random() < 0.68 ? 'att' : 'prot';
        b.tgt = null;
        b.t = 0;
      }
      if (b.m === 'att') {
        if (!b.tgt || !H.T.includes(b.tgt)) {
          b.tgt = H.T.length ? H.T[(Math.random() * H.T.length) | 0] : null;
        }
        if (!b.tgt) {
          b.m = 'prot';
          continue;
        }
        const d = bzMove(b, b.tgt.x + (Math.random() - 0.5) * 3, b.tgt.y, 5, 105, dt, 1.2);
        if (d < 4.5) {
          hvSting(b.tgt, H);
          H.bees.splice(q, 1);
          H.lost++;
          fxAdd({
            x: b.x,
            y: b.y,
            z: b.z,
            vx: (Math.random() - 0.5) * 8,
            vy: 0,
            vz: -6,
            life: 0.5,
            max: 0.5,
            c: '#e8b820',
            sz: 1,
            g: 80,
          });
          continue;
        } // perde o ferrão e morre
      } else {
        const a = b.ph + tt * (1.9 + b.r * 0.02);
        bzMove(
          b,
          C.x + Math.cos(a) * b.r,
          C.y + Math.sin(a) * b.r * 0.55,
          C.z + 3 + Math.sin(a * 1.3) * b.r * 0.4,
          72,
          dt,
          1.4,
        ); // guarda-costas da rainha
      }
    } else {
      if (b.m === 'att' || b.m === 'prot') {
        b.m = 'orb';
        b.t = 0;
      }
      if (b.m === 'orb') {
        if (b.t <= 0) {
          const a = Math.random() * 6.28,
            r = 3 + Math.random() * 10;
          b.tx = C.x + Math.cos(a) * r;
          b.ty = C.y + Math.sin(a) * r * 0.6;
          b.tz = C.z + (Math.random() - 0.5) * 6;
          b.t = 0.8 + Math.random() * 1.8;
          if (day && H.state !== 'moving' && Math.random() < 0.14) {
            b.m = 'for';
            b.t = 0;
            b.tgt = null;
          }
        }
        if (H.state === 'moving') {
          const a = b.ph + tt * 1.1;
          bzMove(
            b,
            C.x + Math.cos(a) * b.r * 1.4,
            C.y + Math.sin(a) * b.r * 0.8,
            C.z + 4 + Math.sin(a) * 5,
            34,
            dt,
            0.8,
          );
        } else bzMove(b, b.tx, b.ty, b.tz, 30, dt, 0.6);
      } else if (b.m === 'for') {
        if (!b.tgt) {
          let tgx = 0,
            tgy = 0,
            tgz = 7,
            ci = -1;
          const ks = Object.keys(crops);
          if (ks.length && Math.random() < 0.6) {
            for (let n = 0; n < 6; n++) {
              const k = +ks[(Math.random() * ks.length) | 0],
                x = (k % MW) * TS + 8,
                y = ((k / MW) | 0) * TS + 8;
              if (Math.hypot(x - C.x, y - C.y) < 220) {
                tgx = x;
                tgy = y;
                ci = k;
                break;
              }
            }
          }
          if (ci < 0) {
            const a = Math.random() * 6.28,
              r = 50 + Math.random() * 150;
            tgx = clamp(C.x + Math.cos(a) * r, 8, MW * TS - 8);
            tgy = clamp(C.y + Math.sin(a) * r * 0.6, 8, MH * TS - 8);
            tgz = 5 + Math.random() * 10;
          }
          b.tgt = { x: tgx, y: tgy, z: tgz, ci, h: 0 };
        }
        const d = bzMove(b, b.tgt.x, b.tgt.y, b.tgt.z, 48, dt, 0.5);
        if (d < 3) {
          b.tgt.h += dt;
          if (Math.random() < dt * 8)
            fxAdd({
              x: b.x,
              y: b.y,
              z: b.z - 1,
              vx: (Math.random() - 0.5) * 8,
              vy: 0,
              vz: 3,
              life: 0.5,
              max: 0.5,
              c: '#ffe27a',
              sz: 1,
              g: 20,
            });
          if (b.tgt.h > 1.3) {
            if (b.tgt.ci >= 0) {
              const c = crops[b.tgt.ci];
              if (c && typeof c.d === 'number') c.d += 0.12;
            }
            H.pol++;
            b.m = 'ret';
            b.tgt = null;
          }
        }
      } else if (b.m === 'ret') {
        if (bzMove(b, C.x, C.y, C.z, 48, dt, 0.4) < 4) {
          b.m = 'orb';
          b.t = 0;
        }
      } else {
        b.m = 'orb';
      }
    }
  }
}

function hvUpdate(dt) {
  if (!HIVE_INIT) {
    hvSeedT -= dt;
    if (hvSeedT <= 0 && ecoTrees.size > 20) hiveSeed();
  }
  if (S.day !== hvDay) {
    const first = hvDay < 0;
    hvDay = S.day;
    if (!first) {
      hvDaily();
      litterDaily();
    }
  }
  const day = sunInfo(6 + S.min / 60).day > 0.12 && climate.kind < 3;
  let sim = 0;
  hvBuzzT -= dt;
  for (const H of HIVES.slice()) {
    H.angry = Math.max(0, H.angry - dt);
    if (S.energy <= 0 && H.angry > 0 && Math.hypot(H.x - S.px, H.y - S.py) < 200) H.angry = Math.min(H.angry, 4); // o jogador desmaiou/fugiu: acalmam
    if (H.state === 'falling') {
      const F = FALLING.find((f) => f.L === H.log);
      if (F && H.log) {
        const t = F.t,
          a =
            t < 1 ? (Math.PI / 2) * t * t * (0.6 + 0.4 * t) : Math.PI / 2 - Math.sin(((t - 1) / 0.35) * Math.PI) * 0.1,
          L = H.log;
        H.x = L.x0 + L.dir * Math.sin(a) * H.zh;
        H.y = L.y0 + 3;
        H.z = Math.cos(a) * H.zh;
        H.qx = H.x;
        H.qy = H.y;
        H.qz = H.z;
      } else {
        const L = H.log;
        if (L) {
          H.x = L.x0 + L.dir * Math.min(H.zh, L.len + 10);
          H.y = L.y0 + 4;
        }
        H.z = 0;
        H.state = 'ground';
        H.qt = 0;
        H.angry = Math.max(H.angry, 90);
      }
    } else if (H.state === 'ground' && H.queen) {
      H.qt += dt;
      if (H.qt >= 60 && H.angry > 0 && !H.stay) {
        hvQueenLeaves(H);
        if (H.state === 'ground' && H.queen && H.qt >= 60) H.qt = 50;
      }
      if (!H.abandon) {
        for (const f of fauna) {
          if ((f.sp === 'boar' || f.sp === 'jaguar') && f.state !== 'dead' && Math.hypot(f.x - H.x, f.y - H.y) < 20)
            H.angry = Math.max(H.angry, 35);
        }
      } // predador no favo caído
    } else if (H.state === 'moving') {
      const tr = ecoTrees.get(H.tgt);
      if (!tr || obj[H.tgt] !== TREE) {
        const s = hvFreeSite(H.qx, H.qy, 0);
        if (s) {
          H.tgt = s[1];
          H.i = s[1];
          const m = s[2].model();
          H.x = (s[1] % MW) * TS + 8;
          H.y = ((s[1] / MW) | 0) * TS + TS;
          H.z = Math.round(((m && m.h) || 60) * 0.45);
        } else {
          H.state = 'ground';
          H.x = H.qx;
          H.y = H.qy;
          H.z = 0;
          H.stay = 1;
        }
      } else {
        const dx = H.x - H.qx,
          dy = H.y - H.qy,
          d = Math.hypot(dx, dy);
        if (d > 3) {
          H.qx += (dx / d) * 28 * dt;
          H.qy += (dy / d) * 28 * dt;
        }
        H.qz += ((d < 40 ? H.z : 12 + Math.min(30, d * 0.2)) - H.qz) * Math.min(1, dt * 1.5);
        if (d <= 3 && Math.abs(H.qz - H.z) < 4) {
          H.state = 'tree';
          H.i = H.tgt;
          if (hvNearView(H.x, H.y, 160))
            toast('🏠 A rainha fundou uma colmeia nova e pequena numa árvore — ela vai crescer com o tempo.');
        }
      }
    }
    /* simulação visual só perto do jogador */
    if (!H.queen) {
      H.bees.length = 0;
      continue;
    }
    const C = hvCenter(H),
      near = hvNearView(C.x, C.y, 60);
    if (!near) {
      H.bees.length = 0;
      continue;
    }
    if (!day && H.angry <= 0) {
      H.bees.length = 0;
      continue;
    } // à noite/chuva ficam dentro
    if (sim < 4) {
      sim++;
      hvSim(H, dt, C, day);
      if (H.angry > 0 && hvBuzzT <= 0 && Math.hypot(C.x - S.px, C.y - S.py) < 150) {
        hvBuzzT = 0.28;
        beep(150 + Math.random() * 30, 0.06, 'sawtooth');
      }
    }
  }
}

/* ---------------- desenho ---------------- */
function drawHiveBody(H, X, Y, ground) {
  const s = H.size;
  if (ground) {
    const w = Math.round(6 + s * 9),
      h = Math.round(4 + s * 6),
      ab = !H.queen;
    ctx.fillStyle = 'rgba(0,0,0,.28)';
    ctx.beginPath();
    ctx.ellipse(X, Y + h * 0.7, w + 1, h * 0.55, 0, 0, 6.283);
    ctx.fill();
    ctx.fillStyle = ab ? '#6a5a40' : '#8a6a3a';
    ctx.beginPath();
    ctx.ellipse(X, Y, w, h, 0, 0, 6.283);
    ctx.fill();
    ctx.fillStyle = ab ? '#8a7a58' : '#b8903e';
    for (let k = -w + 3; k < w - 2; k += 4) {
      ctx.fillRect(X + k, Y - h + 2, 2, 1);
      ctx.fillRect(X + k + 2, Y, 2, 1);
      ctx.fillRect(X + k, Y + h - 3, 2, 1);
    }
    if (H.honey >= 1) {
      ctx.fillStyle = '#e8a820';
      ctx.fillRect(X - w + 3, Y + h - 2, 5, 2);
      ctx.fillRect(X + 2, Y + h - 3, 4, 3);
      ctx.fillStyle = '#ffd45a';
      ctx.fillRect(X - w + 4, Y + h - 2, 2, 1);
    }
    ctx.fillStyle = '#2a1a08';
    ctx.fillRect(X + w - 4, Y, 2, 2);
  } else {
    const w = Math.round(3 + s * 7),
      h = Math.round(5 + s * 10);
    ctx.fillStyle = '#7a6040';
    ctx.beginPath();
    ctx.ellipse(X, Y, w, h, 0, 0, 6.283);
    ctx.fill();
    ctx.fillStyle = '#a88a58';
    for (let k = -h + 3; k < h - 2; k += 3) ctx.fillRect(X - w + 2, Y + k, w * 2 - 3, 1);
    ctx.fillStyle = '#4a3a22';
    ctx.fillRect(X - w + 1, Y - h + 1, w * 2 - 2, 1);
    ctx.fillStyle = '#160d05';
    ctx.fillRect(X - 1, Y + h - 4, 3, 2);
    if (s > 0.5) {
      ctx.fillStyle = '#e8a820';
      ctx.fillRect(X + w - 3, Y + h - 4, 1, 3);
    }
  }
}

function drawBee(b, X, Y, angry) {
  const tt = performance.now(),
    fl = ((tt / 28) | 0) % 2;
  ctx.fillStyle = angry ? '#e0701a' : '#f0b820';
  ctx.fillRect(X - 1, Y, 2, 1);
  ctx.fillStyle = '#2a1c08';
  ctx.fillRect(X + (b.f > 0 ? 1 : -2), Y, 1, 1);
  ctx.fillStyle = 'rgba(255,255,255,.85)';
  ctx.fillRect(X - 1 + fl, Y - 1, 1, 1);
}

function drawQueen(H, X, Y) {
  const tt = performance.now() / 1000,
    ang = H.angry > 0;
  if (ang) {
    ctx.globalAlpha = 0.22 + 0.12 * Math.sin(tt * 6);
    ctx.fillStyle = '#ffd45a';
    ctx.beginPath();
    ctx.arc(X, Y, 7, 0, 6.283);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = '#d4a017';
  ctx.fillRect(X - 3, Y, 4, 2);
  ctx.fillStyle = '#8a5a10';
  ctx.fillRect(X - 2, Y, 1, 2);
  ctx.fillRect(X, Y, 1, 2);
  ctx.fillStyle = '#2a1c08';
  ctx.fillRect(X + 1, Y - 1, 2, 2);
  ctx.fillStyle = '#161010';
  ctx.fillRect(X + 3, Y, 1, 1);
  ctx.fillStyle = 'rgba(255,255,255,.8)';
  ctx.fillRect(X - 1, Y - 2, 3, 1);
  ctx.fillStyle = '#d83a3a';
  ctx.fillRect(X + 1, Y - 1, 1, 1); // marca vermelha (como a que apicultores usam)
}

function drawTopBees(camX, camY) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (const H of HIVES) {
    const C = hvCenter(H);
    if (!hvNearView(C.x, C.y, 40)) continue;
    if (H.state === 'tree' || H.state === 'falling') {
      const X = Math.round(C.x - camX),
        Y = Math.round(C.y - C.z - camY);
      drawHiveBody(H, X, Y, false);
    }
    for (const b of H.bees) {
      drawBee(b, Math.round(b.x - camX), Math.round(b.y - b.z - camY), H.angry > 0);
    }
    if (H.queen && (H.angry > 0 || H.state === 'moving')) {
      drawQueen(H, Math.round(C.x - camX), Math.round(C.y - C.z - camY));
    }
    /* etiqueta */
    if (Math.hypot(C.x - S.px, C.y - S.py) < 48) {
      const sz = H.size < 0.25 ? 'pequena' : H.size < 0.6 ? 'média' : 'grande',
        l1 = '🐝 Colmeia ' + sz + (H.queen ? '' : ' · abandonada') + (H.angry > 0 && H.queen ? ' · BRAVAS!' : ''),
        l2 =
          (H.queen ? H.bees.length + ' abelhas visíveis · ' : '') +
          (H.state === 'ground' ? 'favo no chão · ' : '') +
          'mel ' +
          Math.floor(H.honey);
      ctx.font = '7px "Segoe UI",system-ui,sans-serif';
      ctx.textAlign = 'center';
      const w = Math.max(ctx.measureText(l1).width, ctx.measureText(l2).width) + 8,
        x = clamp(C.x - camX, w / 2 + 2, VW - w / 2 - 2),
        y = Math.max(14, C.y - C.z - camY - 34);
      ctx.fillStyle = H.angry > 0 && H.queen ? 'rgba(90,14,10,.78)' : 'rgba(12,14,10,.72)';
      ctx.fillRect(Math.round(x - w / 2), Math.round(y), Math.round(w), 20);
      ctx.fillStyle = '#ffe9b0';
      ctx.fillText(l1, Math.round(x), Math.round(y + 8));
      ctx.fillStyle = '#cfe6c0';
      ctx.fillText(l2, Math.round(x), Math.round(y + 17));
    }
  }
  ctx.restore();
}

/* folhas soltas visíveis (pousam e se misturam ao solo) */

/* ---------------- salvar / carregar ---------------- */
function hivesPack() {
  if (!HIVE_INIT) return null;
  return HIVES.map((h) => {
    const o = Object.assign({}, h);
    delete o.bees;
    delete o.log;
    delete o.T;
    delete o.Tt;
    if (o.state === 'falling') o.state = 'ground';
    o.angry = 0;
    return o;
  });
}

function hivesLoad(a) {
  HIVES = [];
  if (Array.isArray(a)) {
    for (const o of a) {
      const h = Object.assign({ bees: [], log: null, T: [], Tt: 0, angry: 0, qt: 0, lost: 0, pol: 0 }, o, {
        bees: [],
        log: null,
        T: [],
        Tt: 0,
        angry: 0,
      });
      HIVES.push(h);
      hvId = Math.max(hvId, (h.id | 0) + 1);
    }
    HIVE_INIT = true;
  } else HIVE_INIT = false;
  hvSeedT = 3;
}

function litterLoad(s) {
  litter.fill(0);
  if (s) {
    try {
      litter.set(rleDec(s, HN));
    } catch (e) {}
  }
}

export function installBees() {
  /* ---------------- mel ---------------- */
  if (!ITEMS.some((x) => x.id === 'mel')) ITEMS.push({ id: 'mel', n: 'Mel' });

  ICONS.mel = '🍯';
  INV0.mel = 0;
  if (S && S.inv && S.inv.mel == null) S.inv.mel = 0;
  PRICE.mel = 60;

  actionA.extend(
    (_aHv) =>
      function () {
        try {
          if (hvAction()) return;
          const it = (ITEMS[S.sel] || {}).id;
          if (it === 'mel' && !S.inside) {
            eat('mel', 25, '🍯 Mel');
            return;
          }
        } catch (e) {
          console.error('hive action', e);
        }
        return _aHv.apply(this, arguments);
      },
  );

  chopHit.extend(
    (_chHv) =>
      function (i, dmg, mult) {
        const hs = HIVES.filter((h) => h.i === i && h.state === 'tree'),
          had = obj[i] === TREE;
        for (const h of hs) {
          if (h.angry <= 0) toast('🐝 As abelhas ficaram agitadas com as machadadas! Cuidado!');
          h.angry = Math.max(h.angry, 45);
        }
        _chHv.apply(this, arguments);
        if (had && obj[i] !== TREE && hs.length) {
          const L = LOGS.find((l) => l.i === i && l.falling);
          for (const h of hs) {
            h.angry = 130;
            h.qt = 0;
            h.zh = h.z;
            h.log = L || null;
            h.state = L ? 'falling' : 'ground';
            if (!L) {
              h.x = (i % MW) * TS + 8 + h.side * 10;
              h.y = ((i / MW) | 0) * TS + 14;
              h.z = 0;
            }
            toast(
              '🍯 A colmeia caiu junto com a árvore! As abelhas estão FURIOSAS — fuja! Em ~1 minuto a rainha procura outro lugar.',
            );
            beep(180, 0.3, 'sawtooth');
          }
        }
      },
  );

  drawPrints.extend(
    (_dprHv) =>
      function () {
        _dprHv.apply(this, arguments);
        if (S.inside) return;
        try {
          drawLitter();
          const cx = vcam ? vcam.x : 0,
            cy = vcam ? vcam.y : 0;
          for (const H of HIVES) {
            if (H.state !== 'ground') continue;
            if (H.x < cx - 30 || H.x > cx + VW + 30 || H.y < cy - 30 || H.y > cy + VH + 30) continue;
            drawHiveBody(H, Math.round(H.x), Math.round(H.y), true);
          }
        } catch (e) {
          if (!window.__hvErr) {
            window.__hvErr = 1;
            console.error('hive prints', e);
          }
        }
      },
  );

  drawWeather.extend(
    (_dwHv) =>
      function (t, camX, camY) {
        _dwHv.apply(this, arguments);
        if (S.inside || !HIVES.length) return;
        try {
          drawTopBees(camX, camY);
        } catch (e) {
          if (!window.__hvErr2) {
            window.__hvErr2 = 1;
            console.error('hive draw', e);
          }
        }
      },
  );

  update.extend(
    (_updHv) =>
      function (dt) {
        _updHv.apply(this, arguments);
        if (sleeping || S.inside) return;
        try {
          if (S.inv.mel == null) S.inv.mel = 0;
          hvUpdate(dt);
          for (let n = 0; n < visTrees.length && n < 8; n++) {
            const a = visTrees[n];
            if (obj[a.i] !== TREE || Math.random() > dt * 0.06) continue;
            const m = a.model();
            if (!m || !m.ready) continue;
            spawnPT({
              k: 'leaf',
              x: a.x * TS + 8 + (Math.random() - 0.5) * m.mw * 0.7,
              y: (a.y + 1) * TS + (Math.random() - 0.5) * 12,
              z: m.h * 0.5 + Math.random() * m.h * 0.3,
              vx: 3 + Math.random() * 6,
              vy: (Math.random() - 0.5) * 5,
              vz: -6 - Math.random() * 4,
              t: Math.random() * 6,
              life: 6 + Math.random() * 4,
              c: ['#2f7a45', '#47a14c', '#c7a23a', '#8a6a2e'][(Math.random() * 4) | 0],
            });
          }
        } catch (e) {
          if (!window.__hvErr3) {
            window.__hvErr3 = 1;
            console.error('hive update', e);
          }
        }
      },
  );

  window.ABELHAS = {
    init: () => [HIVE_INIT, hvSeedT],
    hives: () => HIVES,
    litter,
    seed: hiveSeed,
    daily: () => {
      hvDaily();
      litterDaily();
    },
  };
}

export { hivesLoad, hivesPack, litterLoad };
