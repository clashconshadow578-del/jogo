/**
 * Cercas e portões: colocação no mapa (com pré-visualização), abrir/fechar portões, recolher peças e desenho.
 *
 * As peças moram na camada `obj` do mapa (códigos FENCE / GATE / GATE_OPEN): salvam com o mapa de cada região
 * e entram sozinhas em `solid()` / `pBlocked()`. O sprite de cada peça é escolhido na hora do desenho a partir
 * dos vizinhos, então nunca há estado de "conexão" para sincronizar ou salvar.
 *
 * A arte (folha de referência do projeto) é grande; ao carregar cada quadro é reduzido 6:1 uma única vez (config/fences.js, FRAME_ART).
 *
 * Origem: novo (sistema de cercas)
 */

import { FENCE, GATE, GATE_OPEN, MH, MW, TS, VH, VW } from '../config/constants.js';
import {
  checkBuildTile,
  entityTouchesTile,
  fenceFrame,
  FRAME,
  FRAME_ART,
  isFenceCode,
  isGateCode,
} from '../config/fences.js';
import { S } from '../core/GameState.js';
import { herd } from '../entities/cow/Herd.js';
import { chx } from '../entities/farm/Chickens.js';
import { fox } from '../entities/farm/FarmFoxes.js';
import { eggOnTile } from '../entities/farm/Eggs.js';
import { ninhos } from '../entities/farm/Nests.js';
import { npc, npcPos } from '../entities/NPC.js';
import { fauna } from '../entities/wild/Fauna.js';
import { ctx } from '../rendering/Canvas.js';
import { toast } from '../ui/Toast.js';
import { assetUrl } from '../utils/assets.js';
import { sapl, seedAge } from '../world/hydrology/Hydrology.js';
import { shroom } from '../world/Mushrooms.js';
import { crops, ground, obj } from '../world/World.js';
import { beep } from './audio/AudioSystem.js';
import { crossesFence } from './FenceQuery.js';
import { ITEMS } from './InventorySystem.js';

export { crossesFence };

/** Item do inventário que cada código devolve ao ser recolhido, e o código que cada item coloca. */
export const PIECE_ITEM = { [FENCE]: 'fence', [GATE]: 'gate', [GATE_OPEN]: 'gate' };
export const ITEM_PIECE = { fence: FENCE, gate: GATE };

/** Folga (px) ao redor da caixa de colisão de cada tipo de criatura para decidir se "está no tile". */
const PAD = { player: 1, cow: 5, calf: 4, chicken: 2, fox: 2, npc: 2, wild: 3 };

/** Tempo mínimo (ms) entre dois toques no mesmo portão (evita abrir e fechar no mesmo clique). */
export const GATE_COOLDOWN_MS = 250;

/* ============ SPRITES ============ */
let sheet = null;
let baked = []; // quadros já reduzidos para TS x TS
let ready = false;

function bake() {
  const A = FRAME_ART,
    n = Math.floor((sheet.naturalWidth || sheet.width) / A.w);
  baked = [];
  for (let i = 0; i < n; i++) {
    const c = document.createElement('canvas');
    c.width = A.w / A.reduce;
    c.height = A.h / A.reduce;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(sheet, i * A.w, 0, A.w, A.h, 0, 0, c.width, c.height);
    baked.push(c);
  }
  ready = baked.length >= FRAME.COUNT;
}

export function loadFenceSprites() {
  sheet = new Image();
  sheet.onload = bake;
  sheet.src = assetUrl('sprites/objects/fence.png');
}

export const fenceSpritesReady = () => ready;

/* ============ CONSULTAS ============ */
const inMap = (tx, ty) => tx >= 0 && ty >= 0 && tx < MW && ty < MH;
const codeAt = (tx, ty) => (inMap(tx, ty) ? obj[ty * MW + tx] : 0);

/** Quadro do sprite da peça em (tx,ty) pelas conexões atuais. `asCode` simula uma peça ainda não colocada. */
export function frameAt(tx, ty, asCode = codeAt(tx, ty)) {
  return fenceFrame(
    asCode,
    isFenceCode(codeAt(tx, ty - 1)),
    isFenceCode(codeAt(tx + 1, ty)),
    isFenceCode(codeAt(tx, ty + 1)),
    isFenceCode(codeAt(tx - 1, ty)),
  );
}

