// Verifica os módulos gerados: imports x exports, nomes não resolvidos, duplicidades.
'use strict';
const fs = require('fs');
const path = require('path');
const acorn = require('acorn');
const eslintScope = require('eslint-scope');
const evk = require('eslint-visitor-keys');

const ROOT = process.argv[2] || require('path').resolve(__dirname, '..', '..', 'src');
const BROWSER = new Set(('window document Math JSON localStorage sessionStorage Object Map Set WeakMap Promise indexedDB undefined Uint8Array Uint16Array Uint32Array Int8Array Int16Array Int32Array Float32Array Float64Array Number String Boolean Array Error TypeError NaN Infinity Symbol Proxy Reflect ' +
  'setTimeout clearTimeout setInterval clearInterval requestAnimationFrame cancelAnimationFrame console atob btoa innerWidth innerHeight matchMedia addEventListener removeEventListener dispatchEvent Image performance parseInt parseFloat isNaN isFinite confirm navigator location fetch Event CustomEvent HTMLCanvasElement OffscreenCanvas devicePixelRatio requestIdleCallback globalThis Function structuredClone queueMicrotask Date RegExp BigInt encodeURIComponent decodeURIComponent').split(/\s+/));
const ALLOWED_UNDEF = new Set(['faFruitAt']); // original: typeof faFruitAt === 'function' (nunca definida globalmente)

function files(dir) { const out = []; for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) out.push(...files(p)); else if (e.name.endsWith('.js')) out.push(p); } return out; }

const mods = new Map();
let problems = 0;
for (const f of files(ROOT)) {
  const src = fs.readFileSync(f, 'utf8');
  let ast;
  try { ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', locations: true, ranges: true }); } catch (e) { console.log('PARSE', f, e.message); problems++; continue; }
  const exports = new Set(), imports = [];
  for (const st of ast.body) {
    if (st.type === 'ExportNamedDeclaration') {
      if (st.declaration) { const d = st.declaration; if (d.id) exports.add(d.id.name); if (d.declarations) d.declarations.forEach(x => exports.add(x.id.name)); }
      for (const s of st.specifiers) exports.add(s.exported.name);
    }
    if (st.type === 'ImportDeclaration') for (const s of st.specifiers) if (s.type !== 'ImportNamespaceSpecifier') imports.push({ from: path.resolve(path.dirname(f), st.source.value), name: s.imported ? s.imported.name : 'default', local: s.local.name });
  }
  const sm = eslintScope.analyze(ast, { ecmaVersion: 2022, sourceType: 'module', childVisitorKeys: evk.KEYS, fallback: 'iteration' });
  const through = new Map();
  for (const r of sm.globalScope.through) { const n = r.identifier.name; if (!BROWSER.has(n) && !ALLOWED_UNDEF.has(n)) through.set(n, (through.get(n) || 0) + 1); }
  mods.set(f, { exports, imports, through, src });
}
for (const [f, m] of mods) {
  const rel = path.relative(ROOT, f);
  for (const [n, c] of m.through) { console.log(`NÃO RESOLVIDO ${rel}: ${n} (${c}x)`); problems++; }
  for (const i of m.imports) {
    const t = mods.get(i.from);
    if (!t) { if (!fs.existsSync(i.from)) { console.log(`IMPORT DE ARQUIVO INEXISTENTE ${rel}: ${i.from}`); problems++; } continue; }
    if (!t.exports.has(i.name)) { console.log(`IMPORT SEM EXPORT ${rel}: ${i.name} de ${path.relative(ROOT, i.from)}`); problems++; }
  }
}
console.log(problems ? `${problems} problemas` : 'OK: nenhum problema de ligação');
process.exit(problems ? 1 : 0);
