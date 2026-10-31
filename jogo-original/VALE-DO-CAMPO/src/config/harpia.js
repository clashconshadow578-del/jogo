/**
 * Harpia (Harpia harpyja): todos os números da simulação. Biologia e regras em docs/HARPIA.md; o comportamento está em entities/wild/Harpy.js.
 * São regras de simulação inspiradas na biologia, não medidas da espécie.
 */
export const HARPIA = {
  // ---- o casal e a árvore-ninho ----
  casal: 2, // aves que aparecem juntas (fêmea maior, macho menor)
  arvoreMinFase: 6, // fase mínima da árvore para ser árvore-ninho (adulta)
  pesoGigante: 8, // uma sumaúma gigante vale 8x uma comum na escolha (e sumaúma vale mais que castanheira)
  poleiroZ: 0.86, // fração da altura da árvore em que ela pousa (na copa)
  poleirosExtras: 3, // além da árvore-ninho, até este número de árvores altas por perto servem de poleiro de caça
  poleiroRaio: 420, // px: até onde procura esses poleiros extras
  // ---- voo ----
  voo: { cruzeiro: 58, subir: 34, razante: 205, pouso: 60, disputa: 150, fuga: 120 }, // px/s
  // ---- rotina: longos períodos parada, intercalados com observação e caça ----
  repouso: [40, 110], // s pousada quieta
  observa: [25, 70], // s observando (é aqui que procura presas)
  passeio: [10, 24], // s voando entre poleiros
  preferePoleiroNinho: 0.7, // chance de voltar à árvore-ninho em vez de outro poleiro
  // ---- caça ----
  caca: {
    rastreio: [2, 5], // s acompanhando a presa antes de decidir
    preparo: [1, 2.2], // s se posicionando antes do razante
    intervalo: 70, // s mínimos entre tentativas
    esperaFalha: [25, 45], // s de espera depois de errar o bote
    comer: [14, 22], // s comendo a presa
    fomeSobe: 0.0006, // fome por segundo da harpia (a de todos os bichos é 0,006/s): chega de 0 a 1 em ~28 min
    chanceBase: 0.25, // chance de decidir atacar uma presa que vê (sobe com a fome)
    chanceFome: 0.6,
    capturaBase: 0.78, // chance de agarrar a presa no bote (cai com mato alto e com presa alerta)
    alcance: 9, // px: distância do agarre
  },
  // presas que existem no jogo: valor da refeição (0..1) e peso. Filhotes só sem adulto por perto (cervo 48 px; queixada: bando).
  presas: {
    hare: { n: 'uma lebre', value: 0.45, w: 1 },
    grouse: { n: 'um galo-lira', value: 0.4, w: 1 },
    chicken: { n: 'uma galinha', value: 0.5, w: 0.8 },
    deer: { n: 'um filhote de cervo', value: 0.8, w: 0.6, cria: true, guarda: 48 },
    boar: { n: 'um filhote de queixada', value: 0.8, w: 0.5, cria: true, guarda: 52 },
  },
  criaIdade: 200, // `age` abaixo disto é filhote (como faManage)
  // ---- defesa do ninho (nunca ataca o jogador longe dele) ----
  defesa: {
    avisoR: 170, // px da árvore-ninho: levanta a crista e avisa
    ataqueR: 85, // px: se o jogador continua aqui depois do aviso, ela investe
    aviso: 3.5, // s de aviso antes de atacar
    dano: 8,
    empurrao: 150,
    intervalo: 45, // s entre ataques
    raioAtivo: 260, // px da árvore: só defende se estiver perto dela
  },
  // ---- som (systems/audio/HarpySounds.js): alto, ouvido de longe e com eco, porque ela grita da copa ou voando ----
  som: {
    alcance: 950, // px: até onde o grito chega (o do mugido da vaca chega a 280)
    ganho: 1, // multiplica o volume de todos os gritos
    dentroDeCasa: 0.35, // de dentro da casa chega abafado
    eco: 0.7, // volume geral do eco
    atrasos: [
      [0.34, 0.46], // [atraso (s), quanto volta]: o primeiro eco
      [0.67, 0.4], // o segundo, mais longe
    ],
    intervaloChamado: [35, 95], // s entre os chamados de cada ave, de dia e sem nada acontecendo
    resposta: [1.2, 3], // s até o par responder
    tipos: {
      chamado: {
        eco: 0.8,
        notas: [
          { t: 0, d: 1.2, f0: 3000, f1: 2200, g: 0.4 },
          { t: 1.35, d: 0.85, f0: 2800, f1: 2000, g: 0.32 },
        ],
      },
      contato: { eco: 0.55, notas: [{ t: 0, d: 0.7, f0: 2700, f1: 2300, g: 0.24 }] },
      alerta: {
        eco: 0.85,
        notas: [0, 0.3, 0.6, 0.9, 1.2].map((t) => ({ t, d: 0.21, f0: 3500, f1: 2900, g: 0.44 })),
      },
      razante: { eco: 0.85, notas: [{ t: 0, d: 0.75, f0: 2300, f1: 3700, g: 0.46, aspero: true }] },
    },
  },
  // ---- outros animais ----
  onca: { fugaR: 90 }, // onça-pintada a menos que isto da harpia no chão: ela sobe para a árvore
  // outra harpia (que não é o par) dentro deste raio da árvore-ninho e a mais de `longeDeCasa` px do próprio ninho: é expulsa por quem está em casa
  disputa: { raio: 280, duracao: 14, longeDeCasa: 140 },
};
