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

let cur = null, // sequência atual de partículas (mesma textura, mistura e máscara)
  runs = [],
  rused = 0,
  seq = 0,
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

function novaRun(tex, blend, mask) {
  let r;
  if (rused < runs.length) r = runs[rused++];
  else {
    const pc = new PIXI.ParticleContainer({
      dynamicProperties: { vertex: true, position: true, rotation: true, uvs: true, color: true },
    });
    r = { pc, parts: [], n: 0 };
    runs.push(r);
    root.addChild(pc);
    rused++;
  }
  r.n = 0;
  r.src = tex.source;
  r.blend = blend;
  r.mask = mask;
  r.pc.texture = tex;
  r.pc.zIndex = seq++;
  return r;
}

function sprite() {
  let s;
  if (used < pool.length) s = pool[used++];
  else {
    s = new PIXI.Sprite(branco());
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
  cur = null;
  g.clear();
  g.zIndex = seq++;
  g.mask = pctx.clipMask;
  g.blendMode = BLEND[pctx.globalCompositeOperation] || 'normal';
  g.visible = true;
  return g;
}

/** Máscara (para clip) com o caminho atual do contexto. Fica na cena (filha de `root`): o PixiJS não a desenha, só a usa para recortar. */
function maskPath(c) {
  let g;
  if (mused < mpool.length) g = mpool[mused++];
  else {
    g = new PIXI.Graphics();
    mpool.push(g);
    root.addChild(g);
    mused++;
  }
  g.clear();
  if (!c.buildPath(g)) c.bad = 'clip com forma não suportada';
  g.fill(0xffffff);
  tmpM ||= new PIXI.Matrix();
  const m = c.m;
  tmpM.set(m[0], m[1], m[2], m[3], m[4], m[5]);
  g.setFromMatrix(tmpM);
  return g;
}

/**
 * ATLAS: todas as imagens "prontas" (sprites, tiles, elipses, textos, gradientes guardados) são copiadas uma vez para páginas grandes de
 * textura (1024x1024); um retângulo branco fica na página 0 para os retângulos coloridos. Assim quase tudo que o jogo desenha vem da MESMA
 * textura e o PixiJS junta o quadro inteiro em poucos lotes (antes: um lote por troca de imagem, centenas por quadro).
 * Só entram imagens que nunca mudam (imagens e canvases marcados com `naturalWidth`, como os de `bakeImg`); canvases redesenhados
 * (luz, camadas) continuam com textura própria.
 */
const PAGINA = 1024;

/**
 * Cada canvas ganha um número de versão (`__v`) que sobe a cada escrita nele. Assim o atlas sabe se uma imagem copiada mudou depois
 * (e só então copia de novo), sem precisar adivinhar quais canvases são "prontos".
 */
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.__rastreado) {
  const proto = CanvasRenderingContext2D.prototype;
  proto.__rastreado = true;
  for (const nome of [
    'fillRect',
    'strokeRect',
    'clearRect',
    'fill',
    'stroke',
    'fillText',
    'strokeText',
    'drawImage',
    'putImageData',
  ]) {
    const orig = proto[nome];
    proto[nome] = function () {
      const c = this.canvas;
      c.__v = (c.__v | 0) + 1;
      return orig.apply(this, arguments);
    };
  }
}
const paginas = [];
const noAtlas = new WeakMap(); // fonte -> { pg, ox, oy } ou null (não cabe / não é imagem pronta)
let brancoTex = null;

function novaPagina() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = PAGINA;
  const k = cv.getContext('2d');
  k.imageSmoothingEnabled = false;
  const tex = PIXI.Texture.from(cv);
  tex.source.scaleMode = 'nearest';
  const pg = { cv, k, tex, x: 0, y: 0, linha: 0, suja: false };
  paginas.push(pg);
  return pg;
}

function elegivel(src) {
  if (src instanceof HTMLImageElement) return src.complete && src.naturalWidth > 0;
  // canvases pequenos que não são as camadas do tamanho da tela (luz, atmosfera), que são redesenhadas todo quadro;
  // `__dyn` marca os canvases auxiliares que mudam todo quadro (rendering/Occlusion.js): ter textura própria evita recopiar uma página do atlas inteira
  return (
    src instanceof HTMLCanvasElement &&
    src.width > 0 &&
    src.height > 0 &&
    !src.__dyn &&
    !(src.width === VW && src.height === VH)
  );
}

