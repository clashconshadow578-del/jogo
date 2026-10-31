# Plano de migração: Canvas 2D → PixiJS (WebGL)

Escrito em português simples, para quem não programa. Baseado na leitura real do código (`src/`, ~110 módulos,
34 mil linhas) e nos documentos que já existiam em `docs/` (`PIXI-PLANO.md`, `DESEMPENHO.md`).

## 1. Onde estamos hoje (a boa notícia)

- O jogo **já é modular** (não é mais um arquivo único) e **já usa Vite**.
- Já existem testes: 97 testes automáticos passam, e há um teste que compara o jogo pixel a pixel com o original
  (`legacy/Vale_do_Campo_V64.html`). Isso é a nossa rede de segurança.
- **Lógica e desenho já estão separados em pastas**: `world/`, `entities/`, `systems/`, `core/` (lógica) e `rendering/` (desenho).
  A separação não é perfeita (veja a seção 3), mas é um bom ponto de partida.
- Ponto de volta: a etiqueta Git `backup-original-v64` guarda o projeto exatamente como estava.

## 2. Phaser ou PixiJS? Escolha: **PixiJS**

| | PixiJS | Phaser 3 |
|---|---|---|
| O que é | Só o **desenho** (rápido, via GPU) | Um jogo completo (desenho + laço + entrada + áudio + física + cenas) |
| Seu jogo já tem | laço, teclado/toque, som (sintetizado), save, física própria | — |
| Esforço | Troca só a parte de desenho | Obriga a reescrever quase tudo para o "jeito Phaser" |
| Risco | Baixo | Alto (59→110 módulos mexidos) |

Seu jogo já tem seu próprio "motor". Phaser traria outro motor por cima do seu. O PixiJS substitui só os pincéis.

## 3. O que o código faz hoje (números reais)

O desenho acontece em ~50 arquivos que importam o `ctx` (o "pincel" do Canvas) de `rendering/Canvas.js`:

| Chamada de Canvas | Quantas vezes no código |
|---|---|
| `fillStyle` / `fillRect` (retângulos coloridos, usados para pixel art) | ~290 cada |
| `beginPath`, `fill`, `arc`, `ellipse`, `lineTo` (formas) | ~200 |
| `globalAlpha`, `globalCompositeOperation` (transparência, luz "aditiva") | ~72 |
| `drawImage` (imagens/sprites) | ~53 |
| `save/restore/translate/scale/rotate/setTransform` | ~100 |
| Gradientes (luz, vinheta), `clip`, texto | ~30 |

Arquivos que mais desenham (os "candidatos"): `TileRenderer` (chão), `AmazonRender`, `MapUI` (mapa, fica em Canvas), `Carcass`,
`Bees`, `GrassSystem` (grama), `LightingSystem` (luz), `Torch`, `Trees`, `Fluvial`/`Hydrology` (rios), `ShadowSystem`.

A ordem de um quadro (`Renderer.js`; desde a Fase 4 a função `render` só chama 3 passes, nesta ordem; ver seção 15):
1. `passGround`: fundo + chão tile a tile (`drawTile`, `drawTrampledGrass`, `drawHydro`), relevo, pegadas, água
2. `collectEntities` + `passEntities`: entidades ordenadas por Y (árvores, plantas, animais, vaca, galinhas, NPCs, jogador), com o mato cobrindo os pés
3. `passFinish`: poeira, respingos, iluminação/névoa, balões, vaga-lumes, clima, raios de sol, brilho, relâmpago e vinheta

## 4. Por que NÃO fazer uma "tradução" completa de Canvas para Pixi

A ideia de um adaptador que traduz *todas* as chamadas de Canvas para WebGL parece segura, mas:

- O jogo faz milhares de `fillRect` pequenos por quadro. Traduzir cada um para o Pixi é **mais lento** que o Canvas atual
  (cada retângulo viraria um objeto). O jogo ficaria pior, não melhor.
- Gradientes, `clip`, `globalCompositeOperation` não têm equivalente direto: cada um viraria um caso especial cheio de risco visual.
- O ganho real do WebGL só aparece quando o chão e a grama viram **objetos de GPU** (sprites/texturas), não quando os mesmos
  retângulos são repassados um a um. (Isso já estava dito em `docs/PIXI-PLANO.md`.)

**Então o adaptador será mais esperto: ele vira uma "tomada" (interface) por camada.** Cada camada do jogo (chão, grama, entidades, luz...)
tem hoje uma função que desenha. Vamos fazer cada camada poder ser desenhada de **dois jeitos**: o atual (Canvas) ou o novo (Pixi),
escolhido por um interruptor. O Canvas continua sendo o padrão e o plano B.

## 5. Regras de segurança (valem em todas as fases)

1. **Interruptor `?pixi` na URL.** Sem ele, o jogo roda como hoje. Só viramos o padrão quando todas as fases passarem.
2. **Volta automática ao Canvas** se o aparelho não suportar WebGL.
3. **Um sistema por vez**, um commit por fase. Se quebrar: `git revert` do commit (1 segundo) ou voltar para `backup-original-v64`.
4. **Após cada fase, rodar:** `npm test` (97 testes), `npm run build` e o teste de regressão visual (compara pixels com o original).
5. **Você testa no celular** pelo link de preview antes de eu passar para a próxima fase.
6. Nada de mudar regras do jogo (animais, save, clima). Só a forma de desenhar.

## 6. Fases

