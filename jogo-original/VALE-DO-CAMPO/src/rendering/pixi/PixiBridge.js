/**
 * Ponte para o PixiJS (WebGL). Fase 1 da migração (ver PLANO_MIGRACAO.md): só liga o PixiJS, ainda não desenha nada.
 *
 * - Sem `?pixi` na URL: nada acontece e o PixiJS nem é baixado. O jogo é desenhado em Canvas 2D, como sempre.
 * - Com `?pixi`: cria um renderizador WebGL FORA da tela (não entra na página). Se o aparelho não suportar WebGL,
 *   o erro é só avisado no console e o jogo continua em Canvas 2D.
 *
 * O estado fica em `window.VDC_PIXI` ({ ok, renderer }) para conferência no console e nos testes.
 */
import { VH, VW } from '../../config/constants.js';

/** `search` é o texto depois do "?" da URL (ex.: "?pixi&debug"). */
export function pixiRequested(search) {
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
      await app.init({ width: VW, height: VH, preference: 'webgl', backgroundAlpha: 0, antialias: false });
      const info = { ok: true, renderer: app.renderer.name, app, PIXI };
      window.VDC_PIXI = info;
      console.info('[Vale do Campo] PixiJS ligado (' + info.renderer + '). O desenho ainda é Canvas 2D (fase 1).');
      return info;
    } catch (err) {
      window.VDC_PIXI = { ok: false, error: String(err) };
      console.warn('[Vale do Campo] PixiJS indisponível, seguindo em Canvas 2D:', err);
      return null;
    }
  })();
  return started;
}
