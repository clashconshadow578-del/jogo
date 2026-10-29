/**
 * Ruído de valor suave (vnoise) usado na geração de florestas e relevo.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { hash2 } from './MathUtils.js';

function vnoise(x, y, s, k) {
  const sx = x / s,
    sy = y / s,
    x0 = Math.floor(sx),
    y0 = Math.floor(sy),
    fx = sx - x0,
    fy = sy - y0,
    u = fx * fx * (3 - 2 * fx),
    v = fy * fy * (3 - 2 * fy);
  const a = hash2(x0 + k * 91, y0 + k * 57),
    b = hash2(x0 + 1 + k * 91, y0 + k * 57),
    c = hash2(x0 + k * 91, y0 + 1 + k * 57),
    d = hash2(x0 + 1 + k * 91, y0 + 1 + k * 57);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

export { vnoise };
