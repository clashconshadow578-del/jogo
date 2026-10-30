/**
 * Mato e mudas: crescimento do mato, corte com a foice, mudas de árvores e desenho do mato que cobre os pés.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { GRASS, MH, MW, OX, OY, TREE, TS } from '../config/constants.js';
import { toolFx } from '../config/progression.js';
import { Q } from '../config/settings.js';
import { extensible } from '../core/extensions.js';
import { S } from '../core/GameState.js';
import { herd } from '../entities/cow/Herd.js';
import { npc, npcPos } from '../entities/NPC.js';
import { spend } from '../entities/Player.js';
import { ctx, mainCtx } from '../rendering/Canvas.js';
import { beep } from '../systems/audio/AudioSystem.js';
import { ITEMS } from '../systems/InventorySystem.js';
import { toast } from '../ui/Toast.js';
import { hash2 } from '../utils/MathUtils.js';
import { mato, sapl, seedAge, wearT, wl } from './hydrology/Hydrology.js';
import { climate } from './WeatherSystem.js';
import { crops, ground, obj } from './World.js';

function crowd(i) {
  let n = 0;
  const tx = i % MW,
    ty = (i / MW) | 0;
  for (let a = -1; a <= 1; a++)
    for (let b = -1; b <= 1; b++) {
      const x = tx + b,
        y = ty + a;
      if (x >= 0 && y >= 0 && x < MW && y < MH && obj[y * MW + x] === TREE) n++;
    }
  return n;
}

function treeFree(i) {
  const x = (i % MW) * TS + 8,
    y = ((i / MW) | 0) * TS + 8,
    n = npcPos();
  return (
    Math.hypot(x - S.px, y - S.py) > 16 &&
    herd.every((q) => Math.hypot(x - q.x, y - q.y) > 16) &&
    (npc.inside || Math.hypot(x - n.x, y - n.y) > 16)
  );
}

const treeDrop = extensible(function treeDrop(i) {
  const tx = i % MW,
    ty = (i / MW) | 0,
    a = Math.random() * 6.283,
    d = 1 + Math.floor(Math.random() * 3),
    x = tx + Math.round(Math.cos(a) * d),
    y = ty + Math.round(Math.sin(a) * d);
  if (x < 1 || y < 1 || x >= MW - 1 || y >= MH - 1 || (x >= 12 + OX && x <= 20 + OX && y >= 5 + OY && y <= 14 + OY))
    return;
  const j = y * MW + x;
  if (ground[j] === GRASS && !obj[j] && !crops[j] && !seedAge[j] && !sapl[j] && wl[j] < 0.05) seedAge[j] = 1;
});

function cutMato(cx, cy) {
  let n = 0,
    drops = 0;
  const fx = toolFx('scythe'),
    R = fx.radius; // 1 = 3x3 (básica); níveis maiores cortam 5x5 e 7x7
  for (let dy = -R; dy <= R; dy++)
    for (let dx = -R; dx <= R; dx++) {
      const x = cx + dx,
        y = cy + dy;
      if (x < 0 || y < 0 || x >= MW || y >= MH) continue;
      const j = y * MW + x;
      if (ground[j] === GRASS && mato[j] > 12) {
        const tall = mato[j] >= 128;
        mato[j] = 4;
        n++;
        if (Math.random() < (tall ? 0.025 : 0.005)) drops++;
      }
    }
  if (n) {
    spend(fx.energy);
    beep(260, 0.06, 'sawtooth');
    toast('✂️ Mato cortado em ' + n + ' tiles');
    const got = [];
    for (let k = 0; k < drops; k++) {
      const w = Math.random() * 7,
        sd = w < 1 ? 'seedP' : w < 4 ? 'seedC' : 'seedM';
      S.inv[sd]++;
      got.push(ITEMS.find((x) => x.id === sd).n);
    } // abóbora é a mais rara (1 de 7)
    if (got.length)
      setTimeout(() => {
        toast('🌱 Achou: ' + got.join(', ') + '!');
        beep(740, 0.12, 'triangle');
      }, 700);
  } else toast('Sem mato alto aqui');
} // área: 3x3 na foice básica, até 7x7 melhorada

const drawSapling = extensible(function drawSapling(x, y, s) {
  const h = 3 + s * 10,
    cx = x + 8,
    by = y + 14;
  ctx.fillStyle = '#5a3d24';
  ctx.fillRect(cx, by - h, 1 + (s > 0.5 ? 1 : 0), h);
  ctx.fillStyle = s > 0.6 ? '#2f7f3d' : '#4aa24a';
  ctx.beginPath();
  ctx.arc(cx + 0.5, by - h, 2 + s * 4, 0, 6.283);
  ctx.fill();
  ctx.fillStyle = 'rgba(170,230,120,.45)';
  ctx.fillRect(cx - 1, by - h - 2, 2, 1);
});

// A lista é reaproveitada a cada quadro (antes criava ~450 objetos por quadro: lixo para o coletor no celular).
const MATO_POOL = [],
  MATO_LIST = [];

function hydroMatoList(x0, x1, y0, y1) {
  const L = MATO_LIST;
  let n = 0;
  for (let ty = y0; ty <= y1; ty++)
    for (let tx = x0; tx <= x1; tx++) {
      const i = ty * MW + tx;
      if (ground[i] === GRASS && mato[i] > 25 && wl[i] < 0.03 && wearT[i] < 0.12 && !obj[i]) {
        const o = MATO_POOL[n] || (MATO_POOL[n] = { k: 0, tx: 0, ty: 0, i: 0 });
        o.k = ty * TS + 6;
        o.tx = tx;
        o.ty = ty;
        o.i = i;
        L[n++] = o;
      }
    }
  L.length = n;
  return L;
}

/**
 * Desenho original do mato, lâmina por lâmina (cerca de 1.200 chamadas por quadro numa fazenda). Fica como reserva do
 * desenho em imagens prontas (abaixo) e como referência dos testes (padrão; ?matocache liga as imagens prontas).
 * `ws` (balanço do vento) e `rs` (tremor quando o jogador está perto) vêm de drawMato.
 */
