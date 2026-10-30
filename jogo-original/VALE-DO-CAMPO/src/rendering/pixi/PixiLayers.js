/**
 * O PixiJS desenha o quadro inteiro (Renderer.js: `render` abre e fecha o contexto de rendering/pixi/PixiCtx.js). Este arquivo só
 * inicia o desenhista de quadros e expõe os contadores para os testes (`window.VDC_LAYER_STATS`).
 */
import { pixiLayerStats, pixiLayersInit } from './PixiCtx.js';

export { pixiLayersInit, pixiLayerStats };
