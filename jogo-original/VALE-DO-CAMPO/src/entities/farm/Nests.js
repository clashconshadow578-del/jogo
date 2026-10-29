/**
 * Ninhos: galinhas cavam ninhos, põem ovos, chocam e os pintinhos herdam genes do galo e da galinha.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { TS } from '../../config/constants.js';
import { extensible } from '../../core/extensions.js';
import { sleeping } from '../../core/GameState.js';
import { chx, CHX_ADULT, chxCross, chxGenesFounder, chxPick, mkChx } from './Chickens.js';
import { ctx } from '../../rendering/Canvas.js';
import { toast } from '../../ui/Toast.js';
import { rr } from '../../utils/Random.js';
import { inAct } from '../../world/World.js';

/* ===== NINHOS: galinhas põem ovos, cavam um ninho na terra e chocam ===== */
const CH_EGGS = 5,
  CH_HATCH = 240; // ovos por ninhada; segundos de incubação

let ninhos = [],
  ninhoId = 1;

function ninhoAt(x, y) {
  const n = { id: ninhoId++, x: Math.floor(x / TS) * TS + 8, y: Math.floor(y / TS) * TS + 8, hen: -1, eggs: 0, t: 0 };
  ninhos.push(n);
  return n;
}

function ninhoSave() {
  return ninhos.map((n) => ({ id: n.id, x: n.x, y: n.y, hen: n.hen, eggs: n.eggs, t: n.t }));
}

function restoreNinhos(arr) {
  ninhos = Array.isArray(arr) ? arr.map((o) => Object.assign({}, o)) : [];
  ninhoId = Math.max(1, ...ninhos.map((n) => n.id + 1));
}

/**
 * Antes, a cada dia a galinha botava um ovo "dentro de um ninho" e chocava sozinha. Agora a postura e a eclosão
 * são do sistema de ovos (entities/farm/Eggs.js): ovos de verdade no mundo, com relógio do jogo. Esta função
 * continua existindo porque Chickens.js a chama uma vez por dia; não faz mais nada.
 */
function chxBreed() {}

const updateNinhos = extensible(function updateNinhos(dt) {
  if (sleeping) return;
  for (const n of ninhos) {
    const h = chx.find((c) => c.id === n.hen);
    if (!h || !h.broody || h.state !== 'choca' || h.holder) continue;
    n.t += dt;
    if (n.t >= CH_HATCH && n.eggs > 0) {
      const roo = chx.filter((c) => c.sex === 'm' && c.age >= CHX_ADULT),
        r = roo.length ? roo[(Math.random() * roo.length) | 0] : null;
      const k0 = n.eggs;
      for (let k = 0; k < k0 && chx.length < 30; k++) {
        const g = r ? chxCross(r.g, h.g) : chxGenesFounder();
        chx.push(
          mkChx({ x: n.x + rr(-3, 3), y: n.y + rr(-2, 2), sex: Math.random() < 0.5 ? 'm' : 'f', age: 0, mom: h.id, g }),
        );
      }
      if (inAct(n.x, n.y)) toast('🐣 ' + k0 + ' ovo' + (k0 > 1 ? 's' : '') + ' eclodiram!');
      n.eggs = 0;
      n.t = 0;
      h.broody = false;
      h.state = 'andar';
      chxPick(h);
    }
  }
});

function drawNinho(n) {
  ctx.fillStyle = 'rgba(0,0,0,.2)';
  ctx.beginPath();
  ctx.ellipse(n.x, n.y + 2, 7, 3, 0, 0, 6.283);
  ctx.fill();
  ctx.fillStyle = '#6b4628';
  ctx.beginPath();
  ctx.ellipse(n.x, n.y, 6, 3, 0, 0, 6.283);
  ctx.fill(); // cova na terra
  ctx.fillStyle = '#d9b45a';
  for (let i = 0; i < 6; i++) ctx.fillRect(n.x - 5 + ((i * 5) % 9), n.y - 1 + (i % 2), 1, 1); // palha
  for (let i = 0; i < n.eggs && i < 6; i++) {
    const ex = n.x - 4 + (i % 3) * 3.5,
      ey = n.y - 1 + (i > 2 ? 1.5 : 0);
    ctx.fillStyle = '#f3ecd8';
    ctx.beginPath();
    ctx.ellipse(ex, ey, 1.6, 2, 0, 0, 6.283);
    ctx.fill();
    ctx.strokeStyle = '#b8a57f';
    ctx.lineWidth = 0.4;
    ctx.stroke();
  }
}

/** Atualiza `ninhos` a partir de outros módulos (as ligações importadas são somente leitura). */
export function setNinhos(value) {
  ninhos = value;
  return value;
}

export { chxBreed, drawNinho, ninhoSave, ninhos, restoreNinhos, updateNinhos };
