/**
 * Árvores: sprites por bioma (campo, musgo, pomar, florida, outono), escolha por região e balanço ao vento.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { MW, OX, OY } from '../config/constants.js';
import { Q } from '../config/settings.js';
import { extensible } from '../core/extensions.js';
import { S } from '../core/GameState.js';
import { sunInfo } from '../core/TimeManager.js';
import { ctx } from '../rendering/Canvas.js';
import { bakeImg } from '../rendering/SpriteUtils.js';
import { assetUrl } from '../utils/assets.js';
import { hash2 } from '../utils/MathUtils.js';
import { prox } from './hydrology/Hydrology.js';
import { TREEPAL } from './Seasons.js';
import { climate } from './WeatherSystem.js';

/* ============ ÁRVORES (sprites Craftpix) ============ */
const TREE_DATA = {
  Tree1: assetUrl('sprites/trees/Tree1.webp'),
  Tree2: assetUrl('sprites/trees/Tree2.webp'),
  Tree3: assetUrl('sprites/trees/Tree3.webp'),
  Moss_tree1: assetUrl('sprites/trees/Moss_tree1.webp'),
  Moss_tree2: assetUrl('sprites/trees/Moss_tree2.webp'),
  Moss_tree3: assetUrl('sprites/trees/Moss_tree3.webp'),
  Fruit_tree1: assetUrl('sprites/trees/Fruit_tree1.webp'),
  Fruit_tree2: assetUrl('sprites/trees/Fruit_tree2.webp'),
  Fruit_tree3: assetUrl('sprites/trees/Fruit_tree3.webp'),
  Flower_tree1: assetUrl('sprites/trees/Flower_tree1.webp'),
  Flower_tree2: assetUrl('sprites/trees/Flower_tree2.webp'),
  Flower_tree3: assetUrl('sprites/trees/Flower_tree3.webp'),
  Autumn_tree1: assetUrl('sprites/trees/Autumn_tree1.webp'),
  Autumn_tree2: assetUrl('sprites/trees/Autumn_tree2.webp'),
  Autumn_tree3: assetUrl('sprites/trees/Autumn_tree3.webp'),
};

const TREE_SETS = {
  meadow: ['Tree1', 'Tree2', 'Tree3'],
  moss: ['Moss_tree1', 'Moss_tree2', 'Moss_tree3'],
  orchard: ['Fruit_tree1', 'Fruit_tree2', 'Fruit_tree3'],
  flower: ['Flower_tree1', 'Flower_tree2', 'Flower_tree3'],
  autumn: ['Autumn_tree1', 'Autumn_tree2', 'Autumn_tree3'],
};

const TREE_M = {};

function treeRegion(tx, ty) {
  // cada região do mapa tem sua espécie
  const nz = (hash2(tx >> 2, ty >> 2) - 0.5) * 7;
  if (prox[ty * MW + tx] > 0.3 + nz * 0.01) return 'moss'; // perto dos lagos
  if (Math.hypot(tx - 15 - OX, ty - 9 - OY) < 12 + nz * 0.5) return 'orchard'; // pomar ao redor da casa
  if (tx >= OX - 6 && tx < OX + 102 && ty >= OY - 6 && ty < OY + 70) {
    const rx = tx - OX,
      ry = ty - OY;
    if (rx + nz >= 62) return 'flower';
    if (ry + nz <= 14) return 'autumn';
    return 'meadow';
  }
  const b = hash2((tx >> 5) + 11, (ty >> 5) + 5) + nz * 0.02; // fora da fazenda: biomas em manchas de ~32 tiles
  return b < 0.2 ? 'flower' : b < 0.4 ? 'autumn' : b < 0.5 ? 'orchard' : b < 0.72 ? 'meadow' : 'moss';
}

const TREE_PICK = {};

const treeModel = extensible(function treeModel(tx, ty) {
  const k = ty * MW + tx;
  let m = TREE_PICK[k];
  if (m) return m;
  const r = hash2(tx * 3 + 1, ty * 5 + 2),
    set = TREE_SETS[treeRegion(tx, ty)];
  return (TREE_PICK[k] = TREE_M[set[r < 0.5 ? 0 : r < 0.85 ? 1 : 2]]);
});

