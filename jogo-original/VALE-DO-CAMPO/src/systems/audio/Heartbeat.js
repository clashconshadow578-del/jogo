/**
 * Coração batendo: com a vida abaixo de 40%, um "tum-tum" grave toca e, a cada ponto de vida que cai, bate mais rápido e mais forte
 * (para deixar o jogador desesperado). Sintetizado como o resto do áudio (sem arquivos). O ritmo usa o relógio REAL: o mundo roda
 * vários passos por quadro quando o personagem está desmaiado e o coração não pode acelerar por causa disso.
 */

import { S, sleeping } from '../../core/GameState.js';
import { heartbeat } from '../Vitals.js';
import { getAC } from './AudioSystem.js';

let next = 0; // instante real (s) da próxima batida

// Uma batida "tum-tum": o primeiro golpe é mais forte, o segundo vem logo depois e é mais fraco.
function thump(a, t, f, vol, len) {
  const o = a.createOscillator(),
    g = a.createGain(),
    lp = a.createBiquadFilter();
  o.type = 'sine';
  o.frequency.setValueAtTime(f * 1.9, t);
  o.frequency.exponentialRampToValueAtTime(f, t + 0.07); // cai de tom: o "golpe" no peito
  lp.type = 'lowpass';
  lp.frequency.value = 220;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  o.connect(lp).connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + len + 0.02);
}

export function playBeat(p) {
  const a = getAC();
  if (!a) return;
  const t = a.currentTime + 0.005,
    gap = Math.min(0.3, p.interval * 0.32);
  thump(a, t, 58, p.vol, 0.2);
  thump(a, t + gap, 48, p.vol * 0.7, 0.17);
}

/** Chamado a cada quadro de jogo: toca a próxima batida quando chega a hora. */
export function heartbeatTick() {
  const p = sleeping ? null : heartbeat(S.vida);
  const now = performance.now() / 1000;
  if (!p) {
    next = 0;
    return;
  }
  if (next === 0 || now > next + 1) next = now; // primeira batida (ou voltou de uma pausa): começa já
  if (now >= next) {
    playBeat(p);
    next += p.interval;
  }
}
