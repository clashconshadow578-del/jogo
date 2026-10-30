/**
 * Vazamento de imagens no desenho do PixiJS: depois de dormir (o relógio volta às 6h e a cor do céu na água muda a cada minuto),
 * brilhos (vaga-lumes, tocha) e gradientes NÃO podem criar uma imagem/canvas nova por quadro. Já aconteceu: milhares de canvases
 * por minuto, memória da placa de vídeo cheia e o jogo travava (0 fps) cerca de 30 s depois de dormir.
 *
 * Diferente dos outros testes de navegador, este sobe o jogo pelo Vite (o PixiJS só carrega assim) e liga o WebGL por software.
 * Uso: NODE_PATH=$(npm root -g) node tests/browser/pixi-leak.mjs
 */
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import { ok, failures, ROOT } from './lib.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const server = await createServer({ root: ROOT, server: { port: 0, host: '127.0.0.1' }, logLevel: 'error' });
await server.listen();
const port = server.httpServer.address().port;
const b = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-gl=angle'],
});
const p = await b.newPage({ viewport: { width: 960, height: 540 } });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.addInitScript(() => {
  window.__canvases = 0;
  window.__on = false;
  const orig = document.createElement.bind(document);
  document.createElement = (t) => {
    if (window.__on && String(t).toLowerCase() === 'canvas') window.__canvases++;
    return orig(t);
  };
});
await p.goto(`http://127.0.0.1:${port}/?debug`);
await p.waitForFunction(() => window.VDC && window.VDC_PIXI?.ok && window.VDC_LAYER_STATS?.layers > 5, null, { timeout: 120000 });
ok(true, 'PixiJS ligado (WebGL)');
await p.evaluate(() => {
  window.VDC.run('dormir(false)');
  window.__on = true;
});
const dirs = ['d', 's', 'a', 'w'];
for (let k = 0; k < 6; k++) {
  await p.keyboard.down(dirs[k % 4]);
  await p.waitForTimeout(4000);
  await p.keyboard.up(dirs[k % 4]);
}
const r = await p.evaluate(() => ({ canvases: window.__canvases, frames: window.VDC_LAYER_STATS.layers, nodes: document.querySelectorAll('*').length }));
console.log('canvases criados em ~24 s depois de dormir:', r.canvases, '· quadros:', r.frames);
ok(r.canvases < 800, 'poucas imagens novas por minuto (' + r.canvases + ' < 800; antes do conserto eram ~3.500)');
ok(r.nodes < 5000, 'elementos da página estáveis (' + r.nodes + ')');
ok(errs.length === 0, 'sem erros na página' + (errs.length ? ': ' + errs[0] : ''));
await b.close();
await server.close();
process.exitCode = failures() ? 1 : 0;