| Fase | O que muda | Risco | Como saber que deu certo |
|---|---|---|---|
| **0 — Preparação** *(feita)* | Vite funcionando, `package.json` recriado, `pixi.js` instalado (ainda não usado), backup etiquetado | Nenhum | Build ok, 96 testes ok, jogo abre sem erro |
| **1 — Tomada de desenho** *(feita)* | Criar `rendering/pixi/` com a "tomada": inicia o Pixi atrás do `?pixi`, com plano B em Canvas. **O jogo ainda desenha tudo em Canvas** | Muito baixo | Com e sem `?pixi` a imagem é idêntica |
| **2 — Chão (tiles)** *(feita, experimental: só com `?pixi`)* | A grama parada do chão vira textura na GPU (`TileRenderer`, `GrassSystem` parte parada) | Médio | Lógica idêntica (0 pixels); com WebGL, diferenças mínimas no navegador de teste; **FPS ainda não medido no celular** |
| **3 — Mato em imagens prontas** *(feita, mas DESLIGADA por padrão até medir no celular: `?matocache` liga; ver seções 13 e 14)* | `Vegetation.drawMato`: cada tile de mato vira uma imagem pequena, refeita só quando o vento muda a inclinação das lâminas | Baixo | **Idêntico, pixel a pixel** (133 quadros) e 21-37% menos chamadas de desenho por quadro |
| **4 — Passes de desenho** *(feita)* | `render()` dividido em 3 passes (`passGround`, `passEntities`, `passFinish`), cada um com plano B em Canvas: é a "tomada" por camada da seção 4. Nenhum pixel muda | Muito baixo | Idêntico: regressão visual com os mesmos números nos 4 cenários; 24 posições da câmera com 0 diferenças (seção 15) |
| **5 — Entidades** *(feita: separação)* | A coleta das entidades foi para `rendering/Entities.js` e o desenho das árvores para `rendering/TreeRenderer.js`, fora do `Renderer.js` e da lógica. **Sprites do PixiJS para as entidades: não feitos** (seção 19) | Muito baixo | Idêntico (seção 16) |
| **6 — Luz e névoa** *(feita: etapas)* | O acabamento do quadro virou 4 etapas extensíveis (luz, sobreposições, céu, vinheta). A luz continua em Canvas | Muito baixo | Idêntico (seção 17) |
| **7 — Sombras, relevo e água** *(feita: camadas)* | Chão, relevo, água, sombras, margens e entidades viraram camadas extensíveis. Nenhum desenho foi trocado (no celular essas camadas custam quase nada, seção 14) | Muito baixo | Idêntico (seção 18) |
| **8 — Limpeza e padrão** *(feita)* | Padrão decidido pelos dados: **continua Canvas 2D**; o PixiJS fica como opção (`?pixi`). Chave experimental `?cpu`. Plano e README fechados (seção 19) | Baixo | Seção 19 |

A interface (HUD, inventário, menus) já é HTML/CSS e **não muda**. O `MapUI` (mapa) pode ficar em Canvas.

## 7. Separar lógica de desenho (o que atrapalha hoje)

Alguns arquivos de lógica também desenham (ex.: `Carcass.js`, `Chickens.js`, `Fishing.js`, `Anaconda.js`, `Bees.js`). Em cada fase,
a função `draw...` desses arquivos é movida para uma pasta `rendering/` correspondente, sem alterar a lógica. Os "fornecedores de entidades"
(`entityProviders` em `Renderer.js`) já guardam a ordem Y e a função de desenhar, e serão o ponto de encaixe da Fase 5. Hoje cerca de 40
arquivos fora de `rendering/` ainda importam o `ctx` e desenham por conta própria; os maiores são `Bees`, `GrassSystem`, `Carcass`, `WaterSystem`,
`Vegetation`, `RiverFlow`, `Fauna`, `Trees`, `Player`, `FallenLogs`, `Hydrology`, `Chickens`, `Fishing`.

## 8. Como rodar e testar

```bash
npm install          # uma vez
npm run dev          # servidor com atualização instantânea (porta 5173)
npm test             # 97 testes
npm run build        # gera a pasta dist/ (a que vai para o Netlify)
```

**No celular, pelo Codespace:** rode `npm run dev`, abra a aba **Portas** do Codespace, ache a porta 5173 e toque no ícone de globo
(abrir no navegador). Se for pedido, deixe a porta como **Pública** para abrir no celular.

## 9. Riscos conhecidos

- Cache do chão desligado de propósito pelo autor original (a tela piscava em algumas placas de vídeo). Precisa teste em aparelhos reais.
- Os testes de imagem rodam sem placa de vídeo real; só o seu celular dirá o FPS verdadeiro.
- O estilo "pixel art nítido" exige configurar o Pixi sem suavização (`scaleMode: 'nearest'`) e sem arredondar posições em subpixel.

## 10. Referência dos testes de imagem (antes da Fase 2)

`npm run test:regression -- basic` já mostra diferenças contra o original, **de propósito** (a grama e os saves foram alterados depois da
migração). Por isso, a regra para as próximas fases é: **os números de pixels diferentes devem continuar exatamente iguais** (ou, no
caso da Fase 2 em diante, só mudar dentro do que combinarmos).

Referência medida na Fase 1 (idêntica com e sem a ponte do PixiJS): `00_start` 153258 · `01_idle60` 153114 · `02_walk_right` 170478 ·
`03_walk_down` 172805 · `04_diag` 160039 · `05_action` 160611 · `06_inventory` 122904 · `07_map` 1544 · `08_later` 155100.

Para rodar esse teste é preciso o Playwright (`npm install --no-save playwright`) e o navegador Chromium.

## 11. Fase 1 (feita): o que foi criado

- `src/rendering/pixi/PixiBridge.js`: com `?pixi` na URL, liga o PixiJS (WebGL) fora da tela; sem `?pixi`, não faz nada e nem baixa o PixiJS.
  Se o WebGL falhar, só avisa no console e o jogo segue em Canvas 2D.
- `tests/core/pixiBridge.test.js`: teste do interruptor. Total de testes: 97.
- Como conferir no navegador: abra `?pixi` e, no console, `window.VDC_PIXI.renderer` deve mostrar `webgl`.

## 12. Fase 2 (feita, experimental): o que foi criado e o que foi provado

**O que muda com `?pixi`:** o PixiJS guarda a imagem pronta da grama parada (`fuseLayer`, 1600x1600) como textura na placa de vídeo, desenha o
trecho visível de uma vez e o resultado é copiado para o canvas do jogo **só nos tiles escolhidos**. Todo o resto continua em Canvas 2D e a
imagem final ainda é montada pelo Canvas (a ponte é "híbrida"). Sem `?pixi` o jogo roda exatamente como antes. Funciona onde o modo de grama
parada está ligado (celular ou `?idle`); no PC comum o jogo não usa essa camada, então não muda nada.

**Quais tiles o PixiJS cobre** (`pixiPlanTiles` em `TileRenderer.js`): grama parada, sem água em volta, fora do brejo, e **sem nenhum vizinho
desenhado antes** (esquerda, cima-esquerda, cima, cima-direita) que possa "vazar" sobre ele (grama pisoteada, mudas, sementes). Nos demais, o
desenho antigo continua valendo.

