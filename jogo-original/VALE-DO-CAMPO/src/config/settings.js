/**
 * Configurações gráficas e de áudio escolhidas no menu (salvas em localStorage 'valeDoCampo_graphics_v2') e nível de qualidade efetivo Q(), que o governador de desempenho pode reduzir.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

const FXKEY = 'valeDoCampo_graphics_v2';

let gfx = {
  res: 'auto',
  quality: 'high',
  rays: true,
  particles: true,
  rainVol: 0.55,
  thunderVol: 0.65,
  flashes: true,
  chunks: false,
};

let qDrop = 0;
const Q = () => Math.max(0, ({ low: 0, medium: 1, high: 2, ultra: 3 }[gfx.quality] ?? 2) - qDrop);

function storeGraphics() {
  localStorage.setItem(FXKEY, JSON.stringify(gfx));
}

export function loadGraphicsSettings() {
  try {
    gfx = { ...gfx, ...JSON.parse(localStorage.getItem(FXKEY) || '{}') };
  } catch (e) {}
}

/** Atualiza `qDrop` a partir de outros módulos (as ligações importadas são somente leitura). */
export function setQDrop(value) {
  qDrop = value;
  return value;
}

export { Q, gfx, qDrop, storeGraphics };