/** Tile à frente do jogador (o mesmo que o botão Usar mira). */
export function frontTile() {
  return { x: Math.floor(S.px / TS) + (S.fx || 0), y: Math.floor(S.py / TS) + (S.fy || 0) };
}

/** Item que está na mão (selecionado e que o jogador tem), ou null. */
export function heldId() {
  const it = ITEMS[S.sel];
  return it && (S.inv[it.id] > 0 || ['hoe', 'can', 'scythe', 'axe'].includes(it.id)) ? it.id : null;
}

/** Todas as criaturas que ocupam espaço no mundo, com o tipo (para a folga certa). */
function* bodies() {
  if (!S.inside) yield { x: S.px, y: S.py, pad: PAD.player, what: 'você' };
  for (const q of herd)
    yield { x: q.x, y: q.y, pad: q.calf ? PAD.calf : PAD.cow, what: q.calf ? 'um bezerro' : 'uma vaca' };
  for (const c of chx) if (!c.holder) yield { x: c.x, y: c.y, pad: PAD.chicken, what: 'uma galinha' };
  for (const f of fox) yield { x: f.x, y: f.y, pad: PAD.fox, what: 'uma raposa' };
  if (npc && !npc.inside) {
    const n = npcPos();
    yield { x: n.x, y: n.y, pad: PAD.npc, what: 'a moradora' };
  }
  for (const a of fauna) yield { x: a.x, y: a.y, pad: PAD.wild, what: 'um animal' };
}

/** Quem está no tile (tx,ty)? Devolve a descrição de uma criatura ou null. */
export function occupant(tx, ty) {
  for (const b of bodies()) if (entityTouchesTile(b.x, b.y, tx, ty, b.pad)) return b.what;
  return null;
}

/**
 * Pode colocar `item` ('fence' | 'gate') em (tx,ty)? Um portão pode substituir uma cerca já colocada.
 * @returns {{ok:boolean, reason:string, replace:boolean}}
 */
export function buildCheck(tx, ty, item) {
  const inBounds = inMap(tx, ty),
    i = ty * MW + tx,
    cur = inBounds ? obj[i] : 0,
    replace = item === 'gate' && cur === FENCE;
  const r = checkBuildTile({
    inside: !!S.inside,
    inBounds,
    ground: inBounds ? ground[i] : -1,
    obj: replace ? 0 : cur,
    hasCrop: inBounds && !!crops[i],
    hasSapling: inBounds && !!sapl[i],
    hasShroom: inBounds && !!shroom[i],
    hasNest: inBounds && ninhos.some((n) => Math.floor(n.x / TS) === tx && Math.floor(n.y / TS) === ty),
  });
  if (!r.ok) return { ok: false, reason: r.reason, replace: false };
  if (eggOnTile(tx, ty)) return { ok: false, reason: 'Há um ovo neste tile', replace: false };
  const who = occupant(tx, ty);
  if (who) return { ok: false, reason: 'Tem ' + (who === 'você' ? 'você' : who) + ' no caminho', replace: false };
  return { ok: true, reason: '', replace };
}

/* ============ AÇÕES ============ */
/**
 * Coloca uma peça em (tx,ty). Atômico: só gasta o item se a peça realmente entrou no mapa.
 * Um portão sobre uma cerca a substitui e devolve a cerca ao inventário.
 * @returns {{ok:boolean, reason?:string}}
 */
export function placeAt(tx, ty, item) {
  if (!ITEM_PIECE[item]) return { ok: false, reason: 'Item inválido' };
  if (!(S.inv[item] > 0)) return { ok: false, reason: 'Você não tem este item' };
  const chk = buildCheck(tx, ty, item);
  if (!chk.ok) return chk;
  const i = ty * MW + tx;
  if (chk.replace) S.inv.fence = (S.inv.fence | 0) + 1;
  obj[i] = ITEM_PIECE[item];
  if (seedAge[i]) seedAge[i] = 0;
  S.inv[item]--;
  return { ok: true };
}

/** Botão Usar com cerca/portão na mão: coloca à frente do jogador. */
export function placeInFront(item) {
  const t = frontTile(),
    r = placeAt(t.x, t.y, item);
  if (r.ok) beep(300, 0.06, 'square');
  else if (r.reason) toast(r.reason);
  return r.ok;
}