function drawMatoLive(tx, ty, t, i, ws, rs) {
  const m = mato[i] / 255,
    x = tx * TS,
    y = ty * TS,
    n = 2 + Math.floor(m * (Q() > 1 ? 11 : Q() > 0 ? 6 : 3)); // qualidade mínima: menos lâminas (menos chamadas)
  for (let k = 0; k < n; k++) {
    const r = hash2(tx * 17 + k * 5, ty * 29 + k * 3),
      r2 = hash2(k * 11 + tx, ty * 7 + k),
      bx = x + 1 + Math.floor(r * 14),
      by = y + 5 + Math.floor(r2 * 10),
      h = 2 + Math.round(m * (6 + r2 * 6)),
      lean = Math.round(ws * (h / 6) + rs);
    ctx.fillStyle = r > 0.6 ? '#2f7a34' : r > 0.3 ? '#3f9a42' : '#58b04c';
    ctx.fillRect(bx + lean, by - h, 1, h);
    if (m > 0.5 && r2 > 0.7) {
      ctx.fillStyle = '#8fd36a';
      ctx.fillRect(bx + lean, by - h, 1, 1);
    }
  }
}

/* ===== Mato em imagens prontas (fase 3 da migração) =====
 * O mato é feito só de retângulos OPACOS de 1 px de largura, então cada tile pode virar uma imagem pequena que é copiada
 * com 1 chamada, no lugar de 3 a 13 retângulos. A imagem só é refeita quando o vento muda a inclinação de alguma lâmina
 * (a inclinação é um número inteiro de pixels, então muda poucas vezes por segundo). Pixels opacos copiados = os mesmos
 * pixels dos retângulos: o resultado é IDÊNTICO ao desenho original (conferido em tests/perf/ab-equal.mjs).
 * Cai no desenho original quando: o jogador está perto (o mato treme todo quadro), a inclinação passa de 6 px (vento
 * muito forte), o desenho não é no canvas principal (cache do chão), ou há transparência/modo de mistura ligados. */
const MATO_COLORS = ['#2f7a34', '#3f9a42', '#58b04c'],
  MATO_NB = [3, 6, 11], // lâminas extras por qualidade 0/1/2 (como no desenho original)
  MS_W = 28, // imagem: 16 do tile + 6 px de inclinação de cada lado
  MS_H = 26, // até 9 px de lâmina acima do tile
  MS_OX = 6,
  MS_OY = 10,
  MATO_CAP = 3000, // imagens guardadas ao mesmo tempo (cerca de 3 KB cada); passou disso, recomeça
  MATO_NOVAS = 24; // imagens NOVAS por quadro: criar centenas de uma vez congelava o jogo por segundos; o resto sai pelo desenho original

// DESLIGADO por padrão até ser medido no celular (as imagens pequenas podem custar mais que os retângulos numa placa de vídeo
// real): ?matocache liga; ?bench (core/Bench.js) liga e desliga para comparar.
let matoLive = !(typeof location !== 'undefined' && /[?&]matocache\b/.test(location.search));

