/**
 * Dano ao jogador causado por animais e perigos. Dois medidores:
 *   S.vida   (❤) é o que sai com ataques. Zero = desmaio (o jogador acorda no dia seguinte, dormir(true)).
 *   S.energy (⚡) é a estamina: correr e agir gastam, e o veneno de abelha a drena aos poucos.
 *
 * `hurtPlayer` é para mordidas/golpes com empurrão (segue o fluxo do lobisomem: toca "Hit", empurra o jogador).
 * `damagePlayer` é para ferroadas, quedas e outros danos sem empurrão; quem chama mostra o aviso.
 * `envenenar` acrescenta veneno: a estamina cai ao longo de alguns segundos.
 *
 * Origem: novo (ecossistema vivo). Antes, a vida e a estamina eram o mesmo número (S.energy).
 */

import { S, sleeping } from '../core/GameState.js';
import { dormir } from '../core/TimeManager.js';
import { toast } from '../ui/Toast.js';
import { plAct } from './PlayerSprite.js';
import { playerFx } from './ai/Perception.js';
import { addVenom, regenVida, venomDrain, vitals, VIDA_MAX } from '../systems/Vitals.js';

let fainting = false;

function faint(source) {
  fainting = true;
  playerFx.snareUntil = 0; // solta o jogador de qualquer abraço
  window.NT_KILL = source || 'Um animal';
  setTimeout(() => {
    fainting = false;
    dormir(true);
  }, 1100);
}

/**
 * Tira vida sem empurrão (ferroada, queda). Não mostra aviso: quem chama decide o texto.
 * @returns {boolean} false se não houve dano (dentro de casa, dormindo ou desmaiado).
 */
export function damagePlayer(dmg, source) {
  if (S.inside || sleeping || fainting) return false;
  S.vida = Math.max(0, S.vida - dmg);
  vitals.quiet = 0;
  if (S.vida <= 0) faint(source);
  return true;
}

/**
 * @param {{dmg:number, from:{x:number,y:number}, label:string, kick?:number, source?:string}} o
 * `source` aparece na mensagem de desmaio ("A onça te derrubou! Dia N").
 */
export function hurtPlayer(o) {
  if (S.inside || sleeping || fainting) return false;
  S.vida = Math.max(0, S.vida - o.dmg);
  vitals.quiet = 0;
  const d = Math.hypot(S.px - o.from.x, S.py - o.from.y) || 1,
    kick = o.kick == null ? 170 : o.kick;
  S.vx = ((S.px - o.from.x) / d) * kick;
  S.vy = ((S.py - o.from.y) / d) * kick;
  try {
    plAct(S.vida <= 0 ? 'Death' : 'Hit');
  } catch (e) {}
  toast(o.label + ' −' + Math.round(o.dmg) + ' vida');
  if (S.vida <= 0) faint(o.source);
  return true;
}

/** Veneno de abelha: acrescenta estamina a consumir (o teto evita zerar tudo de uma vez). */
export function envenenar(n) {
  if (S.inside || sleeping) return;
  vitals.venom = addVenom(vitals.venom, n);
}

/** Passo de cada quadro: a vida volta devagar e o veneno consome a estamina. Não roda durante o sono. */
export function vitalsTick(dt) {
  vitals.quiet += dt;
  if (fainting) return;
  if (S.vida < VIDA_MAX) S.vida = regenVida(S.vida, dt, vitals.quiet);
  if (vitals.venom > 0) {
    const r = venomDrain(vitals.venom, dt);
    vitals.venom = r.left;
    S.energy = Math.max(0, S.energy - r.take);
  }
}

/** Só para testes. */
export const isFainting = () => fainting;
