/**
 * Hidrologia: nível da água, umidade do solo, lençol freático, nascentes, nutrientes, enchimento/transbordo do lago e painel de informações.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { GRASS, HN, HOUSE, MH, MW, OX, OY, PATH, ROCK, SOIL, TREE, TS, WATER } from '../../config/constants.js';
import { extensible } from '../../core/extensions.js';
import { S, sleeping } from '../../core/GameState.js';
import { sunInfo } from '../../core/TimeManager.js';
import { cowCanWalk } from '../../entities/cow/Cow.js';
import { spend } from '../../entities/Player.js';
import { amzBorn } from '../../features/amazon/AmazonTrees.js';
import { ctx } from '../../rendering/Canvas.js';
import { beep } from '../../systems/audio/AudioSystem.js';
import { target } from '../../systems/InteractionSystem.js';
import { dlgOpen } from '../../ui/Dialog.js';
import { toast } from '../../ui/Toast.js';
import { pk, pkE, rleDec, rleEnc, upk, upkE } from '../../utils/compression.js';
import { hash2, smooth } from '../../utils/MathUtils.js';
import { vnoise } from '../../utils/Noise.js';
import { GRASS_RES, grassDirty, grassWear, GW, setGrassDirty } from '../GrassSystem.js';
import { fvApply, fvDaily, fvDraw, fvFld, fvInfo, fvInit, fvPack, fvReset, fvTick } from './Fluvial.js';
import { drawPuddle, pdNear } from './Puddles.js';
import { flowInit } from './RiverFlow.js';
import { INST } from '../Instances.js';
import { shroom, shroomRoll } from '../Mushrooms.js';
import { seasonPhase, SEASONS, seasonUpdate, TINT, TINTSTR } from '../Seasons.js';
import { growthRate, plantDaily } from '../PlantSpecies.js';
import { crowd, drawSapling, treeDrop, treeFree } from '../Vegetation.js';
import { climate, clouds, rainAt } from '../WeatherSystem.js';
import { crops, ground, obj, wet } from '../World.js';
import { WORLD } from '../WorldData.js';

const KF = [1, 0.35, 1, 1, 1, 1.5, 0.12, 0.04, 0.2, 0.6]; // permeabilidade por chao (grama,caminho,terra,agua,pedra,areia,cascalho,neve,vau,leito)

const MELT = [0.0009, 0.0014, 0.0004, 0]; // degelo por estacao (primavera, verao, outono, inverno)

const WTc = new Uint8Array(MW * MH),
  PMUL = new Float32Array(MW * MH).fill(1),
  SNM = new Float32Array(MW * MH); // classe, chuva e neve da instancia carregada

function elevOf(h) {
  return h <= 0 ? h * 0.05 : h <= 30 ? h * 0.07 : h <= 130 ? 2.1 + (h - 30) * 0.04 : 6.1 + (h - 130) * 0.045;
} // altura do mapa -> relevo do jogo

const HKEY = 'valeDoCampo_hydro_v53m',
  HKEY_OLD = 'valeDoCampo_hydro_v1';

let HX0 = 1,
  HX1 = 97,
  HY0 = 1,
  HY1 = 65,
  HCX = -99,
  HCY = -99;
const WW = 96,
  WH = 64; // janela ativa da simulação (o resto do mundo fica "congelado" até você chegar perto)

function winN() {
  return Math.max(1, (HX1 - HX0) * (HY1 - HY0));
}

function hydroWin() {
  const cx = Math.floor(S.px / TS),
    cy = Math.floor(S.py / TS);
  if (Math.abs(cx - HCX) > 10 || Math.abs(cy - HCY) > 8) {
    HCX = cx;
    HCY = cy;
    HX0 = Math.max(1, Math.min(MW - 1 - WW, cx - WW / 2));
    HX1 = HX0 + WW;
    HY0 = Math.max(1, Math.min(MH - 1 - WH, cy - WH / 2));
    HY1 = HY0 + WH;
  }
}

let elev = new Float32Array(HN),
  wl = new Float32Array(HN),
  wl2 = new Float32Array(HN),
  sm = new Float32Array(HN),
  gwt = new Float32Array(HN),
  hmod = new Uint8Array(HN),
  mato = new Float32Array(HN),
  shade = new Float32Array(HN),
  wearT = new Float32Array(HN),
  seedAge = new Float32Array(HN),
  sapl = new Float32Array(HN),
  lakeTile = new Uint8Array(HN),
  lakeThr = new Float32Array(HN),
  ero = new Float32Array(HN),
  dg = new Float32Array(HN);

let lakeLevel = 1;

let nut = new Float32Array(HN).fill(0.5),
  prox = new Float32Array(HN);

let om = new Float32Array(HN).fill(0.05),
  bio = new Float32Array(HN).fill(0.3),
  treeSeen = new Uint8Array(HN); // matéria orgânica (folhas/corpos), atividade biológica (insetos+minhocas)

let hAcc = 0,
  hCnt = 0,
  lakeStore = 0,
  hStat = { riv: 0, spr: 0, sm: 0, gw: 0 };

const hydroInit = extensible(function hydroInit() {
  const wx0 = INST.cx * MW,
    wy0 = INST.cy * MH;
  for (let y = 0; y < MH; y++)
    for (let x = 0; x < MW; x++) {
      const i = y * MW + x,
        wi = (wy0 + y) * 1000 + wx0 + x,
        c = WORLD.T[wi];
      WTc[i] = c;
      PMUL[i] = WORLD.P[((wy0 + y) >> 2) * 250 + ((wx0 + x) >> 2)] / 80;
      SNM[i] = c === 6 ? PMUL[i] : 0;
      const e = elevOf(WORLD.H[wi] / 4 - 40); // relevo projetado: montanhas, colinas, planicie, praia (+ rugosidade fina do jogo)
      elev[i] =
        ground[i] === WATER ? e - 0.5 : e + (vnoise(x + wx0, y + wy0, 5, 2) - 0.5) * 0.08 - (c === 10 ? 0.06 : 0);
    }
  for (let y = 1; y < MH - 1; y++)
    for (let x = 1; x < MW - 1; x++) {
      const i = y * MW + x;
      shade[i] = Math.max(-0.5, Math.min(0.5, elev[i + MW + 1] - elev[i - MW - 1]));
    } // relevo iluminado a noroeste
  shroom.fill(0);
  mato.fill(40);
  seedAge.fill(0);
  sapl.fill(0);
  wl.fill(0);
  sm.fill(0.3);
  gwt.fill(0.25);
  hmod.fill(0);
  ero.fill(0);
  lakeStore = 0;
  for (let i = 0; i < HN; i++) lakeTile[i] = ground[i] === WATER && WTc[i] === 8 ? 1 : 0; // so lagos oscilam com o nivel; mar e rios sao permanentes
  lakeLevel = 1;
  lakeThrCompute();
  nutInit();
  om.fill(0.05);
  bio.fill(0.3);
  treeSeen.fill(0);
  for (let i = 0; i < HN; i++) {
    const pm = PMUL[i],
      c = WTc[i]; // umidade inicial do solo e do lencol: segue a chuva do mapa e a agua proxima
    sm[i] = Math.max(0.12, Math.min(0.55, 0.3 + 0.25 * (pm - 1)));
    gwt[i] = Math.max(0.1, Math.min(0.7, 0.25 + 0.2 * (pm - 1) + 0.25 * prox[i]));
    if (c === 2) {
      sm[i] = 0.2;
      gwt[i] = 0.45;
    } else if (c === 9) {
      sm[i] = 0.95;
      gwt[i] = 0.9;
    }
  }
  fvReset();
  flowInit();
  fvInit();
});

function nutInit() {
  const d = new Int16Array(HN).fill(-1),
    q = [];
  for (let i = 0; i < HN; i++)
    if (lakeTile[i] || WTc[i] === 7 || WTc[i] === 11) {
      d[i] = 0;
      q.push(i);
    } // agua doce (rio, lago, vau) fertiliza; o mar nao
  for (let h = 0; h < q.length; h++) {
    const i = q[h],
      x = i % MW;
    if (d[i] >= 30) continue;
    for (const j of [x > 0 ? i - 1 : -1, x < MW - 1 ? i + 1 : -1, i - MW, i + MW]) {
      if (j < 0 || j >= HN || d[j] >= 0) continue;
      d[j] = d[i] + 1;
      q.push(j);
    }
  }
  for (let i = 0; i < HN; i++) {
    const dd = d[i] < 0 ? 40 : d[i];
    prox[i] = Math.exp(-dd / 8);
    nut[i] = Math.max(
      0.04,
      Math.min(1, 0.12 + 0.78 * Math.exp(-dd / 9) + (vnoise(i % MW, (i / MW) | 0, 7, 5) - 0.5) * 0.3),
    );
  }
}

const hydroSave = extensible(function hydroSave() {
  try {
    localStorage.setItem(
      HKEY,
      JSON.stringify({
        v: 2,
        mw: MW,
        wl: pk(wl),
        sm: pk(sm),
        gwt: pk(gwt),
        hmod: rleEnc(hmod),
        mato: pk(mato, 1),
        seed: pk(seedAge, 1),
        sapl: pk(sapl),
        nut: pk(nut),
        om: pk(om),
        bio: pk(bio),
        ero: pkE(ero),
        lake: lakeStore,
        lt: rleEnc(lakeTile),
        ll: lakeLevel,
        shr: rleEnc(shroom),
        fv: fvPack(),
      }),
    );
  } catch (e) {}
});

const hydroLoad = extensible(function hydroLoad() {
  try {
    const d = JSON.parse(localStorage.getItem(HKEY) || 'null');
    if (!d || d.v !== 2 || d.mw !== MW) return;
    upk(d.wl, wl);
    upk(d.sm, sm);
    upk(d.gwt, gwt);
    hmod.set(rleDec(d.hmod, HN));
    upk(d.mato, mato, 1);
    upk(d.seed, seedAge, 1);
    upk(d.sapl, sapl);
    upk(d.nut, nut);
    upk(d.om, om);
    upk(d.bio, bio);
    upkE(d.ero, ero);
    lakeStore = d.lake || 0;
    shroom.set(rleDec(d.shr, HN));
    lakeTile.set(rleDec(d.lt, HN));
    lakeLevel = d.ll ?? 1;
    lakeThrCompute();
    fvApply(d.fv);
  } catch (e) {}
});

function ev(j) {
  return (
    elev[j] -
    ero[j] +
    (hmod[j] === 1 ? 1.5 : hmod[j] === 2 ? -0.4 : 0) +
    (obj[j] === HOUSE ? 3 : obj[j] === ROCK ? 0.6 : 0)
  );
}

/* ===== Lago transborda: quando cheio, a água sobe pelo relevo (vales primeiro) e extravasa pela borda mais baixa ===== */
let lakeOver = 0;

