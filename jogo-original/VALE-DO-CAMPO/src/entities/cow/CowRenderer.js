/**
 * Sprites da vaca (folha 29x23 px, versão preta gerada por recoloração) e desenho com direção e animação de comer.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { cow } from './Cow.js';
import { bGrow, bImg, bPh } from './CowGenetics.js';
import { ctx } from '../../rendering/Canvas.js';
import { assetUrl } from '../../utils/assets.js';

/* ============ VACA 16x16: sprite pixelado original ============ */
// Arte redesenhada em grade exata 16x16, inspirada na referência visual gerada.
const COW_PALETTE = {
  '.': null,
  o: '#50372d',
  b: '#83533c',
  w: '#fff2d8',
  l: '#d4bfa7',
  p: '#f0a6aa',
  n: '#bc727c',
  k: '#302b30',
  h: '#b99a74',
  g: '#d5b19a',
};

const COW_SPRITE = [
  '................',
  '..oo......oo....',
  '.obbo....obbo...',
  '.obwwooooowbo...',
  '..owwwwwwwwo....',
  '.owwbbwwbbwwwo..',
  '.owwbbwwbbwwwo..',
  '.owwwwwwwwwwwo..',
  '.owwwkwwwwkwwwo.',
  '.owwwwwwwwwwwo..',
  '..owwppppwwwo...',
  '..owwpnnpwwwo...',
  '...owppppwwo....',
  '...owwoowwo.....',
  '...ok..k.ko.....',
  '................',
];

const cowSprite = document.createElement('canvas');

const cowPixels = cowSprite.getContext('2d');

/* ===== Sprite da vaca: linhas 0 frente, 1 esquerda, 2 direita, 3 costas, 4-5 comendo (esq/dir) ===== */
const COW_CW = 29,
  COW_CH = 23;

const COW_IMG = new Image();

function drawCow() {
  const c = cow,
    sc = bGrow(c) * bPh(c).size,
    W = COW_CW * sc,
    H = COW_CH * sc;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (COW_IMG.complete && COW_IMG.naturalWidth) {
    const dx = Math.cos(c.dir),
      dy = Math.sin(c.dir);
    let row, fr;
    if (c.eat && c.pet <= 0 && !c.walk) {
      row = (c.fx || -1) > 0 ? 5 : 4;
      fr = Math.floor(performance.now() / 300) % 4;
    } // cabeça baixa, mastigando
    else {
      row = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 1 : 2) : dy > 0 ? 0 : 3;
      fr = c.walk ? Math.floor((c.step || 0) / 2.2) % 4 : 0;
    }
    ctx.drawImage(
      bImg(c),
      fr * COW_CW,
      row * COW_CH,
      COW_CW,
      COW_CH,
      Math.round(c.x - W / 2),
      Math.round(c.y - H + 1),
      Math.round(W),
      Math.round(H),
    );
  } else ctx.drawImage(cowSprite, Math.round(c.x - 8 * sc), Math.round(c.y - 16 * sc), 16 * sc, 16 * sc);
  {
    const bx = Math.round(c.x - 8),
      by = Math.round(c.y - H - 5); // fome/sede/idade: rendering/AnimalStatus.js (um só desenho para todos os animais)
    ctx.font = 'bold 8px sans-serif';
    ctx.fillStyle = c.sex === 'm' ? '#7fc4ff' : '#ff9ec8';
    ctx.fillText(c.sex === 'm' ? '♂' : '♀', bx - 9, by + 6);
    if (c.preg) {
      ctx.fillStyle = '#ff4d88';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText('♥', bx - 10, by + 1 - Math.abs(Math.sin(performance.now() * 0.005)) * 2); // ao lado do sexo, fora do bloco de indicadores
    }
  }
  if (c.pet > 0) {
    ctx.fillStyle = '#ff7aa9';
    ctx.font = '9px sans-serif';
    ctx.fillText('♥', c.x - 3, c.y - H - 12 - c.pet * 2);
  }
  ctx.restore();
}

/* ============ REBANHO: vaca preta, vínculo, acasalamento, bezerros ============ */
let COW_BLACK = null;

function mkBlack() {
  try {
    const w = COW_IMG.naturalWidth,
      h = COW_IMG.naturalHeight,
      cv2 = document.createElement('canvas');
    cv2.width = w;
    cv2.height = h;
    const g = cv2.getContext('2d');
    g.drawImage(COW_IMG, 0, 0);
    const d = g.getImageData(0, 0, w, h),
      p = d.data;
    for (let i = 0; i < p.length; i += 4) {
      if (!p[i + 3]) continue;
      const r = p[i],
        gg = p[i + 1],
        b = p[i + 2];
      if (r > 190 && r - gg > 40 && r - b > 35) continue; // mantém focinho rosado
      const v = 12 + (r * 0.3 + gg * 0.59 + b * 0.11) * 0.14;
      p[i] = v;
      p[i + 1] = v;
      p[i + 2] = v + 4;
    }
    g.putImageData(d, 0, 0);
    COW_BLACK = cv2;
  } catch (e) {}
}

export function initCowPixelSprite() {
  cowSprite.width = 16;
  cowSprite.height = 16;
  cowPixels.imageSmoothingEnabled = false;

  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const color = COW_PALETTE[COW_SPRITE[y][x]];
      if (color) {
        cowPixels.fillStyle = color;
        cowPixels.fillRect(x, y, 1, 1);
      }
    }
}

export function loadCowSprite() {
  COW_IMG.src = assetUrl('sprites/animals/cow.webp');
}

export { COW_CH, COW_CW, COW_IMG, drawCow, mkBlack };
