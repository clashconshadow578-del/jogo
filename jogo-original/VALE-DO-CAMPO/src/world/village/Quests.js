/**
 * Missões dos moradores da vila: metas progressivas, recompensas e painel de conversa.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { TS, VH, VW } from '../../config/constants.js';
import { S } from '../../core/GameState.js';
import { ctx } from '../../rendering/Canvas.js';
import { vcam } from '../../rendering/Renderer.js';
import { beep } from '../../systems/audio/AudioSystem.js';
import { toast } from '../../ui/Toast.js';
import { INST } from '../Instances.js';
import { VIL } from '../Village.js';
import { openShop, VEND } from './Vendor.js';
import { hasUpgrades, openUpgrades } from './Upgrades.js';
import { completeMission, missionsDone, registerLegacyMissions } from '../../systems/Progression.js';

/* ============ NPCs DA VILA E MISSÕES ============ */
const QKEY = 'valeDoCampo_quests_v1';

const QNPC = [
  {
    nm: 'Rosa',
    job: 'Fazendeira',
    h: 0,
    stat: 'crop',
    verb: 'Colha',
    unit: 'plantações',
    col: '#8fd16a',
    hat: '#c0392b',
    hi: 'Minhas plantações precisam de ajuda!',
  },
  {
    nm: 'Tomé',
    job: 'Lenhador',
    h: 1,
    stat: 'madeira',
    verb: 'Junte',
    unit: 'madeiras',
    col: '#8a5a33',
    hat: '#3e2a14',
    hi: 'Essas árvores não se cortam sozinhas.',
  },
  {
    nm: 'Luzia',
    job: 'Coletora',
    h: 2,
    stat: 'cogumelo',
    verb: 'Encontre',
    unit: 'cogumelos',
    col: '#b07ad8',
    hat: '#f1c40f',
    hi: 'A floresta esconde cogumelos raros.',
  },
  {
    nm: 'Bento',
    job: 'Comerciante',
    h: 3,
    stat: 'coins',
    verb: 'Venda',
    unit: 'moedas',
    col: '#e7c04a',
    hat: '#2c3e50',
    hi: 'Bons produtos rendem bons negócios.',
  },
  {
    nm: 'Inácio',
    job: 'Pastor',
    h: 4,
    stat: 'pet',
    verb: 'Afague',
    unit: 'vacas',
    col: '#d8a06a',
    hat: '#7f4f24',
    hi: 'As vacas gostam de carinho, sabia?',
  },
  {
    nm: 'Gil',
    job: 'Plantador',
    h: 5,
    stat: 'plant',
    verb: 'Plante',
    unit: 'sementes',
    col: '#6fb6d8',
    hat: '#27ae60',
    hi: 'Semente na terra é a melhor colheita.',
  },
];

function qTarget(s, stat) {
  return Math.round((stat === 'coins' ? 60 : 5) * Math.pow(1.6, s));
} // cada missão fica mais difícil

function qReward(s, stat) {
  return Math.round((stat === 'coins' ? 30 : 40) * Math.pow(1.9, s));
} // e paga mais

function qSave() {
  try {
    localStorage.setItem(QKEY, JSON.stringify(QNPC.map((p) => ({ st: p.st, q: p.q }))));
  } catch (e) {}
}

function qLoad() {
  try {
    const d = JSON.parse(localStorage.getItem(QKEY) || 'null');
    if (Array.isArray(d))
      d.forEach((r, i) => {
        if (QNPC[i]) {
          QNPC[i].st = r.st || 0;
          QNPC[i].q = r.q || null;
        }
      });
  } catch (e) {}
}

let qIdx = -1;

function qAdd(stat, n = 1) {
  let ch = false;
  for (const p of QNPC) {
    const q = p.q;
    if (!q || q.stat !== stat || q.prog >= q.target) continue;
    q.prog = Math.min(q.target, q.prog + n);
    ch = true;
    if (q.prog >= q.target) toast('✅ Missão pronta: ' + p.nm + '!');
  }
  if (ch) qSave();
}

