/**
 * Cogumelos: nascem aleatoriamente na grama livre a cada dia.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { GRASS, MH, MW } from '../config/constants.js';
import { ctx } from '../rendering/Canvas.js';
import { SHR_IDS, SPR } from '../rendering/Sprites.js';
import { ground, obj } from './World.js';

const shroom = new Uint8Array(MW * MH);

function shroomDaily() {
  // a cada dia, cada quadrado de grama livre rola o dado: 0,007% de nascer cogumelos
  for (let i = 0; i < MW * MH; i++) {
    if (shroom[i] || ground[i] !== GRASS || obj[i]) continue;
    if (Math.random() < 0.00007) shroom[i] = 1 + ((Math.random() * 4) | 0);
  }
}

function shroomRoll(i) {
  if (!shroom[i] && ground[i] === GRASS && !obj[i] && Math.random() < 0.001) shroom[i] = 1 + ((Math.random() * 4) | 0);
} // 0,1% por bloco de grama que surge

function drawShroom(x, y, v) {
  const m = SPR['shr' + SHR_IDS[v - 1]];
  if (m && m.ready) ctx.drawImage(m.img, Math.round(x - m.w / 2), Math.round(y - m.h + 2));
}

export { drawShroom, shroom, shroomDaily, shroomRoll };
