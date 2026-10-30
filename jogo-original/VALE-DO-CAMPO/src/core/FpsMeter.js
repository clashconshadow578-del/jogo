/**
 * Contador de desempenho na tela, só com `?fps` na URL (para medir no celular, onde não há console).
 *
 * Mostra, a cada segundo: quadros por segundo, tempo de JavaScript gasto em desenhar o quadro (média e pico), a resolução
 * e a qualidade atuais (o jogo as reduz sozinho quando o aparelho não acompanha: compare sempre os três números) e, com
 * `?pixi`, quantos tiles de grama o PixiJS está cobrindo. O tempo de desenho NÃO inclui o trabalho da placa de vídeo;
 * o que a placa de vídeo faz aparece como queda de fps ou como o jogo reduzindo a resolução/qualidade.
 * Sem `?fps` não faz nada (nem mede o tempo).
 */
import { Q } from '../config/settings.js';
import { RS } from '../rendering/Canvas.js';

const BENCH = typeof location !== 'undefined' && /[?&]bench\b/.test(location.search);
const FPS_ON = typeof location !== 'undefined' && /[?&](fps|bench)\b/.test(location.search);

let tap = null;

/** O teste de desempenho (core/Bench.js) recebe o tempo de desenho de cada quadro por aqui. */
function setFpsTap(fn) {
  tap = fn;
}

const AQUECE_MS = 3000; // o começo do jogo monta imagens e baixa texturas: o primeiro número não representa o jogo normal

let el = null,
  frames = 0,
  sum = 0,
  max = 0,
  t0 = 0,
  tCriado = 0;

/** Registra o tempo (ms) que o desenho de um quadro levou; atualiza o texto uma vez por segundo. */
function fpsSample(ms) {
  if (tap) tap(ms);
  if (BENCH) return; // no teste de desempenho o painel é o do Bench.js
  if (!el) {
    el = document.createElement('div');
    el.id = 'fpsmeter';
    el.style.cssText =
      'position:fixed;top:4px;left:50%;transform:translateX(-50%);z-index:9999;padding:3px 7px;font:11px/1.35 monospace;' +
      'color:#fff;background:rgba(0,0,0,.65);border-radius:4px;pointer-events:none;white-space:pre;text-align:center';
    document.body.appendChild(el);
    t0 = tCriado = performance.now();
  }
  frames++;
  sum += ms;
  if (ms > max) max = ms;
  const now = performance.now();
  if (now - t0 < 1000) return;
  if (now - tCriado < AQUECE_MS) {
    el.textContent = 'medindo… (aguarde 3 s)';
    frames = 0;
    sum = 0;
    max = 0;
    t0 = now;
    return;
  }
  const px = window.VDC_PIXI;
  const pixi = px && px.ok ? 'ligado, grama: ' + (px.coveredTiles || 0) + ' tiles' : 'desligado';
  el.textContent =
    Math.round((frames * 1000) / (now - t0)) + ' fps · desenho ' + (sum / frames).toFixed(1) + ' ms (pico ' + max.toFixed(0) + ')\n' +
    'resolução x' + RS + ' · qualidade ' + Q() + ' · PixiJS ' + pixi;
  frames = 0;
  sum = 0;
  max = 0;
  t0 = now;
}

export { FPS_ON, fpsSample, setFpsTap };
