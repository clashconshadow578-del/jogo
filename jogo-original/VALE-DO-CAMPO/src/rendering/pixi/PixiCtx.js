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
    app.canvas.id = 'pixiView';
    app.canvas.style.display = 'none'; // aparece no primeiro quadro desenhado por ele
    mainCtx.canvas.after(app.canvas); // mesma posição e tamanho do canvas do jogo (a regra `canvas` do main.css vale para os dois)
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
  s.blendMode = BLEND[pctx.globalCompositeOperation] || 'normal';
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
  g.blendMode = BLEND[pctx.globalCompositeOperation] || 'normal';
  g.visible = true;
  return g;
}

/** Máscara (para clip) com o caminho atual do contexto. Fora da cena: por isso a escala da tela (RS) entra na matriz dela. */
function maskPath(c) {
  let g;
  if (mused < mpool.length) g = mpool[mused++];
  else {
    g = new PIXI.Graphics();
    mpool.push(g);
    mused++;
  }
  g.clear();
  if (!c.buildPath(g)) c.bad = 'clip com forma não suportada';
  g.fill(0xffffff);
  tmpM ||= new PIXI.Matrix();
  const m = c.m;
  tmpM.set(m[0] * RS, m[1] * RS, m[2] * RS, m[3] * RS, m[4] * RS, m[5] * RS);
  g.setFromMatrix(tmpM);
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
    if (src.width === VW && src.height === VH && !src.naturalWidth) base.source.scaleMode = 'linear'; // camadas de luz sobem suavizadas
    t = new PIXI.Texture({ source: base.source, frame: new PIXI.Rectangle(sx, sy, sw, sh) });
    per.set(key, t);
  }
  return t;
}

/** Gradiente (linear ou radial) pedido ao contexto: na hora de pintar vira uma imagem pequena, guardada para os próximos quadros. */
class Grad {
  constructor(tipo, p) {
    this.tipo = tipo;
    this.p = p;
    this.stops = [];
  }
  addColorStop(o, c) {
    this.stops.push([o, c]);
  }
}
const gradCache = new Map();
/** Imagem do gradiente no retângulo (rx, ry, w, h). Se todas as paradas têm a mesma cor, só o alpha muda: guarda 1 imagem e devolve o alpha máximo. */
function gradImage(g, rx, ry, w, h) {
  const cores = g.stops.map(([o, c]) => [o, parseColor(c)]);
  const mesma = cores.every(([, c]) => c && c.rgb === cores[0][1].rgb);
  const amax = mesma ? Math.max(...cores.map(([, c]) => c.a), 1e-6) : 1;
  const rel = g.p.map((v, i) =>
    g.tipo === 'linear' ? v - (i % 2 ? ry : rx) : v - (i === 0 || i === 3 ? rx : i === 1 || i === 4 ? ry : 0),
  );
  const key = [
    g.tipo,
    rel.join(','),
    w,
    h,
    mesma ? cores.map(([o, c]) => o + ':' + c.rgb + ':' + (c.a / amax).toFixed(3)).join(';') : JSON.stringify(g.stops),
  ].join('|');
  let c = gradCache.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.naturalWidth = w; // imagem pronta
    const k = c.getContext('2d'),
      gr = g.tipo === 'linear' ? k.createLinearGradient(...rel) : k.createRadialGradient(...rel);
    for (let i = 0; i < g.stops.length; i++) {
      const [o, col] = g.stops[i];
      const cc = cores[i][1];
      gr.addColorStop(
        o,
        mesma ? 'rgba(' + [(cc.rgb >> 16) & 255, (cc.rgb >> 8) & 255, cc.rgb & 255, cc.a / amax].join(',') + ')' : col,
      );
    }
    k.fillStyle = gr;
    k.fillRect(0, 0, w, h);
    gradCache.set(key, c);
  }
  return { c, a: amax };
}

