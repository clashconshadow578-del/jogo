# Desempenho do desenho (canvas)

Medido em Chromium sem GPU (compara versões entre si; não é o FPS real do aparelho).

| Mudança | Onde | Estado | Efeito medido |
|---|---|---|---|
| Grama parada com `Path2D` por tile | `GrassSystem.js` (`drawIdleTilePaths`) | sempre ligado | thread JS: grama de ~6,8 → ~2,2 ms/quadro; pixels idênticos |
| Camadas de hidrologia compostas num só `fillRect` | `Hydrology.js` (`lay`/`flushLay`) | sempre ligado | `drawHydro` de ~1,5 ms sai da lista; diferença máx. 3/255 |
| Folga menor do desenho por tile (1 tile à esq./cima, nenhuma extra à dir./baixo) | `Renderer.js` (`gx0..gy1`) | sempre ligado | ~8% menos tiles; imagem idêntica em 160 posições |
| Pedras do vau como sprites | `TileRenderer.js` (`fordStone`) | sempre ligado | 12 `fillRect` → 1 `drawImage` por pedra; idêntico |
| Cache do chão em blocos de 8x8 tiles | `TerrainCache.js` | **desligado**: menu "Cache do chão" ou `?chunks` | PC: quadro ~31,7 → ~24,7 ms (−22%); PC com CPU 4x mais lenta ~102 → ~86 ms; celular emulado ~27,0 → ~24,5 ms; thread JS −42%; diferença máx. 1/255 |

## Cache do chão (por que continua desligado por padrão)

Ele guarda tiles de terreno estáticos em canvases pequenos e copia só os blocos visíveis (cerca de 20 `drawImage`). O autor
original desligou a versão com UM canvas do tamanho do mapa porque, em algumas placas de vídeo, a tela piscava; a hipótese é que
alterar um canvas grande, lido todo quadro, forçava reenvios à GPU. Em blocos pequenos só o bloco alterado é afetado, mas isso
**precisa ser conferido em GPUs reais**. Se não piscar no seu aparelho, ligue por padrão trocando `chunks: false` por `true` em
`src/config/settings.js`.

No PC o cache antes não pegava nada: ele só aceitava grama "parada", e no desktop a camada pré-desenhada fica desligada, então
nenhum tile de grama entrava. Agora a checagem (`tileStill`) independe do modo.

## Não aplicado

- Mato (`drawMato`) em `Path2D` por cor: as lâminas se sobrepõem e a ordem define a cor visível; agrupar mudaria pixels.
- `drawTile` fora do cache: já faz 1 `drawImage` + no máx. 1 `fillRect` por tile de grama.

## Como conferir

```
NODE_PATH=$(npm root -g) DENSE=160 node tests/perf/posgrid.mjs <raiz> saida.json   # hashes: devem ser iguais entre versões
NODE_PATH=$(npm root -g) QS='&chunks' node tests/perf/bench.mjs <raiz> desktop     # tempo com o cache ligado
NODE_PATH=$(npm root -g) node tests/browser/terrain-chunks.mjs                      # cache liga/desliga sem erros
```
