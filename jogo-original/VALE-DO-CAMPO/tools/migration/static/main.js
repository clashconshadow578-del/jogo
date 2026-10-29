/**
 * Ponto de entrada do Vale do Campo.
 *
 * 1. Carrega os dados do mundo (public/assets/data/world.bin).
 * 2. Executa a sequência de inicialização (core/Game.js), que inicia o laço do jogo.
 * 3. Com `?debug` na URL (ou no servidor de desenvolvimento), expõe `window.VDC` para o console.
 */
import { loadWorldData } from './world/WorldData.js';
import { boot } from './core/Game.js';
import { installDebug } from './core/debug.js';

function showFatalError(err) {
  console.error('[Vale do Campo] falha ao iniciar:', err);
  const box = document.createElement('div');
  box.id = 'fatal';
  box.setAttribute('role', 'alert');
  box.textContent = 'Não foi possível iniciar o jogo: ' + (err && err.message ? err.message : err) +
    '. Verifique se o jogo está sendo aberto por um servidor (npm run dev / npm run preview) e não por file://.';
  document.body.appendChild(box);
}

async function start() {
  try {
    await loadWorldData();
  } catch (err) {
    showFatalError(err);
    return;
  }
  boot();
  const env = import.meta.env || {};
  if (env.DEV || /[?&]debug\b/.test(location.search)) installDebug();
}

start();
