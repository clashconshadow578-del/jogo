/**
 * Dinâmica de população em 1 dia de jogo com a fauna inicial do mapa (várias sementes). Funciona na versão original e na
 * nova (só usa updateFauna/fauna): serve para comparar o equilíbrio do ecossistema antes × depois.
 * Uso: [VDC_ROOT=/caminho/do/projeto] NODE_PATH=$(npm root -g) node tests/browser/pop-day.mjs [dias] [sementes]
 */
import { launch, run } from './lib.mjs';

const days = +(process.argv[2] || 1), seeds = +(process.argv[3] || 4);
const { p, errs, close } = await launch();
await p.evaluate(() => { window.requestAnimationFrame = () => 0; });
await p.waitForTimeout(300);
const out = [];
for (let sd = 0; sd < seeds; sd++) {
  const r = await run(p, `JSON.stringify((() => {
    let a = ${1000 + sd} >>> 0; Math.random = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    fauna.length = 0; setFaInitDone(false); S.jagDone = false; S.min = 300; S.px = ${'S.px'}; 
    const fightIds = new Set(), chaseIds = new Set(), kills = {}; const init = {}; const born = {}, died = {}, causes = {}; const ids = new Set(); const dead = new Set();
    const count = (sp) => fauna.filter((x) => x.sp === sp && x.state !== 'dead').length;
    updateFauna(0.05); // dispara faInit
    const start = {}; for (const x of fauna) { start[x.sp] = (start[x.sp] || 0) + 1; ids.add(x.id); }
    for (let i = 0; i < ${days} * 24000; i++) {
      S.min += 0.05; if (S.min > 1190) S.min = 300; updateFauna(0.05);
      if (i % 4 === 0) for (const x of fauna) { if (x.state === 'fight' && !fightIds.has(x.id)) { fightIds.add(x.id); kills[x.sp] = (kills[x.sp] || 0) + 1; } if (x.state === 'chase' && x.sp === 'jaguar') chaseIds.add(x.id + ':' + Math.floor(i / 400)); }
      if (i % 20 === 0) for (const x of fauna) { if (!ids.has(x.id)) { ids.add(x.id); born[x.sp] = (born[x.sp] || 0) + 1; } if (x.state === 'dead' && !dead.has(x.id)) { dead.add(x.id); died[x.sp] = (died[x.sp] || 0) + 1; const c = x.cause || (x.hunter ? 'predador' : '?'); causes[c] = (causes[c] || 0) + 1; } }
    }
    const end = {}; for (const x of fauna) if (x.state !== 'dead') end[x.sp] = (end[x.sp] || 0) + 1;
    return { start, end, born, died, causes, caught: kills, jagChases: chaseIds.size };
  })())`);
  out.push(JSON.parse(r));
}
for (const [i, o] of out.entries()) console.log('seed', i, JSON.stringify(o));
console.log('erros:', errs.length ? errs.slice(0, 3) : 'nenhum');
await close();
