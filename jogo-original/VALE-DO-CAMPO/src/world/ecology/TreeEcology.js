/**
 * Sistema ecológico de árvores: classes de solo e árvore realista, crescimento, sementes e sincronização com o mapa.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { HN, MW, TREE } from '../../config/constants.js';
import { extensible } from '../../core/extensions.js';
import { sunInfo } from '../../core/TimeManager.js';
import { nut, sm } from '../hydrology/Hydrology.js';
import { treeRegion } from '../Trees.js';
import { clouds } from '../WeatherSystem.js';
import { obj } from '../World.js';

/* ============ SISTEMA ECOLÓGICO DE ÁRVORES (integrado de sistema_ecologico_arvores.js) ============ */

/**
 * ==========================================
 * SISTEMA ECOLÓGICO E REALISTA DE ÁRVORES
 * ==========================================
 *
 * Este módulo substitui o sistema estático de árvores do jogo por uma simulação
 * biológica e ambiental. As árvores agora possuem necessidades vitais e
 * fornecem benefícios reais ao ecossistema do mundo (Serviços Ambientais).
 */

class CelulaSolo {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.umidade = 50; // Quantidade de água no solo (0 a 100)
    this.nutrientes = 50; // Matéria orgânica/minerais (0 a 100)
    this.firmeza = 10; // Previne erosão (aumenta com raízes)
    this.temperatura = 25; // Temperatura local em Celsius
    this.qualidadeAr = 50; // Pureza do ar na região
  }
}

class ArvoreRealista {
  constructor(x, y, especie = 'carvalho') {
    this.x = x;
    this.y = y;
    this.especie = especie;

    // Status Biológico
    this.idade = 0; // Dias de vida
    this.estagio = 'semente'; // semente, broto, jovem, adulta, ancia, morta
    this.saude = 100; // 0 a 100

    // Reservas Internas
    this.aguaInterna = 10;
    this.nutrientesInternos = 10;

    // Características Físicas (crescem com a árvore)
    this.tamanhoRaiz = 1; // Afeta área de absorção e firmeza do solo
    this.tamanhoCopa = 1; // Afeta fotossíntese, sombra e queda de folhas
  }

  // Chamado a cada ciclo (ex: ao dormir / virar o dia no jogo)
  cicloDiario(mapa, clima) {
    if (this.estagio === 'morta') {
      this.decompor(mapa);
      return;
    }

    const soloAtual = mapa.obterSolo(this.x, this.y);

    this.absorverRecursos(soloAtual);
    this.realizarFotossintese(clima);
    this.impactarAmbiente(soloAtual);
    this.crescer();
    this.verificarSobrevivencia();
  }

  absorverRecursos(solo) {
    // 1. Necessidade de Água: Absorve umidade do solo pelas raízes
    let capacidadeAgua = this.tamanhoRaiz * 2;
    if (solo.umidade > 0) {
      let absorvido = Math.min(capacidadeAgua, solo.umidade);
      solo.umidade -= absorvido;
      this.aguaInterna += absorvido;
    }

    // 2. Necessidade de Nutrientes (Nitrogênio, Fósforo, etc)
    let capacidadeNutrientes = this.tamanhoRaiz * 1.5;
    if (solo.nutrientes > 0) {
      let absorvido = Math.min(capacidadeNutrientes, solo.nutrientes);
      solo.nutrientes -= absorvido;
      this.nutrientesInternos += absorvido;
    }
  }

  realizarFotossintese(clima) {
    // Consome água e nutrientes internos para gerar energia usando o sol
    if (clima.sol > 0 && this.aguaInterna > 5 && this.nutrientesInternos > 2) {
      this.aguaInterna -= 5;
      this.nutrientesInternos -= 2;
      this.saude = Math.min(100, this.saude + 5);
    } else {
      // Déficit de recursos faz a árvore adoecer
      this.saude -= 10;
    }
  }

