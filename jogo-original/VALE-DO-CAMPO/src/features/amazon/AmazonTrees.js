/**
 * Espécies amazônicas (buriti, castanheira, sumaúma): sprites por fase, classe AmzArvore (crescimento, saúde, fenologia, serviços ambientais), luz e sementes.
 *
 * Origem: Vale_do_Campo_V64.html (s13)
 */
/* ============================================================================
   FLORESTA AMAZÔNICA — Buriti (Mauritia flexuosa), Castanheira-do-Pará (Bertholletia excelsa)
   e Sumaúma (Ceiba pentandra), com mecânicas ecológicas próprias:
   crescimento em 7 fases (alturas medidas no gráfico de escala), vento por altura,
   sombra projetada, luz/competição, alelopatia por espécie, fenologia (frutos por estação),
   dispersão (água, cutias, vento), colheita sustentável x extrativismo, raios, proteção legal.
   Escala do jogo: 2,8 px por metro (comprimida; as proporções entre espécies são mantidas).
   ============================================================================ */

import { GRASS, HN, MH, MW, TREE, TS, WATER } from '../../config/constants.js';
import { S } from '../../core/GameState.js';
import { assetUrl } from '../../utils/assets.js';
import { hash2 } from '../../utils/MathUtils.js';
import { alel } from '../../world/Allelopathy.js';
import { ArvoreRealista, ecoTemp, ecoTrees } from '../../world/ecology/TreeEcology.js';
import { gwt, mato, nut, om, prox, sapl, seedAge, sm, wl } from '../../world/hydrology/Hydrology.js';
import { treeRegion } from '../../world/Trees.js';
import { windNow } from '../../world/WeatherSystem.js';
import { crops, ground, obj } from '../../world/World.js';

const AMZ_DATA = {
  buriti: [
    { w: 13, h: 6, bw: 11, mw: 12, tw: 11, cb: 0.0, hm: 2.34, d: 'sprites/trees/amazon/buriti_0.webp' },
    { w: 17, h: 14, bw: 3, mw: 17, tw: 3, cb: 0.714, hm: 4.37, d: 'sprites/trees/amazon/buriti_1.webp' },
    { w: 21, h: 22, bw: 15, mw: 20, tw: 15, cb: 0.0, hm: 7.21, d: 'sprites/trees/amazon/buriti_2.webp' },
    { w: 23, h: 29, bw: 6, mw: 23, tw: 6, cb: 0.897, hm: 10.33, d: 'sprites/trees/amazon/buriti_3.webp' },
    { w: 31, h: 52, bw: 8, mw: 31, tw: 17, cb: 0.0, hm: 18.73, d: 'sprites/trees/amazon/buriti_4.webp' },
    { w: 33, h: 74, bw: 7, mw: 33, tw: 7, cb: 0.932, hm: 26.49, d: 'sprites/trees/amazon/buriti_5.webp' },
    { w: 43, h: 97, bw: 9, mw: 43, tw: 7, cb: 0.959, hm: 34.68, d: 'sprites/trees/amazon/buriti_6.webp' },
    { w: 48, h: 104, bw: 10, mw: 48, tw: 15, cb: 0.913, hm: 37.29, d: 'sprites/trees/amazon/buriti_7.webp' },
  ],
  sumauma: [
    { w: 15, h: 9, bw: 10, mw: 12, tw: 10, cb: 0.0, hm: 4.5, d: 'sprites/trees/amazon/sumauma_0.webp' },
    { w: 17, h: 14, bw: 5, mw: 15, tw: 5, cb: 0.0, hm: 3.79, d: 'sprites/trees/amazon/sumauma_1.webp' },
    { w: 30, h: 31, bw: 10, mw: 30, tw: 28, cb: 0.0, hm: 10.91, d: 'sprites/trees/amazon/sumauma_2.webp' },
    { w: 36, h: 55, bw: 9, mw: 36, tw: 31, cb: 0.0, hm: 19.62, d: 'sprites/trees/amazon/sumauma_3.webp' },
    { w: 53, h: 84, bw: 14, mw: 53, tw: 42, cb: 0.0, hm: 30.17, d: 'sprites/trees/amazon/sumauma_4.webp' },
    { w: 67, h: 130, bw: 39, mw: 67, tw: 13, cb: 0.962, hm: 46.41, d: 'sprites/trees/amazon/sumauma_5.webp' },
    { w: 83, h: 156, bw: 55, mw: 81, tw: 19, cb: 0.955, hm: 55.89, d: 'sprites/trees/amazon/sumauma_6.webp' },
    { w: 95, h: 186, bw: 62, mw: 94, tw: 20, cb: 0.957, hm: 66.44, d: 'sprites/trees/amazon/sumauma_7.webp' },
  ],
  castanheira: [
    { w: 17, h: 9, bw: 13, mw: 15, tw: 13, cb: 0.0, hm: 3.61, d: 'sprites/trees/amazon/castanheira_0.webp' },
    { w: 17, h: 14, bw: 5, mw: 15, tw: 5, cb: 0.0, hm: 2.49, d: 'sprites/trees/amazon/castanheira_1.webp' },
    { w: 14, h: 22, bw: 2, mw: 12, tw: 2, cb: 0.636, hm: 7.06, d: 'sprites/trees/amazon/castanheira_2.webp' },
    { w: 21, h: 40, bw: 3, mw: 19, tw: 12, cb: 0.0, hm: 14.2, d: 'sprites/trees/amazon/castanheira_3.webp' },
    { w: 35, h: 63, bw: 6, mw: 33, tw: 30, cb: 0.0, hm: 22.59, d: 'sprites/trees/amazon/castanheira_4.webp' },
    { w: 47, h: 94, bw: 12, mw: 46, tw: 8, cb: 0.957, hm: 33.43, d: 'sprites/trees/amazon/castanheira_5.webp' },
    { w: 62, h: 139, bw: 28, mw: 62, tw: 14, cb: 0.935, hm: 49.58, d: 'sprites/trees/amazon/castanheira_6.webp' },
    { w: 65, h: 138, bw: 27, mw: 65, tw: 13, cb: 0.949, hm: 49.42, d: 'sprites/trees/amazon/castanheira_7.webp' },
  ],
};

