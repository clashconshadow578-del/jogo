/**
 * O desenho parado da grama no computador (Path2D por tile) tem de dar os MESMOS pixels da camada pré-desenhada
 * do celular (idleLayer) e, portanto, do desenho completo. Compara tile a tile sobre fundo liso.
 * Uso: NODE_PATH=$(npm root -g) node tests/browser/grass-idle-paths.mjs
 */
import { launch, run, ok, failures } from './lib.mjs';
const { p, errs, close } = await launch({ width: 960, height: 540 });
await p.waitForTimeout(2500);
const r = JSON.parse(
  await run(p, `(() => {
  gfx.res = '2'; applyRes(); setQDrop(0);
  let tested = 0, bad = 0;
  for (let ty = 0; ty < MH && tested < 300; ty += 3) for (let tx = 0; tx < MW && tested < 300; tx += 3) {
    if (ground[ty * MW + tx] !== GRASS) continue;
    let idle = true;
    for (let sy = 0; sy < GRASS_RES && idle; sy++) for (let sx = 0, id = (ty * GRASS_RES + sy) * GW + tx * GRASS_RES; sx < GRASS_RES; sx++, id++)
      if (grassWear[id] !== 0 || grassBendX[id] !== 0 || grassBendY[id] !== 0 || grassGraze[id] > 6) { idle = false; break; }
    if (!idle) continue;
    const grab = (off) => { setIdleOff(off); ctx.fillStyle = '#808080'; ctx.fillRect(tx * TS, ty * TS, TS, TS); drawTrampledGrass(tx, ty, 0);
      const m = ctx.getTransform(); return Array.from(ctx.getImageData(Math.round(tx * TS * m.a + m.e), Math.round(ty * TS * m.d + m.f), Math.round(TS * m.a), Math.round(TS * m.d)).data).join(','); };
    const a = grab(false), b = grab(true);
    tested++; if (a !== b) bad++;
  }
  setIdleOff(false); setIdleOff(null);
  return JSON.stringify({ tested, bad });
})()`),
);
ok(r.tested > 50, `tiles parados testados: ${r.tested}`);
ok(r.bad === 0, `Path2D igual à camada pré-desenhada (diferentes: ${r.bad})`);
ok(errs.length === 0, 'sem erros no console ' + errs.join(' | '));
await close();
process.exit(failures() ? 1 : 0);
