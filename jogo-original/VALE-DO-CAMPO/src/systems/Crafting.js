/**
 * Fabricação de cercas e portões. A regra é só esta: confere os materiais, desconta e entrega a peça numa
 * única operação (nunca gasta sem entregar nem entrega sem gastar). Receitas em config/crafting.js.
 *
 * Origem: novo (sistema de cercas)
 */

import { MATERIAL_NAMES, missingMaterials, RECIPES } from '../config/crafting.js';
import { S } from '../core/GameState.js';

export function recipeById(id) {
  return RECIPES.find((r) => r.id === id) || null;
}

/** Texto "faltam 2 madeira e 1 fibra vegetal" a partir da lista de materiais faltantes. */
export function missingText(missing) {
  return (
    'Faltam ' +
    missing.map((m) => `${m.need - m.have} ${MATERIAL_NAMES[m.id] || m.id}`).join(' e ')
  );
}

/**
 * Fabrica uma peça. Devolve {ok, reason?, missing?}.
 * `inv` é só para teste (padrão: o inventário do jogador).
 */
export function craft(id, inv = S.inv) {
  const r = recipeById(id);
  if (!r) return { ok: false, reason: 'Receita desconhecida' };
  const m = missingMaterials(inv, r);
  if (!m.ok) return { ok: false, reason: missingText(m.missing), missing: m.missing };
  for (const [k, n] of Object.entries(r.cost)) inv[k] = (inv[k] | 0) - n;
  inv[r.id] = (inv[r.id] | 0) + r.yields;
  return { ok: true };
}
