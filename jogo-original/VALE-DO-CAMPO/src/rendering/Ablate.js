/**
 * Etapas do desenho que o teste de desempenho (core/Bench.js) pode DESLIGAR uma de cada vez para medir quanto cada uma custa
 * no aparelho. Tudo fica ligado (false) fora do teste; o custo é a leitura de uma propriedade por etapa.
 *
 * Grosso: sombras (de contato), mato, relevo, hidro (umidade do chão), agua, luz, atm (atmosfera), clima (chuva, nuvens, raio),
 *         entidades (todas)
 * Entidades por tipo: arvores, plantas (plantações), outros (animais, pedras, casa...; o jogador sempre aparece)
 * Dentro da luz: luzSombras (sombras projetadas), luzBlur (desfoque), luzFinal (composição final na tela)
 * Dentro da atmosfera: atmRaios, atmParticulas, atmCompor (compor as camadas na tela)
 */
export const AB = {
  sombras: false,
  mato: false,
  relevo: false,
  hidro: false,
  agua: false,
  luz: false,
  atm: false,
  clima: false,
  entidades: false,
  arvores: false,
  plantas: false,
  outros: false,
  luzSombras: false,
  luzBlur: false,
  luzFinal: false,
  atmRaios: false,
  atmParticulas: false,
  atmCompor: false,
};

/** Desliga as etapas marcadas em `map` (ex.: { sombras: true }); as demais voltam a ligar. */
export function setAblate(map) {
  for (const k in AB) AB[k] = !!(map && map[k]);
}
