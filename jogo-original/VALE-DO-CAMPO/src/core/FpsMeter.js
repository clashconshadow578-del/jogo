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

const FPS_ON = typeof location !== 'undefined' && /[?&]fps\b/.test(location.search);

let el = null,
  frames = 0,
  sum = 0,
  max = 0,
  t0 = 0;

/** Registra o tempo (ms) que o desenho de um quadro levou; atualiza o texto uma vez por segundo. */
function fpsSample(ms) {
  if (!el) {
    el = document.createElement('div');
    el.id = 'fpsmeter';
    el.style.cssText =
      'position:fixed;top:4px;left:50%;transform:translateX(-50%);z-index:9999;padding:3px 7px;font:11px/1.35 monospace;' +
      'color:#fff;background:rgba(0,0,0,.65);border-radius:4px;pointer-events:none;white-space:pre;text-align:center';
    document.body.appendChild(el);
    t0 = performance.now();
  }
  frames++;
  sum += ms;
  if (ms > max) max = ms;
  const now = performance.now();
  if (now - t0 < 1000) return;
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

export { FPS_ON, fpsSample };
