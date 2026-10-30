/**
 * Teste de desempenho automático, só com `?bench` na URL (feito para o celular, onde não há console).
 *
 * Roda sozinho dentro do próprio jogo, no próprio aparelho: leva o jogador a 3 lugares do mapa (onde ele está, em volta da
 * casa e o rio) e mede quadros por segundo e para onde vai o tempo de cada quadro (lógica do jogo, desenho, interface e
 * espera pela placa de vídeo). Em volta da casa liga e desliga recursos (grama na GPU, cache do chão) e desliga UMA etapa do
 * desenho por vez (sombras, mato, relevo, água, luz...), para mostrar no fim quanto cada uma custa neste aparelho.
 * Nada é salvo: as opções gráficas e a posição voltam ao que eram.
 *
 * A resolução fica FIXA durante o teste (o jogo normalmente a reduz sozinho quando o aparelho não acompanha, o que
 * atrapalharia a comparação).
 *
 * Segurança do seu jogo: durante o teste o jogador é levado a outros lugares e o tempo do jogo anda, então NADA é gravado
 * (o jogo salva sozinho a cada minuto e ao sair da aba: essas gravações são bloqueadas) e os toques na tela são ignorados.
 * No fim aparece o botão "Recarregar o jogo", que volta ao último save, exatamente como estava antes do teste.
 */
import { gfx, qDrop, setQDrop } from '../config/settings.js';
import { applyRes } from '../rendering/Canvas.js';
import { setAblate } from '../rendering/Renderer.js';
import { SPR } from '../rendering/Sprites.js';
import { initPixi, setPixiEnabled } from '../rendering/pixi/PixiBridge.js';
import { setMatoLive } from '../world/Vegetation.js';
import { setFpsTap } from './FpsMeter.js';
import { setLoopPaused } from './GameLoop.js';
import { S } from './GameState.js';

export const benchRequested = (search) => /[?&]bench\b/.test(search || '');

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

const CASA = 'EM VOLTA DA CASA';
const CENAS = [
  { nome: 'ONDE VOCÊ ESTÁ', pos: null, modos: ['base'] },
  { nome: CASA, pos: [280, 504], modos: ['base', 'gpu', 'cache', 'etapas'] }, // onde o jogo novo começa: bem embaixo da casa
  { nome: 'RIO', pos: [300, 1000], modos: ['base'] },
];
// cada modo liga só o que diz; o resto fica no padrão do jogo (o mato em imagens da fase 3 já foi medido: ficou de fora)
const BASE = { nome: 'jogo padrão', pixi: false, chunks: false };
const RECURSOS = [
  { nome: 'grama na GPU (fase 2)', pixi: true, chunks: false },
  { nome: 'cache do chão', pixi: false, chunks: true },
];
// só em volta da casa: quanto custa cada etapa do desenho NESTE aparelho? (cada linha desliga UMA etapa e mede de novo)
const ETAPAS = [
  { nome: 'sem sombras de contato', abl: { sombras: true } },
  { nome: 'sem mato', abl: { mato: true } },
  { nome: 'sem relevo', abl: { relevo: true } },
  { nome: 'sem umidade do chão', abl: { hidro: true } },
  { nome: 'sem água (rio, reflexos)', abl: { agua: true } },
  { nome: 'sem luz e sombras do sol', abl: { luz: true } },
  { nome: 'sem clima e atmosfera', abl: { clima: true } },
  { nome: 'sem desenhar as entidades', abl: { entidades: true } },
  { nome: 'qualidade mínima', quality: 'low' },
  { nome: 'sem raios e partículas', rays: false, particles: false },
  { nome: 'resolução x1 (4x menos pixels)', res: '1' },
];

const ASSENTA_MS = 2500; // tempo para o jogo se ajustar depois de mudar de modo (caches, texturas)
const MEDE_MS = 5000;

