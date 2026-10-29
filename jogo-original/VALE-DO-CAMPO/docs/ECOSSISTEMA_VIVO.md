# Ecossistema vivo — comportamento animal, presa-jogador e indicadores

Resumo técnico do que foi acrescentado ao Vale do Campo. Nada de paralelo foi criado: os sistemas existentes
(`entities/wild/*`, `entities/farm/Chickens.js`, `Renderer`) foram estendidos; os módulos novos só concentram o que
antes estava espalhado (percepção, parâmetros, indicadores).

## Módulos

| Arquivo | Papel |
|---|---|
| `src/config/ecosystem.js` | Todos os parâmetros: `ECO` (por espécie), `ATTN` (atenção por atividade), `HUNT`, `PLAYER_PREY`, `CAMO`, `CHICKEN`, `MEM`, `STATUS_COLORS`, `STATUS_LAYOUT` e funções puras testáveis. |
| `src/entities/ai/Perception.js` | Percepção (visão com cone/oclusão/camuflagem, audição, olfato), memória curta com validade, trava de caça ao jogador (`claimPlayerHunt`), efeitos no jogador (`playerSlow`). Roda a 4 Hz, escalonado por `id`. |
| `src/entities/PlayerHurt.js` | Porta única de dano ao jogador; reaproveita vida (`S.energy`), desmaio e respawn existentes. |
| `src/rendering/AnimalStatus.js` | Barras de fome/sede e idade acima de cada animal (billboard). |
| `tests/systems/ecosystem.test.js` | 19 testes unitários das funções puras. |
| `tests/browser/ecosystem-{a,b,c,d}.mjs` | Cenários no jogo real (Chromium/Playwright, laço parado, tempo avançado à mão). |

## Mapeamento de estados

Os estados existentes foram adaptados, não substituídos:

| Estado genérico | Estados do código |
|---|---|
| Parado / Explorando / Descansando | `idle` / `forage`, `walk` / `rest` |
| Alerta / Investigando | `alert` / `investigate`, `pinvest` |
| Observando (predador saciado) | `observe` |
| Espreitando | `stalk`, `pstalk` |
| Perseguindo | `chase`, `pchase` |
| Atacando | `fight`, `pounce`, `pattack`, `pstrike`, `strike`, `constrict` |
| Fugindo / escondendo | `flee`, `fly`, `hide` |
| Defendendo | `warn`, `charge` |
| Recuperando | `pant`, `recover` |
| Novos | galinha `vigia`; tetraz `display` (exibição); sucuri `phold` (bote no jogador) |

Histerese: duração mínima por estado, `cd` (cooldown) após desistir e `canSwitch` evitam oscilar caça↔fuga.

## Regras principais

- **Fome ≠ oportunidade.** O predador pondera fome, vulnerabilidade da presa, distância e custo; saciado observa e só
  às vezes persegue. Observar, espreitar e atacar são decisões separadas.
- **Presa percebe antes do dano.** Distância, linha de visão, movimento, ruído e vento/cheiro; reação:
  parar de comer → alerta → observar → fugir → esconder → avisar → retomar.
- **Sem onisciência.** Só se age sobre quem foi detectado; a memória guarda ≤3 itens e expira (`MEM`).
- **Energia e desistência.** Sem perseguir através de paredes/cercas; sem alvo, investiga a última posição por tempo
  limitado (`pinvest`) e então desiste.
- **Jogador como presa.** Onça: aproximação furtiva, arrancada acima da corrida do jogador, interceptação, desiste;
  um único caçador por vez (`claimPlayerHunt`). Sucuri: camuflagem no ambiente (não é invisibilidade), bote com
  telégrafo de 0,5 s, perde a camuflagem ao mover/atacar, reavalia depois de errar. Dano usa o sistema de vida existente.
- **Galinha.** Alimentar, explorar, vigiar (`vigia`), grito de alarme que alerta o bando (`herdAlarm`), fuga. A
  detecção da raposa passou de 50 px fixos para visão por percepção (~89–117 px).
- **Tetraz.** Vigia, exibição (`display`, macho adulto, pouco faminto) e resposta a ameaça.

## Indicadores

Barras de fome e sede + idade compacta (`fmtAge`, `lifeStage`) sobre cada animal, com dados reais (`hun`/`thi`/`age`;
galinha via `satToNeed`). Contraste mínimo 4,7:1; visíveis até ~6 blocos (`showR`), com esmaecimento; escondidos
quando ocluídos ou mortos; controle de sobreposição; atualização limitada; sem vazamento de recursos.

## Como rodar os testes

```bash
npm test                                               # unitários
NODE_PATH=$(npm root -g) node tests/browser/ecosystem-a.mjs   # cenários 1–10
NODE_PATH=$(npm root -g) node tests/browser/ecosystem-b.mjs   # cenários 11–19 (jogador como presa)
NODE_PATH=$(npm root -g) node tests/browser/ecosystem-c.mjs   # cenários 20–31 (indicadores)
NODE_PATH=$(npm root -g) node tests/browser/ecosystem-d.mjs   # galinha, tetraz, lebre
```

As simulações são estatísticas (várias repetições por semente) e **não** reproduzíveis bit a bit no harness.

## Limitações conhecidas

- Raposas da fazenda (`FarmFoxes.js`) não têm fome/idade/sede: não mostram indicador.
- Em aglomerados (≥12 animais em ~30 px) alguns indicadores são omitidos por falta de espaço.
- A âncora do bloco fica 6–14 px acima do sprite para onça, sucuri e vaca.
- Javali e onça territorial mantêm o comportamento original de não desmaiar o jogador.
- Jogo real não foi jogado nem o `vite build` / `test:regression` rodados (sem rede / Vite ausente).
