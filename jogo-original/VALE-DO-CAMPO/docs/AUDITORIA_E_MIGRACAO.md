# Vale do Campo — Auditoria, plano e relatório da migração

Documento técnico da transformação de `Vale_do_Campo_V64.html` (arquivo único, 1,35 MB) no projeto modular.
O original está intacto em [`legacy/Vale_do_Campo_V64.html`](../legacy/Vale_do_Campo_V64.html).

---

## 1. Auditoria do arquivo original

### 1.1 Composição

| Parte | Tamanho | Conteúdo |
| --- | --- | --- |
| `<style>` (2 blocos) | 19 KB | HUD, controles, skin "MediavelFree" (7 imagens em data URI), mapa |
| `<script type="text/plain" id="wdata">` | 454 KB | Mapa projetado do mundo 1000×1000 (deflate + base64) |
| 13 blocos `<script>` | ~880 KB | Código (~540 KB) + 110 sprites em data URI (~347 KB) |

Blocos de script, na ordem em que o navegador os executava:

| # | Conteúdo | Destino no projeto |
| --- | --- | --- |
| 1 (`<head>`) | volume geral: envolve `AudioContext` com ganho 0,22 e passa-baixa | `systems/audio/MasterVolume.js` |
| 2 | **script principal** (777 comandos, 445 funções): mundo, regiões, clima, chuva, água, grama, iluminação, sombras, fauna, vaca, galinhas, vila, hidrologia, ecologia, HUD, entrada, save, laço | ~85 módulos |
| 3 | música lofi (IIFE) | `systems/audio/LofiMusic.js` |
| 4 | carcaças e decomposição | `entities/Carcass.js` |
| 5 | relevo | `rendering/Relief.js` |
| 6 | skin "Pixel Crawler" do jogador + animações de ação | `entities/PlayerSprite.js` |
| 7 | pesca | `systems/Fishing.js` |
| 8 | noite escura, tocha, lobisomem | `rendering/Torch.js`, `entities/Werewolf.js` |
| 9 | gigante triste | `entities/Giant.js` |
| 10 | inventário (IIFE) | `ui/InventoryUI.js` |
| 11 | mapa (IIFE) | `ui/MapUI.js` |
| 12 | névoa e alelopatia (IIFE) | `world/Allelopathy.js` |
| 13 | floresta amazônica, troncos, abelhas (IIFE, 140 KB) | `features/amazon/*` (8 módulos) |

### 1.2 Padrões e riscos encontrados

1. **Escopo global único.** 950 declarações de topo compartilhadas por todos os scripts; 172 variáveis globais
   reatribuídas em vários lugares (`ground`, `S`, `cow`, `chx`, `LK`…).
2. **Monkey patches em camadas.** 37 funções eram substituídas por versões ampliadas
   (`const _u = update; update = function(){ _u(); … }`), algumas por até 6 scripts diferentes (`update`), na ordem de
   carregamento. Em ES Modules uma ligação importada não pode ser reatribuída, então esse era o principal risco.
3. **Patch via `window[n]`.** Um laço trocava `window.updateHerd` etc. por versões que só rodam na fazenda. Ele também
   listava `ggTick`, que ainda não existia naquele momento — portanto nunca foi protegida (comportamento mantido).
4. **Ordem de inicialização significativa.** O save é carregado no fim do script 2, **antes** dos scripts 3–13
   registrarem suas extensões; o script 13 então relê o save para completar os dados amazônicos. O primeiro quadro só
   roda depois de todos os scripts (DOMContentLoaded).
5. **Função redefinida.** `drawPlayerBase` é declarada no script 2 e redeclarada no 6; o navegador usa sempre a do 6.
6. **Comunicação por `window`.** `window.alel`, `amzPad`, `amzBig`, `amzBorn`, `amzHPmax`, `faEatDrop` (lidos por outros
   scripts); `window.NTK`, `torchApply`, `wolfEnt` (funções globais testadas antes do uso); `window.AMZ`, `TRONCO`,
   `ABELHAS`, `fogBase`, `alResetFog`, `amzSp`, `AmzArvore` (só para depuração).
7. **Declarações que dependem de efeitos anteriores** dentro dos IIFEs (ex.: o mapa busca `#mapC` logo depois de
   criar o HTML que o contém).
8. **Dados embutidos**: 116 imagens em base64 e o mapa do mundo dentro do HTML.

### 1.3 Código sem uso (preservado e identificado)

