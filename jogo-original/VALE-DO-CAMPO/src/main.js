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
import { initPixi, pixiRequested } from './rendering/pixi/PixiBridge.js';
import { toast } from './ui/Toast.js';
import { benchRequested, startBench } from './core/Bench.js';

function showFatalError(err) {
  console.error('[Vale do Campo] falha ao iniciar:', err);
  const box = document.createElement('div');
  box.id = 'fatal';
  box.setAttribute('role', 'alert');
  box.textContent =
    'Não foi possível iniciar o jogo: ' +
    (err && err.message ? err.message : err) +
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
  // só faz algo com ?pixi na URL: liga o PixiJS (WebGL) e avisa na tela se deu certo, para conferir no celular
  initPixi().then((info) => {
    if (pixiRequested(location.search)) toast(info ? 'PixiJS ligado (WebGL)' : 'PixiJS indisponível: usando Canvas', info ? '#9be29b' : '#ffb4a8');
  });
  if (benchRequested(location.search)) startBench(); // só com ?bench: teste de desempenho automático (core/Bench.js)
  const env = import.meta.env || {};
  if (env.DEV || /[?&]debug\b/.test(location.search)) installDebug();
}

start();