  impactarAmbiente(solo) {
    // BENEFÍCIO 1: Prevenção de Erosão (Raízes seguram a terra)
    solo.firmeza = Math.min(100, solo.firmeza + this.tamanhoRaiz * 0.5);

    // BENEFÍCIO 2: Evapotranspiração (Resfria o ambiente local)
    // A árvore libera parte da água retida como vapor
    if (this.aguaInterna > 20) {
      let vapor = this.tamanhoCopa * 0.5;
      this.aguaInterna -= vapor;
      solo.temperatura = Math.max(15, solo.temperatura - vapor * 0.2);
    }

    // BENEFÍCIO 3: Filtragem de Ar (Fotossíntese libera oxigênio)
    solo.qualidadeAr = Math.min(100, solo.qualidadeAr + this.tamanhoCopa * 0.8);

    // BENEFÍCIO 4: Ciclagem de Nutrientes (Queda de folhas)
    // Matéria orgânica cai no solo virando Húmus/Adubo natural
    if (this.idade % 30 === 0 && this.estagio !== 'semente') {
      solo.nutrientes = Math.min(100, solo.nutrientes + this.tamanhoCopa * 2);
    }

    // BENEFÍCIO 5: Sombra e Retenção Hídrica
    // A sombra da copa protege o solo do sol escaldante, retendo umidade
    let reducaoEvaporacao = this.tamanhoCopa * 0.1;
    solo.umidade = Math.min(100, solo.umidade + reducaoEvaporacao);
  }

  crescer() {
    // Se a árvore estiver saudável, ela envelhece e cresce fisicamente
    if (this.saude > 80) {
      this.idade++;
      this.tamanhoRaiz += 0.05;
      this.tamanhoCopa += 0.05;

      // Evolução biológica dos estágios de vida
      if (this.idade > 10 && this.estagio === 'semente') this.estagio = 'broto';
      else if (this.idade > 30 && this.estagio === 'broto') this.estagio = 'jovem';
      else if (this.idade > 100 && this.estagio === 'jovem') this.estagio = 'adulta';
      else if (this.idade > 300 && this.estagio === 'adulta') this.estagio = 'ancia';
    }
  }

  verificarSobrevivencia() {
    // Árvore morre por falta de recursos (saúde 0) ou velhice extrema
    if (this.saude <= 0 || this.idade > 500) {
      this.estagio = 'morta';
    }
  }

  decompor(mapa) {
    // BENEFÍCIO 6: Decomposição
    // Quando morre, a madeira podre devolve uma carga maciça de nutrientes à terra
    const solo = mapa.obterSolo(this.x, this.y);
    solo.nutrientes = Math.min(100, solo.nutrientes + 50);
    this.removida = true; // Sinaliza para o mapa remover a entidade
  }
}

class MapaEcologico {
  constructor(largura, altura) {
    this.largura = largura;
    this.altura = altura;
    this.matrizSolo = [];
    this.arvores = [];

    // Inicializa o grid de solo
    for (let x = 0; x < largura; x++) {
      this.matrizSolo[x] = [];
      for (let y = 0; y < altura; y++) {
        this.matrizSolo[x][y] = new CelulaSolo(x, y);
      }
    }
  }

  obterSolo(x, y) {
    if (x >= 0 && x < this.largura && y >= 0 && y < this.altura) {
      return this.matrizSolo[x][y];
    }
    return new CelulaSolo(x, y); // Fallback para bordas
  }

  plantarArvore(x, y) {
    this.arvores.push(new ArvoreRealista(x, y));
  }

  processarDia(clima) {
    // Chuva reabastece a umidade global do solo
    if (clima.chovendo) {
      for (let x = 0; x < this.largura; x++) {
        for (let y = 0; y < this.altura; y++) {
          this.matrizSolo[x][y].umidade = Math.min(100, this.matrizSolo[x][y].umidade + 30);
        }
      }
    }

    // Cada árvore interage com o ecossistema
    this.arvores.forEach((arvore) => arvore.cicloDiario(this, clima));

    // Limpa árvores que apodreceram e sumiram
    this.arvores = this.arvores.filter((a) => !a.removida);
  }
}

let ecoTrees = new Map(),
  ecoStarted = false;

const ECO_ESP = { meadow: 'carvalho', moss: 'bétula', orchard: 'macieira', flower: 'cerejeira', autumn: 'bordo' };

const ecoFirm = new Float32Array(HN).fill(10),
  ecoTemp = new Float32Array(HN).fill(25),
  ecoAr = new Float32Array(HN).fill(50);

