/**
 * Ecologia amazônica: derrubada com resistência por espécie, ciclo diário (crescimento, frutificação, dispersão), raios em árvores altas, partículas e persistência por instância.
 *
 * Origem: Vale_do_Campo_V64.html (s13)
 */

import { GRASS, HN, MH, MW, TREE, TS, WATER } from '../../config/constants.js';
import { S, sleeping } from '../../core/GameState.js';
import { update } from '../../core/GameUpdate.js';
import { newGame } from '../../core/NewGame.js';
import { spend } from '../../entities/Player.js';
import { damagePlayer } from '../../entities/PlayerHurt.js';
import { giveItem } from './AmazonItems.js';
import { spawnPT, visList } from './AmazonRender.js';
import {
  addDrop,
  AmzArvore,
  amzDrops,
  amzSp,
  amzUpgrade,
  BOLT,
  FALL,
  flashPrev,
  forestAround,
  lightAt,
  PT,
  seasonNow,
  setAmzDrops,
  setBOLT,
  setFlashPrev,
  setVisT,
  setVisTrees,
  SP,
  SPN,
  validSeedTile,
  visT,
  visTrees,
} from './AmazonTrees.js';
import { hivesLoad, hivesPack, litterLoad } from './Bees.js';
import { logsLoad, logsPack } from './FallenLogs.js';
import { litter, litterAdd } from './Litter.js';
import { beep } from '../../systems/audio/AudioSystem.js';
import { chop, chopHit, chopHP } from '../../systems/Woodcutting.js';
import { toast } from '../../ui/Toast.js';
import { rleDec, rleEnc } from '../../utils/compression.js';
import { alel } from '../../world/Allelopathy.js';
import {
  ecoDaily,
  ecoLoad,
  ecoPack,
  ecoStarted,
  ecoSync,
  ecoTrees,
  setEcoStarted,
  setEcoTrees,
} from '../../world/ecology/TreeEcology.js';
import { fvChopWarn } from '../../world/hydrology/Fluvial.js';
import { hydroInit, hydroLoad, hydroSave, sapl, seedAge, sm, wl } from '../../world/hydrology/Hydrology.js';
import { packChunk, unpackChunk } from '../../world/Instances.js';
import { treeDrop } from '../../world/Vegetation.js';
import { qAdd } from '../../world/village/Quests.js';
import { climate, windNow } from '../../world/WeatherSystem.js';
import { crops, ground, obj } from '../../world/World.js';
import { genNewChunk } from '../../world/WorldGen.js';

/* ---------------- derrubada ---------------- */

/* ---------------- ciclo diário ---------------- */

let _cropWarn = 0;

