/**
 * "Contexto PixiJS": um objeto com as mesmas chamadas do Canvas 2D que o jogo usa (fillRect, drawImage, fillStyle, globalAlpha,
 * setTransform/translate/scale, save/restore), mas que em vez de pintar pixels registra sprites do PixiJS na ORDEM em que foram
 * pedidos. No fim, `pixiLayerEnd()` manda a GPU desenhar tudo de uma vez (o PixiJS junta os sprites seguidos que usam a mesma
 * textura) e copia o resultado para o canvas do jogo. Assim o código de desenho atual (relevo, chão...) passa a ser executado
 * pela GPU sem ser reescrito, e a ordem de desenho continua exatamente a mesma.
 *
 * Só o que o código de uma camada realmente usa é aceito. Qualquer outra chamada (gradiente, clip, caminho...) NÃO é ignorada:
 * `pixiLayerBegin()` devolve null e a camada continua em Canvas 2D (plano B). Por isso cada camada declara o que usa.
 */
import { VH, VW } from '../../config/constants.js';
import { RS, mainCtx, setDrawCtx } from '../Canvas.js';
import { getPixi } from './PixiBridge.js';

let app = null,
  PIXI = null,
  root = null,
  pool = [],
  used = 0,
  W = 0,
  H = 0;
const texCache = new WeakMap(); // fonte (canvas/imagem) -> Map(chave do recorte -> Texture)
const colorCache = new Map();
let prevCtx = null,
  active = null,
  stats = { sprites: 0, layers: 0 };

