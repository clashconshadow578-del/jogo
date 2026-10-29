/**
 * Compactação dos saves: RLE de zeros + base64 e quantização de arrays em 0..255 (formato usado pelo localStorage desde a V19).
 *
 * Origem: Vale_do_Campo_V64.html (s02)
 */

/* --- compactação (RLE de zeros + base64): o mundo grande cabe no localStorage --- */
function b64(u8) {
  let t = '';
  for (let i = 0; i < u8.length; i += 8192) t += String.fromCharCode.apply(null, u8.subarray(i, i + 8192));
  return btoa(t);
}

function rleEnc(a) {
  const n = a.length,
    o = new Uint8Array(n * 2 + 2);
  let i = 0,
    p = 0;
  while (i < n) {
    const v = a[i];
    if (v === 0) {
      let j = i;
      while (j < n && a[j] === 0 && j - i < 255) j++;
      o[p++] = 0;
      o[p++] = j - i;
      i = j;
    } else {
      o[p++] = v;
      i++;
    }
  }
  return b64(o.subarray(0, p));
}

function rleDec(str, len) {
  const bin = atob(str),
    u = new Uint8Array(len);
  let o = 0;
  for (let i = 0; i < bin.length && o < len; ) {
    const v = bin.charCodeAt(i++);
    if (v === 0) o += bin.charCodeAt(i++);
    else u[o++] = v;
  }
  return u;
}

function pk(a, sc = 255) {
  const u = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) {
    const v = Math.round(a[i] * sc);
    u[i] = v < 0 ? 0 : v > 255 ? 255 : v;
  }
  return rleEnc(u);
}

function upk(str, out, sc = 255) {
  const u = rleDec(str, out.length);
  for (let i = 0; i < out.length; i++) out[i] = u[i] / sc;
}

function pkE(a) {
  const u = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) {
    const v = Math.round((a[i] + 0.3) * 283);
    u[i] = v < 0 ? 0 : v > 255 ? 255 : v;
  }
  return rleEnc(u);
}

function upkE(str, out) {
  const u = rleDec(str, out.length);
  for (let i = 0; i < out.length; i++) out[i] = u[i] / 283 - 0.3;
}

export { pk, pkE, rleDec, rleEnc, upk, upkE };
