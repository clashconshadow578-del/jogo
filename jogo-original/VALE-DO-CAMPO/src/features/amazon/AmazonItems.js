/**
 * Itens e interação da floresta amazônica: sementes, frutos, ficha da árvore, plantio, abrir ouriços e vagens, comer.
 *
 * Origem: Vale_do_Campo_V64.html (s13)
 */

import { PRICE } from '../../config/balance.js';
import { GRASS, MH, MW, TREE } from '../../config/constants.js';
import { SUMAUMA_GIGANTE } from '../../config/sumaumaGigante.js';
import { S, sleeping } from '../../core/GameState.js';
import { herd } from '../../entities/cow/Herd.js';
import { spend } from '../../entities/Player.js';
import { amzSp, clamp, lightAt, SP, SPN, STAGE_NM, YEAR } from './AmazonTrees.js';
import { beep } from '../../systems/audio/AudioSystem.js';
import { solid } from '../../systems/CollisionSystem.js';
import { actionA, target } from '../../systems/InteractionSystem.js';
import { ICONS, INV0, ITEMS } from '../../systems/InventorySystem.js';
import { axeCharge } from '../../systems/Woodcutting.js';
import { dlgOpen } from '../../ui/Dialog.js';
import { toast } from '../../ui/Toast.js';
import { alel } from '../../world/Allelopathy.js';
import { ecoTrees } from '../../world/ecology/TreeEcology.js';
import { fvPlantHint } from '../../world/hydrology/Fluvial.js';
import { sapl, seedAge, sm, wl } from '../../world/hydrology/Hydrology.js';
import { shroom } from '../../world/Mushrooms.js';
import { qAdd, qIdx } from '../../world/village/Quests.js';
import { crops, ground, obj } from '../../world/World.js';

/* ---------------- itens e inventário ---------------- */
const NEW_ITEMS = [
  { id: 'seedB', n: 'Semente de buriti', ic: '🌴' },
  { id: 'seedK', n: 'Castanha (semente)', ic: '🌰' },
  { id: 'seedS', n: 'Semente de sumaúma', ic: '🪶' },
  { id: 'buriti', n: 'Fruto de buriti', ic: '🍊' },
  { id: 'palha', n: 'Palha de buriti', ic: '🌾' },
  { id: 'ourico', n: 'Ouriço', ic: '🥥' },
  { id: 'castanha', n: 'Castanha-do-Pará', ic: '🌰' },
  { id: 'vagem', n: 'Vagem de sumaúma', ic: '🫘' },
  { id: 'paina', n: 'Paina de sumaúma', ic: '☁️' },
];

const SEED_SP = { seedB: 1, seedK: 2, seedS: 3 };

function giveItem(k, n) {
  S.inv[k] = (S.inv[k] || 0) + n;
}

/* ---------------- painel de informação ---------------- */
const panel = document.createElement('div');
let panelT = 0;

function showPanel(html) {
  panel.innerHTML = html;
  panel.style.display = 'block';
  clearTimeout(panelT);
  panelT = setTimeout(() => (panel.style.display = 'none'), 11000);
}

const bar = (v, c) =>
  `<span style="display:inline-block;width:64px;height:7px;background:#0007;border-radius:4px;vertical-align:middle;overflow:hidden"><i style="display:block;height:100%;width:${Math.round(clamp(v, 0, 1) * 100)}%;background:${c}"></i></span>`;

function inspect(a) {
  const sp = a.sp,
    m = a.model(),
    st = a.st,
    idadeAnos = (a.idade / YEAR).toFixed(1),
    nextD = ST_NEXT(a);
  const al = (alel && alel[a.i]) || 0;
  let tip = '',
    fr = '';
  if (a.especie === 'buriti') {
    fr = a.maduro()
      ? a.sx === 'f'
        ? a.fr > 0
          ? `🍊 ${a.fr} cacho(s) maduro(s)`
          : 'sem frutos agora (florescem no verão/outono)'
        : 'macho — fornece o pólen; não dá frutos'
      : 'ainda não reproduz';
    tip =
      'Sem a mão (qualquer ferramenta menos o machado): ESCALAR com peconha e colher sem matar a palmeira. Machado: derruba tudo de uma vez — e perde a palmeira fêmea.';
  } else if (a.especie === 'castanheira') {
    fr = a.fr > 0 ? `🥥 ${a.fr} ouriço(s) na copa` : a.st >= 5 ? 'sem ouriços agora' : 'ainda não frutifica';
    tip = `Os ouriços CAEM sozinhos no verão (cuidado com a sombra vermelha no chão!). Abra-os com o machado. Deixe alguns: só a cutia os abre e enterra as castanhas. ${a.nIso < 4 && a.st >= 5 ? '⚠ Isolada da mata: poucos polinizadores, frutifica menos.' : ''} Árvore PROTEGIDA por lei.`;
  } else {
    fr = a.fr > 0 ? `☁️ ${a.fr} vagem(ns) na copa` : 'sem vagens agora';
    tip =
      'Vagens racham na primavera (seco) e a paina voa com o vento levando as sementes. Em ADULTAS, bata nas sapopemas (raízes tabulares): o som viaja quilômetros.';
  }
  showPanel(`<b>${sp.icon} ${sp.nome}</b> <i style="opacity:.7">${sp.cient}</i>${a.especie === 'buriti' ? ` · ${a.sx === 'f' ? '♀ fêmea' : '♂ macho'}` : ''}<br>
 Fase ${st}/7 · ${STAGE_NM[st]}${a.gig && st >= SUMAUMA_GIGANTE.estagioMin ? ' · 🌟 GIGANTE (+30%)' : ''} · ${m ? m.hm : '?'} m · ${idadeAnos} ano(s) de jogo${nextD ? ` · próxima fase em ~${nextD} dias` : ''}<br>
 Saúde ${bar(a.saude / 100, '#6fd16a')} Vigor ${bar(a.vig, '#e2c24a')} Luz ${bar(a.luz, '#ffe28a')}<br>
 Alelopatia no solo ${bar(al, '#b06ad0')} ${Math.round(al * 100)}%<br>${fr}<br><span style="opacity:.82">${tip}</span>`);
}