function lakeGrow() {
  if (lakeOver < 0.002) return;
  let best = -1,
    bc = 1e9;
  for (let y = 1; y < MH - 1; y++)
    for (let x = 1; x < MW - 1; x++) {
      const i = y * MW + x;
      if (ground[i] !== GRASS || (obj[i] && obj[i] !== TREE) || crops[i]) continue;
      if (
        !(lakeTile[i - 1] && ground[i - 1] === WATER) &&
        !(lakeTile[i + 1] && ground[i + 1] === WATER) &&
        !(lakeTile[i - MW] && ground[i - MW] === WATER) &&
        !(lakeTile[i + MW] && ground[i + MW] === WATER)
      )
        continue;
      const e = ev(i) + wl[i];
      if (e > 5) continue;
      if (e < bc) {
        bc = e;
        best = i;
      }
    }
  if (best < 0) {
    lakeOver = 0;
    return;
  }
  wl[best] = Math.min(0.5, wl[best] + Math.min(0.4, lakeOver * 25)); // vertedouro: escorre morro abaixo e escava um novo caminho
  const cost = 0.004 + Math.max(0, bc) * 0.004;
  if (lakeOver >= cost) {
    lakeOver -= cost;
    lakeTile[best] = 1;
    ground[best] = WATER;
    obj[best] = 0;
    delete crops[best];
    sapl[best] = 0;
    seedAge[best] = 0;
    wl[best] = 0;
    lakeThrCompute();
    setGrassDirty(true);
  } else lakeOver *= 0.9;
}

