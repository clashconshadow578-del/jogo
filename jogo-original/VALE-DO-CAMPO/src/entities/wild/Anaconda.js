/**
 * Sucuri (Eunectes murinus): emboscada na água, bote, constrição, engolir a presa (barriga que se desloca) e banho de sol.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { MH, MW, PATH, SAND, SCREE, SOIL, STONE, TS, WATER, GRASS } from '../../config/constants.js';
import { CAMO, CAMO_RGB, HUNT, PLAYER_PREY, camouflage, huntDecision } from '../../config/ecosystem.js';
import { S, sleeping } from '../../core/GameState.js';
import { sunInfo } from '../../core/TimeManager.js';
import { turnTo, wpick } from '../ai/Steering.js';
import {
  claimPlayerHunt,
  coverAt,
  ecoNight,
  ecoNow,
  evalPrey,
  hasLOS,
  percTick,
  playerFx,
  playerHunter,
  playerTarget,
  releasePlayerHunt,
  senseTarget,
} from '../ai/Perception.js';
import { hurtPlayer } from '../PlayerHurt.js';
import { crossesFence } from '../../systems/FenceQuery.js';
import { carcassFx } from '../Carcass.js';
import { boarMates, FA_SP, FA_ST, faFlee, faFree, faRow, faShoreL, faShoreNear, faSpawn, fauna } from './Fauna.js';
import { jagWater, TRAILS } from './Jaguar.js';
import { farmPrey } from '../farm/FarmPrey.js';
import { ctx } from '../../rendering/Canvas.js';
import { dynGet } from '../../rendering/DynPool.js';
import { bakeImg } from '../../rendering/SpriteUtils.js';
import { toast } from '../../ui/Toast.js';
import { assetUrl } from '../../utils/assets.js';
import { rr } from '../../utils/Random.js';
import { DOOR } from '../../world/HouseInterior.js';
import { WTc } from '../../world/hydrology/Hydrology.js';
import { ground, obj } from '../../world/World.js';

/* ============ SUCURI (Eunectes murinus) — predadora de emboscada semiaquática ============
 Comportamento baseado na biologia real da sucuri-verde:
 · mora na água doce rasa e nos brejos; fica SUBMERSA, só olhos e narinas fora (camuflagem) e espera na beira, onde a presa vem beber
 · sentido térmico nos lábios: detecta o calor da presa no escuro → mais ativa no crepúsculo e à noite
 · lenta em terra (~5 km/h), mais ágil na água; o bote é um disparo de ~0,2 s com alcance de ~1/3 do corpo
 · NÃO é venenosa: morde para prender (dentes curvos para trás) e enrola o corpo; a cada expiração da presa aperta mais
   → a presa morre por parada circulatória (pressão venosa), não por esmagamento de ossos nem por asfixia
 · engole a presa inteira, pela cabeça, deslocando as mandíbulas; a barriga fica com o formato da presa
 · depois de comer fica letárgica por dias (aqui: minutos), tomando sol na margem; presa grande = barriga grande = digestão longa
 · um bando de queixadas enfrenta e expulsa a sucuri; ela evita gente (só morde se pisarem nela) */
const ANA_IMG = new Image();
let ANA_CV = null;

const ANA_VPRED = 150; // vantagem efetiva do bote sobre a presa na avaliação de oportunidade
const ANA = {
  // Folha (assets/sprites/animals/anaconda.webp, gerada por tools/anaconda/make-anaconda.py): quadros de F x F px.
  // Linhas: 0 desliza para a ESQUERDA e 1 para a DIREITA (2 quadros: a cabeça fica na coluna HEAD, ou F-1-HEAD, na altura F/2);
  // 2 enrolada de frente, descansando (4 quadros) e 3 enrolada com a cabeça levantada, pronta para o bote (4 quadros): o centro fica em (F/2, F/2).
  // Para cima e para baixo o mesmo quadro que desliza gira 90 graus em volta da cabeça.
  F: 160,
  HEAD: 10,
  ROW: { L: 0, R: 1, rest: 2, ready: 3 },
  R: 48,
  prey: {
    hare: { k: 0.3, n: 'uma lebre' },
    grouse: { k: 0.18, n: 'um galo-lira' },
    fox: { k: 0.34, n: 'uma raposa' },
    deer: { k: 0.85, n: 'um cervo' },
    boar: { k: 1, n: 'uma queixada' },
    calf: { k: 0.8, n: 'um bezerro' }, // animais da fazenda na beira da água (entities/farm/FarmPrey.js)
    chicken: { k: 0.12, n: 'uma galinha' },
  },
};

function aWet(x, y) {
  const tx = Math.floor(x / TS),
    ty = Math.floor(y / TS);
  if (tx < 2 || ty < 2 || tx >= MW - 2 || ty >= MH - 2) return false;
  const i = ty * MW + tx;
  return ground[i] === WATER && (WTc[i] === 7 || WTc[i] === 8);
}

function aFree(x, y) {
  for (const ox of [-3, 3]) {
    const tx = Math.floor((x + ox) / TS),
      ty = Math.floor(y / TS);
    if (tx < 2 || ty < 2 || tx >= MW - 2 || ty >= MH - 2) return false;
    const i = ty * MW + tx;
    if (obj[i] !== 0) return false;
    if (ground[i] === WATER && WTc[i] !== 7 && WTc[i] !== 8) return false;
  }
  return true;
}

function aStep(a, tx, ty, sp, dt, burst) {
  const dx = tx - a.x,
    dy = ty - a.y,
    d = Math.hypot(dx, dy);
  if (d < 2) return true;
  turnTo(a, Math.atan2(dy, dx), dt * (burst ? 14 : 2.4));
  const st = Math.min(d, sp * dt);
  let ok = false;
  for (const off of [0, 0.6, -0.6, 1.2, -1.2]) {
    const an = a.dir + off,
      nx = a.x + Math.cos(an) * st,
      ny = a.y + Math.sin(an) * st;
    if (aFree(nx, ny)) {
      a.x = nx;
      a.y = ny;
      ok = true;
      break;
    }
  }
  a.mv = ok;
  a.stuck = ok ? Math.max(0, a.stuck - dt) : a.stuck + dt;
  return false;
}

function anaLz(a) {
  return a.dg > 0 ? 1 - 0.9 * Math.min(1, (a.dgK || 0.5) * a.dg * 1.6) : 1;
} // letargia da digestão

function anaNear(x, y, r) {
  const tx = Math.floor(x / TS),
    ty = Math.floor(y / TS);
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) {
      const X = tx + dx,
        Y = ty + dy;
      if (X < 0 || Y < 0 || X >= MW || Y >= MH) continue;
      if (ground[Y * MW + X] === WATER) return true;
    }
  return false;
}

