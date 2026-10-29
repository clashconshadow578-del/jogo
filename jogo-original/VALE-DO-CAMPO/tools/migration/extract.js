// Passo 0: separa os <script> do HTML original em work/scripts/sNN.js (e o mapa em wdata.b64).
'use strict';
const fs = require('fs'), path = require('path');
const src = process.argv[2] || path.join(__dirname, '..', '..', 'legacy', 'Vale_do_Campo_V64.html');
const work = path.join(__dirname, 'work'), dir = path.join(work, 'scripts');
fs.mkdirSync(dir, { recursive: true });
const html = fs.readFileSync(src, 'utf8');
fs.writeFileSync(path.join(work, 'orig.html'), html);
let k = 0;
for (const m of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
  if (m[1].includes('text/plain')) fs.writeFileSync(path.join(dir, 'wdata.b64'), m[2]);
  else fs.writeFileSync(path.join(dir, `s${String(k).padStart(2, '0')}.js`), m[2]);
  k++;
}
console.log('scripts extraídos em', dir);
