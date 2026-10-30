# Plano de migração: Canvas 2D → PixiJS (WebGL)

Escrito em português simples, para quem não programa. Baseado na leitura real do código (`src/`, ~110 módulos,
34 mil linhas) e nos documentos que já existiam em `docs/` (`PIXI-PLANO.md`, `DESEMPENHO.md`).

## 1. Onde estamos hoje (a boa notícia)

- O jogo **já é modular** (não é mais um arquivo único) e **já usa Vite**.
- Já existem testes: 96 testes automáticos passam, e há um teste que compara o jogo pixel a pixel com o original
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

A ordem de um quadro (`Renderer.js`, função `render`):
1. fundo + chão tile a tile (`drawTile`, `drawTrampledGrass`, `drawHydro`)
2. relevo, pegadas, água
3. entidades ordenadas por Y: árvores, plantas, animais, vaca, galinhas, NPCs, jogador
4. mato, poeira, respingos, balões, vaga-lumes, clima
5. raios de sol, brilho, relâmpago
6. iluminação/névoa e vinheta

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
4. **Após cada fase, rodar:** `npm test` (96 testes), `npm run build` e o teste de regressão visual (compara pixels com o original).
5. **Você testa no celular** pelo link de preview antes de eu passar para a próxima fase.
6. Nada de mudar regras do jogo (animais, save, clima). Só a forma de desenhar.

## 6. Fases

| Fase | O que muda | Risco | Como saber que deu certo |
|---|---|---|---|
| **0 — Preparação** *(feita)* | Vite funcionando, `package.json` recriado, `pixi.js` instalado (ainda não usado), backup etiquetado | Nenhum | Build ok, 96 testes ok, jogo abre sem erro |
| **1 — Tomada de desenho** *(feita)* | Criar `rendering/pixi/` com a "tomada": inicia o Pixi atrás do `?pixi`, com plano B em Canvas. **O jogo ainda desenha tudo em Canvas** | Muito baixo | Com e sem `?pixi` a imagem é idêntica |
| **2 — Chão (tiles)** *(feita, experimental: só com `?pixi`)* | A grama parada do chão vira textura na GPU (`TileRenderer`, `GrassSystem` parte parada) | Médio | Lógica idêntica (0 pixels); com WebGL, diferenças mínimas no navegador de teste; **FPS ainda não medido no celular** |
| **3 — Grama pisoteada e rios** | `drawTrampledGrass`, `Hydrology` | Médio | Idem + teste `grass-idle-paths` |
| **4 — Entidades** | Árvores, plantas, animais, jogador como sprites ordenados por Y | Médio/alto | Regressão visual dos cenários `basic`, `full`, `touch` |
| **5 — Efeitos** | Clima, partículas, sombras | Médio | Regressão visual |
| **6 — Luz e névoa** | `LightingSystem`, `Torch`, vinheta viram filtros/sprites | Alto | Regressão visual, teste noturno |
| **7 — Limpeza** | Tirar o desenho antigo só das camadas já provadas; Pixi vira padrão | Baixo | Todos os testes + teste em celular real |

A interface (HUD, inventário, menus) já é HTML/CSS e **não muda**. O `MapUI` (mapa) pode ficar em Canvas.

## 7. Separar lógica de desenho (o que atrapalha hoje)

Alguns arquivos de lógica também desenham (ex.: `Carcass.js`, `Chickens.js`, `Fishing.js`, `Anaconda.js`, `Bees.js`). Em cada fase,
a função `draw...` desses arquivos é movida para uma pasta `rendering/` correspondente, sem alterar a lógica. Os "fornecedores de entidades"
(`entityProviders` em `Renderer.js`) já guardam a ordem Y e a função de desenhar, e serão o ponto de encaixe da Fase 4.

## 8. Como rodar e testar

```bash
npm install          # uma vez
npm run dev          # servidor com atualização instantânea (porta 5173)
npm test             # 96 testes
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
