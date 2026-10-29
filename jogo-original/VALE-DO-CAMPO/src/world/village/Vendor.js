/**
 * Vendedor de gado e aves na praça da vila (bezerros com preço crescente e galinhas).
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { TS } from '../../config/constants.js';
import { extensible } from '../../core/extensions.js';
import { S, sleeping } from '../../core/GameState.js';
import { cowCanWalk } from '../../entities/cow/Cow.js';
import { coatOf, newPat } from '../../entities/cow/CowGenetics.js';
import { herd, mkCow } from '../../entities/cow/Herd.js';
import { chx, CHX_ADULT, chxPheno, chxWalkOK, mkChx } from '../../entities/farm/Chickens.js';
import { crossesFence } from '../../systems/FenceQuery.js';
import { spend } from '../../entities/Player.js';
import { ctx } from '../../rendering/Canvas.js';
import { moo } from '../../systems/audio/AnimalSounds.js';
import { beep } from '../../systems/audio/AudioSystem.js';
import { toast } from '../../ui/Toast.js';
import { rr } from '../../utils/Random.js';
import { INST } from '../Instances.js';
import { qBtn, qClose, qIdx, qPanel, setQIdx } from './Quests.js';

/* ============ VENDEDOR DE GADO (praça da vila) ============ */
const VEND = {
  x: 49 * TS + 8,
  y: 45 * TS + 8,
  tx: 49 * TS + 8,
  ty: 45 * TS + 8,
  wait: 1.5,
  col: '#2e5da8',
  hat: '#f1c40f',
};

const updateVendor = extensible(function updateVendor(dt) {
  if (sleeping) return;
  const v = VEND; // vaga pela praça
  if (v.wait > 0) {
    v.wait -= dt;
    return;
  }
  const dx = v.tx - v.x,
    dy = v.ty - v.y,
    d = Math.hypot(dx, dy);
  if (d < 1) {
    v.wait = 2 + Math.random() * 3;
    v.tx = (45 + Math.random() * 8) * TS + 8;
    v.ty = (41 + Math.random() * 8) * TS + 8;
    return;
  }
  const st = Math.min(14 * dt, d);
  v.x += (dx / d) * st;
  v.y += (dy / d) * st;
});

function drawVendor() {
  const x = VEND.x,
    y = VEND.y;
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.beginPath();
  ctx.ellipse(x, y + 1, 5, 2, 0, 0, 6.283);
  ctx.fill();
  ctx.fillStyle = '#3a2e24';
  ctx.fillRect(x - 3, y - 4, 2, 4);
  ctx.fillRect(x + 1, y - 4, 2, 4);
  ctx.fillStyle = VEND.col;
  ctx.fillRect(x - 4, y - 11, 8, 7);
  ctx.fillStyle = '#8b5a2b';
  ctx.fillRect(x + 3, y - 9, 4, 4); // sacola
  ctx.fillStyle = '#f1c9a0';
  ctx.fillRect(x - 3, y - 16, 6, 5);
  ctx.fillStyle = VEND.hat;
  ctx.fillRect(x - 4, y - 18, 8, 3);
  ctx.fillRect(x - 3, y - 19, 6, 1);
}

// preço: começa em 10000 e sobe 10% a cada bezerro comprado
function calfPrice() {
  return S.calfPrice || 10000;
}

