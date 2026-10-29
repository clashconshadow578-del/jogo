/**
 * Indicadores de fome, sede e idade acima de cada animal (fauna selvagem, vacas e galinhas), num só lugar.
 *
 * · Dados reais: fauna a.hun/a.thi (0..1, 1 = faminto), vaca c.hunger/c.thirst (0..1), galinha c.hunger/c.thirst
 *   (saciedade 0..100 → vira necessidade com satToNeed); idade a.age / c.age em minutos de jogo (fmtAge).
 * · Barra proporcional ao NÍVEL de fome/sede; identidade por matiz (laranja = fome, azul = sede), por ícone e por posição
 *   (fome em cima, sede embaixo); estado crítico muda o matiz (vermelho / roxo).
 * · Desenhado depois da iluminação, em coordenadas do mundo, alinhado à tela (billboard): não gira nem balança com a
 *   animação; usa o ponto de ancoragem da espécie (altura da cabeça) e posições inteiras → sem tremida.
 * · Controle de sobreposição (slots fixos com histerese), oclusão por linha de visão a partir do jogador, sucuri camuflada
 *   só aparece de perto, some quando o animal morre.
 * · Custo: os valores de cada animal são recalculados a cada 250 ms (não por quadro); os blocos prontos ficam num cache
 *   pequeno (chave = barras em px + texto da idade + escala); nada é guardado por animal além de um objeto leve que
 *   morre com ele (WeakMap) → nada a liberar à mão.
 *
 * Origem: novo (ecossistema vivo).
 */

import { VH, VW } from '../config/constants.js';
import { STATUS_COLORS, STATUS_LAYOUT, fmtAge, lifeStage, satToNeed, statusScale } from '../config/ecosystem.js';
import { S } from '../core/GameState.js';
import { occlusion } from '../entities/ai/Perception.js';
import { bGrow, bPh } from '../entities/cow/CowGenetics.js';
import { COW_CH } from '../entities/cow/CowRenderer.js';
import { herd } from '../entities/cow/Herd.js';
import { chx } from '../entities/farm/Chickens.js';
import { FA_SP, fauna, faSpriteTop } from '../entities/wild/Fauna.js';
import { JG } from '../entities/wild/Jaguar.js';
import { wCam } from '../world/WaterSystem.js';
import { RS, ctx } from './Canvas.js';

const L = STATUS_LAYOUT,
  C = STATUS_COLORS;
const REFRESH_MS = 250; // recálculo de dados/oclusão por animal
const MAX_SHOWN = 28;
const CRIT = 0.75; // necessidade a partir da qual a barra vira "crítica"
const KID_FAUNA = 150; // minutos de jogo (mesmo limite do rótulo "filhote")
const KID_COW = 360;
const KID_CHX = 300;

/** Ícones 5×5 (1 = pixel). Desenhados em pixels, sem depender de emoji/fonte. */
const ICON_HUNGER = ['..XX.', '.XXXX', '.XXXX', 'X.XX.', 'XX...'];
const ICON_THIRST = ['..X..', '.XXX.', 'XXXXX', 'XXXXX', '.XXX.'];

/* ---------------- estado leve por animal (some junto com ele) ---------------- */
const meta = new WeakMap();
const getMeta = (e) => {
  let m = meta.get(e);
  if (!m) meta.set(e, (m = { t: -1e9, slot: 0, slotT: 0, frame: -1 }));
  return m;
};

let frameId = 0;
let shownCount = 0;
let lastPlaced = [];

/* ---------------- cache de blocos prontos ---------------- */
const cache = new Map();
const CACHE_MAX = 120;
let PROBE = null;

function drawIcon(g, pat, x, y, col) {
  g.fillStyle = col;
  for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) if (pat[j][i] === 'X') g.fillRect(x + i, y + j, 1, 1);
}