**O que foi provado** (`tests/perf/pixi-equal.mjs`, 3 execuções do mesmo jogo, ~50 quadros: posições aleatórias, cantos do mapa e andando):
- Lógica (`?pixi&pixi2d`, mesma lógica, cópia direta, sem WebGL): **0 pixels diferentes**.
- Imagem do PixiJS em si: igual à imagem pronta, **0 pixels diferentes** (cópia lida de volta e comparada).
- Com WebGL de verdade (`?pixi`), no Chromium **sem placa de vídeo**: os quadros em que o canvas do jogo recebe a imagem do WebGL
  ficam com diferenças pequenas (pior caso medido: ~7% dos pixels, mais de 90% deles com **1 nível de 255**, máximo 9, mais a borda de
  1 pixel da tela); os quadros sem essa cópia saem **idênticos**. A causa não é a posição da grama (a lógica é exata): é esse navegador
  arredondar as camadas translúcidas de outro jeito depois de receber uma imagem do WebGL. **Isso precisa ser conferido no seu
  celular** (placa de vídeo real), tanto o visual quanto a fluidez. Passar a imagem por um canvas intermediário não resolveu.

**Cuidados descobertos no caminho** (valem para as próximas fases):
- O sistema de luz só recalcula a cada 2-3 quadros e reaproveita o quadro anterior deslocado; por isso os testes ligam `window.LIGHT_FULL`.
- O ambiente de teste congela os relógios; o PixiJS só liga se o tempo andar (`__step`). Todas as execuções usam o mesmo aquecimento.
- Ligar o PixiJS **não** muda nada sozinho; o que muda a imagem é copiar do WebGL para o canvas do jogo.

**Ainda não medido:** se isso deixa o jogo mais rápido. O navegador de teste não tem placa de vídeo, então não serve para medir FPS. A cópia
WebGL -> Canvas pode custar o que a Fase 2 economiza; só o celular responde. Se não ajudar, a Fase 2 não vira padrão.

**Como testar no celular:** abra o jogo normal e depois com `?pixi` no fim do endereço (ex.: `...app.github.dev/?pixi`). Compare o visual
(deve ser igual) e a fluidez. No console (`window.VDC_PIXI.renderer`) deve aparecer `webgl`.

## 13. A medição que mudou a ordem das fases (e a Fase 3 feita)

**Por que medir:** a Fase 2 mostrou que mexer no chão rende pouco quando ele já está otimizado. Então, antes da Fase 3, contei quantas
chamadas de desenho (Canvas 2D) o jogo faz **por quadro** e **quem** as faz. Esse número independe da placa de vídeo: é o que pesa no
processador do celular. (Roteiro: instrumentar os métodos do contexto 2D e agrupar pelo arquivo/função que chamou; 40 quadros de média.)

| Parte do jogo | Fazenda | Rio | Floresta |
|---|---|---|---|
| **Mato** (`Vegetation.drawMato`) | **31%** | 24% | **43%** |
| Sombras de contato (`ShadowSystem`) | 20% | 22% | 19% |
| Água, umidade, poças, lago (`Hydrology`, `Puddles`, `LakeRenderer`) | 13% + 6% | **30%** | 15% |
| Relevo (`Relief`) | 11% | – | 19% |
| Tiles base (`TileRenderer`, o que a Fase 2 cobriu) | 12% | 8% | – |
| Total de chamadas por quadro | 3.956 | 4.959 | 4.038 |

A grama pisoteada (que seria a Fase 3) nem aparece entre os maiores. Por isso a Fase 3 passou a ser o **mato**, o maior de todos.

**Fase 3 (feita): mato em imagens prontas.** O mato é feito só de retângulos **opacos** de 1 pixel de largura, então cada tile vira uma imagem
pequena (28x26 px) copiada com 1 chamada no lugar de 3 a 13. A imagem só é refeita quando o vento muda a inclinação de alguma lâmina (um
número inteiro de pixels). Fica no desenho original (lâmina por lâmina) quando: o jogador está perto (o mato treme todo quadro), a inclinação
passa de 6 px, o desenho não é no canvas principal (cache do chão) ou há transparência/modo de mistura ligados. **Desligada por padrão**:
`?matocache` liga as imagens prontas (sem isso o jogo usa o desenho original, lâmina por lâmina).
- **Prova:** `tests/perf/ab-equal.mjs` (padrão: A = original, B = `&matocache`) compara o desenho original com o novo em 133 quadros (posições do mapa, vento de 0 a 4,5, 4 níveis de
  qualidade, andando, chuva e noite; ~520 tiles de mato por quadro): **0 pixels diferentes**. Estragando o código de propósito (imagem
  deslocada 1 px) o teste reprova todos os quadros, então ele detecta erro. O jogo normal também ficou idêntico aos registros anteriores.
- **Ganho medido** (chamadas de desenho por quadro): fazenda 3.956 → 2.884 (**-27%**), rio 4.959 → 3.928 (-21%), floresta 4.038 → 2.549 (**-37%**).
  Só o mato: 1.239 → 160, 1.183 → 152, 1.722 → 221.
- **Problema achado depois (e corrigido):** criar centenas de imagens pequenas de uma vez congelava o jogo por segundos ao entrar numa área
  nova (no navegador de teste: 3 s num quadro). Agora são criadas no máximo 24 por quadro; o resto sai pelo desenho original (idêntico), então
  a imagem continua exata. Mesmo assim o ganho **só vale se for medido no aparelho**: o número de chamadas cai, mas imagens pequenas podem
  custar mais que retângulos numa placa de vídeo real. Por isso o recurso fica desligado até o `?bench` (seção 14) mostrar que ajuda.
- **Não é PixiJS:** não precisa de WebGL, funciona sem `?pixi`. As imagens prontas são exatamente o tipo de recurso que o PixiJS usará nas
  fases seguintes (texturas/sprites em vez de desenhar tudo a cada quadro).