const K = 2.8,
  YEAR = 112,
  SPN = ['', 'buriti', 'castanheira', 'sumauma'];

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

const sstep = (a, b, x) => {
  x = clamp((x - a) / (b - a), 0, 1);
  return x * x * (3 - 2 * x);
};

const seasonNow = () => Math.floor((S.day - 1) / 28) % 4; // 0 Primavera 1 Verão 2 Outono 3 Inverno

const STAGE_NM = [
  'Semente',
  'Broto jovem',
  'Plântula',
  'Jovem',
  'Adolescente',
  'Adulto jovem',
  'Adulto gigante',
  'Adulto com frutos',
];

/* ---------------- parâmetros das espécies ---------------- */
const SP = {
  buriti: {
    id: 1,
    nome: 'Buriti',
    cient: 'Mauritia flexuosa',
    icon: '🌴',
    seed: 'seedB',
    ages: [0, 14, 38, 72, 118, 170],
    life: 1300,
    rate: 1,
    flex: 1.5,
    pw: 2.3,
    flut: 1.0,
    uptake: 0.02,
    alp: 0.2,
    sens: 0.5,
    hp: [260, 360, 520, 800, 1100, 1500, 1500],
    wood: [0, 0, 1, 1, 2, 3, 3],
    cont: 0.8,
  },
  castanheira: {
    id: 2,
    nome: 'Castanheira-do-Pará',
    cient: 'Bertholletia excelsa',
    icon: '🌳',
    seed: 'seedK',
    ages: [0, 20, 55, 105, 165, 250],
    life: 2800,
    rate: 1,
    flex: 0.8,
    pw: 2.8,
    flut: 0,
    uptake: 0.026,
    alp: 0.62,
    sens: 0.3,
    hp: [300, 420, 650, 1100, 1800, 3200, 3200],
    wood: [0, 0, 1, 2, 5, 9, 9],
    cont: 0.9,
  },
  sumauma: {
    id: 3,
    nome: 'Sumaúma',
    cient: 'Ceiba pentandra',
    icon: '🌳',
    seed: 'seedS',
    ages: [0, 8, 20, 38, 62, 92],
    life: 1500,
    rate: 1,
    flex: 1.0,
    pw: 2.5,
    flut: 0,
    uptake: 0.034,
    alp: 0.38,
    sens: 0.9,
    hp: [220, 320, 480, 800, 1300, 2300, 2300],
    wood: [0, 0, 1, 2, 4, 7, 7],
    cont: 0.95,
  },
};