const hydroStep = extensible(function hydroStep() {
  const hasRain = clouds.length > 0,
    season = Math.floor((S.day - 1) / 28) % 4,
    SG = [1.3, 1, 0.6, 0.05][season];
  const rh = 0.45 + 0.45 * climate.cloud,
    evap =
      (0.0004 *
        (season === 1 ? 1.6 : season === 3 ? 0.6 : 1) *
        (0.3 + sunInfo(6 + S.min / 60).day) *
        (0.55 + 0.5 * climate.wind) *
        Math.max(0.08, 1 - rh)) /
      0.55; // Dalton: E=f(u)(es-ea)
  let spr = 0,
    ssm = 0,
    sgw = 0,
    riv = 0,
    msum = 0,
    mc = 0,
    snut = 0,
    hz = 0,
    dn = 0,
    rl = 0,
    lakeRain = 0,
    som = 0,
    sbio = 0;
  for (let hy = HY0; hy < HY1; hy++)
    for (let hx = HX0; hx < HX1; hx++) {
      const i = hy * MW + hx;
      if (ground[i] === WATER) {
        wl[i] = 0;
        if (hasRain && lakeTile[i]) lakeRain += rainAt((i % MW) * TS + 8, ((i / MW) | 0) * TS + 8) * 0.0013;
        continue;
      } // chuva direta no lago
      let w = wl[i];
      if (fvFld[i] > 0.01) w = fvFld[i];
      if (SNM[i] > 0) w += SNM[i] * MELT[season]; // degelo: neve das montanhas vira escoamento e alimenta os rios
      const kf = KF[ground[i]] * (1 - Math.min(0.7, wearT[i] * 1.2)),
        sat = 1 - smooth(0.85, 1, gwt[i]); // K do solo: compactado/pisoteado infiltra menos; lençol cheio bloqueia tudo (Dunne)
      const inf = Math.min(w, 0.02 * (1 - sm[i]) * kf * sat * (1 + bio[i] * 1.5)); // bioturbação: túneis de minhoca drenam melhor
      w -= inf;
      sm[i] += inf * 0.9;
      gwt[i] = Math.min(1, gwt[i] + inf * 0.3);
      if (hasRain) {
        const rin = rainAt((i % MW) * TS + 8, ((i / MW) | 0) * TS + 8) * 0.0013 * (obj[i] === TREE ? 0.6 : 1); // chuva (árvores interceptam)
        if (rin > 0) {
          const cap = 0.0016 * (1 - sm[i]) * kf * sat,
            ri = Math.min(rin, cap);
          sm[i] += ri * 0.9;
          gwt[i] = Math.min(1, gwt[i] + ri * 0.3);
          w += rin - ri; // i > f => excesso vira escoamento
          if (rin > cap) {
            if (gwt[i] >= 0.85) dn++;
            else hz++;
          }
        }
      }
      if (sm[i] < 0.4 && gwt[i] > 0.15) {
        const cp = (0.4 - sm[i]) * gwt[i] * 0.0012;
        sm[i] += cp;
        gwt[i] -= cp * 0.8;
      } // sucção matricial: seca puxa água do lençol
      if (ero[i] > 0.06) rl++;
      if (sm[i] > 0.5) {
        const dr = 0.0006 * (sm[i] - 0.4);
        sm[i] -= dr;
        gwt[i] = Math.min(1, gwt[i] + dr * 0.6);
      } // solo → lençol
      if (gwt[i] > 0.55 && elev[i] < 1.9) {
        const sp = (gwt[i] - 0.55) * 0.012;
        w += sp;
        gwt[i] -= sp * 0.35;
        spr++;
      } // nascentes
      gwt[i] = Math.max(0, gwt[i] - 0.00001);
      w = Math.max(0, w - evap);
      sm[i] = Math.max(0, sm[i] - evap * 0.5 - 0.00003);
      if (ground[i] === SOIL && (w > 0.04 || sm[i] > 0.8)) {
        wet[i] = 1;
        const c = crops[i];
        if (c) c.w = true;
      } // rega natural
      {
        let n = nut[i]; // NUTRIENTES: água => fértil, seco => pobre
        if (prox[i] > 0.01) sm[i] = Math.min(1, sm[i] + prox[i] * (0.3 + 0.7 * lakeLevel) * 0.0006 * (1 - sm[i])); // lençol/capilaridade perto do lago
        n += sm[i] > 0.4 ? (sm[i] - 0.4) * 0.00003 : -(0.4 - sm[i]) * 0.00002; // úmido decompõe e enriquece; seco empobrece
        if (w > 0.03) n += Math.min(w, 0.3) * 0.0004; // água corrente deposita sedimento (aluvião)
        n -= mato[i] * 3e-8; // vegetação consome
        {
          let o = om[i],
            b = bio[i]; // SOLO VIVO: serapilheira -> macrofauna/minhocas -> nutrientes
          if (obj[i] === TREE) {
            treeSeen[i] = 1;
            o += season === 2 ? 0.0005 : 0.0002;
          } // queda de folhas (mais no outono)
          else if (treeSeen[i] === 1) {
            treeSeen[i] = 2;
            o += 0.5;
          } // árvore cortada ou morta vira matéria orgânica
          o += mato[i] * 2e-8;
          const mo = sm[i],
            su = Math.max(0, 1 - Math.abs(mo - 0.6) * 2.6) * (w > 0.15 ? 0.3 : 1),
            tf = [0.9, 1, 0.65, 0.12][season],
            hab = ground[i] === PATH ? 0.3 : 1 - Math.min(0.7, wearT[i] * 1.2);
          b += (su * tf * hab * Math.min(1, 0.2 + o * 3) - b) * 0.003; // atividade: precisa de umidade, calor, alimento e solo não compactado
          const cv = Math.min(o, o * 5e-6 + b * (0.0001 + o * 0.0006)); // decomposição: libera NPK (n) a partir do "cofre"
          o -= cv;
          n += cv * 0.9;
          om[i] = o > 1 ? 1 : o;
          bio[i] = b;
          som += o;
          sbio += b;
        }
        nut[i] = n < 0.02 ? 0.02 : n > 1 ? 1 : n;
      }
      if (ground[i] === GRASS) {
        const tx0 = (i % MW) * GRASS_RES,
          ty0 = ((i / MW) | 0) * GRASS_RES;
        let ws = 0;
        for (let a = 0; a < GRASS_RES; a++)
          for (let b = 0; b < GRASS_RES; b++) ws += grassWear[(ty0 + a) * GW + tx0 + b];
        const wr = ws / (GRASS_RES * GRASS_RES * 255);
        wearT[i] = wr;
        var mb0 = mato[i];
        if (wr > 0.12)
          mato[i] = Math.max(0, mato[i] - 0.8); // pisoteado: mato morre e não cresce
        else {
          const g =
            (sm[i] > 0.4 ? (sm[i] - 0.4) * 0.28 : -0.05) *
              Math.max(0, 1 - Math.max(0, elev[i] - 2.2) * 0.25) *
              (1 - wr * 6) *
              SG -
            (season === 3 ? 0.02 : 0);
          mato[i] = Math.max(
            0,
            Math.min(
              255 * (0.3 + 0.7 * nut[i]),
              mato[i] + (g > 0 ? g * (0.25 + 1.5 * nut[i]) * growthRate(i) : g * (1.4 - nut[i])), // helicônia rápida, samambaia lenta
            ),
          );
        }
        if (mb0 <= 12 && mato[i] > 12) shroomRoll(i);
        msum += mato[i];
        snut += nut[i];
        mc++;
      }
      if (obj[i] === TREE) {
        nut[i] = Math.min(1, nut[i] + (season === 2 ? 0.00008 : 0.00002));
        if (Math.random() < 0.0003 * (season === 2 ? 3 : 1)) treeDrop(i);
      } // árvores soltam sementes (mais no outono)
      if (seedAge[i] > 0) {
        seedAge[i] += 0.2 * (1 + bio[i]);
        if (w > 0.1 || ground[i] !== GRASS || obj[i]) seedAge[i] = 0;
        else if (seedAge[i] > 20 && sm[i] > 0.45 && nut[i] > 0.3 && wearT[i] < 0.12 && crowd(i) <= 2 && !crops[i]) {
          sapl[i] = 0.01;
          seedAge[i] = 0;
        } // germina
        else if (seedAge[i] > 220) seedAge[i] = 0;
      }
      if (sapl[i] > 0) {
        if (wearT[i] > 0.2 || w > 0.25 || obj[i] || ground[i] !== GRASS)
          sapl[i] = 0; // pisoteada ou afogada: morre
        else {
          sapl[i] +=
            sm[i] > 0.3
              ? (sm[i] - 0.3) * 0.0015 * SG * (0.2 + 1.6 * nut[i])
              : sm[i] < 0.15 || nut[i] < 0.08
                ? -0.002
                : 0;
          if (sapl[i] >= 1) {
            if (treeFree(i)) {
              obj[i] = TREE;
              sapl[i] = 0;
              if (amzBorn) amzBorn(i);
            } else sapl[i] = 0.99;
          } else if (sapl[i] <= 0) sapl[i] = 0;
        }
      } // mato cresce com a umidade
      wl[i] = w;
      ssm += sm[i];
      sgw += gwt[i];
    }
  wl2.set(wl);
  const ls0 = lakeStore;
  if (hCnt % 5 === 0) {
    dg.fill(0); // Lei de Darcy: q=-K∇H entre vizinhos (H = relevo + lençol); lençol alimenta o lago (fluxo de base)
    for (let y = HY0; y < HY1; y++)
      for (let x = HX0; x < HX1; x++) {
        const i = y * MW + x;
        if (ground[i] === WATER) continue;
        const hi = elev[i] - ero[i] - (1 - gwt[i]) * 1.5;
        if (
          gwt[i] > 0.3 &&
          (ground[i + 1] === WATER || ground[i - 1] === WATER || ground[i + MW] === WATER || ground[i - MW] === WATER)
        ) {
          const q = (gwt[i] - 0.3) * 0.02;
          dg[i] -= q;
          if (lakeTile[i + 1] || lakeTile[i - 1] || lakeTile[i + MW] || lakeTile[i - MW]) lakeStore += q * 6;
        }
        for (const j of [i + 1, i + MW]) {
          if (ground[j] === WATER) continue;
          const hj = elev[j] - ero[j] - (1 - gwt[j]) * 1.5,
            d = hi - hj,
            K = 0.006 * (0.4 + 0.6 * (sm[i] + sm[j]) * 0.5);
          if (d > 0) {
            const q = Math.min(K * d, gwt[i] * 0.25);
            dg[i] -= q;
            dg[j] += q;
          } else {
            const q = Math.min(-K * d, gwt[j] * 0.25);
            dg[j] -= q;
            dg[i] += q;
          }
        }
      }
    for (let i = HY0 * MW, e = HY1 * MW; i < e; i++) if (dg[i]) gwt[i] = Math.max(0, Math.min(1, gwt[i] + dg[i]));
  }
  for (let y = HY0; y < HY1; y++)
    for (let x = HX0; x < HX1; x++) {
      // escoamento: vizinho de menor superfície
      const i = y * MW + x,
        w = wl[i];
      if (w < 0.003 || fvFld[i] > 0.01) continue;
      const s = ev(i) + w;
      let best = s,
        bj = -1;
      for (let oy = -1; oy <= 1; oy++)
        for (let ox = -1; ox <= 1; ox++) {
          if (!ox && !oy) continue;
          const j = i + oy * MW + ox,
            ns = ev(j) + wl[j] + (ox && oy ? 0.03 : 0);
          if (ns < best) {
            best = ns;
            bj = j;
          }
        }
      if (bj < 0) continue;
      const f = Math.min(w * 0.5, (s - best) * 0.5);
      wl2[i] -= f;
      wl2[bj] += f;
      if (ground[bj] === WATER && lakeTile[bj]) lakeStore += f;
      const tau = w * (s - best),
        tc = 0.0035 + (mato[i] / 255) * 0.006; // τ0=ρgRS vs τc (vegetação protege): acima disso escava sulco e deposita aluvião a jusante
      if (tau > tc) {
        const er = Math.min(0.002, (tau - tc) * 0.04);
        ero[i] = Math.min(0.6, ero[i] + er);
        if (ground[bj] !== WATER) {
          ero[bj] = Math.max(-0.3, ero[bj] - er * 0.5);
          nut[bj] = Math.min(1, nut[bj] + er * 0.3);
        }
      }
    }
  for (let x = 0; x < MW; x++) {
    wl2[x] *= 0.5;
    wl2[(MH - 1) * MW + x] *= 0.5;
  }
  for (let y = 0; y < MH; y++) {
    wl2[y * MW] *= 0.5;
    wl2[y * MW + MW - 1] *= 0.5;
  }
  for (let x = HX0; x < HX1; x++) {
    wl2[HY0 * MW + x] *= 0.7;
    wl2[(HY1 - 1) * MW + x] *= 0.7;
  }
  for (let y = HY0; y < HY1; y++) {
    wl2[y * MW + HX0] *= 0.7;
    wl2[y * MW + HX1 - 1] *= 0.7;
  } // borda da janela drena
  {
    const inflow = lakeStore - ls0;
    const rawL = lakeLevel + (inflow + lakeRain) * 0.0009 - evap * 0.03;
    if (rawL > 1) lakeOver += rawL - 1;
    lakeLevel = Math.max(0.08, Math.min(1, rawL));
  } // chuva enche, sol evapora
  wl.set(wl2);
  lakeStore *= 1 - 0.0004 * (1 + evap * 400);
  if (hCnt % 25 === 0) {
    lakeApply();
    lakeGrow();
  }
  for (let i = HY0 * MW, e = HY1 * MW; i < e; i++) if (wl[i] > 0.04 && ground[i] !== WATER) riv += wl[i];
  if (++hCnt % 5 === 0) {
    hStat = {
      riv,
      spr,
      nut: snut / Math.max(1, mc),
      sm: ssm / winN(),
      gw: sgw / winN(),
      mato: msum / Math.max(1, mc) / 2.55,
      om: som / winN(),
      bio: sbio / winN(),
    };
    const el = document.getElementById('hydroInfo');
    if (el)
      el.textContent = `${SEASONS[Math.floor(seasonPhase()) % 4]} · Dia ${S.day} · Rios ${Math.round(riv * 100)} L · Lago ${Math.round(lakeLevel * 100)}% · Solo ${Math.round(hStat.sm * 100)}% · Lençol ${Math.round(hStat.gw * 100)}% · Nascentes ${spr} · Mato ${Math.round(hStat.mato)}% · Nutrientes ${Math.round(hStat.nut * 100)}% · Húmus ${Math.round(hStat.om * 100)}% · Biologia ${Math.round(hStat.bio * 100)}% · Horton ${hz} · Dunne ${dn} · Sulcos ${rl}${fvInfo()}`;
  }
});