const qPanel = document.createElement('div');

function qBtn(txt, fn, bg) {
  const b = document.createElement('button');
  b.textContent = txt;
  b.style.cssText = `margin:10px 8px 0 0;padding:8px 14px;border:0;border-radius:6px;background:${bg};color:#fff;font-size:14px`;
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    fn();
  });
  return b;
}

function qClose() {
  qPanel.style.display = 'none';
  qIdx = -1;
}

function qShow(i) {
  const p = QNPC[i],
    q = p.q;
  qIdx = i;
  qPanel.innerHTML = '';
  const hd = document.createElement('div');
  hd.innerHTML = `<b>${p.nm}</b> <span style="opacity:.7">· ${p.job}</span>`;
  const t = document.createElement('div');
  t.style.marginTop = '6px';
  const bt = document.createElement('div');
  if (!q) {
    t.innerHTML = `“${p.hi}”<br><br><b>Missão:</b> ${p.verb} ${qTarget(p.st, p.stat)} ${p.unit}.<br><span style="color:#ffd166">Recompensa: ${qReward(p.st, p.stat)} moedas</span>`;
    bt.append(
      qBtn(
        'Aceitar',
        () => {
          p.q = { stat: p.stat, target: qTarget(p.st, p.stat), prog: 0, reward: qReward(p.st, p.stat) };
          qSave();
          toast('Missão aceita!');
          qShow(i);
        },
        '#2a7d46',
      ),
      qBtn('Agora não', qClose, '#555'),
    );
  } else if (q.prog < q.target) {
    t.innerHTML = `Continue assim! Progresso: <b>${q.prog}/${q.target}</b> ${p.unit}.<br><span style="color:#ffd166">Recompensa: ${q.reward} moedas</span>`;
    bt.append(qBtn('Fechar', qClose, '#555'));
  } else {
    t.innerHTML = `“Excelente trabalho!”<br><br><span style="color:#ffd166">Recompensa: ${q.reward} moedas</span>`;
    bt.append(
      qBtn(
        'Receber',
        () => {
          if (p.q !== q || q.prog < q.target || q.paid) return; // já recebida: uma missão conta uma única vez
          q.paid = true;
          S.coins += q.reward;
          toast('+' + q.reward + ' moedas');
          completeMission(); // soma 1 às missões concluídas (global, libera as melhorias)
          p.st++;
          p.q = null;
          qSave();
          beep(880, 0.1, 'triangle');
          qShow(i);
        },
        '#c28a1a',
      ),
    );
  }
  if (hasUpgrades(p.nm)) bt.append(qBtn('🔧 Melhorias', () => openUpgrades(p.nm, () => qShow(i)), '#8a5a1a'));
  const cnt = document.createElement('div');
  cnt.style.cssText = 'margin-top:8px;font-size:12px;opacity:.7';
  cnt.textContent = 'Missões concluídas: ' + missionsDone();
  qPanel.append(hd, t, bt, cnt);
  qPanel.style.display = 'block';
}

