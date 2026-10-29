/**
 * Capturas do jogo real (laço rodando) com cercas, portão, prévia de construção, ovos e inventário.
 * Procura um terreno livre perto da fazenda e monta um cercado nele. Saída: env OUT (pasta).
 */
import { launch, run } from './lib.mjs';
const OUT = process.env.OUT || '.';
const { p, errs, close } = await launch({ width: 960, height: 540 });
const info = await run(p, `(() => {
  let best = null;
  const cx = 24, cy = 35;
  for (let y = 5; y < MH - 12; y++) for (let x = 5; x < MW - 16; x++) {
    let bad = 0;
    for (let yy = y - 1; yy <= y + 11; yy++) for (let xx = x - 1; xx <= x + 13; xx++) { const i = yy * MW + xx; if (ground[i] === WATER || ground[i] === FORD || ground[i] === BED) bad += 50; if (obj[i]) bad++; if (crops[i]) bad += 3; }
    const sc = bad + Math.hypot(x + 6 - cx, y + 4 - cy) * 0.6;
    if (!best || sc < best.sc) best = { x, y, sc, bad };
  }
  if (!best) return null;
  const X0 = best.x, Y0 = best.y, X1 = X0 + 11, Y1 = Y0 + 8;
  for (let yy = Y0 - 1; yy <= Y0 + 11; yy++) for (let xx = X0 - 1; xx <= X0 + 13; xx++) { const i = yy * MW + xx; if (ground[i] !== WATER && ground[i] !== FORD && ground[i] !== BED) ground[i] = GRASS; obj[i] = 0; delete crops[i]; }
  chx.length = 0; herd.length = 1; getEggs().length = 0; fox.length = 0;
  for (let x = X0; x <= X1; x++) { obj[Y0*MW+x] = FENCE; obj[Y1*MW+x] = FENCE; }
  for (let y = Y0; y <= Y1; y++) { obj[y*MW+X0] = FENCE; obj[y*MW+X1] = FENCE; }
  obj[Y1*MW+X0+5] = GATE; obj[(Y0+4)*MW+X1] = GATE_OPEN;
  for (let y = Y0 + 1; y <= Y0 + 5; y++) obj[y*MW+X0+7] = FENCE;      // divisória vertical
  for (let x = X1 + 2; x <= X1 + 4; x++) obj[(Y1+2)*MW+x] = FENCE;     // trecho solto
  obj[(Y1+2)*MW+X1+6] = FENCE;
  herd[0].x = (X0+3)*16; herd[0].y = (Y0+4)*16; herd[0].age = 500; herd[0].state = 'rest'; herd[0].t = 99;
  chx.push(mkChx({ x: (X0+9)*16, y: (Y0+3)*16, sex: 'f', age: CHX_ADULT + 1 }));
  chx.push(mkChx({ x: (X0+9)*16, y: (Y0+6)*16, sex: 'm', age: CHX_ADULT + 1 }));
  getEggs().push({ id: 1, x: (X0+3)*16+8, y: (Y0+6)*16+8, layT: worldMin(), hatchAt: worldMin() + 3*DAY_MIN, hen: 99 });
  getEggs().push({ id: 2, x: (X0+10)*16+8, y: (Y0+6)*16+8, layT: worldMin(), hatchAt: worldMin() + 0.2*DAY_MIN, hen: 99 });
  S.inside = false; S.min = 600; S.px = (X1+3)*16+8; S.py = (Y0+2)*16+8; S.fx = -1; S.fy = 0;
  S.inv.fence = 9; S.inv.gate = 3; S.inv.ovo = 4;
  S.sel = ITEMS.findIndex((it) => it.id === 'fence');
  return { X0, Y0, X1, Y1, bad: best.bad };
})()`);
console.log('pen:', JSON.stringify(info));
await p.waitForTimeout(2500);
await p.screenshot({ path: OUT + '/game-pen.png' });
await run(p, `S.sel = ITEMS.findIndex((it) => it.id === 'gate'); S.px = (${info.X0}+5)*16+8; S.py = (${info.Y1}+3)*16+8; S.fx = 0; S.fy = -1; 1`);
await p.waitForTimeout(1200);
await p.screenshot({ path: OUT + '/game-gate.png' });
console.log('erros:', errs.length ? errs : 'nenhum');
await close();
