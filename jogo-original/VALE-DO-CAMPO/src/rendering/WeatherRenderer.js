/**
 * Desenho do clima: nuvens, escurecimento por nebulosidade e umidade, gotas, poças e respingos.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { VH, VW } from '../config/constants.js';
import { gfx } from '../config/settings.js';
import { extensible } from '../core/extensions.js';
import { ctx } from './Canvas.js';
import { rainDraw } from '../world/RainSystem.js';
import { climate, clouds } from '../world/WeatherSystem.js';

const drawWeather = extensible(function drawWeather(t, camX, camY) {
  const rain = climate.rain,
    wet = climate.wetness;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (const c of clouds) {
    const x = c.x - camX,
      y = c.y - camY,
      R = c.r * 1.5;
    if (x < -R || x > VW + R || y < -R || y > VH + R) continue;
    const g = ctx.createRadialGradient(x, y, R * 0.1, x, y, R);
    g.addColorStop(0, `rgba(62,74,90,${0.28 * c.pw})`);
    g.addColorStop(0.6, `rgba(78,90,106,${0.15 * c.pw})`);
    g.addColorStop(1, 'rgba(90,100,115,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - R, y - R, 2 * R, 2 * R);
  }
  if (climate.cloud > 0.02) {
    ctx.fillStyle = `rgba(54,70,91,${climate.cloud * 0.23})`;
    ctx.fillRect(0, 0, VW, VH);
  }
  if (wet > 0.03) {
    ctx.fillStyle = `rgba(31,58,77,${wet * 0.11})`;
    ctx.fillRect(0, 0, VW, VH);
  }
  rainDraw(camX, camY, t);
  ctx.restore();
});

function drawLightning() {
  return;
  if (climate.flash <= 0 || !gfx.flashes) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = `rgba(208,225,255,${Math.min(0.58, climate.flash * 0.45)})`;
  ctx.fillRect(0, 0, VW, VH);
  ctx.restore();
}

export { drawLightning, drawWeather };