function amzDaily() {
  const sI = seasonNow();
  /* itens no chão: envelhecem; cutias abrem ouriços e enterram castanhas; vagens apodrecem */
  for (const d of amzDrops) {
    d.age++;
  }
  for (const d of amzDrops) {
    if (d.k === 'ourico' && d.age >= 2 && Math.random() < 0.32) {
      const tx = d.i % MW,
        ty = (d.i / MW) | 0,
        nuts = 1 + Math.floor(Math.random() * 3);
      let ok = false;
      if (forestAround({ x: tx, y: ty }, 5) >= 2) {
        // cutia só frequenta mata
        for (let q = 0; q < nuts; q++) {
          const ang = Math.random() * 6.283,
            r = 3 + Math.random() * 11,
            x = tx + Math.round(Math.cos(ang) * r),
            y = ty + Math.round(Math.sin(ang) * r),
            j = validSeedTile(x, y);
          if (j >= 0) {
            amzSp[j] = 2;
            seedAge[j] = 1;
            ok = true;
          }
        }
      }
      d.n--;
      if (ok && Math.random() < 0.6) toast('🐹 Uma cutia abriu um ouriço e enterrou castanhas pela mata…');
    }
    if (d.k === 'ourico') {
      /* a casca em decomposição libera fenóis no solo */ if (alel) alel[d.i] = Math.min(1, alel[d.i] + 0.05);
    }
    if (d.k === 'vagem' && d.age >= 3) d.n = 0;
    if (d.k === 'buriti' && d.age >= 6) d.n = 0;
    if (d.k === 'palha' && d.age >= 6) d.n = 0;
    if (d.age >= 14) d.n = 0;
  }
  setAmzDrops(amzDrops.filter((d) => d.n > 0));
  let big = 0;
  for (const [j, a] of ecoTrees) if (a.amz && a.st >= 5) big++;
  climate.wetness = Math.min(1, climate.wetness + Math.min(0.05, big * 0.0002)); // transpiração da floresta: "rios voadores" umedecem o ar
  /* sementes e mudas: nicho de cada espécie + alelopatia (sensibilidade por espécie, autotoxicidade de Janzen-Connell) */
  let cropHit = 0;
  for (let i = 0; i < HN; i++) {
    const sp = amzSp[i];
    if (sp) {
      const nm = SPN[sp],
        tx = i % MW,
        ty = (i / MW) | 0,
        a = (alel && alel[i]) || 0;
      if (obj[i] === TREE || ground[i] !== GRASS) {
        amzSp[i] = 0;
        continue;
      }
      if (seedAge[i] <= 0 && sapl[i] <= 0) {
        amzSp[i] = 0;
        continue;
      } // nada mais ali
      let near = null,
        nd = 9; // árvore adulta mais próxima (para Janzen-Connell)
      for (let dy = -3; dy <= 3; dy++)
        for (let dx = -3; dx <= 3; dx++) {
          const x = tx + dx,
            y = ty + dy;
          if (x < 0 || y < 0 || x >= MW || y >= MH) continue;
          const b = ecoTrees.get(y * MW + x);
          if (b && b.amz && b.st >= 5) {
            const d = Math.hypot(dx, dy);
            if (d < nd) {
              nd = d;
              near = b;
            }
          }
        }
      const same = near && near.especie === nm,
        sens = SP[nm].sens * (same ? 1.9 : 1),
        k = Math.min(1, a * sens * 1.6);
      const L = lightAt(tx, ty, 0, null);
      if (seedAge[i] > 0) {
        if (nm === 'buriti' && sm[i] < 0.35 && Math.random() < 0.3) {
          seedAge[i] = 0;
          amzSp[i] = 0;
          continue;
        } // seca: semente dessecada
        if (nm === 'sumauma' && L < 0.45 && Math.random() < 0.45) {
          seedAge[i] = 0;
          amzSp[i] = 0;
          continue;
        } // sem sol não germina
        if (nm === 'castanheira' && same && nd < 2.6 && Math.random() < 0.5) {
          seedAge[i] = 0;
          amzSp[i] = 0;
          continue;
        } // predação perto da mãe
        if (k > 0 && Math.random() < k * 0.35) {
          seedAge[i] = 0;
          amzSp[i] = 0;
          continue;
        } // inibição alelopática
      }
      if (sapl[i] > 0) {
        if (nm === 'buriti') {
          if (sm[i] < 0.45) sapl[i] -= 0.03;
          else if (sm[i] > 0.7 || wl[i] > 0) sapl[i] = Math.min(0.99, sapl[i] + 0.012);
        } else if (nm === 'castanheira') {
          if (wl[i] > 0.12) {
            sapl[i] = 0;
            amzSp[i] = 0;
            continue;
          }
          if (L < 0.4) sapl[i] = Math.min(sapl[i], 0.82);
          else sapl[i] = Math.min(0.99, sapl[i] + 0.01);
        } // espera a clareira
        else {
          if (L < 0.5) sapl[i] -= 0.05;
          else sapl[i] = Math.min(0.99, sapl[i] + 0.02);
        }
        if (k > 0) sapl[i] -= k * 0.06;
        if (sapl[i] <= 0) {
          sapl[i] = 0;
          amzSp[i] = 0;
        }
      }
    }
    const c = crops[i];
    if (c && alel) {
      const a = alel[i];
      if (a > 0.16 && c.d > 0 && Math.random() < Math.min(0.8, a * 1.3)) {
        c.d--;
        cropHit++;
      }
    }
  }
  /* lavoura sob copas grandes cresce mais devagar (luz) */
  for (const k in crops) {
    const c = crops[k];
    if (!c || c.d <= 0) continue;
    const j = +k;
    if (lightAt(j % MW, (j / MW) | 0, 0, null) < 0.55 && Math.random() < 0.5) {
      c.d--;
      cropHit++;
    }
  }
  if (cropHit > 0 && S.day !== _cropWarn) {
    _cropWarn = S.day;
    toast('🧪 Alelopatia/sombra: lavouras perto das árvores grandes estão atrofiando');
  }
}

