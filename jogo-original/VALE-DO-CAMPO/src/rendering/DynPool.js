/**
 * Canvases auxiliares que mudam todo quadro (a árvore furada em rendering/Occlusion.js, a sucuri esticada em entities/wild/Anaconda.js).
 * Ficam guardados por tamanho exato (o PixiJS não aceita um canvas que muda de tamanho) e cada um é entregue no máximo uma vez por quadro
 * (`dynFrame()` zera a contagem). Marcados com `__dyn` ficam fora do atlas do PixiJS (rendering/pixi/PixiCtx.js): senão cada quadro
 * recopiaria uma página inteira de 1024x1024 só por causa deles.
 */
const pool = new Map();
let quadro = 0;

/** Começo de um quadro: todos os canvases voltam a ficar livres. */
export function dynFrame() {
  quadro++;
}

/** Um canvas w x h (inteiros) que ainda não foi usado neste quadro, com o seu contexto 2D: `{ cv, k }`. O conteúdo anterior continua nele. */
export function dynGet(w, h) {
  const key = w + 'x' + h;
  let e = pool.get(key);
  if (!e) pool.set(key, (e = { list: [], q: -1, n: 0 }));
  if (e.q !== quadro) {
    e.q = quadro;
    e.n = 0;
  }
  let it = e.list[e.n];
  if (!it) {
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    cv.__dyn = true;
    it = e.list[e.n] = { cv, k: cv.getContext('2d') };
  }
  e.n++;
  return it;
}
