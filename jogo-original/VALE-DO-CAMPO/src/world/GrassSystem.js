/**
 * Vegetação viva e persistente: a grama dobra, se desgasta e o solo compacta a cada passo (grade 4x4 por tile); trilhas duram dias, rebrota lenta, pegadas, poeira, lama e poças.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { GRASS, MH, MW, PATH, SOIL, TS } from '../config/constants.js';
import { extensible } from '../core/extensions.js';
import { frameNo } from '../core/GameLoop.js';
import { S } from '../core/GameState.js';
import { applyRes, ctx } from '../rendering/Canvas.js';
import { hash2, mixN, smooth } from '../utils/MathUtils.js';
import { climate } from './WeatherSystem.js';
import { actRange, ground } from './World.js';

// Vegetation simulation: 4x4 deformation cells per 16x16 terrain tile.
const GRASS_RES = 4,
  GW = MW * GRASS_RES,
  GH = MH * GRASS_RES;

let grassWear = new Uint8Array(GW * GH),
  grassBendX = new Int8Array(GW * GH),
  grassBendY = new Int8Array(GW * GH);

let soilCompact = new Uint8Array(GW * GH),
  grassGraze = new Uint8Array(GW * GH),
  grazeTick = 0;
const prints = [],
  dust = [],
  walkers = {};

let grassDirty = false,
  grassStepAccumulator = 0,
  npcPrevX = NaN,
  npcPrevY = NaN;

function gid(x, y) {
  const gx = Math.floor(x / GRASS_RES),
    gy = Math.floor(y / GRASS_RES);
  return gx < 0 || gy < 0 || gx >= GW || gy >= GH ? -1 : gy * GW + gx;
}

// Cada passo: dobra a grama, arranca cobertura (wear) e compacta o solo (soilCompact).
// Terreno úmido sofre mais; solo já nu compacta mais rápido; a vegetação perdida dá menos dano extra.
function pressGrass(wx, wy, dx, dy, weight = 1) {
  const cx = Math.floor(wx / GRASS_RES),
    cy = Math.floor(wy / GRASS_RES),
    mud = 1 + climate.wetness * 0.9;
  for (let oy = -2; oy <= 2; oy++)
    for (let ox = -2; ox <= 2; ox++) {
      const gx = cx + ox,
        gy = cy + oy;
      if (gx < 0 || gy < 0 || gx >= GW || gy >= GH) continue;
      const tx = Math.floor(gx / GRASS_RES),
        ty = Math.floor(gy / GRASS_RES);
      if (ground[ty * MW + tx] !== GRASS) continue;
      const d = Math.hypot(ox, oy),
        fall = Math.max(0, 1 - d / 2.7);
      if (fall <= 0) continue;
      const id = gy * GW + gx,
        w = grassWear[id];
      grassWear[id] = Math.min(255, w + Math.max(1, Math.round(9 * weight * mud * fall * (1 - (w / 255) * 0.55))));
      soilCompact[id] = Math.min(
        255,
        soilCompact[id] + Math.round(4 * weight * mud * fall * fall * (w > 60 ? 1.6 : 0.6)),
      );
      grassBendX[id] = Math.max(-110, Math.min(110, Math.round(dx * 90 * fall)));
      grassBendY[id] = Math.max(-110, Math.min(110, Math.round(dy * 90 * fall)));
    }
  grassDirty = true;
}

// Rebrota devagar; solo compactado quase não se recupera (trilhas duram várias "estações").
function recoverGrassDay() {
  const wetDay = climate.wetness > 0.35 ? 1.5 : 1;
  for (let i = 0; i < grassWear.length; i++) {
    const w = grassWear[i],
      c = soilCompact[i] / 255;
    if (w > 0) {
      const r = 11 * wetDay * (1 - c * 0.93);
      grassWear[i] = Math.max(0, w - (r >= 1 ? Math.round(r) : Math.random() < r ? 1 : 0));
    }
    if (soilCompact[i] > 0 && grassWear[i] < 30 && Math.random() < 0.35) soilCompact[i]--;
    grassBendX[i] = Math.round(grassBendX[i] * 0.3);
    grassBendY[i] = Math.round(grassBendY[i] * 0.3);
    if (grassGraze[i]) grassGraze[i] = Math.max(0, grassGraze[i] - 120);
  }
  grassDirty = true;
}

function relaxGrass(dt) {
  grassStepAccumulator += dt;
  if (grassStepAccumulator < 0.14) return;
  const damp = Math.pow(0.75, grassStepAccumulator / 0.14);
  grassStepAccumulator = 0;
  const gx0 = Math.max(0, Math.min(GW - 260, Math.floor(S.px / GRASS_RES) - 130)),
    gy0 = Math.max(0, Math.min(GH - 260, Math.floor(S.py / GRASS_RES) - 130));
  const ARg = actRange(),
    gxA = Math.max(gx0, ARg[0] * GRASS_RES),
    gxB = Math.min(gx0 + 260, (ARg[1] + 1) * GRASS_RES);
  for (let gy = gy0; gy < gy0 + 260; gy++)
    for (let i = gy * GW + gxA, e = gy * GW + gxB; i < e; i++) {
      if (grassBendX[i]) grassBendX[i] = Math.abs(grassBendX[i]) < 2 ? 0 : Math.round(grassBendX[i] * damp);
      if (grassBendY[i]) grassBendY[i] = Math.abs(grassBendY[i]) < 2 ? 0 : Math.round(grassBendY[i] * damp);
    }
}

// Quem anda (jogador, aldeã, vaca) pisa a cada ~3px percorridos e deixa pegadas.
function walkTrample(id, x, y, w, kind) {
  const p = walkers[id] || (walkers[id] = { x, y, d: 0, s: 0, side: 1, f: frameNo });
  p.f = frameNo;
  const dx = x - p.x,
    dy = y - p.y,
    dist = Math.hypot(dx, dy);
  p.x = x;
  p.y = y;
  if (dist < 0.01 || dist > 24) return;
  p.d += dist;
  p.s += dist;
  const nx = dx / dist,
    ny = dy / dist;
  if (p.d >= 3) {
    pressGrass(x, y, nx, ny, w);
    p.d = 0;
  }
  if (p.s >= (kind === 'cow' ? 9 : 7)) {
    p.s = 0;
    p.side = -p.side;
    addPrint(x, y, nx, ny, p.side, kind);
  }
}

function addPrint(x, y, nx, ny, side, kind) {
  const i = gid(x, y);
  if (i < 0) return;
  const tile = ground[Math.floor(y / TS) * MW + Math.floor(x / TS)],
    w = grassWear[i] / 255,
    wt = climate.wetness;
  const soft = tile === SOIL ? 1 : tile === GRASS ? (w > 0.3 ? 1 : wt > 0.35 && w > 0.1 ? 0.6 : 0) : wt > 0.4 ? 0.5 : 0;
  if (soft > 0) {
    prints.push({
      x: x - ny * side * 2,
      y: y + nx * side * 1.5,
      h: Math.abs(nx) > Math.abs(ny),
      k: kind,
      s: soft,
      t: 0,
      life: (wt > 0.35 ? 80 : 40) * soft,
    });
    if (prints.length > 180) prints.shift();
  }
  if (wt < 0.25 && (w > 0.5 || tile === PATH) && kind !== 'n') {
    dust.push({
      x,
      y: y - 1,
      vx: (Math.random() - 0.5) * 7 - nx * 3,
      vy: -3 - Math.random() * 4,
      t: 0,
      r: 1 + Math.random() * 1.4,
    });
    if (dust.length > 50) dust.shift();
  }
}

function updateTrail(dt) {
  grazeTick += dt;
  if (grazeTick > 3) {
    grazeTick = 0;
    for (const k in walkers) if (frameNo - walkers[k].f > 1800) delete walkers[k]; // bichos que sumiram (mortos, outra região)
    for (let i = 0; i < grassGraze.length; i++) if (grassGraze[i]) grassGraze[i]--;
  }
  for (let i = prints.length - 1; i >= 0; i--) {
    const p = prints[i];
    p.t += dt * (1 + climate.rain * 3);
    if (p.t > p.life) prints.splice(i, 1);
  }
  for (let i = dust.length - 1; i >= 0; i--) {
    const d = dust[i];
    d.t += dt;
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    d.vy *= 0.96;
    d.vx *= 0.97;
    if (d.t > 0.9) dust.splice(i, 1);
  }
}

const drawPrints = extensible(function drawPrints() {
  const mud = climate.wetness > 0.35;
  for (const p of prints) {
    const a = (1 - p.t / p.life) * (mud ? 0.5 : 0.34) * p.s,
      x = Math.round(p.x),
      y = Math.round(p.y);
    ctx.fillStyle = mud ? `rgba(44,28,18,${a})` : `rgba(104,74,44,${a})`;
    if (p.k === 'cow') {
      ctx.fillRect(x - 1, y, 1, 2);
      ctx.fillRect(x + 1, y, 1, 2);
    } else if (p.h) ctx.fillRect(x - 1, y, 3, 2);
    else ctx.fillRect(x, y - 1, 2, 3);
    if (mud && p.k !== 'cow') {
      ctx.fillStyle = `rgba(180,195,205,${a * 0.35})`;
      ctx.fillRect(x, y + (p.h ? 2 : 2), 1, 1);
    }
  }
});

function drawDust() {
  for (const d of dust) {
    ctx.fillStyle = `rgba(206,180,134,${0.32 * (1 - d.t / 0.9)})`;
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r * (1 + d.t * 1.4), 0, 6.283);
    ctx.fill();
  }
}

/* ===== O chão já não tem lâminas de grama =====
 * O "mato" do jogo agora é feito das plantas amazônicas (helicônia e samambaia, ver world/Vegetation.js); a textura do
 * chão fica lisa. Aqui sobrou só o que é do SOLO: o pisoteio desgasta a cobertura e deixa terra batida, lama e poças.
 * A simulação (desgaste, dobra, pasto) segue igual, porque o pisoteio mata o mato e a vaca pasta por ela. */
