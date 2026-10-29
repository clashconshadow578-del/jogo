/**
 * Mapa do vale (tecla M ou botão): região atual em detalhe, miniatura do mundo, nuvens de chuva e legenda.
 *
 * Origem: Vale_do_Campo_V64.html (s11)
 */
/* Mapa do jogo: desenha o mundo inteiro uma vez ao abrir (leve) e só atualiza as marcações */

import {
  BED,
  BIN,
  FORD,
  HOMEC,
  HOUSE,
  MH,
  MW,
  PATH,
  ROCK,
  SAND,
  SCREE,
  SNOWG,
  SOIL,
  TREE,
  TS,
  VILC,
  WATER,
  WN,
} from '../config/constants.js';
import { FENCE, GATE, GATE_OPEN } from '../config/constants.js';
import { S } from '../core/GameState.js';
import { fauna } from '../entities/wild/Fauna.js';
import { LKD } from '../rendering/LakeRenderer.js';
import { hash2 } from '../utils/MathUtils.js';
import { ckey, INST } from '../world/Instances.js';
import { clouds } from '../world/WeatherSystem.js';
import { crops, ground, obj } from '../world/World.js';
import { worldMM } from '../world/WorldData.js';

export function initMapUI() {
  const MMW = MW,
    SC = 6,
    W = MMW * SC,
    H = MH * SC;

  const ov = document.createElement('div');
  ov.id = 'mapOv';

  ov.innerHTML =
    '<div class="mt">🗺️ Mapa do Vale <button id="mapX" aria-label="Fechar">✕</button></div><div id="mapW"><canvas id="mapC"></canvas></div><div class="ml"><span><i style="background:#e0443a"></i>Você</span><span><i style="background:#f3e6b0"></i>Animais</span><span><i style="background:#2f7a3a"></i>Árvores</span><span><i style="background:#8b8f96"></i>Pedras</span><span><i style="background:#2f75b4"></i>Água</span><span><i style="background:#c9b17e"></i>Caminho</span><span><i style="background:#7a5232"></i>Terra/plantio</span><span><i style="background:#dfe9f3"></i>Nuvem de chuva</span><span><i style="background:#4f9a3f"></i>Instância visitada</span></div>';

  document.body.appendChild(ov);

  const btn = document.createElement('button');
  btn.id = 'mapBtn';
  btn.setAttribute('aria-label', 'Mapa');
  btn.textContent = '🗺️';
  document.body.appendChild(btn);

  const mc = document.getElementById('mapC');
  mc.width = W;
  mc.height = H;
  const g = mc.getContext('2d');

  const base = document.createElement('canvas');
  base.width = W;
  base.height = H;
  const b = base.getContext('2d');

  const hs = (x, y) => {
    let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };

  let tmr = 0,
    lastB = 0;

  function build() {
    const lk = typeof LKD !== 'undefined' ? LKD : null;
    for (let y = 0; y < MH; y++)
      for (let x = 0; x < MMW; x++) {
        const i = y * MW + x,
          gd = ground[i],
          n = hs(x, y) - 0.5;
        let r, gg, bb;
        if (gd === WATER) {
          r = 47;
          gg = 117;
          bb = 180;
          const v = lk ? lk[i] : 0;
          if (v > 0.02) {
            const a = Math.min(0.68, v * 0.74);
            r = r * (1 - a) + 4 * a;
            gg = gg * (1 - a) + 22 * a;
            bb = bb * (1 - a) + 56 * a;
          }
          r += n * 8;
          gg += n * 8;
          bb += n * 8;
        } else if (gd === PATH) {
          r = 201 + n * 14;
          gg = 177 + n * 14;
          bb = 126 + n * 12;
        } else if (gd === SOIL) {
          r = 122 + n * 12;
          gg = 82 + n * 10;
          bb = 50 + n * 8;
        } else if (gd === SAND) {
          r = 228 + n * 10;
          gg = 212 + n * 10;
          bb = 158 + n * 10;
        } else if (gd === SCREE) {
          r = 138 + n * 12;
          gg = 132 + n * 12;
          bb = 124 + n * 12;
        } else if (gd === SNOWG) {
          r = 240 + n * 8;
          gg = 244 + n * 8;
          bb = 250 + n * 5;
        } else if (gd === FORD) {
          r = 96 + n * 10;
          gg = 160 + n * 10;
          bb = 204 + n * 8;
        } else if (gd === BED) {
          r = 176 + n * 10;
          gg = 160 + n * 10;
          bb = 130 + n * 10;
        } else {
          r = 84 + n * 16;
          gg = 150 + n * 20;
          bb = 58 + n * 12;
        }
        b.fillStyle = `rgb(${r | 0},${gg | 0},${bb | 0})`;
        b.fillRect(x * SC, y * SC, SC, SC);
      }
    let hx = 0,
      hy = 0,
      hn = 0;
    for (let y = 0; y < MH; y++)
      for (let x = 0; x < MMW; x++) {
        const i = y * MW + x,
          o = obj[i],
          X = x * SC,
          Y = y * SC;
        if (crops[i]) {
          b.fillStyle = '#e6d34a';
          b.fillRect(X + 2, Y + 2, SC - 4, SC - 4);
          b.fillStyle = '#4c9a2f';
          b.fillRect(X + 3, Y + 3, SC - 6, SC - 6);
        }
        if (!o) continue;
        if (o === TREE) {
          b.fillStyle = '#17421f';
          b.beginPath();
          b.arc(X + SC / 2, Y + SC / 2, SC * 0.62, 0, 6.283);
          b.fill();
          b.fillStyle = '#2f7a3a';
          b.beginPath();
          b.arc(X + SC / 2 - 0.7, Y + SC / 2 - 0.9, SC * 0.42, 0, 6.283);
          b.fill();
        } else if (o === ROCK) {
          b.fillStyle = '#5d6168';
          b.fillRect(X + 1, Y + 2, SC - 2, SC - 3);
          b.fillStyle = '#9a9ea6';
          b.fillRect(X + 2, Y + 2, SC - 5, SC - 5);
        } else if (o === HOUSE) {
          b.fillStyle = '#6b4326';
          b.fillRect(X, Y, SC, SC);
          b.fillStyle = '#a6683f';
          b.fillRect(X + 1, Y + 1, SC - 2, SC - 2);
          hx += x;
          hy += y;
          hn++;
        } else if (o === BIN) {
          b.fillStyle = '#d04a3a';
          b.fillRect(X + 1, Y + 1, SC - 2, SC - 2);
        } else if (o === FENCE || o === GATE || o === GATE_OPEN) {
          b.fillStyle = o === GATE_OPEN ? '#d9c28a' : '#8a5a33'; // cerca marrom; portão aberto mais claro
          b.fillRect(X + 1, Y + SC / 2 - 1, SC - 2, 2);
          b.fillRect(X + SC / 2 - 1, Y + 1, 2, SC - 2);
        } else {
          b.fillStyle = '#c9a0dc';
          b.beginPath();
          b.arc(X + SC / 2, Y + SC / 2, 2, 0, 6.283);
          b.fill();
        }
      }
    if (hn) {
      b.font = 'bold 22px system-ui,sans-serif';
      b.textAlign = 'center';
      b.textBaseline = 'middle';
      b.lineWidth = 4;
      b.strokeStyle = '#000a';
      b.strokeText('🏠', (hx / hn) * SC + SC / 2, (hy / hn) * SC - 6);
      b.fillText('🏠', (hx / hn) * SC + SC / 2, (hy / hn) * SC - 6);
    }
    lastB = performance.now();
  }

  const CLOUD_SPR = {};

  function cloudSpr(dark) {
    const k = dark ? 'd' : 'l';
    if (CLOUD_SPR[k]) return CLOUD_SPR[k];
    const c = document.createElement('canvas');
    c.width = 20;
    c.height = 12;
    const x = c.getContext('2d');
    const bl = [
      [6, 6, 4],
      [11, 5, 4.6],
      [15, 7, 3.4],
      [9, 8, 3.6],
    ];
    const pal = dark ? ['#7d90a3', '#56697c', '#3a4a5b'] : ['#f2f7fb', '#c9d6e2', '#93a6b8'];
    for (let py = 0; py < 12; py++)
      for (let px = 0; px < 20; px++) {
        if (!bl.some(([cx, cy, r]) => Math.hypot(px + 0.5 - cx, py + 0.5 - cy) < r)) continue;
        x.fillStyle = py < 4 ? pal[0] : py < 7 ? pal[1] : pal[2];
        x.fillRect(px, py, 1, 1);
      }
    return (CLOUD_SPR[k] = c);
  }

  function drawMapClouds(g) {
    if (typeof clouds === 'undefined') return;
    g.imageSmoothingEnabled = false;
    const k = Math.floor(performance.now() / 120);
    for (const c of clouds) {
      if (c.pw < 0.03) continue;
      const w = ((c.r * 2) / TS) * SC,
        h = (w * 12) / 20,
        X = (c.x / TS) * SC - w / 2,
        Y = (c.y / TS) * SC - h / 2;
      g.globalAlpha = Math.min(0.95, c.pw * 1.1);
      g.drawImage(cloudSpr(c.pw > 0.35), X, Y, w, h);
      if (c.pw > 0.35) {
        g.fillStyle = '#a9d4ff'; // pingos saindo da nuvem (chuva)
        for (let i = 0; i < 10; i++) {
          const rx = X + w * (0.12 + 0.76 * hash2(i, c.r | 0)),
            ry = Y + h + ((i * 5 + k * 2) % 10) * 1.2;
          g.fillRect(Math.round(rx), Math.round(ry), 1, 2);
        }
      }
    }
    g.globalAlpha = 1;
  }

  function draw() {
    if (performance.now() - lastB > 5000) build();
    g.drawImage(base, 0, 0);
    for (const a of fauna) {
      const x = (a.x / TS) * SC,
        y = (a.y / TS) * SC;
      g.fillStyle = '#f3e6b0';
      g.strokeStyle = '#000a';
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(x, y, 3, 0, 6.283);
      g.fill();
      g.stroke();
    }
    drawMapClouds(g);
    {
      const cs = 15,
        gx = W - 10 * cs - 10,
        gy = 10;
      g.fillStyle = 'rgba(0,0,0,.6)';
      g.fillRect(gx - 5, gy - 5, 10 * cs + 10, 10 * cs + 10);
      g.imageSmoothingEnabled = true;
      g.drawImage(worldMM(), gx, gy, 10 * cs, 10 * cs);
      g.imageSmoothingEnabled = false; // o mundo projetado inteiro
      for (let cy = 0; cy < WN; cy++)
        for (let cx = 0; cx < WN; cx++) {
          const k = ckey(cx, cy),
            cur = cx === INST.cx && cy === INST.cy,
            isH = cx === HOMEC.x && cy === HOMEC.y,
            isV = cx === VILC.x && cy === VILC.y;
          if (!(INST.vis[k] || INST.bg[k] || cur)) {
            g.fillStyle = 'rgba(8,10,14,.6)';
            g.fillRect(gx + cx * cs, gy + cy * cs, cs, cs);
          } // nevoa nas regioes nao visitadas
          g.strokeStyle = cur
            ? '#ffffff'
            : isH
              ? '#d9a441'
              : isV
                ? '#b86a6a'
                : INST.vis[k]
                  ? 'rgba(110,200,90,.9)'
                  : 'rgba(255,255,255,.12)';
          g.lineWidth = cur || isH || isV ? 2 : 1;
          g.strokeRect(gx + cx * cs + 0.5, gy + cy * cs + 0.5, cs - 1, cs - 1);
          const rn = INST.rain[k] || 0;
          if (rn > 2) {
            g.fillStyle = 'rgba(120,190,255,.75)';
            g.fillRect(gx + cx * cs + 2, gy + cy * cs + 2, cs - 5, cs - 5);
          }
        }
      g.fillStyle = '#e0443a';
      g.fillRect(gx + INST.cx * cs + 4, gy + INST.cy * cs + 4, cs - 9, cs - 9);
      g.font = 'bold 11px system-ui,sans-serif';
      g.textAlign = 'right';
      g.fillStyle = '#fff';
      g.fillText('Região ' + INST.cx + ',' + INST.cy, W - 12, gy + 10 * cs + 16);
    }
    const px = (S.px / TS) * SC,
      py = (S.py / TS) * SC,
      t = performance.now() / 1000,
      pr = 9 + 2.5 * Math.sin(t * 5);
    g.strokeStyle = 'rgba(255,255,255,.75)';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(px, py, pr, 0, 6.283);
    g.stroke();
    g.fillStyle = '#e0443a';
    g.strokeStyle = '#fff';
    g.lineWidth = 2.5;
    g.beginPath();
    g.arc(px, py, 5, 0, 6.283);
    g.fill();
    g.stroke();
  }

  function toggle(v) {
    const on = v === undefined ? ov.style.display !== 'flex' : v;
    ov.style.display = on ? 'flex' : 'none';
    clearInterval(tmr);
    if (on) {
      build();
      draw();
      tmr = setInterval(draw, 100);
    }
  }

  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    toggle();
  });

  document.getElementById('mapX').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    toggle(false);
  });

  document.getElementById('mapX').addEventListener('click', () => toggle(false));

  ov.addEventListener('pointerdown', (e) => {
    if (e.target === ov) toggle(false);
  });

  addEventListener('keydown', (e) => {
    if (/INPUT|SELECT|TEXTAREA/.test((e.target || {}).tagName || '')) return;
    const k = e.key.toLowerCase();
    if (k === 'm' && !e.repeat) toggle();
    else if (k === 'escape' && ov.style.display === 'flex') toggle(false);
  });
}
