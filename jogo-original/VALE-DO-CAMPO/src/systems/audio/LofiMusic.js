/**
 * Música lofi da floresta gerada em tempo real (acordes, melodia pentatônica, bumbo) e botão liga/desliga.
 *
 * Origem: Vale_do_Campo_V64.html (s03)
 */
/* lofi floresta */

export function initLofi() {
  let C,
    bus,
    on = true,
    started = false,
    nb,
    next = 0,
    bar = 0,
    btn;

  const F = (n) => 440 * Math.pow(2, (n - 69) / 12),
    R = Math.random;

  const CH = [
    { b: 48, v: [60, 64, 67, 71] },
    { b: 45, v: [57, 60, 64, 67] },
    { b: 41, v: [57, 60, 64, 65] },
    { b: 43, v: [59, 62, 64, 67] },
  ];

  const PENT = [67, 69, 72, 74, 76, 79, 81];

  function init() {
    C = new (window.AudioContext || window.webkitAudioContext)();
    bus = C.createGain();
    bus.gain.value = 1.8;
    const dl = C.createDelay(1),
      fb = C.createGain(),
      lp = C.createBiquadFilter();
    dl.delayTime.value = 0.45;
    fb.gain.value = 0.38;
    lp.type = 'lowpass';
    lp.frequency.value = 1600;
    dl.connect(lp);
    lp.connect(fb);
    fb.connect(dl);
    const send = C.createGain();
    send.gain.value = 0.4;
    send.connect(dl);
    dl.connect(bus);
    const dry = C.createGain();
    dry.gain.value = 1;
    dry.connect(bus);
    bus.connect(C.destination);
    C.dry = dry;
    C.send = send;
    nb = C.createBuffer(1, C.sampleRate, C.sampleRate);
    const d = nb.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = R() * 2 - 1;
  }

  function note(f, t, dur, vol, type, cut, att, send) {
    const o = C.createOscillator(),
      o2 = C.createOscillator(),
      g = C.createGain(),
      l = C.createBiquadFilter();
    o.type = type;
    o2.type = 'sine';
    o.frequency.value = f;
    o2.frequency.value = f * 2.003;
    o.detune.value = (R() - 0.5) * 8;
    l.type = 'lowpass';
    l.frequency.value = cut;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + att);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const g2 = C.createGain();
    g2.gain.value = 0.25;
    o.connect(l);
    o2.connect(g2).connect(l);
    l.connect(g);
    g.connect(C.dry);
    if (send) g.connect(C.send);
    o.start(t);
    o2.start(t);
    o.stop(t + dur + 0.1);
    o2.stop(t + dur + 0.1);
  }

  function nz(t, dur, type, fr, vol) {
    const s = C.createBufferSource(),
      f = C.createBiquadFilter(),
      g = C.createGain();
    s.buffer = nb;
    f.type = type;
    f.frequency.value = fr;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(C.dry);
    s.start(t);
    s.stop(t + dur + 0.05);
  }

  function kick(t) {
    const o = C.createOscillator(),
      g = C.createGain();
    o.frequency.setValueAtTime(95, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g).connect(C.dry);
    o.start(t);
    o.stop(t + 0.3);
  }

  function chirp(t) {
    const b = 3000 + R() * 1500,
      n = 2 + ((R() * 3) | 0);
    for (let i = 0; i < n; i++) {
      const o = C.createOscillator(),
        g = C.createGain(),
        s = t + i * 0.11;
      o.frequency.setValueAtTime(b, s);
      o.frequency.exponentialRampToValueAtTime(b * 1.35, s + 0.07);
      g.gain.setValueAtTime(0.0001, s);
      g.gain.linearRampToValueAtTime(0.012, s + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.09);
      o.connect(g);
      g.connect(C.dry);
      g.connect(C.send);
      o.start(s);
      o.stop(s + 0.12);
    }
  }

  function playBar(t) {
    const B = 0.9,
      c = CH[bar % 4],
      sw = 0.06;
    c.v.forEach((n, i) => note(F(n), t + i * 0.025 + R() * 0.01, 3.2, 0.05, 'triangle', 1300, 0.04, true));
    note(F(c.b), t, 1.6, 0.2, 'sine', 500, 0.02, false);
    note(F(c.b), t + B * 2, 1.4, 0.15, 'sine', 500, 0.02, false);
    kick(t);
    kick(t + B * 2 + (R() < 0.3 ? B * 0.5 : 0));
    nz(t + B, 0.12, 'bandpass', 1800, 0.05);
    nz(t + B * 3, 0.12, 'bandpass', 1800, 0.05);
    for (let i = 0; i < 8; i++) nz(t + (i * B) / 2 + (i % 2 ? sw : 0), 0.04, 'highpass', 7000, 0.012 + R() * 0.006);
    let p = 0;
    for (let i = 0; i < 4; i++) {
      if (R() < 0.55) {
        const m = PENT[(R() * PENT.length) | 0],
          s = t + i * B + (R() < 0.5 ? 0 : B * 0.5) + R() * 0.03;
        note(F(m), s, 2.4, 0.032, 'sine', 2600, 0.09, true);
        p++;
      }
    }
    if (R() < 0.3) chirp(t + R() * B * 3);
    bar++;
  }

  function tick() {
    if (!C || !on) return;
    if (C.state === 'suspended') C.resume();
    if (next < C.currentTime) next = C.currentTime + 0.1;
    while (next < C.currentTime + 1.5) {
      playBar(next);
      next += 3.6;
    }
  }

  function start() {
    if (started) return;
    started = true;
    try {
      init();
      next = C.currentTime + 0.2;
      setInterval(tick, 400);
      tick();
    } catch (e) {}
  }

  ['pointerdown', 'keydown', 'touchstart'].forEach((e) => addEventListener(e, start, { once: true, passive: true }));

  function ui() {
    btn = document.createElement('button');
    btn.textContent = '🎵';
    btn.title = 'Música lofi';
    btn.style.cssText =
      'position:fixed;left:8px;bottom:8px;z-index:99999;width:34px;height:34px;border-radius:50%;border:0;background:rgba(0,0,0,.45);color:#fff;font-size:16px;opacity:.7';
    btn.onclick = (e) => {
      e.stopPropagation();
      start();
      on = !on;
      btn.textContent = on ? '🎵' : '🔇';
      if (C) {
        bus.gain.setTargetAtTime(on ? 1.8 : 0, C.currentTime, 0.3);
        if (on) {
          next = 0;
          tick();
        }
      }
    };
    document.body.appendChild(btn);
  }

  if (document.body) ui();
  else addEventListener('DOMContentLoaded', ui);
}
