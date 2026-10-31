/**
 * Harpia (Harpia harpyja): ave de rapina de topo, diurna, solitária fora do casal e territorial em volta da árvore-ninho. Pousa a maior parte do
 * tempo na copa de uma sumaúma (as GIGANTES são preferidas), observa e só de vez em quando caça: rastreia a presa, se posiciona e dá o razante.
 * Biologia, regras e a tabela de presas e predadores: docs/HARPIA.md. Todos os números: config/harpia.js.
 *
 * Estados (a.state): hrest (repousa) · hwatch (observa) · htrack (rastreia uma presa) · hprep (se posiciona) · hstoop (razante) · hfeed (come) ·
 * hroam (voa entre poleiros) · hwarn (avisa quem chegou perto do ninho) · hdefend (defende o ninho) · havoid (evita perigo) · hchase (expulsa outra harpia).
 * A ave tem posição no chão (a.x, a.y: a base da árvore, quando pousada) e altura (a.z, px): pousada na copa, z é a altura da copa.
 */

import { HARPIA_FOLHAS } from '../../config/harpiaSprites.js';
import { HARPIA as H } from '../../config/harpia.js';
import { ATTN, sightRange, targetVisibility } from '../../config/ecosystem.js';
import { MH, MW, TREE, TS } from '../../config/constants.js';
import { S, sleeping } from '../../core/GameState.js';
import { animalTarget, coverAt, ecoNight, ecoNow, percTick, playerFx } from '../ai/Perception.js';
import { turnTo } from '../ai/Steering.js';
import { carcT } from '../Carcass.js';
import { farmPrey } from '../farm/FarmPrey.js';
import { harpyCall } from '../../systems/audio/HarpySounds.js';
import { hurtPlayer } from '../PlayerHurt.js';
import { boarMates, FA_SP, FA_ST, faRow, faSpawn, fauna } from './Fauna.js';
import { ctx } from '../../rendering/Canvas.js';
import { bakeImg } from '../../rendering/SpriteUtils.js';
import { toast } from '../../ui/Toast.js';
import { assetUrl } from '../../utils/assets.js';
import { rr } from '../../utils/Random.js';
import { ecoTrees } from '../../world/ecology/TreeEcology.js';
import { obj } from '../../world/World.js';

/* ============ árvores e poleiros ============ */
const baseOf = (t) => ({ x: t.x * TS + 8, y: (t.y + 1) * TS });
const arvoreViva = (t) => !!t && t.estagio !== 'morta' && obj[t.i] === TREE;

/** Altura (px) da copa da árvore: onde ela pousa. */
function copaZ(t) {
  const m = t.model();
  return Math.round((m ? m.h : 100) * H.poleiroZ);
}

/** Árvores amazônicas adultas (candidatas a ninho ou a poleiro). */
function arvoresAltas(minSt) {
  const out = [];
  for (const t of ecoTrees.values()) if (t.amz && t.st >= minSt && arvoreViva(t)) out.push(t);
  return out;
}

/**
 * Escolhe a árvore-ninho: sumaúma adulta (uma GIGANTE vale `pesoGigante` vezes mais); se não houver sumaúma, castanheira. Sorteio ponderado.
 * `excluir` (índice de árvore, ou lista de índices) evita repetir a mesma ao reescolher.
 */
export function escolherArvoreNinho(excluir = -1) {
  const fora = Array.isArray(excluir) ? excluir : [excluir];
  for (const esp of ['sumauma', 'castanheira']) {
    const l = arvoresAltas(H.arvoreMinFase).filter((t) => t.especie === esp && !fora.includes(t.i));
    if (!l.length) continue;
    const w = l.map((t) => (t.gig ? H.pesoGigante : 1));
    let r = Math.random() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < l.length; i++) if ((r -= w[i]) <= 0) return l[i];
    return l[l.length - 1];
  }
  return null;
}

/** A árvore-ninho desta harpia (null se foi cortada ou morreu). */
const casa = (a) => {
  const t = a.home != null ? ecoTrees.get(a.home) : null;
  return arvoreViva(t) ? t : null;
};

/** Ponto do poleiro na copa da árvore `t` (o par fica um de cada lado, `off` px). */
function poleiro(t, off) {
  const b = baseOf(t);
  return { x: b.x + off, y: b.y, z: copaZ(t) };
}

