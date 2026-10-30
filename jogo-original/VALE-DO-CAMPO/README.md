# Vale do Campo

Jogo de fazenda e ecologia em pixel art para navegador. Você cuida de uma fazenda em um vale de 1000 × 1000 tiles
(10 × 10 regiões), planta, cria vacas e galinhas, pesca, corta árvores, explora a floresta amazônica e convive com
um ecossistema simulado: rios que mudam de curso, chuva física, grama que guarda as trilhas, fauna selvagem com
predadores, ciclo de dia e noite com iluminação e sombras dinâmicas.

Este repositório é a versão **modular** do arquivo único `Vale_do_Campo_V64.html` (preservado em
[`legacy/`](legacy/Vale_do_Campo_V64.html)). A migração manteve o comportamento **idêntico ao original**: os testes
de regressão comparam as duas versões pixel a pixel e comparam o save byte a byte (veja [Testes](#7-testes)).

---

## Sumário

1. [Tecnologias](#1-tecnologias)
2. [Requisitos e instalação](#2-requisitos-e-instalação)
3. [Rodando o jogo no seu computador](#3-rodando-o-jogo-no-seu-computador)
4. [Controles](#4-controles)
5. [Estrutura das pastas](#5-estrutura-das-pastas)
6. [Como o código está organizado](#6-como-o-código-está-organizado)
7. [Testes](#7-testes)
8. [Build de produção](#8-build-de-produção)
9. [Publicando na Netlify (mantendo o site atual)](#9-publicando-na-netlify-mantendo-o-site-atual)
10. [Salvamento](#10-salvamento)
11. [Como adicionar sprites](#11-como-adicionar-sprites)
12. [Como adicionar novos animais](#12-como-adicionar-novos-animais)
13. [Como criar novos sistemas](#13-como-criar-novos-sistemas)
14. [Onde alterar configurações, controles e parâmetros](#14-onde-alterar-configurações-controles-e-parâmetros)
15. [Depuração](#15-depuração)
16. [Solução de problemas](#16-solução-de-problemas)
17. [Limitações conhecidas](#17-limitações-conhecidas)

Ecossistema vivo (percepção, caça, presa-jogador, indicadores): [`docs/ECOSSISTEMA_VIVO.md`](docs/ECOSSISTEMA_VIVO.md).

Documentação técnica da migração (auditoria, inventário de funcionalidades, decisões e evidências):
[`docs/AUDITORIA_E_MIGRACAO.md`](docs/AUDITORIA_E_MIGRACAO.md).

---

## 1. Tecnologias

| Item | Uso |
| --- | --- |
| HTML5 + CSS3 | Página, HUD, menus, inventário, mapa, controles de toque |
| JavaScript moderno (ES Modules) | Todo o jogo, dividido em ~110 módulos |
| Canvas 2D | Renderização (480 × 270 lógicos, ampliados 1×–3× com pixel art nítido) |
| Web Audio API | Todos os sons e a música são sintetizados (não há arquivos de áudio) |
| localStorage + IndexedDB | Save da partida e das regiões fora da tela |
| Vite | Servidor de desenvolvimento e build de produção |
| npm | Scripts e dependências de desenvolvimento |
| `node --test` | Testes unitários (sem dependências extras) |
| Playwright (opcional) | Testes de regressão visual contra o arquivo original |

Não há frameworks (React, Vue etc.), TypeScript ou WebGL: o jogo continua em Canvas 2D, como o original.

## 2. Requisitos e instalação

Você precisa do **Node.js 18.18 ou mais novo** (recomendado: 20 LTS ou 22 LTS). Ele já inclui o `npm`.

Verifique no terminal (Prompt de Comando/PowerShell no Windows, Terminal no macOS/Linux):

```bash
node -v    # deve mostrar v18.18 ou maior
npm -v
```

Se aparecer "comando não encontrado", instale o Node.js LTS em <https://nodejs.org> (no Windows/macOS basta o
instalador; no Linux, o gerenciador da distribuição ou o `nvm`). Feche e abra o terminal depois de instalar.

Na pasta do projeto (a que contém `package.json`), instale as dependências:

```bash
npm install
```

Isso baixa o Vite e o Prettier para `node_modules/` e cria o `package-lock.json` (guarde-o no Git: ele fixa as
versões exatas usadas).

## 3. Rodando o jogo no seu computador

```bash
npm run dev
```

O terminal mostra um endereço, normalmente <http://localhost:5173/>. Abra-o no navegador. Ao salvar qualquer
arquivo em `src/`, a página recarrega sozinha.

- **Pelo celular na mesma rede Wi-Fi:** o Vite também mostra um endereço "Network" (ex.: `http://192.168.0.10:5173/`).
  Abra-o no celular, de preferência em modo paisagem.
- **Não abra o `index.html` com dois cliques (`file://`).** Módulos JavaScript e o carregamento de
  `assets/data/world.bin` exigem um servidor; o jogo mostrará uma mensagem de erro explicando isso.

## 4. Controles

| Ação | Teclado | Toque |
| --- | --- | --- |
| Andar | WASD ou setas | Joystick virtual (canto inferior esquerdo) |
| Correr (+30%, gasta energia) | Shift | Botão **Correr** (liga/desliga) |
| Usar ferramenta / colher / conversar / afagar | Espaço ou E | Botão **Usar** |
| Entrar/sair da casa | — (botão aparece perto da porta) | Botão **Entrar/Sair** |
| Dormir (na cama) | X | Botão **Dormir** |
| Selecionar item | 1–9 | Toque na hotbar |
| Inventário | I (Esc fecha) | Botão da mochila |
| Mapa | M (Esc fecha) | Botão do mapa |
| Menu de opções | — | Botão da engrenagem |
| Música | — | Botão 🎵 (canto inferior esquerdo) |

## 5. Estrutura das pastas

```
VALE-DO-CAMPO/
├── index.html               Página: elementos do HUD/menus e <script type="module" src="/src/main.js">
├── package.json             Scripts npm (dev, build, preview, test, test:regression, format)
├── vite.config.js           Configuração do Vite (base relativa './', saída em dist/)
├── netlify.toml             Comando de build e pasta publicada na Netlify
├── .prettierrc              Estilo de formatação do código
├── legacy/
│   └── Vale_do_Campo_V64.html   Arquivo original, intacto (referência e testes de regressão)
├── public/                  Copiado sem alterações para o build
│   ├── favicon.png
│   └── assets/
│       ├── data/world.bin       Mapa projetado do mundo (antes: 454 KB de base64 dentro do HTML)
│       └── sprites/
│           ├── animals/         vaca, galinha, minhoca, raposa, cervo, lebre, galo-lira, javali, onça, sucuri
│           ├── characters/      jogador (skin atual e antiga), golem
│           ├── crops/           cenoura, abóbora e milho (3 fases cada)
│           ├── ground/          grass.png: textura do chão de grama (256×256, repete sem emendas)
│           ├── objects/         casa, pedras, cogumelos, móveis do interior
│           └── trees/           árvores por bioma e árvores amazônicas (8 fases × 3 espécies)
├── src/
│   ├── main.js              Ponto de entrada: carrega world.bin e chama boot()
│   ├── assets/ui/           Imagens usadas pelo CSS (molduras, barra de vida, ícones)
│   ├── styles/              main.css, ui.css, mobile.css, skin.css, map.css, fatal.css
│   ├── config/              constantes, equilíbrio do jogo e configurações gráficas
│   ├── core/                boot, laço, atualização, estado, save, tempo, entrada, extensões, depuração
│   ├── world/               mundo, regiões, geração, clima, chuva, água, grama, árvores, casa, vila
│   │   ├── hydrology/       hidrologia, correnteza, dinâmica fluvial, poças
│   │   ├── ecology/         ecologia das árvores
│   │   └── village/         missões e vendedor
│   ├── rendering/           canvas, renderizador (passes), entidades (Entities.js), árvores (TreeRenderer.js), iluminação, sombras, tiles, lago, tocha, atmosfera, pixi/ (ponte experimental)
│   ├── entities/            jogador, aldeã, lobisomem, gigante, carcaças
│   │   ├── cow/             vaca, rebanho, genética, desenho
│   │   ├── farm/            galinhas, ninhos, minhocas, raposas da fazenda
│   │   ├── wild/            fauna selvagem, onça, sucuri, animais na água
│   │   ├── animals/         vida social do rebanho
│   │   └── ai/              movimento e busca de caminho
│   ├── features/amazon/     floresta amazônica, troncos caídos, abelhas, serrapilheira
│   ├── systems/             interação, agricultura, inventário, colisão, pesca, machado, áudio
│   ├── ui/                  HUD, hotbar, menu, inventário, mapa, controles de toque, avisos
│   └── utils/               matemática, aleatório, ruído, compactação, caminhos de assets
├── tests/
│   ├── core/ utils/ world/ systems/ assets/   Testes unitários (npm test)
│   ├── fixtures/            Save real gerado pelo arquivo original
│   └── regression/          Comparação automática original × modular (npm run test:regression)
├── docs/AUDITORIA_E_MIGRACAO.md       Auditoria, inventário, decisões e evidências da migração
├── tools/ground/make-grass.py   Gera a textura do chão (opcional; o PNG já está no projeto)
└── tools/migration/         Ferramenta (AST) usada uma única vez para gerar src/ a partir do HTML
```

A pasta `dist/` é criada pelo `npm run build` e não deve ser editada à mão.

**Diferenças em relação à estrutura sugerida e por quê:** os nomes seguem a sugestão (`core/`, `world/`,
`rendering/`, `entities/`, `systems/`, `ui/`, `utils/`, `config/`), mas só existem os módulos que têm código real.
Subpastas extras (`world/hydrology`, `entities/wild`, `features/amazon`…) foram criadas porque esses sistemas são
grandes no original (a hidrologia sozinha tem ~2 500 linhas). Não há `Camera.js`: a câmera é calculada em poucas
linhas dentro de `rendering/Renderer.js`, e criar um arquivo só para ela seria uma divisão artificial. Os sons
são sintetizados, por isso não há `public/assets/audio/`.

## 6. Como o código está organizado

### Fluxo de inicialização

```
index.html ──> src/main.js
                 ├── world/WorldData.loadWorldData()   baixa e descompacta assets/data/world.bin
                 └── core/Game.boot()                  ~60 passos, na MESMA ordem do arquivo original:
                        volume geral → configurações → canvas → extensões → interface →
                        carregar save ou jogo novo → módulos (tocha, pesca, alelopatia, Amazônia,
                        troncos, abelhas…) → ajustes pós-save → core/GameLoop.startLoop()
```

`core/Game.js` é a lista oficial da ordem de inicialização. A ordem importa: por exemplo, o save é carregado
antes de os módulos da Amazônia se registrarem, e `features/amazon/AmazonBoot.js` completa os dados depois — exatamente
como acontecia com os `<script>` do original.

### A cada quadro (`core/GameLoop.js`)

```
frame(now) ─ governador de desempenho (ajusta resolução/qualidade pelo FPS)
           ├─ update(dt)      core/GameUpdate.js + camadas registradas (regiões, tocha, névoa, Amazônia, troncos, abelhas)
           ├─ render()        rendering/Renderer.js, em 3 passes (cada um é `extensible()`, ver core/extensions.js):
           │                    passGround    chão → relevo → água
           │                    passEntities  entidades (ordem Y) com sombras, reflexos e mato
           │                    passFinish    iluminação → clima → atmosfera → vinheta
           └─ HUD, botões contextuais, seta da casa, hotbar
```

O `dt` é limitado a 50 ms, então uma aba que ficou inativa não acumula atraso nem "pula" a simulação.

### Estado compartilhado

| Onde | O quê |
| --- | --- |
| `core/GameState.js` | `S` (dia, minuto, moedas, energia, inventário, posição…) e `sleeping` |
| `world/World.js` | mapa da região carregada: `ground`, `obj`, `wet`, `crops` |
| `world/WeatherSystem.js` | `climate` (chuva, nuvens, umidade, vento) |
| `world/Instances.js` | `INST` (região atual, simulação das outras) |

Em ES Modules uma variável importada é **somente leitura**. Quando outro módulo precisa substituir a variável
inteira (ex.: o carregamento do save troca `ground` por um array novo), o módulo dono exporta um *setter*
(`setGround(novo)`, `setS(novo)`…). Alterar o conteúdo (`S.coins += 10`, `ground[i] = SOIL`) não precisa de setter.

### Pontos de extensão (`core/extensions.js`)

O original crescia por "monkey patches": cada `<script>` guardava uma função e a substituía por uma versão
ampliada. Isso virou um mecanismo explícito: 37 funções são declaradas com `extensible()` e recebem camadas com
`.extend()`. Exemplos: `update`, `actionA` (botão Usar), `drawPrints` (desenho sobre o chão), `drawWeather`
(desenho acima de tudo), `packChunk`/`unpackChunk` (dados por região), `hydroSave`/`hydroLoad`/`hydroInit`,
`newGame`, `chopHit`, `drawTree`, `treeModel`, `casterShadow`, `solid`. A lista completa e a ordem das camadas
estão em `docs/AUDITORIA_E_MIGRACAO.md`.

### Dependências entre pastas

```
config  ← (todos)              utils ← (todos)
core    ⇄ world ⇄ rendering ⇄ entities ⇄ systems ⇄ ui ⇄ features/amazon
```

Os módulos-base (`config/`, `utils/`, `core/GameState`, `core/extensions`, `world/World`, `world/WorldData`) não
dependem de nada do jogo. Já os sistemas do jogo se chamam mutuamente (o renderizador desenha os animais, os animais
mostram avisos, a interação chama a agricultura…), o que forma ciclos de importação. Isso é permitido em ES Modules
e é seguro aqui porque **nenhum módulo usa outro durante o carregamento** — tudo que tem efeito acontece em
`boot()`. Veja a seção [Limitações](#17-limitações-conhecidas) sobre como reduzir esses ciclos aos poucos.

## 7. Testes

### Testes unitários (não precisam de navegador)

```bash
npm test
```

Cobrem: mecanismo de extensões, compactação dos saves (RLE/base64/quantização), funções matemáticas e gerador
aleatório com semente, decodificação do mundo (somas de verificação idênticas às do decodificador original) e
compatibilidade com um save real gerado pelo arquivo original.

### Testes de regressão (comparação com o original)

Rodam o `legacy/Vale_do_Campo_V64.html` e o projeto modular lado a lado no Chromium, em ambiente determinístico
(aleatoriedade com semente, relógio e quadros controlados), executam os mesmos cenários e comparam **cada pixel** das
capturas e **cada byte** do localStorage.

```bash
npm install --no-save playwright
npx playwright install chromium
npm run test:regression                    # cenários basic, full, touch, load
npm run test:regression -- --target=dist   # compara o build de produção (rode npm run build antes)
```

Cenários: `basic` (andar, ações, inventário, mapa), `full` (ferramentas, tempestade, entardecer, noite com tocha e
lobisomem, interior da casa, dormir, troca de região), `touch` (celular em paisagem: joystick, botões, hotbar),
`load` (carrega um save real do original). Divergências são salvas em `tests/regression/output/`.

O chão de grama novo (seção 11) é uma mudança visual intencional, então nas comparações a versão modular roda com
`window.__VDC_LEGACY_GROUND = true` (`src/config/groundStyle.js`), que volta à grama e à borda de lago antigas; todo o
resto da cena continua idêntico pixel a pixel. Um passo final do teste roda o jogo normal e confere que a textura nova
carrega e desenha sem erros.

## 8. Build de produção

```bash
npm run build     # gera dist/
npm run preview   # serve dist/ em http://localhost:4173 para conferir
```

O build usa caminhos relativos (`base: './'`), então funciona na raiz de um domínio e também dentro de uma subpasta.

## 9. Publicando na Netlify (mantendo o site atual)

Você **não** precisa criar outro site. Escolha uma das opções no painel do site que já existe:

**Opção A — Git (recomendada, publica a cada `git push`)**

1. Coloque o projeto em um repositório (GitHub/GitLab/Bitbucket):
   `git init && git add . && git commit -m "Vale do Campo modular" && git remote add origin <url> && git push -u origin main`
2. Na Netlify: *Site configuration → Build & deploy → Continuous deployment → Link repository* e escolha o repositório.
3. Confira os campos (o `netlify.toml` já os define): **Build command** `npm run build` · **Publish directory** `dist`.
4. Faça o deploy. O endereço do site continua o mesmo.

**Opção B — Arrastar e soltar**

1. No seu computador: `npm install` e `npm run build`.
2. Na Netlify, aba *Deploys* do site existente, arraste a **pasta `dist/`** para a área "Drag and drop".

Não é preciso configurar redirecionamentos (o jogo tem uma única página) nem variáveis secretas (o jogo não usa
serviços externos).

**Atenção aos saves dos jogadores:** o progresso fica no navegador de cada jogador, ligado ao endereço do site.
Mantendo o mesmo domínio, os saves continuam valendo — o formato e as chaves não mudaram.

## 10. Salvamento

O jogo salva automaticamente a cada 60 s, ao ocultar a aba (`visibilitychange`), ao sair da página (`pagehide`), ao
dormir e ao trocar de região. O formato é exatamente o do V64:

| Chave (localStorage) | Conteúdo | Módulo |
| --- | --- | --- |
| `valeDoCampo_v53m` | partida: `S`, mapa da região atual (RLE+base64), plantações, vaca e rebanho, galinhas, minhocas, ninhos, árvores, fauna, gestação — versão `v:19` | `core/SaveManager.js` |
| `valeDoCampo_hydro_v53m` | hidrologia da região atual | `world/hydrology/Hydrology.js` |
| `valeDoCampo_alel_v2` | aleloquímicos no solo | `world/Allelopathy.js` |
| `valeDoCampo_amz_v1` | mudas, frutos caídos, troncos, serrapilheira e colmeias | `features/amazon/AmazonEcology.js` |
| `valeDoCampo_inst_meta53m` | animais e chuva das regiões fora da tela, regiões visitadas | `world/Instances.js` |
| `valeDoCampo_weather_v3` | clima do dia | `world/WeatherSystem.js` |
| `valeDoCampo_quests_v1` | missões da vila | `world/village/Quests.js` |
| `valeDoCampo_graphics_v2` | opções do menu | `config/settings.js` |
| IndexedDB `valeDoCampo_inst53m` (reserva: `vdc53_c_*` no localStorage) | regiões empacotadas | `world/InstanceStore.js` |

Para mudar o formato no futuro: aumente o número de versão (`v:19` → `v:20`) em `save()`, aceite as duas versões em
`load()` e converta a antiga ao carregar (veja `core/SaveMigrations.js`, que guarda os conversores de versões ainda
mais antigas). Nunca renomeie uma chave sem ler a antiga primeiro, ou os jogadores perdem o progresso. O teste
`tests/systems/saveFormat.test.js` usa um save real do original para garantir a compatibilidade.

## 11. Como adicionar sprites

### Chão de grama

O chão usa a textura `public/assets/sprites/ground/grass.png` (256×256 px = 16×16 tiles de 16 px, sem emendas). Cada
tile desenha o seu pedaço pela posição (`tx % 16`, `ty % 16`) em `rendering/TileRenderer.js`; se a imagem ainda não
carregou, o jogo desenha a grama lisa antiga. Para trocar a textura, substitua o PNG por outro quadrado cujo lado seja
múltiplo de 16 e que se repita sem emendas (`npm test` confere isso). Para regerar a atual:

```bash
python3 tools/ground/make-grass.py            # cores do jogo (verde um pouco mais vivo que a referência)
python3 tools/ground/make-grass.py --fiel     # cores exatamente como na ilustração de referência
python3 tools/ground/make-grass.py --matiz=30 --sat=1.2   # ajuste manual
```

(Requer Python com Pillow e numpy; é uma ferramenta opcional, fora do jogo.) A borda dos lagos usa as cores da grama
nova em `rendering/LakeRenderer.js`.

### Outros sprites

1. Salve a imagem (PNG ou WebP, fundo transparente, sem suavização) em `public/assets/sprites/<categoria>/`.
2. Carregue-a pelo caminho relativo a `public/assets`:

```js
import { assetUrl } from '../utils/assets.js';

const PATO_IMG = new Image();
PATO_IMG.src = assetUrl('sprites/animals/pato.webp');   // public/assets/sprites/animals/pato.webp

// ao desenhar (pixel art nítido: coordenadas inteiras e sem suavização)
if (PATO_IMG.complete && PATO_IMG.naturalWidth) {
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(PATO_IMG, quadro * 16, 0, 16, 16, Math.round(x - 8), Math.round(y - 14), 16, 16);
}
```

Para sprites desenhadas muitas vezes por quadro, copie para um canvas quando carregar
(`bakeImg` em `rendering/SpriteUtils.js`), como faz o resto do jogo. Imagens usadas pelo CSS ficam em
`src/assets/ui/` e são referenciadas com `url(../assets/ui/arquivo.webp)`.

## 12. Como adicionar novos animais

Um animal precisa de **estado**, **atualização**, **desenho** e, se quiser, **persistência**. Exemplo completo de um
pato que passeia perto da casa — crie `src/entities/farm/Ducks.js`:

```js
import { TS, OX, OY } from '../../config/constants.js';
import { sleeping } from '../../core/GameState.js';
import { update } from '../../core/GameUpdate.js';
import { ctx } from '../../rendering/Canvas.js';
import { entityProviders } from '../../rendering/Entities.js';
import { hydroSave, hydroLoad } from '../../world/hydrology/Hydrology.js';
import { newGame } from '../../core/NewGame.js';
import { INST } from '../../world/Instances.js';
import { chxWalkOK } from './Chickens.js';

const KEY = 'valeDoCampo_ducks_v1';          // chave NOVA: não reutilize chaves existentes
let ducks = [];

function spawn() { ducks = [{ x: (20 + OX) * TS, y: (22 + OY) * TS, tx: 0, ty: 0, t: 0 }]; }

function tick(dt) {
  if (sleeping || !INST.homeAct) return;
  for (const d of ducks) {
    if ((d.t -= dt) <= 0) { d.tx = d.x + (Math.random() - 0.5) * 60; d.ty = d.y + (Math.random() - 0.5) * 60; d.t = 3; }
    const dx = d.tx - d.x, dy = d.ty - d.y, L = Math.hypot(dx, dy) || 1, s = Math.min(12 * dt, L);
    const nx = d.x + (dx / L) * s, ny = d.y + (dy / L) * s;
    if (chxWalkOK(nx, ny)) { d.x = nx; d.y = ny; }
  }
}

function draw(d) { ctx.fillStyle = '#f2f2e8'; ctx.fillRect(Math.round(d.x) - 3, Math.round(d.y) - 5, 6, 5); }

export function installDucks() {
  spawn();
  update.extend((prev) => function (dt) { prev.apply(this, arguments); tick(dt); });     // atualização
  entityProviders.push((ents) => {                                                        // desenho (ordem Y + sombra)
    if (!INST.homeAct) return;
    for (const d of ducks) ents.push({ k: d.y, sh: [d.x, d.y, 6, 5], draw: () => draw(d) });
  });
  hydroSave.extend((prev) => function () {                                                // salvar
    prev.apply(this, arguments);
    try { localStorage.setItem(KEY, JSON.stringify(ducks)); } catch (e) {}
  });
  hydroLoad.extend((prev) => function () {                                                // carregar
    prev.apply(this, arguments);
    try { const d = JSON.parse(localStorage.getItem(KEY) || 'null'); if (Array.isArray(d)) ducks = d; } catch (e) {}
  });
  newGame.extend((prev) => function () { const r = prev.apply(this, arguments); spawn(); return r; });   // novo jogo
}
```

Depois, em `src/core/Game.js`, importe e chame `installDucks()` **no fim** de `boot()` (antes de `startLoop()` não
importa: o laço só roda no quadro seguinte). Para um animal selvagem com fome, fuga, predação e sprites por
animação, use como modelo `entities/wild/Fauna.js` (tabela `FA_SP` com os parâmetros por espécie) — novos
herbívoros simples podem ser só uma entrada nova em `FA_SP` + `FA_SRC`, com sprites em
`public/assets/sprites/animals/<especie>/`.

## 13. Como criar novos sistemas

1. Crie o módulo na pasta do domínio (`world/`, `systems/`, `entities/`…), com um comentário no topo dizendo o que ele faz.
2. Importe apenas o que usar. Não leia nada de outros módulos no nível de topo (fora de funções): faça isso na sua
   função `installX()`, que roda em `boot()`.
3. Conecte-se pelos pontos de extensão em vez de editar funções de outros sistemas:
   - lógica por quadro: `update.extend(...)`
   - botão Usar: `actionA.extend((prev) => function () { if (meuSistemaTratou()) return; return prev.apply(this, arguments); })`
   - desenho sobre o chão: `drawPrints.extend(...)` · acima de tudo: `drawWeather.extend(...)` · entidades: `entityProviders.push(...)`
   - fim do dia (dormir): `ecoDaily.extend(...)` ou `hydroDaily.extend(...)`
   - dados por região: `packChunk.extend(...)` / `unpackChunk.extend(...)` / `genNewChunk.extend(...)`
   - save global: `hydroSave.extend(...)` / `hydroLoad.extend(...)` · novo jogo: `newGame.extend(...)`
4. Registre o `installX()` em `core/Game.js`.
5. Rode `npm test` e `npm run test:regression` para conferir que o resto do jogo não mudou
   (a regressão só deve acusar diferenças quando seu sistema altera de propósito o que aparece na tela).

## 14. Onde alterar configurações, controles e parâmetros

| O que | Onde |
| --- | --- |
| Resolução lógica, tile, tamanho das regiões, duração do dia | `src/config/constants.js` |
| Velocidade, cultivos, preços | `src/config/balance.js` · corrida: `src/entities/PlayerMovement.js` (`RUN_MULT`, `RUN_COST`) |
| Itens, ferramentas, ícones | `src/systems/InventorySystem.js` |
| Opções gráficas padrão e níveis de qualidade | `src/config/settings.js` |
| Teclas | `src/core/InputManager.js` · inventário: `src/ui/InventoryUI.js` (I) · mapa: `src/ui/MapUI.js` (M) |
| Joystick e botões de toque | `src/ui/MobileControls.js` (zona morta 0,12) e `src/styles/mobile.css` (tamanho/posição) |
| Clima por estação (chances de chuva) | `planWeather()` em `src/world/WeatherSystem.js` |
| Cores do dia/noite | `AMB` em `src/rendering/LightingSystem.js` |
| Governador de desempenho (FPS) | `frame()` em `src/core/GameLoop.js` |
| Volume geral | `MASTER` em `src/systems/audio/MasterVolume.js` |
| Missões e vendedor | `src/world/village/Quests.js`, `src/world/village/Vendor.js` |
| Parâmetros das espécies (fauna, onça, sucuri, árvores amazônicas) | `FA_SP` em `entities/wild/Fauna.js`, `JG` em `Jaguar.js`, `ANA` em `Anaconda.js`, `SP` em `features/amazon/AmazonTrees.js` |

## 15. Depuração

Abra o jogo com `?debug` (ex.: `http://localhost:5173/?debug`; no `npm run dev` já fica ativo). No console do navegador:

```js
VDC.run('S.min = 1100')                       // pula para a noite
VDC.run('S.coins += 5000')
VDC.run('climate.day = S.day; climate.kind = 3; climate.start = 0; climate.end = 1190')   // tempestade agora
VDC.run('dormir(false)')                      // dorme e avança o dia
VDC.modules['world/Instances'].INST           // qualquer módulo
```

### Chaves da URL (para testes)

Acrescente no fim do endereço do jogo (ex.: `http://localhost:5173/?fps`; para juntar duas, use `&`: `?fps&cpu`). Sem nenhuma chave, o jogo roda normal.

| Chave | O que faz |
|---|---|
| `?debug` | libera o `VDC` no console (no `npm run dev` já fica ativo) |
| `?fps` | mostra fps, tempo de lógica, de desenho e de interface, resolução e qualidade |
| `?bench` | teste de desempenho automático (uns 5 min; não grava o seu save; no fim há o botão "Recarregar o jogo") |
| `?canvas` | desliga o PixiJS e desenha tudo em Canvas 2D (plano B; o PixiJS é o desenhista padrão) |
| `?copia` | copia o quadro do PixiJS para o canvas do jogo (só para testes que leem pixels) |
| `?pixi` | só mostra um aviso na tela dizendo se o PixiJS ligou |
| `?matocache` | mato em imagens prontas (experimental; deixou o celular lento: fica desligado) |
| `?cpu` | todos os canvases 2D desenham na CPU e não na placa de vídeo (experimental; pode ser melhor ou pior, compare com o `?fps`) |
| `?safe` | desliga as otimizações opcionais (grama parada, fluxo do rio, camadas da atmosfera) |
| `?cache` / `?nocache` | liga / desliga o cache do chão (desligado por padrão: piscava em algumas placas de vídeo) |
| `?desync` | canvas "desincronizado" (pisca em alguns aparelhos; só para teste) |

## 16. Solução de problemas

| Problema | Solução |
| --- | --- |
| `npm` não é reconhecido | Instale o Node.js LTS e reabra o terminal ([seção 2](#2-requisitos-e-instalação)). |
| Tela preta com "Não foi possível iniciar o jogo… file://" | Abra pelo `npm run dev` ou `npm run preview`, não pelo arquivo. |
| Porta 5173 ocupada | O Vite escolhe a próxima livre (veja o endereço no terminal), ou `npm run dev -- --port 3000`. |
| Celular não abre o endereço "Network" | PC e celular na mesma rede; libere o Node.js no firewall do Windows. |
| Sem som | Os navegadores só liberam áudio depois de um toque/tecla: toque na tela ou use o botão 🎵. |
| Jogo lento no celular | Menu: Qualidade "Baixa", Sombras "Leves" ou "Desligadas", Resolução "1x". O governador já reduz sozinho quando o FPS cai. |
| Quero começar do zero | Menu → **Novo jogo**. Para apagar tudo: ferramentas do navegador → Aplicativo → Armazenamento → limpar dados do site. |
| Build na Netlify falhou | Confira no log se o comando é `npm run build` e a pasta `dist`; `NODE_VERSION` está em `netlify.toml`. |
| Erro depois de editar o código | Veja o console (F12). Rode `npm test`; para mudanças em sistemas existentes, `npm run test:regression`. |

## 17. Limitações conhecidas

Resumo (detalhes e evidências em `docs/AUDITORIA_E_MIGRACAO.md`):

- **Acoplamento entre sistemas:** 75 dos ~110 módulos formam um grande ciclo de importações (herdado de um código que
  era um único escopo global). É seguro porque nada é executado durante o carregamento dos módulos, mas o ideal é
  reduzir aos poucos: mover leituras compartilhadas para `core/GameState`/`world/World` e trocar chamadas diretas por
  pontos de extensão. Recomenda-se fazer isso um sistema por vez, sempre com a regressão passando.
- **Gigante triste** (`entities/Giant.js`): já no original o sistema existe mas não está ligado ao jogo.
- **Conversores de saves V17/V18** (`core/SaveMigrations.js`): o V64 não os usa; mantidos como referência.
- **"Novo jogo"** não zera as missões da vila (`valeDoCampo_quests_v1`), como no original.
- O painel de escolha manual de clima existe no HTML/código, mas fica oculto pelo CSS (como no original).
- O `package-lock.json` é criado no primeiro `npm install` (não pôde ser gerado no ambiente da migração).
