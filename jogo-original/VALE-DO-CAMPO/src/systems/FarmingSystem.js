/**
 * Agricultura: terra arada que volta a ser grama após 5 min sem plantio, sprites das plantações por fase com balanço ao vento, venda de produtos.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { GRASS, SOIL } from '../config/constants.js';
import { S } from '../core/GameState.js';
import { ctx } from '../rendering/Canvas.js';
import { bakeImg } from '../rendering/SpriteUtils.js';
import { beep } from './audio/AudioSystem.js';
import { sellAll } from './Progression.js';
import { toast } from '../ui/Toast.js';
import { assetUrl } from '../utils/assets.js';
import { qAdd } from '../world/village/Quests.js';
import { climate } from '../world/WeatherSystem.js';
import { crops, ground, wet } from '../world/World.js';

/* ============ TERRA ARADA VOLTA AO NORMAL (5 min sem plantar) ============ */
const tilled = {};
let tillT = 0;

function tillTick(dt) {
  tillT += dt;
  if (tillT < 2) return;
  const s = tillT;
  tillT = 0;
  for (const k in tilled) {
    const i = +k;
    if (ground[i] !== SOIL) {
      delete tilled[k];
      continue;
    }
    if (crops[i]) {
      tilled[k] = 0;
      continue;
    }
    tilled[k] += s;
    if (tilled[k] >= 300) {
      ground[i] = GRASS;
      wet[i] = 0;
      delete tilled[k];
    }
  }
}

function sell() {
  const total = sellAll(); // aplica o multiplicador de qualidade de cada unidade
  if (total > 0) {
    qAdd('coins', total);
    toast('Vendeu por ' + total + ' moedas');
    beep(880, 0.1, 'triangle');
  } else toast('Nada para vender');
}

/* ============ PLANTAS (sprites Craftpix: fases de cada cultivo) ============ */
const CSPR_DATA = {
  cenoura: [
    assetUrl('sprites/crops/cenoura_0.webp'),
    assetUrl('sprites/crops/cenoura_1.webp'),
    assetUrl('sprites/crops/cenoura_2.webp'),
  ],
  abobora: [
    assetUrl('sprites/crops/abobora_0.webp'),
    assetUrl('sprites/crops/abobora_1.webp'),
    assetUrl('sprites/crops/abobora_2.webp'),
  ],
  milho: [
    assetUrl('sprites/crops/milho_0.webp'),
    assetUrl('sprites/crops/milho_1.webp'),
    assetUrl('sprites/crops/milho_2.webp'),
  ],
};

const CSPR = {};

function cropModel(c) {
  const a = CSPR[c.k];
  if (!a) return null;
  const r = Math.min(c.d / c.need, 1);
  return a[r >= 1 ? 2 : r < 0.5 ? 0 : 1];
}

function drawCrop(c, bx, by, m) {
  if (!m || !m.ready) return;
  const t = performance.now() / 1000,
    ph = bx * 0.31 + by * 0.17,
    w = climate.wind || 0.5,
    amp = 0.45 + w * 1.5 + (climate.kind >= 3 ? 0.7 : 0);
  const sw = (Math.sin(t * 1.9 + ph) * 0.7 + Math.sin(t * 3.7 + ph * 1.6) * 0.3) * amp,
    dx = Math.round(bx - m.w / 2),
    dy = Math.round(by - m.h);
  for (let r = 0; r < m.h; r++) {
    const f = Math.max(0, 1 - ((r + 1) / m.h) * 1.08),
      o = Math.round(sw * Math.pow(f, 1.35) + Math.sin(t * 7 + r * 0.5 + ph) * 0.35 * f * (0.3 + w));
    ctx.drawImage(m.img, 0, r, m.w, 1, dx + o, dy + r, m.w, 1);
  }
}

export function loadCropSprites() {
  for (const k in CSPR_DATA)
    CSPR[k] = CSPR_DATA[k].map((src) => {
      const m = { ready: false, w: 0, h: 0, img: new Image(), sil: null };
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
      m.img.src = src;
      return m;
    });
}

export { cropModel, drawCrop, sell, tillTick, tilled };
