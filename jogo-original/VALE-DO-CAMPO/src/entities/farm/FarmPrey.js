/**
 * Animais da fazenda (vacas, bezerros, galinhas) como presas dos predadores selvagens.
 *
 * Cada vaca e cada galinha ganha um "espelho" (proxy): um objeto com o mesmo formato de uma presa selvagem (`sp`, `x`, `y`, `state`,
 * `mv`, `hunter`, `fhp`…) que a onça, a sucuri e a raposa percorrem como percorrem a lista `fauna`. Assim os predadores usam as MESMAS regras
 * para tudo (percepção, camuflagem, fome, espreita, bote, luta, comer); nada é especial para a fazenda, nem a raposa (era um sistema à parte).
 *
 * O espelho copia a posição do animal real e, quando um predador muda o estado dele, aplica no animal real:
 *   · `fight`  : o animal real fica parado (busy) enquanto é atacado;
 *   · `flee`   : o animal real foge (vaca: passo próprio; galinha: o estado "fugir" que ela já tem);
 *   · `dead`   : o animal real morre de verdade (vaca: `dead` + bReap; galinha: sai do galinheiro) e deixa carcaça.
 * Os animais da fazenda também percebem os predadores (FARM_FEAR) e fogem sozinhos, como os selvagens. Cerca barra os predadores como sempre.
 */

import { FARM_FEAR, FARM_PREY, PERC_DT } from '../../config/ecosystem.js';
import { S } from '../../core/GameState.js';
import { toast } from '../../ui/Toast.js';
import { chxDeadAdd } from '../Carcass.js';
import { animalTarget, percTick, senseTarget } from '../ai/Perception.js';
import { moveEnt } from '../ai/Steering.js';
import { cowCanWalk } from '../cow/Cow.js';
import { herd } from '../cow/Herd.js';
import { fauna } from '../wild/Fauna.js';
import { chx, setChx } from './Chickens.js';

const byReal = new Map(); // animal real -> espelho
const live = []; // espelhos vivos (é o que os predadores percorrem)
const dying = []; // espelhos já mortos que ainda servem de carcaça para o predador comer

let nid = 1;

function kindOf(real, isChicken) {
  return isChicken ? 'chicken' : real.calf ? 'calf' : 'cow';
}

function mk(real, isChicken) {
  const sp = kindOf(real, isChicken);
  return {
    farm: true,
    isChicken,
    real,
    sp,
    id: 100000 + nid++,
    x: real.x,
    y: real.y,
    px: real.x,
    py: real.y,
    dir: 0,
    mv: false,
    state: 'idle',
    own: 'idle', // último estado que o espelho pôs; se mudou, foi o predador
    hj: null, // estado "sequestrado" por um predador: fight | flee | dead
    t: 0,
    z: 0,
    zz: 0,
    fang: 0,
    fhp: 0,
    age: 999,
    hun: 0.3,
    hunter: null,
    gone: false,
    camo: 0,
    sz: 1,
    meat: 0,
  };
}

/** Estado "de caça" (o que o predador enxerga) a partir do estado do animal real. */
function mapState(p) {
  const s = p.real.state;
  if (p.isChicken) {
    if (s === 'fugir') return 'flee';
    if (s === 'ciscar' || s === 'caca' || s === 'cava') return 'forage';
    if (s === 'vigia') return 'alert';
    if (s === 'beber' || s === 'bebendo') return 'drink';
    if (s === 'banho' || s === 'choca') return 'rest';
    return 'idle';
  }
  if (s === 'graze') return 'forage';
  if (s === 'rest') return 'rest';
  if (s === 'drink') return 'drink';
  if (s === 'walk' || s === 'atrai') return 'go';
  return 'idle';
}

/** Anda o animal real para (tx,ty). Vaca: passo próprio; galinha: o AI dela cuida (estado "fugir"). */
function runAway(p, ang, dt) {
  const r = p.real,
    F = FARM_PREY[p.sp],
    tx = r.x + Math.cos(ang) * 60,
    ty = r.y + Math.sin(ang) * 60;
  if (p.isChicken) {
    r.state = 'fugir';
    r.prey = null;
    r.tx = tx;
    r.ty = ty;
    r.t = Math.max(r.t || 0, 0.6);
  } else {
    r.busy = true;
    moveEnt(r, tx, ty, F.run * (r.lifeF || 1), dt, cowCanWalk);
    r.walk = r.mv;
    r.state = 'walk';
  }
}

/** Mata o animal real de verdade. O espelho vira a carcaça que o predador come. */
function realDie(p) {
  const r = p.real;
  if (!r) return;
  byReal.delete(r);
  p.real = null;
  if (p.isChicken) {
    setChx(chx.filter((q) => q !== r));
    chxDeadAdd(r);
  } else {
    r.dead = true; // herd.js (bReap) tira do rebanho, faz a carcaça e devolve a matéria ao solo
    r.cause = 'um predador';
  }
  p.state = 'dead';
  p.own = 'dead';
  p.hunter = null;
  if (p.meat <= 0) p.meat = 0.4;
  p.t = Math.max(p.t, 60);
  dying.push(p);
}

const THREATS = { jaguar: 1, fox: 1, anaconda: 1, harpy: 1 };

