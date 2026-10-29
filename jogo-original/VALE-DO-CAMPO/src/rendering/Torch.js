/**
 * Noite muito escura, tocha na mão (sprite, luz e sombras dinâmicas no lightmap) e acendimento automático ao anoitecer.
 *
 * Origem: Vale_do_Campo_V64.html (s07, s08)
 */

import { OXP, OYP, VH, VW } from '../config/constants.js';
import { Q } from '../config/settings.js';
import { S, sleeping } from '../core/GameState.js';
import { update } from '../core/GameUpdate.js';
import { drawPlayer } from '../entities/Player.js';
import { drawPlayerBase, plDir } from '../entities/PlayerSprite.js';
import { WF, wolfTick } from '../entities/Werewolf.js';
import { ctx, mkC } from './Canvas.js';
import { glow } from './Effects.js';
import { ambient, applyLighting, blurTo } from './LightingSystem.js';
import { casterShadow } from './ShadowSystem.js';
import { SPR } from './Sprites.js';
import { ITEMS, TOOLS } from '../systems/InventorySystem.js';
import { renderHotbar } from '../ui/Hotbar.js';
import { toast } from '../ui/Toast.js';
import { smooth } from '../utils/MathUtils.js';

/* ============ NOITE: escuridão total, tocha com luz/sombra dinâmicas e lobisomem ============ */
const NT = { prev: 0, night: false, wasIn: false, R: 112, warned: false }; // R = alcance da tocha em px (112 px = 7 blocos de 16 px)

let TLc = null,
  TLx = null,
  TSM = null,
  TSc = null; // canvases criados só quando a tocha é usada (economiza memória de dia)

function NTK(h) {
  return h >= 12 ? smooth(18.8, 20.3, h) : 0;
} // 0 = dia ... 1 = noite fechada

function NTD(h) {
  return NTK(h) * (S.lum == null ? 1 : S.lum);
}

function torchIdx() {
  return ITEMS.findIndex((i) => i.id === 'torch');
}

function torchLit() {
  if (S.inside || sleeping) return false;
  try {
    return ITEMS[S.sel].id === 'torch';
  } catch (e) {
    return false;
  }
}

/* --- tocha na mão do personagem --- */
function torchHand() {
  const d = plDir(),
    b = S.mv && Math.floor(performance.now() / 110) % 2 ? -1 : 0;
  if (d[0] === 'Side') return [S.px + (d[1] ? -9 : 9), S.py - 11 + b];
  if (d[0] === 'Up') return [S.px - 8, S.py - 13 + b];
  return [S.px + 8, S.py - 10 + b];
}

function drawTorchSprite(onlyFlame) {
  const h = torchHand(),
    x = Math.round(h[0]),
    y = Math.round(h[1]),
    t = performance.now() / 1000;
  const sw = Math.round(Math.sin(t * 13) * 1.2),
    fl = Math.sin(t * 21) > 0.2 ? 1 : 0;
  ctx.imageSmoothingEnabled = false;
  if (!onlyFlame) {
    ctx.fillStyle = '#4a2b14';
    ctx.fillRect(x - 1, y - 8, 3, 10);
    ctx.fillStyle = '#8a5a2c';
    ctx.fillRect(x - 1, y - 8, 2, 10);
    ctx.fillStyle = '#2b1d17';
    ctx.fillRect(x - 2, y - 10, 5, 3);
  }
  ctx.fillStyle = '#d9390f';
  ctx.fillRect(x - 2 + sw, y - 14 - fl, 5, 4 + fl);
  ctx.fillRect(x - 1 + sw, y - 17 - fl, 3, 3);
  ctx.fillStyle = '#ff9a25';
  ctx.fillRect(x - 1 + sw, y - 14, 3, 4);
  ctx.fillRect(x + sw, y - 16 - fl, 1, 2);
  ctx.fillStyle = '#ffe58a';
  ctx.fillRect(x + sw, y - 13, 1, 3);
}

