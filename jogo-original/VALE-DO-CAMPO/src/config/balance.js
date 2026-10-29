/**
 * Parâmetros de equilíbrio do jogo: velocidade do personagem, cultivos (dias até a colheita), preços de venda e nomes dos produtos.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

const SPEED = 60; // px por segundo

const CROP = { seedC: { k: 'cenoura', need: 3 }, seedP: { k: 'abobora', need: 5 }, seedM: { k: 'milho', need: 4 } };

const PRICE = { cenoura: 35, abobora: 80, milho: 55, madeira: 15, cogumelo: 30, ovo: 25 };

const CROP_NAME = { cenoura: 'Cenoura', abobora: 'Abóbora', milho: 'Milho' };

export { CROP, CROP_NAME, PRICE, SPEED };