Detectado por análise de escopo (nenhuma referência em todo o programa):
`castShadow`, `pickCowDir`, `cowStart`, `cowGoal`, `B_TINTS`, `bTintC`, `hydroTool`, classe `MapaEcologico`,
`fishSprites`, `FRN`, `FRC`, `drops`, `grassCtx`, `VOX`, `KEY2`, `npcPrevX/Y`, `K` e `lastTip` (amazônia),
`migrateV17`, `migrateV18`, `migrateWidth`, `migrateHydro` (conversores de saves antigos), a skin antiga do jogador
(`drawPlayerBase` do script 2 — renomeada para `drawLegacyPlayerBase`) e o **gigante triste** (`ggTick`, `giantEnt`
nunca são chamados: a funcionalidade existe no código mas não está ligada ao jogo). Nada disso foi apagado.

### 1.4 Bugs e problemas encontrados

| Problema | Situação |
| --- | --- |
| `AudioContext` criado e "retomado" a cada quadro antes de qualquer gesto: ~110 avisos no console a cada 6 s (política de autoplay) | **Corrigido** (`systems/audio/AudioSystem.js`): só cria depois do primeiro toque/tecla. Verificado: 0 avisos. |
| `faFruitAt` (frutos caídos contam no habitat da fauna) era local do script 13, mas o script 2 a procurava como global: o recurso nunca funcionava | **Corrigido**: agora é importada de `features/amazon/AmazonEcology.js`. |
| Avisos (`#toast`) com `white-space:nowrap`: textos longos saíam cortados em telas estreitas (visível no celular) | **Corrigido** em `src/styles/ui.css` (quebra de linha, largura máxima). |
| "Novo jogo" remove só a chave legada `valeDoCampo_v1`; missões da vila não são zeradas | Mantido (documentado). O resto é sobrescrito pelo próximo salvamento. |
| Painel manual de clima oculto por CSS e botão sempre volta ao automático | Mantido como no original. |
| Título da página diz "V56" | Mantido (identidade original). |

As três correções foram aplicadas **depois** de provar a equivalência exata da migração (seção 4) e são as únicas
alterações intencionais de comportamento.

**Alteração posterior (pedido do usuário):** o chão de grama passou a usar uma textura própria
(`public/assets/sprites/ground/grass.png`, feita a partir da paleta de uma ilustração de referência) e a borda dos lagos
ganhou as cores combinando (`rendering/LakeRenderer.js`). Isso foi feito depois da prova de equivalência. Para manter o
teste de regressão útil, a chave `LEGACY_GROUND` (`config/groundStyle.js`) devolve o visual antigo apenas nos testes, e
nesse modo as quatro baterias continuam com 0 pixels diferentes. Como `src/` agora tem edições manuais, `tools/migration`
não deve mais ser rodada sobre ele.

---

## 2. Inventário de funcionalidades e verificação

Legenda: **R** = coberto pelos testes de regressão (pixels e save idênticos ao original) · **U** = teste unitário ·
**M** = migrado pela ferramenta com ligações verificadas, mas não exercitado diretamente pelos cenários.