function ST_NEXT(a) {
  if (a.st >= 6) return 0;
  const ag = a.sp.ages,
    need = ag[a.st] - a.g;
  const rate = Math.max(0.15, a.vig || 0.5);
  return Math.max(1, Math.round(need / rate));
}

/* ---------------- alvo e interação ---------------- */
const rootSpan = (a) => ((a.especie === 'sumauma' && a.st >= 5) || (a.especie === 'castanheira' && a.st >= 6) ? 1 : 0);

function treeNear(tx, ty) {
  const i = ty * MW + tx;
  let a = ecoTrees.get(i);
  if (a && a.amz && obj[i] === TREE) return [i, a];
  for (const d of [-1, 1]) {
    const j = i + d;
    if (tx + d < 0 || tx + d >= MW) continue;
    const b = ecoTrees.get(j);
    if (b && b.amz && obj[j] === TREE && rootSpan(b)) return [j, b];
  }
  return null;
}

function plantAmz(i, id) {
  const spId = SEED_SP[id],
    nm = SPN[spId];
  if (!(S.inv[id] > 0)) return;
  if (ground[i] !== GRASS || obj[i] || crops[i] || sapl[i] || seedAge[i]) {
    toast('Plante em grama livre');
    return;
  }
  amzSp[i] = spId;
  sapl[i] = 0.01;
  seedAge[i] = 0;
  S.inv[id]--;
  spend();
  beep(380, 0.05);
  let hint = '';
  if (nm === 'buriti' && sm[i] < 0.55) hint = " · buriti precisa de solo ENCHARCADO (perto d'água)";
  else if (nm === 'castanheira' && wl[i] > 0.1) hint = ' · castanheira morre alagada: plante em terra firme';
  else if (nm === 'sumauma' && lightAt(i % MW, (i / MW) | 0, 0, null) < 0.6)
    hint = ' · sumaúma precisa de pleno sol (clareira)';
  toast('🌱 Muda de ' + SP[nm].nome + ' plantada' + hint);
  try {
    fvPlantHint(i);
  } catch (e) {}
}

function openOurico() {
  if (!(S.inv.ourico > 0)) return;
  if (S.energy <= 0) {
    toast('Você está exausto');
    return;
  }
  S.inv.ourico--;
  spend();
  beep(150, 0.1, 'sawtooth');
  const n = 12 + Math.floor(Math.random() * 9);
  giveItem('castanha', n);
  let extra = '';
  if (Math.random() < 0.45) {
    giveItem('seedK', 1);
    extra = ' +1 castanha-semente';
  }
  toast('🥥 Ouriço aberto com o machado: +' + n + ' castanhas' + extra);
}

function openVagem() {
  if (!(S.inv.vagem > 0)) return;
  S.inv.vagem--;
  spend();
  beep(520, 0.06, 'triangle');
  const p = 2 + Math.floor(Math.random() * 3),
    sd = 1 + Math.floor(Math.random() * 3);
  giveItem('paina', p);
  giveItem('seedS', sd);
  toast('☁️ Vagem aberta: +' + p + ' paina, +' + sd + ' semente(s) de sumaúma');
}

function eat(id, gain, txt) {
  if (!(S.inv[id] > 0)) return;
  if (S.energy >= 100) {
    toast('Você já está com a energia cheia');
    return;
  }
  S.inv[id]--;
  S.energy = Math.min(100, S.energy + gain);
  beep(620, 0.07, 'triangle');
  toast(txt + ' +' + gain + ' energia');
}

let driveT = 0;

