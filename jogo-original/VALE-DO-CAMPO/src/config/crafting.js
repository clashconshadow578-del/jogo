/**
 * Receitas de fabricação. Tudo que se ajusta (custos, rendimento) fica aqui.
 * Cada receita produz UMA peça. "Fibra vegetal" é a palha (item `palha`, palha de buriti) que já existe no jogo.
 *
 * Origem: novo (sistema de cercas)
 */

export const RECIPES = [
  { id: 'fence', name: 'Cerca de madeira', yields: 1, cost: { madeira: 5 } },
  { id: 'gate', name: 'Portão de madeira', yields: 1, cost: { madeira: 10, palha: 2 } },
];

/** Nomes dos materiais para mensagens (madeira, fibra vegetal). */
export const MATERIAL_NAMES = { madeira: 'madeira', palha: 'fibra vegetal (palha)' };

/**
 * O que falta para fabricar? Função pura.
 * @returns {{ok:boolean, missing:{id:string, need:number, have:number}[]}}
 */
export function missingMaterials(inv, recipe) {
  const missing = [];
  for (const [id, need] of Object.entries(recipe.cost)) {
    const have = inv[id] | 0;
    if (have < need) missing.push({ id, need, have });
  }
  return { ok: missing.length === 0, missing };
}
