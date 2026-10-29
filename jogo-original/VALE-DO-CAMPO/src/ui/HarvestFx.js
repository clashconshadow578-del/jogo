/**
 * Feedback da colheita: texto no aviso e textos flutuantes sobre o jogador, proporcionais à raridade.
 * Resultado comum fica discreto (só o aviso de sempre); raro ganha cor, brilho e som. Nada abre janela.
 *
 * Origem: novo (sistema de progressão)
 */

import { CROP_NAME } from '../config/balance.js';
import { QUALITIES } from '../config/progression.js';
import { S } from '../core/GameState.js';
import { VH, VW } from '../config/constants.js';
import { vcam } from '../rendering/Renderer.js';
import { beep } from '../systems/audio/AudioSystem.js';
import { toast } from './Toast.js';

let layer = null;

function floatLayer() {
  if (layer) return layer;
  layer = document.createElement('div');
  layer.id = 'floatFx';
  document.body.appendChild(layer);
  return layer;
}

/** Posição do jogador em pixels da tela (usa o mesmo cálculo de escala do canvas do jogo). */
function playerScreenPos() {
  const c = document.querySelectorAll('canvas')[0];
  if (!c || !vcam) return { x: innerWidth / 2, y: innerHeight / 2 };
  const r = c.getBoundingClientRect(),
    sc = Math.min(r.width / VW, r.height / VH);
  return {
    x: r.left + (r.width - VW * sc) / 2 + (S.px - vcam.x) * sc,
    y: r.top + (r.height - VH * sc) / 2 + (S.py - 26 - vcam.y) * sc,
  };
}

/** Texto que sobe e some sobre o jogador. `delay` (ms) e `dy` (px, para baixo) escalonam vários textos sem se sobrepor. */
export function floatText(text, color, size = 15, delay = 0, dx = 0, dy = 0) {
  const el = document.createElement('div');
  el.className = 'fxText';
  el.textContent = text;
  const p = playerScreenPos();
  el.style.cssText = `left:${p.x + dx}px;top:${p.y + dy}px;color:${color};font-size:${size}px;animation-delay:${delay}ms`;
  floatLayer().appendChild(el);
  setTimeout(() => el.remove(), 1700 + delay);
  while (layer.childElementCount > 8) layer.firstChild.remove();
}

/**
 * Mostra o resultado de uma colheita (o que `harvestCrop` devolveu).
 * Premium > Excelente > Boa > Comum em destaque; extras e semente recuperada aparecem à parte.
 */
export function harvestFeedback(res) {
  if (!res) return;
  const name = CROP_NAME[res.key] || res.key,
    best = Math.max(...res.units),
    Q = QUALITIES[best],
    n = res.units.length;
  let msg = 'Colheita: ' + name;
  if (n > 1) msg += ' ×' + n;
  if (best > 0) msg += ' · ' + Q.mark + ' ' + Q.name;
  if (res.seedBack) msg += ' · +1 semente';
  toast(msg, best > 0 ? Q.color : '');

  if (best === 0) beep(660, 0.08, 'triangle');
  else if (best === 1) beep(740, 0.1, 'triangle');
  else if (best === 2) {
    beep(784, 0.1, 'triangle');
    setTimeout(() => beep(988, 0.14, 'triangle'), 90);
  } else {
    [660, 880, 1109, 1319].forEach((f, k) => setTimeout(() => beep(f, 0.16, 'triangle'), k * 80));
  }

  if (best >= 2) floatText(Q.mark + ' ' + Q.name + '!', Q.color, best === 3 ? 22 : 18);
  else if (best === 1) floatText(Q.mark + ' ' + Q.name, Q.color, 14);
  if (res.extra > 0) floatText('+' + res.extra + ' extra', '#8fe38f', 15, 220, 0, 24);
  if (res.seedBack) floatText('🌱 +1 semente', '#d8f5a2', 14, 440, 0, 46);
}