// Mede quadros por segundo (rAF) em fatias de 1 s e devolve a MEDIANA delas (um congelamento isolado não estraga o número),
// o pior intervalo entre quadros e os tempos médios de lógica, desenho e interface (GameLoop -> fpsSample).
function medir(ms) {
  return new Promise((resolve) => {
    let n = 0,
      worst = 0,
      last = 0,
      t0 = 0,
      b0 = 0,
      bn = 0,
      nj = 0,
      sr = 0,
      su = 0,
      si = 0;
    const fatias = [];
    setFpsTap((r, u, i) => {
      sr += r;
      su += u;
      si += i;
      nj++;
    });
    const loop = (now) => {
      if (!t0) {
        t0 = last = b0 = now;
      } else {
        n++;
        bn++;
        if (now - last > worst) worst = now - last;
        last = now;
        if (now - b0 >= 1000) {
          fatias.push((bn * 1000) / (now - b0));
          b0 = now;
          bn = 0;
        }
      }
      if (now - t0 >= ms) {
        setFpsTap(null);
        const ord = fatias.slice().sort((a, b) => a - b);
        const fps = ord.length >= 3 ? ord[(ord.length - 1) >> 1] : (n * 1000) / (now - t0);
        const d = nj || 1;
        resolve({ fps, js: sr / d, upd: su / d, ui: si / d, worst });
      } else requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
}

function gpuInfo() {
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    if (!gl) return 'sem WebGL';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'WebGL (nome oculto)';
  } catch (e) {
    return 'n/d';
  }
}


// ---------------------------------------------------------------------------------------------------------------------
// Micro-teste: o MESMO trabalho (2.200 operações por quadro: retângulos, retângulos translúcidos, imagens de um atlas e elipses)
// em Canvas 2D e em WebGL (PixiJS), com o jogo pausado. Mostra o quanto o Canvas 2D é lento NESTE aparelho para trabalho que o
// WebGL faz em lote, que é o que decide se vale a pena levar o desenho do jogo para o PixiJS.
const PAL = ['#2f7a34', '#3f9a42', '#58b04c', '#8fd36a', '#5a3d24', '#a2ae88', '#2f75b4', '#d9b77e', '#9a6b43', '#e8d9a2', '#8d9296', '#c4c9a6'];
const PAL_HEX = PAL.map((c) => parseInt(c.slice(1), 16));

function prng(seed) {
  let q = seed;
  return () => (q = (q * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
}

function microOps() {
  const r = prng(99),
    ops = [];
  for (let i = 0; i < 1500; i++) ops.push({ t: 'r', x: (r() * 940) | 0, y: (r() * 520) | 0, w: 1 + ((r() * 6) | 0), h: 1 + ((r() * 10) | 0), c: (r() * PAL.length) | 0, k: r() });
  for (let i = 0; i < 300; i++) ops.push({ t: 'a', x: (r() * 940) | 0, y: (r() * 520) | 0, w: 16, h: 16, c: (r() * PAL.length) | 0, k: r() });
  for (let i = 0; i < 300; i++) ops.push({ t: 'i', x: (r() * 920) | 0, y: (r() * 500) | 0, w: 32, h: 32, sx: ((r() * 14) | 0) * 32, sy: ((r() * 14) | 0) * 32, k: r() });
  for (let i = 0; i < 100; i++) ops.push({ t: 'e', x: 20 + ((r() * 900) | 0), y: 20 + ((r() * 500) | 0), rx: 6 + ((r() * 10) | 0), ry: 3 + ((r() * 5) | 0), k: r() });
  ops.sort((a, b) => a.k - b.k); // ordem misturada, como num quadro de verdade
  return ops;
}

function microAtlas() {
  const c = document.createElement('canvas');
  c.width = c.height = 448;
  const g = c.getContext('2d'),
    r = prng(7);
  for (let y = 0; y < 14; y++)
    for (let x = 0; x < 14; x++) {
      g.fillStyle = PAL[(r() * PAL.length) | 0];
      g.fillRect(x * 32, y * 32, 32, 32);
      g.fillStyle = PAL[(r() * PAL.length) | 0];
      g.fillRect(x * 32 + 4, y * 32 + 4, 24, 24);
    }
  return c;
}

// como medir(), mas desenha algo a cada quadro; devolve a mediana de quadros por segundo (fatias de 1 s)
function medirTrabalho(ms, trabalho) {
  return new Promise((resolve) => {
    let n = 0,
      t0 = 0,
      b0 = 0,
      bn = 0,
      f = 0;
    const fatias = [];
    const loop = (now) => {
      trabalho(f++);
      if (!t0) t0 = b0 = now;
      else {
        n++;
        bn++;
        if (now - b0 >= 1000) {
          fatias.push((bn * 1000) / (now - b0));
          b0 = now;
          bn = 0;
        }
      }
      if (now - t0 >= ms) {
        const ord = fatias.slice().sort((a, b) => a - b);
        resolve(ord.length >= 2 ? ord[(ord.length - 1) >> 1] : (n * 1000) / (now - t0));
      } else requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
}

const CANTO = 'position:fixed;right:6px;bottom:6px;width:480px;height:270px;z-index:9998;image-rendering:pixelated';

async function microCanvas(ops, atlas) {
  const cv = document.createElement('canvas');
  cv.width = 960;
  cv.height = 540;
  cv.style.cssText = CANTO;
  document.body.appendChild(cv);
  const g = cv.getContext('2d', { alpha: false });
  g.imageSmoothingEnabled = false;
  const fps = await medirTrabalho(6000, (f) => {
    const dx = (f % 60) - 30; // o conteúdo anda um pouco a cada quadro, como a câmera do jogo
    g.fillStyle = '#5aa846';
    g.fillRect(0, 0, 960, 540);
    for (const o of ops) {
      if (o.t === 'r') {
        g.fillStyle = PAL[o.c];
        g.fillRect(o.x + dx, o.y, o.w, o.h);
      } else if (o.t === 'a') {
        g.globalAlpha = 0.2;
        g.fillStyle = PAL[o.c];
        g.fillRect(o.x + dx, o.y, o.w, o.h);
        g.globalAlpha = 1;
      } else if (o.t === 'i') {
        g.drawImage(atlas, o.sx, o.sy, 32, 32, o.x + dx, o.y, 32, 32);
      } else {
        g.fillStyle = 'rgba(22,28,28,.1)';
        g.beginPath();
        g.ellipse(o.x + dx, o.y, o.rx, o.ry, 0, 0, 6.283);
        g.fill();
      }
    }
  });
  cv.remove();
  return fps;
}


// Custo de cada TIPO de operação do Canvas 2D neste aparelho, no volume que o jogo usa por quadro (mede a taxa de quadros de
// uma tela que só faz aquilo; 60 fps = não pesa). Mostra qual tipo é o lento em vez de adivinhar.
async function perfilOperacoes(atlas) {
  const cv = document.createElement('canvas');
  cv.width = 960;
  cv.height = 540;
  cv.style.cssText = CANTO;
  document.body.appendChild(cv);
  const g = cv.getContext('2d', { alpha: false });
  g.imageSmoothingEnabled = false;
  const r = prng(5),
    pos = Array.from({ length: 2000 }, () => ({ x: (r() * 920) | 0, y: (r() * 500) | 0, c: (r() * PAL.length) | 0, s: ((r() * 14) | 0) * 32, t: ((r() * 14) | 0) * 32 }));
  const camada = document.createElement('canvas');
  camada.width = 480;
  camada.height = 270;
  const cg = camada.getContext('2d');
  cg.fillStyle = 'rgba(120,100,160,.5)';
  cg.fillRect(0, 0, 480, 270);
  const aux = [];
  for (let i = 0; i < 10; i++) {
    const c = document.createElement('canvas');
    c.width = 480;
    c.height = 270;
    aux.push([c, c.getContext('2d')]);
  }
  const tipos = [
    ['vazio (só limpar a tela)', 0, () => {}],
    ['retângulos opacos', 2000, (f, dx) => { for (let i = 0; i < 2000; i++) { const p = pos[i]; g.fillStyle = PAL[p.c]; g.fillRect(p.x + dx, p.y, 3, 5); } }],
    ['retângulos translúcidos', 500, (f, dx) => { g.globalAlpha = 0.2; for (let i = 0; i < 500; i++) { const p = pos[i]; g.fillStyle = PAL[p.c]; g.fillRect(p.x + dx, p.y, 16, 16); } g.globalAlpha = 1; }],
    ['imagens de um atlas', 500, (f, dx) => { for (let i = 0; i < 500; i++) { const p = pos[i]; g.drawImage(atlas, p.s, p.t, 32, 32, p.x + dx, p.y, 32, 32); } }],
    ['imagens espelhadas (save/scale)', 300, (f, dx) => { for (let i = 0; i < 300; i++) { const p = pos[i]; g.save(); g.translate(p.x + dx + 32, p.y); g.scale(-1, 1); g.drawImage(atlas, p.s, p.t, 32, 32, 0, 0, 32, 32); g.restore(); } }],
    ['elipses translúcidas', 300, (f, dx) => { g.fillStyle = 'rgba(22,28,28,.1)'; for (let i = 0; i < 300; i++) { const p = pos[i]; g.beginPath(); g.ellipse(p.x + dx + 20, p.y + 20, 12, 5, 0, 0, 6.283); g.fill(); } }],
    ['gradientes radiais', 30, (f, dx) => { for (let i = 0; i < 30; i++) { const p = pos[i], gr = g.createRadialGradient(p.x + dx, p.y, 2, p.x + dx, p.y, 32); gr.addColorStop(0, 'rgba(255,200,120,.5)'); gr.addColorStop(1, 'rgba(255,200,120,0)'); g.fillStyle = gr; g.fillRect(p.x + dx - 32, p.y - 32, 64, 64); } }],
    ['camada cheia "lighter" (x10)', 10, () => { g.globalCompositeOperation = 'lighter'; for (let i = 0; i < 10; i++) g.drawImage(camada, 0, 0, 960, 540); g.globalCompositeOperation = 'source-over'; }],
    ['camada cheia "multiply" (x10)', 10, () => { g.globalCompositeOperation = 'multiply'; for (let i = 0; i < 10; i++) g.drawImage(camada, 0, 0, 960, 540); g.globalCompositeOperation = 'source-over'; }],
    ['10 canvases auxiliares', 10, (f) => { for (let i = 0; i < 10; i++) { const a = aux[i][1]; a.fillStyle = PAL[(f + i) % PAL.length]; a.fillRect(0, 0, 480, 270); g.drawImage(aux[i][0], 0, 0, 960, 540); } }],
  ];
  const res = [];
  for (const [nome, n, fn] of tipos) {
    const fps = await medirTrabalho(3500, (f) => {
      g.fillStyle = '#5aa846';
      g.fillRect(0, 0, 960, 540);
      fn(f, (f % 60) - 30);
    });
    res.push({ nome, n, fps });
  }
  cv.remove();
  return res;
}

async function microPixi(ops, atlas) {
  const { PIXI } = window.VDC_PIXI;
  const app = new PIXI.Application();
  await app.init({ width: 960, height: 540, preference: 'webgl', backgroundColor: 0x5aa846, backgroundAlpha: 1, antialias: false, autoStart: false, sharedTicker: false });
  app.canvas.style.cssText = CANTO;
  document.body.appendChild(app.canvas);
  const atlasTex = PIXI.Texture.from(atlas),
    quadros = new Map(),
    elip = document.createElement('canvas');
  elip.width = 64;
  elip.height = 32;
  const eg = elip.getContext('2d');
  eg.fillStyle = '#fff';
  eg.beginPath();
  eg.ellipse(32, 16, 32, 16, 0, 0, 6.283);
  eg.fill();
  const elipTex = PIXI.Texture.from(elip),
    stage = new PIXI.Container(),
    sprites = [];
  for (const o of ops) {
    let sp;
    if (o.t === 'r' || o.t === 'a') {
      sp = new PIXI.Sprite(PIXI.Texture.WHITE);
      sp.tint = PAL_HEX[o.c];
      sp.width = o.w;
      sp.height = o.h;
      sp.alpha = o.t === 'a' ? 0.2 : 1;
    } else if (o.t === 'i') {
      const key = o.sx + ',' + o.sy;
      let tx = quadros.get(key);
      if (!tx) quadros.set(key, (tx = new PIXI.Texture({ source: atlasTex.source, frame: new PIXI.Rectangle(o.sx, o.sy, 32, 32) })));
      sp = new PIXI.Sprite(tx);
    } else {
      sp = new PIXI.Sprite(elipTex);
      sp.anchor.set(0.5);
      sp.tint = 0x161c1c;
      sp.alpha = 0.1;
      sp.width = o.rx * 2;
      sp.height = o.ry * 2;
    }
    sp.x = o.x;
    sp.y = o.y;
    stage.addChild(sp);
    sprites.push(sp);
  }
  const fps = await medirTrabalho(6000, (f) => {
    const dx = (f % 60) - 30;
    for (let i = 0; i < sprites.length; i++) sprites[i].x = ops[i].x + dx;
    app.renderer.render({ container: stage });
  });
  app.canvas.remove();
  app.destroy({ removeView: true }, { children: true });
  return fps;
}

const n1 = (v, w) => v.toFixed(1).padStart(w);
const fmt = (r) =>
  r
    ? String(Math.round(r.fps)).padStart(3) + '  ' + n1(r.upd, 5) + n1(r.js, 6) + n1(r.ui, 5) + String(Math.round(r.worst)).padStart(6)
    : '  -- indisponível';

async function iniciarBench() {
  // 1) nada é gravado durante o teste (o jogo salva a cada 60 s e ao esconder a aba)
  const setItem0 = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    if (String(k).indexOf('valeDoCampo') === 0) return undefined;
    return setItem0.call(this, k, v);
  };
  // 2) camada transparente que engole os toques (o jogador não pode andar nem usar nada durante o teste)
  const bloqueio = document.createElement('div');
  bloqueio.style.cssText = 'position:fixed;left:0;top:0;right:0;bottom:0;z-index:9999;background:transparent;touch-action:none';
  for (const ev of ['touchstart', 'touchmove', 'touchend', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'click'])
    bloqueio.addEventListener(ev, (e) => { e.stopPropagation(); e.preventDefault(); }, { passive: false });
  document.body.appendChild(bloqueio);

  // painel: cabeçalho em cima e duas colunas (resumo à esquerda, tabela à direita) para caber em telas baixas
  const painel = document.createElement('div');
  painel.id = 'bench';
  painel.style.cssText =
    'position:fixed;left:6px;top:6px;z-index:10000;padding:6px 9px;font-family:monospace;color:#fff;background:rgba(0,0,0,.88);' +
    'border-radius:6px;pointer-events:none;max-width:98vw;max-height:calc(100vh - 66px);overflow:hidden';
  const cab = document.createElement('div'),
    cols = document.createElement('div'),
    esq = document.createElement('div'),
    meio = document.createElement('div'),
    dir = document.createElement('div');
  for (const e of [cab, esq, meio, dir]) e.style.whiteSpace = 'pre';
  cols.style.cssText = 'display:grid;grid-template-columns:auto auto auto;column-gap:14px;margin-top:4px';
  cols.append(esq, meio, dir);
  painel.append(cab, cols);
  document.body.appendChild(painel);
  const mostra = (c, a, b, d) => {
    cab.textContent = c;
    esq.textContent = a || '';
    meio.textContent = b || '';
    dir.textContent = d || '';
    // reduz a letra para tudo caber na altura da tela (deixa espaço para o botão no fim)
    const nl = (t) => (t || '').split('\n').length;
    const linhas = nl(c) + Math.max(nl(a), nl(b), nl(d));
    painel.style.fontSize = Math.max(7, Math.min(12, Math.floor((innerHeight - 90) / (linhas * 1.35)))) + 'px';
    painel.style.lineHeight = '1.35';
  };

  // espera o jogo carregar a textura do chão e se acalmar (no máximo ~90 s)
  let falta = 8;
  for (let k = 0; k < 90 && falta > 0; k++) {
    mostra('TESTE DE DESEMPENHO\nNão toque na tela e não troque de aba.\nNada será salvo. Começa em ' + falta + ' s…');
    await espera(1000);
    if (falta > 3 || (SPR.grass && SPR.grass.ready)) falta--; // textura ainda carregando: espera mais
  }
  while (document.hidden) await espera(500);

  const orig = { res: gfx.res, quality: gfx.quality, rays: gfx.rays, particles: gfx.particles, chunks: gfx.chunks };
  const qd0 = qDrop,
    pos0 = [S.px, S.py],
    matoPadrao = !/[?&]matocache\b/.test(location.search);
  setPixiEnabled(false);
  await initPixi('?pixi'); // liga o PixiJS (se houver WebGL) para poder comparar; fica desligado até o modo que o usa
  const pixiOk = !!(window.VDC_PIXI && window.VDC_PIXI.ok);
  const aparelho =
    'Tela ' + innerWidth + 'x' + innerHeight + ' · DPR ' + (window.devicePixelRatio || 1).toFixed(2) + ' · ' + (navigator.hardwareConcurrency || '?') + ' núcleos' +
    ' · WebGL: ' + (pixiOk ? 'sim' : 'não') + ' · modo celular: ' + (matchMedia('(pointer:coarse)').matches ? 'sim' : 'não') +
    '\nGPU: ' + gpuInfo();

  const aplica = (m) => {
    setMatoLive(true); // o mato em imagens fica fora do teste (desenho original)
    setAblate(m.abl || null);
    setPixiEnabled(!!m.pixi && pixiOk);
    gfx.chunks = !!m.chunks;
    gfx.quality = m.quality || orig.quality;
    gfx.rays = m.rays !== undefined ? m.rays : orig.rays;
    gfx.particles = m.particles !== undefined ? m.particles : orig.particles;
    gfx.res = m.res || '2'; // fixa a resolução: o governador do jogo não mexe
    setQDrop(0);
    applyRes();
  };

  // aquecimento: deixa o motor de JavaScript e o PixiJS se acalmarem antes da primeira medição
  aplica(BASE);
  for (let w = 6; w > 0; w--) {
    mostra('TESTE DE DESEMPENHO\nAquecendo o jogo… ' + w + ' s\n' + aparelho);
    await espera(1000);
  }

  const lista = (cena) => {
    const l = [];
    for (const m of cena.modos) {
      if (m === 'base') l.push(BASE);
      else if (m === 'gpu') l.push(RECURSOS[0]);
      else if (m === 'cache') l.push(RECURSOS[1]);
      else if (m === 'etapas') l.push(...ETAPAS);
    }
    return l;
  };
  const saida = []; // { cena, modo, r }
  const total = CENAS.reduce((a, c) => a + lista(c).length, 0);
  let feito = 0;
  const tabela = () => {
    let t = ' '.repeat(33) + 'fps  lóg.  des. int. pior (ms)';
    let cena = '';
    for (const l of saida) {
      if (l.cena !== cena) {
        cena = l.cena;
        t += '\n' + cena;
      }
      t += '\n ' + l.modo.padEnd(31) + fmt(l.r);
    }
    return t;
  };

  try {
    if (S.inside) {
      mostra('Saia da casa e abra de novo com ?bench.');
      return;
    }
    for (const cena of CENAS) {
      if (cena.pos) {
        S.px = cena.pos[0];
        S.py = cena.pos[1];
        S.vx = 0;
        S.vy = 0;
      }
      for (const m of lista(cena)) {
        aplica(m);
        mostra('TESTE DE DESEMPENHO — não toque na tela (' + feito + '/' + total + ')\n' + aparelho, tabela(), '> medindo: ' + cena.nome + ' / ' + m.nome + '…');
        await espera(ASSENTA_MS);
        const semPixi = m.pixi && !pixiOk;
        const r = semPixi ? null : await medir(MEDE_MS);
        saida.push({ cena: cena.nome, modo: m.nome, r });
        feito++;
      }
    }
  } finally {
    // volta as opções gráficas e a posição (o save NÃO é tocado: as gravações seguem bloqueadas até recarregar)
    gfx.res = orig.res;
    gfx.quality = orig.quality;
    gfx.rays = orig.rays;
    gfx.particles = orig.particles;
    gfx.chunks = orig.chunks;
    setQDrop(qd0);
    setAblate(null);
    setMatoLive(matoPadrao);
    setPixiEnabled(true);
    applyRes();
    S.px = pos0[0];
    S.py = pos0[1];
    S.vx = 0;
    S.vy = 0;
  }

  // ---- micro-teste: o mesmo trabalho em Canvas 2D e em WebGL, com o jogo pausado ----
  let micro = null;
  try {
    mostra('TESTE DE DESEMPENHO — micro-teste (jogo pausado, não toque na tela)\n' + aparelho, tabela(), '> medindo o Canvas 2D e o WebGL…');
    setLoopPaused(true);
    const ops = microOps(),
      atlas = microAtlas();
    micro = { canvas: await microCanvas(ops, atlas), webgl: pixiOk ? await microPixi(ops, atlas) : null, ops: await perfilOperacoes(atlas) };
  } catch (e) {
    console.error('[Vale do Campo] micro-teste falhou:', e);
  } finally {
    setLoopPaused(false);
  }

  // ---- resumo (coluna da esquerda) ----
  let resumo = '';
  const base = saida.find((l) => l.cena === CASA && l.modo === BASE.nome);
  if (base && base.r) {
    const iv = 1000 / base.r.fps,
      ocupado = base.r.upd + base.r.js + base.r.ui,
      parado = Math.max(0, iv - ocupado);
    resumo += 'ONDE VAI O TEMPO (em volta da casa)\n';
    resumo += '  quadro inteiro      ' + n1(iv, 5) + ' ms  (' + Math.round(base.r.fps) + ' fps)\n';
    resumo += '  lógica do jogo      ' + n1(base.r.upd, 5) + ' ms\n';
    resumo += '  desenho (JavaScript)' + n1(base.r.js, 5) + ' ms\n';
    resumo += '  interface (HTML)    ' + n1(base.r.ui, 5) + ' ms\n';
    resumo += '  ESPERA (placa/tela) ' + n1(parado, 5) + ' ms  (' + Math.round((parado / iv) * 100) + '% do quadro)\n';
    const x1 = saida.find((l) => l.cena === CASA && l.modo.indexOf('resolução x1') === 0);
    if (ocupado / iv >= 0.8) resumo += '  => limitado pelo PROCESSADOR (JavaScript)\n';
    else if (x1 && x1.r && x1.r.fps / base.r.fps >= 1.4) resumo += '  => limitado por PIXELS (placa de vídeo / tela)\n';
    else resumo += '  => o JavaScript fica ESPERANDO: limite da placa de\n     vídeo (quantidade de operações), não dos pixels\n';
    resumo += '\nRECURSOS (fps vs jogo padrão, em volta da casa)\n';
    for (const m of RECURSOS) {
      const l = saida.find((x) => x.cena === CASA && x.modo === m.nome);
      if (l && l.r) {
        const p = Math.round((l.r.fps / base.r.fps - 1) * 100);
        resumo += '  ' + m.nome.padEnd(24) + (p >= 0 ? '+' : '') + p + '%\n';
      }
    }
    const custo = saida
      .filter((l) => l.cena === CASA && l.r && ETAPAS.some((e) => e.nome === l.modo))
      .map((l) => ({ nome: l.modo, ms: iv - 1000 / l.r.fps, fps: l.r.fps }))
      .sort((a, b) => b.ms - a.ms);
    resumo += '\nO QUE MAIS PESA EM VOLTA DA CASA\n(ms por quadro que a etapa custa)\n';
    for (const c of custo) resumo += '  ' + c.nome.padEnd(31) + (c.ms >= 0 ? ' ' : '+') + Math.abs(c.ms).toFixed(1).padStart(5) + '\n';
    resumo += '  (menos de 2 ms é ruído da medição)';
  }
  let microTxt = '';
  if (micro) {
    microTxt += 'MICRO-TESTE (jogo pausado)\n';
    microTxt += 'O mesmo trabalho, 2.200 operações por quadro:\n';
    microTxt += '  Canvas 2D (como o jogo desenha)  ' + Math.round(micro.canvas) + ' fps\n';
    microTxt += micro.webgl === null ? '  WebGL (PixiJS)                   indisponível\n' : '  WebGL (PixiJS)                   ' + Math.round(micro.webgl) + ' fps\n';
    if (micro.ops && micro.ops.length) {
      const vazio = micro.ops[0].fps;
      microTxt += '\nCUSTO POR TIPO DE OPERAÇÃO (Canvas 2D)\n(fps de uma tela só com aquilo; ' + Math.round(vazio) + ' fps = não pesa)\n';
      for (const o of micro.ops.slice(1)) {
        const extra = Math.max(0, 1000 / o.fps - 1000 / vazio);
        microTxt += '  ' + (o.nome + ' ' + o.n).padEnd(36) + String(Math.round(o.fps)).padStart(3) + ' fps  ' + (extra < 1 ? '  ~0' : n1(extra, 4)) + ' ms\n';
      }
    }
  }
  mostra('TESTE DE DESEMPENHO — PRONTO: tire um print desta tela\n' + aparelho, resumo, tabela(), microTxt);
  const botao = document.createElement('button');
  botao.textContent = 'Recarregar o jogo';
  botao.style.cssText =
    'position:fixed;left:6px;bottom:8px;z-index:10001;padding:12px 20px;font:bold 15px sans-serif;border-radius:8px;border:0;background:#3fa34d;color:#fff;touch-action:manipulation';
  botao.onclick = () => location.reload();
  document.body.appendChild(botao);
  // as gravações continuam bloqueadas e os toques engolidos até recarregar: nada do teste vai para o seu save
}

export function startBench() {
  iniciarBench().catch((e) => {
    const el = document.getElementById('bench');
    if (el) el.textContent = 'Erro no teste: ' + (e && e.message ? e.message : e);
    console.error('[Vale do Campo] teste de desempenho falhou:', e);
  });
}
