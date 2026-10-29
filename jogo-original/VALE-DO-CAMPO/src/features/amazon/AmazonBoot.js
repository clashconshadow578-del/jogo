/**
 * Finalização da floresta amazônica após o carregamento do save: restaura dados das árvores, presenteia sementes e converte árvores antigas.
 *
 * Origem: Vale_do_Campo_V64.html (s13)
 */

import { S } from '../../core/GameState.js';
import { KEY3 } from '../../core/SaveManager.js';
import { amzLoad, fruitFall, restoreExtras, shakeFruits } from './AmazonEcology.js';
import { inspect, NEW_ITEMS, panel } from './AmazonItems.js';
import { spawnPT } from './AmazonRender.js';
import { amzDrops, amzUpgrade, FALL, lightAt, M, mkTree, PT, seasonNow, SP } from './AmazonTrees.js';
import { toast } from '../../ui/Toast.js';
import { ecoStarted, ecoSync, ecoTrees } from '../../world/ecology/TreeEcology.js';

export function bootAmazon() {
  /* ---------------- inicialização ---------------- */
  for (const it of NEW_ITEMS) {
    if (S && S.inv && S.inv[it.id] == null) S.inv[it.id] = 0;
  }

  amzLoad();

  try {
    const sv = JSON.parse(localStorage.getItem(KEY3) || 'null'); // o carregamento inicial do jogo ocorreu antes deste módulo: restaura os dados amazônicos da árvore
    if (
      sv &&
      Array.isArray(sv.eco) &&
      ecoStarted &&
      sv.eco.length === ecoTrees.size &&
      sv.eco.length &&
      ecoTrees.has(sv.eco[0][0])
    ) {
      restoreExtras(sv.eco);
    }
  } catch (e) {
    console.error('amz restore', e);
  }

  if (!ecoStarted) ecoSync();

  if (S && !S.amzGift) {
    S.amzGift = 1;
    S.inv.seedB = (S.inv.seedB || 0) + 3;
    S.inv.seedK = (S.inv.seedK || 0) + 3;
    S.inv.seedS = (S.inv.seedS || 0) + 3;
    setTimeout(
      () =>
        toast(
          '🌳 Floresta amazônica! Ganhou sementes de buriti, castanheira e sumaúma. Use qualquer ferramenta (menos o machado) de frente para uma árvore para ver a ficha dela.',
        ),
      2500,
    );
  } else {
    let any = false;
    for (const [i, a] of ecoTrees)
      if (!a.amz && !a.lg) {
        any = true;
        break;
      }
    if (any) amzUpgrade();
  }

  window.AMZ = {
    panel,
    SP,
    M,
    ecoTrees: () => ecoTrees,
    lightAt,
    upgrade: amzUpgrade,
    inspect,
    mkTree,
    drops: () => amzDrops,
    spawnPT,
    FALL,
    PT,
    seasonNow,
    shakeFruits,
    fruitFall,
  };
}