const IDLE_WIND_MAX = 1.2; // acima disso o vento era forte; ficou só como critério de "tile parado" dos outros módulos
let idleForce = null;
const Q_IDLE = /[?&]idle\b/.test(location.search),
  Q_NOIDLE = /[?&](noidle|safe)\b/.test(location.search);
function setIdleOff(v) {
  idleForce = !!v;
}
const idleGrassEnabled = () => !idleOff();
const idleOff = () => (idleForce !== null ? idleForce : Q_NOIDLE || (!Q_IDLE && applyRes.mob !== true));

// Tile "parado": nenhuma célula com desgaste, dobra ou pasto relevante (pasto <= 6 não muda o desenho).
function tileIdle(tx, ty) {
  for (let sy = 0; sy < GRASS_RES; sy++)
    for (let sx = 0, id = (ty * GRASS_RES + sy) * GW + tx * GRASS_RES; sx < GRASS_RES; sx++, id++)
      if (grassWear[id] !== 0 || grassBendX[id] !== 0 || grassBendY[id] !== 0 || grassGraze[id] > 6) return false;
  return true;
}

/** O tile está "parado" (sem pisoteio, dobra ou pasto) e o vento é fraco? Independe do modo de desenho (PC ou celular). */
function tileStill(tx, ty) {
  return climate.wind < IDLE_WIND_MAX && tileIdle(tx, ty);
}