**Roteiro revisado (pelos dados):** 4 = sombras de contato + relevo + água/umidade (camadas translúcidas, estáticas na maior parte do tempo;
arredondamento de 1-2 níveis em vez de idêntico) · 5 = entidades (árvores, animais, jogador) como sprites do PixiJS · 6 = luz e névoa em shader
· 7 = PixiJS vira o padrão. A razão: o PixiJS ganha de verdade quando substitui **milhares de chamadas por quadro** por objetos que ficam na
placa de vídeo; as camadas que ainda são feitas de muitas chamadas pequenas (mato, sombras, relevo, água) vêm primeiro.

## 14. O que o celular ensinou, e o teste de desempenho no aparelho (`?bench`)

**Primeira medição real (celular do dono do jogo):** com o mato em imagens ligado o jogo rodava a **4 fps**. Com ele desligado (como está
agora por padrão) passou a **51 fps longe da casa e 25 fps em volta dela**. Lição: no celular, **muitas imagens pequenas e separadas custam
mais que muitos retângulos** (cada uma vira uma textura na placa de vídeo). Para imagens prontas valerem a pena elas precisam estar numa
**única textura grande e fixa** (um atlas), que é justamente o que o PixiJS faz bem. Por isso o mato em imagens fica **desligado**
(`?matocache` liga) até ser refeito assim.

**Próximo alvo:** em volta da casa o jogo cai para a metade (51 -> 25 fps). O `?bench` mede isso diretamente.

**1º teste real (celular com GPU Samsung Xclipse 530, tela 1464x534, DPR 1,54, 8 núcleos):**
- jogo padrão: **17 fps em todas as cenas** (~58 ms por quadro, com resolução e qualidade fixas no máximo); tempo de desenho em JavaScript ~19 ms;
- grama na GPU (fase 2) e cache do chão **reduzem o JavaScript** (-2 a -5 ms por quadro) mas **o fps não muda**: o gargalo **não** é o JavaScript;
- resolução x1 (4x menos pixels) **não ajuda**: não é a quantidade de pixels;
- o que mais pesa: luz e sombras do sol (~10 ms), entidades (~10 ms), clima/atmosfera (~4), água, sombras de contato e qualidade (~3 cada).
- Leitura provisória: o tempo vai para fora do JavaScript (placa de vídeo / driver, por **quantidade e tipo de operações**), sobretudo na luz
  (várias camadas auxiliares e `multiply`) e no desenho das entidades. As imagens do jogo pesam só 18,8 MB: não é falta de memória de textura.

**2º teste real (mesmo celular):** o quadro de ~60 ms se divide em **lógica 2,2 ms + desenho em JavaScript 19,2 ms + interface 0,1 ms =
21,5 ms de JavaScript**, e **38,3 ms (64%) de ESPERA** (o JavaScript parado esperando a placa de vídeo/tela). O micro-teste deu **60 fps
em Canvas 2D e em WebGL** para 2.200 operações misturadas, e cada tipo de operação sozinho também deu 60 fps: o Canvas 2D **não é lento em
geral** neste aparelho; o que trava é algo **específico do jogo**. Etapas (ms por quadro que cada uma custa): entidades 11,4 · luz 9,8 ·
raios e partículas 9,0 · clima e atmosfera 8,1 · qualidade 4,6 · água 3,3 · relevo, umidade e sombras de contato 1,5 cada · mato 0,6.
(Com isso a Fase 2 (grama na GPU) e a Fase 3 (mato em imagens) ficaram sem efeito prático: o chão e o mato custam quase nada na espera.)

**Pista nova (erro meu corrigido):** o contador de chamadas de desenho antigo **não via o `drawImage` do canvas principal** (o jogo o embrulha).
Contando de novo, em volta da casa são **1.195 chamadas de `drawImage` por quadro, 653 delas de canvases pequenos (< 128x129 px)**, que o Chrome
**não acelera por placa de vídeo** (ficam na memória do processador e precisam ser reenviados à GPU); os principais são a floresta amazônica
(348), as bordas do lago (218) e as fatias das copas das árvores. Isso combina com a falha do mato em imagens (também canvases pequenos, 4 fps).

**`?bench` ampliado (versão atual):**
- primeiro **deixa o jogo se ajustar sozinho por ~22 s em volta da casa** (ele reduz resolução e qualidade quando não acompanha) e só então **trava**
  essa configuração; assim o teste mede o jogo **como você joga** (antes travava tudo no máximo);
- **separa o tempo do quadro em lógica / desenho / interface / espera**;
- **interruptores finos**: árvores, plantações, o resto das entidades, luz (sombras projetadas, desfoque, composição final), atmosfera (raios do sol,
  partículas, compor camadas), clima, água, sombras de contato, mato+relevo+umidade, qualidade mínima, resolução x1; mede com **média aparada** dos
  intervalos entre quadros (precisão de décimos de ms, sem o ruído de contar fps inteiros);
- **micro-teste**: as mesmas operações em Canvas 2D e WebGL/PixiJS **com 4x o volume** (para o custo aparecer mesmo abaixo de um quadro), e o
  **custo por tipo de operação** (retângulos, imagens, espelhadas, elipses, gradientes, camadas cheias `lighter`/`multiply`, canvases auxiliares,
  raios do sol, e **fatias de canvases pequenos x grandes x ImageBitmap x `<img>`**).

**Como usar:** abra o jogo com `?bench` no fim do endereço (ex.: `...app.github.dev/?bench`). Sem tocar em nada, o jogo roda sozinho cerca de
**5 minutos** e mostra o resultado em 3 lugares (onde você está, **em volta da casa** e o rio), um **ranking** do que mais pesa e os micro-testes.

**Segurança do seu jogo:** durante o teste **nada é gravado** (o jogo salva sozinho a cada minuto e ao esconder a aba; isso fica bloqueado),
os toques são ignorados e a resolução fica fixa. No fim aparece o botão **Recarregar o jogo**, que volta ao último save como estava.

O navegador de teste do desenvolvimento não tem placa de vídeo: os números dele não valem para o celular.

