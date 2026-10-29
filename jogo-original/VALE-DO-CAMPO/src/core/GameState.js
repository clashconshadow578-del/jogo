/**
 * Estado compartilhado da partida: S (dados salvos do jogador: dia, minuto, moedas, energia, inventário, posição...) e o indicador de sono.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

let S;

let sleeping = false;

/** Atualiza `S` a partir de outros módulos (as ligações importadas são somente leitura). */
export function setS(value) {
  S = value;
  return value;
}

/** Atualiza `sleeping` a partir de outros módulos (as ligações importadas são somente leitura). */
export function setSleeping(value) {
  sleeping = value;
  return value;
}

export { S, sleeping };
