// Análise do HTML original: comandos (units), ligações (bindings) e referências.
'use strict';
const fs = require('fs');
const path = require('path');
const acorn = require('acorn');
const eslintScope = require('eslint-scope');
const evk = require('eslint-visitor-keys');

const AUDIT = process.env.AUDIT || path.join(__dirname, 'work');

function loadScripts() {
  const dir = path.join(AUDIT, 'scripts');
  const files = fs.readdirSync(dir).filter(f => /^s\d\d\.js$/.test(f)).sort();
  return files.map(f => {
    const sid = f.slice(0, 3);
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    const comments = [];
    const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', ranges: true, locations: true, onComment: comments });
    let body = ast.body, iife = null, bodyStart = 0, bodyEnd = src.length;
    if (body.length === 1 && body[0].type === 'ExpressionStatement') {
      const e = body[0].expression;
      const c = e.type === 'CallExpression' ? e : null;
      if (c && c.callee && /FunctionExpression|ArrowFunctionExpression/.test(c.callee.type) && c.callee.body.type === 'BlockStatement') {
        iife = c.callee;
        body = c.callee.body.body;
        bodyStart = c.callee.body.start + 1;
        bodyEnd = c.callee.body.end - 1;
      }
    }
    return { sid, file: f, src, ast, comments, body, iife, bodyStart, bodyEnd, header: iife ? src.slice(0, body[0] ? 0 : 0) : '' };
  });
}