function hydroTick(dt) {
  hydroWin();
  seasonUpdate();
  fvTick(dt);
  hAcc += dt;
  let n = 0;
  while (hAcc >= 0.2 && n < 1) {
    hydroStep();
    hAcc -= 0.2;
    n++;
  }
  if (hAcc > 0.6) hAcc = 0;
}

function hydroAdvance(n) {
  hydroWin();
  for (let k = 0; k < n; k++) hydroStep();
}

function lakeThrCompute() {
  // margem seca primeiro, centro por último
  const d = new Int16Array(HN),
    q = [];
  for (let y = 0; y < MH; y++)
    for (let x = 0; x < MW; x++) {
      const i = y * MW + x;
      if (!lakeTile[i]) continue;
      let edge = x === 0 || y === 0 || x === MW - 1 || y === MH - 1;
      for (const j of [i - 1, i + 1, i - MW, i + MW]) if (j >= 0 && j < HN && !lakeTile[j]) edge = true;
      if (edge) {
        d[i] = 1;
        q.push(i);
      }
    }
  let mx = 1;
  for (let h = 0; h < q.length; h++) {
    const i = q[h],
      x = i % MW;
    for (const j of [x > 0 ? i - 1 : -1, x < MW - 1 ? i + 1 : -1, i - MW, i + MW]) {
      if (j < 0 || j >= HN || !lakeTile[j] || d[j]) continue;
      d[j] = d[i] + 1;
      if (d[j] > mx) mx = d[j];
      q.push(j);
    }
  }
  for (let i = 0; i < HN; i++) lakeThr[i] = lakeTile[i] ? 0.08 + 0.85 * (1 - (d[i] - 1) / Math.max(1, mx - 1)) : 0;
}