function interact(a, i, item) {
  const nm = a.especie,
    st = a.st;
  if (nm === 'buriti') {
    if (a.sx === 'f' && a.fr > 0 && st >= 6) {
      if (S.energy < 8) {
        toast('Sem energia para escalar');
        return true;
      }
      S.energy = Math.max(0, S.energy - 8);
      const n = Math.min(a.fr, 1 + Math.floor(Math.random() * 2));
      a.fr -= n;
      a.refresh();
      const fruit = n * (3 + Math.floor(Math.random() * 3));
      giveItem('buriti', fruit);
      giveItem('palha', 1);
      if (Math.random() < 0.4) giveItem('seedB', 1);
      beep(300, 0.12, 'triangle');
      toast('🧗 Escalou com peconha: +' + fruit + ' frutos de buriti, +1 palha — a palmeira segue viva!');
      amzQ('crop', 1);
      return true;
    }
    inspect(a);
    return true;
  }
  if (nm === 'sumauma') {
    if (st >= 5 && performance.now() - driveT > 1500) {
      driveT = performance.now();
      beep(70, 0.4, 'sine');
      setTimeout(() => beep(62, 0.5, 'sine'), 260);
      toast('🥁 Tum… tum… O som das sapopemas viaja quilômetros pela floresta.');
      inspect(a);
      return true;
    }
    inspect(a);
    return true;
  }
  inspect(a);
  return true;
}

function amzQ(stat, n) {
  try {
    qAdd(stat, n);
  } catch (e) {}
}

function amzAction() {
  if (qIdx !== -1 || dlgOpen || S.inside || sleeping) return false;
  for (const q of herd) if (Math.hypot(q.x - S.px, q.y - S.py) < 24) return false;
  const t = target();
  if (t.x < 0 || t.y < 0 || t.x >= MW || t.y >= MH) return false;
  const i = t.y * MW + t.x,
    item = (ITEMS[S.sel] || {}).id;
  if (SEED_SP[item]) {
    plantAmz(i, item);
    return true;
  }
  if (item === 'ourico') {
    openOurico();
    return true;
  }
  if (item === 'vagem') {
    openVagem();
    return true;
  }
  if (item === 'buriti') {
    eat('buriti', 14, '🍊 Fruto de buriti (vitamina A)');
    return true;
  }
  if (item === 'castanha') {
    eat('castanha', 6, '🌰 Castanha-do-Pará (selênio)');
    return true;
  }
  const tn = treeNear(t.x, t.y);
  if (tn) {
    if (item === 'axe') {
      if (tn[0] !== i) {
        axeCharge(tn[0]);
        return true;
      }
      return false;
    }
    return interact(tn[1], tn[0], item);
  }
  if (obj[i] === 0 && !shroom[i]) {
    // tile com semente/muda amazônica: mostra o que é
    const sp = amzSp[i];
    if (sp && (sapl[i] > 0 || seedAge[i] > 0) && item !== 'hoe') {
      toast(
        (sapl[i] > 0 ? '🌱 Muda de ' : '🌰 Semente de ') +
          SP[SPN[sp]].nome +
          (sapl[i] > 0 ? ' · ' + Math.round(sapl[i] * 100) + '%' : ' · aguardando germinar') +
          ' · alelopatia ' +
          Math.round((alel[i] || 0) * 100) +
          '%',
      );
      return true;
    }
  }
  return false;
}

export function installAmazonItems() {
  for (const it of NEW_ITEMS) {
    if (!ITEMS.some((x) => x.id === it.id)) ITEMS.push({ id: it.id, n: it.n });
    ICONS[it.id] = it.ic;
    INV0[it.id] = 0;
    if (S && S.inv && S.inv[it.id] == null) S.inv[it.id] = 0;
  }

  Object.assign(PRICE, { buriti: 38, palha: 14, castanha: 7, paina: 22 });

  panel.style.cssText =
    'position:fixed;left:50%;bottom:112px;transform:translateX(-50%);width:min(430px,92%);background:rgba(12,30,18,.95);border:2px solid #7bc47f;border-radius:10px;padding:10px 13px;display:none;font:13px/1.4 system-ui,Segoe UI,Arial,sans-serif;color:#fff;z-index:31;user-select:none;box-shadow:0 6px 24px #000a';

  document.body.appendChild(panel);

  panel.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    panel.style.display = 'none';
  });

  solid.extend(
    (_solid) =>
      function (tx, ty) {
        if (_solid(tx, ty)) return true;
        if (tx <= 0 || tx >= MW - 1) return false;
        const i = ty * MW + tx;
        if (obj[i - 1] === TREE || obj[i + 1] === TREE) {
          const a = ecoTrees.get(i - 1);
          if (a && a.amz && obj[i - 1] === TREE && rootSpan(a)) return true;
          const b = ecoTrees.get(i + 1);
          if (b && b.amz && obj[i + 1] === TREE && rootSpan(b)) return true;
        }
        return false;
      },
  );

  actionA.extend(
    (_aA2) =>
      function () {
        try {
          if (amzAction()) return;
        } catch (e) {
          console.error('amz action', e);
        }
        return _aA2.apply(this, arguments);
      },
  );
}

export { NEW_ITEMS, eat, giveItem, inspect, panel };