function anaInitA(a) {
  a.dg = 0;
  a.dgK = 0;
  a.dg0 = 1;
  a.bk = 0;
  a.bp = 0.4;
  a.hun = 0.4 + Math.random() * 0.25;
  a.thi = 0;
  a.sz = 1;
  a.state = 'idle';
  a.t = rr(2, 6);
  a.hide = false;
  a.pcd = 0;
  a.cd = 0;
  a.scT = 0;
  a.gt = 0;
  a.stT = 0;
  return a;
}

function anaSpawnAt() {
  faShoreNear({ x: S.px, y: S.py });
  if (!faShoreL.length) return null;
  for (let k = 0; k < 80; k++) {
    const p = faShoreL[(Math.random() * faShoreL.length) | 0];
    if (Math.hypot(p[0] - S.px, p[1] - S.py) < 200 || Math.hypot(p[0] / TS - DOOR.x, p[1] / TS - DOOR.y) < 14) continue;
    const w = jagWater(p);
    if (w && aWet(w[0], w[1]) && aFree(w[0], w[1])) return w;
  }
  return null;
}

function anaInit() {
  const n = 1 + (Math.random() < 0.4 ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const w = anaSpawnAt();
    if (!w) break;
    const a = faSpawn('anaconda', w[0], w[1], false);
    anaInitA(a);
    a.state = 'ambush';
    a.t = rr(20, 60);
    a.hide = true;
  }
}

function anaSpot(a, R, land) {
  faShoreNear({ x: a.x, y: a.y });
  let best = null,
    bs = -1e9;
  for (let k = 0; k < 18; k++) {
    const p = faShoreL[(Math.random() * faShoreL.length) | 0];
    if (!p) break;
    const d = Math.hypot(p[0] - a.x, p[1] - a.y);
    if (d > R || Math.hypot(p[0] - S.px, p[1] - S.py) < 60) continue;
    let tr = 0;
    for (const q of TRAILS) if (Math.hypot(q.x - p[0], q.y - p[1]) < 90) tr++; // onde a presa passa para beber
    const s = Math.random() * 25 + Math.min(tr, 8) * 16 - d * 0.08;
    let w = land ? (faFree(p[0], p[1]) ? p : null) : jagWater(p);
    if (!w) continue;
    if (!land && !(aWet(w[0], w[1]) && aFree(w[0], w[1]))) continue;
    if (s > bs) {
      bs = s;
      best = w;
    }
  }
  return best;
}

/**
 * Melhor presa que a sucuri DETECTA (calor/visão curta) na beira da água. A fome só pesa no valor da presa:
 * saciada ela ainda pode observar (e, raramente, dar o bote se a oportunidade for ótima). Retorna { p, dec } ou null.
 */
function anaPrey(a, R) {
  let best = null;
  for (const p of fauna.concat(farmPrey())) {
    const P = ANA.prey[p.sp];
    if (
      !P ||
      p.state === 'dead' ||
      p.state === 'fight' ||
      p.state === 'fly' ||
      p.state === 'land' ||
      p.hunter ||
      p.gone
    )
      continue;
    const bm = p.sp === 'boar' ? boarMates(p, 60) : 0;
    if (bm >= 2) continue; // o bando enfrenta a sucuri
    const d = Math.hypot(p.x - a.x, p.y - a.y);
    if (d > R || !anaNear(p.x, p.y, 2)) continue; // só caça na beira da água
    const r = evalPrey(a, p, {
      hunt: HUNT.anaconda,
      vPred: ANA_VPRED,
      vPrey: FA_SP[p.sp].run,
      value: P.k,
      counter: P.k * 0.6,
      scanR: Math.max(R, HUNT.anaconda.scanR),
    });
    if (!r) continue;
    const drinking = p.state === 'drink' || p.state === 'wallow';
    r.dec = huntDecision(r.ev, HUNT.anaconda, (Math.random() - 0.5) * 0.04 + (drinking ? 0.03 : 0));
    if (r.dec === 'skip') continue;
    r.rank = r.ev.score - d / 400;
    if (!best || r.rank > best.rank) best = r;
  }
  return best;
}

/* ============ camuflagem ============ */
/** Tipo de chão sob a sucuri, para a camuflagem e para a cor do tom de mistura. */
function anaKind(a) {
  if (a.sw) return 'water';
  const tx = Math.floor(a.x / TS),
    ty = Math.floor(a.y / TS);
  if (tx < 0 || ty < 0 || tx >= MW || ty >= MH) return 'other';
  const g = ground[ty * MW + tx];
  if (g === WATER) return 'water';
  if (g === GRASS) return 'grass';
  if (g === SOIL) return 'soil';
  if (g === SAND) return 'sand';
  if (g === PATH) return 'path';
  if (g === STONE || g === SCREE) return 'stone';
  return 'other';
}

/** Camuflagem atual (0..1): depende do chão, da vegetação, da noite, de ela se mover e de ter atacado há pouco. */
function anaCamo(a) {
  a.kind = anaKind(a);
  return camouflage({ kind: a.kind, mato: coverAt(a.x, a.y), night: ecoNight(), moving: !!a.mvL, expose: a.expose });
}

/* ============ jogador como presa: bote de emboscada ============ */
const PA = PLAYER_PREY.anaconda;

/** Ela decide investir contra o jogador que entrou no alcance? (uma vez por entrada; saciada investe bem menos). */
function anaPlayerGo(a, dP) {
  if (S.inside || a.dg >= 0.3 || a.cd > 0 || playerFx.snareUntil > ecoNow() || ecoNow() < playerFx.freeUntil) return false;
  if (a.camo < PA.minCamo) return false; // sem camuflagem não há emboscada: ela prefere sumir
  if (a.plRoll) return false; // já decidiu nesta aproximação
  a.plRoll = true;
  if (!hasLOS(a.x, a.y, S.px, S.py) || crossesFence(a.x, a.y, S.px, S.py)) return false;
  const p = Math.min(0.9, PA.chance * (0.3 + 1.4 * a.hun));
  if (Math.random() >= p) return false;
  if (!claimPlayerHunt(a.id, PA.telegraph + 2)) return false;
  a.state = 'coil'; // aviso: o corpo se contrai (dá tempo de reagir)
  a.t = PA.telegraph;
  a.expose = CAMO.exposeT; // perde a camuflagem ao se revelar
  a.hide = false;
  a.mv = false;
  a.dir = Math.atan2(S.py - a.y, S.px - a.x);
  return true;
}

