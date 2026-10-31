/**
 * Sumaúma gigante: 5% das sumaúmas são 30% maiores (config/sumaumaGigante.js, features/amazon/AmazonTrees.js).
 * Uso: NODE_PATH=$(npm root -g) node tests/browser/sumauma-gigante.mjs
 */
import { launch, run, ok, failures } from './lib.mjs';

const { p, close, errs } = await launch({ width: 960, height: 540 });
const J = async (code) => JSON.parse(await run(p, `JSON.stringify(${code})`));

await p.waitForFunction(() => window.VDC.run(`M.sumauma.every((m) => m.ready)`), null, { timeout: 30000 }).catch(() => {});

// 1) a frequência: 5% das sumaúmas (sorteio pela posição) e só sumaúma
const f = await J(`(() => {
  let n = 0, g = 0, gb = 0, gc = 0;
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    n++;
    if (new AmzArvore(x, y, 'sumauma').gig) g++;
    if (new AmzArvore(x, y, 'buriti').gig) gb++;
    if (new AmzArvore(x, y, 'castanheira').gig) gc++;
  }
  const a = new AmzArvore(7, 9, 'sumauma'), b = new AmzArvore(7, 9, 'sumauma');
  return { n, g, gb, gc, estavel: a.gig === b.gig };
})()`);
ok(f.g / f.n > 0.035 && f.g / f.n < 0.065, `5% das sumaúmas são gigantes (${f.g} de ${f.n} posições, ${((100 * f.g) / f.n).toFixed(1)}%)`);
ok(f.gb === 0 && f.gc === 0, 'buriti e castanheira nunca são gigantes');
ok(f.estavel, 'a mesma posição dá sempre o mesmo resultado (não precisa ir para o save)');

// 2) o tamanho: 30% maior nas fases adultas, igual nas fases pequenas
const t = await J(`(() => {
  const gx = (() => { for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (new AmzArvore(x, y, 'sumauma').gig) return [x, y]; })();
  const nx = (() => { for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (!new AmzArvore(x, y, 'sumauma').gig) return [x, y]; })();
  const out = [];
  for (let st = 1; st <= 7; st++) {
    const g = new AmzArvore(gx[0], gx[1], 'sumauma'), n = new AmzArvore(nx[0], nx[1], 'sumauma');
    g.g = n.g = SP.sumauma.ages[Math.min(5, st - 1)] + 1; g.fr = n.fr = st === 7 ? 1 : 0; g.refresh(); n.refresh();
    const mg = g.model(), mn = n.model();
    out.push({ st: g.st, hG: mg.h, hN: mn.h, wG: mg.w, wN: mn.w, imgH: mg.img.height, silH: mg.silC.height, cbG: mg.cbRow, cbN: mn.cbRow, reachG: mg.reach, reachN: mn.reach, gig: !!mg.gig });
  }
  return out;
})()`);
for (const r of t) {
  if (r.st >= 3) {
    ok(Math.abs(r.hG - Math.round(r.hN * 1.3)) <= 1 && Math.abs(r.wG - Math.round(r.wN * 1.3)) <= 1, `fase ${r.st}: ${r.wN}x${r.hN} vira ${r.wG}x${r.hG} (30% maior)`);
    ok(r.imgH === r.hG && r.silH === r.cbG + 2 && r.gig, `fase ${r.st}: o desenho e a sombra têm o tamanho novo`);
  } else ok(r.hG === r.hN && r.wG === r.wN && !r.gig, `fase ${r.st}: muda e broto de sumaúma gigante são iguais aos das outras (${r.wN}x${r.hN})`);
}

// 3) as outras regras que dependem do tamanho acompanham (luz que ela tira das vizinhas, alcance da copa)
const r7 = t[t.length - 1];
ok(r7.reachG > r7.reachN * 1.25, `a copa gigante alcança mais longe (${r7.reachN} -> ${r7.reachG} px)`);

ok(errs.length === 0, 'sem erros no console' + (errs.length ? ': ' + errs[0] : ''));
await close();
process.exitCode = failures() ? 1 : 0;
