/**
 * Ajuda para testes no navegador (Playwright + Chromium): sobe o servidor estático da pasta do projeto, abre o
 * jogo com ?debug e expõe `run(p, código)`, que executa código dentro do jogo com acesso a todos os módulos
 * (ver src/core/debug.js). Não precisa do Vite: o jogo é servido direto de /src.
 *
 * Uso: NODE_PATH=$(npm root -g) node tests/browser/<teste>.mjs
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../regression/static-server.mjs';

export const { chromium } = createRequire(import.meta.url)('playwright');
export const ROOT = process.env.VDC_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..'); // VDC_ROOT: rodar o mesmo teste em outra cópia do projeto (ex.: a versão original, para comparar)

export async function launch(viewport = { width: 1000, height: 600 }) {
  const srv = await startServer(ROOT, 0);
  const port = srv.address().port;
  const b = await chromium.launch();
  const ctxt = await b.newContext({ viewport });
  const p = await ctxt.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message + (e.stack ? ' @ ' + e.stack.split('\n').slice(1, 4).map((l) => l.trim().replace(/http:\/\/[^/]+\/src\//, '')).join(' < ') : '')));
  p.on('console', (m) => {
    if (m.type() === 'error') errs.push('console: ' + m.text());
  });
  const url = `http://127.0.0.1:${port}/?debug${process.env.QS || ""}`;
  await p.goto(url);
  await boot(p);
  return { b, p, srv, errs, url, ctxt, close: async () => { await b.close(); srv.close(); } };
}

export async function boot(p) {
  await p.waitForFunction(() => window.VDC && window.VDC.run, null, { timeout: 30000 });
  await p.waitForTimeout(1500);
}

export const run = (p, code) => p.evaluate((c) => window.VDC.run(c), code);

let fails = 0;
export function ok(cond, msg) {
  console.log((cond ? 'OK   ' : 'FAIL ') + msg);
  if (!cond) {
    fails++;
    process.exitCode = 1;
  }
}
export const failures = () => fails;