/** Persegue o jogador que está perto (rasteja atrás dele). Só com linha de visão e se nenhum outro predador já caça. */
function anaPursue(a) {
  if (a.state === 'pcrawl') return true;
  if (S.inside || sleeping || ecoNow() < playerFx.freeUntil || !hasLOS(a.x, a.y, S.px, S.py) || !claimPlayerHunt(a.id, 2)) return false;
  a.state = 'pcrawl';
  a.t = 999; // sem prazo: termina quando o jogador escapa
  a.loseT = 0;
  a.stuck = 0;
  a.bgap = 0;
  a.hide = false;
  a.mv = true;
  a.expose = CAMO.exposeT; // perdeu a camuflagem ao se revelar
  return true;
}

/** Depois de um bote errado ou de uma mordida: se o jogador ainda está perto, segue atrás dele; senão reavalia. */
function anaAfterPlayer(a, cool) {
  const dP = Math.hypot(S.px - a.x, S.py - a.y);
  if (dP < PA.chaseR && anaPursue(a)) return;
  anaDisengage(a, cool);
}

/** Desiste da perseguição: continua escondida na água, ou muda de lugar. */
function anaDisengage(a, cool) {
  a.cd = cool;
  a.pcd = Math.max(a.pcd || 0, 6); // errou o bote: não morde "em defesa" logo em seguida (seria um segundo ataque sem aviso)
  a.expose = CAMO.exposeT;
  releasePlayerHunt(a.id, cool);
  if (a.sw && Math.random() < PA.stayAfterMiss) {
    a.state = 'ambush';
    a.t = rr(25, 55);
    a.hide = true;
  } else anaFlee(a, true);
}

function anaStrike(a, p) {
  a.state = 'strike';
  a.tgt = p;
  a.t = 0.6;
  a.stT = 0;
  a.hide = false;
  let hp = 0.86;
  if (p.state === 'flee') hp = 0.38;
  else if (p.sp === 'hare' || p.sp === 'fox' || p.sp === 'grouse') hp = 0.62;
  else if (p.state === 'drink' || p.state === 'wallow') hp = 0.92;
  a.hitOk = Math.random() < hp;
  a.dir = Math.atan2(p.y - a.y, p.x - a.x);
}

function anaFlee(a, fast) {
  let best = null,
    bs = -1e9;
  for (let k = 0; k < 10; k++) {
    const an = Math.random() * 6.283,
      d = 70 + Math.random() * 60,
      x = a.x + Math.cos(an) * d,
      y = a.y + Math.sin(an) * d;
    if (!aFree(x, y)) continue;
    const s = Math.hypot(x - S.px, y - S.py) + (aWet(x, y) ? 80 : 0) + Math.random() * 20;
    if (s > bs) {
      bs = s;
      best = [x, y];
    }
  }
  if (!best) return;
  a.state = 'go';
  a.gx = best[0];
  a.gy = best[1];
  a.gsp = fast ? 1.8 : 1.3;
  a.after = 'ambush';
  a.adur = rr(40, 90);
  a.gt = 14;
  a.stuck = 0;
  a.hide = false;
}

function anaPlan(a, h) {
  const day = sunInfo(h).day,
    night = 1 - Math.min(1, day * 1.6),
    o = [];
  const hungry = a.hun > 0.42 && a.dg < 0.3 && a.cd <= 0;
  o.push(['rest', 20 + (a.dg > 0 ? 60 : 0)]);
  if (hungry) {
    o.push(['ambush', (60 + a.hun * 180) * (0.7 + 0.9 * night)]);
    o.push(['patrol', (20 + a.hun * 55) * (0.6 + night)]);
  }
  if (day > 0.5) o.push(['bask', a.dg > 0.04 ? 130 : 16]);
  const k = wpick(o);
  if (k === 'ambush' || k === 'patrol') {
    const w = anaSpot(a, k === 'ambush' ? 330 : 220, false);
    if (w) {
      a.state = 'go';
      a.gx = w[0];
      a.gy = w[1];
      a.gsp = 1;
      a.after = 'ambush';
      a.adur = k === 'ambush' ? rr(70, 170) : rr(18, 40);
      a.gt = 40;
      a.stuck = 0;
      return;
    }
  }
  if (k === 'bask') {
    const w = anaSpot(a, 300, true);
    if (w) {
      a.state = 'go';
      a.gx = w[0];
      a.gy = w[1];
      a.gsp = 1;
      a.after = 'bask';
      a.adur = rr(50, 110);
      a.gt = 60;
      a.stuck = 0;
      return;
    }
  }
  if (a.sw) {
    a.state = 'ambush';
    a.t = rr(30, 80);
    a.hide = true;
  } else {
    a.state = 'idle';
    a.t = rr(10, 24);
  }
}

function anaUpd(a, I, h, dt) {
  anaUpd0(a, I, h, dt);
  a.mvL = a.mv; // movimento deste quadro: a camuflagem do próximo usa (o laço geral zera `mv` antes de cada atualização)
}