const ALP_ST = [0, 0.15, 0.25, 0.4, 0.6, 0.85, 1, 1]; // potência aleloquímica cresce com a massa foliar

/* ---------------- sprites → modelos ---------------- */
const M = {};

/* ---------------- estado global do módulo ---------------- */
const amzSp = new Uint8Array(HN); // espécie da semente/muda no tile (1..3)

let amzDrops = []; // itens no chão: {i,x,y,k,n,age}

const PT = []; // partículas (folhas, paina, frondes)

const FALL = []; // frutos caindo (ouriços)

let BOLT = null;

let visTrees = [],
  visT = 0,
  flashPrev = 0,
  lastTip = 0;

/* ---------------- árvore amazônica (ecossistema) ---------------- */
class AmzArvore extends ArvoreRealista {
  constructor(x, y, esp) {
    super(x, y, esp);
    this.amz = true;
    this.sp = SP[esp];
    this.g = 0;
    this.st = 1;
    this.fr = 0;
    this.vig = 1;
    this.luz = 1;
    this.alA = 0;
    this.burn = 0;
    this.sx = hash2(x * 5 + 1, y * 3 + 7) < 0.5 ? 'f' : 'm';
    this.estagio = 'broto';
    this.tamanhoRaiz = 0.3;
    this.tamanhoCopa = 0.3;
    this.nIso = 0;
    this.aguaInterna = 60;
    this.nutrientesInternos = 40;
    this.refresh();
  }
  refresh() {
    const ag = this.sp.ages;
    let s = 1;
    for (let k = 1; k < 6; k++) if (this.g >= ag[k]) s = k + 1;
    if (s >= 6 && this.fr > 0) s = 7;
    this.st = s;
    this.tamanhoRaiz = [0, 0.3, 0.6, 1.2, 2, 3, 4, 4][s];
    this.tamanhoCopa = this.tamanhoRaiz;
    this.estagio =
      this.estagio === 'morta' ? 'morta' : s <= 2 ? 'broto' : s <= 4 ? 'jovem' : s <= 6 ? 'adulta' : 'ancia';
  }
  get i() {
    return this.y * MW + this.x;
  }
  model() {
    return M[this.especie][this.st];
  }
  height() {
    const m = this.model();
    return m ? m.h : 0;
  }
  maduro() {
    return this.g >= this.sp.ages[5];
  }
  /* luz que chega à copa: árvores mais altas sombreiam as mais baixas */
  lightFactor() {
    return lightAt(this.x, this.y, this.height(), this);
  }
  cicloDiario(mapa, clima) {
    if (this.estagio === 'morta') {
      this.decompor(mapa);
      return;
    }
    const i = this.i;
    if (obj[i] !== TREE) return;
    const sp = this.sp,
      nm = this.especie,
      s = sm[i],
      n = nut[i],
      w = wl[i],
      gw = gwt[i],
      px = prox[i];
    this.idade++;
    /* --- habitat: água e nutrientes (cada espécie tem seu nicho) --- */
    let W, N;
    if (nm === 'buriti') {
      const wi =
        0.4 * sstep(0.2, 0.55, s) +
        0.28 * sstep(0.25, 0.6, gw) +
        0.22 * sstep(0.05, 0.7, px) +
        0.1 * Math.min(1, w * 4);
      W = sstep(0.05, 0.34, wi);
      N = 0.6 + 0.4 * sstep(0.03, 0.2, n);
    } // palmeira de brejo/vereda: precisa de solo encharcado/lençol alto
    else if (nm === 'castanheira') {
      W = Math.max(sstep(0.12, 0.28, s), 0.55 * sstep(0.1, 0.3, gw)) * (1 - 0.85 * sstep(0.06, 0.3, w));
      N = 0.62 + 0.38 * sstep(0.02, 0.15, n);
    } // terra firme: raiz pivotante, odeia alagamento prolongado
    else {
      W = sstep(0.15, 0.32, s + 0.3 * gw + 0.15 * px);
      N = 0.45 + 0.55 * sstep(0.08, 0.35, n);
    } // sumaúma: várzea fértil, tolera cheia
    const L = this.lightFactor();
    this.luz = L;
    const al = (alel && alel[i]) || 0,
      sens = this.st >= 5 ? 0.16 : 0.55;
    this.alA = al;
    const Af = 1 - Math.min(0.5, al * sens * 1.1);
    const pot = clamp(W * N * Af, 0, 1);
    this.vig = pot;
    /* --- crescimento --- */
    let grow;
    if (nm === 'castanheira' && this.st <= 4)
      grow = pot * (0.16 + 0.84 * sstep(0.3, 0.75, L)); // banco de plântulas: espera uma clareira
    else if (nm === 'sumauma')
      grow = pot * (0.08 + 0.92 * sstep(0.25, 0.7, L)) * (this.st <= 4 ? 1.3 : 1); // pioneira: cresce muito rápido ao sol
    else grow = pot * (0.3 + 0.7 * sstep(0.2, 0.65, L));
    if (this.estagio !== 'morta' && this.burn) grow = 0;
    this.g += grow * sp.rate;
    /* --- saúde --- */
    let ds = pot < 0.25 ? -(0.25 - pot) * 22 : 3;
    if (nm === 'sumauma' && L < 0.22) ds -= 5;
    else if (nm === 'buriti' && L < 0.18) ds -= 2.5;
    if (this.idade > sp.life * 0.9) ds -= 1.5;
    if (this.burn) ds -= 6;
    this.saude = clamp(this.saude + ds, 0, 100);
    if (this.saude <= 0 || this.idade > sp.life) {
      this.estagio = 'morta';
      amzFlag('A ' + sp.nome + ' morreu (estresse/velhice) e vai virar adubo');
      return;
    }
    this.fenologia(i);
    this.servicos(i, pot);
    this.refresh();
  }
  /* --- fenologia: quando e quanto frutifica --- */
  fenologia(i) {
    const nm = this.especie,
      sI = seasonNow(),
      dd = (S.day - 1) % 28,
      st = this.st;
    if (nm === 'buriti') {
      // dioica: só fêmeas dão fruto, e precisam de pólen de um macho próximo
      if (this.maduro() && this.sx === 'f' && this.vig > 0.4 && (sI === 1 || sI === 2)) {
        if (dd % 7 === 0 && maleNear(this, 16)) this.fr = Math.min(4, this.fr + 1);
      } else if (sI === 3 || sI === 0) this.fr = Math.max(0, this.fr - 1);
      if (this.fr > 0 && Math.random() < 0.35) seedFall(this, 1, 1, 5, true); // frutos caem: sementes no brejo (hidrocoria)
    } else if (nm === 'castanheira') {
      // flores na primavera → ouriços amadurecem → caem no verão
      const cap = st >= 6 ? 6 : st >= 5 ? 2 : 0,
        viz = forestAround(this, 6),
        capEff = Math.round(cap * Math.min(1, viz / 4));
      this.nIso = viz;
      if (cap && (sI === 3 || sI === 0) && this.vig > 0.35 && dd % 5 === 0)
        this.fr = Math.min(capEff, this.fr + 1 + (Math.random() < 0.4 ? 1 : 0));
      if (sI === 1 && this.fr > 0) {
        const n = Math.max(1, Math.ceil(this.fr * 0.25));
        for (let k = 0; k < n && this.fr > 0; k++) {
          this.fr--;
          dropFruit(this, 'ourico');
        }
      }
      if (sI === 2 && this.fr > 0) {
        while (this.fr > 0) {
          this.fr--;
          dropFruit(this, 'ourico');
        }
      }
    } else {
      // sumaúma: floresce no seco (morcegos) → vagens racham e a paina voa
      if (st >= 5 && this.vig > 0.5 && sI === 3 && dd === 20) this.fr = Math.max(this.fr, st >= 6 ? 5 : 2);
      if (sI === 0 && this.fr > 0) {
        const wnd = windNow();
        if (wnd > 0.22 && Math.random() < 0.6) {
          this.fr--;
          burstPod(this, wnd);
        }
        if (dd >= 25 && this.fr > 0) {
          this.fr = 0;
        }
      }
      if (sI === 1 || sI === 2) this.fr = 0;
    }
  }
  /* --- serviços ambientais: sombra, raiz, água, serrapilheira, alelopatia --- */
  servicos(i, pot) {
    const nm = this.especie,
      st = this.st,
      sp = this.sp;
    const R = st >= 6 ? 3 : st >= 4 ? 2 : st >= 3 ? 1 : 0;
    /* absorção de água pelas raízes (raio cresce com a idade) e sombra que reduz a evaporação */
    const up = sp.uptake * (0.2 + 0.16 * st) * (0.5 + 0.5 * pot);
    let cnt = 0;
    for (let dy = -R; dy <= R; dy++)
      for (let dx = -R; dx <= R; dx++) {
        const x = this.x + dx,
          y = this.y + dy;
        if (x < 0 || y < 0 || x >= MW || y >= MH) continue;
        if (ground[y * MW + x] !== WATER) cnt++;
      }
    cnt = Math.max(1, cnt);
    for (let dy = -R; dy <= R; dy++)
      for (let dx = -R; dx <= R; dx++) {
        const x = this.x + dx,
          y = this.y + dy;
        if (x < 0 || y < 0 || x >= MW || y >= MH) continue;
        const j = y * MW + x;
        if (ground[j] === WATER) continue;
        sm[j] = Math.max(0.04, sm[j] - up / cnt);
      }
    if (nm !== 'buriti' && st >= 5 && gwt[i] > 0.25) {
      // elevação hidráulica: bombeia água profunda para o solo seco ao redor (à noite)
      const lift = 0.012 * (st - 4) * sstep(0.25, 0.7, gwt[i]);
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const x = this.x + dx,
            y = this.y + dy;
          if (x < 0 || y < 0 || x >= MW || y >= MH) continue;
          const j = y * MW + x;
          if (ground[j] === WATER) continue;
          if (sm[j] < 0.45) {
            sm[j] = Math.min(1, sm[j] + lift);
          }
        }
      gwt[i] = Math.max(0, gwt[i] - 0.002 * st);
    }
    /* sombra da copa: segura umidade, esfria, derruba o mato rasteiro e as lavouras */
    const cr = Math.min(4, Math.round(this.model().cr));
    if (st >= 3) {
      const dens = nm === 'buriti' ? 0.35 : 0.9;
      for (let dy = -cr; dy <= cr; dy++)
        for (let dx = -cr; dx <= cr; dx++) {
          const x = this.x + dx,
            y = this.y + dy,
            d = Math.hypot(dx, dy);
          if (d > cr + 0.3 || x < 0 || y < 0 || x >= MW || y >= MH) continue;
          const j = y * MW + x;
          if (ground[j] === WATER) continue;
          const k = (1 - d / (cr + 0.6)) * dens * Math.min(1, st / 6);
          sm[j] = Math.min(1, sm[j] + 0.006 * k);
          if (ground[j] === GRASS) mato[j] *= 1 - 0.07 * k;
          ecoTemp[j] = Math.max(16, ecoTemp[j] - 0.5 * k);
        }
    }
    /* serrapilheira: folhas caem (mais no seco) → matéria orgânica e nutrientes; sumaúma/castanheira soltam folhas na estiagem */
    const sI = seasonNow(),
      dry = sI === 3 || sI === 0;
    const leaf =
      (nm === 'sumauma' ? (dry ? 1.6 : 0.4) : nm === 'castanheira' ? (dry ? 1.1 : 0.4) : 0.5) * Math.min(1, st / 6);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const x = this.x + dx,
          y = this.y + dy;
        if (x < 0 || y < 0 || x >= MW || y >= MH) continue;
        const j = y * MW + x;
        if (ground[j] === WATER) continue;
        om[j] = Math.min(1, om[j] + 0.012 * leaf);
        nut[j] = Math.min(1, nut[j] + 0.003 * leaf);
      }
    /* pulso alelopático da queda de folhas (além da lixiviação pela névoa/chuva) */
    if (st >= 4 && alel) {
      const p = sp.alp * ALP_ST[st] * (dry ? 1 : 0.4) * 0.0055;
      for (let dy = -cr; dy <= cr; dy++)
        for (let dx = -cr; dx <= cr; dx++) {
          const x = this.x + dx,
            y = this.y + dy,
            d = Math.hypot(dx, dy);
          if (d > cr + 0.3 || x < 1 || y < 1 || x >= MW - 1 || y >= MH - 1) continue;
          const j = y * MW + x;
          if (ground[j] === WATER) continue;
          alel[j] = Math.min(1, alel[j] + p * (1 - d / (cr + 0.8)));
        }
    }
  }
  decompor(mapa) {
    const i = this.i;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const x = this.x + dx,
          y = this.y + dy;
        if (x < 0 || y < 0 || x >= MW || y >= MH) continue;
        const j = y * MW + x;
        if (ground[j] === WATER) continue;
        nut[j] = Math.min(1, nut[j] + 0.12);
        om[j] = Math.min(1, om[j] + 0.5);
      }
    this.removida = true;
  }
}