// adaptador: expõe a célula do jogo (sm/nut em 0-1) na escala 0-100 do módulo, sem copiar dados
function ecoCell(i) {
  const c = {};
  Object.defineProperties(c, {
    umidade: {
      get: () => sm[i] * 100,
      set: (v) => {
        sm[i] = Math.max(0, Math.min(1, v / 100));
      },
      enumerable: true,
    },
    nutrientes: {
      get: () => nut[i] * 100,
      set: (v) => {
        nut[i] = Math.max(0, Math.min(1, v / 100));
      },
      enumerable: true,
    },
    firmeza: {
      get: () => ecoFirm[i],
      set: (v) => {
        ecoFirm[i] = v;
      },
      enumerable: true,
    },
    temperatura: {
      get: () => ecoTemp[i],
      set: (v) => {
        ecoTemp[i] = v;
      },
      enumerable: true,
    },
    qualidadeAr: {
      get: () => ecoAr[i],
      set: (v) => {
        ecoAr[i] = v;
      },
      enumerable: true,
    },
  });
  return c;
}

const ecoMapa = { obterSolo: (x, y) => ecoCell(y * MW + x) };

// mantém um ArvoreRealista para cada tile com árvore; remove as que foram cortadas
const ecoSync = extensible(function ecoSync() {
  const primeira = !ecoStarted;
  for (let i = 0; i < HN; i++) {
    if (obj[i] !== TREE) {
      if (ecoTrees.has(i)) ecoTrees.delete(i);
      continue;
    }
    if (ecoTrees.has(i)) continue;
    const tx = i % MW,
      ty = (i / MW) | 0,
      a = new ArvoreRealista(tx, ty, ECO_ESP[treeRegion(tx, ty)] || 'carvalho');
    if (primeira) {
      a.idade = 150;
      a.estagio = 'adulta';
      a.tamanhoRaiz = 3;
      a.tamanhoCopa = 3;
      a.aguaInterna = 40;
      a.nutrientesInternos = 30;
    } // árvores do mundo inicial já são adultas
    else {
      a.aguaInterna = 60;
      a.nutrientesInternos = 40;
    } // reserva da semente: sem ela a muda morre de déficit antes de a raiz crescer (testado)
    ecoTrees.set(i, a);
  }
  ecoStarted = true;
});

const ecoDaily = extensible(function ecoDaily() {
  ecoSync();
  const clima = { sol: Math.max(0, sunInfo(12).day || 0), chovendo: clouds.length > 0 };
  for (const [i, a] of Array.from(ecoTrees)) {
    a.cicloDiario(ecoMapa, clima);
    if (a.estagio === 'morta') {
      a.decompor(ecoMapa);
      ecoTrees.delete(i);
      if (obj[i] === TREE) obj[i] = 0;
    } // morta: devolve nutrientes ao solo e vira matéria orgânica
  }
});

const ecoPack = extensible(function ecoPack() {
  return Array.from(ecoTrees, ([i, a]) => [
    i,
    a.idade,
    a.estagio,
    +a.saude.toFixed(2),
    +a.aguaInterna.toFixed(2),
    +a.nutrientesInternos.toFixed(2),
    +a.tamanhoRaiz.toFixed(3),
    +a.tamanhoCopa.toFixed(3),
    a.especie,
  ]);
});

const ecoLoad = extensible(function ecoLoad(d) {
  ecoTrees = new Map();
  if (!Array.isArray(d)) return;
  for (const r of d) {
    const a = new ArvoreRealista(r[0] % MW, (r[0] / MW) | 0, r[8]);
    a.idade = r[1];
    a.estagio = r[2];
    a.saude = r[3];
    a.aguaInterna = r[4];
    a.nutrientesInternos = r[5];
    a.tamanhoRaiz = r[6];
    a.tamanhoCopa = r[7];
    ecoTrees.set(r[0], a);
  }
  ecoStarted = true;
});

/** Atualiza `ecoTrees` a partir de outros módulos (as ligações importadas são somente leitura). */
export function setEcoTrees(value) {
  ecoTrees = value;
  return value;
}

/** Atualiza `ecoStarted` a partir de outros módulos (as ligações importadas são somente leitura). */
export function setEcoStarted(value) {
  ecoStarted = value;
  return value;
}

export { ArvoreRealista, ecoDaily, ecoLoad, ecoPack, ecoStarted, ecoSync, ecoTemp, ecoTrees };
