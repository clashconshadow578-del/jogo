// Aplica o mapa de migração às unidades e calcula dependências entre módulos.
'use strict';
const fs = require('fs');
const path = require('path');
const { analyze } = require('./analyze');

const NOT_EXPOSED = new Set(['AudioContext', 'webkitAudioContext']);

function parseMap(file) {
  const rules = [];
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const parts = line.split(/\s+/);
    const sid = parts[0];
    const [a, b] = parts[1].split('-').map(Number);
    if (parts[2] === 'split') {
      const split = {};
      for (const p of parts.slice(3)) { const [names, mod] = p.split('='); for (const n of names.split(',')) split[n] = mod; }
      rules.push({ sid, a, b: b ?? a, split });
    } else {
      const init = parts[3] ? parts[3].replace(/^@/, '').replace(/!$/, '') : null;
      rules.push({ sid, a, b: b ?? a, module: parts[2], init, wrapAll: !!(parts[3] && parts[3].endsWith('!')) });
    }
  }
  return rules;
}

const isDecl = n => n.type === 'FunctionDeclaration' || n.type === 'ClassDeclaration' || n.type === 'VariableDeclaration';

function plan(mapFile) {
  const A = analyze();
  const rules = parseMap(mapFile || path.join(__dirname, 'map.txt'));
  for (const r of rules) {
    for (let k = r.a; k <= r.b; k++) {
      const u = A.unitById.get(r.sid + '#' + k);
      if (!u) throw new Error('unidade inexistente ' + r.sid + '#' + k);
      if (u.module || u.split) throw new Error('unidade mapeada duas vezes ' + u.id);
      if (r.split) { u.split = r.split; u.module = '(split)'; }
      else if (r.wrapAll) { u.module = r.module; u.init = r.init; u.wrapAll = true; }
      else { u.module = r.module; u.init = isDecl(u.node) ? null : r.init; if (!isDecl(u.node) && !r.init) throw new Error('comando com efeito sem @init: ' + u.id); }
    }
  }
  const unmapped = A.units.filter(u => !u.module);
  if (unmapped.length) throw new Error('unidades sem módulo: ' + unmapped.map(u => u.id).join(' '));

  // módulo dono de cada ligação
  for (const b of A.bindings.values()) {
    const u = b.unit;
    b.module = u.split ? u.split[b.name] : u.module;
    if (!b.module) throw new Error('split sem módulo para ' + b.name + ' em ' + u.id);
  }
  // exposições por window -> ligação real
  const exposeKey = new Map();
  for (const [name, e] of A.windowExpose) {
    if (NOT_EXPOSED.has(name)) continue;
    const local = A.bindings.get(e.sid + ':' + name);
    exposeKey.set(name, { unit: e.unit, local });
  }
  // módulo de cada referência
  const modOfPos = (u, pos) => {
    if (!u) return null;
    if (!u.split) return u.module;
    for (const d of u.node.declarations) if (pos >= d.start && pos < d.end) { return u.split[d.id.name]; }
    return null;
  };
  for (const r of A.refs) {
    r.module = modOfPos(r.unit, r.id.start);
    if (r.key.startsWith('window:')) {
      const name = r.key.slice(7);
      const e = exposeKey.get(name);
      if (!e) { r.key = null; continue; }
      if (e.local) { r.key = e.local.key; A.bindings.get(r.key).refs.push(r); }
      else { r.exposeUnit = e.unit; }
    }
  }
  return { A, rules, exposeKey };
}

module.exports = { plan, parseMap, isDecl };

if (require.main === module) {
  const { A } = plan();
  const mods = new Map();
  for (const u of A.units) for (const m of (u.split ? Object.values(u.split) : [u.module])) mods.set(m, (mods.get(m) || 0) + 1);
  console.log('módulos:', mods.size);
  // escritas entre módulos
  const cross = [];
  for (const b of A.bindings.values()) {
    const w = b.refs.filter(r => r.write && !r.init && r.module && r.module !== b.module);
    if (w.length) cross.push(`${b.name} [${b.kind}] dono=${b.module} escrito-em=${[...new Set(w.map(r => r.module))].join(',')}`);
  }
  console.log('\n== escritas entre módulos (' + cross.length + ')\n' + cross.join('\n'));
  // não usados
  const unused = [];
  for (const b of A.bindings.values()) {
    const used = b.refs.filter(r => !r.init && !(r.id === (b.unit.node.id || {})));
    if (!used.length) unused.push(b.key + ' (' + b.module + ')');
  }
  console.log('\n== sem uso (' + unused.length + ')\n' + unused.join('\n'));
}