function lakeApply() {
  let ch = false;
  for (let i = 0; i < HN; i++) {
    if (!lakeTile[i]) continue;
    if (ground[i] === WATER && lakeLevel < lakeThr[i]) {
      ground[i] = GRASS;
      wl[i] = 0;
      sm[i] = 0.95;
      mato[i] = 0;
      ch = true;
      shroomRoll(i);
    } else if (ground[i] === GRASS && lakeLevel > lakeThr[i] + 0.02 && treeFree(i)) {
      ground[i] = WATER;
      obj[i] = 0;
      delete crops[i];
      sapl[i] = 0;
      seedAge[i] = 0;
      ch = true;
    }
  }
  if (ch) setGrassDirty(true);
}

function drinkSpots() {
  const L = []; // qualquer margem de lago ou poça/rio com água (só perto da vaca)
  for (let ty = 17 + OY - 28; ty <= 17 + OY + 28; ty++)
    for (let tx = 22 + OX - 28; tx <= 22 + OX + 28; tx++) {
      const i = ty * MW + tx;
      if (ground[i] !== GRASS || obj[i]) continue;
      for (const fx of [-1, 1])
        if (ground[i + fx] === WATER) {
          L.push({ x: tx * TS + 8, y: ty * TS + 12, fx, src: 'lake' });
          break;
        }
      if (wl[i] > 0.12) L.push({ x: tx * TS + 8, y: ty * TS + 10, fx: tx & 1 ? 1 : -1, src: 'wet', i });
    }
  return L.filter((q) => cowCanWalk(q.x, q.y));
}

