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

## Predadores mais fortes, camuflagem no mato e fome (revisão)

Valores em `config/ecosystem.js` (`ECO`, `HUNT`, `PLAYER_PREY`, `CAMO`, `aggression`/`huntFor`) e `config/plants.js` (`COBERTURA`).

- **Esconderijo no mato alto.** A cobertura de um tile vem da fase da planta (`COBERTURA = [0, .12, .3, .7, 1]`). Onça parada ou espreitando no
  mato fechado (fase 4) quase some (camuflagem até 0,7; no teste, à vista em 40/40 no chão limpo e 0/40 no mato fechado). A sucuri
  usa a mesma cobertura (camuflagem de mato até 0,84; água 0,88). Em chão aberto a presa vê a onça espreitando de longe e foge cedo: sem cobertura, a caça falha.
- **Faro da onça.** Sente qualquer presa a até 420 px (80 % disso atrás de árvores), mesmo saciada, e o jogador a até 270 px só com fome. O faro serve para
  ENCONTRAR a presa (ir até onde ela estava); acompanhá-la na corrida exige ver, ouvir ou estar a ≤ 150 px.
- **Presas fogem.** O raio de medo de uma onça visível passeando subiu (cervo 150 px, antes 60) e, diante da onça, a presa foge a 95 % do raio em vez de ficar de
  "alerta". Cervo, lebre, galo-lira e queixada também **sentem** a onça de perto (`ECO[sp].nose`, metade quando ela espreita), mesmo escondida no mato.
- **Sucuri trava o jogador.** O bote acerta e a constrição prende por 5 s: o jogador **não anda** (`holdSlow: 0`), perde 12 de vida por segundo (`holdBite`) e o
  toque em **Usar** (se debater) afrouxa o aperto em 0,5 s por toque (~10 toques). Solto, ela não prende de novo por 4 s (`freeT`). Bote de 20 de vida.
- **Onça mais forte.** Mordida 18 (intervalo 0,75 s), corrida 94 px/s (1,2× a corrida do jogador), e **salto**: a ≤ 36 px ela se lança a 320 px/s por 0,22 s na direção
  onde o jogador ESTAVA ao saltar (um passo de lado no ar a faz errar), derruba por 0,7 s e morde. Quem reage cedo à espreita escapa (~80 %); depois
  que ela arranca, a chance é de ~30 % com fome moderada e ~0 % com fome alta.
- **Fome → agressividade** (`aggression(hun)`: 0 até 35 % de fome, 1 em ~90 %). Faminta ela quase só caça (pesos do plano de ação), enxerga oportunidade
  em mais presas e de mais longe (`scanR` ×1,5), aceita mais risco, persiste mais (perseguição ×1,6, fôlego +15 %), descansa até 75 % menos entre tentativas
  e caça o jogador a qualquer hora. Saciada, o comportamento é o de antes.

## Picadas, desmaio, coração e renascimento

- **Muitas picadas de abelha derrubam o personagem** (`stingPlayer` em `PlayerHurt.js`, regras puras em `systems/Vitals.js`): 14 ferroadas em 25 s. Ele
  fica **deitado** onde caiu por **6 horas de jogo** (o tempo corre 8× mais rápido durante o desmaio: ~45 s reais) e acorda com pelo menos 40 de vida e de estamina.
  Enquanto isso não anda nem age, as abelhas se acalmam e **os animais o enxergam, ouvem e cheiram 2,6× mais longe** (`KO_RANGE`) e o tratam como presa
  indefesa (a onça avalia `vPrey` ≈ 0): no teste, uma onça a 330 px o percebe em 6 de 6 vezes; em pé, em 0 de 6. Dormir ou morrer cancela o desmaio.
- **Coração batendo** (`systems/audio/Heartbeat.js`): com a vida **abaixo de 40%** toca um "tum-tum" grave que, a cada ponto de vida perdido, fica mais rápido
  (64 → 170 batimentos/min) e mais forte (`heartbeat(vida)` em `Vitals.js`). Silêncio acima de 40% e com vida zero. O ritmo usa o relógio real.
- **Onça sem recuo.** O estado `retreat` (a onça correndo para longe ao ficar perto de gente) foi removido: predador não foge do jogador.
- **Morreu, renasce em casa.** Ao morrer (animal ou lobisomem), o personagem renasce **dentro da casa, ao lado da cama** (`respawnInHouse`), de vida cheia, no dia seguinte.

## Animais da fazenda como presas (vaca, bezerro, galinha)