**3º teste real (mesmo celular; o jogo se ajustou sozinho para resolução x1 e qualidade 0 de 3):** quadro de **52,4 ms (19 fps)** = lógica 2,0 +
desenho em JavaScript 16,2 + interface 0,1 + **espera 34,1 ms (65%)**. Mesmo no mínimo de resolução e de qualidade o jogo fica em ~19 fps: o gargalo
**não** é a quantidade de pixels nem o nível de qualidade.
- O que dá para afirmar: **desenhar as entidades custa 13,3 ms** (árvores 5,5 · o resto das entidades 2,6 · plantações 0,6); luz 2,3 e água 1,7.
- O que **não** dá para afirmar: atmosfera, clima, sombras de contato, mato/relevo/umidade, resolução e qualidade ficaram **dentro do ruído** (±6 ms: o
  celular esquenta e perde velocidade ao longo dos 5 minutos; várias linhas até "pioraram" ao desligar algo). Sem ser um gargalo claro, nenhuma dessas
  partes justifica uma fase só para ela.
- Micro-teste: Canvas 2D e WebGL fazem 2.200 operações a 60 fps (< 4,2 ms). Fatias de canvases pequenos, grandes, ImageBitmap e `<img>` custam **o mesmo**
  (~7 ms por 650 fatias, ~10 µs cada); imagens de **uma só fonte** (atlas) custam ~1,8 µs cada. Ou seja: a hipótese "canvas pequeno não é acelerado" **não
  se confirmou**; o que encarece é **trocar de imagem de origem** a cada desenho.

**Decisão do dono do jogo (seguir o plano em vez de caçar fps):** "não está injogável e acredito que melhore depois". Os testes de desempenho ficam
parados; o `?bench` e o `?fps` continuam no jogo para quando voltarmos a eles. **Pistas guardadas (nada disto foi testado no celular):**
1. **Interface HTML:** os botões do celular (`.btn`, `src/styles/mobile.css`) usam `backdrop-filter: blur(2px)` por cima de um canvas que muda a
   cada quadro, e alguns elementos usam `filter: drop-shadow`. A placa de vídeo refaz esses efeitos a cada quadro e isso aparece como "espera" no
   JavaScript, não como tempo de desenho. Teste barato: abrir o jogo com um CSS que tira `backdrop-filter` e `filter`, e outro que esconde toda a
   interface, e comparar o `?fps`.
2. **Atlas único de sprites:** uma simulação das "corridas" de desenho por quadro (operações seguidas que a placa de vídeo consegue juntar numa
   chamada só) deu ~1.766 hoje contra ~1.498 se todos os canvases viessem de uma só imagem: no máximo **~15%** menos chamadas. Ganho pequeno.
3. **Árvores da Amazônia:** em volta da casa são ~346 `drawImage` por quadro só delas (cada árvore alta vira dezenas de fatias por causa do
   balanço e do "farfalhar" das folhas). Guardar a árvore já "entortada" só compensa se o vento mudar devagar.
4. O contador de chamadas mostrou 141 imagens de origem diferentes por quadro (479 chamadas de `drawTile`, 348 da Amazônia, 218 de bordas de lago).

**Ordem das fases depois dos 3 testes (revisada de novo):** 4 = passes de desenho (feita, seção 15) · 5 = entidades (o que mais pesa) · 6 = luz e névoa ·
7 = sombras, relevo e água (adiada: custam quase nada no celular) · 8 = limpeza.

## 15. Fase 4 (feita): o desenho de um quadro em 3 passes

**Por que:** `render()` era uma função de ~220 linhas que fazia tudo, e a regra "uma camada por vez, com plano B em Canvas" (seção 5) obrigava a enfiar
um `if` do Pixi no meio dela (foi o que a Fase 2 fez). Agora cada etapa tem o seu lugar e a sua "tomada".

| Peça (`rendering/Renderer.js`) | O que faz |
|---|---|
| `viewFor()` | calcula a câmera do quadro: `t` (segundos), `h` (hora), `camX`, `camY` e as faixas de tiles (`x0..y1`, com folga para árvores, e `gx0..gy1`, para o chão) |
| `passGround(v)` | fundo, chão tile a tile (com o cache do chão e, só com `?pixi`, a grama na GPU), relevo, pegadas, água sobre o chão |
| `collectEntities(v)` | **não desenha**: reúne tudo o que fica em pé (árvores, plantas, bichos, casas, jogador...) com a chave de ordenação Y e devolve a lista `ents` |
| `passEntities(v, ents)` | sombras de contato, ordem Y, reflexos, bordas do lago e o desenho de cada entidade (o mato cobre os pés) |
| `passFinish(v, ents)` | poeira, respingos, iluminação, balões, vaga-lumes, clima, atmosfera, relâmpago e vinheta |

`passGround`, `passEntities` e `passFinish` são `extensible()` (o mesmo mecanismo de camadas que o jogo já usa em `core/extensions.js`) e ficam
exportados junto com `viewFor` e `collectEntities`. **É assim que o PixiJS assume um passe de cada vez:**
`passEntities.extend((prev) => function (v, ents) { if (!pixiOk()) return prev.apply(this, arguments); ...desenha no Pixi... })`. Sem WebGL, ou se der
erro, cai no `prev` (o Canvas de sempre).

**Só o código mudou de lugar.** Conferido comparando o arquivo antigo e o novo linha a linha: as únicas linhas que sumiram são dois `import` que ficaram
sem uso, 3 linhas de uma conta de sombra (`shA`) que ninguém lia e a linha `vcam = ...`, que foi para `render()`; a variável da vinheta passou de `v`
para `vig` porque `v` agora é a câmera. Um erro de digitação aparece na hora (o jogo nem abre): aconteceu uma vez durante a divisão (nome repetido) e foi
corrigido antes do commit.

**Prova (código anterior x novo, no mesmo ambiente de teste):**
- 97 testes automáticos ok; `npm run build` ok;
- regressão visual `npm run test:regression`: **os mesmos números de pixels** do código anterior nos 4 cenários (`basic`, `full`, `touch`, `load`); no `basic`
  continuam iguais à referência da seção 10;
- `tests/perf/posgrid.mjs` (24 posições da câmera, com bordas do mapa): **0 quadros diferentes** da referência do jogo original;
- `?pixi` (`tests/perf/pixi-equal.mjs`, `DENSE=10`): resultado **idêntico antes e depois** da divisão (mesmos números). Atenção: nesse teste o modo `2d`
  (que deveria dar 0) mostra **1 quadro com 4 pixels diferentes** (posição `800,5`, topo do mapa, até 121 níveis). Isso já acontecia **antes** da Fase 4
  (veio de algum commit depois da Fase 2, ainda não identificado), só afeta o `?pixi` (experimental, desligado por padrão) e **não** o jogo normal.