/** Para onde ir: a árvore-ninho (mais provável) ou outro poleiro alto perto dela. */
function escolherPoleiro(a) {
  const t = casa(a);
  if (t && Math.random() < H.preferePoleiroNinho) return poleiro(t, a.off || 0);
  const c = t ? baseOf(t) : { x: a.x, y: a.y };
  const l = arvoresAltas(5).filter((u) => Math.hypot(baseOf(u).x - c.x, baseOf(u).y - c.y) < H.poleiroRaio && u !== t);
  if (l.length) return poleiro(l[(Math.random() * l.length) | 0], rr(-8, 8));
  return t ? poleiro(t, a.off || 0) : null;
}

/* ============ nascimento ============ */
export function harpyInitA(a, t, k) {
  const p = poleiro(t, k ? 11 : -11);
  a.sex = k ? 'm' : 'f';
  a.sz = k ? 0.94 : 1.06;
  a.home = t.i;
  a.off = k ? 11 : -11;
  a.x = p.x;
  a.y = p.y;
  a.z = p.z;
  a.face = k ? -1 : 1;
  a.state = 'hrest';
  a.t = rr(...H.repouso);
  a.cd = rr(20, 60);
  a.hun = rr(0.2, 0.5);
  a.age = 999;
  a.tgt = null;
  return a;
}

/** Cria o casal na árvore-ninho. Devolve as duas aves ([]: não há árvore adulta). */
export function harpyInit() {
  if (fauna.some((f) => f.sp === 'harpy' && f.state !== 'dead' && !f.gone)) return [];
  const t = escolherArvoreNinho();
  if (!t) return [];
  const par = [];
  for (let k = 0; k < H.casal; k++) par.push(harpyInitA(faSpawn('harpy', 0, 0, false), t, k));
  if (par.length > 1) {
    par[0].mate = par[1].id;
    par[1].mate = par[0].id;
  }
  return par;
}

/* ============ voo ============ */
/** Voa em direção a (tx, ty, tz) com velocidade `v` (px/s). Devolve a distância no plano. */
function voar(a, tx, ty, tz, v, dt, subir = H.voo.subir) {
  const dx = tx - a.x,
    dy = ty - a.y,
    d = Math.hypot(dx, dy);
  if (d > 1) {
    const st = Math.min(d, v * dt);
    a.x = Math.max(TS * 2, Math.min(MW * TS - TS * 2, a.x + (dx / d) * st));
    a.y = Math.max(TS * 2, Math.min(MH * TS - TS * 2, a.y + (dy / d) * st));
    a.dir = Math.atan2(dy, dx);
    if (Math.abs(dx) > 0.4) a.face = dx > 0 ? 1 : -1;
    a.mv = true;
  }
  const dz = tz - a.z;
  a.z += Math.max(-subir * 3, Math.min(subir, dz)) * Math.min(1, dt * 3) * (dz > 0 ? 1 : 2);
  return d;
}

/* ============ presas ============ */
/** A harpia vê `p` agora? De cima da copa não há árvore na frente; o mato alto e a camuflagem escondem, parado a presa aparece menos. */
function veAlvo(a, p) {
  const T = animalTarget(p),
    alc = sightRange('harpy', ecoNight(), ATTN[a.state] != null ? ATTN[a.state] : 1) * (a.z > 25 ? 1 : 0.7);
  return Math.hypot(p.x - a.x, p.y - a.y) <= alc * targetVisibility(T);
}

/** `p` pode ser caça da harpia? (as presas que existem no jogo; filhote só sem adulto por perto) */
function ehPresa(p) {
  const F = H.presas[p.sp];
  if (!F || p.state === 'dead' || p.gone || p.state === 'fly' || p.state === 'land' || p.state === 'fight' || p.hunter)
    return false;
  if (F.cria) {
    if (p.age == null || p.age >= H.criaIdade) return false; // adulto grande demais
    for (const f of fauna)
      if (
        f !== p &&
        f.sp === p.sp &&
        f.state !== 'dead' &&
        f.age >= H.criaIdade &&
        Math.hypot(f.x - p.x, f.y - p.y) < F.guarda
      )
        return false;
    if (p.sp === 'boar' && boarMates(p, F.guarda) >= 2) return false; // o bando enfrenta a ave
  }
  return true;
}