/** O tile pode usar o desenho parado (e o TileRenderer pode fundi-lo com a textura do chão)? */
function idleGrassTile(tx, ty) {
  if (idleOff()) return false;
  return climate.wind < IDLE_WIND_MAX && tileIdle(tx, ty);
}

// O TileRenderer já desenhou este tile junto com a textura: drawTrampledGrass não repete.
let fusedTile = -1;
function markFusedTile(i) {
  fusedTile = i;
}

// Estágios do solo pisoteado: cobertura gasta -> terra exposta -> trilha compactada (clara, lisa) | com chuva: lama, poças, marcas.
function drawTrampledGrass(tx, ty, t) {
  if (ground[ty * MW + tx] !== GRASS) return;
  if (fusedTile === ty * MW + tx) {
    fusedTile = -1;
    return;
  }
  if (tileIdle(tx, ty)) return; // nada pisado aqui: só a textura do chão
  const x = tx * TS,
    y = ty * TS,
    wt = climate.wetness,
    mw = smooth(0.12, 0.7, wt);
  for (let sy = 0; sy < GRASS_RES; sy++)
    for (let sx = 0; sx < GRASS_RES; sx++) {
      const gx = tx * GRASS_RES + sx,
        gy = ty * GRASS_RES + sy,
        id = gy * GW + gx;
      const wear = grassWear[id] / 255,
        cp = soilCompact[id] / 255;
      const jitter = hash2(gx, gy),
        px0 = x + sx * 4,
        py0 = y + sy * 4;
      if (wear > 0.3 + jitter * 0.38) {
        const j2 = hash2(gx + 91, gy - 37),
          k = (jitter - 0.5) * 14;
        // terra de trilha: marrom-terra (não clareia demais sob sol e neblina), mais clara só quando bem compactada
        const r0 = mixN(118, 168, cp),
          g0 = mixN(88, 130, cp),
          b0 = mixN(56, 86, cp);
        ctx.fillStyle = `rgb(${(mixN(r0, r0 * 0.48 + 10, mw) + k) | 0},${(mixN(g0, g0 * 0.46 + 6, mw) + k * 0.8) | 0},${(mixN(b0, b0 * 0.5 + 4, mw) + k * 0.6) | 0})`;
        const edge = wear - (0.3 + jitter * 0.38);
        if (edge < 0.1) {
          // borda da trilha: só alguns pedaços de 2x2 (mais quanto mais gasto), em vez de um quadrado reto de 4x4
          const keep = 0.3 + (edge / 0.1) * 0.7;
          for (let q = 0; q < 4; q++)
            if (hash2(gx * 2 + (q & 1) + 11, gy * 2 + (q >> 1) - 5) < keep)
              ctx.fillRect(px0 + (q & 1) * 2, py0 + (q >> 1) * 2, 2, 2);
        } else ctx.fillRect(px0, py0, 4, 4);
        if (j2 < 0.3) {
          ctx.fillStyle = 'rgba(52,34,20,.3)';
          ctx.fillRect(px0 + (((j2 * 40) | 0) % 3), py0 + (((j2 * 90) | 0) % 3), 2, 1);
        } // textura da terra
        if (j2 > 0.86) {
          ctx.fillStyle = mw > 0.4 ? 'rgba(40,26,16,.5)' : 'rgba(190,164,126,.5)';
          ctx.fillRect(px0 + 1 + (((j2 * 7) | 0) % 2), py0 + 1, 1, 1);
        } // pedrinhas
        if (mw > 0.5 && j2 > 0.6 && j2 < 0.75) {
          ctx.fillStyle = 'rgba(200,215,225,.22)';
          ctx.fillRect(px0, py0 + 1, 2, 1);
        } // brilho de lama
        if (wt < 0.05 && cp > 0.7 && j2 < 0.1) {
          ctx.fillStyle = 'rgba(70,48,28,.45)';
          ctx.fillRect(px0, py0 + 2, 3, 1);
        } // rachaduras do solo seco
        if (wt > 0.45 && cp > 0.5 && wear > 0.6 && hash2(gx >> 1, gy >> 1) < (wt - 0.45) * 1.7) {
          // poças em solo compactado
          ctx.fillStyle = 'rgba(84,126,158,.58)';
          ctx.fillRect(px0, py0 + 1, 4, 3);
          ctx.fillStyle = 'rgba(224,238,248,.38)';
          ctx.fillRect(px0 + 1, py0 + 1, 2, 1);
          if (climate.rain > 0.2 && ((frameNo >> 3) + gx * 7 + gy * 3) % 11 === 0) {
            ctx.fillStyle = 'rgba(235,245,255,.5)';
            ctx.fillRect(px0 + 1, py0 + 2, 2, 1);
          }
        }
        continue;
      }
      if (wear > 0.16) {
        ctx.fillStyle = `rgba(${mw > 0.4 ? '58,50,28' : '76,88,37'},${Math.min(0.58, wear * 0.48)})`;
        ctx.fillRect(px0, py0 + 3, 4, 2); // cobertura já gasta: o chão escurece antes de virar terra
      }
    }
}

