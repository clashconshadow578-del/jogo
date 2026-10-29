/**
 * Mapa projetado do mundo 1000x1000 (relevo, rios, lagos, praia, montanhas, neve): carregamento de world.bin, descompressão (inflate próprio) e miniatura.
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

import { assetUrl } from '../utils/assets.js';

/* ============ MUNDO PROJETADO 1000x1000 (relevo, rios, lagos, praia, montanhas e neve) ============
   WORLD.T = classe de cada celula (0 mar fundo · 1 mar raso · 2 praia · 3 planicie · 4 colinas · 5 montanha · 6 neve ·
             7 rio · 8 lago · 9 brejo · 10 canal pluvial (leito seco) · 11 vau)
   WORLD.H = altura (quarto de unidade, +40) · WORLD.P = multiplicador de chuva (1/80) em blocos de 4x4.
   Cada instancia 100x100 e um recorte do mundo: celula (cx*100+x, cy*100+y). */
/* Decodificador do mundo (inflate enxuto + predicao de altura). Sem dependencias. */
function worldInflate(src, outLen) {
  const out = new Uint8Array(outLen);
  let ip = 0,
    op = 0,
    bb = 0,
    bc = 0;
  const bit = () => {
    if (!bc) {
      bb = src[ip++];
      bc = 8;
    }
    const v = bb & 1;
    bb >>= 1;
    bc--;
    return v;
  };
  const bits = (n) => {
    let v = 0;
    for (let i = 0; i < n; i++) v |= bit() << i;
    return v;
  };
  const mk = (len, n) => {
    const count = new Uint16Array(16),
      sym = new Uint16Array(n),
      offs = new Uint16Array(16);
    for (let i = 0; i < n; i++) count[len[i]]++;
    count[0] = 0;
    for (let i = 1; i < 15; i++) offs[i + 1] = offs[i] + count[i];
    for (let i = 0; i < n; i++) if (len[i]) sym[offs[len[i]]++] = i;
    return { count, sym };
  };
  const dec = (h) => {
    let code = 0,
      first = 0,
      index = 0;
    for (let l = 1; l <= 15; l++) {
      code |= bit();
      const c = h.count[l];
      if (code - c < first) return h.sym[index + (code - first)];
      index += c;
      first += c;
      first <<= 1;
      code <<= 1;
    }
    throw new Error('inflate: codigo invalido');
  };
  const LB = [
      3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258,
    ],
    LE = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0],
    DB = [
      1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145,
      8193, 12289, 16385, 24577,
    ],
    DE = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
  let fixedL = null,
    fixedD = null;
  const codes = (lh, dh) => {
    for (;;) {
      const s = dec(lh);
      if (s < 256) {
        out[op++] = s;
      } else if (s === 256) return;
      else {
        const i = s - 257,
          len = LB[i] + bits(LE[i]),
          ds = dec(dh),
          dist = DB[ds] + bits(DE[ds]);
        for (let k = 0; k < len; k++) {
          out[op] = out[op - dist];
          op++;
        }
      }
    }
  };
  let last;
  do {
    last = bit();
    const type = bits(2);
    if (type === 0) {
      bc = 0;
      const n = src[ip] | (src[ip + 1] << 8);
      ip += 4;
      for (let i = 0; i < n; i++) out[op++] = src[ip++];
    } else if (type === 1) {
      if (!fixedL) {
        const l = new Uint8Array(288);
        for (let i = 0; i < 144; i++) l[i] = 8;
        for (let i = 144; i < 256; i++) l[i] = 9;
        for (let i = 256; i < 280; i++) l[i] = 7;
        for (let i = 280; i < 288; i++) l[i] = 8;
        fixedL = mk(l, 288);
        const d = new Uint8Array(30).fill(5);
        fixedD = mk(d, 30);
      }
      codes(fixedL, fixedD);
    } else if (type === 2) {
      const nl = bits(5) + 257,
        nd = bits(5) + 1,
        nc = bits(4) + 4,
        ORD = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15],
        cl = new Uint8Array(19);
      for (let i = 0; i < nc; i++) cl[ORD[i]] = bits(3);
      const ch = mk(cl, 19),
        lens = new Uint8Array(nl + nd);
      let i = 0;
      while (i < nl + nd) {
        const s = dec(ch);
        if (s < 16) lens[i++] = s;
        else {
          let prev = 0,
            rep;
          if (s === 16) {
            prev = lens[i - 1];
            rep = 3 + bits(2);
          } else if (s === 17) rep = 3 + bits(3);
          else rep = 11 + bits(7);
          while (rep--) lens[i++] = prev;
        }
      }
      codes(mk(lens.subarray(0, nl), nl), mk(lens.subarray(nl), nd));
    } else throw new Error('inflate: bloco invalido');
  } while (!last);
  return out;
}

function worldDecode(z) {
  // z: bytes do arquivo world.bin
  const NW = 1000,
    NN = NW * NW,
    PN = 250 * 250,
    raw = worldInflate(z, NN * 3 + PN);
  const T = raw.subarray(0, NN),
    LO = raw.subarray(NN, NN * 2),
    HI = raw.subarray(NN * 2, NN * 3),
    P = raw.subarray(NN * 3, NN * 3 + PN);
  const H = new Uint16Array(NN);
  for (let y = 0; y < NW; y++)
    for (let x = 0; x < NW; x++) {
      const i = y * NW + x,
        l = x ? H[i - 1] : 0,
        u = y ? H[i - NW] : 0,
        zz = LO[i] | (HI[i] << 8);
      H[i] = ((l + u) >> 1) + ((zz >> 1) ^ -(zz & 1));
    }
  return { W: NW, T: T, H: H, P: P };
}

let WORLD = null;
/** Carrega public/assets/data/world.bin (deflate bruto) e decodifica o mundo 1000x1000. Chamado por main.js antes do boot. */
export async function loadWorldData(url = assetUrl('data/world.bin')) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Não foi possível carregar os dados do mundo (' + res.status + ' ' + url + ')');
  WORLD = worldDecode(new Uint8Array(await res.arrayBuffer()));
  return WORLD;
}

let _wmm = null;

function worldMM() {
  // miniatura do mundo inteiro (cada pixel = 5x5 tiles) para a tela de mapa
  if (_wmm) return _wmm;
  const c = document.createElement('canvas');
  c.width = c.height = 200;
  const g = c.getContext('2d'),
    im = g.createImageData(200, 200);
  const PAL = [
    [16, 62, 128],
    [44, 118, 186],
    [234, 216, 152],
    [156, 192, 104],
    [128, 158, 92],
    [136, 128, 120],
    [246, 249, 252],
    [46, 126, 206],
    [38, 106, 190],
    [104, 156, 128],
    [128, 176, 216],
    [170, 200, 215],
  ];
  for (let by = 0; by < 200; by++)
    for (let bx = 0; bx < 200; bx++) {
      let r = 0,
        gg = 0,
        b = 0,
        n = 0;
      for (let y = 0; y < 5; y++)
        for (let x = 0; x < 5; x++) {
          const p = PAL[WORLD.T[(by * 5 + y) * 1000 + bx * 5 + x]];
          r += p[0];
          gg += p[1];
          b += p[2];
          n++;
        }
      const o = (by * 200 + bx) * 4;
      im.data[o] = r / n;
      im.data[o + 1] = gg / n;
      im.data[o + 2] = b / n;
      im.data[o + 3] = 255;
    }
  g.putImageData(im, 0, 0);
  return (_wmm = c);
}

export { WORLD, worldDecode, worldInflate, worldMM };
