/**
 * Fezes dos animais: cada defecação deixa um monte pequeno de fezes com moscas por cima.
 * As moscas são pontinhos bem menores que as abelhas; somem junto com a fezes. A fezes vai sumindo devagar
 * (mais rápido na chuva) e não é salva, como as pegadas.
 *
 * Quem defeca: animais selvagens (Fauna.js), vacas (Herd.js) e galinhas (Chickens.js), via dungTimer/dropFeces.
 * Entra na ordenação por Y do Renderer por meio de fecesEntities (um entityProvider).
 *
 * Origem: novo (ecossistema vivo).
 */

import { MH, MW, TS, VH, VW, WATER } from '../config/constants.js';
import { FECES, fecesAlpha, fliesFor } from '../config/feces.js';
import { ctx } from '../rendering/Canvas.js';
import { rr } from '../utils/Random.js';
import { climate } from './WeatherSystem.js';
import { ground } from './World.js';

/** Fezes no mundo agora. */
export const feces = [];

let SPR = null;

/**
 * Sprite de fezes: um monte pequeno e irregular de cocô (não é minhoca). Contorno escuro, massa marrom com
 * manchas mais claras e escuras, e um topo úmido. 3 variações, desenhadas uma vez.
 */
function buildSprites() {
  SPR = [];
  for (let v = 0; v < 3; v++) {
    const c = document.createElement('canvas');
    c.width = 14;
    c.height = 8;
    const g = c.getContext('2d');
    // massa: base larga e um pouco torta, com dois "montinhos" de tamanhos diferentes
    const blobs = [
      [3 + v * 0.4, 5, 3.4],
      [7.2, 4.4 + (v - 1) * 0.5, 3.6],
      [10.4, 5.5, 2.4],
    ];
    const px = (x, y, col) => {
      g.fillStyle = col;
      g.fillRect(Math.round(x), Math.round(y), 1, 1);
    };
    for (const [bx, by, r] of blobs)
      for (let y = 0; y < 8; y++)
        for (let x = 0; x < 14; x++) {
          const d = Math.hypot(x + 0.5 - bx, (y + 0.5 - by) * 1.25);
          if (d < r + 0.6 && d >= r - 0.2) px(x, y, '#21140a'); // contorno
        }
    for (const [bx, by, r] of blobs)
      for (let y = 0; y < 8; y++)
        for (let x = 0; x < 14; x++) {
          const d = Math.hypot(x + 0.5 - bx, (y + 0.5 - by) * 1.25);
          if (d < r - 0.2) px(x, y, (x + y + v) % 4 === 0 ? '#7a5230' : (x * 3 + y) % 5 === 0 ? '#3d2612' : '#5c3b1f');
        }
    // topo úmido: brilho pequeno
    px(4 + v, 2, '#8c6238');
    px(8, 3, '#8c6238');
    SPR.push(c);
  }
}

/**
 * Deixa uma fezes no chão, na posição do animal. Não cai na água. Retorna true se deixou.
 * @param {number} size  tamanho relativo do animal (filhote ~0.6, cervo ~1, vaca ~1.5)
 * @param {string} sp    espécie (guardado para depuração)
 */
export function dropFeces(x, y, size, sp) {
  const i = Math.floor(y / TS) * MW + Math.floor(x / TS);
  if (i < 0 || i >= MW * MH || ground[i] === WATER) return false;
  const sz = Math.max(0.55, Math.min(1.6, size || 1));
  feces.push({
    x: x + rr(-2, 2),
    y: y + rr(-1, 1),
    sz,
    v: (Math.random() * 3) | 0,
    sp,
    age: 0,
    life: FECES.life * rr(0.85, 1.15),
    flies: fliesFor(sz),
    ph: Math.random() * 6.28,
  });
  if (feces.length > FECES.max) feces.shift();
  return true;
}

/** Envelhece as fezes (mais depressa na chuva) e remove as que se decompuseram. `dt` em s reais. */
export function fecesTick(dt) {
  const mul = climate.kind >= 3 ? FECES.rainMul : 1;
  for (let i = feces.length - 1; i >= 0; i--) {
    const f = feces[i];
    f.age += dt * mul;
    if (f.age >= f.life) feces.splice(i, 1);
  }
}

export function clearFeces() {
  feces.length = 0;
}

/** Entrega as fezes visíveis à ordenação por Y. Ficam um pouco acima do próprio Y, então animais que pisam nelas as cobrem. */
export function fecesEntities(ents, camX, camY) {
  for (const f of feces) {
    if (f.x < camX - 16 || f.x > camX + VW + 16 || f.y < camY - 16 || f.y > camY + VH + 16) continue;
    ents.push({ k: f.y - 2, sh: [f.x, f.y, 3, 1, 'feces'], draw: () => drawDrop(f) });
  }
}

function drawDrop(f) {
  if (!SPR) buildSprites();
  const a = fecesAlpha(f.age, f.life);
  if (a <= 0) return;
  const t = performance.now() / 1000;
  ctx.globalAlpha = a;
  const w = Math.round(14 * f.sz),
    h = Math.round(8 * f.sz);
  ctx.drawImage(SPR[f.v], Math.round(f.x - w / 2), Math.round(f.y - h + 1), w, h);
  // moscas: pontinhos escuros (1 px) que zumbam em volta, com um lampejo de asa
  ctx.fillStyle = '#121212';
  for (let i = 0; i < f.flies; i++) {
    const p = f.ph + i * 2.3,
      fx = Math.round(f.x + Math.cos(t * 4 + p) * (3 + i)),
      fy = Math.round(f.y - 9 - f.sz * 2 + Math.sin(t * 6 + p * 1.7) * 2);
    ctx.fillRect(fx, fy, 1, 1);
    if (Math.sin(t * 30 + p) > 0) {
      ctx.fillStyle = 'rgba(225,235,240,0.7)';
      ctx.fillRect(fx - 1, fy - 1, 1, 1);
      ctx.fillStyle = '#121212';
    }
  }
  ctx.globalAlpha = 1;
}