/** Liga (false) ou desliga (true) o desenho original do mato lâmina por lâmina; usado pelo teste de desempenho. */
export function setMatoLive(value) {
  matoLive = !!value;
  return matoLive;
}

const matoSpr = new Map(),
  leanBuf = new Int8Array(16);
let matoQuadro = -1, // `t` do quadro atual (igual para todas as chamadas do mesmo quadro)
  matoOrcamento = 0;

// Parâmetros fixos das lâminas de um tile (posição, altura, cor): dependem só do tile, da quantidade de mato e da qualidade.
function matoEntry(tx, ty, i, m255, qb, old) {
  const m = m255 / 255,
    n = 2 + Math.floor(m * MATO_NB[qb]),
    P = new Int16Array(n * 4);
  let last = '';
  for (let k = 0; k < n; k++) {
    const r = hash2(tx * 17 + k * 5, ty * 29 + k * 3),
      r2 = hash2(k * 11 + tx, ty * 7 + k),
      ci = r > 0.6 ? 0 : r > 0.3 ? 1 : 2,
      hl = m > 0.5 && r2 > 0.7 ? 1 : 0;
    P[k * 4] = 1 + Math.floor(r * 14); // x da lâmina dentro do tile
    P[k * 4 + 1] = 5 + Math.floor(r2 * 10); // y do pé da lâmina dentro do tile
    P[k * 4 + 2] = 2 + Math.round(m * (6 + r2 * 6)); // altura
    P[k * 4 + 3] = ci | (hl << 2);
    last = hl ? '#8fd36a' : MATO_COLORS[ci]; // o desenho original deixa o fillStyle da última lâmina: repetimos
  }
  let e = old;
  if (!e) {
    if (matoSpr.size >= MATO_CAP) matoSpr.clear();
    const c = document.createElement('canvas');
    c.width = MS_W;
    c.height = MS_H;
    e = { c, g: c.getContext('2d'), sig: 0, key: -1, n: 0, P: null, last: '' };
    matoSpr.set(i, e);
  }
  e.sig = m255 * 4 + qb;
  e.key = -1;
  e.n = n;
  e.P = P;
  e.last = last;
  return e;
}

function drawMato(tx, ty, t, i) {
  const x = tx * TS,
    y = ty * TS,
    ws = Math.sin(t * 1.3 + tx * 0.7 + ty * 0.4) * (0.6 + climate.wind * 0.6),
    rs = Math.hypot(x + 8 - S.px, y + 8 - S.py) < 22 ? Math.sin(t * 14) * 1.3 : 0;
  if (matoLive || rs !== 0 || ctx !== mainCtx || ctx.globalAlpha !== 1 || ctx.globalCompositeOperation !== 'source-over')
    return drawMatoLive(tx, ty, t, i, ws, rs);
  const m255 = mato[i],
    qb = Q() > 1 ? 2 : Q() > 0 ? 1 : 0;
  let e = matoSpr.get(i);
  if (!e) {
    if (t !== matoQuadro) {
      matoQuadro = t;
      matoOrcamento = MATO_NOVAS;
    }
    if (matoOrcamento <= 0) return drawMatoLive(tx, ty, t, i, ws, rs); // imagem nova fica para um dos próximos quadros
    matoOrcamento--;
  }
  if (!e || e.sig !== m255 * 4 + qb) e = matoEntry(tx, ty, i, m255, qb, e);
  const P = e.P,
    n = e.n;
  let key = 0;
  for (let k = 0; k < n; k++) {
    const lean = Math.round(ws * (P[k * 4 + 2] / 6) + rs);
    if (lean > 6 || lean < -6) return drawMatoLive(tx, ty, t, i, ws, rs);
    leanBuf[k] = lean;
    key = key * 13 + lean + 6;
  }
  if (key !== e.key) {
    e.key = key;
    const g = e.g;
    g.clearRect(0, 0, MS_W, MS_H);
    for (let k = 0; k < n; k++) {
      const f = P[k * 4 + 3],
        h = P[k * 4 + 2],
        lx = P[k * 4] + leanBuf[k] + MS_OX,
        ly = P[k * 4 + 1] - h + MS_OY;
      g.fillStyle = MATO_COLORS[f & 3];
      g.fillRect(lx, ly, 1, h);
      if (f & 4) {
        g.fillStyle = '#8fd36a';
        g.fillRect(lx, ly, 1, 1);
      }
    }
  }
  ctx.drawImage(e.c, x - MS_OX, y - MS_OY);
  ctx.fillStyle = e.last;
}

export { crowd, cutMato, drawMato, drawSapling, hydroMatoList, treeDrop, treeFree };