/** A melhor presa que ela vê: a mais valiosa e mais perto. null se não vê nenhuma. */
function procurarPresa(a) {
  let best = null,
    bs = 0;
  const alcance = 330;
  for (const p of fauna.concat(farmPrey())) {
    if (!H.presas[p.sp] || Math.abs(p.x - a.x) > alcance || Math.abs(p.y - a.y) > alcance) continue;
    if (!ehPresa(p) || !veAlvo(a, p)) continue;
    const F = H.presas[p.sp],
      s = F.value * F.w * (1 - Math.hypot(p.x - a.x, p.y - a.y) / (alcance * 1.4)) * (0.7 + 0.6 * Math.random());
    if (s > bs) {
      bs = s;
      best = p;
    }
  }
  return best;
}

function quebrarPresa(a, p) {
  // a presa foi agarrada: morre de verdade (animal de fazenda: pelo espelho; selvagem: vira carcaça)
  const F = H.presas[p.sp];
  if (p.farm) {
    p.state = 'dead';
    if (!(p.meat > 0)) p.meat = 0.4;
  } else {
    p.state = 'dead';
    p.t = carcT(p.x, p.y);
    p.d0 = performance.now() / 1000;
    p.z = 0;
    p.row = faRow(p);
    p.hunter = null;
  }
  a.state = 'hfeed';
  a.t = rr(...H.caca.comer);
  a.tgt = p;
  a.carcass = { x: p.x, y: p.y };
  a.hun = Math.max(0, a.hun - F.value);
  a.x = p.x - a.face * 16;
  a.y = p.y + 2;
  a.z = 0;
  if (Math.hypot(S.px - p.x, S.py - p.y) < 300) toast('🦅 A harpia caçou ' + F.n);
}

/* ============ pensamento (a cada ~0,25 s) ============ */
function pensar(a, T) {
  const st = a.state;
  const livre = st === 'hrest' || st === 'hwatch' || st === 'htrack' || st === 'hprep' || st === 'hroam';
  // 1) o jogador perto do ninho: aviso, e só depois defesa (nunca ataca longe do ninho)
  if (T && !S.inside && !playerFx.ko && livre && a.cdD <= 0) {
    const b = baseOf(T),
      dj = Math.hypot(S.px - b.x, S.py - b.y);
    if (dj < H.defesa.avisoR && Math.hypot(a.x - b.x, a.y - b.y) < H.defesa.raioAtivo) {
      a.state = 'hwarn';
      a.t = H.defesa.aviso;
      a.alertT = 0;
      a.tgt = null;
      if (!a.avisou) {
        a.avisou = true;
        toast('🦅 A harpia levanta a crista e grita: você está perto do ninho!');
      }
      return;
    }
  }
  // 2) onça-pintada perto da harpia no chão: ela sobe
  if (a.z < 25 && st !== 'havoid') {
    for (const f of fauna)
      if (f.sp === 'jaguar' && f.state !== 'dead' && Math.hypot(f.x - a.x, f.y - a.y) < H.onca.fugaR) {
        a.state = 'havoid';
        a.t = rr(20, 35);
        a.from = { x: f.x, y: f.y };
        return;
      }
  }
  // 3) outra harpia (que não é o par) na área da árvore-ninho: expulsa. Só expulsa quem está em casa (perto do próprio ninho) e só é intrusa quem está
  // longe do próprio ninho: assim duas árvores-ninho vizinhas não fazem as duas aves se perseguirem
  if (T && livre && st !== 'hchase' && Math.hypot(a.x - baseOf(T).x, a.y - baseOf(T).y) < H.defesa.raioAtivo) {
    const b = baseOf(T);
    for (const f of fauna) {
      const Tf = f.sp === 'harpy' ? casa(f) : null,
        longeDeCasa = !Tf || Math.hypot(f.x - baseOf(Tf).x, f.y - baseOf(Tf).y) > H.disputa.longeDeCasa;
      if (
        f.sp === 'harpy' &&
        f !== a &&
        f.id !== a.mate &&
        f.state !== 'dead' &&
        f.state !== 'havoid' &&
        f.home !== a.home &&
        longeDeCasa &&
        Math.hypot(f.x - b.x, f.y - b.y) < H.disputa.raio
      ) {
        a.state = 'hchase';
        a.tgt = f;
        a.t = 12;
        harpyCall('alerta', a);
        if (Math.hypot(S.px - a.x, S.py - a.y) < 400) toast('🦅 Uma harpia expulsa outra da sua árvore!');
        return;
      }
    }
  }
  // 4) procurar presa (só observando, de dia, passado o intervalo)
  if (st === 'hwatch' && a.cd <= 0 && ecoNight() < 0.6) {
    const p = procurarPresa(a);
    if (p) {
      a.tgt = p;
      a.state = 'htrack';
      a.t = rr(...H.caca.rastreio);
    }
  }
}

