/**
 * Cache do chão em blocos: a opção do menu liga/desliga, troca de dia e andança não geram erros, e o quadro com o cache
 * ligado é parecido com o quadro sem cache (teste de sanidade; a igualdade exata é conferida em tests/perf/posgrid.mjs).
 * Uso: NODE_PATH=$(npm root -g) node tests/browser/terrain-chunks.mjs
 */
import { launch, run, ok, failures } from './lib.mjs';
const { p, errs, close } = await launch({ width: 960, height: 540 });
await p.waitForTimeout(2500);
await run(p, "gfx.res='2'; applyRes(); setQDrop(0); S.inside=false; S.px=500; S.py=500; S.vx=0; S.vy=0");
const grab = (n) => run(p, `render(); const c = document.getElementById('c'); globalThis.${n} = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; 1`);
// fração de pixels que diferem muito entre dois quadros (relógio real: água, vento e animais se mexem, então há um ruído de base)
const cmp = (a, b) => run(p, `let n = 0, t = ${a}.length / 4; for (let i = 0; i < ${a}.length; i += 4) if (Math.max(Math.abs(${a}[i]-${b}[i]),Math.abs(${a}[i+1]-${b}[i+1]),Math.abs(${a}[i+2]-${b}[i+2])) > 8) n++; n / t`);
const steps = (n) => run(p, `for (let i = 0; i < ${n}; i++) { update(0.016); render(); } 1`);
await steps(30);
await grab('__A');
await steps(40);
await grab('__B'); // sem cache, 40 passos depois: o ruído de base
const noise = await cmp('__A', '__B');
await p.evaluate(() => { const b = document.getElementById('chunks'); b.checked = true; b.dispatchEvent(new Event('change')); });
ok(await run(p, 'gfx.chunks === true'), 'opção do menu liga o cache');
await steps(40);
await grab('__C');
const frac = await cmp('__B', '__C');
ok(frac <= noise + 0.05, `com cache: ${(frac * 100).toFixed(1)}% dos pixels diferem muito do quadro sem cache (ruído de base sem cache: ${(noise * 100).toFixed(1)}%; igualdade exata em tests/perf/posgrid.mjs)`);
await run(p, 'S.day += 1; for (let i=0;i<120;i++){ update(0.016); render(); }');
await run(p, "keys['d']=true; for (let i=0;i<120;i++){ update(0.016); render(); } keys['d']=false");
await p.evaluate(() => { const b = document.getElementById('chunks'); b.checked = false; b.dispatchEvent(new Event('change')); });
for (let i = 0; i < 20; i++) await run(p, 'update(0.016); render()');
ok(await run(p, 'gfx.chunks === false'), 'opção do menu desliga o cache');
ok(errs.length === 0, 'sem erros no console ' + errs.join(' | '));
await close();
process.exit(failures() ? 1 : 0);
