/**
 * Painéis de melhoria dos moradores: ferramentas (Rosa, Tomé, Luzia) e recuperação de sementes (Gil).
 * Mostram nível atual, próximo nível, benefício, preço, missões, requisito, saldo e o botão de compra.
 * A compra em si (validação e cobrança) é feita por systems/Progression.js.
 *
 * Origem: novo (sistema de progressão)
 */

import {
  SEED_CFG,
  TOOL_MAX_LEVEL,
  TOOL_NAMES,
  TOOL_TIER_NAMES,
  UPGRADE_NPC,
  toolBenefitText,
  toolLevel,
} from '../../config/progression.js';
import { S } from '../../core/GameState.js';
import { beep } from '../../systems/audio/AudioSystem.js';
import { itemIcon } from '../../systems/InventorySystem.js';
import { buySeedUpgrade, buyToolUpgrade, missionsDone, seedStatus, toolStatus } from '../../systems/Progression.js';
import { toast } from '../../ui/Toast.js';
import { qBtn, qClose, qPanel, setQIdx } from './Quests.js';

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

const row = (html, css = '') => {
  const d = document.createElement('div');
  d.style.cssText = css;
  d.innerHTML = html;
  return d;
};

/** O morador tem melhorias a oferecer? */
export function hasUpgrades(npcName) {
  return !!UPGRADE_NPC[npcName];
}

/** Abre o painel de melhorias do morador. `back` reabre a conversa dele. */
export function openUpgrades(npcName, back) {
  const cfg = UPGRADE_NPC[npcName];
  if (!cfg) return;
  setQIdx(-3);
  qPanel.innerHTML = '';
  qPanel.append(row(`<b>🔧 ${npcName}</b> <span style="opacity:.7">· ${cfg.title}</span>`));
  if (cfg.kind === 'seed') renderSeed(npcName, back);
  else renderTools(npcName, cfg.tools, back);
  qPanel.style.display = 'block';
}

function footer(npcName, back) {
  const f = row(
    `Missões concluídas: <b>${missionsDone()}</b> · Saldo: <b style="color:#ffd166">${S.coins} moedas</b>`,
    'margin-top:8px;font-size:13px;opacity:.9',
  );
  const bt = document.createElement('div');
  bt.append(qBtn('Voltar', back, '#555'), qBtn('Fechar', qClose, '#555'));
  qPanel.append(f, bt);
}

function renderTools(npcName, tools, back) {
  for (const id of tools) {
    const lv = toolLevel(id),
      ev = toolStatus(id),
      box = row('', 'margin-top:8px;padding:8px;border:1px solid rgba(217,164,65,.35);border-radius:8px');
    const head = row(
      `<span style="display:inline-block;vertical-align:middle;width:32px">${itemIcon(id)}</span> <b>${TOOL_NAMES[id]}</b> · ${TOOL_TIER_NAMES[lv]} <span style="opacity:.7">(nível ${lv}/${TOOL_MAX_LEVEL})</span>`,
    );
    box.append(
      head,
      row(`<span style="opacity:.8">Agora:</span> ${toolBenefitText(id, lv)}`, 'font-size:13px;margin-top:3px'),
    );
    if (ev.maxed) {
      box.append(row(`<span style="color:#7CFC8A">✔ ${ev.reason}</span>`, 'margin-top:5px;font-size:13px'));
    } else {
      box.append(
        row(
          `<span style="opacity:.8">Próximo:</span> <b>${TOOL_TIER_NAMES[ev.next]} (${ROMAN[ev.next]})</b> — ${toolBenefitText(id, ev.next)}`,
          'font-size:13px;margin-top:3px',
        ),
        row(
          `Preço: <b style="color:#ffd166">${ev.price} moedas</b> · Requisito: ${ev.unlockAt} missões (você tem ${missionsDone()})`,
          'font-size:13px;margin-top:3px',
        ),
      );
      if (!ev.ok) box.append(row(`<span style="color:#ff9d8a">${ev.reason}</span>`, 'font-size:13px;margin-top:3px'));
      const bt = document.createElement('div');
      bt.append(
        qBtn(
          ev.ok ? `Melhorar por ${ev.price}` : ev.unlocked ? 'Sem moedas' : 'Bloqueada',
          () => {
            const r = buyToolUpgrade(id, ev.next);
            if (!r.ok) {
              toast(r.reason);
              return;
            }
            beep(880, 0.12, 'triangle');
            toast(`✨ ${TOOL_NAMES[id]} agora é ${TOOL_TIER_NAMES[r.level]}!`);
            openUpgrades(npcName, back);
          },
          ev.ok ? '#2a7d46' : '#777',
        ),
      );
      box.append(bt);
    }
    qPanel.append(box);
  }
  footer(npcName, back);
}

function renderSeed(npcName, back) {
  const ev = seedStatus(),
    pctNow = Math.round(ev.chanceNow * 100),
    box = row('', 'margin-top:8px;padding:8px;border:1px solid rgba(217,164,65,.35);border-radius:8px');
  box.append(
    row(`🌱 <b>Recuperação de sementes</b> <span style="opacity:.7">(nível ${ev.level}/${SEED_CFG.upgrades})</span>`),
    row(`Chance atual de uma colheita devolver a semente: <b>${pctNow}%</b>`, 'font-size:13px;margin-top:3px'),
  );
  // barra de progresso até o máximo
  const bar = row(
    `<div style="height:100%;width:${(ev.level / SEED_CFG.upgrades) * 100}%;background:linear-gradient(90deg,#7ed957,#ffd166)"></div>`,
    'height:10px;margin-top:6px;background:rgba(0,0,0,.45);border:1px solid #d9a441;border-radius:5px;overflow:hidden',
  );
  box.append(bar);
  if (ev.maxed) {
    box.append(row(`<span style="color:#7CFC8A">✔ ${ev.reason}</span>`, 'margin-top:6px;font-size:13px'));
  } else {
    const gain = Math.round((ev.chanceNext - ev.chanceNow) * 100);
    box.append(
      row(
        `Depois da melhoria ${ROMAN[ev.next]}: <b>${Math.round(ev.chanceNext * 100)}%</b> <span style="opacity:.8">(+${gain} pontos percentuais)</span>`,
        'font-size:13px;margin-top:6px',
      ),
      row(`Preço: <b style="color:#ffd166">${ev.price} moedas</b>`, 'font-size:13px;margin-top:3px'),
    );
    if (!ev.ok) box.append(row(`<span style="color:#ff9d8a">${ev.reason}</span>`, 'font-size:13px;margin-top:3px'));
    const bt = document.createElement('div');
    bt.append(
      qBtn(
        ev.ok ? `Comprar por ${ev.price}` : 'Sem moedas',
        () => {
          const r = buySeedUpgrade(ev.next);
          if (!r.ok) {
            toast(r.reason);
            return;
          }
          beep(880, 0.12, 'triangle');
          toast(`🌱 Sementes: ${Math.round(seedStatus().chanceNow * 100)}% de chance de recuperar!`);
          openUpgrades(npcName, back);
        },
        ev.ok ? '#2a7d46' : '#777',
      ),
    );
    box.append(bt);
  }
  qPanel.append(box);
  footer(npcName, back);
}