/* ============ atualização ============ */
function pousarSeNaoTemCasa(a) {
  // a árvore-ninho sumiu: escolhe outra (ou fica sem casa, só voando entre poleiros)
  // nunca a árvore-ninho de outra harpia que não é o par: cada casal tem a sua
  const outras = fauna
    .filter((f) => f.sp === 'harpy' && f !== a && f.id !== a.mate && f.home != null)
    .map((f) => f.home);
  const t = escolherArvoreNinho([a.home, ...outras]);
  a.home = t ? t.i : null;
}

export function harpyUpd(a, I, h, dt) {
  if (sleeping) return;
  a.mv = false;
  a.hun = Math.max(0, a.hun - dt * (0.006 - H.caca.fomeSobe)); // faUpd sobe a fome 0,006/s para todos; a harpia gasta bem menos (come pouco, de tempos em tempos)
  a.cdD = Math.max(0, (a.cdD || 0) - dt);
  let T = casa(a);
  if (!T && (a.home != null || !a._semCasa)) {
    pousarSeNaoTemCasa(a);
    a._semCasa = a.home == null;
    T = casa(a);
  }
  if (percTick(a, dt, 'h')) pensar(a, T);
  const noite = ecoNight();
  // os chamados: de dia, de vez em quando, pousada ou voando; o par responde um pouco depois
  if ((a.callT = (a.callT == null ? rr(8, 40) : a.callT) - dt) <= 0) {
    a.callT = rr(...H.som.intervaloChamado);
    if (noite < 0.5 && (a.state === 'hrest' || a.state === 'hwatch' || a.state === 'hroam')) {
      harpyCall('chamado', a);
      const par = a.mate != null ? fauna.find((f) => f.id === a.mate && f.state !== 'dead') : null;
      if (par) par.respT = rr(...H.som.resposta);
    }
  }
  if (a.respT != null && (a.respT -= dt) <= 0) {
    a.respT = null;
    if (noite < 0.5) harpyCall('contato', a);
  }
  switch (a.state) {
    case 'hrest': {
      if (T) {
        const p = poleiro(T, a.off || 0);
        voar(a, p.x, p.y, p.z, 40, dt); // se ainda não está no poleiro, vai
      }
      a.t -= dt;
      if (noite > 0.6)
        a.t = Math.max(a.t, 4); // à noite dorme
      else if (a.t <= 0) {
        a.state = 'hwatch';
        a.t = rr(...H.observa);
      }
      break;
    }
    case 'hwatch': {
      a.t -= dt;
      if (a.t <= 0) {
        if (noite > 0.6 || Math.random() > 0.35 + 0.5 * a.hun) {
          a.state = 'hrest';
          a.t = rr(...H.repouso);
        } else {
          a.poleiro = escolherPoleiro(a);
          a.state = 'hroam';
          a.t = rr(...H.passeio);
        }
      }
      break;
    }
    case 'htrack': {
      const p = a.tgt;
      if (!p || p.gone || !ehPresa(p) || !veAlvo(a, p)) {
        a.tgt = null;
        a.state = 'hwatch';
        a.t = rr(...H.observa);
        a.cd = Math.max(a.cd, rr(6, 12));
        break;
      }
      a.face = p.x >= a.x ? 1 : -1;
      a.t -= dt;
      if (a.t <= 0) {
        if (Math.random() < H.caca.chanceBase + H.caca.chanceFome * a.hun) {
          a.state = 'hprep';
          a.t = rr(...H.caca.preparo);
        } else {
          a.tgt = null;
          a.state = 'hwatch';
          a.t = rr(...H.observa);
          a.cd = Math.max(a.cd, rr(15, 30));
        }
      }
      break;
    }
    case 'hprep': {
      const p = a.tgt;
      if (!p || p.gone || !ehPresa(p)) {
        a.tgt = null;
        a.state = 'hwatch';
        a.t = rr(...H.observa);
        break;
      }
      a.face = p.x >= a.x ? 1 : -1;
      a.t -= dt;
      if (a.t <= 0) {
        a.state = 'hstoop';
        a.stoopT = 0;
        a.fr = -1;
        a.cd = H.caca.intervalo;
        harpyCall('razante', a);
      }
      break;
    }
    case 'hstoop': {
      const p = a.tgt;
      if (!p || p.gone || p.state === 'dead') {
        a.tgt = null;
        a.state = 'hroam';
        a.poleiro = escolherPoleiro(a);
        a.t = rr(...H.passeio);
        break;
      }
      a.stoopT += dt;
      const d0 = Math.hypot(p.x - a.x, p.y - a.y),
        v = Math.min(H.voo.razante, 110 + a.stoopT * 120), // acelera durante o mergulho
        zt = 6 + d0 * 0.3;
      const d = voar(a, p.x, p.y, zt, v, dt, 160);
      a.fr = d > 55 ? -1 : Math.min(5, Math.floor((1 - d / 55) * 6)); // quadro do razante conforme chega perto
      if (d <= H.caca.alcance && a.z < 22) {
        const F = H.presas[p.sp],
          cover = p.sp === 'hare' || p.sp === 'grouse' ? coverAt(p.x, p.y) : 0,
          pr = H.caca.capturaBase * (1 - 0.45 * cover) * (p.state === 'flee' ? 0.85 : 1);
        if (Math.random() < pr) quebrarPresa(a, p);
        else {
          if (F && !p.farm) {
            p.state = 'flee';
            p.t = 3;
            p.zz = 0;
          }
          a.tgt = null;
          a.state = 'hroam';
          a.poleiro = escolherPoleiro(a);
          a.t = rr(...H.passeio);
          a.cd = rr(...H.caca.esperaFalha);
          if (Math.hypot(S.px - a.x, S.py - a.y) < 300) toast('🦅 A harpia errou o bote');
        }
      } else if (a.stoopT > 6) {
        a.tgt = null;
        a.state = 'hroam';
        a.poleiro = escolherPoleiro(a);
        a.t = rr(...H.passeio);
        a.cd = rr(...H.caca.esperaFalha);
      }
      break;
    }
    case 'hfeed': {
      const c = a.carcass;
      if (c && Math.hypot(c.x - a.x, c.y - a.y) > 7) {
        const dx = c.x - a.x,
          dy = c.y - a.y,
          d = Math.hypot(dx, dy),
          st = Math.min(d, 26 * dt);
        a.x += (dx / d) * st;
        a.y += (dy / d) * st;
        a.face = dx >= 0 ? 1 : -1;
        a.mv = true;
      }
      a.z = Math.max(0, a.z - 80 * dt);
      a.t -= dt;
      if (a.t <= 0) {
        a.tgt = null;
        a.carcass = null;
        a.poleiro = escolherPoleiro(a);
        a.state = 'hroam';
        a.t = rr(...H.passeio);
      }
      break;
    }
    case 'hroam': {
      const p = a.poleiro || (T ? poleiro(T, a.off || 0) : null);
      if (!p) {
        a.state = 'hrest';
        a.t = rr(...H.repouso);
        break;
      }
      // voo planado com uma ondulação suave de lado
      const d = voar(a, p.x, p.y, p.z, H.voo.cruzeiro, dt);
      a.y += Math.sin(ecoNow() * 1.3 + a.t0) * 4 * dt;
      if (d < 4 && Math.abs(p.z - a.z) < 8) {
        a.poleiro = null;
        a.state = 'hrest';
        a.t = rr(...H.repouso);
      }
      break;
    }
    case 'hwarn': {
      // levanta a crista e grita; o jogador se afastando acalma, ficando perto demais ela investe
      const b = T ? baseOf(T) : { x: a.x, y: a.y },
        dj = Math.hypot(S.px - b.x, S.py - b.y);
      a.face = S.px >= a.x ? 1 : -1;
      a.t -= dt;
      if ((a.alertT -= dt) <= 0) {
        a.alertT = 1.7; // grita de novo enquanto o jogador continua perto
        harpyCall('alerta', a);
      }
      if (S.inside || dj > H.defesa.avisoR + 25) {
        a.state = 'hwatch';
        a.t = rr(...H.observa);
        a.avisou = false;
      } else if (a.t <= 0) {
        if (dj < H.defesa.ataqueR) {
          a.state = 'hdefend';
          a.stoopT = 0;
          a.fr = -1;
          harpyCall('razante', a);
          if (Math.hypot(S.px - a.x, S.py - a.y) < 400) toast('🦅 A harpia investe para defender o ninho!');
        } else {
          a.t = 2; // ainda perto, mas fora da zona de ataque: continua avisando
        }
      }
      break;
    }
    case 'hdefend': {
      a.stoopT += dt;
      const v = Math.min(H.voo.razante, 110 + a.stoopT * 140),
        d = voar(a, S.px, S.py, 10, v, dt, 160);
      a.fr = d > 55 ? -1 : Math.min(5, Math.floor((1 - d / 55) * 6));
      if (d < 14 && !S.inside) {
        hurtPlayer({
          dmg: H.defesa.dano,
          from: { x: a.x, y: a.y },
          label: '🦅 A harpia te acertou com as garras!',
          kick: H.defesa.empurrao,
          source: 'uma harpia',
        });
        a.cdD = H.defesa.intervalo;
        a.avisou = false;
        a.poleiro = T ? poleiro(T, a.off || 0) : escolherPoleiro(a);
        a.state = 'hroam';
        a.t = rr(...H.passeio);
      } else if (a.stoopT > 4 || S.inside) {
        a.cdD = H.defesa.intervalo * 0.5;
        a.poleiro = T ? poleiro(T, a.off || 0) : escolherPoleiro(a);
        a.state = 'hroam';
        a.t = rr(...H.passeio);
      }
      break;
    }
    case 'havoid': {
      const f = a.from || { x: a.x + 1, y: a.y };
      a.t -= dt;
      const ang = Math.atan2(a.y - f.y, a.x - f.x);
      voar(a, a.x + Math.cos(ang) * 120, a.y + Math.sin(ang) * 120, 90, H.voo.fuga, dt);
      if (a.t <= 0) {
        a.poleiro = escolherPoleiro(a);
        a.state = 'hroam';
        a.t = rr(...H.passeio);
      }
      break;
    }
    case 'hchase': {
      const f = a.tgt;
      if (!f || f.gone || f.state === 'dead' || a.t <= 0) {
        a.tgt = null;
        a.poleiro = T ? poleiro(T, a.off || 0) : escolherPoleiro(a);
        a.state = 'hroam';
        a.t = rr(...H.passeio);
        break;
      }
      a.t -= dt;
      const d = voar(a, f.x, f.y, Math.max(40, f.z), H.voo.disputa, dt);
      if (d < 26) {
        // a intrusa vai embora (sem briga: só exibição e expulsão)
        f.state = 'havoid';
        f.t = H.disputa.duracao;
        f.from = { x: a.x, y: a.y };
        a.tgt = null;
        a.poleiro = T ? poleiro(T, a.off || 0) : escolherPoleiro(a);
        a.state = 'hroam';
        a.t = rr(...H.passeio);
      }
      break;
    }
    default:
      a.state = 'hrest';
      a.t = rr(...H.repouso);
  }
}

