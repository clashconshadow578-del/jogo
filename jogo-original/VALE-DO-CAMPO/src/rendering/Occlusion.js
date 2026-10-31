/**
 * Árvore ou planta na frente do personagem: só um círculo ao redor dele fica translúcido, com a borda em degradê (antes a árvore
 * inteira ficava translúcida). O círculo vale para tudo que é desenhado DEPOIS do personagem na ordem Y (ou seja, quem está na frente dele).
 *
 * Como funciona (igual no PixiJS e em `?canvas`, que não têm "apagar com máscara"): quem desenha uma árvore ou planta pede o contexto
 * com `occBegin(x, y, w, h)` (o retângulo que o desenho ocupa, em coordenadas do mundo). Se o círculo não toca esse retângulo, devolve o
 * próprio `ctx` e nada muda. Se toca, devolve um canvas auxiliar do mesmo tamanho, já com as mesmas coordenadas do mundo: o desenho vai
 * para ele, `occEnd(g)` fura o canvas com a máscara em degradê (`destination-out`) e o coloca na cena, na mesma posição e na mesma ordem.
 */
import { OCLUSAO } from '../config/occlusion.js';
import { ctx } from './Canvas.js';
import { dynFrame, dynGet } from './DynPool.js';

const R = OCLUSAO.raio;
let on = false,
  hx = 0,
  hy = 0,
  mask = null;

/** A máscara: alfa 0..forca no centro, caindo em suavização (smoothstep) até 0 na borda. Feita uma vez. */
function getMask() {
  if (mask) return mask;
  const n = R * 2,
    c = document.createElement('canvas');
  c.width = c.height = n;
  const k = c.getContext('2d'),
    im = k.createImageData(n, n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const d = Math.hypot(x + 0.5 - R, y + 0.5 - R),
        t = Math.min(1, Math.max(0, (d - OCLUSAO.nucleo) / (R - OCLUSAO.nucleo))),
        s = 1 - t * t * (3 - 2 * t);
      im.data[(y * n + x) * 4 + 3] = Math.round(255 * OCLUSAO.forca * s);
    }
  k.putImageData(im, 0, 0);
  return (mask = c);
}

/** Começo de cada quadro: o círculo fica desligado até o personagem ser desenhado. */
export function occReset() {
  on = false;
  dynFrame();
}

/** Chamado logo depois de desenhar o personagem (feet = pés em x, y do mundo): o que for desenhado a seguir está na frente dele. */
export function occLigar(x, y) {
  on = true;
  hx = Math.round(x);
  hy = Math.round(y - OCLUSAO.centroY);
}

export const occAtivo = () => on;

let atual = null;

/**
 * Contexto onde desenhar uma árvore ou planta que ocupa o retângulo (x, y, w, h) do mundo (números inteiros). Devolve `ctx` se o
 * círculo do personagem não toca o desenho (o caso comum, sem custo); senão um canvas auxiliar, e `occEnd(g)` precisa ser chamado depois.
 */
export function occBegin(x, y, w, h) {
  if (!on) return ctx;
  // distância do centro do círculo ao retângulo mais próximo
  const dx = Math.max(x - hx, 0, hx - (x + w)),
    dy = Math.max(y - hy, 0, hy - (y + h));
  if (dx * dx + dy * dy >= R * R) return ctx;
  const it = dynGet(w, h),
    k = it.k;
  k.setTransform(1, 0, 0, 1, 0, 0);
  k.globalCompositeOperation = 'source-over';
  k.globalAlpha = 1;
  k.imageSmoothingEnabled = false;
  k.clearRect(0, 0, w, h);
  k.setTransform(1, 0, 0, 1, -x, -y); // o desenho segue em coordenadas do mundo
  atual = { it, x, y, w, h };
  return k;
}

/** Termina o desenho começado por `occBegin`: fura o canvas auxiliar e o coloca na cena. `g` é o que `occBegin` devolveu. */
export function occEnd(g) {
  if (g === ctx || !atual) return;
  const { it, x, y, w, h } = atual;
  atual = null;
  const k = it.k;
  k.setTransform(1, 0, 0, 1, 0, 0);
  k.globalCompositeOperation = 'destination-out';
  k.drawImage(getMask(), hx - R - x, hy - R - y);
  k.globalCompositeOperation = 'source-over';
  ctx.drawImage(it.cv, 0, 0, w, h, x, y, w, h);
}