/** Reserva um retângulo w x h numa página do atlas (prateleiras). */
function reservar(w, h) {
  let pg = paginas[paginas.length - 1] || novaPagina();
  if (pg.x + w + 1 > PAGINA) {
    pg.x = 0;
    pg.y += pg.linha + 1;
    pg.linha = 0;
  }
  if (pg.y + h + 1 > PAGINA) pg = novaPagina();
  const r = { pg, ox: pg.x, oy: pg.y };
  pg.x += w + 1;
  pg.linha = Math.max(pg.linha, h);
  return r;
}

function colocar(src) {
  let r = noAtlas.get(src);
  if (r === null) return null;
  if (r) {
    // já está no atlas: se o canvas foi escrito depois da cópia, copia de novo (mesmo tamanho) ou refaz o lugar (tamanho novo)
    if (src.__v !== r.v) {
      if (src.width === r.w && src.height === r.h) {
        r.pg.k.clearRect(r.ox, r.oy, r.w, r.h);
        r.pg.k.drawImage(src, r.ox, r.oy);
        r.pg.suja = true;
        r.v = src.__v;
        stats.recopias = (stats.recopias || 0) + 1;
      } else {
        noAtlas.delete(src);
        texCache.delete(src);
        return colocar(src);
      }
    }
    return r;
  }
  const w = src.naturalWidth || src.width,
    h = src.naturalHeight || src.height;
  if (elegivel(src) && w <= 256 && h <= 256) {
    const c = reservar(w, h);
    c.pg.k.drawImage(src, c.ox, c.oy);
    c.pg.suja = true;
    r = { pg: c.pg, ox: c.ox, oy: c.oy, w, h, v: src.__v };
    noAtlas.set(src, r);
    return r;
  }
  noAtlas.set(src, null); // grande demais ou camada da tela: textura própria
  return null;
}

/** Sobe para a GPU as páginas que ganharam imagens novas neste quadro (no máximo 1 envio por página e quadro). */
function enviarPaginas() {
  for (const pg of paginas)
    if (pg.suja) {
      pg.suja = false;
      pg.tex.source.update();
    }
}

/** O pedacinho branco (2x2) que os retângulos coloridos usam: fica na página 0 do atlas. */
function branco() {
  if (brancoTex) return brancoTex;
  const pg = paginas[0] || novaPagina();
  if (pg.x === 0 && pg.y === 0 && pg.linha === 0) {
    pg.k.fillStyle = '#fff';
    pg.k.fillRect(0, 0, 4, 4);
    pg.x = 5;
    pg.linha = 4;
    pg.suja = true;
  }
  brancoTex = new PIXI.Texture({ source: pg.tex.source, frame: new PIXI.Rectangle(1, 1, 2, 2) });
  return brancoTex;
}

function frameTex(src, sx, sy, sw, sh) {
  let per = texCache.get(src);
  if (!per) {
    per = new Map();
    texCache.set(src, per);
  }
  const key = ((sx * 4096 + sy) * 4096 + sw) * 4096 + sh;
  const a = colocar(src);
  per = texCache.get(src) || (texCache.set(src, (per = new Map())), per);
  let t = per.get(key);
  if (!t) {
    if (a) t = new PIXI.Texture({ source: a.pg.tex.source, frame: new PIXI.Rectangle(a.ox + sx, a.oy + sy, sw, sh) });
    else if (pedacoElegivel(src, sw, sh)) {
      // imagem grande (folha de tiles, camada do chão): só o pedaço usado entra no atlas
      const c = reservar(sw, sh);
      c.pg.k.drawImage(src, sx, sy, sw, sh, c.ox, c.oy, sw, sh);
      c.pg.suja = true;
      t = new PIXI.Texture({ source: c.pg.tex.source, frame: new PIXI.Rectangle(c.ox, c.oy, sw, sh) });
      t._pedaco = { src, sx, sy, sw, sh, ox: c.ox, oy: c.oy, pg: c.pg, v: src.__v };
    } else {
      const dk =
        (src.constructor && src.constructor.name) +
        ' ' +
        src.width +
        'x' +
        src.height +
        (src.naturalWidth ? ' pronta' : ' dinamica');
      (stats.semAtlas ||= {})[dk] = (stats.semAtlas[dk] || 0) + 1;
      const base = PIXI.Texture.from(src);
      if (src.width === VW && src.height === VH && !src.naturalWidth) base.source.scaleMode = 'linear'; // camadas de luz sobem suavizadas
      t = new PIXI.Texture({ source: base.source, frame: new PIXI.Rectangle(sx, sy, sw, sh) });
    }
    per.set(key, t);
  }
  const pd = t._pedaco;
  if (pd && pd.v !== src.__v) {
    // o canvas grande foi escrito depois da cópia: refaz só este pedaço
    pd.pg.k.clearRect(pd.ox, pd.oy, pd.sw, pd.sh);
    pd.pg.k.drawImage(src, pd.sx, pd.sy, pd.sw, pd.sh, pd.ox, pd.oy, pd.sw, pd.sh);
    pd.pg.suja = true;
    pd.v = src.__v;
    stats.recopias = (stats.recopias || 0) + 1;
  }
  return t;
}

