/**
 * Mugidos sintetizados (vaca, boi, bezerro, grunhido) com volume pela distância.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { S } from '../../core/GameState.js';
import { getAC } from './AudioSystem.js';

const MOO = {
  cow: { f: 128, d: 1.35, g: 0.17, vib: 5, fl: [330, 820, 400] },
  ox: { f: 76, d: 1.8, g: 0.22, vib: 3.2, fl: [260, 620, 300] },
  calf: { f: 310, d: 0.65, g: 0.12, vib: 8, fl: [500, 1300, 700] },
  grunt: { f: 95, d: 0.32, g: 0.16, vib: 0, fl: [500, 420, 300] },
};

function moo(kind, vol = 1) {
  const a = getAC();
  if (!a || vol < 0.04) return;
  const P = MOO[kind],
    t = a.currentTime,
    d = P.d;
  const o = a.createOscillator(),
    l = a.createOscillator(),
    lg = a.createGain(),
    fl = a.createBiquadFilter(),
    g = a.createGain();
  o.type = 'sawtooth';
  const f = P.f * (0.95 + Math.random() * 0.1);
  o.frequency.setValueAtTime(f * 0.88, t);
  o.frequency.linearRampToValueAtTime(f * (kind === 'calf' ? 1.18 : 1.04), t + d * 0.35);
  o.frequency.linearRampToValueAtTime(f * (kind === 'grunt' ? 0.7 : 0.84), t + d);
  l.frequency.value = P.vib;
  lg.gain.value = f * 0.025;
  l.connect(lg).connect(o.frequency);
  fl.type = 'lowpass';
  fl.Q.value = 2.5;
  fl.frequency.setValueAtTime(P.fl[0], t);
  fl.frequency.linearRampToValueAtTime(P.fl[1], t + d * 0.4);
  fl.frequency.linearRampToValueAtTime(P.fl[2], t + d);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(P.g * vol, t + 0.09);
  g.gain.setValueAtTime(P.g * vol, t + d * 0.6);
  g.gain.linearRampToValueAtTime(0, t + d);
  o.connect(fl).connect(g).connect(a.destination);
  o.start(t);
  l.start(t);
  o.stop(t + d + 0.05);
  l.stop(t + d + 0.05);
}

function mooKind(c) {
  return c.calf ? 'calf' : c.sex === 'm' ? 'ox' : 'cow';
}

function mooVol(c) {
  if (S.inside) return 0;
  return Math.max(0, 1 - Math.hypot(c.x - S.px, c.y - S.py) / 280);
}

export { moo, mooKind, mooVol };
