/**
 * Medidas das folhas de sprites da harpia (public/assets/sprites/animals/harpy/<nome>.webp). GERADO por tools/harpia/make-harpia.py: não edite à mão.
 * `w` x `h` é o tamanho de cada quadro; `ax`, `ay` o ponto do quadro que fica na posição da ave (o pé, nas folhas em pé; o centro do corpo, nas que voam).
 * Todos os quadros olham para a direita (a esquerda é o espelho).
 */
export const HARPIA_FOLHAS = {
  "andar": {
    "cols": 6,
    "rows": 3,
    "n": 18,
    "w": 28,
    "h": 31,
    "ax": 15.4,
    "ay": 30.9
  },
  "parada": {
    "cols": 6,
    "rows": 4,
    "n": 23,
    "w": 26,
    "h": 28,
    "ax": 14.2,
    "ay": 27.3
  },
  "voo": {
    "cols": 4,
    "rows": 3,
    "n": 12,
    "w": 48,
    "h": 50,
    "ax": 23.7,
    "ay": 25.0
  },
  "razante": {
    "cols": 3,
    "rows": 4,
    "n": 12,
    "w": 44,
    "h": 48,
    "ax": 20.9,
    "ay": 22.9
  }
};
