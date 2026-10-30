# Pisoteio, trilhas e mato fechado

Como o caminhar dos bichos (e do jogador) molda o mato, e como o mato e as trilhas moldam o caminhar. Parte já existia no jogo; a parte nova está marcada com **(novo)**.

## O que acontece quando se pisa

Cada tile de grama tem uma grade de 4×4 células (`world/GrassSystem.js`). A cada ~3 px andados, quem pisa (`walkTrample`):

- **desgasta a cobertura** das células ao redor (`grassWear`, 0-255): mais com lama, menos onde já está nu;
- **compacta o solo** (`soilCompact`, 0-255): cresce mais rápido onde a cobertura já se foi;
- **dobra** a grama no sentido do passo e deixa **pegadas** (e poeira, com tempo seco).

Quem pisoteia: o jogador, a aldeã e as vacas (já existia) e **(novo)** a fauna selvagem, cada espécie com o seu peso
(`config/trampling.js`): queixada 1,1 · cervo 1 · onça 0,9 · raposa 0,3 · lebre e galo-lira 0,1 · sucuri 0; filhote conta metade.
Cervo e queixada deixam pegada de casco (como a vaca); as demais, pegada simples.

**Aparência da trilha:** terra marrom (mais clara só quando bem compactada, escurecida com lama), com manchas de textura e borda irregular
(pedaços de 2×2 px nas células menos gastas, em vez de quadrados retos de 4×4). Antes era um retângulo liso e claro que ficava quase branco sob sol e neblina.

## O que o pisoteio faz com as plantas

A cada passo da hidrologia o desgaste médio do tile (`wearT`) e a compactação média (`cmpT`) são recalculados.

| Situação | Efeito |
|---|---|
| desgaste acima de 0,12 | o mato perde 0,8 + 8 × desgaste por passo e **não cresce** (já existia; agora a perda cresce com o desgaste) |
| **(novo)** desgaste forte (≥ 0,20) | planta de **fase 4 cai para a fase 2**, de **fase 3 para a fase 1**, de uma vez (`plantTrampled`) |
| **(novo)** solo compactado | o crescimento do mato cai até 80% (passo e dia da hidrologia) |
| **(novo)** compactação ≥ 0,3 ou mato de fase 4 | **semente de árvore não germina** (falta clareira) |

## O que o mato e a trilha fazem com quem anda (novo)

| Terreno | Velocidade |
|---|---|
| mato de fase 3 (crescido) | ×0,88 |
| mato de fase 4 (fechado) | ×0,60 (cansa atravessar) — vale para o jogador, a vaca, a aldeã, as galinhas e a fauna |
| trilha batida (animais) | até +8% (o jogador já ganhava +7%, e perde com lama) |

## Preferência por trilhas (novo)

- **Caminho (`findPath`)**: deixou de ser uma busca em largura e virou **Dijkstra** com custo por tile. Trilha batida custa até 0,5; mato de fase 3 custa 1,4; fase 4 custa 2,2; o resto custa 1. Num terreno liso o trajeto é o mesmo de antes. O atalho em linha reta que suaviza o caminho só vale se não custar mais que o caminho por tiles, para não cortar mato fechado fugindo da trilha. Usam: vaca, aldeã, galinhas.
- **Fauna selvagem**: ao escolher para onde ir (`faPick`), o bicho dá nota maior ao destino cujo trajeto (3 pontos) passa por tiles batidos. As presas ganham a velocidade da trilha para fugir; a onça usa as mesmas trilhas para se aproximar.
- **Vaca** (`pickCowDir`): já preferia andar sobre desgaste; continua igual.

## Sem pisoteio: o mato fecha

- A trilha se cura sozinha: o desgaste cai com o tempo (`fadeTrails`, `recoverGrassDay`; mais rápido com chuva) e a compactação por último. Já existia.
- O mato volta pelo ciclo normal (broto, fase 2...). **(novo)** Com o solo descompactado ele cresce sem o freio da compactação até a fase 4, que freia quem passa e **bloqueia a germinação de árvores**.
- **(novo)** **Competição:** a cada dia, broto ou planta jovem (fase ≤ 2) ao lado de uma **helicônia adulta (fase 4)** perde 4 de mato por vizinha: a helicônia fechada sombreia e sufoca o resto. A helicônia que floresce perde o caule (ver `PLANTAS.md`), o que reabre a clareira aos poucos.

## Onde mexer

| Arquivo | O quê |
|---|---|
| `src/config/trampling.js` | **todos os números** acima, mais as regras puras (`matoDrag`, `pathCost`, `regressTo`) |
| `src/world/Trails.js` | velocidade no ponto (`plantDrag`, `trailBoost`, `animalSpeed`) e custo do tile (`tilePathCost`) |
| `src/world/PlantSpecies.js` | `plantTrampled` (regressão) e a competição em `plantDaily` |
| `src/world/hydrology/Hydrology.js` | `cmpT`, crescimento com compactação, germinação |
| `src/entities/ai/Steering.js` | `moveEnt` com a velocidade do terreno e o `findPath` por custo |
| `src/entities/wild/Fauna.js` | `faTrample`, `faWorn` (preferência por trilha) |
| `src/entities/PlayerMovement.js` | freada do mato para o jogador |
| `tests/systems/trampling.test.js`, `tests/browser/trampling.mjs` | testes |

## Limites conhecidos

- A fauna só pisoteia na região em que o jogador está (as outras regiões são simuladas em segundo plano, sem trilhas).
- As trilhas não são salvas à parte: o desgaste e a compactação já eram salvos com a região, e `cmpT` é recalculado a cada passo.
- A onça não ganha furtividade extra em trilha; a camuflagem dela continua vindo do mato alto (`config/ecosystem.js`).
