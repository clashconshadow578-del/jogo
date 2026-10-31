/**
 * Árvores: sprites por bioma (campo, musgo, pomar, florida, outono) e escolha do modelo por região. O desenho (um sprite só, parado)
 * fica em rendering/TreeRenderer.js.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { MW, OX, OY } from '../config/constants.js';
import { extensible } from '../core/extensions.js';
import { bakeImg } from '../rendering/SpriteUtils.js';
import { assetUrl } from '../utils/assets.js';
import { hash2 } from '../utils/MathUtils.js';
import { prox } from './hydrology/Hydrology.js';

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

export { TREE_M, TREE_PICK, TREE_SETS, treeModel, treeRegion };
