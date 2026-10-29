/**
 * Tela cheia: botão ⛶ (canto superior direito), tecla F e o mesmo botão no menu.
 *   - Computador e Android: usa a API de tela cheia do navegador; no celular também trava a tela na horizontal.
 *   - iPhone (Safari): o navegador NÃO oferece tela cheia para páginas; o botão mostra como adicionar o jogo à
 *     tela de início, onde ele abre sem barras (manifest + meta apple-mobile-web-app-capable).
 *   - Já aberto como app instalado (sem barras): o botão some.
 *
 * Origem: novo.
 */

import { toast } from './Toast.js';

const root = document.documentElement;

const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;
const canRequest = () => !!(root.requestFullscreen || root.webkitRequestFullscreen);
const isStandalone = () =>
  !!(
    navigator.standalone ||
    (window.matchMedia &&
      (matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: standalone)').matches))
  );
const isTouch = () => !!(window.matchMedia && matchMedia('(pointer:coarse)').matches);
const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Entra ou sai da tela cheia. Retorna uma Promise que nunca rejeita. */
export async function toggleFullscreen() {
  try {
    if (fsElement()) {
      await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      return;
    }
    if (!canRequest()) {
      toast(
        isIOS()
          ? 'No iPhone: toque em Compartilhar › Adicionar à Tela de Início para jogar em tela cheia'
          : 'Este navegador não permite tela cheia. Use o menu do navegador › Instalar app / Adicionar à tela inicial',
      );
      return;
    }
    const req = root.requestFullscreen || root.webkitRequestFullscreen;
    await req.call(root, { navigationUI: 'hide' });
    // Celular: deixa o jogo na horizontal (alguns navegadores recusam; tudo bem).
    if (isTouch() && screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape').catch(() => {});
  } catch (e) {
    toast('Não foi possível entrar em tela cheia');
  }
}

function refresh() {
  const on = !!fsElement();
  for (const id of ['fsBtn', 'fsMenuBtn']) {
    const b = document.getElementById(id);
    if (!b) continue;
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (id === 'fsMenuBtn') b.textContent = on ? '⛶ Sair da tela cheia' : '⛶ Tela cheia';
    else {
      const txt = on ? 'Sair da tela cheia (F)' : 'Tela cheia (F)';
      b.title = txt;
      b.setAttribute('aria-label', txt);
    }
  }
  if (!on && screen.orientation && screen.orientation.unlock) {
    try {
      screen.orientation.unlock();
    } catch (e) {}
  }
}

export function initFullscreen() {
  const hide = isStandalone(); // já está sem barras
  for (const id of ['fsBtn', 'fsMenuBtn']) {
    const b = document.getElementById(id);
    if (!b) continue;
    if (hide) {
      b.style.display = 'none';
      continue;
    }
    b.addEventListener('click', (e) => {
      e.preventDefault();
      toggleFullscreen();
    });
  }
  document.addEventListener('fullscreenchange', refresh);
  document.addEventListener('webkitfullscreenchange', refresh);
  addEventListener('keydown', (e) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
    if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      toggleFullscreen();
    }
  });
  refresh();
}
