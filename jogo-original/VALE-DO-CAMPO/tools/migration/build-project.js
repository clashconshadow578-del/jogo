// Escreve o projeto Vite completo a partir da análise do HTML original.
'use strict';
const fs = require('fs');
const path = require('path');
const prettier = require('prettier');
const { main, OUT } = require('./generate');

const STATIC = path.join(__dirname, 'static');
const ORIG = require('path').join(require('./analyze').AUDIT, 'orig.html');
const PRETTIER = { parser: 'babel', printWidth: 120, singleQuote: true, trailingComma: 'all', arrowParens: 'always' };
const FORMAT = process.env.NOFORMAT ? false : true;

function write(rel, content) {
  const f = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, content);
}

async function run() {
  const r = main();
  console.log('módulos', r.files.size, 'assets', r.assets.length, 'funções estendidas', r.patched.size, 'setters', r.setters.size);
  if (r.warnings.length) fs.writeFileSync(path.join(__dirname, 'work', 'warnings.txt'), r.warnings.join('\n'));

  // limpa saída anterior (somente as pastas geradas)
  for (const d of ['src', 'public/assets', 'legacy']) fs.rmSync(path.join(OUT, d), { recursive: true, force: true });

  // ---------- módulos ----------
  const extra = {
    'core/extensions': fs.readFileSync(path.join(STATIC, 'extensions.js'), 'utf8'),
    'utils/assets': fs.readFileSync(path.join(STATIC, 'assets.js'), 'utf8'),
    main: fs.readFileSync(path.join(STATIC, 'main.js'), 'utf8'),
  };
  // registro de depuração
  const modNames = [...r.files.keys()].filter(m => m !== 'core/Game').sort();
  const setters = {};
  for (const [key, sn] of r.setters) { const b = r.A.bindings.get(key); setters[b.name] = [b.module, sn]; }
  let dbg = `/**
 * Ferramentas de depuração (ativas com ?debug na URL ou no servidor de desenvolvimento).
 *
 * window.VDC.modules  -> todos os módulos do jogo (namespaces)
 * window.VDC.run(code) -> avalia uma expressão com acesso aos nomes do jogo, por exemplo:
 *     VDC.run('S.min = 1000')          // avança o relógio
 *     VDC.run('climate.kind = 3')      // força tempestade no próximo planejamento
 * Atribuições a variáveis de módulo (ex.: "sleeping = true") usam os setters exportados.
 * Os testes de regressão (tests/regression) usam essa mesma interface.
 */\n`;
  modNames.forEach((m, i) => { dbg += `import * as m${i} from '${path.relative('core', m).startsWith('.') ? path.relative('core', m) : './' + path.relative('core', m)}.js';\n`; });
  dbg += `\nconst MODULES = {\n${modNames.map((m, i) => `  '${m}': m${i},`).join('\n')}\n};\n`;
  dbg += `const SETTERS = ${JSON.stringify(Object.fromEntries(Object.entries(setters).map(([n, [m, s]]) => [n, [m, s]])), null, 2)};\n`;
  dbg += `
export function installDebug() {
  const owner = new Map();
  for (const ns of Object.values(MODULES)) for (const n of Object.keys(ns)) if (!owner.has(n)) owner.set(n, ns);
  const scope = new Proxy(Object.create(null), {
    has: (_t, n) => typeof n === 'string' && owner.has(n),
    get: (_t, n) => (n === Symbol.unscopables ? undefined : owner.get(n)?.[n]),
    set: (_t, n, v) => {
      const s = SETTERS[n];
      if (!s) throw new TypeError('VDC: "' + String(n) + '" não pode ser reatribuída de fora do módulo');
      MODULES[s[0]][s[1]](v);
      return true;
    },
  });
  // eslint-disable-next-line no-new-func
  const evaluate = new Function('scope', 'code', 'with (scope) { return eval(code); }');
  window.VDC = { modules: MODULES, scope, run: (code) => evaluate(scope, code) };
  return window.VDC;
}
`;
  extra['core/debug'] = dbg;

  const all = new Map([...r.files, ...Object.entries(extra)]);
  let total = 0;
  for (const [m, code] of all) {
    let out = code;
    if (FORMAT) {
      try { out = await prettier.format(code, PRETTIER); }
      catch (e) { console.error('prettier falhou em', m, e.message.split('\n')[0]); }
    }
    total += out.length;
    write(path.join('src', m + '.js'), out);
  }
  console.log('código-fonte:', (total / 1024).toFixed(0), 'KB');

  // ---------- assets de sprites ----------
  let abytes = 0;
  for (const a of r.assets) {
    const buf = Buffer.from(a.b64, 'base64');
    abytes += buf.length;
    fs.mkdirSync(path.dirname(a.file), { recursive: true });
    fs.writeFileSync(a.file, buf);
  }
  // mundo: base64 -> binário
  const wb = Buffer.from(fs.readFileSync(path.join(require('./analyze').AUDIT, 'scripts', 'wdata.b64'), 'utf8').trim(), 'base64');
  write('public/assets/data/world.bin', wb);
  console.log('assets:', r.assets.length, (abytes / 1024).toFixed(0), 'KB + world.bin', (wb.length / 1024).toFixed(0), 'KB');

  // ---------- CSS ----------
  const html = fs.readFileSync(ORIG, 'utf8');
  const lines = html.split('\n');
  const L = (a, b) => lines.slice(a - 1, b).join('\n');
  const uiImg = new Map();
  const cssUrls = (css, names) => css.replace(/url\((data:image\/(\w+);base64,([A-Za-z0-9+/=]+))\)/g, (m0, all, ext, b64) => {
    const nm = names.shift();
    if (!nm) throw new Error('imagem CSS sem nome');
    const rel = `assets/ui/${nm}.${ext}`;
    uiImg.set(rel, Buffer.from(b64, 'base64'));
    return `url(../${rel})`;
  });
  const css = {
    'main.css': ['/* Base: página, canvas em tela cheia e prevenção de gestos do navegador. */', L(9, 11)],
    'ui.css': ['/* Interface DOM: HUD, barra de energia, hotbar, menu, clima, avisos, diálogo, painel hidrológico, seta de casa. */', [L(12, 23), L(30, 33), L(38, 42)].join('\n')],
    'mobile.css': ['/* Controles de toque: joystick virtual e botões de ação. */', [L(24, 29), L(34, 37)].join('\n')],
    'skin.css': ['/* Skin "MediavelFree": molduras em pixel art, barra de vida, botões do topo, hotbar e janela de inventário.\n   Carregado depois de ui.css porque sobrescreve várias regras. */', [L(8, 8), L(44, 80)].join('\n')],
  };
  const cssNames = { 'skin.css': ['frame', 'health_empty', 'health_full', 'icon_menu', 'inventory_panel', 'button_close', 'coin'] };
  const mapCss = html.match(/<style>\n(#mapOv[\s\S]*?)<\/style>/)[1];
  css['map.css'] = ['/* Tela do mapa do vale (ui/MapUI.js). */', mapCss.trim()];
  css['fatal.css'] = ['/* Mensagem de erro de inicialização (main.js). */', '#fatal{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(520px,90vw);padding:16px 18px;background:rgba(60,12,12,.95);border:2px solid #e57373;border-radius:10px;color:#fff;font:15px/1.45 system-ui,sans-serif;z-index:100}'];
  for (const [f, [hdr, body]] of Object.entries(css)) {
    let out = hdr + '\n' + cssUrls(body, (cssNames[f] || []).slice());
    if (require('./special').FIXES && f === 'ui.css') {
      // Correção: avisos longos ficavam cortados em telas estreitas (white-space:nowrap).
      const before = out;
      out = out.replace('pointer-events:none;white-space:nowrap}', 'pointer-events:none;white-space:normal;max-width:min(94vw,760px);width:max-content;text-align:center}');
      if (out === before) throw new Error('correção do #toast não aplicada');
    }
    let formatted = out;
    if (FORMAT) formatted = await prettier.format(out, { parser: 'css', printWidth: 120 });
    write('src/styles/' + f, formatted);
  }
  for (const [rel, buf] of uiImg) write('src/' + rel, buf);

  // ---------- index.html ----------
  const body = fs.readFileSync(path.join(STATIC, 'body.html'), 'utf8');
  const head = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<meta name="theme-color" content="#000000">
<title>Vale do Campo V56 — Floresta Amazônica</title>
<link rel="icon" type="image/png" href="favicon.png">
<link rel="stylesheet" href="/src/styles/main.css">
<link rel="stylesheet" href="/src/styles/ui.css">
<link rel="stylesheet" href="/src/styles/mobile.css">
<link rel="stylesheet" href="/src/styles/skin.css">
<link rel="stylesheet" href="/src/styles/map.css">
<link rel="stylesheet" href="/src/styles/fatal.css">
</head>
<body>
`;
  write('index.html', head + body + '\n<script type="module" src="/src/main.js"></script>\n</body>\n</html>\n');

  // ---------- original preservado ----------
  fs.mkdirSync(path.join(OUT, 'legacy'), { recursive: true });
  fs.copyFileSync(ORIG, path.join(OUT, 'legacy', 'Vale_do_Campo_V64.html'));
  console.log('ok ->', OUT);
}

run().catch(e => { console.error(e); process.exit(1); });
