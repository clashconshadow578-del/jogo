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

export { bakeImg };
