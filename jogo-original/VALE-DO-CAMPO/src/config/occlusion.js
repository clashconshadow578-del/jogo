/**
 * Transparência de árvores e plantas na frente do personagem (rendering/Occlusion.js): em vez de a árvore inteira ficar translúcida,
 * só um círculo ao redor do personagem fica, com a borda em degradê. Os números ficam todos aqui.
 */
export const OCLUSAO = {
  raio: 26, // px: até onde o degradê chega (para além disso a árvore ou planta é desenhada normal)
  nucleo: 8, // px: dentro deste raio a transparência é a máxima
  forca: 0.78, // 0..1: quanto some no centro (0,78 = só 22% da árvore continua visível ali)
  centroY: 11, // px acima dos pés do personagem: o centro do círculo fica no tronco, não nos pés
};
