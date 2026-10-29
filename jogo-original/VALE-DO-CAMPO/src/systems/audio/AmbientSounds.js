/**
 * Sons de ambiente sintetizados: passos por tipo de chão, folhas ao vento e água calma perto da margem.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { GRASS, MH, MW, TREE, TS, WATER } from '../../config/constants.js';
import { S, sleeping } from '../../core/GameState.js';
import { getAC, noiseBuf } from './AudioSystem.js';
import { climate } from '../../world/WeatherSystem.js';
import { ground, obj } from '../../world/World.js';

function stepSfx(kind) {
  const a = getAC();
  if (!a) return;
  const t = a.currentTime,
    s = a.createBufferSource(),
    fl = a.createBiquadFilter(),
    g = a.createGain();
  s.buffer = noiseBuf(a);
  s.playbackRate.value = 0.85 + Math.random() * 0.3;
  const P =
    kind === 'wood'
      ? { t: 'lowpass', f: 900, q: 1.5, v: 0.07, d: 0.07 }
      : kind === 'grass'
        ? { t: 'bandpass', f: 1700, q: 0.6, v: 0.045, d: 0.11 }
        : { t: 'lowpass', f: 650, q: 0.8, v: 0.06, d: 0.09 };
  fl.type = P.t;
  fl.frequency.value = P.f * (0.9 + Math.random() * 0.2);
  fl.Q.value = P.q;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(P.v, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0005, t + P.d);
  s.connect(fl).connect(g).connect(a.destination);
  s.start(t, Math.random() * 1.5, P.d + 0.05);
}

let stepT = 0,
  lpx = null,
  lpy = null,
  trN = null,
  trG = null,
  trCnt = 0,
  trT = 0;

let lkN = null,
  lkG = null,
  lkT = 0,
  lkD = 99; // som calmo de lago

function sfxTick(dt) {
  const a = getAC();
  if (!a || sleeping) return;
  if (lpx == null) {
    lpx = S.px;
    lpy = S.py;
  }
  const mv = Math.hypot(S.px - lpx, S.py - lpy);
  lpx = S.px;
  lpy = S.py;
  if (mv > 0.15 && dt > 0 && !(S.wetK > 0.05)) {
    stepT -= dt;
    const sp = mv / dt;
    if (stepT <= 0) {
      stepT = Math.max(0.2, Math.min(0.5, 9 / Math.max(sp, 1)));
      let k = 'grass';
      if (S.inside) k = 'wood';
      else {
        const tx = Math.floor(S.px / TS),
          ty = Math.floor(S.py / TS),
          g = ground[ty * MW + tx];
        k = g === GRASS ? 'grass' : 'dirt';
      }
      stepSfx(k);
    }
  } else stepT = 0;
  // rumor das folhas: some conforme a distância das árvores e cresce com o vento
  if (!trN) {
    trN = a.createBufferSource();
    trN.buffer = noiseBuf(a);
    trN.loop = true;
    const bp = a.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 2300;
    bp.Q.value = 0.5;
    const hp = a.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 900;
    trG = a.createGain();
    trG.gain.value = 0;
    trN.connect(bp).connect(hp).connect(trG).connect(a.destination);
    trN.start();
  }
  trT -= dt;
  if (trT <= 0) {
    trT = 0.5;
    trCnt = 0;
    if (!S.inside) {
      const cx = Math.floor(S.px / TS),
        cy = Math.floor(S.py / TS);
      for (let y = cy - 6; y <= cy + 6; y++)
        for (let x = cx - 6; x <= cx + 6; x++) {
          if (x < 0 || y < 0 || x >= MW || y >= MH) continue;
          if (obj[y * MW + x] === TREE) {
            const d = Math.hypot(x - cx, y - cy);
            if (d <= 6) trCnt += 1 - d / 6.5;
          }
        }
    }
  }
  const w = climate.wind || 0.5,
    tt = performance.now() / 1000,
    gust = 0.55 + 0.45 * Math.sin(tt * 0.9) * Math.sin(tt * 0.37 + 1);
  const tgt = Math.min(0.09, Math.min(1, trCnt / 5) * (0.012 + w * 0.06 + (climate.kind >= 3 ? 0.03 : 0)) * gust);
  trG.gain.value = 0;
  // água calma: ruído grave e suave, com ondulação lenta, que sobe só perto da margem
  if (!lkN) {
    lkN = a.createBufferSource();
    lkN.buffer = noiseBuf(a);
    lkN.loop = true;
    lkN.playbackRate.value = 0.6;
    const lp = a.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 380;
    lp.Q.value = 0.4;
    lkG = a.createGain();
    lkG.gain.value = 0;
    const lf = a.createOscillator(),
      lfg = a.createGain(),
      sw = a.createGain();
    lf.frequency.value = 0.23;
    lfg.gain.value = 0.25;
    sw.gain.value = 0.75;
    lf.connect(lfg).connect(sw.gain);
    lkN.connect(lp).connect(sw).connect(lkG).connect(a.destination);
    lkN.start();
    lf.start();
  }
  lkT -= dt;
  if (lkT <= 0) {
    lkT = 0.4;
    lkD = 99;
    if (!S.inside) {
      const cx = Math.floor(S.px / TS),
        cy = Math.floor(S.py / TS);
      for (let y = cy - 9; y <= cy + 9; y++)
        for (let x = cx - 9; x <= cx + 9; x++) {
          if (x < 0 || y < 0 || x >= MW || y >= MH || ground[y * MW + x] !== WATER) continue;
          const d = Math.hypot(x - cx, y - cy);
          if (d < lkD) lkD = d;
        }
    }
  }
  lkG.gain.setTargetAtTime(
    S.inside ? 0 : Math.pow(Math.max(0, 1 - lkD / 9.5), 1.5) * 0.03 * (1 - Math.min(1, climate.rain * 1.5)),
    a.currentTime,
    0.8,
  );
}

export { sfxTick };