/* ---------------- queda de frutos: criar um fruto caindo da copa ---------------- */
function fruitFall(a, kd, m, x, y, H) {
  if (a.fr <= 0) return false;
  a.fr--;
  try {
    a.refresh();
  } catch (e) {}
  m = m || a.model();
  if (!m) return false;
  if (x == null) {
    x = a.x * TS + 8;
    y = (a.y + 1) * TS;
  }
  H = H || m.h;
  const R = Math.max(2, m.mw * 0.35),
    gx = x + (Math.random() - 0.5) * 2 * R,
    gy = y - 4 + (Math.random() - 0.4) * 14;
  FALL.push({ x: gx, y: gy, z: H * 0.62, z0: H * 0.62, vz: 0, tx: a.x, ty: a.y, from: a.i, k: kd });
  return true;
}

const FRUIT_OF = { castanheira: 'ourico', buriti: 'buriti', sumauma: 'vagem' };

function shakeFruits(a, mult) {
  // golpe de machado sacode a copa: frutos maduros despencam
  const kd = FRUIT_OF[a.especie];
  if (!kd) return 0;
  if (a.fr <= 0) return 0;
  const m = a.model();
  if (!m) return 0;
  const want = 1 + (mult >= 8 ? 1 : 0) + (mult >= 14 ? 1 : 0);
  let n = 0;
  for (let k = 0; k < want && a.fr > 0 && FALL.length < 24; k++) {
    if (Math.random() < 0.45 + mult * 0.035) {
      if (fruitFall(a, kd, m)) n++;
    }
  }
  if (n) {
    const nm = { ourico: 'ouriço', buriti: 'cacho de buriti', vagem: 'vagem' }[kd];
    toast('🪓 A copa balançou: ' + (n > 1 ? n + ' frutos caíram' : 'caiu 1 ' + nm) + '! (olhe a sombra no chão)');
    for (let q = 0; q < 5; q++)
      spawnPT({
        k: 'leaf',
        x: a.x * TS + 8 + (Math.random() - 0.5) * 30,
        y: (a.y + 1) * TS - 4,
        z: 20 + Math.random() * 50,
        vx: (Math.random() - 0.5) * 12,
        vy: (Math.random() - 0.5) * 5,
        vz: -10,
        t: Math.random() * 6,
        life: 2.5,
        c: '#47a14c',
      });
  }
  return n;
}

/* queixadas comem frutos caídos */
function faFruitAt(tx, ty) {
  let v = 0;
  for (const d of amzDrops) {
    if (d.i === ty * MW + tx && (d.k === 'buriti' || d.k === 'ourico' || d.k === 'vagem')) v += 1.4;
  }
  return Math.min(2.2, v);
}

const faEatDrop = function (a) {
  for (let q = amzDrops.length - 1; q >= 0; q--) {
    const d = amzDrops[q];
    if (d.k !== 'buriti' && d.k !== 'ourico' && d.k !== 'vagem') continue;
    if (Math.hypot(d.x - a.x, d.y - a.y) < 14) {
      d.n--;
      a.hun = Math.max(0, a.hun - (d.k === 'ourico' ? 0.3 : 0.2));
      if (d.n <= 0) amzDrops.splice(q, 1);
      if (Math.hypot(S.px - a.x, S.py - a.y) < 150 && Math.random() < 0.4)
        toast(
          '🐗 A queixada devora ' +
            (d.k === 'ourico'
              ? 'um ouriço (rói a casca dura)'
              : d.k === 'buriti'
                ? 'frutos de buriti caídos'
                : 'uma vagem'),
        );
      return;
    }
  }
};