function anaUpd0(a, I, h, dt) {
  a.hun = Math.max(0, a.hun - dt * 0.0052);
  a.thi = 0;
  a.pcd = Math.max(0, (a.pcd || 0) - dt); // metabolismo lento: ela passa semanas sem comer
  const dP = S.inside ? 9999 : Math.hypot(S.px - a.x, S.py - a.y),
    st = a.state,
    lz = anaLz(a);
  a.sw = aWet(a.x, a.y);
  a.expose = Math.max(0, (a.expose || 0) - dt);
  a.camo = anaCamo(a);
  if (dP > PA.reach * 1.8) a.plRoll = false; // saiu do alcance: na próxima aproximação ela decide de novo
  const near = dP < 320;
  if (a.dg > 0 && st !== 'swallow') {
    a.dg = Math.max(0, a.dg - dt / (70 + 470 * (a.dgK || 0.5)));
    a.bk = a.dgK * (0.3 + 0.7 * Math.min(1, a.dg * 1.2));
    a.bp = 0.34 + 0.27 * (1 - a.dg);
    if (a.dg <= 0) {
      a.bk = 0;
      if (near) toast('🐍 A sucuri terminou de digerir e voltou ao normal');
    }
  }
  if (
    st === 'strike' ||
    st === 'constrict' ||
    st === 'swallow' ||
    st === 'coil' ||
    st === 'pstrike' ||
    st === 'phold'
  ) {
  } else {
    if (dP < PA.defendR && a.pcd <= 0 && st !== 'dead' && st !== 'pcrawl' && !S.inside) {
      a.pcd = 16;
      if (
        hurtPlayer({
          dmg: PA.defendBite,
          from: a,
          label: '🐍 A sucuri te mordeu em defesa!',
          kick: PA.kick,
          source: 'A sucuri',
        })
      )
        toast('🐍 Ela não é venenosa e só ataca gente se pisarem nela — vai sumir na água');
      anaPursue(a) || anaDisengage(a, 4); // não foge: segue o jogador
      return;
    }
    if (dP < PA.fleeR && lz > 0.3 && st !== 'go' && st !== 'pcrawl') {
      const still = st === 'ambush' && a.camo >= PA.stayCamo; // camuflada: espera o jogador chegar perto
      if (!still || dP < PA.reach) {
        if (still && anaPlayerGo(a, dP)) return;
        if (anaPursue(a)) return; // antes fugia de gente; agora persegue
        a.state = 'ambush';
        a.t = rr(3, 6);
        a.hide = true;
        return;
      }
    } // (não foge: persegue quando o jogador entra no alcance)
  }
  a.hide = st === 'ambush' && a.sw;
  switch (st) {
    case 'idle':
    case 'rest':
      a.mv = false;
      a.t -= dt;
      if (a.t <= 0) anaPlan(a, h);
      break;
    case 'go': {
      const sp = (a.sw ? 26 : 11) * lz * (a.gsp || 1);
      a.gt -= dt;
      const arr = aStep(a, a.gx, a.gy, sp, dt);
      if (arr || a.stuck > 1.5 || a.gt <= 0) {
        a.state = a.after;
        a.t = a.adur;
        a.stuck = 0;
      }
      break;
    }
    case 'bask':
      a.mv = false;
      a.t -= dt;
      if (a.t <= 0) {
        a.state = 'idle';
        a.t = rr(3, 8);
      }
      break;
    case 'ambush': {
      a.mv = false;
      a.t -= dt;
      a.scT -= dt;
      if (a.scT <= 0) {
        a.scT = 0.2;
        if (a.dg < 0.3 && a.cd <= 0) {
          const r = anaPrey(a, 170);
          if (r) {
            const d = Math.hypot(r.p.x - a.x, r.p.y - a.y);
            if (r.dec === 'attack' && d < ANA.R) {
              anaStrike(a, r.p);
              break;
            }
            if (r.dec === 'attack' && a.sw && d >= ANA.R) {
              a.state = 'stalk';
              a.tgt = r.p;
              a.t = 30;
              break;
            }
          } // 'observe': fica quieta, de olho (o calor da presa denuncia onde ela está)
        }
      }
      if (a.t <= 0) {
        a.state = 'idle';
        a.t = rr(2, 6);
      }
      break;
    }
    case 'stalk': {
      const p = a.tgt;
      a.hide = a.sw;
      if (
        !p ||
        p.gone ||
        p.state === 'dead' ||
        p.state === 'fight' ||
        p.hunter ||
        p.state === 'flee' ||
        p.state === 'alert' ||
        !anaNear(p.x, p.y, 2)
      ) {
        a.state = 'ambush';
        a.t = rr(15, 40);
        break;
      }
      const d = Math.hypot(p.x - a.x, p.y - a.y);
      a.t -= dt;
      if (d < ANA.R) {
        anaStrike(a, p);
        break;
      }
      const arr = aStep(a, p.x, p.y, (a.sw ? 20 : 9) * lz, dt);
      if (a.stuck > 1 || a.t <= 0 || d > 260) {
        a.state = 'ambush';
        a.t = rr(15, 40);
        a.cd = 15;
      }
      break;
    }
    case 'strike': {
      const p = a.tgt;
      a.t -= dt;
      a.stT += dt;
      a.hide = false;
      if (!p || p.gone || p.state === 'dead' || p.state === 'fight' || p.hunter) {
        a.state = 'idle';
        a.t = 3;
        a.cd = 20;
        break;
      }
      const d = Math.hypot(p.x - a.x, p.y - a.y);
      aStep(a, p.x, p.y, 260, dt, true); // disparo: ~0,2 s
      if (d < 11 || a.t <= 0) {
        if (a.hitOk && d < 26) {
          anaGrab(a, p, near);
        } else {
          a.cd = 50;
          a.state = 'go';
          faFlee(p, { x: a.x, y: a.y, d: 20, r: 40 });
          anaFlee(a, true);
          if (near) toast('🐍 O bote da sucuri errou — ' + ANA.prey[p.sp].n + ' escapou');
        }
      }
      break;
    }
    case 'constrict': {
      const p = a.tgt;
      a.mv = false;
      a.t -= dt;
      if (!p || p.gone || p.state !== 'fight') {
        a.state = 'idle';
        a.t = 4;
        a.cd = 30;
        break;
      }
      p.dir += Math.sin(performance.now() / 60 + p.id) * 0.15; // a presa se debate, em vão
      if (p.sp === 'boar' && boarMates(p, 52) >= 2) {
        p.state = 'flee';
        p.hunter = null;
        p.t = 3;
        p.zz = 0;
        faFlee(p, { x: a.x, y: a.y, d: 10, r: 50 });
        a.cd = 90;
        a.state = 'go';
        anaFlee(a, true);
        if (near) toast('🐗 O bando de queixadas expulsou a sucuri!');
        break;
      }
      if (a.t <= 0) {
        const P = ANA.prey[p.sp],
          k = P.k;
        p.state = 'dead';
        p.hunter = null;
        p.t = 2.2;
        p.d0 = performance.now() / 1000;
        p.z = 0;
        p.row = faRow(p);
        p.meat = 0; // para a pressão: sem sangue circulando
        a.state = 'swallow';
        a.swT = 7 + 36 * k;
        a.t = a.swT;
        a.dgK = k;
        a.dg = 0;
        a.bk = 0;
        a.bp = 0.06;
        if (near)
          toast(
            '🐍 A presa parou de se debater (parada circulatória, não esmagamento). A sucuri vai engolir ' +
              P.n +
              ' inteira, pela cabeça',
          );
      }
      break;
    }
    case 'swallow': {
      a.mv = false;
      a.t -= dt;
      const pr = 1 - Math.max(0, a.t) / a.swT;
      a.bk = a.dgK * Math.min(1, 0.45 + pr);
      a.bp = 0.06 + 0.3 * pr;
      if (a.t <= 0) {
        const k = a.dgK;
        a.dg = 1;
        a.dg0 = 1;
        a.hun = Math.max(0, a.hun - (0.22 + 0.72 * k));
        a.cd = 140 + k * 200;
        a.state = 'rest';
        a.t = rr(30, 60);
        if (near)
          toast(
            '🐍 A sucuri engoliu ' +
              (k > 0.6
                ? 'uma presa grande: barriga enorme, ficará letárgica por muito tempo'
                : k > 0.3
                  ? 'uma presa média: barriga visível, digestão lenta'
                  : 'uma presa pequena: barriga discreta, digestão rápida'),
          );
      }
      break;
    }
    case 'coil': {
      // aviso do bote: parada, corpo contraído, já visível (perdeu a camuflagem). Se o jogador se afasta, ela desiste.
      a.mv = false;
      a.hide = false;
      a.t -= dt;
      a.expose = CAMO.exposeT;
      turnTo(a, Math.atan2(S.py - a.y, S.px - a.x), dt * 8);
      claimPlayerHunt(a.id, PA.telegraph + 1.5);
      if (S.inside || sleeping || dP > PA.reach * 1.6 || !hasLOS(a.x, a.y, S.px, S.py)) {
        anaAfterPlayer(a, 10);
        break;
      }
      if (a.t <= 0) {
        a.state = 'pstrike';
        a.t = PA.dashT;
        a.stT = 0;
        a.stuck = 0;
        a.aimX = S.px; // mira onde o jogador ESTÁ agora: quem já saiu do lugar escapa
        a.aimY = S.py;
      }
      break;
    }
    case 'pstrike': {
      a.t -= dt;
      a.stT += dt;
      a.hide = false;
      const arr = aStep(a, a.aimX, a.aimY, PA.dash, dt, true),
        d = Math.hypot(S.px - a.x, S.py - a.y);
      if (d < PA.hitR && !S.inside) {
        if (hurtPlayer({ dmg: PA.bite, from: a, label: '🐍 A sucuri te laçou!', kick: PA.kick, source: 'A sucuri' })) {
          playerFx.snareUntil = ecoNow() + PA.holdT;
          playerFx.snareSlow = PA.holdSlow;
          a.state = 'phold';
          a.t = PA.holdT;
          a.hgap = PA.holdEvery;
          toast('🐍 A sucuri te laçou e te trava! Toque em Usar várias vezes para se debater e se soltar');
        } else anaAfterPlayer(a, PA.cool);
      } else if (arr || a.t <= 0 || a.stuck > 0.1) {
        if (dP < 140) toast('🐍 O bote da sucuri errou');
        anaAfterPlayer(a, PA.cool);
      }
      break;
    }
    case 'pcrawl': {
      // persegue o jogador rastejando (lenta em terra, mais rápida na água); a cada um tempo, morde e o prende
      a.t = 999;
      a.hide = false;
      if (S.inside || sleeping) {
        anaDisengage(a, PA.cool * 0.5);
        break;
      }
      const seen = hasLOS(a.x, a.y, S.px, S.py);
      a.loseT = seen ? 0 : (a.loseT || 0) + dt;
      if (!claimPlayerHunt(a.id, 1.5) || dP > PA.chaseR || a.loseT > 1.5 || a.stuck > 1) {
        // o jogador escapou (distância, sumiu atrás de obstáculos) ou ela travou
        anaDisengage(a, PA.cool * 0.5);
        break;
      }
      turnTo(a, Math.atan2(S.py - a.y, S.px - a.x), dt * 3);
      if (dP > PA.hitR + 4) aStep(a, S.px, S.py, (a.sw ? PA.crawlWater : PA.crawlLand) * lz, dt);
      else a.mv = false;
      a.bgap = Math.max(0, (a.bgap || 0) - dt);
      if (dP <= PA.hitR + 4 && a.bgap <= 0) {
        a.bgap = PA.holdEvery;
        a.mv = false;
        if (
          hurtPlayer({ dmg: PA.bite, from: a, label: '🐍 A sucuri te prendeu!', kick: PA.kick, source: 'A sucuri' })
        ) {
          playerFx.snareUntil = ecoNow() + PA.holdT; // preso de verdade: ela enrola o corpo e trava o jogador
          playerFx.snareSlow = PA.holdSlow;
          a.state = 'phold';
          a.t = PA.holdT;
          a.hgap = PA.holdEvery;
          toast('🐍 A sucuri te enrolou! Toque em Usar várias vezes para se debater e se soltar');
        }
      }
      break;
    }
    case 'phold': {
      // constrição: o jogador fica travado; a cada aperto perde vida; cada toque em Usar (debater-se) afrouxa o aperto
      a.mv = false;
      a.hide = false;
      const sg = playerFx.struggle;
      playerFx.struggle = 0;
      a.t -= dt + sg;
      turnTo(a, Math.atan2(S.py - a.y, S.px - a.x), dt * 4);
      a.hgap = (a.hgap == null ? PA.holdEvery : a.hgap) - dt;
      if (a.hgap <= 0 && S.vida > 0) {
        a.hgap = PA.holdEvery;
        hurtPlayer({ dmg: PA.holdBite, from: a, label: '🐍 A sucuri aperta!', kick: 0, source: 'A sucuri' });
      }
      playerFx.snareUntil = ecoNow() + 0.4; // renovado a cada quadro enquanto ela prende
      playerFx.snareSlow = PA.holdSlow;
      if (S.vida <= 0 || S.inside || sleeping || dP > PA.reach * 1.6 || a.t <= 0) {
        playerFx.snareUntil = 0;
        playerFx.freeUntil = ecoNow() + PA.freeT; // solto: tem alguns segundos para fugir sem ser preso de novo
        if (S.vida > 0) toast('Você se soltou da sucuri!');
        anaDisengage(a, PA.cool);
      }
      break;
    }
    default:
      a.state = 'idle';
      a.t = 2;
  }
}

