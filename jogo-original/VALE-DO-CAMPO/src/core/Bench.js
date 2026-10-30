/**
 * Teste de desempenho automático, só com `?bench` na URL (feito para o celular, onde não há console).
 *
 * Roda sozinho dentro do próprio jogo, no próprio aparelho: leva o jogador a 3 lugares do mapa (onde ele está, o rio e a
 * floresta) e, em cada um, mede quadros por segundo e tempo de desenho com recursos ligados e desligados (mato em imagens,
 * grama na GPU, cache do chão, qualidade, resolução). No fim mostra uma tabela na tela para tirar um print. Nada é salvo:
 * as opções gráficas e a posição voltam ao que eram.
 *
 * A resolução fica FIXA durante o teste (o jogo normalmente a reduz sozinho quando o aparelho não acompanha, o que
 * atrapalharia a comparação).
 *
 * Segurança do seu jogo: durante o teste o jogador é levado a outros lugares e o tempo do jogo anda, então NADA é gravado
 * (o jogo salva sozinho a cada minuto e ao sair da aba: essas gravações são bloqueadas) e os toques na tela são ignorados.
 * No fim aparece o botão "Recarregar o jogo", que volta ao último save, exatamente como estava antes do teste.
 */
import { gfx, Q, qDrop, setQDrop } from '../config/settings.js';
import { RS, applyRes } from '../rendering/Canvas.js';
import { SPR } from '../rendering/Sprites.js';
import { getPixi, initPixi, setPixiEnabled } from '../rendering/pixi/PixiBridge.js';
import { setMatoLive } from '../world/Vegetation.js';
import { setFpsTap } from './FpsMeter.js';
import { S } from './GameState.js';

export const benchRequested = (search) => /[?&]bench\b/.test(search || '');

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

const CENAS = [
  { nome: 'FAZENDA (onde você está)', pos: null },
  { nome: 'RIO', pos: [300, 1000] },
  { nome: 'FLORESTA', pos: [1200, 400] },
];
// cada modo liga só o que diz; o resto fica no padrão do jogo
const MODOS = [
  { nome: 'jogo padrão', mato: false, pixi: false, chunks: false },
  { nome: 'mato em imagens (fase 3)', mato: true, pixi: false, chunks: false },
  { nome: 'grama na GPU (fase 2)', mato: false, pixi: true, chunks: false },
  { nome: 'cache do chão', mato: false, pixi: false, chunks: true },
];
// só na primeira cena: o que pesa mais neste aparelho?
const EXTRAS = [
  { nome: 'qualidade mínima', quality: 'low' },
  { nome: 'sem raios e partículas', rays: false, particles: false },
  { nome: 'resolução x1 (4x menos pixels)', res: '1' },
];

const ASSENTA_MS = 3000; // tempo para o jogo se ajustar depois de mudar de modo (caches, texturas)
const MEDE_MS = 6000;

