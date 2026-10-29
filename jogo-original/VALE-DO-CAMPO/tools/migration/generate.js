// Gera o projeto modular a partir do HTML original.
'use strict';
const fs = require('fs');
const path = require('path');
const walk = require('acorn-walk');
const { plan, isDecl } = require('./plan');
const special = require('./special');

const OUT = process.env.OUT || require('path').resolve(__dirname, '..', '..');
const SRC = path.join(OUT, 'src');
const PUB = path.join(OUT, 'public');

const warnings = [];
const warn = m => warnings.push(m);

function main() {
  const { A } = plan();
  const { scripts, units, bindings } = A;

  // ---------- pais dos nós ----------
  for (const sc of scripts) {
    walk.fullAncestor(sc.ast, (node, _s, anc) => { if (anc.length > 1) node.parent = anc[anc.length - 2]; });
  }
  for (const u of units) u.kind = (isDecl(u.node) && !u.wrapAll ? 'decl' : 'effect');

  // ---------- edições finas por script ----------
  for (const sc of scripts) sc.edits = [];
  const addEdit = (sc, start, end, render, tag) => sc.edits.push({ start, end, render, tag });

  // ---------- ligações mortas/renomeadas ----------
  const renamedDecl = new Map(); // key -> novo nome
  for (const [key, nn] of Object.entries(special.renameDecl)) renamedDecl.set(key, nn);

  // ---------- exposições via window ----------
  // amzPad, amzBig, amzHPmax, faEatDrop: viram declarações exportadas; amzBorn: o local já existe.
  const exposeDecl = new Map(); // name -> binding sintético
  for (const [name, e] of A.windowExpose) {
    if (special.notExposed.has(name)) continue;
    if (special.manualUnits[e.unit.id] || e.synthetic) continue;
    const u = e.unit; const asg = u.node.expression;
    const localKey = e.sid + ':' + name;
    const hasLocal = bindings.has(localKey);
    const refsOutside = A.refs.filter(r => r.exposeUnit === u);
    if (special.windowDebug.has(name)) continue; // API de depuração: mantida em window
    if (hasLocal) {
      // window.amzBorn = amzBorn  -> removido (o módulo exporta amzBorn)
      if (asg.right.type === 'Identifier' && asg.right.name === name) { u.removed = true; continue; }
      throw new Error('exposição com local diferente: ' + name);
    }
    // window.NAME = EXPR -> const NAME = EXPR (declaração exportada)
    const b = { key: 'x:' + name, name, sid: e.sid, unit: u, kind: 'const', refs: refsOutside, module: u.module, synthetic: true };
    bindings.set(b.key, b);
    for (const r of refsOutside) r.key = b.key;
    u.kind = 'decl';
    u.exposeAs = { name, right: asg.right };
    exposeDecl.set(name, b);
  }

  // ---------- referências do tipo window.X (membro) ----------
  for (const sc of scripts) {
    walk.ancestor(sc.ast, {
      MemberExpression(n, anc) {
        if (n.computed || n.object.type !== 'Identifier' || n.object.name !== 'window') return;
        const par = anc[anc.length - 2];
        if (par && par.type === 'AssignmentExpression' && par.left === n) return; // escrita: tratada acima
        const name = n.property.name;
        let key = null;
        if (A.globalDecl.has(name)) key = A.globalDecl.get(name);
        else if (exposeDecl.has(name)) key = exposeDecl.get(name).key;
        else if (A.windowExpose.has(name) && bindings.has(A.windowExpose.get(name).sid + ':' + name) && !special.notExposed.has(name)) key = A.windowExpose.get(name).sid + ':' + name;
        if (!key) return;
        const u = sc.units.find(u => n.start >= u.start && n.start < u.end);
        const r = { key, name, sid: sc.sid, unit: u, id: n, member: true, write: false, read: true, module: u.split ? null : u.module };
        bindings.get(key).refs.push(r);
        A.refs.push(r);
      }
    });
  }

  // ---------- funções estendidas (monkey patches) ----------
  const patched = new Map(); // key -> binding
  for (const b of bindings.values()) {
    if (b.kind !== 'function') continue;
    if (b.refs.some(r => r.write && !r.init)) patched.set(b.key, b);
  }
  for (const name of special.extraExtensible) patched.set(A.globalDecl.get(name), bindings.get(A.globalDecl.get(name)));

  // conversão dos patches
  const patchUnits = new Set();
  const findFuncWrite = (node, fname) => node.type === 'ExpressionStatement' && node.expression.type === 'AssignmentExpression'
    && node.expression.operator === '=' && node.expression.left.type === 'Identifier' && node.expression.left.name === fname
    && /FunctionExpression|ArrowFunctionExpression/.test(node.expression.right.type);
  for (const b of patched.values()) {
    for (const r of b.refs) {
      if (!r.write || r.init) continue;
      const u = r.unit; const sc = u.sc;
      if (special.manualUnits[u.id]) { patchUnits.add(u.id); continue; }
      // Padrão A: { const _x = f; f = function(){...}; }
      if (u.node.type === 'BlockStatement' && u.node.body.length === 2 && u.node.body[0].type === 'VariableDeclaration'
        && u.node.body[0].declarations.length === 1 && u.node.body[0].declarations[0].init && u.node.body[0].declarations[0].init.type === 'Identifier'
        && u.node.body[0].declarations[0].init.name === b.name && findFuncWrite(u.node.body[1], b.name)) {
        const prev = u.node.body[0].declarations[0].id.name;
        const fn = u.node.body[1].expression.right;
        addEdit(sc, u.node.start, u.node.end, () => `${refName(u, b)}.extend((${prev}) => ${textOf(sc, fn.start, fn.end)});`, 'patchA');
        r.handled = true; patchUnits.add(u.id); continue;
      }
      // Padrão B: const _x = f;  (outro comando)  f = function(){..._x...};
      if (findFuncWrite(u.node, b.name)) {
        const fn = u.node.expression.right;
        // procura a captura "_x = f" anterior usada dentro desta função
        const caps = b.refs.filter(q => !q.write && q.unit && q.unit.sc === sc && q.unit.k < u.k && q.id.parent && q.id.parent.type === 'VariableDeclarator' && q.id.parent.init === q.id);
        let cap = null;
        for (const q of caps) {
          const capName = q.id.parent.id.name;
          const used = textOf(sc, fn.start, fn.end).includes(capName);
          if (used) cap = { q, capName };
        }
        if (!cap) throw new Error('patch sem captura: ' + u.id + ' ' + b.name);
        const capUnit = cap.q.unit;
        // a captura deve ser uma declaração isolada "const _x=f;"
        if (!(capUnit.node.type === 'VariableDeclaration' && capUnit.node.declarations.length === 1)) throw new Error('captura composta ' + capUnit.id);
        capUnit.removed = 'capture';
        addEdit(sc, u.node.start, u.node.end, () => `${refName(u, b)}.extend((${cap.capName}) => ${textOf(sc, fn.start, fn.end)});`, 'patchB');
        r.handled = true; patchUnits.add(u.id); cap.q.handled = true;
        continue;
      }
      throw new Error('escrita em função não reconhecida: ' + b.name + ' em ' + u.id);
    }
  }
  // ---------- comandos manuais (antes do cálculo de imports) ----------
  const manualRes = new Map();
  for (const [id, fn] of Object.entries(special.manualUnits)) {
    const u = A.unitById.get(id);
    const res = fn({ u, A });
    manualRes.set(id, res);
    if (res === null) { u.removed = true; continue; }
    if (res.kind) u.kind = res.kind;
    for (const n of res.uses || []) {
      if (n === 'assetUrl') { u.usesAsset = true; continue; }
      const key = A.globalDecl.get(n);
      if (!key) throw new Error('uses desconhecido ' + n);
      const r = { key, name: n, unit: u, id: { start: u.node.start, end: u.node.start }, synthetic: true, write: false, read: true, module: u.module };
      bindings.get(key).refs.push(r); A.refs.push(r);
    }
  }

  // ---------- módulo de cada referência (split) ----------
  for (const r of A.refs) {
    if (r.module) continue;
    const u = r.unit; if (!u) continue;
    if (u.split) { for (const d of u.node.declarations) if (r.id.start >= d.start && r.id.start < d.end) r.module = u.split[d.id.name]; }
    else r.module = u.module;
  }

  // ---------- escritas entre módulos -> setters ----------
  const setters = new Map(); // key -> nome do setter
  const setterName = n => 'set' + n[0].toUpperCase() + n.slice(1);
  for (const b of bindings.values()) {
    if (b.kind === 'function' || b.kind === 'class') continue;
    if (b.refs.some(r => r.write && !r.init && r.module && r.module !== b.module && !r.unit.removed)) setters.set(b.key, setterName(b.name));
  }
  for (const k of special.extraSetters) setters.set(k, setterName(bindings.get(k).name));

  // ---------- nomes por módulo (colisões) ----------
  const modules = new Map(); // nome -> {name, units:[], localNames:Map, imports:Map(key->alias)}
  const modOf = name => { if (!modules.has(name)) modules.set(name, { name, units: [], local: new Map(), imports: new Map(), initOrder: [], inits: new Map(), usesAsset: false, extraImports: new Map() }); return modules.get(name); };
  for (const u of units) {
    if (u.split) { for (const m of new Set(Object.values(u.split))) modOf(m).units.push(u); }
    else modOf(u.module).units.push(u);
  }
  for (const b of bindings.values()) {
    if (b.unit.removed && !b.synthetic) continue;
    modOf(b.module).local.set(renamedDecl.get(b.key) || b.name, b.key);
  }
  // importações necessárias
  const needImport = (m, b) => {
    const M = modOf(m);
    if (b.module === m) return;
    if (!M.imports.has(b.key)) M.imports.set(b.key, null);
  };
  for (const r of A.refs) {
    if (!r.key || !r.module) continue;
    const b = bindings.get(r.key); if (!b) continue;
    if (r.unit && r.unit.removed) continue;
    if (r.handled && !r.write) continue; // captura removida
    needImport(r.module, b);
    if (r.write && !r.init && b.module !== r.module && setters.has(b.key)) modOf(r.module).extraImports.set(setters.get(b.key), b.module);
  }
  // aliases
  for (const M of modules.values()) {
    const taken = new Map(); // nome -> key
    for (const [n, k] of M.local) taken.set(n, k);
    for (const k of M.imports.keys()) {
      const b = bindings.get(k);
      let n = renamedDecl.get(k) || b.name;
      if (taken.has(n) && taken.get(n) !== k) {
        const base = path.basename(b.module);
        n = n + '_' + base;
        warn(`alias: ${M.name} importa ${b.name} de ${b.module} como ${n}`);
      }
      taken.set(n, k);
      M.imports.set(k, n);
    }
  }
  function refName(u, b, pos) {
    const m = pos != null && u.split ? (() => { for (const d of u.node.declarations) if (pos >= d.start && pos < d.end) return u.split[d.id.name]; })() : u.module;
    if (b.module === m) return renamedDecl.get(b.key) || b.name;
    const M = modules.get(m);
    return M.imports.get(b.key) || b.name;
  }

  // ---------- edições de referência ----------
  for (const r of A.refs) {
    if (!r.key || !r.unit || r.unit.removed) continue;
    const b = bindings.get(r.key); if (!b) continue;
    const sc = r.unit.sc;
    if (r.synthetic) continue;
    const nm = refName(r.unit, b, r.id.start);
    if (r.member) { addEdit(sc, r.id.start, r.id.end, () => nm, 'member'); continue; }
    if (r.handled) continue;
    const crossWrite = r.write && !r.init && r.module !== b.module && setters.has(b.key);
    if (crossWrite) {
      const id = r.id, p = id.parent, sn = setters.get(b.key);
      if (p.type === 'AssignmentExpression' && p.left === id) {
        if (p.operator === '=') addEdit(sc, p.start, p.end, () => `${sn}(${textOf(sc, p.right.start, p.right.end)})`, 'setter');
        else if (/^[-+*/%&|^]=$|^(<<|>>>|>>|\*\*)=$/.test(p.operator)) {
          const op = p.operator.slice(0, -1);
          addEdit(sc, p.start, p.end, () => `${sn}(${nm} ${op} (${textOf(sc, p.right.start, p.right.end)}))`, 'setter');
        } else throw new Error('operador de atribuição não suportado ' + p.operator + ' ' + r.unit.id);
      } else if (p.type === 'UpdateExpression') {
        const op = p.operator === '++' ? '+' : '-';
        const stmtCtx = p.parent.type === 'ExpressionStatement' || (p.parent.type === 'ForStatement' && p.parent.update === p) || (p.parent.type === 'SequenceExpression' && p.parent.parent.type === 'ExpressionStatement');
        if (p.prefix || stmtCtx) addEdit(sc, p.start, p.end, () => `${sn}(${nm} ${op} 1)`, 'setter');
        else addEdit(sc, p.start, p.end, () => `(${sn}(${nm} ${op} 1) ${op === '+' ? '-' : '+'} 1)`, 'setter');
      } else throw new Error('escrita não suportada em ' + r.unit.id + ' ' + b.name + ' ' + p.type);
      continue;
    }
    if (nm !== r.name) addEdit(sc, r.id.start, r.id.end, () => nm, 'rename');
  }

  // ---------- declarações renomeadas ----------
  for (const [key, nn] of renamedDecl) {
    const b = bindings.get(key); const n = b.unit.node;
    const idNode = n.type === 'FunctionDeclaration' ? n.id : null;
    if (idNode) addEdit(b.unit.sc, idNode.start, idNode.end, () => nn, 'renameDecl');
  }

  // ---------- declarações de funções estendidas ----------
  for (const b of patched.values()) {
    const n = b.unit.node; const sc = b.unit.sc;
    if (n.type !== 'FunctionDeclaration') throw new Error('estendida não é declaração: ' + b.key);
    modOf(b.module).needsExtensible = true;
    addEdit(sc, n.start, n.end, () => `const ${b.name} = extensible(${textOf(sc, n.start, n.end)});`, 'extensible');
  }

  // ---------- assets (data URIs) ----------
  const assets = special.collectAssets(A, addEdit, textOf, warn);
  for (const a of assets) modOf(a.module).usesAsset = true;

  // ---------- edições manuais ----------
  for (const [id, res] of manualRes) {
    if (res === null) continue;
    const u = A.unitById.get(id);
    if (u.usesAsset) modOf(u.module).usesAsset = true;
    addEdit(u.sc, u.node.start, u.node.end, () => res.code, 'manual');
  }
  for (const [id, list] of Object.entries(special.stringEdits)) {
    const u = A.unitById.get(id); const sc = u.sc;
    for (const [from, to] of list) {
      const p = sc.src.indexOf(from, u.start);
      if (p < 0 || p >= u.end) throw new Error('stringEdit não encontrado em ' + id + ': ' + from);
      addEdit(sc, p, p + from.length, () => to, 'string');
    }
  }
  // exposições convertidas em declaração
  for (const u of units) {
    if (!u.exposeAs) continue;
    const { name, right } = u.exposeAs;
    addEdit(u.sc, u.node.start, u.node.end, () => `const ${name} = ${textOf(u.sc, right.start, right.end)};`, 'expose');
  }

  // ---------- ordenar edições ----------
  for (const sc of scripts) {
    sc.edits.sort((a, b) => a.start - b.start || b.end - a.end);
    for (let i = 1; i < sc.edits.length; i++) {
      const p = sc.edits[i - 1], c = sc.edits[i];
      if (c.start < p.end && c.end > p.end) throw new Error(`edições sobrepostas em ${sc.sid}: ${p.tag}[${p.start},${p.end}] ${c.tag}[${c.start},${c.end}]`);
    }
  }

  // ---------- montagem dos módulos ----------
  const initCalls = []; // {module, name, pos}
  const globalPos = u => scripts.indexOf(u.sc) * 1e5 + u.k;
  const exportsOf = new Map();
  for (const b of bindings.values()) {
    if (b.unit.removed && !b.synthetic) continue;
    const used = b.refs.some(r => r.module && r.module !== b.module && !(r.unit && r.unit.removed) && !(r.handled && !r.write));
    if (used || special.forceExport.has(b.name)) { if (!exportsOf.has(b.module)) exportsOf.set(b.module, new Set()); exportsOf.get(b.module).add(renamedDecl.get(b.key) || b.name); }
  }

  for (const b of bindings.values()) if (b.unit.wrapAll && b.refs.some(r => r.module && r.module !== b.module)) throw new Error('ligação de bloco encapsulado usada fora do módulo: ' + b.key);
  const files = new Map();
  for (const M of modules.values()) {
    const decl = [], inits = new Map();
    for (const u of M.units) {
      if (u.removed) {
        // preserva comentários de cabeçalho de seção
        const lead = u.sc.src.slice(u.start, u.nodeStart);
        if (/\/\*|\/\//.test(lead) && !u.split) decl.push(lead.trimEnd() + '\n');
        continue;
      }
      if (u.split) {
        const ds = u.node.declarations.filter(d => u.split[d.id.name] === M.name);
        if (!ds.length) continue;
        const first = u.node.declarations.find(d => u.split[d.id.name] === M.name) === u.node.declarations[0];
        const lead = first ? u.sc.src.slice(u.start, u.nodeStart) : '\n';
        decl.push(lead + `${u.node.kind} ` + ds.map(d => textOf(u.sc, d.start, d.end)).join(', ') + ';\n');
        continue;
      }
      let txt = textOf(u.sc, u.start, u.end);
      if (!txt.endsWith('\n')) txt += '\n';   // cada comando termina em quebra de linha (protege comentários de linha)
      if (u.kind === 'decl') decl.push(txt);
      else {
        const nm = u.init;
        if (!inits.has(nm)) { inits.set(nm, []); initCalls.push({ module: M.name, name: nm, pos: globalPos(u) }); }
        inits.get(nm).push(txt);
        initCalls.find(c => c.module === M.name && c.name === nm).last = globalPos(u);
      }
    }
    M.declText = decl; M.initText = inits;
  }
  // ordem das inicializações e verificação de intercalação
  initCalls.sort((a, b) => a.pos - b.pos);
  for (const c of initCalls) for (const d of initCalls) if (d !== c && d.pos > c.pos && d.pos < c.last) warn(`intercalação: ${c.module}.${c.name} [${c.pos}..${c.last}] contém ${d.module}.${d.name} @${d.pos}`);

  // imports textuais
  const rel = (from, to) => { let p = path.relative(path.dirname(from), to); if (!p.startsWith('.')) p = './' + p; return p + '.js'; };
  for (const M of modules.values()) {
    const byMod = new Map();
    const add = (mod, spec) => { if (!byMod.has(mod)) byMod.set(mod, new Set()); byMod.get(mod).add(spec); };
    for (const [k, alias] of M.imports) {
      const b = bindings.get(k);
      const orig = renamedDecl.get(k) || b.name;
      add(b.module, alias && alias !== orig ? `${orig} as ${alias}` : orig);
    }
    for (const [sn, mod] of M.extraImports) add(mod, sn);
    if (M.needsExtensible || [...M.imports.keys()].some(k => patched.has(k) && false)) add('core/extensions', 'extensible');
    if (M.usesAsset) add('utils/assets', 'assetUrl');
    for (const [mod, list] of Object.entries(special.extraModuleImports[M.name] || {})) for (const s of list) add(mod, s);
    const lines = [];
    for (const [mod, specs] of [...byMod.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      lines.push(`import { ${[...specs].sort((a, b) => a.localeCompare(b)).join(', ')} } from '${rel(M.name, mod)}';`);
    }
    let out = '';
    const hdr = special.describe(M.name, M);
    out += hdr + '\n';
    out += lines.join('\n') + (lines.length ? '\n\n' : '');
    out += M.declText.join('');
    for (const [nm, parts] of M.initText) {
      out += `\n\nexport function ${nm}() {\n${parts.join('')}\n}\n`;
    }
    for (const b of bindings.values()) {
      if (b.module !== M.name || !setters.has(b.key)) continue;
      out += `\n/** Atualiza \`${b.name}\` a partir de outros módulos (as ligações importadas são somente leitura). */\nexport function ${setters.get(b.key)}(value) {\n  ${b.name} = value;\n  return value;\n}\n`;
    }
    const ex = exportsOf.get(M.name);
    const exList = ex ? [...ex].filter(n => !M.initText.has(n)).sort() : [];
    if (exList.length) out += `\nexport { ${exList.join(', ')} };\n`;
    files.set(M.name, out);
  }

  // ---------- boot ----------
  const boot = special.bootModule(initCalls, rel);
  files.set('core/Game', boot);

  return { files, assets, warnings, initCalls, A, patched, setters, modules };

  // ---------- motor de texto ----------
  function textOf(sc, a, b) {
    let out = '', pos = a;
    const es = sc.edits;
    const active = sc.active || (sc.active = new Set());
    // busca binária do primeiro edit com start >= a
    let lo = 0, hi = es.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (es[mid].start < a) lo = mid + 1; else hi = mid; }
    let i = lo;
    while (pos < b) {
      while (i < es.length && (es[i].start < pos)) i++;
      const e = es[i];
      if (!e || e.start >= b) { out += sc.src.slice(pos, b); break; }
      if (active.has(e) || e.end > b) { i++; continue; }
      active.add(e);
      let r;
      try { r = e.render(); } finally { active.delete(e); }
      out += sc.src.slice(pos, e.start) + r;
      pos = e.end; i++;
    }
    return out;
  }
}

module.exports = { main, OUT, SRC, PUB };