Antes só as duas "raposas da fazenda" (um sistema à parte, que saía da mata ao entardecer) pegavam galinhas, e a vaca não podia ser ferida. Agora **todos os
predadores usam as mesmas regras de sempre** (percepção, camuflagem, fome, espreita, bote, luta, comer) e os animais da fazenda entram na lista de presas
por meio de um "espelho" (`entities/farm/FarmPrey.js`):

| Predador | Come | Condição |
|---|---|---|
| Onça | bezerro; vaca adulta | bezerro com fome ≥ 0,30; vaca só com fome ≥ 0,55 (e vacas juntas, até 50 px, protegem: ≥ 2 vizinhas afastam a onça não muito faminta) |
| Sucuri | bezerro e galinha | só na beira da água |
| Raposa (a comum, selvagem) | galinha | por percepção e fome, como lebre e galo-lira |

- **Morte de verdade.** A vaca morta sai do rebanho (o jogo já tinha esse caminho: `dead` + `bReap`, que também faz a carcaça e devolve matéria ao solo; se morrer a
  vaca fundadora, o próximo animal assume o lugar). A galinha sai do galinheiro e deixa penas e corpo no chão. O rebanho nunca fica sem nenhum animal: com só 1
  vaca/boi, nenhum predador a escolhe. O predador come ali mesmo (a onça não arrasta animais da fazenda).
- **Medo.** Vacas, bezerros e galinhas percebem os predadores (`FARM_FEAR`, mesma percepção dos selvagens), fogem e o grupo ao redor foge junto; durante um
  ataque o animal fica parado até a luta acabar. A galinha só repara na raposa de bem perto (a raposa chega esgueirando, e no mato alto some: camuflagem).
- **Proteção.** Cercas continuam barrando os predadores e a luz do dia/de perto os afasta, como com os selvagens.
- A "raposa da fazenda" (`FarmFoxes.js`) **não é mais criada**: ao entardecer não surge nada especial. O módulo ficou só para limpar raposas de saves antigos.

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

## A sucuri com a folha nova e a barriga que estica

A sucuri é desenhada com a folha de sprites que o dono do jogo mandou (`tools/anaconda/folha-sucuri.jpg`, de onde `python3 tools/anaconda/make-anaconda.py` tira
`public/assets/sprites/animals/anaconda.webp`: xadrez, sombras e o risco roxo das legendas saem, e a cobra é reduzida a 128 px). A folha traz **deslizando para a esquerda e para a
direita** (2 quadros cada), **enrolada de frente** e **enrolada com a cabeça levantada** (4 quadros cada). O jogo (`entities/wild/Anaconda.js`, `anaPose`) escolhe a pose pelo estado:

| Estado | Pose |
|---|---|
| anda, engole, digere (meio da digestão) | deslizando; para cima e para baixo o mesmo quadro **gira 90 graus** em volta da cabeça |
| parada, apertando o jogador | enrolada de frente (virada para a direita é o quadro espelhado) |
| `coil` (aviso do bote) | enrolada com a cabeça levantada, tremendo |
| bote | levantada, depois o corpo estica em 3 passos (55%, 90%, 100% do comprimento) |
| nadando | deslizando com a cor da água por cima; escondida: só a cabeça (círculo de 9 px) |
| fim da digestão | enrolada, a cobra inteira 1 + 0,35 x barriga maior |

**Barriga que estica:** em vez de círculos pintados por cima do corpo (como era), o próprio desenho é cortado em colunas (`anaStretch`) e as colunas ao redor da presa ficam
mais altas e mais largas: o corpo **engrossa até 2x e alonga até ~13 px** com a presa maior (queixada), as manchas esticam junto e a pele fica um pouco mais clara.
`a.bk` (0 a 1) é o tamanho da presa e `a.bp` a posição da barriga (fração do corpo a partir da cabeça: 0,06 ao começar a engolir, até 0,36 ao terminar, e
0,34 a 0,61 enquanto digere). O desenho esticado é guardado por sucuri e só refeito quando o tamanho, a posição da barriga ou o quadro mudam; desenhar uma sucuri esticada custa ~0,2 ms no navegador de teste (Canvas, sem GPU).

**Para ver:** abra o jogo com `?sucuri` no fim do endereço. Uma sucuri aparece na frente do jogador e engole uma presa depois da outra, sem camuflagem. Com `?debug`, `anaDemo()`
no console faz o mesmo. Teste: `tests/browser/sucuri.mjs`.