## 16. Fase 5 (feita): entidades separadas do `Renderer.js` e do código das árvores

- **`src/rendering/Entities.js` (novo):** `collectEntities(v)` e `entityProviders` saíram do `Renderer.js`. A coleta virou funções pequenas
  (`collectTiles`, `collectFauna`, `collectVillage`, `collectFarmAnimals`, `collectQuestNpcs`, `collectHome`, `collectHerd`, `collectVillager`, mais os
  fornecedores extras e o jogador), chamadas **na mesma ordem de antes**: a ordenação por Y é estável, então, quando duas coisas têm a mesma chave Y,
  quem entra primeiro na lista é desenhado primeiro. O `Renderer.js` continua exportando `entityProviders` e `collectEntities` (o jogo e o README ainda
  importam dele).
- **`src/rendering/TreeRenderer.js` (novo):** `drawTree` e `drawTreeOld` (o balanço ao vento) saíram de `world/Trees.js`, que agora só cuida de sprites,
  regiões e escolha do modelo (não tem mais nenhum `ctx`). `AmazonRender.js` e `Allelopathy.js` passaram a importar `drawTree` do arquivo novo; as
  extensões (`drawTree.extend`) funcionam como antes.
- **`Renderer.js`** deixou de importar 49 nomes (não conhece mais cada tipo de entidade): sobraram só os passes. `core/debug.js` ganhou os dois módulos novos.
- **Prova:** 97 testes · build · 24 posições da câmera com 0 diferenças da referência · regressão visual com os **mesmos números** do código anterior nos 4 cenários.
- **O que isto NÃO é:** as entidades continuam sendo desenhadas em Canvas 2D. Passá-las para sprites do PixiJS exigiria levar junto o mato (centenas de tiles
  intercalados com as entidades pela ordem Y, porque a ordem de desenho precisa continuar exata). Ver a seção 19.

## 17. Fase 6 (feita): luz e clima em etapas separadas

`passFinish` (o último passe do quadro) virou quatro etapas, cada uma `extensible()` e exportada, chamadas na **mesma ordem** de antes:

| Etapa | O que faz |
|---|---|
| `passLight(v, ents)` | poeira, respingos e a iluminação (`applyLighting`: mapa de luz e sombras projetadas) |
| `passOverlays(v)` | balões, estados dos bichos, etiquetas e vaga-lumes (aditivo) |
| `passSky(v, ents)` | clima (chuva, nuvens), raios de sol, bloom, poeira atmosférica e relâmpago |
| `passVignette(v)` | vinheta (escurece as bordas, mais forte à noite) |

Assim o PixiJS pode assumir, por exemplo, só a vinheta ou só o clima, sem tocar na luz. **Só o código mudou de lugar**: 97 testes · build · 24 posições
da câmera com 0 diferenças · regressão visual com os mesmos números nos 4 cenários. A luz continua sendo gerada em Canvas 2D (o mapa de luz e as sombras
projetadas são desenhados em canvases auxiliares); passar a *composição final* para o PixiJS só vale a pena se uma medição no celular mostrar que ela pesa
(no 3º teste ela ficou dentro do ruído: seção 14).

## 18. Fase 7 (feita, na forma de camadas): chão, água e sombras em camadas separadas

Os passes `passGround` e `passEntities` foram divididos em camadas, todas `extensible()` e exportadas, chamadas na **mesma ordem** de antes:

| Passe | Camadas (em ordem) |
|---|---|
| `passGround` | `layerTerrain` (fundo, cache do chão, tiles, trilhas, hidrologia; é aqui que o `?pixi` troca a grama parada) → `layerRelief` (relevo e pegadas) → `layerWater` (efeitos da água sobre o chão) |
| `passEntities` | `layerShadows` (sombras de contato) → *(ordenação por Y)* → `layerShoreline` (reflexos, bordas do lago e das margens) → `layerEntities` (entidades por Y, com o mato cobrindo os pés) |

As sombras de contato são desenhadas **antes** da ordenação por Y, na ordem em que as entidades foram reunidas (isso precisa ser mantido, porque sombras
translúcidas sobrepostas dependem da ordem). Cada camada pode agora ser trocada pelo PixiJS sozinha. Na forma antiga do plano, esta fase seria "guardar
prontas as camadas translúcidas estáticas (sombras, relevo, água)": os dados do celular mostraram que elas custam quase nada (seção 14), então **ficou só a
separação em camadas**, sem trocar nenhum desenho por outro (zero risco para a imagem).

**Prova:** 97 testes · build · 24 posições da câmera com 0 diferenças · regressão visual com os mesmos números nos 4 cenários.

## 19. Estado final: o jogo é desenhado pelo PixiJS

Depois da Fase 8 o dono do jogo pediu que **tudo** fosse PixiJS, e foi feito (seções 20 a 22). Esta seção ficou só como história: a Fase 8
decidiu manter o Canvas como padrão porque o PixiJS ainda desenhava só a grama; isso **não vale mais**.

## 20. Etapas da migração real (feitas)

| Etapa | O que foi feito |
|---|---|
| 1 | O PixiJS liga sozinho (`?canvas` na URL volta ao Canvas puro, plano B). |
| 2 | **Contexto PixiJS** (`rendering/pixi/PixiCtx.js`): objeto com as mesmas chamadas do Canvas 2D que o jogo usa (retângulos, imagens, gradientes, caminhos, traços, recorte, texto, rotação, transparência, modos de mistura). O código de desenho antigo roda nele **sem ser reescrito** e a ordem de desenho é a mesma. |
| 3 | Sombras de contato, mato e todas as entidades no PixiJS. |
| 4 | O quadro inteiro numa passagem só (luz, clima, atmosfera, vinheta, balões, brilhos). |
| 5 | A tela é o canvas do PixiJS (`#pixiView`), sem cópia. Só os testes automáticos (e `?copia`) copiam o quadro para o canvas do jogo para poder ler pixels. |
| 6 | Interior da casa no PixiJS (recorte por máscara dentro da cena). |
| 7 | **Desempenho:** um **atlas único** (páginas de 1024x1024) com todas as imagens, retângulos coloridos e pedaços das imagens grandes; partículas do PixiJS no lugar de sprites. O quadro caiu de ~10.000 lotes para ~14 e de ~550 ms para ~17 ms de desenho no navegador de teste. No celular do dono: de 7 fps para 40 fps. |