const drawTree = extensible(function drawTree(x, y, tx, ty) {
  const m = tx != null && treeModel(tx, ty);
  if (!m || !m.ready) return drawTreeOld(x, y);
  const t = performance.now() / 1000,
    ph = x * 0.23 + y * 0.15,
    w = climate.wind || 0.5,
    amp = 0.5 + w * 1.7 + (climate.kind >= 3 ? 0.8 : 0);
  const sw = (Math.sin(t * 1.4 + ph) * 0.7 + Math.sin(t * 2.6 + ph * 1.7) * 0.3) * amp,
    dx = Math.round(x - m.w / 2),
    dy = Math.round(y - m.h + 2);
  // Cada linha da copa balança com um deslocamento inteiro `o`. Linhas vizinhas com o mesmo `o` saem num único
  // drawImage (mesmos pixels, bem menos chamadas — importante no celular, onde cada chamada tem custo fixo).
  let rs = 0,
    rO = 0;
  for (let r = 0; r < m.h; r++) {
    const f = 1 - (r + 0.5) / m.h,
      o = Math.round(sw * Math.pow(f, 1.5) + Math.sin(t * 6 + r * 0.45 + ph) * 0.4 * f * (0.3 + w));
    if (r === 0) rO = o;
    else if (o !== rO) {
      ctx.drawImage(m.img, 0, rs, m.w, r - rs, dx + rO, dy + rs, m.w, r - rs);
      rs = r;
      rO = o;
    }
  }
  if (m.h > 0) ctx.drawImage(m.img, 0, rs, m.w, m.h - rs, dx + rO, dy + rs, m.w, m.h - rs);
});

function drawTreeOld(x, y) {
  const h = 6 + S.min / 60,
    sun = sunInfo(h),
    wind = Math.sin(performance.now() * 0.0015 + x * 0.23 + y * 0.15) * (0.35 + Q() * 0.16);
  ctx.fillStyle = '#503622';
  ctx.fillRect(x - 2, y - 12, 5, 12);
  ctx.fillStyle = '#8e6034';
  ctx.fillRect(x - 2, y - 11, 1, 9);
  const lobes = [
    [-7, -15, 7],
    [5, -17, 8],
    [-1, -23, 9],
    [-8, -24, 6],
    [8, -25, 6],
    [0, -13, 8],
  ];
  for (let i = 0; i < lobes.length; i++) {
    const [ox, oy, r] = lobes[i],
      xx = x + ox + wind * (i % 2 ? 1 : -1),
      yy = y + oy;
    ctx.fillStyle = TREEPAL[i];
    ctx.beginPath();
    ctx.arc(xx, yy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(xx, yy, r, 0, 6.283);
    ctx.clip();
    ctx.fillStyle = `rgba(6,38,48,${0.1 + 0.22 * sun.day})`;
    ctx.beginPath();
    ctx.arc(xx + sun.dirX * r * 0.55, yy + r * 0.45, r * 0.95, 0, 6.283);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = `rgba(156,225,112,${0.1 + 0.25 * sun.day})`;
    ctx.beginPath();
    ctx.arc(xx - 2 - sun.dirX * 2, yy - 2, Math.max(2, r * 0.5), Math.PI, Math.PI * 1.9);
    ctx.fill();
    if (Q() >= 2) {
      ctx.fillStyle = 'rgba(17,66,35,.36)';
      ctx.fillRect(xx - 2, yy + 2, 3, 1);
    }
  }
}

export function loadTreeSprites() {
  for (const n in TREE_DATA) {
    const m = (TREE_M[n] = { ready: false, w: 0, h: 0, img: new Image(), sil: null });
    m.img.onload = () => {
      m.w = m.img.width;
      m.h = m.img.height;
      const s = document.createElement('canvas');
      s.width = m.w;
      s.height = m.h;
      const g = s.getContext('2d');
      g.drawImage(m.img, 0, 0);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = '#000';
      g.fillRect(0, 0, m.w, m.h);
      m.sil = s;
      m.img = bakeImg(m.img);
      m.ready = true;
    };
    m.img.src = TREE_DATA[n];
  }
}

export { TREE_M, TREE_PICK, TREE_SETS, drawTree, treeModel, treeRegion };