function anaGrab(a, p, near) {
  const P = ANA.prey[p.sp];
  a.state = 'constrict';
  a.t = 5 + 14 * P.k;
  a.mv = false;
  a.x = p.x;
  a.y = p.y - 1;
  p.state = 'fight';
  p.hunter = a;
  p.z = 0;
  a.hide = false;
  if (near)
    toast(
      '🐍 A sucuri deu o bote em ' +
        P.n +
        ': morde para prender (sem veneno) e enrola o corpo, apertando a cada expiração',
    );
}

/* ---- desenho: poses, giro para cima e para baixo, e o corpo que estica ao redor da presa engolida ---- */

let ANA_PROF = null;
/**
 * Lido do alfa da folha, para cada quadro que desliza (linhas 0 e 1, quadros 0 e 1): `n` colunas da cabeça até a cauda, `cy[i]` a altura do meio
 * do corpo na coluna i (contada a partir da cabeça) e `s[i]` o comprimento do corpo até ali, que serve para achar onde fica a barriga
 * (`a.bp` é uma fração do comprimento do corpo, da cabeça à cauda).
 */
function anaProf() {
  if (ANA_PROF) return ANA_PROF;
  const F = ANA.F,
    g = ANA_CV.getContext('2d'),
    out = [[], []];
  for (let row = 0; row < 2; row++)
    for (let fr = 0; fr < 2; fr++) {
      const d = g.getImageData(fr * F, row * F, F, F).data,
        sg = row === 0 ? 1 : -1,
        hc = row === 0 ? ANA.HEAD : F - 1 - ANA.HEAD,
        cy = [],
        s = [];
      let acc = 0;
      for (let i = 0; i < F; i++) {
        const x = hc + sg * i;
        if (x < 0 || x >= F) break;
        let top = -1,
          bot = -1;
        for (let y = 0; y < F; y++)
          if (d[(y * F + x) * 4 + 3]) {
            if (top < 0) top = y;
            bot = y;
          }
        if (top < 0) break;
        const c = (top + bot) / 2;
        if (i) acc += Math.hypot(1, c - cy[i - 1]);
        cy.push(c);
        s.push(acc);
      }
      out[row][fr] = { n: cy.length, cy, s, total: acc };
    }
  return (ANA_PROF = out);
}

