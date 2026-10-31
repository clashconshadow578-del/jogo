/**
 * Gritos da harpia, sintetizados: assobios agudos e penetrantes. São ALTOS e ouvidos de longe (ela grita da copa das árvores ou voando),
 * e ECOAM pela floresta: cada grito passa por um barramento de eco (dois atrasos com realimentação e abafamento) e vem com volume e lado pela
 * posição dela em relação ao jogador. Todos os números ficam em config/harpia.js (HARPIA.som).
 *
 * Tipos: 'chamado' (assobio longo que desce, o chamado comum) · 'contato' (mais curto e suave, entre o casal) · 'alerta' (piados rápidos de aviso
 * ao ninho e à defesa) · 'razante' (o grito do mergulho).
 */

import { HARPIA } from '../../config/harpia.js';
import { S } from '../../core/GameState.js';
import { getAC, noiseBuf } from './AudioSystem.js';

const Z = HARPIA.som;

/** Volume (0..1) a esta distância (px): ouve-se longe e cai devagar; de dentro de casa chega abafado. */
export function harpyVolume(dist, inside = false) {
  const v = Math.max(0, 1 - dist / Z.alcance);
  return Math.pow(v, 0.7) * (inside ? Z.dentroDeCasa : 1);
}

let BUS = null,
  BUS_AC = null;
/** O barramento de eco (criado uma vez por AudioContext): dois atrasos que se repetem, cada vez mais abafados. */
function eco(a) {
  if (BUS && BUS_AC === a) return BUS;
  const entrada = a.createGain(),
    saida = a.createGain();
  saida.gain.value = Z.eco;
  saida.connect(a.destination);
  for (const [atraso, retorno] of Z.atrasos) {
    const d = a.createDelay(2),
      fb = a.createGain(),
      lp = a.createBiquadFilter();
    d.delayTime.value = atraso;
    fb.gain.value = retorno;
    lp.type = 'lowpass';
    lp.frequency.value = 2600;
    entrada.connect(d);
    d.connect(lp);
    lp.connect(saida);
    lp.connect(fb);
    fb.connect(d);
  }
  BUS_AC = a;
  return (BUS = entrada);
}

/** Um assobio: ataque rápido, sobe um pouco e desce (`f0` -> pico -> `f1`), com vibrato, um harmônico e um sopro de ruído. */
function assobio(a, t0, dur, f0, f1, ganho, saida, dura = false) {
  const o = a.createOscillator(),
    h = a.createOscillator(),
    vib = a.createOscillator(),
    vg = a.createGain(),
    hg = a.createGain(),
    g = a.createGain();
  o.type = dura ? 'sawtooth' : 'triangle';
  h.type = 'sine';
  const f = (x) => x * (0.97 + Math.random() * 0.06);
  const a0 = f(f0),
    a1 = f(f1);
  for (const [osc, k] of [
    [o, 1],
    [h, 2],
  ]) {
    osc.frequency.setValueAtTime(a0 * 0.92 * k, t0);
    osc.frequency.linearRampToValueAtTime(a0 * 1.08 * k, t0 + dur * 0.16);
    osc.frequency.linearRampToValueAtTime(a1 * k, t0 + dur);
  }
  vib.frequency.value = 7.5;
  vg.gain.value = a0 * 0.014;
  vib.connect(vg);
  vg.connect(o.frequency);
  vg.connect(h.frequency);
  hg.gain.value = 0.28;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(ganho, t0 + Math.min(0.05, dur * 0.2));
  g.gain.setValueAtTime(ganho, t0 + dur * 0.55);
  g.gain.linearRampToValueAtTime(0, t0 + dur);
  o.connect(g);
  h.connect(hg);
  hg.connect(g);
  // sopro: ruído em faixa estreita acompanhando o assobio
  const n = a.createBufferSource(),
    bp = a.createBiquadFilter(),
    ng = a.createGain();
  n.buffer = noiseBuf(a);
  n.loop = true;
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(a0, t0);
  bp.frequency.linearRampToValueAtTime(a1, t0 + dur);
  bp.Q.value = 5;
  ng.gain.setValueAtTime(0, t0);
  ng.gain.linearRampToValueAtTime(ganho * (dura ? 0.9 : 0.35), t0 + 0.04);
  ng.gain.linearRampToValueAtTime(0, t0 + dur);
  n.connect(bp);
  bp.connect(ng);
  ng.connect(g);
  g.connect(saida);
  for (const x of [o, h, vib, n]) {
    x.start(t0);
    x.stop(t0 + dur + 0.05);
  }
}

/**
 * Faz a harpia `a` gritar (`tipo`). Devolve { vol, pan, dur } (para testes) ou null se não há áudio (antes do primeiro toque na tela) ou não se ouve.
 */
export function harpyCall(tipo, a) {
  const dist = Math.hypot(a.x - S.px, a.y - S.py),
    vol = harpyVolume(dist, S.inside);
  const ac = getAC();
  if (!ac || vol < 0.02) return null;
  const P = Z.tipos[tipo] || Z.tipos.chamado,
    t0 = ac.currentTime + 0.02,
    pan = Math.max(-1, Math.min(1, (a.x - S.px) / 420));
  // distância: o som de longe perde agudos
  const lp = ac.createBiquadFilter(),
    saida = ac.createGain();
  lp.type = 'lowpass';
  lp.frequency.value = 5200 - 3600 * (1 - Math.pow(vol, 0.6));
  saida.gain.value = Z.ganho * vol;
  let alvo = saida;
  if (ac.createStereoPanner) {
    const sp = ac.createStereoPanner();
    sp.pan.value = pan;
    saida.connect(sp);
    alvo = sp;
  }
  alvo.connect(lp);
  lp.connect(ac.destination);
  const env = ac.createGain(); // envio ao eco
  env.gain.value = P.eco;
  lp.connect(env);
  env.connect(eco(ac));
  let dur = 0;
  for (const n of P.notas) {
    assobio(ac, t0 + n.t, n.d, n.f0, n.f1, n.g, saida, !!n.aspero);
    dur = Math.max(dur, n.t + n.d);
  }
  return { vol, pan, dur };
}
