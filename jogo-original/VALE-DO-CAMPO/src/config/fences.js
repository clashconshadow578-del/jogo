/**
 * Cercas e portões: códigos no mapa de objetos, escolha do sprite pelas conexões, onde pode construir e
 * a lógica de colisão de entidades. Tudo puro (sem DOM nem estado do jogo) para poder ser testado.
 *
 * As peças ficam na própria camada `obj` do mapa (códigos FENCE, GATE e GATE_OPEN de constants.js), então
 * salvam com o mapa de cada região e entram sozinhas nas colisões de `solid()`/`pBlocked()`.
 *
 * Origem: novo (sistema de cercas)
 */

import {
  BED,
  FENCE,
  FORD,
  GATE,
  GATE_OPEN,
  GRASS,
  PATH,
  SAND,
  SCREE,
  SNOWG,
  SOIL,
  STONE,
  TS,
  WATER,
} from './constants.js';

/** É uma peça de cerca (reta, poste ou portão)? */
export const isFenceCode = (o) => o === FENCE || o === GATE || o === GATE_OPEN;
/** É um portão (aberto ou fechado)? */
export const isGateCode = (o) => o === GATE || o === GATE_OPEN;

/** Chão em que se pode construir (nunca água, vau nem o piso interno da casa). */
export const BUILDABLE_GROUND = new Set([GRASS, PATH, SOIL, SAND, SNOWG, SCREE, STONE]);
export const FORBIDDEN_GROUND = new Set([WATER, FORD, BED]);

/** Quadros da folha `sprites/objects/fence.png` (20 quadros de 16x16). 0..15 = cerca pelas conexões. */
/**
 * Medidas da folha `fence.png`: cada quadro tem 120x144 px de arte e é reduzido 6:1 (20x24 px em jogo).
 * O tile ocupa 96 px de arte (16 de jogo); o quadro sobra 2 px de cada lado e 8 px para baixo (ponta Sul).
 * Desenhar o quadro em (tile.x + OX, tile.y + OY).
 */
export const FRAME_ART = { w: 120, h: 144, reduce: 6, ox: -2, oy: 0 };

export const FRAME = { GATE_H_CLOSED: 16, GATE_H_OPEN: 17, GATE_V_CLOSED: 18, GATE_V_OPEN: 19, COUNT: 20 };

/** Máscara de conexões: 1 = Norte, 2 = Leste, 4 = Sul, 8 = Oeste. */
export function fenceMask(n, e, s, w) {
  return (n ? 1 : 0) | (e ? 2 : 0) | (s ? 4 : 0) | (w ? 8 : 0);
}

/**
 * Quadro certo para a peça `code` com os vizinhos dados (booleans: vizinho é cerca ou portão).
 * Portão: horizontal se há cerca a Leste/Oeste (ou nenhuma), vertical se só há a Norte/Sul.
 */
export function fenceFrame(code, n, e, s, w) {
  if (isGateCode(code)) {
    const vertical = (n || s) && !(e || w),
      open = code === GATE_OPEN;
    if (vertical) return open ? FRAME.GATE_V_OPEN : FRAME.GATE_V_CLOSED;
    return open ? FRAME.GATE_H_OPEN : FRAME.GATE_H_CLOSED;
  }
  return fenceMask(n, e, s, w);
}

/**
 * A caixa de colisão de uma entidade (mesmas medidas de `blocked()`: x-4..x+3,9 e y-3..y+2,9) toca o tile?
 * `pad` alarga a caixa (margem de segurança para não "emparedar" um animal ao construir).
 */
export function entityTouchesTile(x, y, tx, ty, pad = 0) {
  const l = tx * TS,
    t = ty * TS;
  return x + 3.9 + pad >= l && x - 4 - pad < l + TS && y + 2.9 + pad >= t && y - 3 - pad < t + TS;
}

/**
 * Pode construir uma peça neste tile? Função pura: recebe o que for preciso saber do mundo.
 * @param {{inBounds:boolean, ground:number, obj:number, hasCrop:boolean, hasNest:boolean, hasShroom:boolean, hasSapling:boolean, inside:boolean}} w
 * @returns {{ok:boolean, reason:string}}
 */
export function checkBuildTile(w) {
  if (w.inside) return { ok: false, reason: 'Não dá para construir dentro de casa' };
  if (!w.inBounds) return { ok: false, reason: 'Fora do mapa' };
  if (FORBIDDEN_GROUND.has(w.ground) || !BUILDABLE_GROUND.has(w.ground))
    return { ok: false, reason: 'Não dá para construir aqui (água ou terreno impróprio)' };
  if (w.obj !== 0) return { ok: false, reason: 'Já há algo neste tile' };
  if (w.hasCrop) return { ok: false, reason: 'Há uma plantação neste tile' };
  if (w.hasSapling) return { ok: false, reason: 'Há uma muda neste tile' };
  if (w.hasShroom) return { ok: false, reason: 'Há cogumelos neste tile' };
  if (w.hasNest) return { ok: false, reason: 'Há um ninho neste tile' };
  return { ok: true, reason: '' };
}