function amzFlag(m) {
  if (window.__amzLog) console.log('[amz]', m);
}

/* ---------------- vizinhança: luz, floresta, machos ---------------- */
function lightAt(tx, ty, myH, self) {
  let shade = 0;
  for (let dy = -8; dy <= 8; dy++)
    for (let dx = -8; dx <= 8; dx++) {
      if (!dx && !dy) continue;
      const x = tx + dx,
        y = ty + dy;
      if (x < 0 || y < 0 || x >= MW || y >= MH) continue;
      const j = y * MW + x;
      if (obj[j] !== TREE) continue;
      const a = ecoTrees.get(j);
      if (!a || a === self) continue;
      const m = a.amz ? a.model() : null,
        h = m ? m.h : 36;
      if (h < myH * 1.12 + 4) continue;
      const R = (m ? m.cr : 1.2) + 0.5,
        d = Math.hypot(dx, dy);
      if (d > R) continue;
      shade += (a.amz ? (a.especie === 'buriti' ? 0.45 : 0.85) : 0.7) * (1 - d / R) * Math.min(1, h / 60);
    }
  return clamp(1 - shade, 0.04, 1);
}

function forestAround(a, r) {
  let n = 0;
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) {
      if (!dx && !dy) continue;
      const x = a.x + dx,
        y = a.y + dy;
      if (x < 0 || y < 0 || x >= MW || y >= MH) continue;
      if (obj[y * MW + x] === TREE) n++;
    }
  return n;
}

