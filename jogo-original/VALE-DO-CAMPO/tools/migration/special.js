// Casos especiais da migração: comandos reescritos à mão, assets e textos gerados.
'use strict';
const fs = require('fs');
const path = require('path');
const walk = require('acorn-walk');

const OUT = process.env.OUT || require('path').resolve(__dirname, '..', '..');

// ---------------------------------------------------------------------------
// Ligações e exposições
// ---------------------------------------------------------------------------
// s06 redefine drawPlayerBase: a versão do s02 nunca era usada (o navegador substitui a função global).
const renameDecl = { 's02:drawPlayerBase': 'drawLegacyPlayerBase' };

// window.AudioContext é do navegador (o s00 só o envolve).
const notExposed = new Set(['AudioContext', 'webkitAudioContext']);

// Objetos publicados em window apenas para depuração pelo console (mantidos como no original).
const windowDebug = new Set(['fogBase', 'alResetFog', 'amzSp', 'AmzArvore', 'TRONCO', 'ABELHAS', 'AMZ']);

// Funções protegidas pelo laço window[n] do s02 (só rodam com a fazenda/vila ativa).
const HOME_GUARDED = ['updateHerd', 'updateChx', 'updateNinhos', 'updateWrm', 'updateFox', 'updateNpc'];
const extraExtensible = [...HOME_GUARDED, 'updateVendor'];

const extraSetters = [];
const forceExport = new Set(['worldDecode', 'worldInflate']);

// ---------------------------------------------------------------------------
// Comandos reescritos manualmente (id -> função que devolve {code, kind?, uses?} ou null para remover)
// ---------------------------------------------------------------------------
const manualUnits = {
  // Laço que trocava window[n] por versões protegidas. Agora usa o mecanismo explícito de extensão.
  's02#39': () => ({
    uses: [...HOME_GUARDED, 'updateVendor'],
    code: `// Fora da fazenda (ou da vila) as rotinas desses habitantes ficam suspensas; ao voltar, homeCatchUp() as avança.
 // Observação: o original também listava 'ggTick', mas essa função ainda não existia quando o laço rodava,
 // por isso nunca foi protegida — o comportamento foi mantido.
 for (const f of [${HOME_GUARDED.join(', ')}]) f.extend((prev) => function () { return INST.homeAct ? prev.apply(this, arguments) : undefined; });
 updateVendor.extend((prev) => function () { return INST.vilAct ? prev.apply(this, arguments) : undefined; });`,
  }),
  // O mapa do mundo deixou de ficar embutido no HTML (454 KB de base64): é um arquivo binário carregado no boot.
  's02#52': () => ({
    uses: ['assetUrl'],
    code: `let WORLD = null;
/** Carrega public/assets/data/world.bin (deflate bruto) e decodifica o mundo 1000x1000. Chamado por main.js antes do boot. */
export async function loadWorldData(url = assetUrl('data/world.bin')) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Não foi possível carregar os dados do mundo (' + res.status + ' ' + url + ')');
  WORLD = worldDecode(new Uint8Array(await res.arrayBuffer()));
  return WORLD;
}`,
  }),
  // const herd=[cow] lia a vaca de outro módulo durante a avaliação (TDZ em ES Modules).
  // O rebanho começa vazio e a fundadora entra em initFounderCow(), que roda logo em seguida no boot.
  's02#571': () => ({ code: 'const herd = [];   // herd[0] = vaca fundadora (adicionada em initFounderCow)' }),
  // window.alel = new Float32Array(HN); const alel = window.alel;  ->  módulo exporta alel
  's12#4': () => null,
  's12#5': () => ({ code: 'const alel = new Float32Array(HN);   // concentração de aleloquímicos por tile (exportada para o empacotamento das instâncias)' }),
};

