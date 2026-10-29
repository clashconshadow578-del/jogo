/**
 * Catálogo de itens, ferramentas, inventário inicial e ícones da hotbar.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { UPGRADABLE_TOOLS, toolLevel } from '../config/progression.js';
import { S } from '../core/GameState.js';
import { assetUrl } from '../utils/assets.js';

const ITEMS = [
  { id: 'hoe', n: 'Enxada' },
  { id: 'can', n: 'Regador' },
  { id: 'scythe', n: 'Foice' },
  { id: 'axe', n: 'Machado' },
  { id: 'seedC', n: 'Semente cenoura' },
  { id: 'seedP', n: 'Semente abóbora' },
  { id: 'seedM', n: 'Semente milho' },
  { id: 'seedT', n: 'Semente árvore' },
  { id: 'cenoura', n: 'Cenoura' },
  { id: 'abobora', n: 'Abóbora' },
  { id: 'milho', n: 'Milho' },
  { id: 'madeira', n: 'Madeira' },
  { id: 'fence', n: 'Cerca de madeira' },
  { id: 'gate', n: 'Portão de madeira' },
  { id: 'ovo', n: 'Ovo' },
  { id: 'cogumelo', n: 'Cogumelo' },
  { id: 'bezerro', n: 'Bezerro' },
  { id: 'galinha', n: 'Galinha' },
];

const TOOLS = ['hoe', 'can', 'scythe', 'axe'];

const INV0 = {
  seedC: 0,
  seedP: 0,
  seedM: 0,
  seedT: 0,
  cenoura: 0,
  abobora: 0,
  milho: 0,
  madeira: 0,
  fence: 0,
  gate: 0,
  ovo: 0,
  bezerro: 0,
  galinha: 0,
  seedB: 0,
  seedK: 0,
  seedS: 0,
  buriti: 0,
  palha: 0,
  ourico: 0,
  castanha: 0,
  vagem: 0,
  paina: 0,
};

const ICONS = {
  hoe: '⛏️',
  can: '🚿',
  scythe: '🌾',
  axe: '🪓',
  rod: '🎣',
  torch: '🔥',
  seedC: '🌱',
  seedP: '🌱',
  seedM: '🌱',
  seedT: '🌳',
  cenoura: '🥕',
  abobora: '🎃',
  milho: '🌽',
  madeira: '🪵',
  fence: '🚧',
  gate: '🚪',
  ovo: '🥚',
  cogumelo: '🍄',
  bezerro: '🐮',
  galinha: '🐔',
};

/* Ferramentas usam texturas pixel art (16x16) por nível; os demais itens continuam com emoji. */
/* Peças de cerca e ovo também usam arte pixel art (32x32) em vez de emoji. */
const ITEM_ICON_FILE = { fence: 'fence', gate: 'gate', ovo: 'egg' };

function toolIconSrc(id) {
  if (ITEM_ICON_FILE[id]) return assetUrl(`sprites/items/${ITEM_ICON_FILE[id]}.png`);
  if (id === 'torch') return assetUrl('sprites/tools/torch.png');
  if (UPGRADABLE_TOOLS.includes(id)) return assetUrl(`sprites/tools/${id}_${toolLevel(id)}.png`);
  return null;
}

function itemIcon(id) {
  const src = toolIconSrc(id);
  if (src) return `<img class="ico" src="${src}" alt="" draggable="false">`;
  return ICONS[id] || (id.startsWith('f_') ? '🐟' : '📦');
}

function visItems() {
  return ITEMS.map((it, i) => [it, i]).filter(([it]) => TOOLS.includes(it.id) || S.inv[it.id] > 0);
}

export { ICONS, INV0, ITEMS, TOOLS, itemIcon, visItems };