Cuidados que o contexto PixiJS toma: cada canvas tem um número de versão (`__v`, sobe a cada escrita) e o atlas só recopia o que mudou; canvases que
o jogo redesenha várias vezes por quadro (luz) recebem uma "foto" por uso, porque a GPU só desenha no fim do quadro; o que o contexto não sabe desenhar
é **registrado** (`window.VDC_LAYER_STATS.motivos`) e o quadro segue.

## 21. O que ainda é Canvas (e por que não aparece na tela)

O Canvas 2D só **fabrica imagens**, nunca desenha a cena: mapas de luz e sombras projetadas (`LightingSystem`, `Atmosphere`), os sprites montados uma vez no
carregamento (`bakeImg`, variantes de cor) e as imagens guardadas do atlas (gradientes, elipses, textos). Trocar isso por texturas de render do PixiJS e
filtros é um trabalho à parte (reescrever a luz), sem ganho visível. Com `?canvas` o jogo inteiro volta ao desenho antigo em Canvas.

## 22. Como conferir

- `npm test` e `npm run build`;
- `tests/perf/layer-equal.mjs` (PixiJS x `?canvas`, quadro a quadro; `INSIDE=1` testa o interior; `PRE="setAblate({...})"` desliga etapas);
- `?fps` no celular (compare também com `?canvas`);
- diferenças conhecidas: ~1% dos pixels com 3+ níveis (arredondamento de transparência, a onça sai nítida) e ~15% perto do rio (água animada).

## 23. O mato virou helicônia e samambaia (feito)

Pedido do dono: sair a grama de lâminas e entrar duas plantas amazônicas em 4 fases (folha de sprites própria), com dados da vida real.

- **Sprites:** `tools/plants/make-plants.py` recorta `folha-plantas.jpg` (que traz o xadrez gravado e as legendas) em 8 PNGs RGBA
  (`public/assets/sprites/plants/`), alfa só 0/255. Entram no atlas do PixiJS como qualquer outra imagem.
- **Desenho:** `drawMato` (`world/Vegetation.js`) escolhe a sprite por espécie e fase e usa só `ctx.drawImage`, então roda igual no PixiJS e em `?canvas`.
  Saiu todo o desenho lâmina por lâmina, o cache de imagens do mato (`?matocache`) e as lâminas do chão (`GrassSystem.js`, `TileRenderer.js`): o chão é
  a textura lisa + trilhas de terra batida. A simulação de pisoteio, dobra e pasto continua igual (o pisoteio mata o mato; a vaca pasta por ela).
- **Regras:** `config/plants.js` (dados) e `world/PlantSpecies.js` (espécie por tile, fase, crescimento, ciclo de vida). Detalhes em `docs/PLANTAS.md`.
- **Prova:** `npm test` (101), `tests/browser/plants.mjs` (espécie estável, fases, ciclo da helicônia, inspeção, sem erros), build, e capturas no PixiJS e em `?canvas`.
- **Fora do escopo / pendente:** a regressão pixel a pixel contra o `legacy/` deixa de valer onde há mato e no chão pisoteado (README, seção 7); as duas linhas da folha trazem
  flores vermelhas na fase 4, inclusive a "samambaia" (arte original; na vida real ela não floresce).

## 24. Pisoteio da fauna, trilhas e mato fechado (feito)

O jogo já tinha pisoteio do jogador, da aldeã e das vacas, trilha de terra batida e recuperação com os dias. Foi acrescentado o que faltava (detalhes em `docs/PISOTEIO.md`):
fauna selvagem pisoteia (por peso da espécie) e prefere trilhas ao escolher destino; mato crescido e fechado freiam jogador e animais; planta grande regride de fase com
pisoteio forte; compactação atrapalha o crescimento e a germinação de árvores; `findPath` virou Dijkstra com custo (trilha barata, mato fechado caro); helicônia adulta
sufoca brotos vizinhos. Números em `config/trampling.js`. Prova: `npm test` (105), `tests/browser/trampling.mjs` (10 conferências), `plants.mjs`, ecossistema A/C/D e cercas sem falhas.
Observação: `ecosystem-b.mjs` falha na conferência 18 ("a onça derruba o jogador") **também na branch original** (`46eb705`), antes de qualquer mudança desta tarefa.

## 25. Travamento depois de dormir: vazamento de imagens no PixiJS (corrigido)

Sintoma: ~30 s depois de dormir o jogo caía para 0 fps. Causa (já existia na versão original): `PixiCtx.fill` (brilhos: vaga-lumes, tocha) guardava uma imagem por valor de
transparência, e `drawWaterFX` (reflexo do céu na água, cuja cor muda a cada minuto do amanhecer) uma imagem do tamanho da tela por cor, sem limite: milhares por minuto, memória da
placa de vídeo cheia. Conserto: o gradiente guarda UMA imagem branca e a cor/transparência vão como tinta no desenho (`gradImage` devolve `rgb` e `a`), raios em passos de 0,5 px e
limite de 300 no cache. `findPath` virou A* com memória de buscas sem saída (tempo de jogo). Máscaras de recorte brancas voltam a ficar fora do desenho antes de cada quadro.
Atenção para quem testa: os testes de navegador antigos NÃO ligam o PixiJS (o servidor estático não resolve `pixi.js`); só `tests/browser/pixi-leak.mjs` sobe o jogo pelo Vite com WebGL.
Nota: "canvas" aqui são as imagens-buffer que o PixiJS usa como textura (seção 21); a cena inteira continua desenhada pelo PixiJS.

## 26. Onça, sucuri, camuflagem no mato e fome (feito)

Pedido do dono: o mato alto esconde onça e sucuri, ataques mais fortes (sucuri trava o jogador; onça salta e corre rápido), faro de longe, presas que fogem e
predadores que esgueiram, e agressividade que sobe com a fome. Detalhes e números em `docs/ECOSSISTEMA_VIVO.md` (seção "revisão"). Testes: `tests/browser/predadores.mjs` (novo),
`ecosystem-a/b` ajustados ao novo equilíbrio e `tests/systems/ecosystem.test.js`. Nota: `ecosystem-b` conferência 18 ("a onça derruba o jogador") falha desde antes (branch original).