let maleDay = -1,
  males = [];

function maleNear(a, r) {
  if (maleDay !== S.day) {
    maleDay = S.day;
    males = [];
    for (const [j, t] of ecoTrees)
      if (t.amz && t.especie === 'buriti' && t.sx === 'm' && t.maduro() && t.estagio !== 'morta') males.push(t);
  }
  for (const m of males) if (Math.hypot(m.x - a.x, m.y - a.y) <= r) return true;
  return false;
}

/* ---------------- sementes e frutos ---------------- */
function validSeedTile(x, y) {
  if (x < 2 || y < 2 || x >= MW - 2 || y >= MH - 2) return -1;
  const j = y * MW + x;
  if (ground[j] !== GRASS || obj[j] || crops[j] || sapl[j] || seedAge[j] || amzSp[j]) return -1;
  if (wl[j] > 0.2) return -1;
  return j;
}

function seedFall(a, spId, dmin, dmax, wetPref) {
  for (let t = 0; t < 4; t++) {
    const ang = Math.random() * 6.283,
      d = dmin + Math.random() * (dmax - dmin),
      x = a.x + Math.round(Math.cos(ang) * d),
      y = a.y + Math.round(Math.sin(ang) * d),
      j = validSeedTile(x, y);
    if (j < 0) continue;
    if (wetPref && sm[j] < 0.4 && t < 3) continue;
    amzSp[j] = spId;
    seedAge[j] = 1;
    return true;
  }
  return false;
}

