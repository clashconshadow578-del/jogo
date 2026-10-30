/**
 * Renderização das árvores amazônicas: balanço ao vento, sombras projetadas da copa, mudas, frutos no chão e partículas no céu.
 *
 * Origem: Vale_do_Campo_V64.html (s13)
 */

import { MW, TS, VH, VW } from '../../config/constants.js';
import { S } from '../../core/GameState.js';
import { sunInfo } from '../../core/TimeManager.js';
import { amzDrops, amzSp, BOLT, clamp, FALL, M, PT, SPN } from './AmazonTrees.js';
import { OCLUSAO } from '../../config/occlusion.js';
import { ctx } from '../../rendering/Canvas.js';
import { occBegin, occEnd } from '../../rendering/Occlusion.js';
import { vcam } from '../../rendering/Renderer.js';
import { casterShadow } from '../../rendering/ShadowSystem.js';
import { drawWeather } from '../../rendering/WeatherRenderer.js';
import { TREE_HP } from '../../systems/Woodcutting.js';
import { ecoTrees } from '../../world/ecology/TreeEcology.js';
import { drawPrints } from '../../world/GrassSystem.js';
import { drawTree } from '../../rendering/TreeRenderer.js';
import { treeModel } from '../../world/Trees.js';
import { drawSapling } from '../../world/Vegetation.js';
import { climate, windNow } from '../../world/WeatherSystem.js';

const amzHPmax = function (i) {
  const a = ecoTrees.get(i);
  return a && a.amz ? a.sp.hp[a.st - 1] : TREE_HP;
};

/* sombra projetada: tronco + copa achatada no chão, comprimento limitado */

/* muda: sprite da espécie em vez do broto genérico */

/* itens no chão (ouriço, vagem, palha) */

/* ---------------- partículas: folhas, paina, frondes, frutos caindo, raio ---------------- */
function sunLum() {
  const sn = sunInfo(6 + S.min / 60);
  return clamp(0.28 + sn.day * 0.85, 0.28, 1);
}

function spawnPT(o) {
  if (PT.length < 260) PT.push(o);
}

function visList() {
  const cx = vcam ? vcam.x : 0,
    cy = vcam ? vcam.y : 0,
    out = [];
  for (const [j, a] of ecoTrees) {
    if (!a.amz || a.st < 3) continue;
    const px = a.x * TS + 8,
      py = (a.y + 1) * TS;
    if (px < cx - 90 || px > cx + VW + 90 || py < cy - 30 || py > cy + VH + 220) continue;
    out.push(a);
  }
  return out;
}