let trailFade = 0,
  fadeSlice = 0; // trilhas e pegadas somem sozinhas com o tempo (~3 min se ninguém pisar de novo)

function fadeTrails(dt) {
  trailFade += dt;
  if (trailFade < 0.25) return;
  trailFade = 0;
  fadeSlice = (fadeSlice + 1) & 7; // 1/8 do mapa por vez (cada célula é visitada a cada 2s, como antes)
  const wf = climate.wetness > 0.35 ? 1.4 : 1,
    nW = grassWear.length,
    fa = (nW >> 3) * fadeSlice,
    fb = fadeSlice === 7 ? nW : (nW >> 3) * (fadeSlice + 1);
  for (let i = fa; i < fb; i++) {
    const w = grassWear[i];
    if (!w) continue;
    const r = Math.max(1, Math.round(3 * wf * (1 - (soilCompact[i] / 255) * 0.6)));
    grassWear[i] = w > r ? w - r : 0;
    if (w < 40 && soilCompact[i]) soilCompact[i]--;
  }
}

/** Atualiza `grassDirty` a partir de outros módulos (as ligações importadas são somente leitura). */
export function setGrassDirty(value) {
  grassDirty = value;
  return value;
}

export {
  setIdleOff,
  GH,
  GRASS_RES,
  GW,
  drawDust,
  drawPrints,
  drawTrampledGrass,
  dust,
  fadeTrails,
  gid,
  grassBendX,
  grassBendY,
  grassDirty,
  grassGraze,
  grassWear,
  idleGrassEnabled,
  idleGrassTile,
  tileStill,
  markFusedTile,
  prints,
  recoverGrassDay,
  relaxGrass,
  soilCompact,
  updateTrail,
  walkTrample,
};
