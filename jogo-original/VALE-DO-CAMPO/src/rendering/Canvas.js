/**
 * Canvas principal e camadas auxiliares. O mundo é desenhado em 480x270 lógico e ampliado em RS vezes (1x-3x) mantendo o pixel art nítido; as camadas de luz sobem suavizadas.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { TS, VH, VW } from '../config/constants.js';
import { gfx } from '../config/settings.js';
import { setStableNeed, stableNeed } from '../core/GameLoop.js';

const cv = document.getElementById('c');

// `desynchronized` deixa o navegador mostrar o canvas ANTES do quadro terminar (menos latência), mas isso exibe quadros
// pela metade (só o chão, sem árvores, personagem e névoa) = a tela pisca. Por isso fica DESLIGADO em qualquer aparelho.
// Chave na URL: ?desync liga de volta (só para teste).
const _desync = /[?&]desync\b/.test(location.search);
const mainCtx = cv.getContext('2d', { alpha: false, desynchronized: _desync });

/* `ctx` é uma ligação dinâmica (live binding): todo módulo que importa `ctx` desenha no contexto atual. O cache de
 * terreno troca temporariamente para o contexto dele (setDrawCtx) para reaproveitar as funções de desenho dos tiles. */
let ctx = mainCtx;

function setDrawCtx(c) {
  ctx = c;
}

const fxCanvas = document.createElement('canvas');

const fx = fxCanvas.getContext('2d');

const VIG = document.createElement('canvas');

const glowCanvas = document.createElement('canvas');

const gctx = glowCanvas.getContext('2d');

const grassCache = document.createElement('canvas');

const grassCtx = grassCache.getContext('2d');

/* ===== Resolução alta: o mundo continua 480x270 lógico, mas o canvas é desenhado em RS x (nítido, textos incluídos) ===== */
let RS = 2;

const _setT = mainCtx.setTransform.bind(mainCtx),
  _drawI = mainCtx.drawImage.bind(mainCtx);

function applyRes() {
  const dpr = window.devicePixelRatio || 1,
    sc = Math.min(innerWidth / VW, innerHeight / VH) * dpr;
  const NAT = Math.max(1, Math.min(applyRes.mob ? 2 : 3, Math.ceil(sc - 0.1)));
  if (!applyRes.fixed) RS = NAT;
  applyRes.nat = NAT;
  if (gfx.res === '1' || gfx.res === '2' || gfx.res === '3')
    RS = +gfx.res; // resolução escolhida no menu: fixa, o governador não mexe
  else if (RS > applyRes.cap) RS = applyRes.cap;
  cv.width = VW * RS;
  cv.height = VH * RS;
  cv.style.imageRendering = sc > RS ? 'pixelated' : 'auto';
  mainCtx.imageSmoothingEnabled = false;
  mainCtx.setTransform(1, 0, 0, 1, 0, 0);
}

/* ============ ILUMINAÇÃO REALISTA (lightmap) ============ */
function mkC(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function initCanvas() {
  fxCanvas.width = VW;
  fxCanvas.height = VH;
  VIG.width = VW;
  VIG.height = VH;

  {
    const g = VIG.getContext('2d'),
      gr = g.createRadialGradient(VW / 2, VH / 2, VH * 0.4, VW / 2, VH / 2, VW * 0.62);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(1, 'rgba(0,0,0,.30)');
    g.fillStyle = gr;
    g.fillRect(0, 0, VW, VH);
  } // vinheta pré-renderizada (custo ~zero)
  glowCanvas.width = VW;
  glowCanvas.height = VH;
  grassCache.width = TS * 5;
  grassCache.height = TS * 5;

  mainCtx.setTransform = function (a, b, c, d, e, f) {
    return _setT(a * RS, b * RS, c * RS, d * RS, e * RS, f * RS);
  };

  mainCtx.drawImage = function (img, ...r) {
    // camadas de luz/sombra/vinheta (480x270) sobem suavizadas, sprites continuam pixel-art
    if (img && img.width === VW && img.height === VH && img !== cv && r.length <= 2) {
      const o = mainCtx.imageSmoothingEnabled;
      mainCtx.imageSmoothingEnabled = true;
      mainCtx.imageSmoothingQuality = 'low';
      _drawI(img, ...r);
      mainCtx.imageSmoothingEnabled = o;
      return;
    }
    return _drawI(img, ...r);
  };

  applyRes.mob = !!(window.matchMedia && matchMedia('(pointer:coarse)').matches);

  applyRes.cap = applyRes.mob ? 2 : 3;

  applyRes();

  addEventListener('resize', () => {
    applyRes();
    try {
      setStableNeed(20);
    } catch (e) {}
  });
  addEventListener('orientationchange', () => setTimeout(applyRes, 200));
}

export { RS, VIG, applyRes, ctx, fx, fxCanvas, gctx, glowCanvas, mainCtx, mkC, setDrawCtx };
