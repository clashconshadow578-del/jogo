/**
 * Utilitário para copiar imagens para canvas (evita que o navegador descarte/redecodifique sprites).
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

function bakeImg(im) {
  const c = document.createElement('canvas');
  c.width = im.naturalWidth || im.width;
  c.height = im.naturalHeight || im.height;
  c.getContext('2d').drawImage(im, 0, 0);
  c.complete = true;
  c.naturalWidth = c.width;
  c.naturalHeight = c.height;
  return c;
} // cópia em canvas: nunca é descartada/redecodificada pelo navegador

/** Cópia em canvas ampliada `k` vezes SEM suavização (vizinho mais próximo): o pixel art continua nítido e o alfa continua só 0/255. */
function bakeScaled(im, k) {
  const c = document.createElement('canvas'),
    w = im.naturalWidth || im.width,
    h = im.naturalHeight || im.height;
  c.width = Math.round(w * k);
  c.height = Math.round(h * k);
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(im, 0, 0, w, h, 0, 0, c.width, c.height);
  c.complete = true;
  c.naturalWidth = c.width;
  c.naturalHeight = c.height;
  return c;
}

export { bakeImg, bakeScaled };
