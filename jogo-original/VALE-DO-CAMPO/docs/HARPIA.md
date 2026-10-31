# A harpia (*Harpia harpyja*)

Predador de topo, aéreo e diurno. No jogo vive um **casal raro** (fêmea e macho) na copa de uma **sumaúma adulta** (as sumaúmas gigantes são preferidas). Passa quase todo o tempo
pousada, observando; de vez em quando caça com um razante. Código: `src/entities/wild/Harpy.js` · números: `src/config/harpia.js` · sons: `src/systems/audio/HarpySounds.js` ·
sprites: `tools/harpia/make-harpia.py`. São regras de simulação inspiradas na biologia, **não medidas da espécie**.

## O que ela faz (estados)

| Estado | O que é | Quando |
|---|---|---|
| `hrest` repousando | pousada quieta na copa (à noite dorme) | 40 a 110 s |
| `hwatch` observando | procura presas de cima | 25 a 70 s |
| `htrack` rastreando | acompanha uma presa que viu | 2 a 5 s |
| `hprep` preparando | se posiciona antes do ataque | 1 a 2,2 s |
| `hstoop` razante | mergulho com as garras à frente; acelera até 205 px/s | até agarrar ou errar |
| `hfeed` comendo | pousa ao lado da presa, anda até ela e come | 14 a 22 s |
| `hroam` voando | voo planado entre poleiros (a árvore-ninho ou outra árvore alta por perto) | 10 a 24 s |
| `hwarn` aviso | levanta a crista e grita para quem chegou perto do ninho | 3,5 s |
| `hdefend` defesa | investe contra o jogador que ficou perto do ninho depois do aviso | 1 investida |
| `havoid` evitando | foge de uma onça que chegou perto dela no chão | 20 a 35 s |
| `hchase` expulsando | expulsa outra harpia que entrou no território | até 12 s |

Sem presa à vista, ela fica pousada ou observando cerca de 80% do tempo. Regras fundamentais (do texto de biologia): não ataca tudo que vê; não depende só da fome
(caça oportunista: a chance de decidir atacar uma presa que vê sobe com a fome, de 25% a 85%); não confunde defesa com caça; evita confrontos desnecessários.

## Presas e predadores no jogo

O jogo não tem macacos nem preguiças (as presas principais de verdade). Com os animais que existem:

| Animal | Para a harpia | Por quê |
|---|---|---|
| Lebre | **presa** | mamífero pequeno e isolado |
| Galo-lira | **presa** | ave de porte médio, baixa |
| Galinha | **presa** | ave isolada (todos os animais valem igual: não há regra especial para a fazenda) |
| Filhote de cervo e de queixada | **presa, só a cria** | "filhotes de mamíferos terrestres"; só se não houver adulto por perto (cervo 48 px, queixada 52 px; bando de 2 ou mais enfrenta a ave) |
| Cervo e queixada adultos, vaca, bezerro | **não ataca** | grandes demais |
| Raposa, sucuri | não é presa | o texto não cita |
| Onça-pintada | **perigo** | no chão, a harpia decola (`hrest`/`hfeed` a menos de 90 px da onça) |
| Jogador | só defesa do ninho | ver abaixo |

As presas a temem: lebre e galo-lira percebem a harpia de longe (45 px passeando, 95 rastreando, 190 no razante); as galinhas a avistam de 80 a 210 px.

## Árvore-ninho e sumaúma gigante

- A árvore-ninho é uma **sumaúma adulta** (fase 6 ou 7); se não houver, uma castanheira. É sorteada com **peso 8 para as gigantes** (por exemplo, 3 gigantes entre 24 sumaúmas
  são escolhidas em ~55% das vezes). Cada casal tem a sua árvore, nunca a de outro casal. Se a árvore é cortada, ela escolhe outra.
- **Sumaúma gigante:** 5% das sumaúmas (sorteio pela posição do tile, igual sempre, não vai para o save) ficam **30% maiores** (altura, copa, tronco, sombra) a partir da fase "Jovem".
  Config em `src/config/sumaumaGigante.js`; o painel da árvore mostra "🌟 GIGANTE (+30%)".
