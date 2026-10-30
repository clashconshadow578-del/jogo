/**
 * Raposas da fazenda: ao entardecer saem da mata, caçam galinhas e as levam para a floresta.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { MH, MW, OX, OY, TREE, TS } from '../../config/constants.js';
import { extensible } from '../../core/extensions.js';
import { S, sleeping } from '../../core/GameState.js';
import { chx, setChx } from './Chickens.js';
import { ctx } from '../../rendering/Canvas.js';
import { solid } from '../../systems/CollisionSystem.js';
import { assetUrl } from '../../utils/assets.js';
import { rr } from '../../utils/Random.js';
import { hurtPlayer } from '../PlayerHurt.js';
import { obj } from '../../world/World.js';

/* ============ RAPOSAS: ao entardecer caçam galinhas, levam a presa para a floresta e comem ============ */
const FOX_IMG = new Image();

let fox = [],
  foxDayStart = -1,
  foxForest = null;

function foxForestPts() {
  if (foxForest) return foxForest;
  const pts = [];
  for (let y = 0; y < MH; y++)
    for (let x = 0; x < MW; x++) {
      if (obj[y * MW + x] !== TREE) continue;
      if (x >= OX - 2 && x <= OX + 98 && y >= OY - 2 && y <= OY + 66) continue; // a floresta é fora da fazenda
      if (pts.length < 400) pts.push({ x: x * TS + 8, y: y * TS + 8 });
    }
  if (!pts.length) pts.push({ x: 8, y: 8 });
  return (foxForest = pts);
}

function foxRandomForest() {
  const P = foxForestPts();
  return P[(Math.random() * P.length) | 0];
}

function foxSpawnDusk() {
  const h = 6 + S.min / 60;
  if (h >= 17.5 && h < 21 && foxDayStart !== S.day) {
    foxDayStart = S.day;
    for (let k = 0; k < 2; k++) {
      const f = foxRandomForest();
      fox.push({ x: f.x, y: f.y, st: 'caça', target: null, wander: null, prey: null, dir: 1, t: 0, fr: 0 });
    }
  }
  if (h < 17 || h >= 21) {
    for (const f of fox) {
      if (f.prey) {
        f.prey.holder = null;
        f.prey.state = 'andar';
        f.prey = null;
      }
    }
    fox = [];
  } // amanhecer: as raposas voltam para a mata
}

function nearestFreeChicken(f, r) {
  let best = null,
    bd = r;
  for (const c of chx) {
    if (c.holder) continue;
    const d = Math.hypot(c.x - f.x, c.y - f.y);
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}

const updateFox = extensible(function updateFox(dt) {
  if (sleeping) return;
  foxSpawnDusk();
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  for (const f of fox) {
    f.fr += dt;
    const dP = dist(f, { x: S.px, y: S.py });
    f.pcool = Math.max(0, (f.pcool || 0) - dt);
    if (!S.inside && dP < 90 && f.pcool <= 0 && f.st !== 'persegue' && f.st !== 'foge' && f.st !== 'descansa') {
      // a raposa da fazenda não foge de gente: persegue e morde (solta a galinha que estiver carregando)
      if (f.prey) {
        const p = f.prey;
        p.holder = null;
        p.state = 'fugir';
        p.t = 2.5;
        p.tx = p.x + (p.x - f.x) * 3 + rr(-10, 10);
        p.ty = p.y + (p.y - f.y) * 3 + rr(-10, 10);
        f.prey = null;
      }
      f.st = 'persegue';
      f.stk = 0;
      f.bgap = 0;
    }
    let tg = null,
      sp = 0;
    if (f.st === 'persegue') {
      f.bgap = Math.max(0, (f.bgap || 0) - dt);
      if (S.inside || dP > 150 || (f.stk || 0) > 0.6) {
        // desistiu: o jogador escapou, ou a raposa travou num obstáculo (cerca, árvore)
        f.st = 'caça';
        f.target = null;
        f.wander = null;
        f.pcool = 4;
      } else if (dP < 11) {
        if (f.bgap <= 0) {
          f.bgap = 1.2;
          hurtPlayer({
            dmg: 6,
            from: f,
            label: '🦊 A raposa da fazenda te mordeu!',
            kick: 100,
            source: 'A raposa da fazenda',
          });
        }
      } else {
        tg = { x: S.px, y: S.py };
        sp = 58;
      }
    } else if (f.st === 'caça') {
      if (!f.target || f.target.holder || !chx.includes(f.target)) f.target = nearestFreeChicken(f, 500);
      if (f.target) {
        tg = f.target;
        sp = 46;
        if (dist(f, tg) < 7) {
          tg.holder = f;
          tg.state = 'presa';
          f.prey = tg;
          f.st = 'carrega';
          f.target = foxRandomForest();
          tg = null;
        }
      } else {
        if (!f.wander || dist(f, f.wander) < 8) f.wander = { x: f.x + rr(-60, 60), y: f.y + rr(-60, 60) };
        tg = f.wander;
        sp = 22;
      }
    } else if (f.st === 'carrega') {
      tg = f.target;
      sp = 34;
      if (dist(f, tg) < 8) {
        setChx(chx.filter((q) => q !== f.prey));
        f.prey = null;
        f.st = 'descansa';
        f.t = 12;
        tg = null;
      } // come a presa na mata
    } else if (f.st === 'foge') {
      tg = f.target;
      sp = 55;
      if (dist(f, tg) < 8) {
        f.gone = true;
      }
    } else if (f.st === 'descansa') {
      f.t -= dt;
      if (f.t <= 0) f.gone = true;
    }
    if (tg && sp > 0) {
      const dx = tg.x - f.x,
        dy = tg.y - f.y,
        d = Math.hypot(dx, dy) || 1,
        st = Math.min(sp * dt, d);
      const nx = f.x + (dx / d) * st,
        ny = f.y + (dy / d) * st;
      const blocked = solid(Math.floor(nx / TS), Math.floor(ny / TS));
      if (!blocked) {
        f.x = nx;
        f.y = ny;
      }
      if (f.st === 'persegue') f.stk = blocked ? (f.stk || 0) + dt : 0;
      if (Math.abs(dx) > 0.3) f.dir = dx > 0 ? 1 : -1;
    }
    if (f.prey) {
      f.prey.x = f.x + f.dir * 5;
      f.prey.y = f.y + 3;
    }
  }
  fox = fox.filter((f) => !f.gone);
});

function drawFox(f) {
  const run = f.st === 'caça' || f.st === 'carrega' || f.st === 'foge' || f.st === 'persegue',
    fr = run ? Math.floor(f.fr * 10) % 2 : 0;
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.beginPath();
  ctx.ellipse(f.x, f.y + 2, 6, 2, 0, 0, 6.283);
  ctx.fill();
  if (FOX_IMG.complete && FOX_IMG.naturalWidth) {
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.scale(f.dir < 0 ? -1 : 1, 1);
    ctx.drawImage(FOX_IMG, fr * 16, 0, 16, 12, -8, -10, 16, 12);
    ctx.restore();
  }
}

export function loadFoxSprite() {
  FOX_IMG.src = assetUrl('sprites/animals/fox_farm.webp'); // 2 quadros de corrida, 16x12 px, viradas à direita
}

/** Atualiza `fox` a partir de outros módulos (as ligações importadas são somente leitura). */
export function setFox(value) {
  fox = value;
  return value;
}

export { drawFox, fox, updateFox };
