/**
 * Endereço dos arquivos de public/assets.
 *
 * No Vite, `import.meta.env.BASE_URL` vem de `base` em vite.config.js ('./' = caminhos
 * relativos, funciona na raiz do domínio e em subpastas). Sem o Vite (ex.: testes que
 * servem a pasta diretamente), cai em './'.
 */
const env = import.meta.env || {};
const BASE = env.BASE_URL || './';

/** @param {string} path caminho dentro de public/assets, ex.: 'sprites/animals/cow.webp' */
export function assetUrl(path) {
  return BASE + 'assets/' + path;
}
