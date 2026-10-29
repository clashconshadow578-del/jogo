/**
 * Passos de inicialização do jogo propriamente dito: carrega o save (ou cria um jogo novo), garante a casa, o casal fundador do rebanho e exibe o aviso inicial.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { HOUSE, MW, OX, OY, ROCK, TREE } from '../config/constants.js';
import { S } from './GameState.js';
import { newGame } from './NewGame.js';
import { load } from './SaveManager.js';
import { COW_IMG, mkBlack } from '../entities/cow/CowRenderer.js';
import { herd, spawnBlack } from '../entities/cow/Herd.js';
import { renderHotbar } from '../ui/Hotbar.js';
import { toast } from '../ui/Toast.js';
import { obj } from '../world/World.js';

export function bootLoadGame() {
  if (!load()) newGame();

  S.inv.cogumelo = S.inv.cogumelo || 0;

  for (let y = 3; y <= 10; y++)
    for (let x = 12; x <= 22; x++) {
      const i = (y + OY) * MW + x + OX;
      if (y >= 8 && x >= 13 && x <= 21) obj[i] = HOUSE;
      else if (obj[i] === TREE || obj[i] === ROCK) obj[i] = 0;
    } // pegada da casa maior{const sv=shroom;for(let i=0;i<HN;i++)if(mato[i]>12)shroomRoll(i);}

  if (herd.length < 2) spawnBlack();

  if (herd.length >= 2 && herd[0].sex === 'f' && herd[1].sex === 'f' && herd[1].mom < 0 && !(herd[1].age < 999)) {
    herd[1].sex = 'm';
    herd[1].founder = 1;
    herd[1].name = null;
    herd[1].g = null;
  } // saves antigos: 2ª vaca vira macho

  if (COW_IMG.complete && COW_IMG.naturalWidth) mkBlack();
  else COW_IMG.addEventListener('load', mkBlack);
}

export function bootUI() {
  renderHotbar();

  setTimeout(
    () =>
      toast(
        'Joystick: andar · Usar: ferramenta/colheita · Entrar: porta da casa · Dormir: na cama · Correr: +30% de velocidade (gasta energia)',
      ),
    500,
  );
}