/** O animal da fazenda percebe um predador? Devolve o predador mais ameaçador percebido ou null. */
function sense(p) {
  const table = FARM_FEAR[p.sp];
  if (!table) return null;
  let best = null,
    bd = 1e9;
  for (const f of fauna) {
    if (!THREATS[f.sp] || f.state === 'dead' || f.gone || f.state === 'perch') continue;
    const t = table[f.sp];
    if (!t) continue;
    const dx = f.x - p.x,
      dy = f.y - p.y;
    if (Math.abs(dx) > 220 || Math.abs(dy) > 220) continue;
    const st = f.state,
      hunting =
        st === 'pounce' || st === 'chase' || st === 'pchase' || st === 'charge' || st === 'drop' || st === 'strike' || st === 'hstoop' || st === 'hdefend'
          ? 2
          : st === 'stalk' || st === 'pstalk' || st === 'observe' || st === 'investigate' || st === 'ambush' || st === 'htrack' || st === 'hprep'
            ? 1
            : 0,
      r0 = t[hunting] * (p.state === 'rest' ? 0.7 : 1),
      s = senseTarget(p, animalTarget(f), r0);
    if (s.any && s.dist < bd) {
      bd = s.dist;
      best = f;
    }
  }
  return best;
}

function startFlee(p, from, sec) {
  p.hj = 'flee';
  p.state = 'flee';
  p.own = 'flee';
  p.t = sec;
  p.fang = Math.atan2(p.y - from.y, p.x - from.x) + (Math.random() - 0.5) * 0.6;
}

/** Atualiza todos os espelhos (uma vez por quadro, de updateFauna). */
export function farmUpdate(dt) {
  // 1) quem existe: espelhos novos e limpeza dos que sumiram
  const seen = new Set();
  const cowsKillable = herd.length > 1; // nunca sobra o rebanho sem nenhum animal (bReap precisa de um sucessor)
  const add = (real, isChicken) => {
    if (real.dead || real.holder) return;
    seen.add(real);
    let p = byReal.get(real);
    if (!p) byReal.set(real, (p = mk(real, isChicken)));
    p.sp = kindOf(real, isChicken);
  };
  for (const c of herd) add(c, false);
  for (const c of chx) add(c, true);
  for (const [r, p] of byReal) if (!seen.has(r)) byReal.delete(r), (p.gone = true);
  live.length = 0;
  for (const p of byReal.values()) {
    const r = p.real;
    // predador mudou o estado do espelho?
    if (p.state !== p.own) {
      if (p.state === 'fight' || p.state === 'flee' || p.state === 'dead') p.hj = p.state;
      else p.state = p.own;
    }
    if (p.hj === 'dead') {
      realDie(p);
      continue;
    }
    p.px = p.x;
    p.py = p.y;
    p.x = r.x;
    p.y = r.y;
    p.dir = p.isChicken ? (r.dir < 0 ? Math.PI : 0) : typeof r.dir === 'number' ? r.dir : 0;
    p.mv = p.isChicken ? Math.hypot(p.x - p.px, p.y - p.py) > 0.04 : !!r.walk;
    p.age = p.isChicken ? 999 : r.age == null ? 999 : r.age;
    p.hun = p.isChicken ? 0.3 : r.hunger || 0.3;
    if (p.hj === 'fight') {
      r.busy = true;
      r.walk = false;
      p.mv = false;
      p.state = 'fight';
      p.own = 'fight';
      p.t = Math.max(p.t, 1);
      if (!p.hunter || p.hunter.gone || p.hunter.state === 'dead') {
        // o predador sumiu ou morreu no meio da luta: ela se solta e foge
        p.hunter = null;
        startFlee(p, { x: p.x - Math.cos(p.fang || 0) * 20, y: p.y - Math.sin(p.fang || 0) * 20 }, 2);
      }
    } else if (p.hj === 'flee') {
      p.t -= dt;
      p.mv = true;
      runAway(p, p.fang || 0, dt);
      if (p.t <= 0) {
        p.hj = null;
        p.state = p.own = 'idle';
        r.busy = false;
        if (p.isChicken) r.state = 'andar';
      }
    } else {
      r.busy = false;
      p.state = p.own = mapState(p);
      // percepção do medo: a cada ~0,25 s (defasada por animal)
      if (percTick(p, dt, 's')) {
        const f = sense(p);
        if (f) {
          startFlee(p, f, p.isChicken ? 2 : 3);
          // o grupo ao redor também foge (galinhas gritam, o rebanho dispara junto)
          for (const q of byReal.values())
            if (q !== p && q.isChicken === p.isChicken && !q.hj && Math.hypot(q.x - p.x, q.y - p.y) < (p.isChicken ? 90 : 70))
              startFlee(q, f, p.isChicken ? 1.6 : 2.4);
        }
      }
    }
    if (p.sp !== 'cow' || cowsKillable) live.push(p);
  }
  // 2) carcaças que os predadores ainda comem: duram até a carne acabar ou o tempo passar
  for (let i = dying.length - 1; i >= 0; i--) {
    const d = dying[i];
    d.t -= dt;
    if (d.t <= 0 || d.gone) {
      d.gone = true;
      dying.splice(i, 1);
    }
  }
}

/** Presas da fazenda que um predador pode considerar agora (espelhos vivos, fora de luta/fuga morta). */
export function farmPrey() {
  return live;
}

/** Vacas ADULTAS (outras além de `p`) a até `r` px de `p`: o rebanho junto é perigoso para a onça (mais revide e menos presa fácil). */
export function farmGuards(p, r) {
  let n = 0;
  for (const q of live) if (q !== p && q.sp === 'cow' && q.state !== 'dead' && Math.hypot(q.x - p.x, q.y - p.y) < r) n++;
  return n;
}

/** Aviso na tela quando o predador pega um animal da fazenda perto do jogador. */
export function farmToast(msg, p) {
  if (Math.hypot(S.px - p.x, S.py - p.y) < 320) toast(msg);
}

/** Só para testes e depuração. */
export const farmDebug = { byReal, live, dying };
