/**
 * Mato e mudas: crescimento do mato, corte com a foice, mudas de árvores e desenho do mato que cobre os pés.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { GRASS, MH, MW, OX, OY, TREE, TS } from '../config/constants.js';
import { FASE, HEL, PLANTS, SAM, plantBlurb } from '../config/plants.js';
import { toolFx } from '../config/progression.js';
import { extensible } from '../core/extensions.js';
import { S } from '../core/GameState.js';
import { herd } from '../entities/cow/Herd.js';
import { npc, npcPos } from '../entities/NPC.js';
import { spend } from '../entities/Player.js';
import { ctx } from '../rendering/Canvas.js';
import { SPR } from '../rendering/Sprites.js';
import { beep } from '../systems/audio/AudioSystem.js';
import { ITEMS } from '../systems/InventorySystem.js';
import { toast } from '../ui/Toast.js';
import { hash2 } from '../utils/MathUtils.js';
import { mato, sapl, seedAge, wearT, wl } from './hydrology/Hydrology.js';
import { speciesAt, stageAt } from './PlantSpecies.js';
import { climate } from './WeatherSystem.js';
import { crops, ground, obj } from './World.js';

function crowd(i) {
  let n = 0;
  const tx = i % MW,
    ty = (i / MW) | 0;
  for (let a = -1; a <= 1; a++)
    for (let b = -1; b <= 1; b++) {
      const x = tx + b,
        y = ty + a;
      if (x >= 0 && y >= 0 && x < MW && y < MH && obj[y * MW + x] === TREE) n++;
    }
  return n;
}

function treeFree(i) {
  const x = (i % MW) * TS + 8,
    y = ((i / MW) | 0) * TS + 8,
    n = npcPos();
  return (
    Math.hypot(x - S.px, y - S.py) > 16 &&
    herd.every((q) => Math.hypot(x - q.x, y - q.y) > 16) &&
    (npc.inside || Math.hypot(x - n.x, y - n.y) > 16)
  );
}

const treeDrop = extensible(function treeDrop(i) {
  const tx = i % MW,
    ty = (i / MW) | 0,
    a = Math.random() * 6.283,
    d = 1 + Math.floor(Math.random() * 3),
    x = tx + Math.round(Math.cos(a) * d),
    y = ty + Math.round(Math.sin(a) * d);
  if (x < 1 || y < 1 || x >= MW - 1 || y >= MH - 1 || (x >= 12 + OX && x <= 20 + OX && y >= 5 + OY && y <= 14 + OY))
    return;
  const j = y * MW + x;
  if (ground[j] === GRASS && !obj[j] && !crops[j] && !seedAge[j] && !sapl[j] && wl[j] < 0.05) seedAge[j] = 1;
});

function cutMato(cx, cy) {
  let n = 0,
    drops = 0;
  const cut = [0, 0, 0]; // por espécie (índice = HEL/SAM)
  const fx = toolFx('scythe'),
    R = fx.radius; // 1 = 3x3 (básica); níveis maiores cortam 5x5 e 7x7
  for (let dy = -R; dy <= R; dy++)
    for (let dx = -R; dx <= R; dx++) {
      const x = cx + dx,
        y = cy + dy;
      if (x < 0 || y < 0 || x >= MW || y >= MH) continue;
      const j = y * MW + x;
      if (ground[j] === GRASS && mato[j] > 12) {
        const tall = mato[j] >= 128;
        cut[speciesAt(j)]++;
        mato[j] = 4;
        n++;
        if (Math.random() < (tall ? 0.025 : 0.005)) drops++;
      }
    }
  if (n) {
    spend(fx.energy);
    beep(260, 0.06, 'sawtooth');
    const quais = [HEL, SAM].filter((k) => cut[k]).map((k) => `${cut[k]} ${PLANTS[k].nome.toLowerCase()}`);
    toast('✂️ Mato cortado em ' + n + ' tiles' + (quais.length ? ' (' + quais.join(', ') + ')' : ''));
    const got = [];
    for (let k = 0; k < drops; k++) {
      const w = Math.random() * 7,
        sd = w < 1 ? 'seedP' : w < 4 ? 'seedC' : 'seedM';
      S.inv[sd]++;
      got.push(ITEMS.find((x) => x.id === sd).n);
    } // abóbora é a mais rara (1 de 7)
    if (got.length)
      setTimeout(() => {
        toast('🌱 Achou: ' + got.join(', ') + '!');
        beep(740, 0.12, 'triangle');
      }, 700);
  } else toast('Sem mato alto aqui');
} // área: 3x3 na foice básica, até 7x7 melhorada

const drawSapling = extensible(function drawSapling(x, y, s) {
  const h = 3 + s * 10,
    cx = x + 8,
    by = y + 14;
  ctx.fillStyle = '#5a3d24';
  ctx.fillRect(cx, by - h, 1 + (s > 0.5 ? 1 : 0), h);
  ctx.fillStyle = s > 0.6 ? '#2f7f3d' : '#4aa24a';
  ctx.beginPath();
  ctx.arc(cx + 0.5, by - h, 2 + s * 4, 0, 6.283);
  ctx.fill();
  ctx.fillStyle = 'rgba(170,230,120,.45)';
  ctx.fillRect(cx - 1, by - h - 2, 2, 1);
});

// A lista é reaproveitada a cada quadro (antes criava ~450 objetos por quadro: lixo para o coletor no celular).
const MATO_POOL = [],
  MATO_LIST = [];

// Onde a planta nasce DENTRO do tile: sorteio fixo por tile (hash), nos dois eixos, para não formar grade nem ficar
// sempre no centro. A base da planta varia de -7 a +7 px na horizontal e de -5 a +5 na vertical (pode invadir o vizinho).
const matoDX = (tx, ty) => Math.floor(hash2(tx * 13 + 1, ty * 17 + 9) * 15) - 7,
  matoDY = (tx, ty) => Math.floor(hash2(tx * 19 + 5, ty * 23 + 2) * 11) - 5;

function hydroMatoList(x0, x1, y0, y1) {
  const L = MATO_LIST;
  let n = 0;
  for (let ty = y0; ty <= y1; ty++)
    for (let tx = x0; tx <= x1; tx++) {
      const i = ty * MW + tx;
      if (ground[i] === GRASS && mato[i] > FASE[0] && wl[i] < 0.03 && wearT[i] < 0.12 && !obj[i]) {
        const o = MATO_POOL[n] || (MATO_POOL[n] = { k: 0, tx: 0, ty: 0, i: 0 });
        o.k = ty * TS + 6 + matoDY(tx, ty); // a ordem Y segue o pé da planta, que agora varia dentro do tile
        o.tx = tx;
        o.ty = ty;
        o.i = i;
        L[n++] = o;
      }
    }
  L.length = n;
  L.sort((a, b) => a.k - b.k); // o pé varia por tile: a lista deixa de sair em ordem de linha
  return L;
}

/**
 * Desenha a planta (helicônia ou samambaia, fase 1-4) do tile de mato, num ponto sorteado dentro do tile (matoDX/DY)
 * e com a copa passando para cima; a ordem Y (hydroMatoList) faz o mato cobrir os pés de quem está atrás dele.
 * `t` é o tempo em segundos: o vento balança a planta 1 px e o jogador por perto a faz tremer.
 */