/**
 * Desenha em `g` (um canvas F x F) o quadro `fr` da linha que desliza `row` (0 esquerda, 1 direita) com o corpo ESTICADO ao redor da presa: o
 * próprio desenho da cobra é cortado em colunas e as colunas perto da barriga (`bp`, fração do corpo a partir da cabeça) ficam mais altas e mais
 * largas, então o corpo engrossa e se alonga de verdade (as manchas esticam junto) e a cauda é empurrada para trás. `bk` (0 a 1) é o tamanho da presa.
 */
function anaStretch(g, row, fr, bk, bp) {
  const F = ANA.F,
    P = anaProf()[row][fr],
    sg = row === 0 ? 1 : -1,
    hc = row === 0 ? ANA.HEAD : F - 1 - ANA.HEAD,
    lim = row === 0 ? F - hc : hc + 1; // colunas disponíveis da cabeça até a borda do quadro
  let ci = 0;
  const alvo = bp * P.total;
  while (ci < P.n - 1 && P.s[ci] < alvo) ci++;
  const w = 5 + 9 * bk, // meia-largura da barriga (px do corpo)
    A = 1.05 * bk, // quanto engrossa (1 = dobra)
    B = 0.5 * A, // quanto alonga
    i0 = Math.max(1, Math.floor(ci - 2.4 * w)),
    i1 = Math.min(P.n, Math.ceil(ci + 2.4 * w));
  // bloco de colunas ia..ib-1 (distância da cabeça) copiado sem mudar, para a distância `pos` da cabeça
  const copia = (ia, ib, pos) => {
    const n = ib - ia;
    if (n <= 0) return;
    const sx = sg > 0 ? hc + ia : hc - ib + 1,
      dx = sg > 0 ? hc + pos : hc - pos - n + 1;
    g.drawImage(ANA_CV, fr * F + sx, row * F, n, F, dx, 0, n, F);
  };
  g.imageSmoothingEnabled = false;
  copia(0, i0, 0);
  let e = 0; // quanto o corpo já alongou até esta coluna
  for (let i = i0; i < i1; i++) {
    const k = Math.exp(-(((i - ci) / w) ** 2)),
      sy = 1 + A * k,
      d0 = Math.round(i + e),
      d1 = Math.round(i + 1 + e + B * k),
      wd = d1 - d0,
      dx = sg > 0 ? hc + d0 : hc - d1 + 1;
    e += B * k;
    g.drawImage(ANA_CV, fr * F + hc + sg * i, row * F, 1, F, dx, P.cy[i] * (1 - sy), wd, F * sy);
    if (k > 0.08) {
      // a pele esticada fica mais clara
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = 'rgba(226,208,140,' + (0.22 * k * Math.min(1, bk * 1.5)).toFixed(3) + ')';
      g.fillRect(dx, 0, wd, F);
      g.globalCompositeOperation = 'source-over';
    }
  }
  copia(i1, lim, Math.round(i1 + e));
}

const ANA_ST = new WeakMap(); // sucuri -> { cv, key }: o corpo esticado já pronto
/**
 * O corpo esticado de `a` na pose `o`, num canvas F x F que é só dela. Recortar a cobra em dezenas de colunas a cada quadro seria um desperdício
 * (principalmente no celular): o tamanho da barriga e a posição dela mudam devagar, então o desenho só é refeito quando um deles (em passos
 * pequenos demais para o olho notar) ou o quadro da folha muda.
 */
function anaStretched(a, o) {
  const key = o.row + '_' + o.fr + '_' + Math.round(a.bk * 60) + '_' + Math.round(a.bp * 160);
  let e = ANA_ST.get(a);
  if (!e) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = ANA.F;
    ANA_ST.set(a, (e = { cv, k: cv.getContext('2d'), key: '' }));
  }
  if (e.key !== key) {
    e.key = key;
    e.k.clearRect(0, 0, ANA.F, ANA.F);
    anaStretch(e.k, o.row, o.fr, a.bk, a.bp);
  }
  return e.cv;
}

/**
 * Ondulação ao andar: o corpo é desenhado em fatias de `w` px e cada fatia sobe ou desce seguindo uma onda que corre da cabeça para a cauda. A fase
 * avança com a DISTÂNCIA percorrida (e não com o relógio), então o corpo desenha na mesma trilha por onde a cabeça passou, como uma cobra de verdade,
 * e não "patina". A cabeça não se mexe (a amplitude cresce do zero na cabeça até `amp` depois de `rampa` px). Vale para as 4 direções (cima e baixo
 * giram o desenho todo, e a onda gira junto).
 */
const ANA_WAVE = { lam: 58, amp: 5, rampa: 26, w: 2 };

/** Atualiza (por sucuri) a fase da onda e a intensidade (0 parada, 1 andando, suavizada); devolve a intensidade. */
function anaWave(a, now, moving) {
  const dt = Math.min(0.1, Math.max(0, now - (a.wT ?? now))),
    d = Math.hypot(a.x - (a.wX ?? a.x), a.y - (a.wY ?? a.y));
  a.wT = now;
  a.wX = a.x;
  a.wY = a.y;
  a.wS = ((a.wS || 0) + (d * 6.2832) / ANA_WAVE.lam) % 6.2832;
  a.wK = (a.wK || 0) + ((moving ? 1 : 0) - (a.wK || 0)) * Math.min(1, dt * 6);
  return a.wK;
}

/**
 * Desenha em `g` o quadro (da linha `row`, de `src` a partir de (sx, sy), F x F) em fatias ondulando; o canto do quadro vai para (ox, oy).
 * `k` (0 a 1) é a intensidade e `s` a fase (anaWave). Com k = 0 sai igual ao quadro inteiro.
 */