export function installAmazonRender() {
  treeModel.extend(
    (_tm) =>
      function (tx, ty) {
        const a = ecoTrees.get(ty * MW + tx);
        if (a && a.amz) {
          const m = a.model();
          if (m && m.ready) return m;
        }
        return _tm(tx, ty);
      },
  );

  drawTree.extend(
    (_dtree) =>
      function (x, y, tx, ty) {
        const a = tx != null ? ecoTrees.get(ty * MW + tx) : null;
        if (!a || !a.amz) return _dtree.apply(this, arguments);
        const m = a.model();
        if (!m || !m.ready) return _dtree.apply(this, arguments);
        const t = performance.now() / 1000,
          w = windNow(),
          stormK = climate.kind >= 4 ? 0.55 : climate.kind >= 3 ? 0.25 : 0,
          sp = a.sp;
        const H = m.h,
          top = H * 0.015 * sp.flex * (0.3 + 1.15 * w + stormK); // deslocamento do topo em px (cresce com a altura e a velocidade do vento)
        const f0 = 0.95 / Math.sqrt(Math.max(1, H / 40)); // árvore mais alta balança mais devagar
        const ph = t * f0 * 6.283 - tx * 0.45 + ty * 0.08; // rajada: a frente de vento atravessa o mapa de oeste p/ leste
        const gust = Math.sin(ph) * 0.55 + Math.sin(ph * 2.3 + 1.3) * 0.22 + 0.45 + w * 0.25; // média positiva: copa inclina para leste
        const dx = Math.round(x - m.w / 2),
          dy = Math.round(y - m.h + 2),
          step = H > 150 ? 3 : H > 70 ? 2 : 1;
        /* se o jogador está atrás da árvore, só um círculo ao redor dele fica translúcido (rendering/Occlusion.js) */
        const mg = OCLUSAO.margem,
          g = occBegin(dx - mg, dy, m.w + 2 * mg, m.h);
        const flutter = (sp.flut || 0) * (0.25 + w * 1.2),
          cbRow = m.cbRow || H * 0.5,
          rw = m.rw,
          mw = m.mw || m.w;
        let rs = -1,
          rO = 0;
        for (let r = 0; r < H; r += step) {
          const f = 1 - (r + step * 0.5) / H; // 0 base … 1 topo
          let o = top * gust * Math.pow(f, sp.pw);
          if (flutter && rw && r < cbRow)
            o += Math.sin(t * 5.2 + r * 0.33 + ph) * flutter * (rw[r] / mw) * 1.4; // frondes do buriti vibram
          else if (w > 0.5) o += Math.sin(t * 6 + r * 0.45 + ph) * 0.35 * f * (w - 0.35); // folhas farfalham
          const ro = Math.round(o),
            sh = Math.min(step, H - r);
          if (rs < 0) {
            rs = r;
            rO = ro;
          } else if (ro !== rO) {
            g.drawImage(m.img, 0, rs, m.w, r - rs, dx + rO, dy + rs, m.w, r - rs);
            rs = r;
            rO = ro;
          } // junta fatias com mesmo deslocamento
        }
        if (rs >= 0) g.drawImage(m.img, 0, rs, m.w, H - rs, dx + rO, dy + rs, m.w, H - rs);
        if (a.burn) {
          g.globalAlpha = 0.35;
          g.fillStyle = '#120a05';
          g.fillRect(dx, dy, m.w, m.h);
          g.globalAlpha = 1;
        }
        occEnd(g);
      },
  );

  casterShadow.extend(
    (_cs) =>
      function (c, s, vx, vy, k) {
        const m = s[5];
        if (s[4] !== 'tree' || !m || !m.amz || !m.big || !m.ready) return _cs.apply(this, arguments);
        const x = s[0],
          y = s[1],
          H = m.h,
          cbRow = m.cbRow,
          zc = H * (1 - (cbRow / H) * 0.5); // altura do centro da copa
        let sc = k;
        const len = Math.hypot(vx, vy) * zc * k;
        if (len > 230) sc = (k * 230) / len;
        const V = (z) => [vx * z * sc, vy * z * sc];
        c.save();
        c.strokeStyle = '#000';
        c.lineCap = 'round';
        c.lineWidth = Math.max(2, m.tw * 0.9);
        const e = V(zc * 0.85);
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x + e[0], y + e[1]);
        c.stroke();
        const hC = m.silC.height,
          sy = 0.5,
          ncp = Math.min(12, 2 + Math.ceil(len / 10));
        for (let q = 0; q < ncp; q++) {
          const z = zc * (0.82 + (0.28 * q) / Math.max(1, ncp - 1)),
            v = V(z);
          c.drawImage(
            m.silC,
            0,
            0,
            m.w,
            hC,
            Math.round(x - m.w / 2 + v[0]),
            Math.round(y + v[1] - hC * sy * 0.55),
            m.w,
            Math.round(hC * sy),
          );
        }
        c.restore();
      },
  );

  drawSapling.extend(
    (_dsap) =>
      function (x, y, s) {
        const j = ((y / TS) | 0) * MW + ((x / TS) | 0),
          sp = amzSp[j];
        if (!sp) return _dsap.apply(this, arguments);
        const m = M[SPN[sp]][1];
        if (!m || !m.ready) return _dsap.apply(this, arguments);
        const k = 0.55 + 0.45 * s,
          w = Math.round(m.w * k),
          h = Math.round(m.h * k);
        ctx.drawImage(m.img, x + 8 - (w >> 1), y + 15 - h, w, h);
      },
  );

  drawPrints.extend(
    (_dpr) =>
      function () {
        _dpr.apply(this, arguments);
        if (!amzDrops.length) return;
        const cx = vcam ? vcam.x : 0,
          cy = vcam ? vcam.y : 0;
        for (const d of amzDrops) {
          if (d.x < cx - 12 || d.x > cx + VW + 12 || d.y < cy - 12 || d.y > cy + VH + 12) continue;
          const X = Math.round(d.x),
            Y = Math.round(d.y);
          ctx.fillStyle = 'rgba(0,0,0,.28)';
          ctx.beginPath();
          ctx.ellipse(X, Y + 2, 4, 1.6, 0, 0, 6.283);
          ctx.fill();
          if (d.k === 'ourico') {
            ctx.fillStyle = '#4a2a14';
            ctx.beginPath();
            ctx.arc(X, Y - 1, 3.6, 0, 6.283);
            ctx.fill();
            ctx.fillStyle = '#7a4a24';
            ctx.beginPath();
            ctx.arc(X - 0.8, Y - 1.8, 2.4, 0, 6.283);
            ctx.fill();
            ctx.fillStyle = '#a8703a';
            ctx.fillRect(X - 1, Y - 3, 1, 1);
          } else if (d.k === 'vagem') {
            ctx.fillStyle = '#6b4a22';
            ctx.fillRect(X - 4, Y - 2, 8, 3);
            ctx.fillStyle = '#a8844a';
            ctx.fillRect(X - 3, Y - 2, 6, 1);
            ctx.fillStyle = '#e9e4d0';
            ctx.fillRect(X + 2, Y - 3, 2, 1);
          } else if (d.k === 'buriti') {
            ctx.fillStyle = '#7a2a14';
            ctx.beginPath();
            ctx.arc(X - 1, Y - 1, 2.6, 0, 6.283);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(X + 2, Y, 2.2, 0, 6.283);
            ctx.fill();
            ctx.fillStyle = '#d9692a';
            ctx.fillRect(X - 2, Y - 2, 2, 1);
            ctx.fillRect(X + 1, Y - 1, 2, 1);
          } else {
            ctx.fillStyle = '#8a6a2a';
            ctx.fillRect(X - 3, Y - 1, 7, 2);
            ctx.fillStyle = '#b9923c';
            ctx.fillRect(X - 2, Y - 2, 5, 1);
          }
          if (d.n > 1) {
            ctx.fillStyle = '#fff';
            ctx.font = '6px monospace';
            ctx.fillText(String(d.n), X + 4, Y - 2);
          }
        }
      },
  );

  drawWeather.extend(
    (_dw2) =>
      function (t, camX, camY) {
        _dw2.apply(this, arguments);
        if (!PT.length && !FALL.length && !BOLT) return;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        const L = sunLum();
        for (const p of PT) {
          const X = Math.round(p.x - camX),
            Y = Math.round(p.y - p.z - camY);
          if (X < -8 || X > VW + 8 || Y < -8 || Y > VH + 8) continue;
          if (p.k === 'kapok') {
            ctx.globalAlpha = 0.9 * L * Math.min(1, p.life);
            ctx.fillStyle = '#f4f1e6';
            ctx.fillRect(X, Y, 2, 2);
            ctx.fillStyle = '#fff';
            ctx.fillRect(X - 1, Y, 1, 1);
            ctx.fillRect(X + 2, Y + 1, 1, 1);
          } else if (p.k === 'leaf') {
            ctx.globalAlpha = L * Math.min(1, p.life);
            ctx.fillStyle = p.c;
            const fl = Math.sin(p.t * 7) > 0;
            ctx.fillRect(X, Y, fl ? 3 : 2, fl ? 2 : 3);
          } else if (p.k === 'frond') {
            ctx.globalAlpha = L;
            ctx.fillStyle = '#2f7a45';
            ctx.fillRect(X, Y, 5, 1);
            ctx.fillRect(X + 1, Y + 1, 3, 1);
            ctx.fillStyle = '#b9a24a';
            ctx.fillRect(X - 1, Y, 1, 1);
          } else if (p.k === 'ember') {
            ctx.globalAlpha = Math.min(1, p.life * 0.6);
            ctx.fillStyle = p.c;
            ctx.fillRect(X, Y, 1, 1);
          }
        }
        for (const f of FALL) {
          const X = Math.round(f.x - camX),
            Y = Math.round(f.y - camY),
            Zy = Math.round(f.y - f.z - camY);
          const k = 1 - clamp(f.z / f.z0, 0, 1); // sombra-aviso no chão cresce enquanto o fruto cai
          ctx.globalAlpha = 0.25 + 0.45 * k;
          ctx.fillStyle = k > 0.5 && ((performance.now() / 90) | 0) % 2 ? '#c0392b' : '#000';
          ctx.beginPath();
          ctx.ellipse(X, Y, 2 + 4 * k, 1 + 2 * k, 0, 0, 6.283);
          ctx.fill();
          ctx.globalAlpha = 1;
          if (f.k === 'buriti') {
            ctx.fillStyle = '#7a2a14';
            ctx.beginPath();
            ctx.arc(X, Zy - 2, 2.8, 0, 6.283);
            ctx.fill();
            ctx.fillStyle = '#d9692a';
            ctx.fillRect(X - 1, Zy - 4, 2, 2);
            ctx.fillStyle = '#f2a24a';
            ctx.fillRect(X - 2, Zy - 3, 1, 1);
          } else if (f.k === 'vagem') {
            ctx.fillStyle = '#6b4a22';
            ctx.fillRect(X - 4, Zy - 3, 8, 3);
            ctx.fillStyle = '#a8844a';
            ctx.fillRect(X - 3, Zy - 3, 6, 1);
            ctx.fillStyle = '#e9e4d0';
            ctx.fillRect(X + 2, Zy - 4, 2, 1);
          } else {
            ctx.fillStyle = '#4a2a14';
            ctx.beginPath();
            ctx.arc(X, Zy - 2, 3.4, 0, 6.283);
            ctx.fill();
            ctx.fillStyle = '#8a5a2a';
            ctx.fillRect(X - 1, Zy - 4, 2, 1);
          }
        }
        if (BOLT) {
          const b = BOLT,
            k = clamp(b.t / 0.28, 0, 1);
          ctx.globalAlpha = k;
          ctx.strokeStyle = '#f6f4ff';
          ctx.lineWidth = 2;
          ctx.beginPath();
          let px = b.x - camX,
            py = -10;
          ctx.moveTo(px, py);
          const ty = b.y - camY;
          const n = 9;
          for (let q = 1; q <= n; q++) {
            px = b.x - camX + Math.sin(q * 12.9 + b.seed) * 9 * (q < n ? 1 : 0);
            py = -10 + ((ty + 10) * q) / n;
            ctx.lineTo(px, py);
          }
          ctx.stroke();
          ctx.lineWidth = 1;
          ctx.strokeStyle = '#8fb4ff';
          ctx.stroke();
        }
        ctx.restore();
      },
  );
}

export { amzHPmax, spawnPT, visList };
