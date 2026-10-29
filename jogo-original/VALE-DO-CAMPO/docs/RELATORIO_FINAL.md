# Vale do Campo — Relatório final (Especificação A: progressão · Especificação B: cercas, animais, ovos)

## 1. Resumo
- **Progressão (A):** 4 ferramentas melhoráveis (enxada, regador, foice, machado) em 4 níveis, liberadas por missões globais (3/6/9/10); qualidade de colheita (Comum/Boa/Excelente/Premium); drops extras; recuperação de sementes (25% → 95% em 7 melhorias). Texturas das ferramentas do pack Stardew.
- **Cercas (B):** cerca e portão modulares, com prévia de construção, autotile, coleta com o machado, crafting (tecla C / botão 🔨), colisão real para vacas, bezerros e galinhas, portão que o jogador abre e fecha.
- **Animais (B):** atração por comida centralizada (vaca 6 tiles, galinha 5), com histerese, caminho que respeita cercas e retomada do comportamento normal.
- **Ovos (B):** cada galinha adulta põe 1 ovo a cada 24 h de jogo; o ovo é um objeto coletável; sem coleta, eclode após 3 dias de jogo (uma única vez), respeitando o limite de 30 aves.
- **Persistência:** cercas/portões (mapa), ovos, `layNext`/`lastEgg` das galinhas, inventário. Ninhos antigos migram para ovos no mundo.

## 2. Progressão (Spec A)
**Missões necessárias:** melhoria 1 → 3 · 2 → 6 · 3 → 9 · 4 → 10 (exceção ao passo de 3).

| Nível | Nome | Preço (moedas) | Missões |
|---|---|---|---|
| I | Pedra | 300 | 3 |
| II | Ferro | 900 | 6 |
| III | Ouro | 2.500 | 9 |
| IV | Netherita | 7.000 | 10 |

**NPCs (já existentes):** Rosa (enxada, regador) · Tomé (machado) · Luzia (foice) · Gil (sementes).

**Qualidade da colheita (soma 100%):** Comum 70% (×1,00) · Boa 20% (×1,25) · Excelente 8% (×1,75) · Premium 2% (×2,50).
**Extras:** +0 90% · +1 8% · +2 2%.

**Sementes (Gil):**

| Melhoria | Chance de recuperar | Preço |
|---|---|---|
| base | 25% | — |
| I | 35% | 35.000 |
| II | 45% | 42.000 |
| III | 55% | 50.400 |
| IV | 65% | 60.480 |
| V | 75% | 72.576 |
| VI | 85% | 87.091 |
| VII | 95% | 104.509 |
| **Total** | | **452.056** |

Preços **não foram alterados** (35.000 inicial, +20% por melhoria), conforme combinado.

**Análise econômica:** com preços de venda de 35–80 moedas por unidade (valor base), 452.056 moedas só em sementes são muito mais do que as melhorias de ferramentas (10.700 por ferramenta). A melhoria de sementes é, na prática, uma meta de longo prazo; recomenda-se rever o preço apenas se a intenção for torná-la alcançável no meio do jogo — decisão sua.

## 3. Cercas e portões (Spec B)
**Receitas:** cerca = 5 madeira · portão = 10 madeira + 2 fibra vegetal (palha).
**Construção:** item selecionado na barra + botão Usar; prévia verde/vermelha no tile à frente. Recusa: jogador, vaca, bezerro, galinha, raposa, NPC, fauna, ovo, plantação, muda, cogumelo, ninho, água, vau, piso interno, dentro de casa, objeto existente. O portão pode substituir uma cerca (devolve a cerca). Machado recolhe a peça (devolve o item).
**Portão:** Usar alterna aberto/fechado; não fecha com jogador/animal em cima; intervalo de 250 ms.
**Sprites:** folha de sprites enviada por você (20 quadros 120×144 de arte, reduzidos 6:1 para 20×24 px em jogo), montada por `tools/ground/make-fence-sprites.py` a partir de `tools/ground/fence-reference.png`; limpeza de frestas/bordas; travessa vertical que liga postes.

## 4. Animais
| | Vaca | Galinha |
|---|---|---|
| Alimentos | cenoura, abóbora, milho | milho, sementes de cenoura/abóbora/milho |
| Raio | 6 tiles | 5 tiles |
| Distância de parada | 22 px | 13 px |
Histerese 12 px; recálculo de caminho a cada 0,7 s; sem rota → fica parado; fuga de raposa tem prioridade (galinha).
**Colisão:** passos de no máximo 3 px (sem atravessar cerca com dt grande); vacas usam pegada de ≈12 px e passam por portão de 1 tile; "desprender" nunca teletransporta através de cerca; pintinhos/bezerros nunca nascem do outro lado da cerca.

## 5. Ovos
Postura a cada 24 h de jogo (1 dia = 1200 min do relógio do jogo, não do computador); primeira postura de cada galinha deslocada dentro do 1º dia; atraso longo limitado a 3 posturas por atualização. Coleta a até 22 px. Eclosão em 3 dias, uma vez; espera se houver 30 aves ou sem lugar válido. Venda: ovo = 25 moedas.

## 6. Testes
- `npm test`: **69/69** (inclui 33 de progressão e 19 de cercas/atração/ovos).
- Navegador (`NODE_PATH=$(npm root -g) node tests/browser/fences-animals.mjs`): validade de construção, autotile, contenção com dt 0,016/0,05/0,5/2, tremor, portão fechado/aberto, atração (raio, histerese, retomada), ovos (24 h, coleta, 3 dias, limite 30, sem lugar), salvar/recarregar — **todos OK** (5 execuções seguidas).
- Captura visual: `tests/browser/fences-visual.mjs`.
- **Não executado:** build do Vite (registro npm bloqueado pelo proxy).

## 7. Limitações e observações
- Portão exige `palha`, que só vem do buriti.
- Gargalo de sementes no início; seed upgrades somam 452.056 moedas.
- Inconsistência na spec: "seis estágios" vs "sete melhorias" de sementes (implementadas 7).
- Foice com raio maior também aumenta as sementes obtidas.
- Sem limite de pilha no inventário.
- Cerca também bloqueia raposas; vacas em cercado sem água continuam com sede.
- Alcance de 420 px das vacas em torno da fazenda limita onde o cercado pode ficar.
- Licença do pack de texturas das ferramentas e da folha de cercas: desconhecida.
- Picareta não existe no jogo.
- Cantos/T da folha foram compostos a partir do poste e dos braços (a folha trazia peças prontas, mas o autotile por máscara de conexões cobre todas as combinações).
