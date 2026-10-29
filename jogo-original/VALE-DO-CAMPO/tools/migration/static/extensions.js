/**
 * Pontos de extensão explícitos.
 *
 * O arquivo original crescia por "camadas": cada novo <script> guardava a função antiga
 * (`const _old = update;`) e reatribuía a global (`update = function () { _old(); ... }`).
 * Em ES Modules uma ligação importada não pode ser reatribuída, então essas funções
 * passaram a ser declaradas com `extensible()` e as camadas são registradas com
 * `.extend()`:
 *
 *   export const update = extensible(function update(dt) { ... });   // módulo dono
 *   update.extend((prev) => function (dt) { prev.apply(this, arguments); meuSistema(dt); });
 *
 * A semântica é exatamente a das reatribuições originais: cada camada recebe a versão
 * anterior (`prev`) e decide se/quando chamá-la. A última camada registrada é a primeira
 * a executar. A ordem de registro está definida em core/Game.js (boot()).
 *
 * Para criar um sistema novo, prefira registrar uma camada aqui a editar a função base.
 */

/**
 * Cria uma função despachante cuja implementação pode ser estendida em camadas.
 * @template {Function} F
 * @param {F} base implementação original
 * @returns {F & { extend(factory: (prev: F) => F): void, base: F, layers: number }}
 */
export function extensible(base) {
  let impl = base;
  function dispatch() {
    return impl.apply(this, arguments);
  }
  dispatch.base = base;
  dispatch.layers = 0;
  dispatch.extend = (factory) => {
    const next = factory(impl);
    if (typeof next !== 'function') throw new TypeError(`extend(${base.name}): a fábrica deve devolver uma função`);
    impl = next;
    dispatch.layers++;
    return dispatch;
  };
  Object.defineProperty(dispatch, 'name', { value: base.name });
  return dispatch;
}
