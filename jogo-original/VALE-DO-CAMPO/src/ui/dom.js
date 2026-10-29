/**
 * Referências aos elementos fixos do index.html.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

const $ = (id) => document.getElementById(id);

const hud = $('hud'),
  hb = $('hotbar'),
  fadeEl = $('fade'),
  dlg = $('dlg');

const joy = $('joy'),
  knob = $('knob'),
  lumIn = $('lum'),
  menu = $('menu');

export { $, dlg, fadeEl, hb, hud, joy, knob, lumIn, menu };