/* ---------------- por quadro: partículas, quedas, raios, coleta ---------------- */

let spawnAcc = 0;

function strikeTall() {
  const cx = S.px / TS,
    cy = S.py / TS,
    cand = [];
  let tot = 0;
  for (const [j, a] of ecoTrees) {
    if (!a.amz || a.st < 4 || a.estagio === 'morta' || obj[j] !== TREE) continue;
    if (Math.hypot(a.x - cx, a.y - cy) > 26) continue;
    const m = a.model();
    if (!m) continue;
    const wgt = Math.pow(m.h / 60, 3);
    cand.push([a, wgt]);
    tot += wgt;
  }
  if (!cand.length || Math.random() > 0.15) return;
  let r = Math.random() * tot,
    pick = cand[0][0];
  for (const [a, wg] of cand) {
    r -= wg;
    if (r <= 0) {
      pick = a;
      break;
    }
  }
  const m = pick.model();
  setBOLT({ x: pick.x * TS + 8, y: (pick.y + 1) * TS - m.h + 8, t: 0.28, seed: Math.random() * 100 });
  pick.saude = Math.max(0, pick.saude - (55 + Math.random() * 30));
  pick.burn = 1;
  if (pick.saude <= 0) pick.estagio = 'morta';
  toast(
    '⚡ Um raio atingiu ' +
      (pick.especie === 'sumauma' ? 'a sumaúma' : pick.especie === 'castanheira' ? 'a castanheira' : 'o buriti') +
      '! Árvores emergentes são os para-raios da floresta.',
  );
}

/* sementes de árvores amazônicas: o sistema antigo de queda de sementes não atua sobre elas */

/* ---------------- sincronização com o ecossistema, save/load ---------------- */

function restoreExtras(d) {
  let legacyOld = false;
  for (const r of d) {
    const x = r[9],
      i = r[0];
    if (x && x.m) {
      const nm = r[8];
      if (!SP[nm]) continue;
      const a = new AmzArvore(i % MW, (i / MW) | 0, nm);
      a.idade = r[1];
      a.saude = r[3];
      a.aguaInterna = r[4];
      a.nutrientesInternos = r[5];
      a.g = x.g;
      a.sx = x.sx;
      a.fr = x.fr || 0;
      a.burn = x.b || 0;
      if (r[2] === 'morta') a.estagio = 'morta';
      a.refresh();
      ecoTrees.set(i, a);
    } else if (x && x.lg) {
      const a = ecoTrees.get(i);
      if (a) a.lg = 1;
    } else legacyOld = true;
  }
  return legacyOld;
}

const AKEY2 = 'valeDoCampo_amz_v1';

function dropsPack() {
  return amzDrops.map((d) => [d.i, d.k, d.n, Math.round(d.x), Math.round(d.y), d.age]);
}

function dropsLoad(a) {
  setAmzDrops([]);
  if (Array.isArray(a))
    for (const r of a) amzDrops.push({ i: r[0], k: r[1], n: r[2], x: r[3], y: r[4], age: r[5] || 0 });
}

function amzLoad() {
  try {
    const d = JSON.parse(localStorage.getItem(AKEY2) || 'null');
    if (d && d.v === 1) {
      amzSp.set(rleDec(d.sp, HN));
      dropsLoad(d.dr);
      logsLoad(d.lg);
      litterLoad(d.lt);
      hivesLoad(d.hv);
    }
  } catch (e) {}
}

