/**
 * Opção experimental `?cpu` na URL: faz TODOS os canvases 2D do jogo desenharem na CPU, e não na placa de vídeo
 * (`willReadFrequently: true`). Num jogo de pixel art com milhares de operações pequenas por quadro isso pode ser mais rápido
 * em alguns celulares (a placa de vídeo recebe muitas chamadas pequenas) e mais lento em outros; por isso é só uma chave de
 * teste, para comparar com o `?fps`. Sem `?cpu` este arquivo não faz nada.
 *
 * Precisa ser o PRIMEIRO import de main.js: vale para todo canvas criado depois dele, em qualquer módulo.
 */
export const CPU_CANVAS = typeof location !== 'undefined' && /[?&]cpu\b/.test(location.search);

if (CPU_CANVAS && typeof HTMLCanvasElement !== 'undefined') {
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, options) {
    return getContext.call(this, type, type === '2d' ? { ...options, willReadFrequently: true } : options);
  };
}
