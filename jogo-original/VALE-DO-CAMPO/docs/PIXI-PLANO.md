# Plano: levar o desenho para o PixiJS (WebGL)

Estado: **PixiJS não iniciado no código** (ver docs/DESEMPENHO.md para o que já foi feito no canvas). Ele não foi escrito porque, no ambiente em que o jogo foi otimizado, não era possível
instalar nem executar o PixiJS (npm e CDNs bloqueados) e não havia GPU. Código de renderização que nunca rodou não deve ir
para o jogo. Este documento diz por onde começar e como verificar cada passo.

## O que foi medido (Chromium sem GPU, desktop 960x540, relógio real)

Por quadro, JS na thread principal (profiler), antes das otimizações já feitas:

| Parte | ms/quadro |
|---|---|
| `drawTrampledGrass` (grama, caminho completo no PC) | ~6,8 |
| cópia final `mainCtx.drawImage` | ~3,2–4,5 |
| `drawTile` | ~1,7–2,8 |
| `drawHydro` | ~1,3–1,7 |
| resto (árvores, água, sombras, névoa...) | < 0,7 cada |

Já feito no canvas: grama parada com `Path2D` por tile (6,8 → ~2,2 ms) e `drawHydro` com as camadas translúcidas
compostas num só `fillRect` (diferença máxima de 3/255 por canal, em 0,05% dos pixels acima de 2).

## Por que um PixiJS "só de exibição" não adianta

O jogo desenha direto no canvas visível (`#c`, `Canvas.js`), sem quadro intermediário. Mostrar esse canvas como textura do
PixiJS mandaria a imagem inteira para a GPU a cada quadro e exibiria o mesmo resultado: sem ganho e com risco. O ganho está em
**desenhar o chão e a grama como objetos da GPU**, em vez de milhares de `fillRect` por quadro.

## Pontos de corte já identificados

- `src/rendering/Renderer.js` (`render`): ordem do quadro = fundo → `terrainDraw` (cache) → laço por tile
  (`drawTile`, `drawTrampledGrass`, `drawHydro`) → relevo → pegadas → entidades ordenadas por Y (`entityProviders`) →
  iluminação/névoa. O laço por tile é o primeiro candidato.
- `src/rendering/Canvas.js`: `ctx` é uma ligação dinâmica; `setDrawCtx` já permite desenhar as mesmas funções em outro
  contexto. É o ponto para gerar texturas de chão em canvas offscreen e entregá-las ao PixiJS.
- `src/rendering/TerrainCache.js`: cache de tiles estáticos, **desligado** (`?cache`) pelo autor original por flicker em
  algumas GPUs. Qualquer cache em textura precisa ser testado em GPUs reais.
- `src/world/GrassSystem.js`: `tileIdle` separa tiles parados (maioria) dos pisoteados. Parados = um sprite por tile (ou
  por bloco); pisoteados = redesenho só quando `grassDirty`.
- `src/world/hydrology/Hydrology.js` (`drawHydro`): camadas translúcidas por tile já compostas em `lay`/`flushLay`; o
  mesmo cálculo alimenta uma cor por tile (tint) em vez de um retângulo.
- Iluminação e névoa (`LightingSystem.js`) ficam por último: são canvases 480x270 suavizados; viram sprite/filtro.

## Ordem sugerida

1. Montar `package.json` com `pixi.js` e rodar `npm install` num ambiente com acesso à rede.
2. Camada de chão (tiles de textura + `tint` da estação) como `ParticleContainer`/`Tilemap`, atrás de `?pixi`, com volta
   automática ao canvas se a criação do WebGL falhar.
3. Grama parada, depois grama pisoteada, depois hidrologia.
4. Entidades (sprites ordenados por Y) e, por fim, iluminação/névoa.

## Como verificar cada passo (ferramentas já no projeto)

```
NODE_PATH=$(npm root -g) node tests/perf/pix.mjs <raiz> desktop saida.json   # hashes + PNGs dos 3 cenários
NODE_PATH=$(npm root -g) node tests/perf/bench.mjs <raiz> desktop            # tempo de render() (mediana)
NODE_PATH=$(npm root -g) node tests/browser/grass-idle-paths.mjs             # Path2D == camada pré-desenhada
npm test                                                                      # testes unitários
```

Para conferir que cortar o desenho fora da tela não muda pixels: `DENSE=160 node tests/perf/posgrid.mjs <raiz> saida.json` nas duas versões.
`node tests/perf/offscreen.mjs` mostra quantas chamadas de desenho caem fora da tela, por função.

Compare os PNGs de `pix.mjs` entre a versão antiga e a nova (tolerância de poucos níveis por canal) e meça no aparelho real:
o Chromium sem GPU só serve para comparar versões entre si.