/** Bloco: [ícone fome | barra] / [ícone sede | barra] / idade. Retorna { cv, w, h } em px lógicos. */
function block(wh, wt, hunCrit, thiCrit, ageTxt, stage, k) {
  const key = wh + '|' + wt + '|' + (hunCrit ? 1 : 0) + (thiCrit ? 1 : 0) + '|' + ageTxt + '|' + stage + '|' + k + '|' + RS;
  let b = cache.get(key);
  if (b) return b;
  const f = RS * k; // px de dispositivo por px lógico do bloco
  if (!PROBE) PROBE = document.createElement('canvas').getContext('2d'); // só mede texto: um único canvas reaproveitado
  const probe = PROBE;
  probe.font = 'bold ' + 6 * f + 'px system-ui,"Segoe UI",Arial,sans-serif';
  const tw = ageTxt ? probe.measureText(ageTxt).width / f : 0;
  const barsW = L.pad + L.icon + 1 + L.barW + L.pad;
  const w = Math.ceil(Math.max(barsW, tw + L.pad * 2 + 2)),
    h = L.pad + (L.barH + 1) * 2 + (ageTxt ? L.textH : 0) + L.pad - 1 + 2;
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(w * f);
  cv.height = Math.ceil(h * f);
  const g = cv.getContext('2d');
  g.scale(f, f);
  g.imageSmoothingEnabled = false;
  // placa escura com borda: contraste em qualquer fundo
  g.fillStyle = C.edge;
  g.fillRect(0, 0, w, h);
  g.fillStyle = C.bg;
  g.fillRect(1, 1, w - 2, h - 2);
  const bx = L.pad + L.icon + 1 - 0;
  const row = (y, pat, col, fill, px) => {
    drawIcon(g, pat, L.pad, y - 1, col);
    g.fillStyle = '#10131a'; // trilho
    g.fillRect(bx, y, L.barW, L.barH);
    g.fillStyle = fill;
    g.fillRect(bx, y, px, L.barH);
    if (px > 0 && px < L.barW) {
      g.fillStyle = 'rgba(255,255,255,.55)'; // ponta da barra: marca o nível
      g.fillRect(bx + px - 1, y, 1, L.barH);
    }
  };
  row(L.pad + 1, ICON_HUNGER, hunCrit ? C.hungerCrit : C.hunger, hunCrit ? C.hungerCrit : C.hunger, wh);
  row(L.pad + 1 + L.barH + 1, ICON_THIRST, thiCrit ? C.thirstCrit : C.thirst, thiCrit ? C.thirstCrit : C.thirst, wt);
  if (ageTxt) {
    g.font = 'bold 6px system-ui,"Segoe UI",Arial,sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = 1.4;
    g.strokeStyle = 'rgba(0,0,0,.9)';
    const ty = L.pad + 1 + (L.barH + 1) * 2 + L.textH / 2 - 0.5;
    g.strokeText(ageTxt, w / 2, ty);
    g.fillStyle = C.stage[stage] || C.stage.adulto;
    g.fillText(ageTxt, w / 2, ty);
  }
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  b = { cv, w, h };
  cache.set(key, b);
  return b;
}

/* ---------------- coleta ---------------- */
/**
 * Altura (px acima de e.y) em que o bloco encosta, por tipo de animal. Fauna: topo REAL do desenho da espécie (linhas
 * transparentes do quadro descontadas, lidas uma vez da folha de sprites) com o mesmo fator de tamanho de drawFauna (filhote
 * menor, a.sz). Não inclui o salto (a.z): ele entra suavizado no desenho, para o bloco não tremer a cada passo.
 */
function faunaHead(a) {
  const I = FA_SP[a.sp],
    kid = a.age < KID_FAUNA ? 0.62 + (0.38 * a.age) / KID_FAUNA : 1,
    s32 = Math.round(32 * I.sc * a.sz * kid),
    pad = faSpriteTop(a.sp);
  if (a.sp === 'anaconda') return 14 * a.sz + 2; // a sucuri enrolada é baixa: encosta no corpo, não no quadro do sprite
  return pad == null ? s32 * 0.92 + 2 : s32 * (0.875 - pad / 32) + 2;
}
const cowHead = (c) => COW_CH * bGrow(c) * bPh(c).size + 2;
const chxHead = (c) => (c.age < KID_CHX ? 0.62 : c.sex === 'm' ? 1.12 : 1) * 13 + 2;

function refresh(e, kind, now) {
  const m = getMeta(e);
  if (now - m.t < REFRESH_MS) return m;
  m.t = now;
  let hun, thi, age, kid, life;
  if (kind === 'f') {
    hun = e.hun;
    thi = e.thi; // dado real (a sucuri vive na água: o jogo mantém thi = 0 para ela)
    age = e.age;
    kid = e.sp === 'jaguar' ? JG.KID : KID_FAUNA;
    life = e.life;
    m.head = faunaHead(e);
  } else if (kind === 'c') {
    hun = e.hunger == null ? 0.3 : e.hunger;
    thi = e.thirst == null ? 0.3 : e.thirst;
    age = e.age || 0;
    kid = e.calf ? Infinity : KID_COW;
    life = 0;
    m.head = cowHead(e);
  } else {
    hun = satToNeed(e.hunger);
    thi = satToNeed(e.thirst);
    age = e.age || 0;
    kid = KID_CHX;
    life = 0;
    m.head = chxHead(e);
  }
  const q = (v) => Math.max(0, Math.min(1, +v || 0));
  hun = q(hun);
  thi = q(thi);
  m.wh = Math.round(hun * L.barW);
  m.wt = Math.round(thi * L.barW);
  m.hc = hun >= CRIT;
  m.tc = thi >= CRIT;
  m.age = fmtAge(age);
  m.stage = lifeStage(age, kid, life);
  // oclusão por linha de visão a partir do jogador (tronco/pedra/casa escondem o bloco)
  m.occ = occlusion(S.px, S.py, e.x, e.y);
  return m;
}