function pedacoElegivel(src, sw, sh) {
  return sw <= 256 && sh <= 256 && elegivel(src) && !(src.width === VW && src.height === VH);
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
/**
 * Imagem do gradiente no retângulo (rx, ry, w, h). Se todas as paradas têm a mesma cor, só o alpha muda: guarda 1 imagem BRANCA e devolve
 * o alpha máximo (`a`) e a cor (`rgb`), que quem desenha aplica como tinta. Assim uma cor que muda aos poucos (o reflexo do céu na água,
 * que muda a cada minuto do amanhecer) não cria uma imagem do tamanho da tela por cor, sem nunca liberar a memória da placa de vídeo.
 */
function gradImage(g, rx, ry, w, h) {
  const cores = g.stops.map(([o, c]) => [o, parseColor(c)]);
  const mesma = cores.every(([, c]) => c && c.rgb === cores[0][1].rgb);
  const amax = mesma ? Math.max(...cores.map(([, c]) => c.a), 1e-6) : 1;
  const rel = g.p.map((v, i) =>
    Math.round(
      (g.tipo === 'linear' ? v - (i % 2 ? ry : rx) : v - (i === 0 || i === 3 ? rx : i === 1 || i === 4 ? ry : 0)) * 2,
    ) / 2, // em passos de 0,5 px: raios que oscilam continuamente (tocha) não geram uma imagem nova a cada quadro
  );
  const key = [
    g.tipo,
    rel.join(','),
    w,
    h,
    mesma ? cores.map(([o, c]) => o + ':' + (c.a / amax).toFixed(2)).join(';') : JSON.stringify(g.stops),
  ].join('|');
  let c = gradCache.get(key);
  if (!c) {
    if (gradCache.size > 300) gradCache.clear(); // limite: o que ainda for usado é refeito
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
        mesma ? 'rgba(255,255,255,' + (cc.a / amax).toFixed(2) + ')' : col,
      );
    }
    k.fillStyle = gr;
    k.fillRect(0, 0, w, h);
    gradCache.set(key, c);
  }
  return { c, a: amax, rgb: mesma ? cores[0][1].rgb : 0xffffff };
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
  /** Um retângulo (cor ou textura) na ordem de desenho: vira uma partícula do PixiJS (objeto simples, em lote por textura). */
  quad(tex, dx, dy, dw, dh, rgb, alpha) {
    const [A, B, C, D, E, F] = this.m;
    const fw = tex.frame.width,
      fh = tex.frame.height;
    let rot = 0,
      sxs,
      sys;
    if (B === 0 && C === 0) {
      sxs = (A * dw) / fw;
      sys = (D * dh) / fh;
    } else {
      const l = Math.hypot(A, B);
      if (l && Math.abs(A * C + B * D) < 1e-6 * l * l) {
        rot = Math.atan2(B, A);
        sxs = (l * dw) / fw;
        sys = (((A * D - B * C) / l) * dh) / fh;
      } else {
        // inclinada (ex.: reflexo com skew): um sprite comum, mais caro, só nesse caso raro
        const sp = sprite();
        sp.tint = rgb;
        sp.alpha = alpha;
        this.put(sp, tex, dx, dy, dw, dh);
        cur = null;
        return;
      }
    }
    const blend = BLEND[this.globalCompositeOperation] || 'normal',
      mask = this.clipMask;
    if (!cur || cur.src !== tex.source || cur.blend !== blend || cur.mask !== mask) {
      const w = (stats.why ||= {});
      const k = !cur ? 'sem run' : cur.src !== tex.source ? 'fonte' : cur.blend !== blend ? 'mistura' : 'máscara';
      w[k] = (w[k] || 0) + 1;
      cur = novaRun(tex, blend, mask);
    }
    let p = cur.parts[cur.n];
    if (!p) p = cur.parts[cur.n] = new PIXI.Particle(tex);
    cur.n++;
    p.texture = tex;
    p.x = A * dx + C * dy + E;
    p.y = B * dx + D * dy + F;
    p.scaleX = sxs;
    p.scaleY = sys;
    p.rotation = rot;
    p.color = (((rgb & 255) << 16) | (rgb & 0xff00) | (rgb >> 16)) + ((alpha * 255) | 0) * 16777216;
  }
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
        const gi = gradImage(this.fillStyle, x, y, w, h);
        this.quad(dyn(gi.c, 0, 0, w, h), x, y, w, h, gi.rgb, this.globalAlpha * gi.a);
      }
      return;
    }
    const c = typeof this.fillStyle === 'string' ? parseColor(this.fillStyle) : null;
    if (!c) {
      this.bad = typeof this.fillStyle === 'string' ? 'cor ' + this.fillStyle : 'gradiente';
      return;
    }
    this.quad(branco(), x, y, w, h, c.rgb, c.a * this.globalAlpha);
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
      // Usa gradImage: quando todas as paradas têm a mesma cor só o alpha muda, então é UMA imagem por tamanho e o alpha vai no desenho.
      // (Antes a chave incluía o alpha de cada parada: vaga-lumes e tochas, que mudam de alpha a cada quadro, criavam uma imagem
      // nova por quadro, sem limite, e a memória da placa de vídeo enchia até o jogo travar.)
      const [, x, y, rx] = this.ops[0];
      const w = Math.ceil(rx * 2) + 2,
        gi = gradImage(gs, x - w / 2, y - w / 2, w, w);
      this.quad(frameTex(gi.c, 0, 0, w, w), x - w / 2, y - w / 2, w, w, gi.rgb, this.globalAlpha * gi.a);
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
    this.quad(
      frameTex(b.c, 0, 0, b.c.width, b.c.height),
      x - b.ox,
      y - b.oy,
      b.c.width,
      b.c.height,
      0xffffff,
      this.globalAlpha,
    );
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
    this.quad(
      frameTex(b.c, 0, 0, b.c.width, b.c.height),
      x - b.ox,
      y - b.oy,
      b.c.width,
      b.c.height,
      0xffffff,
      this.globalAlpha,
    );
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
    this.quad(dyn(img, sx, sy, sw, sh), dx, dy, dw, dh, 0xffffff, this.globalAlpha);
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
  rused = 0;
  cur = null;
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
  stats.t0 = performance.now();
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
  enviarPaginas();
  stats.runs = rused;
  for (let i = 0; i < rused; i++) {
    const r = runs[i],
      pc = r.pc,
      arr = pc.particleChildren;
    arr.length = r.n;
    for (let k = 0; k < r.n; k++) arr[k] = r.parts[k];
    pc.blendMode = r.blend;
    pc.mask = r.mask;
    pc.visible = true;
    pc.update();
  }
  for (let i = rused; i < runs.length && runs[i].pc.visible; i++) runs[i].pc.visible = false;
  // As máscaras de recorte são retângulos/formas BRANCAS que ficam na cena só para recortar. Quando o PixiJS tira uma máscara de um
  // objeto (o objeto do pool passa a ter outra máscara ou nenhuma), ele a marca como "parte do desenho" (includeInBuild = true) e,
  // se nenhum objeto a usa naquele quadro, ela aparecia como um retângulo branco na posição do quadro anterior: a mancha branca que
  // seguia o personagem (recorte do reflexo/água) e piscava na água. Aqui toda máscara volta a ficar fora do desenho antes de renderizar;
  // quando é usada, o próprio PixiJS a liga só durante o recorte.
  for (const mg of mpool) mg.includeInBuild = false;
  const tA = performance.now();
  app.render({ container: root });
  stats.msOps = (stats.msOps || 0) * 0.9 + (tA - stats.t0) * 0.1;
  stats.msRender = (stats.msRender || 0) * 0.9 + (performance.now() - tA) * 0.1;
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
  if (img.naturalWidth || !(img instanceof HTMLCanvasElement) || colocar(img) || pedacoElegivel(img, sw, sh))
    return frameTex(img, sx, sy, sw, sh); // no atlas: a versão é conferida lá
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
