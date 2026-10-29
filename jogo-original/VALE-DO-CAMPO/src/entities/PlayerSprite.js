/**
 * Skin 'Pixel Crawler' do jogador: 42 animações (andar, correr, carregar, coletar, cortar, regar, pescar, morrer) e escolha da animação conforme a ação.
 *
 * Origem: Vale_do_Campo_V64.html (s06)
 */

import { MW, WATER } from '../config/constants.js';
import { extensible } from '../core/extensions.js';
import { S } from '../core/GameState.js';
import { running } from './PlayerMovement.js';
import { ctx } from '../rendering/Canvas.js';
import { drawPerson } from '../rendering/Characters.js';
import { fishFrame, FS } from '../systems/Fishing.js';
import { actionA, target } from '../systems/InteractionSystem.js';
import { ITEMS, TOOLS } from '../systems/InventorySystem.js';
import { assetUrl } from '../utils/assets.js';
import { shroom } from '../world/Mushrooms.js';
import { crops, ground } from '../world/World.js';

/* Skin Pixel Crawler (personagem vestido) + animações de ação */
const PLA = new Image();

const PLM = {
  Idle_Down: [0, 4],
  Idle_Side: [1, 4],
  Idle_Up: [2, 4],
  Walk_Down: [3, 6],
  Walk_Side: [4, 6],
  Walk_Up: [5, 6],
  Run_Down: [6, 6],
  Run_Side: [7, 6],
  Run_Up: [8, 6],
  Carry_Idle_Down: [9, 4],
  Carry_Idle_Side: [10, 4],
  Carry_Idle_Up: [11, 4],
  Carry_Walk_Down: [12, 6],
  Carry_Walk_Side: [13, 6],
  Carry_Walk_Up: [14, 6],
  Carry_Run_Down: [15, 6],
  Carry_Run_Side: [16, 6],
  Carry_Run_Up: [17, 6],
  Collect_Down: [18, 8],
  Collect_Side: [19, 8],
  Collect_Up: [20, 8],
  Slice_Down: [21, 8],
  Slice_Side: [22, 8],
  Slice_Up: [23, 8],
  Pierce_Down: [24, 8],
  Pierce_Side: [25, 8],
  Pierce_Up: [26, 8],
  Crush_Down: [27, 8],
  Crush_Side: [28, 8],
  Crush_Up: [29, 8],
  Fishing_Down: [30, 8],
  Fishing_Side: [31, 8],
  Fishing_Up: [32, 8],
  Hit_Down: [33, 4],
  Hit_Side: [34, 4],
  Hit_Up: [35, 4],
  Death_Down: [36, 8],
  Death_Side: [37, 8],
  Death_Up: [38, 8],
  Watering_Down: [39, 8],
  Watering_Side: [40, 8],
  Watering_Up: [41, 8],
};

const PL_FPS = {
  Idle: 4,
  Walk: 9,
  Run: 12,
  Carry_Idle: 4,
  Carry_Walk: 9,
  Carry_Run: 12,
  Collect: 14,
  Slice: 14,
  Pierce: 14,
  Crush: 12,
  Fishing: 8,
  Hit: 10,
  Death: 7,
  Watering: 11,
};

const PA = { n: null, t0: 0, last: 0 };

function plAct(n) {
  const now = performance.now();
  if (PA.n === 'Death' && now - PA.t0 < 1800) return;
  PA.n = n;
  PA.t0 = now;
}

function plDir() {
  if (S.mv && S.dx && S.dy) return [S.dy > 0 ? 'Down' : 'Up', false];
  if (S.fx) return ['Side', S.fx < 0];
  return [S.fy < 0 ? 'Up' : 'Down', false];
}

const drawPlayerBase = extensible(function drawPlayerBase() {
  if (!PLA.complete || !PLA.naturalWidth) {
    drawPerson(S.px, S.py, '#2e7fd0', '#5a3b1e', S.walk);
    return;
  }
  if (S.mv) {
    const sp = Math.hypot(S.vx, S.vy) || 1,
      ax = Math.abs(S.vx) / sp,
      ay = Math.abs(S.vy) / sp;
    if (ax > 0.4 && ay > 0.4) {
      S.dx = S.vx > 0 ? 1 : -1;
      S.dy = S.vy > 0 ? 1 : -1;
    } else {
      S.dx = 0;
      S.dy = 0;
    }
  }
  const now = performance.now();
  let [d, flip] = plDir();
  let n, fr;
  if (FS.st) {
    d = FS.dir;
    flip = FS.flip;
  }
  if (FS.st && FS.st !== 'result') {
    n = 'Fishing';
    fr = fishFrame();
  } else if (PA.n) {
    const m = PLM[PA.n + '_' + d],
      f = PL_FPS[PA.n],
      k = Math.floor(((now - PA.t0) / 1000) * f);
    if (PA.n === 'Death') {
      fr = Math.min(m[1] - 1, k);
      if (now - PA.t0 > 1800) PA.n = null;
    } else if (k >= m[1]) PA.n = null;
    else fr = k;
    if (PA.n) n = PA.n;
  }
  if (!n) {
    let it = null;
    try {
      it = ITEMS[S.sel].id;
    } catch (e) {}
    const carry = it && !TOOLS.includes(it) && !S.inside;
    const run = S.mv && running && S.energy > 0;
    n = (carry ? 'Carry_' : '') + (S.mv ? (run ? 'Run' : 'Walk') : 'Idle');
    const m = PLM[n + '_' + d];
    fr = Math.floor((now / 1000) * PL_FPS[n]) % m[1];
  }
  const m = PLM[n + '_' + d];
  ctx.imageSmoothingEnabled = false;
  const X = Math.round(S.px - 32),
    Y = Math.round(S.py - 47);
  if (flip) {
    ctx.save();
    ctx.translate(Math.round(S.px), 0);
    ctx.scale(-1, 1);
    ctx.drawImage(PLA, fr * 64, m[0] * 64, 64, 64, -32, Y, 64, 64);
    ctx.restore();
  } else ctx.drawImage(PLA, fr * 64, m[0] * 64, 64, 64, X, Y, 64, 64);
});

export function loadPlayerSprite() {
  PLA.src = assetUrl('sprites/characters/player.webp');
}

export function installActionAnimations() {
  actionA.extend(
    (_aA) =>
      function () {
        try {
          const t = target(),
            i = t.y * MW + t.x,
            c = crops[i];
          if (S.energy <= 0) plAct('Death');
          else if (shroom[i] || (c && c.d >= c.need)) plAct('Collect');
          else {
            const it = ITEMS[S.sel].id;
            if (it === 'hoe') plAct('Crush');
            else if (it === 'can') plAct(ground[i] === WATER ? 'Fishing' : 'Watering');
            else if (it === 'scythe') plAct('Pierce');
            else if (it === 'axe') plAct('Slice');
            else if (ground[i] === WATER && it !== 'torch') plAct('Fishing');
            else if (it && it.indexOf('seed') === 0) plAct('Collect');
          }
        } catch (e) {}
        return _aA.apply(this, arguments);
      },
  );
}

export { drawPlayerBase, plAct, plDir };