function* subjects() {
  for (const a of fauna) {
    if (a.state === 'dead' || a.gone) continue;
    if (a.sp === 'anaconda' && (a.camo || 0) > 0.5) {
      const d = Math.hypot(S.px - a.x, S.py - a.y);
      if (d > 26) continue; // camuflada: não denuncia onde está
    }
    yield [a, 'f'];
  }
  for (const c of herd) if (!c.dead && !c.gone) yield [c, 'c'];
  for (const c of chx) if (!c.holder && !c.dead) yield [c, 'x'];
}

/* ---------------- slots (anti-sobreposição) ---------------- */
function hit(r, list) {
  for (const q of list) if (r.x < q.x + q.w + 1 && r.x + r.w + 1 > q.x && r.y < q.y + q.h + 1 && r.y + r.h + 1 > q.y) return true;
  return false;
}

/** Posições candidatas (dx, dy) relativas ao encaixe ideal; a primeira livre vence. */
const slotOffsets = (w, h) => [
  [0, 0],
  [0, -(h + 1)],
  [w + 1, 0],
  [-(w + 1), 0],
  [0, -2 * (h + 1)],
  [w + 1, -(h + 1)],
  [-(w + 1), -(h + 1)],
  [0, -3 * (h + 1)],
];

/* ---------------- desenho ---------------- */
function drawAnimalStatus() {
  frameId++; // também dentro de casa: assim statusTopOf() não devolve a posição de um quadro antigo
  shownCount = 0;
  lastPlaced = [];
  if (S.inside) return;
  const now = performance.now();
  const css = Math.min(innerWidth / VW, innerHeight / VH);
  const k = statusScale(css);
  const x0 = wCam.x - 40,
    x1 = wCam.x + VW + 40,
    y0 = wCam.y - 60,
    y1 = wCam.y + VH + 40;
  const list = [];
  for (const [e, kind] of subjects()) {
    if (e.x < x0 || e.x > x1 || e.y < y0 || e.y > y1 + 60) continue;
    const dP = Math.hypot(S.px - e.x, S.py - e.y);
    if (dP > L.showR) continue;
    const m = refresh(e, kind, now);
    if (m.occ >= 0.5) continue;
    list.push({ e, m, dP });
  }
  if (!list.length) return;
  list.sort((p, q) => p.dP - q.dP);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, -wCam.x, -wCam.y);
  ctx.imageSmoothingEnabled = false;
  const placed = [];
  lastPlaced = placed;
  for (const it of list) {
    if (shownCount >= MAX_SHOWN) break;
    const { e, m, dP } = it;
    const b = block(m.wh, m.wt, m.hc, m.tc, m.age, m.stage, k);
    // o salto do animal (a.z) entra com filtro passa-baixa: o bloco acompanha o bicho sem vibrar a cada passo
    m.zs = (m.zs || 0) + ((e.z || 0) - (m.zs || 0)) * 0.15;
    const bx = Math.round(e.x - b.w / 2),
      by = Math.round(e.y - m.head - m.zs - b.h);
    const offs = slotOffsets(b.w, b.h);
    const tryAt = (i) => {
      const r = { x: bx + offs[i][0], y: by + offs[i][1], w: b.w, h: b.h };
      return r.x >= wCam.x && r.x + r.w <= wCam.x + VW && r.y >= wCam.y && !hit(r, placed) ? r : null;
    };
    let idx = m.slot,
      r = idx < offs.length ? tryAt(idx) : null;
    if (r && idx > 0 && now - m.slotT > 700) {
      const r0 = tryAt(0); // histerese: só volta ao encaixe ideal se ficou livre e passou um tempo
      if (r0) {
        r = r0;
        idx = 0;
        m.slotT = now;
      }
    }
    if (!r) {
      for (idx = 0; idx < offs.length; idx++) if ((r = tryAt(idx))) break;
      if (!r) continue; // sem lugar: este (o mais distante) não é mostrado
      m.slotT = now;
    }
    m.slot = idx;
    placed.push(r);
    m.top = r.y;
    m.frame = frameId;
    shownCount++;
    ctx.globalAlpha = Math.max(0, Math.min(1, (L.showR - dP) / (L.showR - L.fadeFrom)));
    if (idx > 0) {
      // bloco deslocado para não sobrepor outro: um fio fino o liga ao animal dono
      ctx.strokeStyle = 'rgba(255,255,255,.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(r.x + b.w / 2) + 0.5, r.y + b.h);
      ctx.lineTo(Math.round(e.x) + 0.5, Math.round(e.y - m.head) + 0.5);
      ctx.stroke();
    }
    ctx.drawImage(b.cv, r.x, r.y, b.w, b.h);
  }
  ctx.restore();
}

/** Topo (y do mundo) do bloco deste animal NESTE quadro, ou null se não está sendo mostrado. Usado para posicionar o nome. */
export function statusTopOf(e) {
  const m = meta.get(e);
  return m && m.frame === frameId ? m.top : null;
}

/** Só para testes. */
export const statusDebug = {
  shown: () => shownCount,
  cacheSize: () => cache.size,
  metaOf: (e) => meta.get(e),
  rects: () => lastPlaced.map((r) => ({ ...r })),
  frame: () => frameId,
};

export { drawAnimalStatus };