function anaWaveStrips(g, src, sx, sy, ox, oy, row, fr, k, s) {
  const F = ANA.F,
    W = ANA_WAVE.w,
    hc = row === 0 ? ANA.HEAD : F - 1 - ANA.HEAD,
    n = anaProf()[row][fr].n + 20, // o desenho esticado pode ser até ~13 px mais longo
    lo = Math.max(0, row === 0 ? hc - 2 : hc - n),
    hi = Math.min(F, row === 0 ? hc + n : hc + 3);
  g.imageSmoothingEnabled = false;
  for (let x = lo - (lo % W); x < hi; x += W) {
    const c = x + W / 2,
      d = row === 0 ? c - hc : hc - c, // distância da cabeça, para o lado do corpo
      amp = d > 0 ? Math.min(1, (d - 3) / ANA_WAVE.rampa) : 0,
      dy = amp > 0 ? Math.round(ANA_WAVE.amp * k * amp * Math.sin(s - (6.2832 * d) / ANA_WAVE.lam)) : 0;
    g.drawImage(src, sx + x, sy, W, F, ox + x, oy + dy, W, F);
  }
}

/** Pinta a pose `o` (linha, quadro, esticada do bote `ls`, escala da enrolada `cs`) em `g`, com o canto do quadro em (ox, oy). */
function anaPaint(g, o, ox, oy) {
  const F = ANA.F,
    H = ANA.HEAD;
  g.imageSmoothingEnabled = false;
  if (o.ls !== 1) {
    // bote: o corpo estica a partir da cabeça até ficar inteiro
    const w = F - H,
      d = Math.max(1, Math.round(w * o.ls));
    if (o.row === 0) g.drawImage(ANA_CV, o.fr * F + H, o.row * F, w, F, ox + H, oy, d, F);
    else g.drawImage(ANA_CV, o.fr * F, o.row * F, w, F, ox + w - d, oy, d, F);
  } else if (o.cs !== 1) {
    const z = Math.round(F * o.cs),
      m = Math.round((F - z) / 2);
    g.drawImage(ANA_CV, o.fr * F, o.row * F, F, F, ox + m, oy + m, z, z);
  } else g.drawImage(ANA_CV, o.fr * F, o.row * F, F, F, ox, oy, F, F);
}

const ANA_PASSO = Math.PI / 8; // o corpo gira em passos de 22,5 graus (16 direções, com as diagonais): pixel art girada num ângulo qualquer tremeria

/**
 * Para onde a sucuri aponta, em radianos (0 direita, PI/2 baixo), em passos de ANA_PASSO. Só muda de passo quando `a.dir` passa bem do meio entre dois
 * passos (histerese de 25%), para não ficar piscando entre dois quando ela segue quase na linha entre eles.
 */
function anaAngle(a) {
  const d = a.dir || 0,
    atual = a.wA;
  if (atual !== undefined && Math.abs(Math.atan2(Math.sin(d - atual), Math.cos(d - atual))) <= ANA_PASSO * 0.75)
    return atual;
  const q = Math.round(d / ANA_PASSO) * ANA_PASSO;
  return (a.wA = Math.atan2(Math.sin(q), Math.cos(q)));
}

/**
 * A pose da sucuri neste quadro (qual quadro da folha, para onde gira, quanto estica). `dir`: 0 baixo, 1 cima, 2 esquerda, 3 direita (decide a
 * enrolada). `ang` (opcional, de anaAngle): o ângulo de verdade, para a pose que desliza apontar também nas diagonais; sem ele vale só `dir`.
 */
function anaPose(a, st, dir, now, ang) {
  const o = { row: 0, fr: 0, rot: 0, flip: false, ls: 1, cs: 1, hide: false, swim: false, stretch: false, shake: 0 };
  const desliza = (fr) => {
    if (ang === undefined) {
      o.row = dir === 2 || dir === 1 ? ANA.ROW.L : ANA.ROW.R; // cima e baixo: o mesmo quadro, girado 90 graus (a cabeça fica na âncora)
      o.rot = dir < 2 ? Math.PI / 2 : 0;
    } else if (Math.cos(ang) >= -1e-9) {
      o.row = ANA.ROW.R; // aponta para a direita (ou reto para cima/baixo): o quadro da direita, girado até o ângulo
      o.rot = ang;
    } else {
      o.row = ANA.ROW.L; // aponta para a esquerda: o quadro da esquerda, girado a partir do eixo horizontal
      o.rot = ang - Math.PI * Math.sign(ang);
    }
    o.fr = fr;
  };
  const enrola = (row, fr) => {
    o.row = row;
    o.fr = fr;
    o.flip = dir === 3;
  };
  if (st === 'dead') enrola(ANA.ROW.rest, 0);
  else if (st === 'strike' || st === 'pstrike') {
    const k = Math.min(3, Math.floor((a.stT || 0) / 0.09));
    if (k === 0) enrola(ANA.ROW.ready, 1);
    else {
      desliza(0);
      o.ls = [0, 0.55, 0.9, 1][k];
    }
  } else if (st === 'coil') {
    enrola(ANA.ROW.ready, Math.floor(now * 5 + a.t0) % 4); // corpo contraído, pronto para o bote
    o.shake = Math.round(Math.sin(now * 70) * 0.8);
  } else if (st === 'constrict' || st === 'phold') enrola(ANA.ROW.rest, Math.floor(now * 3 + a.t0) % 4);
  else if (a.hide) {
    desliza(Math.floor(now * 2 + a.t0) % 2);
    o.hide = true;
  } else if (a.sw) {
    desliza(0); // andando, quem anima é a ondulação do corpo (anaWave); parada, o quadro 0
    o.swim = true;
  } else if (a.mv) desliza(0);
  else if (a.dg > 0.04 || st === 'swallow') desliza(Math.floor(now * 0.9 + a.t0) % 2);
  else enrola(ANA.ROW.rest, Math.floor(now * 2.2 + a.t0) % 4);
  if (st !== 'dead' && a.bk > 0.02 && !o.hide) {
    if (o.row <= 1 && o.ls === 1)
      o.stretch = true; // deslizando: o corpo estica ao redor da presa
    else if (o.row >= 2) o.cs = 1 + 0.35 * a.bk; // enrolada digerindo: a cobra inteira fica maior
  }
  return o;
}

