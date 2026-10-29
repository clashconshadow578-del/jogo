/**
 * Funções matemáticas puras: hash determinístico 2D, smoothstep e interpolação.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

function hash2(x, y) {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function smooth(a, b, v) {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/* ============ PERSISTENT GRASS / SOIL COMPACTION ============ */
// Wear is a lasting trampling record; bend is a short-lived directional displacement.
// This is an intentionally stylized mechanical approximation, not a biological simulator.
function mixN(a, b, t) {
  return a + (b - a) * t;
}

export { hash2, mixN, smooth };