// Edições de texto pontuais (id -> [[de, para], ...])
const stringEdits = {
  's02#51': [["function worldDecode(b64){\n const bin=atob(b64),z=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)z[i]=bin.charCodeAt(i);\n", "function worldDecode(z){   // z: bytes do arquivo world.bin\n"]],
  's13#9': [["'data:image/webp;base64,'+d.d", 'assetUrl(d.d)']],
  's02#572': [['Object.assign(cow,', 'herd.push(cow);Object.assign(cow,']],
  // Ponto de extensão novo (vazio por padrão, não altera o comportamento): outros módulos podem
  // adicionar entidades ao desenho ordenado por Y sem editar render().
  's02#584': [
    ['function render(){', `/**
 * Fornecedores extras de entidades desenháveis. Cada função recebe (ents, camX, camY) e faz
 * ents.push({ k: yDeOrdenacao, sh: [x, y, largura, altura, tipo], draw: () => {...} }).
 * Exemplo de uso em README.md ("Como adicionar novos animais").
 */
export const entityProviders = [];
function render(){`],
    ["ents.push({k:S.py, sh:[S.px,S.py,8,14,'person'], draw:drawPlayer});", "for(const add of entityProviders)add(ents,camX,camY);\n  ents.push({k:S.py, sh:[S.px,S.py,8,14,'person'], draw:drawPlayer});"],
  ],
};

const extraModuleImports = {};

// ---------------------------------------------------------------------------
// Correções de bugs (FIXES=0 gera a versão de equivalência exata com o original)
// ---------------------------------------------------------------------------
const FIXES = process.env.FIXES !== '0';
// faFruitAt (frutos caídos atraem a fauna) era uma função local do módulo amazônico,
// mas o habitat dos animais a procurava como global: o recurso nunca funcionava.
const extraExpose = FIXES ? ['faFruitAt'] : [];
if (FIXES) {
  // O AudioContext era criado e "retomado" a cada quadro antes de qualquer gesto do usuário,
  // gerando centenas de avisos no console (política de autoplay). Agora só após o 1º gesto.
  stringEdits['s02#143'] = [['function getAC(){try{', 'function getAC(){if(!audioUnlocked)return null;try{']];
  stringEdits['s02#172'] = [['let AC = null;', `let AC = null;
// Correção: o navegador só permite áudio depois de um gesto; antes disso não criamos/retomamos o contexto.
let audioUnlocked = false;
for (const ev of ['pointerdown', 'keydown', 'touchstart']) addEventListener(ev, () => { audioUnlocked = true; }, { capture: true, passive: true });`]];
}

// ---------------------------------------------------------------------------
// Assets embutidos (data: URIs) -> arquivos em public/assets
// ---------------------------------------------------------------------------
const ASSET_NAMES = {
  CHK_SHEETS: k => `sprites/animals/chicken/${k[0]}`,
  WRM_IMG: () => 'sprites/animals/worm',
  FOX_IMG: () => 'sprites/animals/fox_farm',
  CSPR_DATA: k => `sprites/crops/${k[0]}_${k[1]}`,
  TREE_DATA: k => `sprites/trees/${k[0]}`,
  SPR_DATA: k => {
    const n = k[0];
    if (n === 'house') return 'sprites/objects/house';
    if (/^rock/.test(n)) return `sprites/objects/rocks/${n}`;
    if (/^shr/.test(n)) return `sprites/objects/mushrooms/${n}`;
    return `sprites/objects/interior/${n}`;
  },
  PL_IMG: () => 'sprites/characters/player_legacy',
  COW_IMG: () => 'sprites/animals/cow',
  FA_SRC: k => `sprites/animals/${k[0]}/${k[1]}`,
  JG_IMG: () => 'sprites/animals/jaguar',
  ANA_IMG: () => 'sprites/animals/anaconda',
  PLA: () => 'sprites/characters/player',
  GOLEM_IMG: () => 'sprites/characters/golem',
  AMZ_DATA: k => `sprites/trees/amazon/${k[0]}_${k[1]}`,
};
const EXT = { 'image/webp': 'webp', 'image/png': 'png', 'image/gif': 'gif', 'image/jpeg': 'jpg', 'image/svg+xml': 'svg' };