const hydroDaily = extensible(function hydroDaily() {
  // a cada dia que passa o mundo cresce/muda mesmo enquanto você dorme
  const s = Math.floor((S.day - 1) / 28) % 4,
    sg = [1.3, 1, 0.6, 0.05][s];
  for (let i = 0; i < HN; i++) {
    if (ground[i] === GRASS && wearT[i] < 0.12) {
      const el = Math.max(0, 1 - Math.max(0, elev[i] - 2.2) * 0.25);
      mato[i] = Math.max(
        0,
        Math.min(
          255 * (0.3 + 0.7 * nut[i]),
          mato[i] +
            (sm[i] > 0.3 ? 28 * sg * (0.4 + sm[i]) * el * (0.25 + 1.5 * nut[i]) * growthRate(i) : s === 3 ? -6 : -3),
        ),
      );
      plantDaily(i); // a helicônia que floresceu perde o caule e rebrota; a samambaia sofre em solo encharcado
    }
    // morte de árvores agora é decidida pelo ecossistema (ecoDaily)
    if (seedAge[i] > 0) seedAge[i] += 15;
    if (sapl[i] > 0 && sm[i] > 0.3) sapl[i] = Math.min(0.99, sapl[i] + 0.05 * sg * sm[i]);
  }
  fvDaily();
});

