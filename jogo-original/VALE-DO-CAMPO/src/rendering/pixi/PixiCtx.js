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

let seq = 0,
  gpool = [],
  gused = 0,
  mpool = [],
  mused = 0,
  app = null,
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
    root.sortableChildren = true; // a ordem de desenho é o zIndex (sprites e formas se misturam)
    return true;
  })().catch((e) => {
    console.warn('[Vale do Campo] camadas no PixiJS indisponíveis:', e);
    return false;
  });
  return initPromise;
}

function sprite() {
  let s;
  if (used < pool.length) s = pool[used++];
  else {
    s = new PIXI.Sprite(PIXI.Texture.WHITE);
    pool.push(s);
    root.addChild(s);
    used++;
  }
  s.zIndex = seq++;
  s.mask = pctx.clipMask;
  return s;
}

/** Forma (Graphics) nova na ordem de desenho; guardada num pool, refeita a cada uso. */
function shape() {
  let g;
  if (gused < gpool.length) g = gpool[gused++];
  else {
    g = new PIXI.Graphics();
    gpool.push(g);
    root.addChild(g);
    gused++;
  }
  g.clear();
  g.zIndex = seq++;
  g.mask = pctx.clipMask;
  g.visible = true;
  return g;
}

/** Máscara (para clip) com o caminho atual do contexto: fica na cena, mas não aparece. */
function maskPath(c) {
  let g;
  if (mused < mpool.length) g = mpool[mused++];
  else {
    g = new PIXI.Graphics();
    g.renderable = false;
    mpool.push(g);
    root.addChild(g);
    mused++;
  }
  g.clear();
  if (!c.buildPath(g)) c.bad = 'clip com forma não suportada';
  g.fill(0xffffff);
  c.place(g);
  g.visible = true;
  return g;
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

const bakeCache = new Map(); // elipses e textos já "fotografados" (chave -> { c: canvas, ox, oy })
let frameId = 0;
const lastUpdate = new WeakMap();
let tmpM = null;

/** Canvas que o jogo redesenha (não é sprite pronto de `bakeImg`): manda o PixiJS reenviar para a GPU, no máximo 1 vez por quadro. */
function refresh(img, tex) {
  if (img.naturalWidth || !(img instanceof HTMLCanvasElement)) return;
  if (lastUpdate.get(img) === frameId) return;
  lastUpdate.set(img, frameId);
  if (tex.source.update) tex.source.update();
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
    this.imageSmoothingQuality = 'low';
    this.globalCompositeOperation = 'source-over';
    this.font = '10px sans-serif';
    this.textAlign = 'start';
    this.textBaseline = 'alphabetic';
    this.m = [1, 0, 0, 1, 0, 0];
    this.stack = [];
    this.strokeStyle = '#000';
    this.lineWidth = 1;
    this.lineCap = 'butt';
    this.lineJoin = 'miter';
    this.clipMask = null;
    this.ops = [];
    this.path = null;
    this.bad = null;
  }
  save() {
    this.stack.push([
      this.fillStyle,
      this.globalAlpha,
      this.m.slice(),
      this.font,
      this.textAlign,
      this.textBaseline,
      this.strokeStyle,
      this.lineWidth,
      this.clipMask,
    ]);
  }
  restore() {
    const s = this.stack.pop();
    if (s)
      [
        this.fillStyle,
        this.globalAlpha,
        this.m,
        this.font,
        this.textAlign,
        this.textBaseline,
        this.strokeStyle,
        this.lineWidth,
        this.clipMask,
      ] = s;
  }
  setTransform(a, b, c, d, e, f) {
    this.m = [a, b, c, d, e, f];
  }
  transform(a, b, c, d, e, f) {
    const [A, B, C, D, E, F] = this.m;
    this.m = [A * a + C * b, B * a + D * b, A * c + C * d, B * c + D * d, A * e + C * f + E, B * e + D * f + F];
  }
  translate(x, y) {
    this.transform(1, 0, 0, 1, x, y);
  }
  scale(x, y) {
    this.transform(x, 0, 0, y, 0, 0);
  }
  rotate(r) {
    const c = Math.cos(r),
      s = Math.sin(r);
    this.transform(c, s, -s, c, 0, 0);
  }
  createLinearGradient(x0, y0, x1, y1) {
    return new Grad(x0, y0, x1, y1);
  }
  /** Põe o sprite `s` no retângulo (dx, dy, dw, dh) da tela do jogo, já com a transformação atual. */
  put(s, tex, dx, dy, dw, dh) {
    const [A, B, C, D, E, F] = this.m;
    const sx = dw / tex.frame.width,
      sy = dh / tex.frame.height;
    s.texture = tex;
    if (B === 0 && C === 0) {
      if (s._rot) {
        s.rotation = 0;
        s.skew.set(0, 0);
        s._rot = false;
      }
      s.x = A * dx + E;
      s.y = D * dy + F;
      s.scale.set(A * sx, D * sy);
    } else {
      tmpM ||= new PIXI.Matrix();
      tmpM.set(A * sx, B * sx, C * sy, D * sy, A * dx + C * dy + E, B * dx + D * dy + F);
      s.setFromMatrix(tmpM);
      s._rot = true;
    }
    s.visible = true;
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
    s.tint = c.rgb;
    s.alpha = c.a * this.globalAlpha;
    this.put(s, PIXI.Texture.WHITE, x, y, w, h);
  }
  beginPath() {
    this.ops = [];
  }
  closePath() {
    this.ops.push(['Z']);
  }
  moveTo(x, y) {
    this.ops.push(['M', x, y]);
  }
  lineTo(x, y) {
    this.ops.push(['L', x, y]);
  }
  quadraticCurveTo(cx, cy, x, y) {
    this.ops.push(['Q', cx, cy, x, y]);
  }
  bezierCurveTo(c1x, c1y, c2x, c2y, x, y) {
    this.ops.push(['C', c1x, c1y, c2x, c2y, x, y]);
  }
  rect(x, y, w, h) {
    this.ops.push(['R', x, y, w, h]);
  }
  arc(x, y, r, sa, ea, ccw) {
    this.ellipse(x, y, r, r, 0, sa, ea, ccw);
  }
  ellipse(x, y, rx, ry, rot, sa, ea, ccw) {
    this.ops.push(['A', x, y, rx, ry, rot, sa, ea, !!ccw]);
  }
  clip() {
    this.clipMask = maskPath(this);
  }
  /** Monta o caminho atual numa forma do PixiJS (ou devolve false se tem algo que não sabemos montar). */
  buildPath(g) {
    let first = true; // ainda não há subcaminho aberto?
    for (const o of this.ops) {
      switch (o[0]) {
        case 'M':
          g.moveTo(o[1], o[2]);
          break;
        case 'L':
          g.lineTo(o[1], o[2]);
          break;
        case 'Q':
          g.quadraticCurveTo(o[1], o[2], o[3], o[4]);
          break;
        case 'C':
          g.bezierCurveTo(o[1], o[2], o[3], o[4], o[5], o[6]);
          break;
        case 'Z':
          g.closePath();
          break;
        case 'R':
          g.rect(o[1], o[2], o[3], o[4]);
          break;
        case 'A': {
          const [, x, y, rx, ry, rot, sa, ea, ccw] = o;
          if (!rot && Math.abs(Math.abs(ea - sa) - Math.PI * 2) < 1e-6 && first) g.ellipse(x, y, rx, ry);
          else {
            // arco parcial ou elipse girada: vira uma linha quebrada com pontos suficientes para parecer curva
            let da = ea - sa;
            if (!ccw && da < 0) da += Math.PI * 2 * Math.ceil(-da / (Math.PI * 2));
            if (ccw && da > 0) da -= Math.PI * 2 * Math.ceil(da / (Math.PI * 2));
            if (Math.abs(da) > Math.PI * 2) da = Math.sign(da) * Math.PI * 2;
            const n = Math.max(12, Math.ceil(Math.max(rx, ry) * Math.abs(da)));
            const cr = Math.cos(rot),
              sr = Math.sin(rot);
            for (let i = 0; i <= n; i++) {
              const t = sa + (da * i) / n,
                ex = rx * Math.cos(t),
                ey = ry * Math.sin(t),
                px = x + ex * cr - ey * sr,
                py = y + ex * sr + ey * cr;
              if (i === 0 && first) g.moveTo(px, py);
              else g.lineTo(px, py);
            }
          }
          break;
        }
      }
      first = o[0] === 'Z';
    }
    return true;
  }
  place(g) {
    tmpM ||= new PIXI.Matrix();
    const m = this.m;
    tmpM.set(m[0], m[1], m[2], m[3], m[4], m[5]);
    g.setFromMatrix(tmpM);
  }
  fill() {
    const c = typeof this.fillStyle === 'string' ? parseColor(this.fillStyle) : null;
    if (!c) {
      this.bad = 'fill com cor não suportada';
      return;
    }
    const o = this.ops;
    if (o.length === 1 && o[0][0] === 'A' && !o[0][5] && Math.abs(Math.abs(o[0][7] - o[0][6]) - Math.PI * 2) < 1e-6) {
      // uma elipse inteira (as sombras): vira uma imagem pequena guardada, bem mais barata que uma forma
      const [, x, y, rx, ry] = o[0];
      this.fillBaked(x, y, rx, ry, c);
      return;
    }
    const g = shape();
    if (!this.buildPath(g)) {
      this.bad = 'forma com arco parcial de elipse';
      g.visible = false;
      return;
    }
    g.fill({ color: c.rgb, alpha: c.a * this.globalAlpha });
    this.place(g);
  }
  stroke() {
    const c = typeof this.strokeStyle === 'string' ? parseColor(this.strokeStyle) : null;
    if (!c) {
      this.bad = 'traço com cor não suportada';
      return;
    }
    const g = shape();
    if (!this.buildPath(g)) {
      this.bad = 'forma com arco parcial de elipse';
      g.visible = false;
      return;
    }
    g.stroke({
      color: c.rgb,
      alpha: c.a * this.globalAlpha,
      width: this.lineWidth,
      cap: this.lineCap,
      join: this.lineJoin,
    });
    this.place(g);
  }
  fillBaked(x, y, rx, ry, c) {
    const w = Math.ceil(rx * 2) + 2,
      h = Math.ceil(ry * 2) + 2;
    const key = 'e|' + rx.toFixed(2) + '|' + ry.toFixed(2) + '|' + this.fillStyle;
    let b = bakeCache.get(key);
    if (!b) {
      const cv = document.createElement('canvas');
      cv.width = w;
      cv.height = h;
      const k = cv.getContext('2d');
      k.fillStyle = this.fillStyle;
      k.beginPath();
      k.ellipse(w / 2, h / 2, rx, ry, 0, 0, Math.PI * 2);
      k.fill();
      cv.naturalWidth = w; // marca como imagem pronta (nunca mais muda)
      b = { c: cv, ox: w / 2, oy: h / 2 };
      bakeCache.set(key, b);
    }
    const s = sprite();
    s.tint = 0xffffff;
    s.alpha = this.globalAlpha;
    this.put(s, frameTex(b.c, 0, 0, b.c.width, b.c.height), x - b.ox, y - b.oy, b.c.width, b.c.height);
  }
  fillText(txt, x, y) {
    if (typeof this.fillStyle !== 'string') {
      this.bad = 'texto com gradiente';
      return;
    }
    const key = 't|' + this.font + '|' + this.fillStyle + '|' + this.textAlign + '|' + this.textBaseline + '|' + txt;
    let b = bakeCache.get(key);
    if (!b) {
      const k0 = document.createElement('canvas').getContext('2d');
      k0.font = this.font;
      const mt = k0.measureText(txt),
        pad = 3,
        w = Math.ceil(mt.width) + pad * 2,
        asc = Math.ceil(mt.actualBoundingBoxAscent || 12) + pad,
        h = asc + Math.ceil(mt.actualBoundingBoxDescent || 4) + pad;
      const cv = document.createElement('canvas');
      cv.width = w;
      cv.height = h;
      const k = cv.getContext('2d');
      k.font = this.font;
      k.fillStyle = this.fillStyle;
      k.textAlign = this.textAlign;
      k.textBaseline = this.textBaseline;
      const ox =
        this.textAlign === 'center' ? w / 2 : this.textAlign === 'right' || this.textAlign === 'end' ? w - pad : pad;
      k.fillText(txt, ox, asc);
      cv.naturalWidth = w;
      b = { c: cv, ox, oy: asc };
      bakeCache.set(key, b);
    }
    const s = sprite();
    s.tint = 0xffffff;
    s.alpha = this.globalAlpha;
    this.put(s, frameTex(b.c, 0, 0, b.c.width, b.c.height), x - b.ox, y - b.oy, b.c.width, b.c.height);
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
    if (sx < 0 || sy < 0 || sx + sw > img.width || sy + sh > img.height || sw <= 0 || sh <= 0) {
      this.bad = 'recorte fora da imagem';
      return;
    }
    const s = sprite();
    const tex = frameTex(img, sx, sy, sw, sh);
    refresh(img, tex);
    s.tint = 0xffffff;
    s.alpha = this.globalAlpha;
    this.put(s, tex, dx, dy, dw, dh);
  }
}

