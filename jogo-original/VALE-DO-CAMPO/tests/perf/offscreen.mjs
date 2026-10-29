// Conta, por função, as chamadas fillRect/drawImage dentro da tela, na folga e FORA do retângulo de tiles do chão.
// Uso: NODE_PATH=$(npm root -g) node tests/perf/offscreen.mjs
import { launch, run } from '../browser/lib.mjs';
const { p, close } = await launch({ width: 960, height: 540 });
await p.waitForTimeout(3000);
await run(p, `gfx.res='2'; applyRes(); setQDrop(0); S.inside=false;`);
const spots = [[480,480],[300,300],[1000,700],[700,1200],[1200,400],[900,900],[1400,1300],[200,1000]];
const agg = {};
for (const [px, py] of spots) {
  const r = JSON.parse(await run(p, `(() => {
    S.px=${px}; S.py=${py}; S.vx=0; S.vy=0;
    for (let i=0;i<80;i++){ update(0.016); render(); }
    const c = mainCtx, W = c.canvas.width, H = c.canvas.height, stats = {};
    const camX = Math.round(Math.min(Math.max(S.px - VW / 2, 0), MW * TS - VW)), camY = Math.round(Math.min(Math.max(S.py - VH / 2, 0), MH * TS - VH));
    const AR0 = actRange(), X0 = Math.max(AR0[0], Math.floor(camX / TS) - 1), X1 = Math.min(AR0[1], Math.floor((camX + VW) / TS) + 1), Y0 = Math.max(0, Math.floor(camY / TS) - 1), Y1 = Math.min(MH - 1, Math.floor((camY + VH) / TS) + 1);
    const BL = (X0 * TS - camX) * RS, BR = ((X1 + 1) * TS - camX) * RS, BT = (Y0 * TS - camY) * RS, BB = ((Y1 + 1) * TS - camY) * RS;
    const who = () => { const s = new Error().stack.split('\\n'); for (let i=3;i<s.length;i++){ const m = s[i].match(/at (?:async )?([\\w$.<>]+) \\(/); if (m && !/^(Object\\.)?(eval|anonymous)$|^P\\.|^note$|^CanvasRenderingContext2D/.test(m[1])) return m[1]; } return '?'; };
    const note = (x, y, w, h) => {
      const t = c.getTransform();
      if (t.b || t.c || t.a === 0) return;
      const x0 = x*t.a + t.e, y0 = y*t.d + t.f, x1 = (x+w)*t.a + t.e, y1 = (y+h)*t.d + t.f;
      const lo = Math.min(x0,x1), hi = Math.max(x0,x1), lo2 = Math.min(y0,y1), hi2 = Math.max(y0,y1);
      const off = hi < 0 || hi2 < 0 || lo > W || lo2 > H;
      const far = hi < BL || hi2 < BT || lo > BR || lo2 > BB;
      const k = who(); const s = stats[k] || (stats[k] = { on:0, near:0, far:0 });
      far ? s.far++ : off ? s.near++ : s.on++;
    };
    const P = CanvasRenderingContext2D.prototype, f0 = P.fillRect, d0 = P.drawImage;
    P.fillRect = function(x,y,w,h){ if (this===c) note(x,y,w,h); return f0.call(this,x,y,w,h); };
    P.drawImage = function(img,...a){ if (this===c) { if (a.length>=8) note(a[4],a[5],a[6],a[7]); else if (a.length>=4) note(a[0],a[1],a[2],a[3]); else if (a.length>=2) note(a[0],a[1],img.width||0,img.height||0); } return d0.call(this,img,...a); };
    try { render(); } finally { P.fillRect = f0; P.drawImage = d0; }
    return JSON.stringify(stats);
  })()`));
  for (const [k, v] of Object.entries(r)) { const a = agg[k] || (agg[k] = { on: 0, near: 0, far: 0 }); a.on += v.on; a.near += v.near; a.far += v.far; }
}
const rows = Object.entries(agg).sort((a, b) => b[1].far - a[1].far).slice(0, 16);
let T = [0,0,0]; for (const v of Object.values(agg)) { T[0]+=v.on; T[1]+=v.near; T[2]+=v.far; }
console.log('total (dentro, folga<=1 tile, alem da folga):', T.join(' / '));
for (const [k, v] of rows) console.log(k.padEnd(22), String(v.on).padStart(6), String(v.near).padStart(6), String(v.far).padStart(6));
await close();