// Fronteiras de cada comando, incluindo comentários anteriores e o comentário final na mesma linha.
function buildUnits(sc) {
  const units = [];
  const cm = sc.comments.slice().sort((a, b) => a.start - b.start);
  let lastLine = false;
  const trailingEnd = (pos) => {
    let p = pos; lastLine = false;
    for (;;) {
      let q = p;
      while (q < sc.src.length && (sc.src[q] === ' ' || sc.src[q] === '\t' || sc.src[q] === ';')) q++;
      const c = cm.find(c => c.start === q);
      if (c && (c.type === 'Line' || !sc.src.slice(c.start, c.end).includes('\n'))) { p = c.end; lastLine = c.type === 'Line'; continue; }
      return p;
    }
  };
  let prev = sc.bodyStart;
  sc.body.forEach((node, k) => {
    const end = trailingEnd(node.end);
    units.push({ sid: sc.sid, k, id: sc.sid + '#' + k, node, start: prev, nodeStart: node.start, end, sc, lineCmt: lastLine });
    prev = end;
  });
  if (units.length) units[units.length - 1].end = Math.max(units[units.length - 1].end, sc.bodyEnd);
  // texto antes do primeiro comando de um IIFE (ex.: comentário de cabeçalho)
  if (sc.iife) {
    const pre = sc.src.slice(0, sc.iife.start).replace(/^[\s(]*/, '');
    sc.headerComment = (pre.match(/\/\*[\s\S]*?\*\//g) || []).join('\n');
  }
  return units;
}

function declaredNames(node) {
  const out = [];
  const collect = p => {
    if (!p) return;
    if (p.type === 'Identifier') out.push(p.name);
    else if (p.type === 'ObjectPattern') p.properties.forEach(q => collect(q.type === 'RestElement' ? q.argument : q.value));
    else if (p.type === 'ArrayPattern') p.elements.forEach(collect);
    else if (p.type === 'AssignmentPattern') collect(p.left);
    else if (p.type === 'RestElement') collect(p.argument);
  };
  if (node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') out.push(node.id.name);
  else if (node.type === 'VariableDeclaration') node.declarations.forEach(d => collect(d.id));
  return out;
}

function analyze() {
  const scripts = loadScripts();
  const units = [];
  for (const sc of scripts) { sc.units = buildUnits(sc); units.push(...sc.units); }
  const unitById = new Map(units.map(u => [u.id, u]));

  // ---- ligações de topo ----
  const bindings = new Map(); // key -> {key,name,sid,unit,kind,declNode}
  const globalDecl = new Map(); // name -> key (o último script vence, como no navegador)
  const shadowed = [];
  for (const sc of scripts) {
    for (const u of sc.units) {
      const names = declaredNames(u.node);
      u.names = names;
      for (const n of names) {
        const key = sc.sid + ':' + n;
        const kind = u.node.type === 'FunctionDeclaration' ? 'function' : u.node.type === 'ClassDeclaration' ? 'class' : u.node.kind;
        bindings.set(key, { key, name: n, sid: sc.sid, unit: u, kind, refs: [] });
        if (!sc.iife) {
          if (globalDecl.has(n)) shadowed.push({ name: n, old: globalDecl.get(n), now: key });
          globalDecl.set(n, key);
        }
      }
    }
  }

  // ---- exposições via window.X = ... dentro de IIFEs ----
  const windowExpose = new Map(); // name -> {unit, node}
  for (const sc of scripts) {
    if (!sc.iife) continue;
    for (const u of sc.units) {
      const n = u.node;
      if (n.type === 'ExpressionStatement' && n.expression.type === 'AssignmentExpression' && n.expression.operator === '='
        && n.expression.left.type === 'MemberExpression' && !n.expression.left.computed
        && n.expression.left.object.type === 'Identifier' && n.expression.left.object.name === 'window') {
        windowExpose.set(n.expression.left.property.name, { unit: u, node: n, sid: sc.sid });
      }
    }
  }

  for (const name of require('./special').extraExpose) {
    const b = [...bindings.values()].find(b => b.name === name && b.sid === 's13');
    windowExpose.set(name, { unit: b.unit, node: b.unit.node, sid: b.sid, synthetic: true });
  }
  // ---- referências (resolução por escopo) ----
  const refs = [];
  for (const sc of scripts) {
    const sm = eslintScope.analyze(sc.ast, { ecmaVersion: 2022, sourceType: 'script', childVisitorKeys: evk.KEYS, fallback: 'iteration' });
    const top = sc.iife ? sm.acquire(sc.iife) : sm.globalScope;
    const unitAt = pos => sc.units.find(u => pos >= u.start && pos < u.end) || null;
    for (const scope of sm.scopes) {
      for (const r of scope.references) {
        const id = r.identifier;
        let key = null;
        const v = r.resolved;
        if (v && v.scope === top && sc.iife) key = sc.sid + ':' + id.name;
        else if (!v || v.scope.type === 'global') {
          if (globalDecl.has(id.name)) key = globalDecl.get(id.name);
          else if (!sc.iife && bindings.has(sc.sid + ':' + id.name)) key = sc.sid + ':' + id.name;
          else if (windowExpose.has(id.name)) key = 'window:' + id.name;
        }
        if (!key) continue;
        const u = unitAt(id.start);
        const isDeclId = r.init === true || (v && v.defs.some(d => d.name === id && d.type !== 'Variable')) ;
        const rec = { key, name: id.name, sid: sc.sid, unit: u, id, write: r.isWrite(), read: r.isRead(), init: !!r.init, ref: r, scope };
        refs.push(rec);
      }
    }
    sc.scopeManager = sm;
    sc.topScope = top;
  }
  for (const r of refs) { const b = bindings.get(r.key); if (b) b.refs.push(r); }
  return { scripts, units, unitById, bindings, globalDecl, shadowed, windowExpose, refs };
}

module.exports = { analyze, declaredNames, AUDIT };

if (require.main === module) {
  const a = analyze();
  console.log('scripts', a.scripts.length, 'units', a.units.length, 'bindings', a.bindings.size, 'refs', a.refs.length);
  console.log('shadowed', a.shadowed);
  console.log('windowExpose', [...a.windowExpose.keys()].join(' '));
  // verificação: o texto das unidades cobre o corpo inteiro
  for (const sc of a.scripts) {
    const joined = sc.units.map(u => sc.src.slice(u.start, u.end)).join('');
    const bodyTxt = sc.src.slice(sc.bodyStart, sc.bodyEnd);
    if (joined.trim() !== bodyTxt.trim()) console.log('COVERAGE MISMATCH', sc.sid, joined.length, bodyTxt.length);
  }
}