// Mede quadros por segundo (rAF) em fatias de 1 s e devolve a MEDIANA delas (um congelamento isolado não estraga o número),
// o pior intervalo entre quadros e o tempo médio gasto em desenhar (GameLoop -> fpsSample).
function medir(ms) {
  return new Promise((resolve) => {
    let n = 0,
      worst = 0,
      last = 0,
      t0 = 0,
      b0 = 0,
      bn = 0,
      jsSum = 0,
      jsN = 0;
    const fatias = [];
    setFpsTap((d) => {
      jsSum += d;
      jsN++;
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
        resolve({ fps, js: jsN ? jsSum / jsN : 0, worst });
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

const fmt = (r) =>
  r
    ? String(Math.round(r.fps)).padStart(4) + ' fps  ' + r.js.toFixed(1).padStart(5) + ' ms  ' + String(Math.round(r.worst)).padStart(4) + ' ms'
    : '   -- indisponível';

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

  const painel = document.createElement('div');
  painel.id = 'bench';
  painel.style.cssText =
    'position:fixed;left:6px;top:6px;z-index:10000;padding:8px 10px;font:12px/1.4 monospace;color:#fff;background:rgba(0,0,0,.86);' +
    'border-radius:6px;pointer-events:none;white-space:pre;max-width:96vw';
  document.body.appendChild(painel);
  const mostra = (t) => (painel.textContent = t);

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
    '\nGPU: ' + gpuInfo() + '\nWebGL: ' + (pixiOk ? 'sim' : 'não') + ' · modo celular: ' + (matchMedia('(pointer:coarse)').matches ? 'sim' : 'não');

  const aplica = (m) => {
    setMatoLive(!m.mato);
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
  aplica(MODOS[0]);
  for (let w = 6; w > 0; w--) {
    mostra('TESTE DE DESEMPENHO\nAquecendo o jogo… ' + w + ' s\n' + aparelho);
    await espera(1000);
  }

  const saida = []; // { cena, modo, r }
  const total = CENAS.length * MODOS.length + EXTRAS.length;
  let feito = 0;
  const tabela = (rodando) => {
    let t = 'TESTE DE DESEMPENHO — ' + (rodando ? 'não toque na tela (' + feito + '/' + total + ')' : 'PRONTO: tire um print desta tela') + '\n' + aparelho + '\n';
    t += '\n' + ' '.repeat(34) + ' fps*   desenho   pior quadro   (*mediana por segundo)';
    let cena = '';
    for (const l of saida) {
      if (l.cena !== cena) {
        cena = l.cena;
        t += '\n' + cena;
      }
      t += '\n  ' + l.modo.padEnd(32) + fmt(l.r);
    }
    return t;
  };

  try {
    if (S.inside) {
      mostra('Saia da casa e abra de novo com ?bench.');
      return;
    }
    for (let c = 0; c < CENAS.length; c++) {
      const cena = CENAS[c];
      if (cena.pos) {
        S.px = cena.pos[0];
        S.py = cena.pos[1];
        S.vx = 0;
        S.vy = 0;
      }
      const lista = c === 0 ? [...MODOS, ...EXTRAS] : MODOS;
      for (const m of lista) {
        aplica(m);
        mostra(tabela(true) + '\n\n> medindo: ' + cena.nome.split(' ')[0] + ' / ' + m.nome + '…');
        await espera(ASSENTA_MS);
        const semPixi = m.pixi && !pixiOk;
        const r = semPixi ? null : await medir(MEDE_MS);
        saida.push({ cena: cena.nome, modo: m.nome, r, res: RS, q: Q() });
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
    setMatoLive(matoPadrao);
    setPixiEnabled(true);
    applyRes();
    S.px = pos0[0];
    S.py = pos0[1];
    S.vx = 0;
    S.vy = 0;
  }

  // resumo: quanto cada recurso muda o fps em relação ao jogo padrão (média das 3 cenas)
  const rel = {};
  for (const cena of CENAS) {
    const base = saida.find((l) => l.cena === cena.nome && l.modo === 'jogo padrão');
    if (!base || !base.r) continue;
    for (const l of saida) if (l.cena === cena.nome && l.r && l.modo !== 'jogo padrão') (rel[l.modo] = rel[l.modo] || []).push(l.r.fps / base.r.fps);
  }
  let resumo = '\n\nRESUMO (fps comparado ao jogo padrão)';
  for (const [modo, v] of Object.entries(rel)) {
    const media = v.reduce((a, b) => a + b, 0) / v.length;
    resumo += '\n  ' + modo.padEnd(32) + (media >= 1 ? '+' : '') + Math.round((media - 1) * 100) + '%';
  }
  const x1 = rel['resolução x1 (4x menos pixels)'];
  if (x1 && x1.length) {
    resumo += x1[0] >= 1.4 ? '\n  => limitado por PIXELS (placa de vídeo / tela)' : '\n  => limitado pelo PROCESSADOR (JavaScript), não pelos pixels';
  }
  mostra(tabela(false) + resumo + '\n\nDepois do print, recarregue o jogo (ele volta ao último save).');
  const botao = document.createElement('button');
  botao.textContent = 'Recarregar o jogo';
  botao.style.cssText =
    'position:fixed;left:6px;bottom:14px;z-index:10001;padding:14px 22px;font:bold 16px sans-serif;border-radius:8px;border:0;background:#3fa34d;color:#fff;touch-action:manipulation';
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
