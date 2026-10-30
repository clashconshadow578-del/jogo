/**
 * Camadas do jogo que já são desenhadas pelo PixiJS (contexto de rendering/pixi/PixiCtx.js). Cada camada é uma extensão de uma
 * camada do Renderer.js: com o PixiJS pronto ela desenha na GPU; se algo não suportado aparecer, ou sem PixiJS, desenha em Canvas.
 */
import { layerBase, layerEntities, layerShadows } from '../Renderer.js';
import { pixiLayerBegin, pixiLayerEnd, pixiLayersInit } from './PixiCtx.js';

/** `ok` e `falhas` por camada, para conferir no celular (aparece no ?fps). */
export const pixiLayerInfo = {
  chao: { ok: 0, falhas: 0, motivo: '' },
  sombras: { ok: 0, falhas: 0, motivo: '' },
  entidades: { ok: 0, falhas: 0, motivo: '' },
};

function viaPixi(nome, prev) {
  return function () {
    const info = pixiLayerInfo[nome];
    if (pixiLayerBegin()) {
      prev.apply(this, arguments);
      const motivo = pixiLayerEnd();
      if (!motivo) {
        info.ok++;
        return;
      }
      info.falhas++;
      info.motivo = motivo;
    }
    return prev.apply(this, arguments);
  };
}

if (typeof window !== 'undefined') window.VDC_LAYERS = pixiLayerInfo;

layerBase.extend((prev) => viaPixi('chao', prev));
layerShadows.extend((prev) => viaPixi('sombras', prev));
layerEntities.extend((prev) => viaPixi('entidades', prev));

export { pixiLayersInit };