// Camadas translúcidas de tile inteiro que vêm em sequência (estação, sombra, nutrientes, umidade, húmus) são
// compostas na CPU e desenhadas com UM fillRect (antes: um por camada, cada um com uma string de cor). O resultado
// difere do original só pelo arredondamento de 8 bits (<= 1-2 níveis por canal). A ordem de desenho é mantida:
// a camada pendente é descarregada (flushLay) antes de qualquer coisa que não seja um tile inteiro.
let layR = 0,
  layG = 0,
  layB = 0,
  layA = 0;
function lay(r, g, b, a) {
  if (a <= 0) return;
  const k = layA * (1 - a),
    oa = a + k;
  layR = (r * a + layR * k) / oa;
  layG = (g * a + layG * k) / oa;
  layB = (b * a + layB * k) / oa;
  layA = oa;
}
function flushLay(x, y) {
  if (layA <= 0) return;
  ctx.fillStyle = `rgba(${Math.round(layR)},${Math.round(layG)},${Math.round(layB)},${layA.toFixed(3)})`;
  ctx.fillRect(x, y, TS, TS);
  layA = 0;
}

const drawHydro = extensible(function drawHydro(tx, ty, t) {
  const i = ty * MW + tx,
    x = tx * TS,
    y = ty * TS,
    w = wl[i],
    m = hmod[i],
    g = ground[i],
    sh = shade[i];
  fvDraw(i, tx, ty, x, y, g);
  layA = 0;
  if (g === GRASS && TINT[3] > 0.01) lay(TINT[0] | 0, TINT[1] | 0, TINT[2] | 0, TINT[3]); // cor da estação no chão
  if (seedAge[i] > 0) {
    flushLay(x, y);
    const sx = x + 6 + ((i * 7) % 5),
      sy = y + 10 + ((i * 3) % 4);
    ctx.fillStyle = '#7a4e22';
    ctx.fillRect(sx, sy, 2, 2);
    ctx.fillStyle = '#b27a3a';
    ctx.fillRect(sx, sy, 1, 1);
  }
  if (sapl[i] > 0) {
    flushLay(x, y);
    drawSapling(x, y, sapl[i]);
  }
  if (g !== WATER && Math.abs(sh) > 0.02) {
    if (sh > 0) lay(255, 250, 200, Math.min(0.2, sh * 0.8));
    else lay(10, 25, 45, Math.min(0.26, -sh * 0.9));
  }
  if (g !== WATER && ero[i] > 0.06) {
    flushLay(x, y);
    ctx.fillStyle = `rgba(78,52,32,${Math.min(0.34, ero[i] * 0.7)})`;
    ctx.fillRect(x + 2, y + 2, TS - 4, TS - 4);
  } // sulco/ravina
  if (g !== WATER) {
    if (g === GRASS) {
      const nu = nut[i];
      if (nu > 0.6) lay(18, 95, 45, Math.min(0.28, (nu - 0.6) * 0.7));
      else if (nu < 0.28) lay(196, 152, 76, Math.min(0.3, (0.28 - nu) * 1.1));
    }
    if (g === GRASS && w < 0.03) {
      if (sm[i] > 0.62) lay(25, 75, 50, Math.min(0.24, (sm[i] - 0.62) * 0.65));
      else if (sm[i] < 0.15) lay(210, 175, 70, 0.14);
    }
    if (pdNear(i, tx, ty)) {
      flushLay(x, y);
      drawPuddle(i, tx, ty, x, y, w, t);
    }
  }
  if (g !== WATER && (om[i] > 0.12 || bio[i] > 0.5)) {
    const o = om[i];
    if (o > 0.3) lay(60, 38, 22, Math.min(0.2, (o - 0.3) * 0.4)); // húmus escurece o solo
    flushLay(x, y);
    if (o > 0.12) {
      const nL = Math.min(5, 1 + ((o * 6) | 0));
      for (let k = 0; k < nL; k++) {
        const r = hash2(tx * 13 + k, ty * 7 + k * 3);
        ctx.fillStyle = r > 0.66 ? '#8a5a2b' : r > 0.33 ? '#b07a38' : '#6b4423';
        ctx.fillRect(x + 1 + Math.floor(r * 13), y + 1 + Math.floor(hash2(k + tx, ty * 5) * 13), 2, 1);
      }
    } // folhas no chão
    if (bio[i] > 0.5 && (w > 0.02 || climate.rain > 0.2) && hash2(tx * 3, ty * 5) > 0.75) {
      const bx = x + 4 + ((tx * 7) % 6),
        by = y + 8 + (ty % 4),
        u = Math.sin(t * 2 + tx + ty) > 0 ? 1 : 0;
      ctx.fillStyle = '#d98c8c';
      ctx.fillRect(bx, by + u, 1, 1);
      ctx.fillRect(bx + 1, by + 1 - u, 1, 1);
      ctx.fillRect(bx + 2, by + u, 1, 1);
    }
  } // minhocas sobem com a umidade
  flushLay(x, y);
  if (m === 1) {
    ctx.fillStyle = '#6b6b6b';
    ctx.fillRect(x + 1, y + 3, TS - 2, TS - 6);
    ctx.fillStyle = '#9a9a9a';
    ctx.fillRect(x + 1, y + 3, TS - 2, 2);
  } else if (m === 2) {
    ctx.fillStyle = 'rgba(55,36,22,.55)';
    ctx.fillRect(x, y + 4, TS, TS - 8);
  }
});

