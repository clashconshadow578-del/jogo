/**
 * Volume geral: todo AudioContext criado passa por um ganho de 0,22 e um filtro passa-baixa de 5 kHz.
 *
 * Origem: Vale_do_Campo_V64.html (s00)
 */
/* volume geral suave */

const O = window.AudioContext || window.webkitAudioContext;
const MASTER = 0.22;
function W(...a) {
  const c = new O(...a),
    d = c.destination,
    m = c.createGain();
  m.gain.value = MASTER;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 5000;
  m.connect(lp).connect(d);
  Object.defineProperty(c, 'destination', {
    get() {
      return m;
    },
  });
  return c;
}

export function installMasterVolume() {
  if (!O) return;
  W.prototype = O.prototype;
  window.AudioContext = W;
  window.webkitAudioContext = W;
}
