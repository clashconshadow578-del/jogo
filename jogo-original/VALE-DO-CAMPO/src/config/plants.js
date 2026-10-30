/**
 * As duas plantas do sub-bosque amazônico que formam o "mato" do jogo: dados da vida real e parâmetros de jogo.
 *
 * O mato de cada tile (`mato[i]`, 0-255, ver world/hydrology/Hydrology.js) é uma dessas plantas e cresce em 4 fases.
 * A espécie de cada tile é escolhida por world/PlantSpecies.js a partir do ambiente (sombra das árvores, umidade do
 * solo, nutrientes, água parada). Os fatos abaixo são o que o jogador vê ao inspecionar o mato (botão Usar com um item
 * que não é ferramenta) e estão resumidos em docs/PLANTAS.md.
 */

/** Limites do mato (0-255) para cada fase da sprite: abaixo de FASE[0] não há planta visível. */
export const FASE = [25, 64, 120, 165];

/** Índices das espécies (0 = nenhuma ainda; é o valor guardado em `plantSp`). */
export const HEL = 1,
  SAM = 2;

export const PLANTS = {
  [HEL]: {
    id: 'helikonia',
    sprites: 'helikonia',
    nome: 'Helicônia',
    popular: 'bananeira-do-mato',
    cientifico: 'Heliconia sp. (Heliconiaceae)',
    icone: '🌺',
    // ---- vida real ----
    real: {
      nutrientes:
        'Solo muito rico em matéria orgânica (húmus e serrapilheira). Nitrogênio para a folhagem; fósforo e umidade ' +
        'constante e alta para florescer.',
      habitat:
        'Margens de rios, várzeas (áreas que alagam) e clareiras com meia-sombra. Não cresce no escuro total: precisa ' +
        'de feixes de luz entre as copas.',
      crescimento: 'Rápido: do rizoma (caule subterrâneo) à planta adulta florida em 6 a 12 meses.',
      vida:
        'Perene. O caule que floresce morre depois de se reproduzir, mas o rizoma continua vivo por muitos anos e ' +
        'brota sempre de novo.',
      cadeia:
        'Produtor primário. As flores guardam água da chuva e néctar (beija-flores, morcegos nectarívoros, insetos); ' +
        'as folhas largas abrigam morcegos e sapos e alimentam lagartas.',
    },
    // ---- jogo ----
    // Quanto cada fator pesa na chance de o tile virar helicônia (ver speciesFit): luz de clareira, água e solo rico.
    luz: 0.55, // sombra ideal (0 = sol aberto, 1 = mata fechada): meia-sombra
    umidade: 0.7, // umidade do solo (0-1) em que rende mais
    aguaParada: 1.5, // multiplicador quando há água parada no tile (várzea): ela gosta
    nutrientes: 0.75, // nutrientes (0-1) em que rende mais
    ritmo: 1.35, // multiplicador do crescimento do mato (rápida)
    palatavel: 1, // quanto a vaca e os herbívoros gostam (1 = normal)
    // Ao florescer (fase 4) o caule morre: com esta chance por dia o mato volta DESCE para a fase 3 e rebrota do rizoma.
    florescerMorre: 0.16,
    florescerQueda: 60,
  },
  [SAM]: {
    id: 'samambaia',
    sprites: 'samambaia',
    nome: 'Samambaia',
    popular: 'samambaia-da-mata',
    cientifico: 'Pteridophyta (ex.: Nephrolepis, Pteris)',
    icone: '🌿',
    real: {
      nutrientes:
        'Muito nitrogênio para manter as folhas verdes e solo levemente ácido. Pede água em abundância, mas não ' +
        'aguenta solo encharcado sem drenagem.',
      habitat:
        'Chão escuro e úmido da mata fechada, barrancos junto a riachos e troncos de árvores grandes (epífita). ' +
        'Prefere sombra total.',
      crescimento: 'Moderado e constante: desenrola as folhas a partir do centro (os báculos), mais devagar que a helicônia.',
      vida: 'Perene e muito longeva: uma touceira vive décadas no mesmo lugar se a umidade do solo não cair.',
      cadeia:
        'Produtor primário do chão da floresta. Tem toxinas que afastam os grandes herbívoros, mas alimenta ' +
        'artrópodes (besouros, formigas, grilos) e moluscos (caracóis, lesmas). Não dá flor nem fruto: ' +
        'reproduz-se por esporos, que alimentam micro-organismos do solo.',
    },
    luz: 0.85,
    umidade: 0.55,
    aguaParada: 0.25,
    nutrientes: 0.6,
    ritmo: 0.7,
    palatavel: 0.35,
    florescerMorre: 0,
    florescerQueda: 0,
  },
};

/** Fase 0-4 (0 = sem planta visível) para a quantidade de mato (0-255). */
export function plantStage(m) {
  if (m <= FASE[0]) return 0;
  if (m < FASE[1]) return 1;
  if (m < FASE[2]) return 2;
  if (m < FASE[3]) return 3;
  return 4;
}

/** Texto curto da inspeção (toast): nome, fase e o fato mais útil para o jogo. */
export function plantBlurb(sp, stage) {
  const p = PLANTS[sp];
  if (!p) return '';
  const fase = ['', 'broto', 'jovem', 'crescida', stage === 4 && sp === HEL ? 'florida' : 'adulta'][stage] || '';
  return `${p.icone} ${p.nome} (${p.popular}) — ${fase}. ${p.real.habitat}`;
}