function drawMato(tx, ty, t, i) {
  const sp = speciesAt(i),
    st = stageAt(i);
  if (!sp || !st) return;
  const h = hash2(tx * 7 + 3, ty * 11 + 5);
  if (st === 1 && h < 0.45) return; // brotos nascem aos poucos: nem todo tile com um pouco de mato mostra o seu
  const m = SPR[`${PLANTS[sp].sprites}_${st}`];
  if (!m || !m.ready) return;
  const x = tx * TS,
    y = ty * TS,
    ws = Math.sin(t * 1.3 + tx * 0.7 + ty * 0.4) * (0.6 + climate.wind * 0.6),
    rs = Math.hypot(x + 8 - S.px, y + 8 - S.py) < 22 ? Math.sin(t * 14) * 1.3 : 0,
    lean = Math.round(ws * 0.5 + rs);
  ctx.drawImage(m.img, Math.round(x + 8 - m.w / 2) + matoDX(tx, ty) + lean, y + 14 + matoDY(tx, ty) - m.h);
}

/** Compatibilidade com o teste de desempenho (core/Bench.js): o mato agora é sempre uma sprite pronta. */
export function setMatoLive(value) {
  return !!value;
}

/** Mostra a planta do tile (nome, fase e onde ela nasce na vida real); devolve false se não há mato visível. */
function inspectMato(i) {
  const st = stageAt(i);
  if (ground[i] !== GRASS || !st) return false;
  toast(plantBlurb(speciesAt(i), st));
  return true;
}

export { crowd, cutMato, inspectMato, drawMato, drawSapling, hydroMatoList, treeDrop, treeFree };