export function installAmazonEcology() {
  chopHit.extend(
    (_ch) =>
      function (i, dmg, mult) {
        const a = ecoTrees.get(i);
        if (!a || !a.amz || obj[i] !== TREE) return _ch.apply(this, arguments);
        const mx = a.sp.hp[a.st - 1],
          hp = (chopHP.has(i) ? chopHP.get(i) : mx) - dmg;
        spend();
        beep(110 + mult * 10, 0.07, 'sawtooth');
        const c = chop[i] || (chop[i] = { n: 0, t: 0 });
        c.n++;
        c.t = performance.now();
        if (hp > 0) {
          chopHP.set(i, hp);
          toast('🪓 x' + mult.toFixed(1) + ' · ' + a.sp.nome + ' ' + Math.max(0, Math.round((hp / mx) * 100)) + '%');
          try {
            shakeFruits(a, mult);
          } catch (e) {
            console.error('shake', e);
          }
          return;
        }
        chopHP.delete(i);
        delete chop[i];
        obj[i] = 0;
        try {
          fvChopWarn(i);
        } catch (e) {}
        ecoTrees.delete(i);
        const w = Math.max(1, a.sp.wood[a.st - 1] + Math.floor(Math.random() * 2)),
          sd = a.st >= 3 ? 1 + Math.floor(Math.random() * 2) : 1;
        giveItem('madeira', w);
        qAdd('madeira', w);
        giveItem(a.sp.seed, sd);
        let msg = '🌳 ' + a.sp.nome + ' derrubada! +' + w + ' madeira, +' + sd + ' semente(s)';
        if (a.especie === 'buriti') {
          const fr = a.fr * (4 + Math.floor(Math.random() * 3));
          if (fr > 0) {
            giveItem('buriti', fr);
            msg += ', +' + fr + ' frutos';
          }
          giveItem('palha', 2);
          msg += ' · extrativismo predatório: a palmeira morreu';
        }
        if (a.especie === 'castanheira') {
          if (a.fr > 0) giveItem('ourico', a.fr);
          if (a.st >= 4) {
            const fine = Math.min(S.coins, 150);
            S.coins -= fine;
            msg += ' · 🚨 MULTA de ' + fine + ' moedas: castanheira é protegida por lei (Dec. 5.975/2006)';
          }
        }
        if (a.especie === 'sumauma' && a.fr > 0) {
          giveItem('vagem', a.fr);
        }
        /* cipós ligam as copas: a queda de um gigante danifica as vizinhas e destrói mudas */
        if (a.st >= 5) {
          for (let dy = -3; dy <= 3; dy++)
            for (let dx = -3; dx <= 3; dx++) {
              const x = a.x + dx,
                y = a.y + dy;
              if (x < 0 || y < 0 || x >= MW || y >= MH) continue;
              const j = y * MW + x,
                b = ecoTrees.get(j);
              if (b && b !== a && j !== i) {
                b.saude = Math.max(1, b.saude - 35 + Math.hypot(dx, dy) * 6);
              }
              if (sapl[j] > 0 && Math.random() < 0.7) {
                sapl[j] = 0;
                amzSp[j] = 0;
              }
            }
          msg += ' · a queda arrastou as vizinhas (cipós)';
        }
        beep(90, 0.3, 'square');
        toast(msg);
        for (let q = 0; q < 14; q++)
          spawnPT({
            k: 'leaf',
            x: a.x * TS + 8 + (Math.random() - 0.5) * 40,
            y: (a.y + 1) * TS - 4,
            z: 20 + Math.random() * 60,
            vx: (Math.random() - 0.5) * 14,
            vy: (Math.random() - 0.5) * 6,
            vz: -10 - Math.random() * 14,
            t: Math.random() * 6,
            life: 3 + Math.random() * 2,
            c: ['#2f7a45', '#47a14c', '#6bb04a'][q % 3],
          });
      },
  );

  ecoDaily.extend(
    (_ed) =>
      function () {
        _ed.apply(this, arguments);
        try {
          amzDaily();
        } catch (e) {
          console.error('amzDaily', e);
        }
      },
  );

  update.extend(
    (_upd) =>
      function (dt) {
        _upd.apply(this, arguments);
        if (sleeping || S.inside) return;
        setVisT(visT - dt);
        if (visT <= 0) {
          setVisT(0.4);
          setVisTrees(visList());
        }
        const w = windNow(),
          sI = seasonNow(),
          dry = sI === 3 || sI === 0,
          lum = 1;
        spawnAcc += dt;
        for (const a of visTrees) {
          if (obj[a.i] !== TREE || a.estagio === 'morta') continue;
          const m = a.model();
          if (!m || !m.ready) continue;
          const x = a.x * TS + 8,
            y = (a.y + 1) * TS,
            H = m.h;
          /* paina de sumaúma voando a favor do vento */
          if (a.especie === 'sumauma' && a.fr > 0 && sI === 0 && Math.random() < dt * (0.8 + w * 3))
            spawnPT({
              k: 'kapok',
              x: x + (Math.random() - 0.5) * m.mw * 0.5,
              y: y + (Math.random() - 0.2) * 8,
              z: H * 0.78 + Math.random() * H * 0.1,
              vx: 5 + w * 20,
              vy: (Math.random() - 0.5) * 5,
              vz: -2 - Math.random() * 2.5,
              t: Math.random() * 6,
              life: 9 + Math.random() * 10,
            });
          /* folhas soltas pelo vento (mais no seco) */
          if (
            w > 0.45 &&
            Math.random() < dt * (0.15 + w * 0.9) * (dry ? 1.6 : 0.7) * (a.especie === 'buriti' ? 0.35 : 1)
          )
            spawnPT({
              k: 'leaf',
              x: x + (Math.random() - 0.5) * m.mw * 0.7,
              y: y + (Math.random() - 0.5) * 10,
              z: H * 0.55 + Math.random() * H * 0.35,
              vx: 8 + w * 16,
              vy: (Math.random() - 0.5) * 8,
              vz: -5 - Math.random() * 5,
              t: Math.random() * 6,
              life: 5 + Math.random() * 5,
              c: dry && Math.random() < 0.5 ? '#c7a23a' : ['#2f7a45', '#47a14c', '#6bb04a'][(Math.random() * 3) | 0],
            });
          /* frondes de buriti desprendidas em vento forte */
          if (a.especie === 'buriti' && w > 0.85 && Math.random() < dt * 0.25)
            spawnPT({
              k: 'frond',
              x: x,
              y: y + 4,
              z: H * 0.9,
              vx: 10 + w * 14,
              vy: (Math.random() - 0.5) * 8,
              vz: -14,
              t: Math.random() * 6,
              life: 7,
              c: '#2f7a45',
            });
          /* ouriços maduros despencam (verão/vento/chuva) com sombra de aviso */
          /* frutos maduros caem de tempos em tempos (cronômetro por árvore; vento e chuva apressam) */
          {
            const kd = a.especie === 'castanheira' ? 'ourico' : a.especie === 'buriti' ? 'buriti' : 'vagem',
              okSeason =
                a.especie === 'castanheira'
                  ? sI === 1 && a.st >= 5
                  : a.especie === 'buriti'
                    ? (sI === 1 || sI === 2) && a.st >= 4
                    : sI === 0 && a.st >= 5;
            if (a.fr > 0 && okSeason) {
              a.fT = (a.fT == null ? 20 + Math.random() * 50 : a.fT) - dt * (1 + w * 2.5 + climate.rain * 3);
              if (a.fT <= 0 && FALL.length < 14) {
                a.fT = 45 + Math.random() * 75;
                fruitFall(a, kd, m, x, y, H);
              }
            } else if (a.fT != null && a.fr <= 0) a.fT = null;
          }
          /* galho/fruto caindo de sumaúma em tempestade */
        }
        /* partículas */
        for (let q = PT.length - 1; q >= 0; q--) {
          const p = PT[q];
          p.t += dt;
          p.life -= dt;
          if (p.k === 'kapok' || p.k === 'leaf' || p.k === 'frond') {
            p.x += (p.vx + Math.sin(p.t * 2.4) * 5) * dt;
            p.y += (p.vy + Math.cos(p.t * 1.9) * 3) * dt;
            p.z += p.vz * dt;
            if (p.k !== 'frond' && p.z > 0) p.vz = Math.max(p.vz, p.k === 'kapok' ? -3 : -9);
          } else if (p.k === 'ember') {
            p.x += p.vx * dt;
            p.z += p.vz * dt;
          }
          if (p.z <= 0 || p.life <= 0) {
            if (p.z <= 0 && (p.k === 'leaf' || p.k === 'frond'))
              litterAdd(((p.y / TS) | 0) * MW + ((p.x / TS) | 0), p.k === 'frond' ? 16 : 7);
            if (p.k === 'frond' && p.z <= 0 && Math.random() < 0.5) {
              const j = ((p.y / TS) | 0) * MW + ((p.x / TS) | 0);
              if (j >= 0 && j < HN && ground[j] === GRASS && obj[j] !== TREE) addDrop(j, 'palha', 1, p.x, p.y);
            }
            PT.splice(q, 1);
          }
        }
        /* frutos em queda */
        for (let q = FALL.length - 1; q >= 0; q--) {
          const f = FALL[q];
          f.vz -= 190 * dt;
          f.z += f.vz * dt;
          if (f.z <= 0) {
            FALL.splice(q, 1);
            beep(75, 0.12, 'square');
            const fk = f.k || 'ourico';
            if (Math.hypot(S.px - f.x, S.py - 2 - f.y) < 10) {
              const dm = fk === 'ourico' ? 18 : fk === 'vagem' ? 6 : 5;
              damagePlayer(dm, fk === 'ourico' ? 'Um ouriço' : 'Um fruto');
              toast(
                '💥 ' +
                  (fk === 'ourico' ? 'Um ouriço' : fk === 'vagem' ? 'Uma vagem' : 'Um cacho de buriti') +
                  ' caiu na sua cabeça! −' +
                  dm +
                  ' de vida (cuidado com a sombra vermelha no chão)',
              );
            } else {
              const j = ((f.y / TS) | 0) * MW + ((f.x / TS) | 0);
              if (j >= 0 && j < HN && ground[j] !== WATER)
                addDrop(j, fk, fk === 'buriti' ? 2 + Math.floor(Math.random() * 3) : 1, f.x, f.y);
            }
          }
        }
        /* coleta ao andar por cima */
        if (amzDrops.length) {
          for (let q = amzDrops.length - 1; q >= 0; q--) {
            const d = amzDrops[q];
            if (Math.abs(d.x - S.px) < 9 && Math.abs(d.y - S.py) < 9) {
              giveItem(d.k, d.n);
              toast(
                (d.k === 'ourico'
                  ? '🥥 Ouriço coletado'
                  : d.k === 'vagem'
                    ? '🫘 Vagem coletada'
                    : d.k === 'buriti'
                      ? '🍊 Frutos de buriti coletados'
                      : '🌾 Palha de buriti') +
                  (d.n > 1 ? ' x' + d.n : '') +
                  (d.k === 'ourico' ? ' — abra com o machado (selecione o ouriço e use)' : ''),
              );
              beep(700, 0.06, 'triangle');
              amzDrops.splice(q, 1);
            }
          }
        }
        /* raios buscam as árvores emergentes mais altas */
        if (climate.flash > 0.3 && flashPrev < 0.15) {
          strikeTall();
        }
        setFlashPrev(climate.flash);
        if (BOLT) {
          BOLT.t -= dt;
          if (BOLT.t <= 0) setBOLT(null);
        }
        for (const [j, a] of ecoTrees) {
          if (a.amz && a.burn && Math.random() < dt * 0.6) {
            const m = a.model();
            if (m && visTrees.includes(a) && PT.length < 240)
              spawnPT({
                k: 'ember',
                x: a.x * TS + 8 + (Math.random() - 0.5) * m.mw * 0.4,
                y: (a.y + 1) * TS - 4,
                z: m.h * 0.7,
                vx: (Math.random() - 0.5) * 6,
                vz: 8 + Math.random() * 10,
                life: 1.4,
                t: 0,
                c: Math.random() < 0.5 ? '#ff9a2e' : '#ffd166',
              });
          }
        }
      },
  );

  treeDrop.extend(
    (_tdrop) =>
      function (i) {
        const a = ecoTrees.get(i);
        if (a && a.amz) return;
        return _tdrop.apply(this, arguments);
      },
  );

  ecoSync.extend(
    (_es) =>
      function () {
        const first = !ecoStarted;
        _es.apply(this, arguments);
        if (first) amzUpgrade();
      },
  );

  ecoPack.extend(
    (_epk) =>
      function () {
        const rows = _epk.apply(this, arguments);
        for (const r of rows) {
          const a = ecoTrees.get(r[0]);
          if (!a) continue;
          if (a.amz) r[9] = { m: 1, g: +a.g.toFixed(2), sx: a.sx, fr: a.fr, b: a.burn ? 1 : 0 };
          else r[9] = { lg: 1 };
        }
        return rows;
      },
  );

  ecoLoad.extend(
    (_elo) =>
      function (d) {
        _elo.apply(this, arguments);
        if (!Array.isArray(d)) return;
        if (restoreExtras(d)) amzUpgrade();
      },
  );

  packChunk.extend(
    (_pkc) =>
      function () {
        const r = _pkc.apply(this, arguments);
        r.amz = { sp: rleEnc(amzSp), dr: dropsPack(), lg: logsPack(), lt: rleEnc(litter), hv: hivesPack() };
        return r;
      },
  );

  unpackChunk.extend(
    (_upc) =>
      function (r) {
        _upc.apply(this, arguments);
        amzSp.fill(0);
        try {
          if (r.amz) {
            amzSp.set(rleDec(r.amz.sp, HN));
            dropsLoad(r.amz.dr);
            logsLoad(r.amz.lg);
            litterLoad(r.amz.lt);
            hivesLoad(r.amz.hv);
          } else {
            setAmzDrops([]);
            logsLoad([]);
            litterLoad(null);
            hivesLoad(null);
          }
        } catch (e) {
          setAmzDrops([]);
          logsLoad([]);
          litterLoad(null);
          hivesLoad(null);
        }
      },
  );

  genNewChunk.extend(
    (_gnc) =>
      function () {
        amzSp.fill(0);
        setAmzDrops([]);
        logsLoad([]);
        litterLoad(null);
        hivesLoad(null);
        PT.length = 0;
        FALL.length = 0;
        return _gnc.apply(this, arguments);
      },
  );

  hydroSave.extend(
    (_hsv2) =>
      function () {
        _hsv2.apply(this, arguments);
        try {
          localStorage.setItem(
            AKEY2,
            JSON.stringify({
              v: 1,
              sp: rleEnc(amzSp),
              dr: dropsPack(),
              lg: logsPack(),
              lt: rleEnc(litter),
              hv: hivesPack(),
            }),
          );
        } catch (e) {}
      },
  );

  hydroInit.extend(
    (_hi2) =>
      function () {
        _hi2.apply(this, arguments);
        amzSp.fill(0);
      },
  );

  hydroLoad.extend(
    (_hl2) =>
      function () {
        _hl2.apply(this, arguments);
        amzLoad();
      },
  );

  newGame.extend(
    (_ng) =>
      function () {
        const r = _ng.apply(this, arguments);
        amzSp.fill(0);
        setAmzDrops([]);
        logsLoad([]);
        litterLoad(null);
        hivesLoad(null);
        PT.length = 0;
        FALL.length = 0;
        setEcoTrees(new Map());
        setEcoStarted(false);
        ecoSync();
        return r;
      },
  );
}

export { amzLoad, faEatDrop, faFruitAt, fruitFall, restoreExtras, shakeFruits };