function dropFruit(a, kind) {
  // item no chão sob a copa
  const m = a.model(),
    R = Math.max(1, Math.round(m.cr * 0.9));
  for (let t = 0; t < 6; t++) {
    const ang = Math.random() * 6.283,
      d = Math.random() * R,
      x = a.x + Math.round(Math.cos(ang) * d),
      y = a.y + Math.round(Math.sin(ang) * d * 0.8 + 1);
    if (x < 1 || y < 1 || x >= MW - 1 || y >= MH - 1) continue;
    const j = y * MW + x;
    if (ground[j] === WATER || obj[j] === TREE) continue;
    addDrop(j, kind, 1);
    return true;
  }
  return false;
}

function addDrop(j, kind, n, px, py) {
  const d = amzDrops.find((q) => q.i === j && q.k === kind && !q.pc);
  if (d) {
    d.n += n;
    return d;
  }
  const o = {
    i: j,
    x: px != null ? px : (j % MW) * TS + 4 + Math.random() * 8,
    y: py != null ? py : ((j / MW) | 0) * TS + 5 + Math.random() * 7,
    k: kind,
    n,
    age: 0,
  };
  amzDrops.push(o);
  return o;
}

function burstPod(a, wnd) {
  // vagem racha: paina voa a favor do vento (anemocoria)
  const n = 2 + Math.floor(Math.random() * 3) + Math.round(wnd * 2);
  for (let k = 0; k < n; k++) {
    const d = 4 + Math.random() * 24 * (0.4 + wnd),
      ang = (Math.random() - 0.5) * 0.9,
      x = a.x + Math.round(Math.cos(ang) * d),
      y = a.y + Math.round(Math.sin(ang) * d * 0.6 + (Math.random() - 0.5) * 4),
      j = validSeedTile(x, y);
    if (j >= 0 && Math.random() < 0.5) {
      amzSp[j] = 3;
      seedAge[j] = 1;
    }
  }
  if (Math.random() < 0.5) dropFruit(a, 'vagem');
}

