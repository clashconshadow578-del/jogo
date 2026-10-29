/**
 * Áudio do clima: contexto de chuva/vento e trovões sintetizados.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { gfx } from '../../config/settings.js';

let audioCtx = null,
  rainNode = null,
  rainGain = null,
  windNode = null,
  windGain = null;

function unlockWeatherAudio() {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 2, audioCtx.sampleRate),
        data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      rainNode = audioCtx.createBufferSource();
      rainNode.buffer = buffer;
      rainNode.loop = true;
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1100;
      filter.Q.value = 0.3;
      rainGain = audioCtx.createGain();
      rainGain.gain.value = 0;
      rainNode.connect(filter).connect(rainGain).connect(audioCtx.destination);
      rainNode.start();
      windNode = audioCtx.createBufferSource();
      windNode.buffer = buffer;
      windNode.loop = true;
      const windFilter = audioCtx.createBiquadFilter();
      windFilter.type = 'lowpass';
      windFilter.frequency.value = 350;
      windGain = audioCtx.createGain();
      windGain.gain.value = 0;
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch (e) {}
}

function thunder(strength) {
  if (!audioCtx || gfx.thunderVol <= 0) return;
  const dur = 2.5 + strength * 2,
    sr = audioCtx.sampleRate,
    buf = audioCtx.createBuffer(1, Math.floor(sr * dur), sr),
    d = buf.getChannelData(0);
  let low = 0;
  for (let i = 0; i < d.length; i++) {
    low = low * 0.975 + (Math.random() * 2 - 1) * 0.025;
    const t = i / sr;
    d[i] = low * Math.min(1, t * 16) * Math.exp(-t / (0.8 + strength * 1.3)) * (0.65 + 0.35 * Math.sin(t * 19));
  }
  const src = audioCtx.createBufferSource(),
    gain = audioCtx.createGain(),
    lp = audioCtx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 250 + strength * 430;
  gain.gain.value = gfx.thunderVol * (0.7 + strength * 0.7);
  src.buffer = buf;
  src.connect(lp).connect(gain).connect(audioCtx.destination);
  src.start();
}

export { audioCtx, rainGain, thunder, unlockWeatherAudio, windGain };