function vilTalkNear() {
  if (Math.hypot(VEND.x - S.px, VEND.y - S.py) < 34) {
    openShop();
    return true;
  }
  let best = -1,
    bd = 1e9;
  for (let i = 0; i < QNPC.length; i++) {
    const p = QNPC[i],
      d = Math.hypot(p.px - S.px, p.py - S.py);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  if (best >= 0 && bd < 34) {
    qShow(best);
    return true;
  }
  return false;
}

function drawQNpc(i) {
  const p = QNPC[i],
    x = p.px,
    y = p.py;
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.beginPath();
  ctx.ellipse(x, y + 1, 5, 2, 0, 0, 6.283);
  ctx.fill();
  ctx.fillStyle = '#3a2e24';
  ctx.fillRect(x - 3, y - 4, 2, 4);
  ctx.fillRect(x + 1, y - 4, 2, 4);
  ctx.fillStyle = p.col;
  ctx.fillRect(x - 4, y - 11, 8, 7);
  ctx.fillStyle = '#f1c9a0';
  ctx.fillRect(x - 3, y - 16, 6, 5);
  ctx.fillStyle = p.hat;
  ctx.fillRect(x - 4, y - 18, 8, 3);
  if (p.q && p.q.prog >= p.q.target) {
    ctx.fillStyle = '#7CFC8A';
    ctx.fillRect(x - 2, y - 25, 4, 4);
  } else if (!p.q) {
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(x - 1, y - 26, 2, 5);
    ctx.fillRect(x - 1, y - 20, 2, 2);
  }
}

/** Zera as missões da vila (jogo novo): o contador de missões concluídas recomeça junto com o resto. */
function qReset() {
  QNPC.forEach((p) => {
    p.st = 0;
    p.q = null;
  });
  qSave();
}

export function initQuests() {
  registerLegacyMissions(() => QNPC.reduce((a, p) => a + (p.st || 0), 0)); // saves antigos: missões já recebidas
  QNPC.forEach((p) => {
    const v = VIL[p.h];
    p.tx = v.x - 2;
    p.ty = v.y + 4;
    p.px = p.tx * TS + 8;
    p.py = (p.ty + 1) * TS - 2;
    p.st = 0;
    p.q = null;
  });

  qLoad();

  qPanel.style.cssText =
    'position:fixed;left:50%;bottom:110px;transform:translateX(-50%);width:min(440px,92%);background:rgba(30,18,6,.95);border:2px solid #d9a441;border-radius:10px;padding:12px 14px;max-height:72vh;overflow-y:auto;display:none;font-size:15px;color:#fff;z-index:30;line-height:1.35;user-select:none';

  document.body.appendChild(qPanel);

  // tocar no NPC na tela também abre a conversa (perto dele)
  document.querySelectorAll('canvas')[0].addEventListener(
    'pointerdown',
    (e) => {
      if (!vcam || !INST.vilAct) return;
      const c0 = e.currentTarget,
        r0 = c0.getBoundingClientRect(),
        sc0 = Math.min(r0.width / VW, r0.height / VH),
        wx0 = vcam.x + (e.clientX - r0.left - (r0.width - VW * sc0) / 2) / sc0,
        wy0 = vcam.y + (e.clientY - r0.top - (r0.height - VH * sc0) / 2) / sc0;
      if (Math.abs(wx0 - VEND.x) < 10 && wy0 < VEND.y + 3 && wy0 > VEND.y - 22) {
        if (Math.hypot(VEND.x - S.px, VEND.y - S.py) < 48) openShop();
        else toast('Chegue mais perto para negociar');
        return;
      }
      const c = e.currentTarget,
        r = c.getBoundingClientRect(),
        sc = Math.min(r.width / VW, r.height / VH),
        ox = (r.width - VW * sc) / 2,
        oy = (r.height - VH * sc) / 2;
      const wx = vcam.x + (e.clientX - r.left - ox) / sc,
        wy = vcam.y + (e.clientY - r.top - oy) / sc;
      for (let i = 0; i < QNPC.length; i++) {
        const p = QNPC[i];
        if (Math.abs(wx - p.px) < 10 && wy < p.py + 3 && wy > p.py - 22) {
          if (Math.hypot(p.px - S.px, p.py - S.py) < 48) qShow(i);
          else toast('Chegue mais perto para conversar');
          return;
        }
      }
    },
    true,
  );
}

/** Atualiza `qIdx` a partir de outros módulos (as ligações importadas são somente leitura). */
export function setQIdx(value) {
  qIdx = value;
  return value;
}

export { QNPC, drawQNpc, qAdd, qBtn, qClose, qIdx, qPanel, qReset, qShow, vilTalkNear };