// Objeto "vazio" devolvido por chamadas não suportadas: aceita qualquer chamada em cadeia (ex.: gradiente.addColorStop) sem quebrar.
const VAZIO = new Proxy(function () {}, { get: () => VAZIO, apply: () => VAZIO });
const NAO_SUPORTADO = (t, k) => {
  if (k in t) return t[k];
  if (typeof k === 'symbol') return undefined;
  return () => {
    if (!t.bad)
      t.where = new Error().stack
        .split('\n')
        .slice(2, 6)
        .map((l) => l.trim().replace(/\(.*\/src\//, '('))
        .join(' < ');
    t.bad = 'método ' + k;
    return VAZIO;
  };
};
const pctx = new Proxy(new PixiCtx(), {
  get: NAO_SUPORTADO,
  set(t, k, v) {
    if (k === 'bad' && v && !t.bad)
      t.where = new Error().stack
        .split('\n')
        .slice(2, 6)
        .map((l) => l.trim().replace(/\(.*\/src\//, '('))
        .join(' < ');
    if (!(k in t) && k !== 'bad') t.bad = 'propriedade ' + k;
    if (k === 'globalCompositeOperation' && v !== 'source-over') t.bad = 'modo de mistura ' + v;
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
  gused = 0;
  mused = 0;
  seq = 0;
  pctx.reset();
  const m = mainCtx.getTransform();
  pctx.setTransform(m.a / RS, m.b / RS, m.c / RS, m.d / RS, m.e / RS, m.f / RS);
  frameId++;
  if (typeof mainCtx.fillStyle === 'string') pctx.fillStyle = mainCtx.fillStyle;
  pctx.globalAlpha = mainCtx.globalAlpha;
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
  if (bad) return bad + ' @ ' + (pctx.where || '');
  for (let i = used; i < pool.length && pool[i].visible; i++) pool[i].visible = false;
  for (let i = gused; i < gpool.length && gpool[i].visible; i++) gpool[i].visible = false;
  for (let i = mused; i < mpool.length && mpool[i].visible; i++) mpool[i].visible = false;
  app.render({ container: root });
  const g = mainCtx;
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(app.canvas, 0, 0, VW, VH);
  g.restore();
  // o código seguinte conta com o estado em que a camada deixou o contexto (câmera, cor, transparência)
  g.setTransform(...pctx.m);
  if (typeof pctx.fillStyle === 'string') g.fillStyle = pctx.fillStyle;
  g.globalAlpha = pctx.globalAlpha;
  stats.sprites += used;
  stats.layers++;
  return null;
}

export const pixiLayerStats = stats;
if (typeof window !== 'undefined') window.VDC_LAYER_STATS = stats;
