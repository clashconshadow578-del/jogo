# O mato do Vale do Campo: helicônia e samambaia

O "mato" de cada tile de grama (`mato[i]`, de 0 a 255, simulado em `world/hydrology/Hydrology.js`) é uma de duas plantas do sub-bosque
amazônico, desenhada em 4 fases. A foice corta (`mato = 4`), o pisoteio mata, a vaca come e a chuva e o solo fazem crescer, como antes; o que
mudou é **o que se vê e que cada espécie se comporta de um jeito**.

| Fase | Mato (0-255) | Aparência |
|---|---|---|
| 1 | 26 a 63 | broto (nem todo tile mostra o seu: nascem aos poucos) |
| 2 | 64 a 119 | planta jovem |
| 3 | 120 a 164 | planta crescida |
| 4 | 165 a 255 | adulta; a helicônia aparece florida |

A fase 4 só é alcançada em solo rico: o mato nunca passa de `255 × (0,3 + 0,7 × nutrientes)`, então precisa de nutrientes acima de ~0,5.

**Começo do jogo:** o jogo novo começa **sem plantas visíveis** (mato 4). Elas nascem e crescem conforme o solo: precisa de umidade (acima de 0,3 a 0,4) e de nutrientes. O teto de mato é `255 × (0,3 + 0,7 × nutrientes)`, e abaixo do mínimo da espécie o solo não sustenta a planta (teto 0): helicônia pede nutrientes ≥ 0,35 (senão o tile só pode ser samambaia) e samambaia ≥ 0,2. Tiles pobres ficam pelados; os ricos e úmidos enchem primeiro. Num save antigo o mato é o que já estava salvo.

**Água e plantas:** a planta aparece sempre que há mato, não importa o nível de água do tile (antes sumia e voltava na borda de poças e rios). As poças de escoamento deixaram de ser desenhadas (a água continua simulada).

**Movimento:** as plantas ficam paradas (sem balanço de vento). Só se mexem quando algo passa por elas: a "dobra" deixada por quem anda (jogador, aldeã, vaca, fauna) empurra a planta no sentido do passo, ela treme um instante e volta (`drawMato`).

**Posição:** cada planta nasce num ponto sorteado dentro do tile (de -7 a +7 px na horizontal e de -5 a +5 na vertical, sorteio fixo por tile),
então o mato não forma grade nem fica sempre no centro. A ordem de desenho segue o pé da planta (`matoDX`/`matoDY` em `world/Vegetation.js`).

## Qual planta nasce onde

A espécie de cada tile é escolhida quando o mato aparece (`world/PlantSpecies.js`) e não muda enquanto ele existir. A chance de ser cada uma
depende de quão perto o tile está do ambiente ideal dela, com um sorteio fixo por tile (o mesmo tile dá o mesmo resultado):

| | Helicônia 🌺 | Samambaia 🌿 |
|---|---|---|
| Sombra das árvores (quadrado 5×5) | meia-sombra | sombra quase total |
| Umidade do solo ideal | alta (0,7) | média-alta (0,55) |
| Água parada no tile (várzea) | gosta (×1,5) | não aguenta (×0,25; e perde 6 de mato por dia) |
| Nutrientes ideais | altos (0,75) | médios (0,6) |
| Crescimento | ×1,35 (rápida) | ×0,7 (lenta e constante) |
| Vida | o caule que floresceu morre: 16% de chance por dia na fase 4 de perder 60 de mato e rebrotar do rizoma | perene: não perde nada por idade |
| Para a vaca | normal | ×0,35 (toxinas: ela evita) |

Os números ficam em `src/config/plants.js` e são os únicos a mexer para equilibrar.

## Como ver os dados no jogo

- **Usar** de frente para um tile com mato, com **qualquer item que não seja ferramenta** (ex.: a cenoura colhida): mostra o nome, a fase e onde a planta nasce.
- Com a **foice**, o aviso de corte diz quantas de cada espécie foram cortadas.

## Dados da vida real

### Helicônia (bananeira-do-mato) — *Heliconia* sp.
- **Nutrientes:** solo muito rico em matéria orgânica (húmus e serrapilheira). Nitrogênio para a folhagem; fósforo e umidade constante e alta para florescer.
- **Onde nasce:** margens de rios, várzeas e clareiras com meia-sombra. Não cresce no escuro total.
- **Crescimento:** rápido; do rizoma à planta adulta florida em 6 a 12 meses.
- **Vida:** perene. O caule que floresce morre depois de se reproduzir, mas o rizoma segue vivo por muitos anos e brota de novo.
- **Cadeia alimentar:** produtor primário. As flores (água da chuva e néctar) sustentam beija-flores, morcegos nectarívoros e insetos; as folhas largas abrigam morcegos e sapos e alimentam lagartas.