function openShop() {
  const p = calfPrice(),
    pc = 2000;
  setQIdx(-2);
  qPanel.innerHTML = '';
  const hd = document.createElement('div');
  hd.innerHTML = '<b>🐮🐔 Vendedor de Gado e Aves</b>';
  const t1 = document.createElement('div');
  t1.style.marginTop = '6px';
  t1.innerHTML = `<b>Bezerro</b> (cor e genes aleatórios): <span style="color:#ffd166">${p} moedas</span> · estoque: ${S.inv.bezerro || 0}`;
  const t2 = document.createElement('div');
  t2.style.marginTop = '6px';
  t2.innerHTML = `<b>Galinha</b> adulta (genes aleatórios): <span style="color:#ffd166">${pc} moedas</span> · estoque: ${S.inv.galinha || 0}`;
  const t3 = document.createElement('div');
  t3.style.cssText = 'margin-top:4px;opacity:.7;font-size:12px';
  t3.textContent = 'Você tem ' + S.coins + ' moedas. Use os itens na fazenda para soltá-los.';
  const bt = document.createElement('div');
  bt.append(
    qBtn(
      S.coins >= p ? 'Comprar bezerro' : 'Bezerro: sem moedas',
      () => {
        if (S.coins < p) {
          toast('Moedas insuficientes');
          return;
        }
        S.coins -= p;
        S.inv.bezerro = (S.inv.bezerro || 0) + 1;
        S.calfPrice = Math.round(p * 1.1);
        beep(880, 0.1, 'triangle');
        toast('🐮 Bezerro comprado! Próximo preço: ' + S.calfPrice);
        openShop();
      },
      S.coins >= p ? '#2a7d46' : '#777',
    ),
    qBtn(
      S.coins >= pc ? 'Comprar galinha' : 'Galinha: sem moedas',
      () => {
        if (S.coins < pc) {
          toast('Moedas insuficientes');
          return;
        }
        S.coins -= pc;
        S.inv.galinha = (S.inv.galinha || 0) + 1;
        beep(880, 0.1, 'triangle');
        toast('🐔 Galinha comprada!');
        openShop();
      },
      S.coins >= pc ? '#2a7d46' : '#777',
    ),
    qBtn('Fechar', qClose, '#555'),
  );
  qPanel.append(hd, t1, t2, t3, bt);
  qPanel.style.display = 'block';
}

function useChicken() {
  if (!(S.inv.galinha > 0)) return;
  if (!INST.homeAct) {
    toast('Leve a galinha para a fazenda para soltá-la');
    return;
  }
  if (chx.length >= 30) {
    toast('Galinheiro cheio (30 aves)');
    return;
  }
  let x = S.px + (Math.random() < 0.5 ? -1 : 1) * rr(14, 22),
    y = S.py + rr(-6, 6);
  if (!chxWalkOK(x, y) || crossesFence(S.px, S.py, x, y)) {
    x = S.px;
    y = S.py + 14;
    if (!chxWalkOK(x, y) || crossesFence(S.px, S.py, x, y)) {
      x = S.px;
      y = S.py;
    }
  }
  const k = mkChx({ x, y, sex: 'f', age: CHX_ADULT + 1 });
  chx.push(k);
  S.inv.galinha--;
  spend();
  toast('🐔 Uma galinha ' + chxPheno(k).color + ' chegou à fazenda!');
  beep(660, 0.2, 'triangle');
}

function randCalfGenes(black) {
  const a = () => (Math.random() < 0.5 ? 1 : 0),
    q = () => 0.82 + Math.random() * 0.36;
  return {
    B: black ? [1, a()] : [0, 0],
    D: [a(), a()],
    C: [a(), a()],
    S: [a(), a()],
    R: [a(), a()],
    Br: [a(), a()],
    size: [q(), q()],
    vig: [q(), q()],
    fert: [q(), q()],
    spd: [q(), q()],
    tint: [Math.random(), Math.random()],
    pat: newPat(),
  };
}

function useBezerro() {
  if (!(S.inv.bezerro > 0)) return;
  if (!INST.homeAct) {
    toast('Leve o bezerro para a fazenda para soltá-lo');
    return;
  }
  const black = Math.random() < 0.5,
    sex = Math.random() < 0.5 ? 'm' : 'f';
  let x = S.px + (Math.random() < 0.5 ? -1 : 1) * rr(14, 22),
    y = S.py + rr(-6, 6);
  if (!cowCanWalk(x, y) || crossesFence(S.px, S.py, x, y)) {
    x = S.px;
    y = S.py + 14;
    if (!cowCanWalk(x, y) || crossesFence(S.px, S.py, x, y)) {
      x = S.px;
      y = S.py;
    }
  }
  const k = mkCow({ x, y, black, sex, age: 0, calf: true, social: 1, g: randCalfGenes(black) });
  herd.push(k);
  S.inv.bezerro--;
  spend();
  toast('🐮 Um bezerro ' + coatOf(k).nm + ' apareceu!');
  beep(660, 0.2, 'triangle');
  moo('calf', 0.8);
}

export { VEND, drawVendor, openShop, updateVendor, useBezerro, useChicken };