/* --- luz da tocha no lightmap: gradiente + sombras projetadas pelos sprites (longe da tocha) --- */
function torchApply(L, t, h, camX, camY, ents) {
  const nd = NTD(h);
  if (nd < 0.05 || !torchLit()) return;
  if (!TLc) {
    TLc = mkC(VW, VH);
    TLx = TLc.getContext('2d');
    TSM = mkC(VW, VH);
    TSc = TSM.getContext('2d');
  }
  const k = smooth(0.05, 0.5, nd),
    q = Q(),
    hd = torchHand();
  const fl = 1 + 0.035 * Math.sin(t * 11) + 0.02 * Math.sin(t * 27 + 1.3) + 0.015 * Math.sin(t * 5.3); // chama tremulando
  const R = NT.R * fl,
    cx = hd[0] + Math.sin(t * 17) * 0.4,
    cy = S.py - 8,
    sx = cx - camX,
    sy = cy - camY;
  TLx.setTransform(1, 0, 0, 1, 0, 0);
  TLx.globalAlpha = 1;
  TLx.globalCompositeOperation = 'source-over';
  TLx.clearRect(0, 0, VW, VH);
  const g = TLx.createRadialGradient(sx, sy, 2, sx, sy, R);
  g.addColorStop(0, 'rgba(255,214,150,1)');
  g.addColorStop(0.16, 'rgba(255,184,104,.9)');
  g.addColorStop(0.42, 'rgba(246,140,62,.58)');
  g.addColorStop(0.68, 'rgba(205,95,40,.28)');
  g.addColorStop(0.88, 'rgba(130,55,28,.09)');
  g.addColorStop(1, 'rgba(90,35,25,0)');
  TLx.fillStyle = g;
  TLx.fillRect(sx - R, sy - R, 2 * R, 2 * R);
  // objetos ao alcance da luz (do mais longe para o mais perto)
  const list = [];
  for (const en of ents) {
    if (en.draw === drawPlayer) continue;
    const s = en.sh;
    if (!s || s[2] <= 1) continue;
    const dx = s[0] - cx,
      dy = s[1] - cy,
      d = Math.hypot(dx, dy),
      ext = s[4] === 'house' ? 64 : s[2] > 60 ? s[2] / 2 : 0;
    if (d - ext > R + 70 || d < 3) continue;
    list.push([d, dx, dy, s]);
  }
  if (list.length) {
    list.sort((a, b) => b[0] - a[0]);
    TSc.setTransform(1, 0, 0, 1, 0, 0);
    TSc.globalAlpha = 1;
    TSc.globalCompositeOperation = 'source-over';
    TSc.clearRect(0, 0, VW, VH);
    TSc.setTransform(1, 0, 0, 1, -camX, -camY);
    TSc.fillStyle = TSc.strokeStyle = '#000';
    for (const [d, dx, dy, s] of list) {
      const m = Math.max(0.55, Math.min(1.9, 0.65 + 1.3 * (1 - d / R))); // quanto mais perto da tocha, mais comprida a sombra
      casterShadow(TSc, s, (dx / d) * m, (dy / d) * m, 1); // silhueta real do sprite, projetada para longe da tocha
      const mo = s[4] === 'tree' ? s[5] : s[4] === 'house' ? SPR.house : null;
      if (mo && mo.ready) {
        // a face voltada para a tocha continua iluminada
        TSc.globalCompositeOperation = 'destination-out';
        if (s[4] === 'tree') TSc.fillRect(Math.round(s[0] - mo.w / 2), Math.round(s[1] - mo.h + 2), mo.w, mo.h - 4);
        else TSc.fillRect(210 + OXP, 53 + OYP, mo.w, mo.h);
        TSc.globalCompositeOperation = 'source-over';
      }
    }
    TLx.setTransform(1, 0, 0, 1, 0, 0);
    TLx.globalCompositeOperation = 'destination-out';
    TLx.globalAlpha = 0.5;
    TLx.drawImage(TSM, 0, 0);
    TLx.globalAlpha = 1;
    blurTo(TLx, TSM, 0); // borda nítida + penumbra
    TLx.globalCompositeOperation = 'source-over';
  }
  L.setTransform(1, 0, 0, 1, 0, 0);
  L.globalCompositeOperation = 'lighter';
  L.globalAlpha = k;
  L.drawImage(TLc, 0, 0);
  L.globalAlpha = 1;
  L.globalCompositeOperation = 'source-over';
}