/* ============ desenho ============ */
const SPR = {};

export function loadHarpySprites() {
  for (const nome of Object.keys(HARPIA_FOLHAS)) {
    const im = new Image();
    im.onload = () => (SPR[nome] = bakeImg(im));
    im.src = assetUrl(`sprites/animals/harpy/${nome}.webp`);
  }
}

export function registerHarpyStates() {
  Object.assign(FA_ST, {
    hrest: '💤',
    hwatch: '👁️',
    htrack: '🎯',
    hprep: '🎯',
    hstoop: '💥',
    hfeed: '🍖',
    hroam: '🦅',
    hwarn: '💢',
    hdefend: '💥',
    havoid: '💨',
    hchase: '💢',
  });
}

/** Qual folha e qual quadro desenhar agora. */
function quadro(a, now) {
  const st = a.state,
    t = now + a.t0;
  if (st === 'hstoop' || st === 'hdefend')
    return a.fr < 0 ? ['voo', 5 + (Math.floor(t * 8) % 2)] : ['razante', 6 + Math.min(5, a.fr)];
  if (st === 'hroam' || st === 'havoid' || st === 'hchase') return ['voo', Math.floor(t * 11) % HARPIA_FOLHAS.voo.n];
  if (st === 'hfeed' && a.mv) return ['andar', Math.floor(t * 9) % HARPIA_FOLHAS.andar.n];
  const fps = st === 'hrest' ? 3.5 : st === 'hfeed' ? 4.5 : 6;
  return ['parada', Math.floor(t * fps) % HARPIA_FOLHAS.parada.n];
}

