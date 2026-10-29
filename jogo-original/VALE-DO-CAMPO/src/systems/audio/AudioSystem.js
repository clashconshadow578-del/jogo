/**
 * Contexto de áudio compartilhado, ruído base e bipes de interface.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

/* ============ SONS (síntese): vaca, boi, bezerro, árvores, passos ============ */
function getAC() {
  if (!audioUnlocked) return null;
  try {
    if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state === 'suspended') AC.resume();
    return AC;
  } catch (e) {
    return null;
  }
}

let NBUF = null;
function noiseBuf(a) {
  if (!NBUF) {
    NBUF = a.createBuffer(1, a.sampleRate * 2, a.sampleRate);
    const d = NBUF.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return NBUF;
}

/* ============ ÁUDIO (síntese, sem arquivos) ============ */
let AC = null;
// Correção: o navegador só permite áudio depois de um gesto; antes disso não criamos/retomamos o contexto.
let audioUnlocked = false;
for (const ev of ['pointerdown', 'keydown', 'touchstart'])
  addEventListener(
    ev,
    () => {
      audioUnlocked = true;
    },
    { capture: true, passive: true },
  );

function beep(f, d, type = 'square') {
  try {
    if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state === 'suspended') AC.resume();
    const o = AC.createOscillator(),
      g = AC.createGain();
    o.type = type;
    o.frequency.value = f;
    o.connect(g);
    g.connect(AC.destination);
    const t = AC.currentTime;
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + d);
    o.start(t);
    o.stop(t + d);
  } catch (e) {}
}

export { beep, getAC, noiseBuf };