## 27. Predadores caçam os animais da fazenda; fim da raposa especial (feito)

A onça ataca bezerros e vacas, a sucuri bezerros e galinhas à beira da água, e a raposa **comum** (selvagem) caça galinhas; os animais morrem de verdade e deixam
carcaça. Tudo pelas mesmas regras dos selvagens, por meio dos "espelhos" de `entities/farm/FarmPrey.js` (detalhes em `docs/ECOSSISTEMA_VIVO.md`). Também nesta rodada:
desmaio por muitas picadas (6 h de jogo, indefeso), coração batendo com vida baixa, onça que não recua depois de atacar e renascimento dentro da casa ao morrer.
Teste novo: `tests/browser/fazenda.mjs`. Armadilha de teste: `updateFauna` limita o passo a 0,05 s; passos maiores deixam os predadores mais lentos que as galinhas.


## 28. Plantas maiores e círculo translúcido atrás de árvores e plantas (feito)

Pedido do dono: (1) as fases 3 e 4 do mato 15% maiores, para uma floresta mais cheia; (2) quando o personagem passa atrás de uma árvore, planta ou mato alto, **só um círculo ao redor
dele** fica translúcido, com a borda em degradê, e não a árvore inteira (antes a copa das árvores grandes da Amazônia ficava 58% translúcida por inteiro). Detalhes em `docs/PLANTAS.md`.
`rendering/Occlusion.js` desenha a planta ou árvore num canvas auxiliar, fura com uma máscara em degradê e a coloca na cena (funciona igual no PixiJS e em `?canvas`);
o canvas auxiliar fica fora do atlas (`__dyn`, `PixiCtx.js`). Números em `config/occlusion.js` e `ESCALA_FASE` em `config/plants.js`. Teste novo: `tests/browser/oclusao.mjs`
(compara o quadro com e sem o círculo: muda só dentro do raio) e `tests/assets/plants.test.js`.

## 29. Sucuri com a folha nova e barriga que estica (feito)

Pedido do dono: usar a folha de sprites da sucuri que ele mandou no lugar da antiga, adaptada aos movimentos que a sucuri já tem, e fazer a sprite **esticar** (ficar maior, mais
longa) quando ela engole um animal, com um jeito de ver isso no jogo. Folha nova (`tools/anaconda/make-anaconda.py`), 460 linhas de caminhos do corpo da folha antiga removidas de
`Anaconda.js`, poses por estado e giro de 90 graus para cima e para baixo, barriga por colunas esticadas (`anaStretch`, guardada por sucuri), `?sucuri` na URL e `anaDemo()`.
Canvases auxiliares compartilhados com o círculo translúcido em `rendering/DynPool.js`. Detalhes em `docs/ECOSSISTEMA_VIVO.md`. Teste novo: `tests/browser/sucuri.mjs`.
Limites: só há 2 quadros de deslizar por lado (a animação é um vaivém curto) e a folha não traz nadando nem bote, que são feitos por tintura e esticamento do mesmo quadro.

## 30. Sucuri ondulando ao andar (feito)

Pedido do dono: a sucuri andando em linha reta para baixo ficava estranha (uma haste dura: quadro deitado girado em 90 graus, só 2 quadros, ritmo fixo). Agora o corpo ondula em fatias, com a fase da onda ligada à distância percorrida
(`anaWave`/`anaWaveStrips` em `Anaconda.js`, `ANA_WAVE`); andando usa um quadro só e a ondulação é a animação. Teste: `tests/browser/sucuri.mjs` (sem intensidade sai igual ao quadro, a cabeça não se mexe, a fase anda com a distância).
Limite: a aparência de "vista de lado girada" parada em pé só se resolve com arte própria de frente e de costas.

## 31. Árvores paradas, sem balanço do vento (feito)

Pedido do dono: árvores sem efeito de vento, então deixam de ser cortadas em fatias de linhas e passam a ser um sprite só. `drawTree` (`rendering/TreeRenderer.js`) e a `drawTree` das árvores
grandes da Amazônia (`features/amazon/AmazonRender.js`) agora desenham a árvore com **um único `drawImage`** (antes eram dezenas, uma por grupo de linhas com o mesmo deslocamento); a árvore de reserva
(`drawTreeOld`) também ficou parada. O tremor ao bater com o machado (`treeShake`) continua. O balanço do mato e das plantas já era só pelo pisoteio. O vento continua existindo no jogo (chuva, névoa, folhas e paina
voando, som), só não mexe mais nas copas. A margem de 16 px que o círculo translúcido reservava para a copa balançar (`OCLUSAO.margem`) saiu.

## 32. Sumaúma gigante (feito)

Pedido do dono: 5% das sumaúmas 30% maiores, e as harpias preferem essas. `config/sumaumaGigante.js` (chance 5%, escala 1,3, a partir da fase 3), `AmzArvore.gig` (sorteio pela posição do tile: sempre o mesmo, não vai para o save)
e `modeloGigante` em `features/amazon/AmazonTrees.js`: o modelo ampliado sem suavização (desenho, sombra, copa, alcance) é feito uma vez por fase. A folga de desenho `amzPad.dn` subiu para 17 tiles. Teste: `tests/browser/sumauma-gigante.mjs`.

## 33. Harpia, etapa 1: a ave adulta (feito)

Pedido do dono: harpia com sprites andando, parada, voando e em razante, e o comportamento do texto de biologia. Feito: casal raro na copa de uma sumaúma adulta (gigantes preferidas), 11 estados, caça às presas que existem no jogo
(lebre, galo-lira, galinha, filhotes de cervo e de queixada), defesa do ninho só perto dele e depois de avisar, expulsão de outra harpia, fuga da onça, som alto e com eco. Detalhes, números e a tabela de presas e predadores em `docs/HARPIA.md`;
teste `tests/browser/harpia.mjs`. Folhas de sprites por `tools/harpia/make-harpia.py` (acha a grade do pixel art original e lê um pixel por bloco: bem mais nítido que reduzir a imagem).
**Falta (etapa 2):** o ninho na copa (desenho do ninho com ovos que aparecem), acasalamento, 2 ovos e incubação, filhote, cainismo, primeiro voo, e macacos e preguiças como presas se o dono mandar a arte.