- Ela pousa na **copa** (86% da altura da árvore). Como o jogo é visto de cima, a ave aparece acima da base da árvore, desenhada por cima da copa.
- *Etapa 2 (ainda não feita):* o ninho na forquilha da copa (sem ovos no começo; os ovos aparecem no desenho do ninho depois do acasalamento), incubação de 52 a 56 dias, filhote, cainismo e primeiro voo.

## Defesa do ninho (nunca ataca o jogador longe dele)

1. O jogador a menos de **170 px** da árvore-ninho: ela levanta a crista e grita (aviso, com som de alerta repetido).
2. Se o jogador sai (além de 195 px), ela se acalma.
3. Se continua a menos de **85 px** depois dos 3,5 s do aviso, ela **investe** uma vez (8 de vida, empurrão) e se afasta; espera 45 s antes de poder atacar de novo.
4. Entre 85 e 170 px ela só avisa. De dentro de casa ou desmaiado (KO), nada acontece.

## Disputa territorial

O território é a área de **280 px** em volta da árvore-ninho. O casal nunca briga entre si (são parceiros). Uma harpia de **fora** (que não é o par) que entra nele e está **longe do próprio ninho** (mais de 140 px dele) é expulsa por quem está em casa:

1. quem está perto do seu ninho (a menos de 260 px) percebe a intrusa (a cada ~0,25 s) e passa a `hchase`: grita (alerta) e voa até ela a 150 px/s;
2. a menos de 26 px a intrusa passa a `havoid` por 14 s: foge a 120 px/s para longe da residente (sem dano: só exibição, gritos e perseguição), depois volta ao próprio poleiro;
3. a residente volta ao seu poleiro. Quem está fora do próprio ninho não expulsa ninguém, então duas árvores-ninho vizinhas não fazem as duas aves se perseguirem.

Hoje o jogo só tem **um casal**, então a disputa só acontece se uma harpia de fora chegar. Para ver: abra com `?harpia&intrusa` (ou `harpyIntruder()` no console com `?debug`).

## Som

Sintetizado (WebAudio, sem arquivos), **alto e com eco**, porque ela grita da copa ou voando: chega a **950 px** (o mugido da vaca chega a 280), cai devagar com a distância (de longe perde os agudos),
vem do lado onde ela está (estéreo) e passa por um barramento de **dois ecos** que se repetem abafados. Gritos: `chamado` (de dia, a cada 35 a 95 s, voando ou pousada; o par responde com `contato`),
`alerta` (5 piados rápidos: no aviso, na defesa e na expulsão) e `razante` (grito do mergulho). De dentro da casa chega abafado.

## Sprites

4 folhas em `public/assets/sprites/animals/harpy/` (andar, parada, voo, razante), geradas de `tools/harpia/folha-*.jpg` por `python3 tools/harpia/make-harpia.py`: a ferramenta acha a grade do pixel art
original (6,25 px por pixel nas três primeiras, 5 px na última), lê uma cor por pixel (nítido), tira o xadrez, a calça de penas quadriculada e as peças soltas, e reduz cada folha para que a ave tenha o mesmo tamanho (cabeça de ~13 px) pousada, andando, voando e no razante: 50% (em pé), 65% (voo) e 45% (razante, desenhado bem maior).
Tamanhos e âncoras ficam em `src/config/harpiaSprites.js` (gerado). Todas olham para a direita (a esquerda é espelho).

## Testes e para ver no jogo

- `tests/browser/harpia.mjs`: casal, preferência pelas gigantes, quem é presa, ciclo de caça completo, não ataca animal grande, defesa só perto e depois do aviso, longos repousos, expulsão da intrusa, onça, som e desenho.
- `tests/browser/sumauma-gigante.mjs`: 5%, 30% maior, a partir da fase 3, sem save.
- Abra o jogo com **`?harpia`** (te leva até a árvore-ninho, de dia) ou **`?harpia&intrusa`** (uma segunda harpia chega 4 s depois e a disputa começa).