function collectAssets(A, addEdit, textOf, warn) {
  const assets = [];
  const seen = new Map();
  for (const sc of A.scripts) {
    walk.ancestor(sc.ast, {
      Literal(n, anc) {
        if (typeof n.value !== 'string') return;
        const isData = n.value.startsWith('data:');
        const par = anc[anc.length - 2];
        const isAmz = !isData && par && par.type === 'Property' && (par.key.name === 'd' || par.key.value === 'd') && n.value.length > 100 && /^[A-Za-z0-9+/=]+$/.test(n.value);
        if (!isData && !isAmz) return;
        // nome a partir do contexto
        const u = sc.units.find(u => n.start >= u.start && n.start < u.end);
        let top = null; const keys = [];
        for (let i = anc.length - 2; i >= 0; i--) {
          const a = anc[i], c = anc[i + 1];
          if (a.type === 'Property' && c === a.value) keys.unshift(a.key.name || a.key.value);
          if (a.type === 'ArrayExpression') keys.unshift(String(a.elements.indexOf(c)));
          if (a.type === 'VariableDeclarator' && a.init === c) { top = a.id.name; break; }
          if (a.type === 'AssignmentExpression' && a.right === c && a.left.type === 'MemberExpression' && a.left.object.type === 'Identifier') { top = a.left.object.name; break; }
        }
        const namer = ASSET_NAMES[top];
        let rel;
        if (namer) rel = namer(keys.filter(k => k !== 'd'));
        else { rel = `sprites/misc/${top || 'asset'}_${keys.join('_')}`; warn('asset sem nome definido: ' + top + ' ' + keys.join('.')); }
        let mime = 'image/webp', b64 = n.value;
        if (isData) { const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(n.value); if (!m || !m[2]) { warn('data: não-base64 em ' + u.id); return; } mime = m[1]; b64 = m[3]; if (!b64) return; }
        rel += '.' + (EXT[mime] || 'bin');
        if (seen.has(rel) && seen.get(rel) !== b64) { rel = rel.replace(/(\.\w+)$/, '_' + assets.length + '$1'); }
        seen.set(rel, b64);
        const file = path.join(OUT, 'public', 'assets', rel);
        assets.push({ rel, file, b64, module: u.split ? null : u.module, unit: u.id, mime });
        if (isAmz) addEdit(sc, n.start, n.end, () => JSON.stringify(rel), 'asset');
        else addEdit(sc, n.start, n.end, () => `assetUrl(${JSON.stringify(rel)})`, 'asset');
      },
    });
  }
  return assets;
}

// ---------------------------------------------------------------------------
// Cabeçalhos dos módulos
// ---------------------------------------------------------------------------
let DESC = {};
try { DESC = require('./descriptions.json'); } catch (e) { }
function describe(name, M) {
  const d = DESC[name];
  const origin = [...new Set(M.units.map(u => u.sid))].join(', ');
  const iifeHdr = M.units.map(u => u.sc.headerComment).filter(Boolean)[0];
  let txt = '/**\n * ' + (d || name) .split('\n').join('\n * ') + '\n *\n * Origem: Vale_do_Campo_V64.html (' + origin + ')\n */\n';
  if (iifeHdr && M.units[0].k === 0) txt += iifeHdr + '\n';
  return txt;
}

// ---------------------------------------------------------------------------
// core/Game.js: sequência de inicialização
// ---------------------------------------------------------------------------
function bootModule(initCalls, rel) {
  const imports = new Map();
  for (const c of initCalls) { if (!imports.has(c.module)) imports.set(c.module, new Set()); imports.get(c.module).add(c.name); }
  let out = `/**
 * Sequência de inicialização do jogo.
 *
 * A ordem abaixo reproduz exatamente a ordem em que os <script> do arquivo original
 * executavam seus comandos de topo (registro de extensões, carregamento do save,
 * criação de interface, início do laço). Alterar a ordem pode mudar o comportamento:
 * por exemplo, o carregamento do save (bootLoadGame) acontece ANTES das extensões da
 * floresta amazônica, que depois completam os dados (bootAmazon) — como no original.
 */
`;
  for (const [m, names] of [...imports.entries()].sort((a, b) => a[0].localeCompare(b[0]))) out += `import { ${[...names].sort().join(', ')} } from '${rel('core/Game', m)}';\n`;
  out += `\nlet booted = false;\n\n/** Inicializa todos os sistemas na ordem original. Deve ser chamada uma única vez. */\nexport function boot() {\n  if (booted) return;\n  booted = true;\n`;
  let lastSid = null;
  for (const c of initCalls) {
    const sid = Math.floor(c.pos / 1e5);
    if (sid !== lastSid) { out += `\n  // --- bloco <script> nº ${sid + 1} do original ---\n`; lastSid = sid; }
    out += `  ${c.name}();\n`;
  }
  out += '}\n';
  return out;
}

module.exports = { FIXES, extraExpose, renameDecl, notExposed, windowDebug, extraExtensible, extraSetters, forceExport, manualUnits, stringEdits, extraModuleImports, collectAssets, describe, bootModule, HOME_GUARDED };
