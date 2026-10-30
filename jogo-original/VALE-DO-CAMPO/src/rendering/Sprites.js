/**
 * Sprites da casa, interior, pedras e cogumelos; desenho da casa e da caixa de venda.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { OXP, OYP } from '../config/constants.js';
import { ctx } from './Canvas.js';
import { plantSpriteScale } from '../config/plants.js';
import { bakeImg, bakeScaled } from './SpriteUtils.js';
import { assetUrl } from '../utils/assets.js';
import { hash2 } from '../utils/MathUtils.js';

/* ============ CASA, INTERIOR, PEDRAS E COGUMELOS (sprites Craftpix) ============ */
const SPR_DATA = {
  // textura do chão de grama: 256x256 px, repete sem emendas (usada em TileRenderer.drawTile)
  grass: assetUrl('sprites/ground/grass.png'),
  house: assetUrl('sprites/objects/house.webp'),
  rock27: assetUrl('sprites/objects/rocks/rock27.webp'),
  rock28: assetUrl('sprites/objects/rocks/rock28.webp'),
  rock31: assetUrl('sprites/objects/rocks/rock31.webp'),
  rock36: assetUrl('sprites/objects/rocks/rock36.webp'),
  rock76: assetUrl('sprites/objects/rocks/rock76.webp'),
  rock77: assetUrl('sprites/objects/rocks/rock77.webp'),
  rock85: assetUrl('sprites/objects/rocks/rock85.webp'),
  rock90: assetUrl('sprites/objects/rocks/rock90.webp'),
  rock91: assetUrl('sprites/objects/rocks/rock91.webp'),
  shr42: assetUrl('sprites/objects/mushrooms/shr42.webp'),
  shr45: assetUrl('sprites/objects/mushrooms/shr45.webp'),
  shr64: assetUrl('sprites/objects/mushrooms/shr64.webp'),
  shr52: assetUrl('sprites/objects/mushrooms/shr52.webp'),
  bed: assetUrl('sprites/objects/interior/bed.webp'),
  barrel: assetUrl('sprites/objects/interior/barrel.webp'),
  shelf: assetUrl('sprites/objects/interior/shelf.webp'),
  shelf2: assetUrl('sprites/objects/interior/shelf2.webp'),
  bookshelf: assetUrl('sprites/objects/interior/bookshelf.webp'),
  table: assetUrl('sprites/objects/interior/table.webp'),
  rug: assetUrl('sprites/objects/interior/rug.webp'),
  plant: assetUrl('sprites/objects/interior/plant.webp'),
  crate: assetUrl('sprites/objects/interior/crate.webp'),
  wall: assetUrl('sprites/objects/interior/wall.webp'),
  floor: assetUrl('sprites/objects/interior/floor.webp'),
  door: assetUrl('sprites/objects/interior/door.webp'),
  // o "mato": helicônia e samambaia amazônicas em 4 fases (config/plants.js; tools/plants/make-plants.py gera os PNGs)
  ...Object.fromEntries(
    ['helikonia', 'samambaia'].flatMap((e) =>
      [1, 2, 3, 4].map((f) => [`${e}_${f}`, assetUrl(`sprites/plants/${e}_${f}.png`)]),
    ),
  ),
};

const SPR = {};

const ROCK_IDS = [27, 28, 31, 36, 76, 77, 85, 90, 91],
  SHR_IDS = [42, 45, 64, 52];

function drawRock(x, y) {
  const m = SPR['rock' + ROCK_IDS[(hash2(x | 0, y | 0) * ROCK_IDS.length) | 0]];
  if (!m || !m.ready) return;
  ctx.drawImage(m.img, Math.round(x - m.w / 2), Math.round(y - m.h + 3));
}

function drawHouse() {
  const m = SPR.house;
  if (m && m.ready) ctx.drawImage(m.img, 210 + OXP, 53 + OYP);
}

function drawBin() {
  const x = 312 + OXP,
    y = 208 + OYP;
  ctx.fillStyle = '#8b5a2b';
  ctx.fillRect(x - 6, y - 10, 12, 10);
  ctx.fillStyle = '#a0683a';
  ctx.fillRect(x - 7, y - 12, 14, 3);
  ctx.fillStyle = '#6a4220';
  ctx.fillRect(x - 4, y - 7, 8, 1);
  ctx.fillRect(x - 4, y - 4, 8, 1);
}

export function loadSprites() {
  for (const n in SPR_DATA) {
    const m = (SPR[n] = { ready: false, w: 0, h: 0, img: new Image() });
    m.img.onload = () => {
      const k = plantSpriteScale(n); // fases 3 e 4 do mato: 15% maiores
      m.img = k === 1 ? bakeImg(m.img) : bakeScaled(m.img, k);
      m.w = m.img.width;
      m.h = m.img.height;
      m.ready = true;
    };
    m.img.src = SPR_DATA[n];
  }
}

export { SHR_IDS, SPR, drawBin, drawHouse, drawRock };