export function drawHarpy(a) {
  const now = performance.now() / 1000,
    [nome, fr] = quadro(a, now),
    F = HARPIA_FOLHAS[nome],
    im = SPR[nome];
  if (!im || !F) return;
  const col = fr % F.cols,
    lin = Math.floor(fr / F.cols);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (a.state === 'dead' && a.t < 2) ctx.globalAlpha = Math.max(0, a.t / 2);
  ctx.translate(Math.round(a.x), Math.round(a.y - a.z));
  if (a.face < 0) ctx.scale(-1, 1);
  ctx.drawImage(im, col * F.w, lin * F.h, F.w, F.h, -Math.round(F.ax), -Math.round(F.ay), F.w, F.h);
  ctx.restore();
}

/**
 * Uma harpia de fora (que não é o par) chega à área da árvore-ninho do casal: para ver (e testar) a disputa territorial. Ela tem a sua própria árvore
 * e voa até um poleiro dentro do território; a residente a persegue e a expulsa (sem briga: só exibição, gritos e perseguição). Devolve a intrusa.
 */
export function harpyIntruder() {
  const r = fauna.find((f) => f.sp === 'harpy' && f.state !== 'dead' && !f.gone && casa(f));
  const Tr = r && casa(r);
  if (!Tr) return null;
  const b = baseOf(Tr),
    T2 = escolherArvoreNinho(Tr.i);
  if (!T2) return null;
  const a = harpyInitA(faSpawn('harpy', 0, 0, false), T2, 0);
  a.mate = null;
  a.sex = 'f';
  a.x = b.x + (b.x > (MW * TS) / 2 ? -1 : 1) * (H.disputa.raio + 60); // pelo lado do mapa que tem espaço
  a.y = b.y + (b.y > (MH * TS) / 2 ? -30 : 30);
  a.z = 100;
  a.state = 'hroam';
  a.poleiro = poleiro(Tr, 24);
  a.t = 30;
  return a;
}