### Samambaia amazônica — Pteridophyta
- **Nutrientes:** muito nitrogênio e solo levemente ácido; muita água, mas sem encharcamento.
- **Onde nasce:** chão escuro e úmido da mata fechada, barrancos junto a riachos e troncos de árvores grandes (epífita).
- **Crescimento:** moderado e constante (desenrola as folhas a partir do centro, os báculos), mais lento que o da helicônia.
- **Vida:** perene e muito longeva; uma touceira vive décadas se a umidade se mantiver.
- **Cadeia alimentar:** produtor primário do chão da floresta. Toxinas afastam grandes herbívoros; alimenta besouros, formigas, grilos, caracóis e lesmas. Reproduz-se por esporos (sem flor nem fruto), que alimentam micro-organismos do solo.

(Fonte dos dados: resumo gerado por IA a pedido do dono do jogo; não é revisão botânica.)

## Sprites

`public/assets/sprites/plants/helikonia_1..4.png` e `samambaia_1..4.png` (16 a 34 px de largura, fundo transparente). **As fases 3 e 4 das duas
espécies são ampliadas em 15% quando carregam** (`ESCALA_FASE` em `config/plants.js`, aplicada por `bakeScaled` em `rendering/SpriteUtils.js`, sem
suavização: o pixel art e o alfa 0/255 continuam iguais) para o sub-bosque parecer mais cheio; ficam com 32x25 e 39x38 (helicônia) e 32x28 e 39x38
(samambaia). Os PNGs em si não mudam. Para mudar o tamanho, edite só `ESCALA_FASE`. Saem de
`tools/plants/folha-plantas.jpg` por `python3 tools/plants/make-plants.py` (Pillow, numpy, scipy), que remove o xadrez gravado e as legendas.
Para trocar a arte, edite a folha (mesma grade 2 × 4: linha de cima helicônia, de baixo samambaia) ou substitua os PNGs mantendo os nomes;
`npm test` confere que são RGBA com alfa só 0/255 e que cada fase é maior que a anterior.
Observação: a folha original traz flores vermelhas na fase 4 das duas linhas.

## Código

| Arquivo | Papel |
|---|---|
| `src/config/plants.js` | dados da vida real, parâmetros de jogo, fases (`plantStage`) e texto da inspeção |
| `src/world/PlantSpecies.js` | espécie por tile, ritmo de crescimento, ciclo diário, palatabilidade |
| `src/world/Vegetation.js` | `drawMato` (sprite por espécie e fase), `cutMato`, `inspectMato` |
| `src/rendering/Occlusion.js` | círculo translúcido quando o personagem passa atrás da planta (ver abaixo) |
| `src/world/hydrology/Hydrology.js` | aplica o ritmo da espécie ao crescimento e chama o ciclo diário |
| `tests/assets/plants.test.js`, `tests/browser/plants.mjs` | testes das sprites e do comportamento |

## Quando o personagem passa atrás de uma planta ou árvore

Árvores (comuns e as grandes da Amazônia) e plantas do mato que estão **na frente** do personagem (desenhadas depois dele na ordem Y) **não ficam
translúcidas por inteiro**: só um círculo ao redor do tronco do personagem fica, com a borda em degradê (máscara em `smoothstep`; no centro some
78% do desenho, na borda 0%). Os números ficam em `src/config/occlusion.js` (`raio` 26 px, `nucleo` 8 px, `forca` 0,78, `centroY` 11 px acima
dos pés, `margem` 16 px).

Como funciona (igual no PixiJS e em `?canvas`, que não têm "apagar com máscara"): `rendering/Renderer.js` liga o círculo (`occLigar`) logo depois de
desenhar o personagem; `drawMato`, `drawTree` (`TreeRenderer.js`) e a `drawTree` da Amazônia (`AmazonRender.js`) pedem o contexto com
`occBegin(x, y, w, h)`. Se o círculo não toca o retângulo da planta (o caso comum), recebem o próprio `ctx` e nada muda. Se toca, recebem um canvas
auxiliar do mesmo tamanho, desenham nele como sempre (as mesmas coordenadas do mundo), `occEnd` o fura com a máscara (`destination-out`) e o coloca
na cena, na mesma posição e ordem. Os canvases auxiliares são reaproveitados por tamanho (nada é criado por quadro) e marcados com `__dyn` para
ficar fora do atlas do PixiJS (senão cada quadro recopiaria uma página inteira de 1024x1024).
Teste: `tests/browser/oclusao.mjs` (PixiJS; `CANVAS=1` roda em `?canvas`).
