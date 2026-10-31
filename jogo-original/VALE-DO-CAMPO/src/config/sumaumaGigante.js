/**
 * Sumaúma gigante: de vez em quando uma sumaúma nasce bem maior que as outras (features/amazon/AmazonTrees.js). É nela que as harpias
 * preferem fazer o ninho (entities/wild/Harpy.js). Os números ficam todos aqui.
 */
export const SUMAUMA_GIGANTE = {
  chance: 0.05, // 5% das sumaúmas
  escala: 1.3, // 30% maior (altura, copa e tronco; o desenho, a sombra e a luz que ela tira das vizinhas crescem juntos)
  estagioMin: 3, // só aparece a partir da fase "Jovem": muda e broto de sumaúma gigante são iguais aos das outras
};