let lastToggle = -1e9;

/**
 * Abre/fecha o portão do tile `i`. Fechar é recusado se houver alguém no tile.
 * @returns {{ok:boolean, open?:boolean, reason?:string}}
 */
export function toggleGate(i, now = performance.now()) {
  const code = obj[i];
  if (!isGateCode(code)) return { ok: false, reason: 'Não é um portão' };
  if (now - lastToggle < GATE_COOLDOWN_MS) return { ok: false, reason: '' };
  if (code === GATE) {
    obj[i] = GATE_OPEN;
    lastToggle = now;
    return { ok: true, open: true };
  }
  const who = occupant(i % MW, (i / MW) | 0);
  if (who) return { ok: false, reason: 'Não dá para fechar: tem ' + (who === 'você' ? 'você' : who) + ' no portão' };
  obj[i] = GATE;
  lastToggle = now;
  return { ok: true, open: false };
}

/** Botão Usar num portão. */
export function useGate(i) {
  const r = toggleGate(i);
  if (r.ok) {
    toast(r.open ? '🚪 Portão aberto' : '🚪 Portão fechado');
    beep(r.open ? 330 : 240, 0.07, 'triangle');
  } else if (r.reason) toast(r.reason);
  return r.ok;
}

/** Recolhe a peça do tile `i` (com o machado) e devolve o item ao inventário. */
export function pickupPiece(i) {
  const item = PIECE_ITEM[obj[i]];
  if (!item) return false;
  obj[i] = 0;
  S.inv[item] = (S.inv[item] | 0) + 1;
  toast(item === 'gate' ? '🪓 Portão recolhido' : '🪓 Cerca recolhida');
  beep(200, 0.06, 'sawtooth');
  return true;
}

/* ============ DESENHO ============ */
const sortKey = (ty) => (ty + 1) * TS - 2; // pés da peça: criaturas abaixo dela passam na frente

/** Fornecedor de entidades do Renderer: peças visíveis e a pré-visualização de colocação. */
export function fenceEntities(ents, camX, camY) {
  if (!ready || S.inside) return;
  const x0 = Math.max(0, Math.floor(camX / TS) - 1),
    x1 = Math.min(MW - 1, Math.floor((camX + VW) / TS) + 1),
    y0 = Math.max(0, Math.floor(camY / TS) - 1),
    y1 = Math.min(MH - 1, Math.floor((camY + VH) / TS) + 1);
  for (let ty = y0; ty <= y1; ty++)
    for (let tx = x0; tx <= x1; tx++) {
      const o = obj[ty * MW + tx];
      if (!isFenceCode(o)) continue;
      ents.push({
        k: sortKey(ty),
        sh: [tx * TS + 8, (ty + 1) * TS - 1, 8, 6, 'fence'],
        draw: () => ctx.drawImage(baked[frameAt(tx, ty)], tx * TS + FRAME_ART.ox, ty * TS + FRAME_ART.oy),
      });
    }
  const held = heldId();
  if (ITEM_PIECE[held]) {
    const t = frontTile();
    if (inMap(t.x, t.y)) {
      const chk = buildCheck(t.x, t.y, held);
      ents.push({
        k: 1e6,
        sh: [t.x * TS + 8, (t.y + 1) * TS, 0.1, 1, 'fence'],
        draw: () => {
          ctx.save();
          ctx.globalAlpha = 0.62;
          ctx.drawImage(baked[frameAt(t.x, t.y, ITEM_PIECE[held])], t.x * TS + FRAME_ART.ox, t.y * TS + FRAME_ART.oy);
          ctx.globalAlpha = 0.22;
          ctx.fillStyle = chk.ok ? '#4dff6a' : '#ff4d4d';
          ctx.fillRect(t.x * TS, t.y * TS, TS, TS);
          ctx.globalAlpha = 0.9;
          ctx.strokeStyle = chk.ok ? '#4dff6a' : '#ff4d4d';
          ctx.lineWidth = 1;
          ctx.strokeRect(t.x * TS + 0.5, t.y * TS + 0.5, TS - 1, TS - 1);
          ctx.restore();
        },
      });
    }
  }
}