/* ---------------- modelo → conversão e população do mundo ---------------- */
function mkTree(tx, ty, nm, stage, fresh) {
  const a = new AmzArvore(tx, ty, nm),
    ag = SP[nm].ages;
  a.g =
    stage <= 1 ? 0 : ag[stage - 1] + (fresh ? 0 : Math.random() * ((ag[stage] || ag[5] * 1.3) - ag[stage - 1]) * 0.9);
  a.idade = Math.round(a.g * 1.1);
  a.saude = 100;
  a.refresh();
  return a;
}

function amzUpgrade() {
  const lst = [];
  for (const [i, a] of ecoTrees) {
    if (a.amz || a.lg || a.estagio === 'morta') continue;
    lst.push([i, a]);
  }
  const plan = [];
  for (const [i, a] of lst) {
    const tx = i % MW,
      ty = (i / MW) | 0,
      reg = treeRegion(tx, ty);
    if (reg === 'orchard') {
      a.lg = 1;
      continue;
    }
    const r = hash2(tx * 7 + 3, ty * 11 + 5),
      wet = prox[i] > 0.42 || sm[i] > 0.6;
    let nm;
    if (wet) {
      nm = r < 0.5 ? 'buriti' : r < 0.72 ? 'sumauma' : r < 0.86 ? 'castanheira' : null;
    } else {
      nm = r < 0.62 ? 'castanheira' : r < 0.8 ? 'sumauma' : null;
    }
    if (!nm) {
      a.lg = 1;
      continue;
    }
    const q = hash2(tx * 13 + 7, ty * 17 + 1);
    plan.push({ i, tx, ty, nm, wet, st: q < 0.1 ? 2 : q < 0.22 ? 3 : q < 0.4 ? 4 : q < 0.62 ? 5 : 6 });
  }
  plan.sort((p, q) => q.st - p.st);
  const occ = []; // árvores grandes já aceitas
  const need = (st) => (st >= 6 ? 3.2 : st >= 5 ? 2.6 : st >= 4 ? 1.8 : 1);
  for (const p of plan) {
    let st = p.st;
    for (; st > 2; st--) {
      let ok = true;
      const r = need(st);
      for (const o of occ) {
        if (Math.hypot(o.tx - p.tx, o.ty - p.ty) < Math.max(r, need(o.st) * 0.8)) {
          ok = false;
          break;
        }
      }
      if (ok) break;
    }
    p.st = st;
    if (st >= 4) occ.push(p);
    else if (p.nm === 'sumauma') p.nm = p.wet ? 'buriti' : 'castanheira'; // sub-bosque: espécie tolerante à sombra
  }
  const sI = seasonNow();
  for (const p of plan) {
    const a = mkTree(p.tx, p.ty, p.nm, p.st, false);
    if (p.st >= 6) {
      // adultos já podem ter frutos conforme a estação
      if (p.nm === 'buriti' && a.sx === 'f' && (sI === 1 || sI === 2)) a.fr = 1 + Math.floor(Math.random() * 3);
      else if (p.nm === 'castanheira' && (sI === 3 || sI === 0)) a.fr = 1 + Math.floor(Math.random() * 3);
      else if (p.nm === 'sumauma' && sI === 3) a.fr = 2 + Math.floor(Math.random() * 3);
      a.refresh();
    }
    ecoTrees.set(p.i, a);
  }
}