/**
 * Para ver a harpia (abra o jogo com `?harpia`, ou `harpyDemo()` no console com `?debug`): leva o jogador para perto da árvore-ninho do casal, fora da distância
 * de aviso, de dia. Se ainda não há casal, cria um.
 */
export function harpyDemo() {
  let h = fauna.find((f) => f.sp === 'harpy' && f.state !== 'dead' && !f.gone);
  if (!h) h = harpyInit()[0];
  const T = h && casa(h);
  if (!T) {
    toast('🦅 Ainda não há sumaúma adulta para a harpia.');
    return null;
  }
  // a copa fica copaZ(T) px acima da base na tela: o jogador fica 'embaixo' dela na tela (a ave aparece no meio), mas a distância no chão até o tronco
  // é maior que a de aviso
  const b = baseOf(T);
  S.px = Math.max(TS * 3, Math.min(MW * TS - TS * 3, b.x - H.defesa.avisoR - 40));
  S.py = Math.max(TS * 3, Math.min(MH * TS - TS * 3, b.y - copaZ(T) + 50));
  S.min = 360; // meio-dia: ela é diurna
  toast(
    '🦅 A harpia pousa na copa da sumaúma' +
      (T.gig ? ' GIGANTE' : '') +
      '. Chegue perto do ninho e ela avisa antes de atacar.',
  );
  return h;
}

export { baseOf, copaZ, ehPresa, procurarPresa, veAlvo };
