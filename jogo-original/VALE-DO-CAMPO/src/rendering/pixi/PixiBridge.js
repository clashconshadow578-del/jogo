/**
 * Ponte para o PixiJS (WebGL). Liga o PixiJS e entrega o renderizador para as camadas migradas (ver PLANO_MIGRACAO.md).
 * Hoje a única camada que usa o PixiJS é o chão de grama parada (PixiGround.js, fase 2).
 *
 * - Sem `?pixi` na URL: nada acontece e o PixiJS nem é baixado. O jogo é desenhado em Canvas 2D, como sempre.
 * - Com `?pixi`: cria um renderizador WebGL FORA da tela (não entra na página). Se o aparelho não suportar WebGL,
 *   o erro é só avisado no console e o jogo continua em Canvas 2D.
 *
 * O estado fica em `window.VDC_PIXI` ({ ok, renderer }) para conferência no console e nos testes.
 */
import { TS, VH, VW } from '../../config/constants.js';

// Tamanho do quadro do PixiJS: cabe o maior trecho de tiles que o laço do chão visita (ver Renderer.js) + folga.
const CANVAS_W = (Math.ceil(VW / TS) + 3) * TS,
  CANVAS_H = (Math.ceil(VH / TS) + 3) * TS;

/** O PixiJS é o desenhista padrão; `?canvas` na URL volta para o Canvas 2D puro (plano B). `search` é o texto depois do "?" da URL. */
export function pixiRequested(search) {
  return !/[?&]canvas\b/.test(search || '');
}

/** O usuário pediu o PixiJS explicitamente (`?pixi`): só então o jogo avisa na tela. */
export function pixiExplicit(search) {
  return /[?&]pixi\b/.test(search || '');
}

let started = null;

export function initPixi(search = location.search) {
  if (!pixiRequested(search)) return Promise.resolve(null);
  if (started) return started;
  started = (async () => {
    try {
      const PIXI = await import('pixi.js');
      // Pixel art nítido: sem suavizar as texturas ao ampliar.
      PIXI.TextureSource.defaultOptions.scaleMode = 'nearest';
      const app = new PIXI.Application();
      // autoStart: false -> o jogo manda desenhar quando quer (não existe laço próprio do PixiJS).
      await app.init({
        width: CANVAS_W,
        height: CANVAS_H,
        resolution: 1,
        preference: 'webgl',
        backgroundAlpha: 1,
        antialias: false,
        autoStart: false,
        sharedTicker: false,
      });
      const info = { ok: true, renderer: app.renderer.name, app, PIXI };
      window.VDC_PIXI = info;
      console.info('[Vale do Campo] PixiJS ligado (' + info.renderer + '). O resto do desenho continua em Canvas 2D.');
      return info;
    } catch (err) {
      window.VDC_PIXI = { ok: false, error: String(err) };
      console.warn('[Vale do Campo] PixiJS indisponível, seguindo em Canvas 2D:', err);
      return null;
    }
  })();
  return started;
}

let enabled = true;

/** Liga/desliga o uso do PixiJS nas camadas migradas sem recarregar a página (teste de desempenho, core/Bench.js). */
export function setPixiEnabled(value) {
  enabled = !!value;
  return enabled;
}

/** O PixiJS pronto ({ PIXI, app }) ou null (sem ?pixi, ainda carregando, desligado, ou sem WebGL). */
export function getPixi() {
  const v = typeof window !== 'undefined' ? window.VDC_PIXI : null;
  return enabled && v && v.ok ? v : null;
}