const BLEND = { 'source-over': 'normal', lighter: 'add', multiply: 'multiply', screen: 'screen' };
const bakeCache = new Map(); // elipses e textos já "fotografados" (chave -> { c: canvas, ox, oy })
let frameId = 0;
const lastUpdate = new WeakMap();
let tmpM = null,
  medidor = null; // só para medir a largura de textos (nada é desenhado nele)

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
      this.globalCompositeOperation,
      this.lineCap,
      this.lineJoin,
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
        this.globalCompositeOperation,
        this.lineCap,
        this.lineJoin,
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
    return new Grad('linear', [x0, y0, x1, y1]);
  }
  createRadialGradient(x0, y0, r0, x1, y1, r1) {
    return new Grad('radial', [x0, y0, r0, x1, y1, r1]);
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
      else {
        const gi = gradImage(this.fillStyle, x, y, w, h),
          antes = this.globalAlpha;
        this.globalAlpha = antes * gi.a;
        this.drawImage(gi.c, x, y);
        this.globalAlpha = antes;
      }
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
    const gs = this.fillStyle;
    if (gs instanceof Grad && gs.tipo === 'radial' && this.ops.length === 1 && this.ops[0][0] === 'A') {
      // brilho: círculo com gradiente radial que some na borda. Vira 1 imagem centrada (vale para qualquer posição).
      const [, x, y, rx] = this.ops[0],
        [gx0, gy0, gr0, gx1, gy1, gr1] = gs.p;
      const w = Math.ceil(rx * 2) + 2;
      const key =
        'g|' +
        w +
        '|' +
        gr0.toFixed(2) +
        '|' +
        gr1.toFixed(2) +
        '|' +
        (gx1 - gx0).toFixed(1) +
        ',' +
        (gy1 - gy0).toFixed(1) +
        '|' +
        JSON.stringify(gs.stops);
      let b = bakeCache.get(key);
      if (!b) {
        const cv = document.createElement('canvas');
        cv.width = cv.height = w;
        cv.naturalWidth = w;
        const k = cv.getContext('2d'),
          gr = k.createRadialGradient(
            w / 2 + (gx0 - x),
            w / 2 + (gy0 - y),
            gr0,
            w / 2 + (gx1 - x),
            w / 2 + (gy1 - y),
            gr1,
          );
        for (const [o, col] of gs.stops) gr.addColorStop(o, col);
        k.fillStyle = gr;
        k.fillRect(0, 0, w, w);
        b = { c: cv };
        bakeCache.set(key, b);
      }
      const sp = sprite();
      sp.tint = 0xffffff;
      sp.alpha = this.globalAlpha;
      this.put(sp, frameTex(b.c, 0, 0, w, w), x - w / 2, y - w / 2, w, w);
      return;
    }
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
  measureText(txt) {
    medidor ||= document.createElement('canvas').getContext('2d');
    medidor.font = this.font;
    return medidor.measureText(txt);
  }
  fillText(txt, x, y) {
    this.texto(txt, x, y, false);
  }
  strokeText(txt, x, y) {
    this.texto(txt, x, y, true);
  }
  texto(txt, x, y, contorno) {
    const cor = contorno ? this.strokeStyle : this.fillStyle;
    if (typeof cor !== 'string') {
      this.bad = 'texto com gradiente';
      return;
    }
    const lw = contorno ? this.lineWidth : 0;
    const key =
      (contorno ? 'ts|' + lw : 't') +
      '|' +
      this.font +
      '|' +
      cor +
      '|' +
      this.textAlign +
      '|' +
      this.textBaseline +
      '|' +
      txt;
    let b = bakeCache.get(key);
    if (!b) {
      const k0 = document.createElement('canvas').getContext('2d');
      k0.font = this.font;
      const mt = k0.measureText(txt),
        pad = 3 + Math.ceil(lw),
        w = Math.ceil(mt.width) + pad * 2,
        asc = Math.ceil(mt.actualBoundingBoxAscent || 12) + pad,
        h = asc + Math.ceil(mt.actualBoundingBoxDescent || 4) + pad;
      const cv = document.createElement('canvas');
      cv.width = w;
      cv.height = h;
      const k = cv.getContext('2d');
      k.font = this.font;
      k.textAlign = this.textAlign;
      k.textBaseline = this.textBaseline;
      const ox =
        this.textAlign === 'center' ? w / 2 : this.textAlign === 'right' || this.textAlign === 'end' ? w - pad : pad;
      if (contorno) {
        k.strokeStyle = cor;
        k.lineWidth = lw;
        k.lineJoin = 'round';
        k.strokeText(txt, ox, asc);
      } else {
        k.fillStyle = cor;
        k.fillText(txt, ox, asc);
      }
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
    const tex = dyn(img, sx, sy, sw, sh);
    s.tint = 0xffffff;
    s.alpha = this.globalAlpha;
    this.put(s, tex, dx, dy, dw, dh);
  }
}

// Objeto "vazio" devolvido por chamadas não suportadas: aceita qualquer chamada em cadeia (ex.: gradiente.addColorStop) sem quebrar.
const VAZIO = new Proxy(function () {}, { get: () => VAZIO, apply: () => VAZIO });
/** Registra (para o teste e o ?fps) uma chamada que o contexto PixiJS ainda não sabe desenhar. O quadro segue sem ela. */
function falha(motivo) {
  const onde = new Error().stack
    .split('\n')
    .slice(3, 6)
    .map((l) => l.trim().replace(/\(.*\/src\//, '('))
    .join(' < ');
  const m = (stats.motivos ||= {});
  const k = motivo + ' @ ' + onde;
  m[k] = (m[k] || 0) + 1;
}
const NAO_SUPORTADO = (t, k) => {
  if (k in t) return t[k];
  if (typeof k === 'symbol') return undefined;
  return () => {
    falha('método ' + String(k));
    return VAZIO;
  };
};
const pctx = new Proxy(new PixiCtx(), {
  get: NAO_SUPORTADO,
  set(t, k, v) {
    if (k === 'bad') {
      if (v) falha(String(v));
      return true;
    }
    if (!(k in t)) falha('propriedade ' + String(k));
    t[k] = v;
    return true;
  },
});

/**
 * Começa o quadro no PixiJS: daqui até `pixiLayerEnd()` o jogo desenha no contexto PixiJS, que registra tudo na ordem. Devolve false
 * se o PixiJS ainda não está pronto (então o quadro é desenhado em Canvas como sempre).
 */
export function pixiLayerBegin() {
  if (!app || !getPixi()) {
    mostrar(false); // sem PixiJS (ou desligado): volta a aparecer o canvas do jogo
    return false;
  }
  if (W !== VW * RS || H !== VH * RS) {
    W = VW * RS;
    H = VH * RS;
    app.resize(W, H);
    root.scale.set(RS);
  }
  used = 0;
  fotosUsadas = 0;
  gused = 0;
  mused = 0;
  seq = 0;
  pctx.reset();
  const m = mainCtx.getTransform();
  pctx.setTransform(m.a / RS, m.b / RS, m.c / RS, m.d / RS, m.e / RS, m.f / RS);
  frameId++;
  if (typeof mainCtx.fillStyle === 'string') pctx.fillStyle = mainCtx.fillStyle;
  pctx.globalAlpha = mainCtx.globalAlpha;
  active = true;
  mostrar(!copiar());
  if (app.canvas.style.imageRendering !== mainCtx.canvas.style.imageRendering)
    app.canvas.style.imageRendering = mainCtx.canvas.style.imageRendering;
  setDrawCtx(pctx);
  return true;
}

/** Termina o quadro: a GPU desenha tudo de uma vez e o resultado vai para a tela. */
export function pixiLayerEnd() {
  setDrawCtx(mainCtx);
  active = false;
  for (let i = used; i < pool.length && pool[i].visible; i++) pool[i].visible = false;
  for (let i = gused; i < gpool.length && gpool[i].visible; i++) gpool[i].visible = false;
  app.render({ container: root });
  const g = mainCtx;
  if (copiar()) {
    // só nos testes automáticos (precisam ler os pixels do canvas do jogo): copia o quadro do PixiJS para ele
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(app.canvas, 0, 0, VW, VH);
    g.restore();
  }
  // o código seguinte conta com o estado em que a camada deixou o contexto (câmera, cor, transparência)
  g.setTransform(...pctx.m);
  if (typeof pctx.fillStyle === 'string') g.fillStyle = pctx.fillStyle;
  g.globalAlpha = pctx.globalAlpha;
  stats.sprites += used;
  stats.layers++;
}

export const pixiLayerStats = stats;
if (typeof window !== 'undefined') window.VDC_LAYER_STATS = stats;

const usos = new WeakMap(); // canvas -> { f: quadro, n: usos neste quadro, pn: usos no quadro anterior }
const fotos = [];
let fotosUsadas = 0;
/**
 * Textura de um pedaço de `img`. Se `img` é um canvas que o jogo REDESENHA (luz, camadas), a GPU só desenha no fim do quadro e veria o
 * conteúdo final em todos os usos; por isso, quando o canvas é usado 2+ vezes por quadro, cada uso recebe uma "foto" do conteúdo daquele momento.
 */
function dyn(img, sx, sy, sw, sh) {
  if (img.naturalWidth || !(img instanceof HTMLCanvasElement)) return frameTex(img, sx, sy, sw, sh);
  let r = usos.get(img);
  if (!r) usos.set(img, (r = { f: -1, n: 0, pn: 0 }));
  if (r.f !== frameId) {
    r.pn = r.f === frameId - 1 ? r.n : 0;
    r.n = 0;
    r.f = frameId;
  }
  r.n++;
  if (r.pn < 2) {
    const tex = frameTex(img, sx, sy, sw, sh);
    refresh(img, tex);
    return tex;
  }
  const snap = fotos[fotosUsadas] || (fotos[fotosUsadas] = document.createElement('canvas'));
  fotosUsadas++;
  if (snap.width !== img.width || snap.height !== img.height) {
    snap.width = img.width;
    snap.height = img.height;
  }
  const k = snap.getContext('2d');
  k.clearRect(0, 0, snap.width, snap.height);
  k.drawImage(img, 0, 0);
  const tex = frameTex(snap, sx, sy, sw, sh);
  if (tex.source.update) tex.source.update();
  return tex;
}

/** Nos testes automáticos (`window.__step`) ou com `?copia`, o quadro do PixiJS é copiado para o canvas do jogo para poder ser lido. */
function copiar() {
  return typeof window.__step === 'function' || /[?&]copia\b/.test(location.search);
}

let mostrandoPixi = false;
/** Mostra na tela o canvas do PixiJS (true) ou o canvas 2D do jogo (false), sem mexer no tamanho nem na posição. */
export function mostrar(pixi) {
  if (!app || pixi === mostrandoPixi) return;
  mostrandoPixi = pixi;
  app.canvas.style.display = pixi ? '' : 'none';
  mainCtx.canvas.style.visibility = pixi ? 'hidden' : '';
}
export { mostrar as pixiMostrar };