function drawAna(a) {
  if (!ANA_CV) return;
  const F = ANA.F,
    now = performance.now() / 1000,
    st = a.state,
    o = anaPose(a, st, faRow(a), now, anaAngle(a)),
    hx = o.row === 0 ? ANA.HEAD : o.row === 1 ? F - 1 - ANA.HEAD : F / 2, // âncora no quadro: a ponta da cabeça (deslizando) ou o centro (enrolada)
    hy = F / 2,
    camo = st !== 'dead' ? a.camo || 0 : 0, // escondida na água também se mistura à cor da água
    wk = o.row <= 1 && o.ls === 1 && !o.hide ? anaWave(a, now, !!a.mv) : 0, // intensidade da ondulação do corpo
    // no Canvas 2D, fatias de 2 px inclinadas deixam emendas finas entre si: aí o corpo ondulado é montado reto num canvas auxiliar e girado de uma vez (o PixiJS não tem emendas)
    emenda = wk > 0.04 && Math.abs(Math.sin(2 * o.rot)) > 1e-6 && !ctx.isPixiCtx;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (st === 'dead' && a.t < 2) ctx.globalAlpha = Math.max(0, a.t / 2);
  if (o.hide) {
    ctx.beginPath();
    ctx.arc(a.x, a.y, 9, 0, 6.283);
    ctx.clip();
  }
  ctx.translate(Math.round(a.x), Math.round(a.y) + o.shake);
  if (o.rot) ctx.rotate(o.rot);
  if (o.flip) ctx.scale(-1, 1);
  if (!o.stretch && !o.swim && camo <= 0.12 && !emenda) {
    if (wk > 0.04) anaWaveStrips(ctx, ANA_CV, o.fr * F, o.row * F, -hx, -hy, o.row, o.fr, wk, a.wS);
    else anaPaint(ctx, o, -hx, -hy);
  } else {
    // o corpo esticado, a cor da água (nadando) e a camuflagem são feitos num canvas auxiliar e colocados de uma vez
    const T = dynGet(F, F),
      g = T.k;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.clearRect(0, 0, F, F);
    if (o.stretch) {
      if (wk > 0.04) anaWaveStrips(g, anaStretched(a, o), 0, 0, 0, 0, o.row, o.fr, wk, a.wS);
      else g.drawImage(anaStretched(a, o), 0, 0);
    } else if (wk > 0.04) anaWaveStrips(g, ANA_CV, o.fr * F, o.row * F, 0, 0, o.row, o.fr, wk, a.wS);
    else anaPaint(g, o, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    if (o.swim) {
      g.fillStyle = 'rgba(50,100,125,0.4)';
      g.fillRect(0, 0, F, F);
    }
    if (camo > 0.12) {
      const c = CAMO_RGB[a.kind] || CAMO_RGB.other;
      g.fillStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (0.7 * camo).toFixed(3) + ')';
      g.fillRect(0, 0, F, F);
    }
    g.globalCompositeOperation = 'source-over';
    const al = ctx.globalAlpha;
    ctx.globalAlpha = al * (1 - 0.4 * camo) * (o.swim ? 0.9 : 1);
    ctx.drawImage(T.cv, 0, 0, F, F, -hx, -hy, F, F);
    ctx.globalAlpha = al;
  }
  ctx.restore();
  if (a.sw && (a.mv || o.hide)) {
    ctx.save();
    ctx.strokeStyle = 'rgba(225,242,255,.6)';
    ctx.lineWidth = 0.8;
    for (let k = 0; k < 2; k++) {
      const p = (now * 0.8 + k * 0.5 + a.t0) % 1;
      ctx.globalAlpha = (1 - p) * (o.hide ? 0.45 : 0.8);
      ctx.beginPath();
      ctx.ellipse(a.x, a.y + 1, 5 + p * 9, 2 + p * 3.2, 0, 0, 6.283);
      ctx.stroke();
    }
    ctx.restore();
  }
  if (st === 'dead' && a.t > 2) carcassFx(a.x, a.y, a.t);
}

/**
 * Demonstração para ver a sucuri engolindo (abra o jogo com `?sucuri`, ou `anaDemo()` no console com `?debug`): uma sucuri bem na frente do
 * jogador engole uma presa depois da outra, da menor para a maior (galinha, lebre, cervo, bezerro, queixada), digere um instante e recomeça.
 * É o mesmo estado `swallow` do jogo de verdade, só que sem esperar uma caça acontecer.
 */
const DEMO_PRESAS = ['chicken', 'hare', 'deer', 'calf', 'boar'];
let demo = null;
function anaDemo() {
  if (demo) return demo.a;
  let x = S.px + 64,
    y = S.py + 4;
  for (const [dx, dy] of [
    [64, 4],
    [-64, 4],
    [0, 56],
    [0, -56],
    [96, 4],
    [-96, 4],
  ]) {
    x = S.px + dx;
    y = S.py + dy;
    if (!aWet(x, y) && aFree(x, y)) break;
  }
  const a = faSpawn('anaconda', x, y, false);
  anaInitA(a);
  demo = { a, i: 0, parada: 0 };
  const proxima = () => {
    const sp = DEMO_PRESAS[demo.i++ % DEMO_PRESAS.length],
      k = ANA.prey[sp].k;
    a.state = 'swallow';
    a.swT = 7 + 36 * k;
    a.t = a.swT;
    a.dgK = k;
    a.dg = 0;
    a.bk = 0;
    a.bp = 0.06;
    a.hide = false;
    a.dir = Math.PI; // de frente para o jogador, se ele estiver à esquerda
    toast('🐍 Demonstração: a sucuri está engolindo ' + ANA.prey[sp].n);
  };
  proxima();
  const tick = setInterval(() => {
    if (!fauna.includes(a)) {
      clearInterval(tick);
      demo = null;
    } else if (a.state === 'swallow') {
      demo.parada = 0;
      a.expose = 999; // sem camuflagem: dá para ver a sucuri inteira, em cores cheias
    } else if ((demo.parada += 0.5) > 8) {
      demo.parada = 0;
      proxima();
    }
  }, 500);
  return a;
}

export function loadAnacondaSprite() {
  ANA_IMG.onload = () => {
    ANA_CV = bakeImg(ANA_IMG);
  };
  ANA_IMG.src = assetUrl('sprites/animals/anaconda.webp');
}

export function registerAnacondaStates() {
  Object.assign(FA_ST, {
    ambush: '🫧',
    stalk: '🎯',
    strike: '💥',
    constrict: '🐍',
    swallow: '🍖',
    bask: '☀️',
    pstrike: '💥',
    phold: '🐍',
  });
}

export {
  ANA_WAVE,
  anaAngle,
  anaDemo,
  anaInit,
  anaInitA,
  anaPose,
  anaSpawnAt,
  anaStretch,
  anaUpd,
  anaWave,
  anaWaveStrips,
  drawAna,
};