function torchPost(t, h, camX, camY) {
  const nd = NTD(h);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, -camX, -camY);
  if (torchLit()) {
    if (nd > 0.05) {
      const hd = torchHand();
      ctx.globalCompositeOperation = 'lighter';
      glow(hd[0], hd[1] - 13, 17, '255,170,70', 0.38 * smooth(0.05, 0.5, nd) * (0.85 + 0.15 * Math.sin(t * 19)));
    }
    ctx.globalCompositeOperation = 'source-over';
    drawTorchSprite(true);
  }
  const W = WF;
  if (W.st !== 'off' && W.vis > 0.02 && !S.inside && (t * 1.3 + W.ph) % 4 > 0.14) {
    const ex = W.x + W.face * 14,
      ey = W.y - 17,
      a = W.vis;
    ctx.globalCompositeOperation = 'lighter';
    for (const o of [-2.2, 2.2]) {
      glow(ex + o, ey, 7, '255,60,25', 0.5 * a);
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const o of [-2.2, 2.2]) {
      ctx.globalAlpha = a;
      ctx.fillStyle = '#ff4a1c';
      ctx.fillRect(Math.round(ex + o) - 1, Math.round(ey), 2, 2);
      ctx.fillStyle = '#ffe0a8';
      ctx.fillRect(Math.round(ex + o) - 1, Math.round(ey), 1, 1);
    }
    ctx.globalAlpha = 1;
  }
  if (W.hurt > 0) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(150,0,0,${Math.min(0.5, W.hurt * 0.7)})`;
    ctx.fillRect(0, 0, VW, VH);
  }
  ctx.restore();
}

/* --- tocha automática ao anoitecer + ciclo do lobisomem --- */
function torchEquip() {
  const ti = torchIdx();
  if (ti < 0 || S.sel === ti) return;
  NT.prev = S.sel;
  S.sel = ti;
  try {
    renderHotbar();
  } catch (e) {}
  toast('🔥 Anoiteceu — tocha na mão! Não fique no escuro.');
}

function torchTick(dt) {
  if (!S || (dt <= 0 && false)) return;
  const h = 6 + S.min / 60,
    night = NTD(h) > 0.3,
    ti = torchIdx();
  if (night && !S.inside && !sleeping && (!NT.night || NT.wasIn)) torchEquip(); // ao escurecer, ou ao sair de casa de noite
  if (!night && NT.night && ti >= 0 && S.sel === ti) {
    S.sel = NT.prev || 0;
    try {
      renderHotbar();
    } catch (e) {}
  }
  NT.night = night;
  NT.wasIn = !!S.inside;
  wolfTick(dt);
}

export function registerTorchItem() {
  ITEMS.splice(4, 0, { id: 'torch', n: '🔥 Tocha' });
  TOOLS.push('torch'); // pesca removida: peixes agora são só fauna
}

export function installNightDarkness() {
  /* --- noite muito escura: reduz a luz ambiente --- */
  ambient.extend(
    (_amb) =>
      function (h) {
        const c = _amb(h),
          k = NTD(h);
        if (k < 0.01) return c;
        const f = 1 - 0.87 * k;
        return c.map((v) => Math.max(3, v * f));
      },
  );
}

export function installTorchSprite() {
  drawPlayerBase.extend(
    (_dpb) =>
      function () {
        const on = torchLit(),
          up = on && plDir()[0] === 'Up';
        if (up) drawTorchSprite(false);
        _dpb();
        if (on && !up) drawTorchSprite(false);
      },
  );
}

export function installTorchPost() {
  /* --- brilho da chama, olhos do lobisomem e flash de dano (depois da iluminação) --- */
  applyLighting.extend(
    (_al) =>
      function (t, h, camX, camY, ents) {
        _al.apply(this, arguments);
        try {
          torchPost(t, h, camX, camY);
        } catch (e) {}
      },
  );
}

export function installTorchUpdate() {
  update.extend(
    (_up) =>
      function (dt) {
        _up(dt);
        try {
          torchTick(dt);
        } catch (e) {}
      },
  );
}

export { NT, NTD, NTK, torchApply, torchHand, torchLit };