function parseColor(s) {
  let c = colorCache.get(s);
  if (c) return c;
  let m;
  if ((m = /^#([0-9a-f]{3})$/i.exec(s))) c = { rgb: parseInt(m[1].replace(/./g, '$&$&'), 16), a: 1 };
  else if ((m = /^#([0-9a-f]{6})$/i.exec(s))) c = { rgb: parseInt(m[1], 16), a: 1 };
  else if ((m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(s)))
    c = { rgb: (+m[1] << 16) | (+m[2] << 8) | +m[3], a: m[4] === undefined ? 1 : +m[4] };
  else return null;
  colorCache.set(s, c);
  return c;
}

let initPromise = null;
/** Cria o desenhista de camadas (um segundo WebGL, só para as camadas). Chamar depois que o PixiJS estiver pronto. */
export function pixiLayersInit() {
  const px = getPixi();
  if (!px || initPromise) return initPromise;
  PIXI = px.PIXI;
  initPromise = (async () => {
    const r = new PIXI.WebGLRenderer();
    await r.init({
      width: VW,
      height: VH,
      resolution: 1,
      backgroundAlpha: 0,
      antialias: false,
      clearBeforeRender: true,
    });
    app = r;
    root = new PIXI.Container();
    return true;
  })().catch((e) => {
    console.warn('[Vale do Campo] camadas no PixiJS indisponíveis:', e);
    return false;
  });
  return initPromise;
}

function sprite() {
  if (used < pool.length) return pool[used++];
  const s = new PIXI.Sprite(PIXI.Texture.WHITE);
  pool.push(s);
  root.addChild(s);
  used++;
  return s;
}

function frameTex(src, sx, sy, sw, sh) {
  let per = texCache.get(src);
  if (!per) {
    per = new Map();
    texCache.set(src, per);
  }
  const key = ((sx * 4096 + sy) * 4096 + sw) * 4096 + sh;
  let t = per.get(key);
  if (!t) {
    const base = PIXI.Texture.from(src);
    t = new PIXI.Texture({ source: base.source, frame: new PIXI.Rectangle(sx, sy, sw, sh) });
    per.set(key, t);
  }
  return t;
}

/** Gradiente linear pedido ao contexto: na hora de pintar vira uma imagem pequena (guardada para os próximos quadros). */
class Grad {
  constructor(x0, y0, x1, y1) {
    this.p = [x0, y0, x1, y1];
    this.stops = [];
  }
  addColorStop(o, c) {
    this.stops.push([o, c]);
  }
}
const gradCache = new Map();
function gradImage(g, rx, ry, w, h) {
  const [x0, y0, x1, y1] = g.p;
  const key = [x0 - rx, y0 - ry, x1 - rx, y1 - ry, w, h, JSON.stringify(g.stops)].join('|');
  let c = gradCache.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const k = c.getContext('2d'),
      gr = k.createLinearGradient(x0 - rx, y0 - ry, x1 - rx, y1 - ry);
    for (const [o, col] of g.stops) gr.addColorStop(o, col);
    k.fillStyle = gr;
    k.fillRect(0, 0, w, h);
    gradCache.set(key, c);
  }
  return c;
}

class PixiCtx {
  constructor() {
    this.reset();
  }
  reset() {
    this.isPixiCtx = true;
    this.fillStyle = '#000';
    this.globalAlpha = 1;
    this.imageSmoothingEnabled = false;
    this.a = 1;
    this.d = 1;
    this.e = 0;
    this.f = 0;
    this.stack = [];
    this.bad = null;
  }
  save() {
    this.stack.push([this.fillStyle, this.globalAlpha, this.a, this.d, this.e, this.f]);
  }
  restore() {
    const s = this.stack.pop();
    if (s) [this.fillStyle, this.globalAlpha, this.a, this.d, this.e, this.f] = s;
  }
  setTransform(a, b, c, d, e, f) {
    if (b || c) this.bad = 'rotacao';
    this.a = a;
    this.d = d;
    this.e = e;
    this.f = f;
  }
  translate(x, y) {
    this.e += this.a * x;
    this.f += this.d * y;
  }
  scale(x, y) {
    this.a *= x;
    this.d *= y;
  }
  createLinearGradient(x0, y0, x1, y1) {
    return new Grad(x0, y0, x1, y1);
  }
  fillRect(x, y, w, h) {
    if (this.fillStyle instanceof Grad) {
      if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1)
        this.bad = 'gradiente em retângulo fracionado';
      else this.drawImage(gradImage(this.fillStyle, x, y, w, h), x, y);
      return;
    }
    const c = typeof this.fillStyle === 'string' ? parseColor(this.fillStyle) : null;
    if (!c) {
      this.bad = typeof this.fillStyle === 'string' ? 'cor ' + this.fillStyle : 'gradiente';
      return;
    }
    const s = sprite();
    s.texture = PIXI.Texture.WHITE;
    s.tint = c.rgb;
    s.alpha = c.a * this.globalAlpha;
    s.x = this.a * x + this.e;
    s.y = this.d * y + this.f;
    s.width = this.a * w;
    s.height = this.d * h;
    s.visible = true;
  }
  drawImage(img, ...r) {
    let sx = 0,
      sy = 0,
      sw = img.width,
      sh = img.height,
      dx,
      dy,
      dw,
      dh;
    if (r.length === 2) [dx, dy] = r;
    else if (r.length === 4) [dx, dy, dw, dh] = r;
    else if (r.length === 8) [sx, sy, sw, sh, dx, dy, dw, dh] = r;
    else {
      this.bad = 'drawImage ' + r.length;
      return;
    }
    if (dw === undefined) {
      dw = sw;
      dh = sh;
    }
    if (sx < 0 || sy < 0 || sx + sw > img.width || sy + sh > img.height) {
      this.bad = 'recorte fora da imagem';
      return;
    }
    const s = sprite();
    s.texture = frameTex(img, sx, sy, sw, sh);
    s.tint = 0xffffff;
    s.alpha = this.globalAlpha;
    s.x = this.a * dx + this.e;
    s.y = this.d * dy + this.f;
    s.width = this.a * dw;
    s.height = this.d * dh;
    s.visible = true;
  }
}

// Objeto "vazio" devolvido por chamadas não suportadas: aceita qualquer chamada em cadeia (ex.: gradiente.addColorStop) sem quebrar.
const VAZIO = new Proxy(function () {}, { get: () => VAZIO, apply: () => VAZIO });
const NAO_SUPORTADO = (t, k) => {
  if (k in t) return t[k];
  if (typeof k === 'symbol') return undefined;
  return () => {
    t.bad = 'método ' + k;
    return VAZIO;
  };
};
const pctx = new Proxy(new PixiCtx(), {
  get: NAO_SUPORTADO,
  set(t, k, v) {
    if (!(k in t) && k !== 'bad') t.bad = 'propriedade ' + k;
    t[k] = v;
    return true;
  },
});

/**
 * Começa uma camada: daqui até `pixiLayerEnd()` o jogo desenha no contexto PixiJS. Devolve false se o PixiJS ainda não está pronto
 * (a camada deve desenhar em Canvas como sempre).
 */
export function pixiLayerBegin() {
  if (!app || !getPixi()) return false;
  if (W !== VW * RS || H !== VH * RS) {
    W = VW * RS;
    H = VH * RS;
    app.resize(W, H);
    root.scale.set(RS);
  }
  used = 0;
  pctx.reset();
  const m = mainCtx.getTransform();
  pctx.setTransform(m.a / RS, 0, 0, m.d / RS, m.e / RS, m.f / RS);
  prevCtx = true;
  active = true;
  setDrawCtx(pctx);
  return true;
}

/** Termina a camada. Devolve o motivo se algo não suportado foi pedido (a camada NÃO foi aplicada: refazer em Canvas), senão null. */
export function pixiLayerEnd() {
  setDrawCtx(mainCtx);
  active = false;
  const bad = pctx.bad;
  if (bad) return bad;
  for (let i = used; i < pool.length && pool[i].visible; i++) pool[i].visible = false;
  app.render({ container: root });
  const g = mainCtx;
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(app.canvas, 0, 0, VW, VH);
  g.restore();
  // o código seguinte conta com o estado em que a camada deixou o contexto (câmera, cor, transparência)
  g.setTransform(pctx.a, 0, 0, pctx.d, pctx.e, pctx.f);
  if (typeof pctx.fillStyle === 'string') g.fillStyle = pctx.fillStyle;
  g.globalAlpha = pctx.globalAlpha;
  stats.sprites += used;
  stats.layers++;
  return null;
}

export const pixiLayerStats = stats;
