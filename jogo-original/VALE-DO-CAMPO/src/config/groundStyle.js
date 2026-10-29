/**
 * Estilo do chão de grama.
 *
 * O jogo usa a textura public/assets/sprites/ground/grass.png e a borda de lago combinando com ela.
 * Só o teste de regressão visual liga o modo "legado" (window.__VDC_LEGACY_GROUND = true, definido
 * antes do jogo carregar) para voltar à grama lisa do original e poder comparar o RESTO da cena
 * pixel a pixel com o arquivo preservado em legacy/. Fora dos testes isso nunca é ligado.
 */
export const LEGACY_GROUND = !!globalThis.__VDC_LEGACY_GROUND;