| Funcionalidade | Existe no original | Verificação |
| --- | --- | --- |
| Movimento com aceleração, 8 direções, corrida com energia | sim | R (teclado e toque) |
| Teclado (WASD/setas, Shift, Espaço/E, X, 1–9, I, M, Esc) | sim | R |
| Joystick virtual e botões de toque (Usar, Correr, Entrar, Dormir, hotbar) | sim | R (cenário `touch`, viewport de celular em paisagem) |
| Paisagem/redimensionamento/resolução adaptativa 1×–3× | sim | R (960×540 e 844×390 @2×) |
| Câmera presa ao mapa | sim | R |
| Colisões (objetos, água; jogador pode entrar na água) | sim | R |
| Mundo 10×10 regiões, troca de região, simulação fora da tela | sim | R (cenário `full`) |
| Terreno (grama, caminho, pedra, terra, areia, cascalho, neve, vau, leito) e relevo | sim | R |
| Grama persistente: dobra, desgaste, compactação, trilhas, rebrota diária, pegadas, poeira, lama | sim | R |
| Clima por estação, nuvens móveis, chuva local, tempestade, relâmpagos | sim | R (tempestade forçada) |
| Chuva física (gotas, respingos, solo molhado, poças) | sim | R |
| Água: ondas simuladas, reflexos, brilho do sol, imersão do personagem | sim | R |
| Rios com correnteza, dinâmica fluvial, hidrologia, lago que transborda | sim | R (painel de hidrologia nas capturas) / M |
| Ciclo dia/noite, iluminação (lightmap), sombras projetadas por sprites | sim | R (manhã, entardecer, noite) |
| Noite escura, tocha automática com luz e sombras, lobisomem | sim | R (noite) / M (ataque) |
| Partículas, vaga-lumes, atmosfera, vinheta | sim | R |
| Vaca e rebanho: emoções, relações, genética, gestação, bezerros | sim | R (balões de fala) / M (nascimentos) |
| Galinhas, ninhos, minhocas, raposas da fazenda | sim | R / M |
| Fauna selvagem, onça, sucuri, carcaças, peixes | sim | M |
| Aldeã da fazenda, vila, missões, vendedor | sim | R (aldeã) / M (vila) |
| Agricultura (arar, regar, plantar, colher, terra volta a ser grama) | sim | R (ferramentas) |
| Machado com carga, derrubada, troncos caídos, abelhas, mel | sim | M |
| Floresta amazônica (3 espécies, 8 fases, frutos, sementes) | sim | R (árvores e aviso inicial) / M |
| Névoa e alelopatia | sim | R (painel) |
| Casa: interior, porta, cama, dormir e avançar o dia | sim | R |
| Inventário, mapa, HUD, menu de opções, seta da casa | sim | R |
| Áudio sintetizado (passos, mugidos, chuva, trovões, música lofi) | sim | M (áudio desligado no ambiente determinístico; console sem erros no navegador real) |
| Salvar/carregar, autosave, regiões em IndexedDB | sim | R (save byte a byte) + U (formato) + R `load` (save real do original carregado pela versão nova) |
| Configurações (iluminação, sombras, resolução, qualidade, feixes, partículas, volumes, clarões) | sim | M |
| Gigante triste | presente, desligado | M (continua desligado) |

---

## 3. Arquitetura e plano de migração

### 3.1 Estratégia

Reescrever 540 KB de código à mão introduziria regressões impossíveis de rastrear. A migração foi feita por uma
**ferramenta baseada em AST** (`tools/migration/`), que:

1. separa cada script em comandos (preservando todos os comentários);
2. resolve cada identificador por análise de escopo (eslint-scope), sabendo a qual declaração ele se refere;
3. distribui os comandos em módulos segundo um mapa revisado à mão (`tools/migration/map.txt`, ~250 regras);
4. gera `import`/`export` exatos para cada ligação usada entre módulos;
5. transforma reatribuições entre módulos em *setters* (`setGround(...)`, 39 no total);
6. transforma cada monkey patch em uma camada explícita `f.extend((prev) => function(){…})` (37 funções), mantendo o
   corpo original;
7. move todo comando com efeito colateral para funções de inicialização chamadas por `core/Game.boot()` na ordem
   original;
8. extrai as imagens e o mapa do mundo para arquivos;
9. formata tudo com Prettier.

Casos especiais tratados à mão (em `tools/migration/special.js`): o laço `window[n]`, o carregamento do mundo
(agora assíncrono, antes do boot), `window.alel`, o rebanho inicial (`const herd=[cow]` lia outro módulo durante o
carregamento), e os IIFEs autocontidos (lofi, inventário, mapa), que viraram funções de inicialização inteiras para
manter a ordem interna de criação de elementos.

Depois da geração, uma verificação estática (`tools/migration/check.js`) confirma que todo identificador de cada
módulo está declarado, importado ou é do navegador, e que todo import corresponde a um export.

### 3.2 Camadas de extensão (quem estende o quê)

| Função | Camadas registradas (módulos) |
| --- | --- |
| `update` | world/Instances, rendering/Torch, world/Allelopathy, features/amazon/AmazonEcology, FallenLogs, Bees |
| `actionA` (botão Usar) | entities/PlayerSprite, features/amazon/AmazonItems, FallenLogs, Bees |
| `drawWeather` (camada superior) | world/Allelopathy, features/amazon/AmazonRender, FallenLogs, Bees |
| `drawPrints` (sobre o chão) | features/amazon/AmazonRender, FallenLogs, Bees |
| `chopHit` | features/amazon/AmazonEcology, FallenLogs, Bees |
| `hydroInit` / `hydroSave` / `hydroLoad` | world/Allelopathy, features/amazon/AmazonEcology |
| `hydroStep`, `hydroDaily`, `drawHydro` | world/Allelopathy |
| `drawTree` | world/Allelopathy, features/amazon/AmazonRender |
| `treeModel`, `casterShadow`, `drawSapling` | features/amazon/AmazonRender |
| `ecoSync`, `ecoDaily`, `ecoPack`, `ecoLoad`, `treeDrop`, `newGame`, `genNewChunk`, `packChunk`, `unpackChunk` | features/amazon/AmazonEcology |
| `solid` | features/amazon/AmazonItems (raízes das árvores grandes bloqueiam) |
| `ambient`, `applyLighting`, `drawPlayerBase` | rendering/Torch |
| `terrainSpeed` | entities/PlayerMovement (2 camadas) |
| `rainAt` | world/WeatherSystem (chuva orográfica) |
| `updateHerd`, `updateChx`, `updateNinhos`, `updateWrm`, `updateFox`, `updateNpc`, `updateVendor` | world/Instances (só rodam na fazenda/vila) |

