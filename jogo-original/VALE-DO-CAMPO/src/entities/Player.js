/**
 * Desenho do jogador, incluindo a imersão na água (reflexo, linha d'água, ondas). Inclui a skin antiga (drawLegacyPlayerBase), que o original já substituía pela de PlayerSprite.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { S } from '../core/GameState.js';
import { drawPlayerBase } from './PlayerSprite.js';
import { ctx } from '../rendering/Canvas.js';
import { drawPerson } from '../rendering/Characters.js';
import { assetUrl } from '../utils/assets.js';
import { wClamp } from '../world/WaterSystem.js';

/** Gasta energia de uma ação. `k` é o multiplicador do custo (ferramentas melhoradas gastam menos). */
function spend(k = 1) {
  S.energy = Math.max(0, S.energy - 2 * k);
}

function drawPlayer() {
  const w = S.wetK || 0;
  if (w < 0.03) {
    drawPlayerBase();
    return;
  }
  const t = performance.now() / 1000,
    bob = wClamp((S.wBob || 0) * 1.2, -2, 2) + Math.sin(t * 2.2) * 0.5 * w;
  const wy = Math.round(S.py + 1 - 12 * w + bob),
    cx = S.px,
    mvF = S.mv ? 1 : 0.45;
  // reflexo do personagem (espelhado na linha d'água, balançando)
  const k = Math.sin(t * 3 + cx * 0.2) * 0.09;
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - 18, wy, 36, 18);
  ctx.clip();
  ctx.globalAlpha = 0.32 * w;
  ctx.transform(1, 0, k, 1, -k * wy, 0);
  ctx.translate(0, 2 * wy);
  ctx.scale(1, -1);
  drawPlayerBase();
  ctx.restore();
  // corpo: só a parte acima da água ("água na barriga")
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - 20, S.py - 70, 40, wy - (S.py - 70));
  ctx.clip();
  ctx.translate(0, Math.round(2 * w));
  drawPlayerBase();
  ctx.restore();
  // lâmina d'água translúcida na cintura + anéis de ondas
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx - 11, wy + 5);
  for (let x = -11; x <= 11; x += 2) ctx.lineTo(cx + x, wy + Math.sin(t * 5 + x * 0.6 + cx) * 0.9 * mvF);
  ctx.lineTo(cx + 11, wy + 5);
  ctx.quadraticCurveTo(cx, wy + 10, cx - 11, wy + 5);
  ctx.closePath();
  ctx.fillStyle = `rgba(70,140,205,${0.5 * w})`;
  ctx.fill();
  ctx.strokeStyle = `rgba(225,244,255,${0.75 * w})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = -11; x <= 11; x += 2) {
    const yy = wy + Math.sin(t * 5 + x * 0.6 + cx) * 0.9 * mvF;
    x === -11 ? ctx.moveTo(cx + x, yy) : ctx.lineTo(cx + x, yy);
  }
  ctx.stroke();
  for (let n = 0; n < 3; n++) {
    const p = (t * (S.mv ? 1.4 : 0.7) + n / 3) % 1;
    ctx.strokeStyle = `rgba(225,244,255,${(1 - p) * 0.4 * w})`;
    ctx.beginPath();
    ctx.ellipse(cx, wy + 3, 9 + p * (S.mv ? 7 : 4), 3 + p * (S.mv ? 2.5 : 1.5), 0, 0, 6.283);
    ctx.stroke();
  }
  ctx.restore();
}

/* ===== Sprite do jogador (4 direções x 4 quadros de caminhada) ===== */
const PL_CW = 21,
  PL_CH = 28;

const PL_IMG = new Image();

let PL_DIAG = null;

function buildDiag() {
  // 3/4: cabeça de frente/costas deslocada sobre o corpo lateral (linhas: ↙ ↘ ↖ ↗)
  const c = document.createElement('canvas');
  c.width = PL_CW * 4;
  c.height = PL_CH * 4;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  const HEAD = 17;
  [
    [1, 0, -2],
    [2, 0, 2],
    [1, 3, -2],
    [2, 3, 2],
  ].forEach(([br, hr, sh], r) => {
    for (let k = 0; k < 4; k++) {
      const dx = k * PL_CW,
        dy = r * PL_CH;
      g.drawImage(PL_IMG, k * PL_CW, br * PL_CH, PL_CW, PL_CH, dx, dy, PL_CW, PL_CH);
      g.clearRect(dx, dy, PL_CW, HEAD);
      g.save();
      g.beginPath();
      g.rect(dx, dy, PL_CW, HEAD);
      g.clip();
      g.drawImage(PL_IMG, k * PL_CW, hr * PL_CH, PL_CW, HEAD, dx + sh, dy, PL_CW, HEAD);
      g.restore();
    }
  });
  PL_DIAG = c;
}

function drawLegacyPlayerBase() {
  if (!PL_IMG.complete || !PL_IMG.naturalWidth) {
    drawPerson(S.px, S.py, '#2e7fd0', '#5a3b1e', S.walk);
    return;
  }
  if (!PL_DIAG) buildDiag();
  const fr = S.mv ? Math.floor(S.walk / 1.25) % 4 : 0; // parado = quadro neutro
  if (S.mv) {
    const sp = Math.hypot(S.vx, S.vy) || 1,
      ax = Math.abs(S.vx) / sp,
      ay = Math.abs(S.vy) / sp; // 8 direções pela velocidade real
    if (ax > 0.4 && ay > 0.4) {
      S.dx = S.vx > 0 ? 1 : -1;
      S.dy = S.vy > 0 ? 1 : -1;
    } else {
      S.dx = 0;
      S.dy = 0;
    }
  }
  ctx.imageSmoothingEnabled = false;
  const X = Math.round(S.px - PL_CW / 2),
    Y = Math.round(S.py - PL_CH + 1);
  if (S.dx && S.dy) {
    const r = (S.dy > 0 ? 0 : 2) + (S.dx > 0 ? 1 : 0);
    ctx.drawImage(PL_DIAG, fr * PL_CW, r * PL_CH, PL_CW, PL_CH, X, Y, PL_CW, PL_CH);
    return;
  }
  const row = S.fx < 0 ? 1 : S.fx > 0 ? 2 : S.fy < 0 ? 3 : 0; // 0 frente, 1 esquerda, 2 direita, 3 costas
  ctx.drawImage(PL_IMG, fr * PL_CW, row * PL_CH, PL_CW, PL_CH, X, Y, PL_CW, PL_CH);
}

export function loadLegacyPlayerSprite() {
  PL_IMG.src = assetUrl('sprites/characters/player_legacy.webp');
}

export { drawPlayer, spend };