function hydroTool(kind) {
  if (sleeping || dlgOpen) return;
  const t = target();
  if (t.x < 2 || t.y < 2 || t.x >= MW - 2 || t.y >= MH - 2) return;
  const i = t.y * MW + t.x;
  if (ground[i] === WATER || obj[i]) {
    toast('Não dá para construir aqui');
    return;
  }
  hmod[i] = hmod[i] === kind ? 0 : kind;
  spend();
  beep(kind === 1 ? 180 : 300, 0.08, 'sine');
  toast(hmod[i] === 0 ? 'Removido' : kind === 1 ? '🧱 Represa construída' : '⛏️ Canal cavado');
}

/** Atualiza `HCX` a partir de outros módulos (as ligações importadas são somente leitura). */
export function setHCX(value) {
  HCX = value;
  return value;
}

/** Atualiza `HCY` a partir de outros módulos (as ligações importadas são somente leitura). */
export function setHCY(value) {
  HCY = value;
  return value;
}

/** Atualiza `lakeLevel` a partir de outros módulos (as ligações importadas são somente leitura). */
export function setLakeLevel(value) {
  lakeLevel = value;
  return value;
}

/** Atualiza `lakeStore` a partir de outros módulos (as ligações importadas são somente leitura). */
export function setLakeStore(value) {
  lakeStore = value;
  return value;
}

export {
  HCX,
  HCY,
  HKEY_OLD,
  HX0,
  HX1,
  HY0,
  HY1,
  PMUL,
  WTc,
  bio,
  drawHydro,
  drinkSpots,
  elev,
  ero,
  ev,
  gwt,
  hCnt,
  hStat,
  hmod,
  hydroAdvance,
  hydroDaily,
  hydroInit,
  hydroLoad,
  hydroSave,
  hydroStep,
  hydroTick,
  hydroWin,
  lakeLevel,
  lakeStore,
  lakeThrCompute,
  lakeTile,
  mato,
  nut,
  om,
  prox,
  sapl,
  seedAge,
  shade,
  sm,
  treeSeen,
  wearT,
  wl,
};
