// A textura do chão (grama) precisa ser um PNG RGB cujo lado seja múltiplo do tile (16 px),
// pois TileRenderer.drawTile usa (tx % lado) e (ty % lado) para escolher o pedaço de cada tile.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const file = fileURLToPath(new URL('../../public/assets/sprites/ground/grass.png', import.meta.url));
const TS = 16;

function readPng(buf) {
  assert.equal(buf.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'assinatura PNG');
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20), depth = buf[24], type = buf[25];
  assert.equal(depth, 8);
  assert.equal(type, 2, 'esperado RGB sem alfa');
  const chunks = [];
  for (let o = 8; o < buf.length; ) {
    const len = buf.readUInt32BE(o), name = buf.toString('latin1', o + 4, o + 8);
    if (name === 'IDAT') chunks.push(buf.subarray(o + 8, o + 8 + len));
    o += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(chunks));
  const bpp = 3, stride = w * bpp, px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[y * stride + x - bpp] : 0, b = y ? px[(y - 1) * stride + x] : 0, c = x >= bpp && y ? px[(y - 1) * stride + x - bpp] : 0;
      let v = row[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[y * stride + x] = v & 255;
    }
  }
  return { w, h, px };
}

test('grass.png: quadrado, lado múltiplo do tile', () => {
  const { w, h } = readPng(fs.readFileSync(file));
  assert.equal(w, h);
  assert.equal(w % TS, 0);
  assert.ok(w >= 128, 'textura grande o bastante para não repetir demais');
});

test('grass.png: emenda sem salto (a borda esquerda/direita e a de cima/baixo se encaixam)', () => {
  const { w, h, px } = readPng(fs.readFileSync(file));
  const at = (x, y) => [px[(y * w + x) * 3], px[(y * w + x) * 3 + 1], px[(y * w + x) * 3 + 2]];
  const d = (p, q) => Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]);
  let seam = 0, inner = 0;
  for (let i = 0; i < w; i++) {
    seam += d(at(w - 1, i), at(0, i)) + d(at(i, h - 1), at(i, 0));
    inner += d(at(w / 2 - 1, i), at(w / 2, i)) + d(at(i, h / 2 - 1), at(i, h / 2));
  }
  // a diferença média na emenda não pode ser bem maior que a de dois pixels vizinhos quaisquer
  assert.ok(seam <= inner * 1.5, `emenda ${seam} vs interior ${inner}`);
});

test('grass.png: poucas cores (pixel art) e sem transparência', () => {
  const { px } = readPng(fs.readFileSync(file));
  const set = new Set();
  for (let i = 0; i < px.length; i += 3) set.add((px[i] << 16) | (px[i + 1] << 8) | px[i + 2]);
  assert.ok(set.size <= 16, `cores distintas: ${set.size}`);
});
