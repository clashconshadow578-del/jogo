/**
 * Casas da vila (cores por rotação de matiz).
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { TS } from '../config/constants.js';
import { ctx } from '../rendering/Canvas.js';
import { SPR } from '../rendering/Sprites.js';

const VIL = [
  { x: 34, y: 36, hue: 0 },
  { x: 56, y: 36, hue: 150 },
  { x: 34, y: 50, hue: 210 },
  { x: 56, y: 50, hue: 300 },
  { x: 45, y: 26, hue: 60 },
  { x: 45, y: 60, hue: 330 },
];

function drawVilHouse(v) {
  const m = SPR.house;
  if (!m || !m.ready) return;
  const dw = m.img.width,
    dh = m.img.height,
    X = v.x * TS + (9 * TS - dw) / 2,
    Y = (v.y + 3) * TS - dh; // base da sprite alinhada à fileira da porta
  const HC = drawVilHouse.c || (drawVilHouse.c = {});
  let hc = HC[v.hue];
  if (!hc) {
    hc = document.createElement('canvas');
    hc.width = dw;
    hc.height = dh;
    const g = hc.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.filter = `hue-rotate(${v.hue}deg)`;
    g.drawImage(m.img, 0, 0);
    HC[v.hue] = hc;
  }
  ctx.drawImage(hc, X, Y);
}

export { VIL, drawVilHouse };