function amzBorn(i) {
  const sp = amzSp[i];
  if (!sp) return;
  const a = mkTree(i % MW, (i / MW) | 0, SPN[sp], 1, true);
  a.saude = 100;
  ecoTrees.set(i, a);
  amzSp[i] = 0;
}

/* ---------------- renderização ---------------- */
const amzPad = () => ({ x: 9, up: 8, dn: 14 });

const amzBig = (tx, ty) => {
  const a = ecoTrees.get(ty * MW + tx);
  return !!(a && a.amz && a.st >= 3);
};

export function initAmazonTrees() {
  for (const nm of ['buriti', 'castanheira', 'sumauma']) {
    M[nm] = [];
    AMZ_DATA[nm].forEach((d, st) => {
      const m = {
        ready: false,
        w: d.w,
        h: d.h,
        bw: d.bw,
        mw: d.mw,
        tw: d.tw,
        cb: d.cb,
        amz: true,
        sp: nm,
        st,
        hm: d.hm,
        img: new Image(),
        sil: null,
        silC: null,
        rw: null,
        big: d.h >= 60,
        alp: st ? SP[nm].alp * ALP_ST[st] : 0,
        cr: Math.max(0.5, (d.mw / 2 / TS) * 0.85),
        cw: Math.max(8, d.bw * 0.8),
        rh: Math.min(40, Math.max(14, d.h * 0.3)),
        reach: d.h >= 60 ? Math.round(d.h * 1.4) : 0,
        hf: 0.62,
      };
      m.img.onload = () => {
        const c = document.createElement('canvas');
        c.width = d.w;
        c.height = d.h;
        const g = c.getContext('2d');
        g.drawImage(m.img, 0, 0);
        const id = g.getImageData(0, 0, d.w, d.h).data,
          rw = new Uint16Array(d.h);
        for (let y = 0; y < d.h; y++) {
          let n = 0;
          for (let x = 0; x < d.w; x++) if (id[(y * d.w + x) * 4 + 3] > 0) n++;
          rw[y] = n;
        }
        m.rw = rw;
        const s = document.createElement('canvas');
        s.width = d.w;
        s.height = d.h;
        const sg = s.getContext('2d');
        sg.drawImage(c, 0, 0);
        sg.globalCompositeOperation = 'source-in';
        sg.fillStyle = '#000';
        sg.fillRect(0, 0, d.w, d.h);
        m.sil = s;
        const cbRow = d.cb > 0 ? Math.max(6, Math.round(d.h * (1 - d.cb))) : Math.round(d.h * 0.5);
        m.cbRow = cbRow;
        const sc = document.createElement('canvas');
        sc.width = d.w;
        sc.height = cbRow + 2;
        sc.getContext('2d').drawImage(s, 0, 0, d.w, cbRow + 2, 0, 0, d.w, cbRow + 2);
        m.silC = sc;
        m.img = c;
        m.ready = true;
      };
      m.img.src = assetUrl(d.d);
      M[nm].push(m);
    });
  }

  window.amzSp = amzSp;

  window.AmzArvore = AmzArvore;
}

/** Atualiza `amzDrops` a partir de outros módulos (as ligações importadas são somente leitura). */
export function setAmzDrops(value) {
  amzDrops = value;
  return value;
}

/** Atualiza `BOLT` a partir de outros módulos (as ligações importadas são somente leitura). */
export function setBOLT(value) {
  BOLT = value;
  return value;
}

/** Atualiza `visTrees` a partir de outros módulos (as ligações importadas são somente leitura). */
export function setVisTrees(value) {
  visTrees = value;
  return value;
}

/** Atualiza `visT` a partir de outros módulos (as ligações importadas são somente leitura). */
export function setVisT(value) {
  visT = value;
  return value;
}

/** Atualiza `flashPrev` a partir de outros módulos (as ligações importadas são somente leitura). */
export function setFlashPrev(value) {
  flashPrev = value;
  return value;
}

export {
  AmzArvore,
  BOLT,
  FALL,
  M,
  PT,
  SP,
  SPN,
  STAGE_NM,
  YEAR,
  addDrop,
  amzBig,
  amzBorn,
  amzDrops,
  amzPad,
  amzSp,
  amzUpgrade,
  clamp,
  flashPrev,
  forestAround,
  lightAt,
  mkTree,
  seasonNow,
  validSeedTile,
  visT,
  visTrees,
};
