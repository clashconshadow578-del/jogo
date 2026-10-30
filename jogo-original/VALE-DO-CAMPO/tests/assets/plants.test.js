// As plantas do mato (helicônia e samambaia, 4 fases cada): os 8 PNGs precisam existir, ter fundo transparente de
// verdade (RGBA com bordas transparentes, sem xadrez gravado) e crescer de uma fase para a seguinte.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { ESCALA_FASE, FASE, HEL, PLANTS, SAM, plantBlurb, plantSpriteScale, plantStage } from '../../src/config/plants.js';

const dir = fileURLToPath(new URL('../../public/assets/sprites/plants/', import.meta.url));

function readAlpha(file) {
  const buf = fs.readFileSync(file);
  assert.equal(buf.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'assinatura PNG');
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  assert.equal(buf[24], 8);
  assert.equal(buf[25], 6, 'esperado RGBA');
  const chunks = [];
  for (let o = 8; o < buf.length; ) {
    const len = buf.readUInt32BE(o), name = buf.toString('latin1', o + 4, o + 8);
    if (name === 'IDAT') chunks.push(buf.subarray(o + 8, o + 8 + len));
    o += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(chunks));
  const stride = w * 4, px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? px[y * stride + x - 4] : 0, b = y ? px[(y - 1) * stride + x] : 0, c = x >= 4 && y ? px[(y - 1) * stride + x - 4] : 0;
      let v = row[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[y * stride + x] = v & 255;
    }
  }
  let opaque = 0, clear = 0;
  for (let i = 3; i < px.length; i += 4) px[i] === 255 ? opaque++ : px[i] === 0 ? clear++ : 0;
  return { w, h, opaque, clear, total: w * h, corner: px[3] };
}

test('plantas: 8 sprites RGBA com fundo transparente e alfa só 0/255', () => {
  for (const sp of [HEL, SAM])
    for (let f = 1; f <= 4; f++) {
      const r = readAlpha(dir + `${PLANTS[sp].sprites}_${f}.png`);
      assert.equal(r.corner, 0, `${PLANTS[sp].id} fase ${f}: canto deve ser transparente`);
      assert.equal(r.opaque + r.clear, r.total, `${PLANTS[sp].id} fase ${f}: sem meios-tons de alfa (pixel art nítida)`);
      assert.ok(r.opaque > r.total * 0.2 && r.clear > 0, `${PLANTS[sp].id} fase ${f}: tem planta e tem fundo`);
    }
});

test('plantas: cada fase é maior que a anterior', () => {
  for (const sp of [HEL, SAM]) {
    let prev = 0;
    for (let f = 1; f <= 4; f++) {
      const r = readAlpha(dir + `${PLANTS[sp].sprites}_${f}.png`);
      assert.ok(r.opaque > prev, `${PLANTS[sp].id} fase ${f} deve ter mais pixels que a ${f - 1}`);
      prev = r.opaque;
    }
  }
});

test('plantas: fases pelo mato e dados da vida real completos', () => {
  assert.equal(plantStage(0), 0);
  assert.equal(plantStage(FASE[0]), 0);
  assert.equal(plantStage(FASE[0] + 1), 1);
  assert.equal(plantStage(FASE[1]), 2);
  assert.equal(plantStage(FASE[2]), 3);
  assert.equal(plantStage(255), 4);
  for (const sp of [HEL, SAM]) {
    const p = PLANTS[sp];
    for (const k of ['nutrientes', 'habitat', 'crescimento', 'vida', 'cadeia']) assert.ok(p.real[k]?.length > 20, `${p.id}.${k}`);
    assert.ok(p.ritmo > 0 && p.palatavel > 0 && p.palatavel <= 1);
  }
  assert.ok(PLANTS[HEL].ritmo > PLANTS[SAM].ritmo, 'a helicônia cresce mais rápido que a samambaia');
  assert.ok(PLANTS[HEL].florescerMorre > 0 && PLANTS[SAM].florescerMorre === 0, 'só o caule da helicônia morre depois de florir');
  assert.match(plantBlurb(HEL, 4), /Helicônia/);
  assert.equal(plantBlurb(0, 2), '');
});

test('plantas: as fases 3 e 4 das duas espécies são 15% maiores; as outras sprites não mudam', () => {
  assert.deepEqual(ESCALA_FASE, [1, 1, 1, 1.15, 1.15]);
  for (const e of ['helikonia', 'samambaia']) {
    assert.equal(plantSpriteScale(`${e}_1`), 1);
    assert.equal(plantSpriteScale(`${e}_2`), 1);
    assert.equal(plantSpriteScale(`${e}_3`), 1.15);
    assert.equal(plantSpriteScale(`${e}_4`), 1.15);
  }
  for (const outro of ['house', 'rock27', 'plant', 'helikonia_5', 'xhelikonia_3']) assert.equal(plantSpriteScale(outro), 1, outro);
});
