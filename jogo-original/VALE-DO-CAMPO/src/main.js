/**
 * Ponto de entrada do Vale do Campo.
 *
 * 1. Carrega os dados do mundo (public/assets/data/world.bin).
 * 2. Executa a sequência de inicialização (core/Game.js), que inicia o laço do jogo.
 * 3. Com `?debug` na URL (ou no servidor de desenvolvimento), expõe `window.VDC` para o console.
 */
import './core/CpuCanvas.js'; // tem que ser o primeiro: troca o getContext antes de qualquer canvas existir (só com ?cpu)
import { loadWorldData } from './world/WorldData.js';
import { boot } from './core/Game.js';
import { installDebug } from './core/debug.js';
import { initPixi, pixiExplicit } from './rendering/pixi/PixiBridge.js';
import { pixiLayersInit } from './rendering/pixi/PixiLayers.js';
import { toast } from './ui/Toast.js';
import { benchRequested, startBench } from './core/Bench.js';
import { anaDemo } from './entities/wild/Anaconda.js';
import { harpyDemo, harpyIntruder } from './entities/wild/Harpy.js';

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
  // liga o PixiJS (WebGL), o desenhista padrão (`?canvas` desliga); com `?pixi` avisa na tela se deu certo
  initPixi().then((info) => {
    if (info) pixiLayersInit();
    if (pixiExplicit(location.search))
      toast(info ? 'PixiJS ligado (WebGL)' : 'PixiJS indisponível: usando Canvas', info ? '#9be29b' : '#ffb4a8');
  });
  if (benchRequested(location.search)) startBench(); // só com ?bench: teste de desempenho automático (core/Bench.js)
  if (/[?&]sucuri\b/.test(location.search)) setTimeout(anaDemo, 2500); // só com ?sucuri: uma sucuri engolindo uma presa na frente do jogador
  if (/[?&]harpia\b/.test(location.search))
    setTimeout(() => {
      harpyDemo(); // só com ?harpia: leva o jogador até a árvore-ninho do casal de harpias; com &intrusa, uma harpia de fora chega e a disputa territorial começa
      if (/[?&]intrusa\b/.test(location.search)) setTimeout(harpyIntruder, 4000);
    }, 3500);
  const env = import.meta.env || {};
  if (env.DEV || /[?&]debug\b/.test(location.search)) installDebug();
}

start();