A ordem de registro é a de `core/Game.boot()`; a última camada registrada executa primeiro, exatamente como as
reatribuições originais.

### 3.3 Novo ponto de extensão

`rendering/Renderer.js` ganhou `entityProviders` (vazio por padrão, sem efeito no comportamento) para que novos
sistemas acrescentem entidades ao desenho ordenado por Y sem editar `render()`. O exemplo de animal do README foi
executado no navegador para confirmar que funciona.

### 3.4 Dependências

110 arquivos, ~1 100 importações. Os módulos-base não têm dependências do jogo. 75 módulos de sistemas formam um ciclo
de importações, herdado do escopo global do original (todos os sistemas se chamam mutuamente). É seguro porque
nenhum módulo executa código de outro durante o carregamento — verificado no navegador (qualquer acesso antecipado
geraria `ReferenceError` na hora) — e o efeito colateral fica todo em `boot()`. Reduzir esse ciclo exige
redesenhar interfaces sistema a sistema; recomenda-se fazê-lo aos poucos com a regressão como rede de segurança.

### 3.5 Desempenho

O código executado é o mesmo; a diferença estrutural é uma chamada extra por despacho nas 37 funções extensíveis
(`impl.apply(this, arguments)`, sem alocação), equivalente às camadas que já existiam. Os assets passaram a ser
arquivos (cache do navegador, HTML 99% menor). O governador de FPS original foi preservado. Não foi medida taxa de
quadros em aparelhos reais.

---

## 4. Testes executados

Ambiente: Chromium (Playwright 1.63) headless, Node.js 22.

| Teste | Resultado |
| --- | --- |
| Determinismo do próprio harness (original × original) | idêntico |
| `basic` — 9 capturas + localStorage, original × modular sem formatação | **idêntico** (inclusive o estado final do gerador aleatório) |
| `basic` — original × modular formatado (Prettier) | **idêntico** |
| `full` — 10 capturas (ferramentas, tempestade, entardecer, noite com tocha e lobisomem, interior, dormir, troca de região, caminhada na região vizinha, +600 quadros) | **idêntico** |
| `touch` — celular 844×390 @2×, joystick por toque, Correr, Usar, hotbar | **idêntico** |
| `load` — save real gerado pelo original carregado nas duas versões | **idêntico** |
| Build simulado (esbuild, bundle minificado) servido em **subpasta** `/jogo/`, cenários `full` e `touch` | **idêntico** |
| Correções (seção 1.4): única diferença visual = quebra de linha dos avisos; saves idênticos | conforme esperado |
| Console no navegador real (com áudio): original 109 avisos/erros; modular 0 | corrigido |
| `npm test` — 14 testes unitários (extensões, compactação, matemática/RNG, mundo, formato do save) | 14/14 aprovados |
| Verificação estática de ligações de todos os módulos | sem problemas |
| Exemplo "novo animal" do README executado no navegador | funcionou (desenho, movimento, save) |

### Limitações dos testes

- **O Vite não pôde ser executado no ambiente da migração** (sem acesso ao registro npm). O projeto foi validado
  servindo os ES Modules diretamente (equivalente ao `npm run dev`) e com um bundle de produção feito com esbuild
  (mesma semântica do Rollup usado pelo `vite build`). A configuração do Vite é a padrão; rode `npm run build` e
  `npm run test:regression -- --target=dist` no seu computador para a confirmação final.
- Áudio é desligado no ambiente determinístico (não há como comparar som por pixels).
- Não houve teste em aparelhos Android/iOS físicos; o toque foi emulado pelo Chromium (eventos de toque reais via CDP).
- Sistemas que dependem de eventos raros (onça caçando, colmeia caindo, nascimento de bezerros) não são forçados pelos
  cenários; foram migrados pela mesma transformação verificada.

---

## 5. Continuidade

Para refazer a geração (por exemplo, a partir de uma versão nova do HTML), veja `tools/migration/README.md`.
Depois que `src/` passar a ser editado à mão, a ferramenta não deve mais ser usada sobre ele.
