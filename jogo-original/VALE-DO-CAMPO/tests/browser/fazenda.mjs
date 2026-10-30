/**
 * Animais da fazenda como presas: onça (bezerro/vaca), raposa comum (galinha), medo, morte de verdade e fim da raposa "da fazenda".
 * Uso: NODE_PATH=$(npm root -g) node tests/browser/fazenda.mjs
 */
import { launch, run, ok, failures } from './lib.mjs';

const { p, close, errs } = await launch({ width: 960, height: 540 });
await run(p, `(() => {
  const fx = Math.floor(S.px / 16) - 20, fy = Math.floor(S.py / 16) + 6;
  for (let y = -3; y < 34; y++) for (let x = -3; x < 44; x++) { const i = (fy + y) * MW + fx + x; ground[i] = GRASS; obj[i] = 0; delete crops[i]; mato[i] = 4; wl[i] = 0; }
  window.__f = [fx, fy]; window.__cow0 = Object.assign({}, herd[0]); window.__chx0 = chx.slice(0, 3).map((c) => Object.assign({}, c)); return 1;
})()`);
const F = JSON.parse(await run(p, 'JSON.stringify(window.__f)'));
const T = (dx, dy) => [(F[0] + dx) * 16 + 8, (F[1] + dy) * 16 + 8];
const [cx, cy] = T(20, 16);

const reset = `
  fauna.length = 0; resetEcology(); wakeUp(false); S.min = 480; // relógio: sem isto o dia acaba no meio das tentativas e o jogo "dorme" sozinho
  S.px = ${cx + 600}; S.py = ${cy + 200}; S.inside = false; S.vida = 100; // jogador longe, fora do caminho
  while (herd.length > 1) herd.pop();
  for (const k of Object.keys(herd[0])) delete herd[0][k]; Object.assign(herd[0], window.__cow0); // a vaca fundadora pode ter morrido e sido substituída em tentativas anteriores
  herd[0].x = ${cx - 300}; herd[0].y = ${cy - 120}; herd[0].state = 'rest'; herd[0].t = 99; herd[0].busy = false;
  const calf = Object.assign({}, herd[0], { id: 9001, x: ${cx}, y: ${cy}, calf: true, age: 5, mom: herd[0].id, state: 'rest', t: 99, path: null, busy: false, dead: false, founder: 0 });
  herd.push(calf);
  setChx(window.__chx0.map((o, i) => Object.assign({}, o, { id: o.id + i * 0, busy: false, holder: null, state: 'andar', t: 50 }))); // galinhas novas a cada tentativa (as anteriores podem ter morrido)
`;

// 1) a raposa "da fazenda" não existe mais: ao entardecer não aparece nenhuma
const dusk = JSON.parse(await run(p, `(() => { S.min = 740; for (let k = 0; k < 100; k++) update(0.05); return JSON.stringify({ fox: fox.length, h: 6 + S.min / 60 }); })()`));
ok(dusk.fox === 0, 'ao entardecer não surge nenhuma "raposa da fazenda" (' + dusk.fox + ' às ' + dusk.h.toFixed(1) + ' h)');

// 2) espelhos: cada vaca/galinha vira uma presa que os predadores percorrem; o rebanho de 1 não pode ser caçado
const mirrors = JSON.parse(await run(p, `(() => { ${reset}
  update(0.05);
  const sp = farmPrey().map((q) => q.sp).sort();
  while (herd.length > 1) herd.pop(); update(0.05);
  const alone = farmPrey().filter((q) => q.sp === 'cow' || q.sp === 'calf').length;
  return JSON.stringify({ sp, alone });
})()`));
ok(mirrors.sp.includes('calf') && mirrors.sp.includes('chicken') && mirrors.sp.includes('cow'), 'bezerro, vaca e galinhas aparecem como presas (' + mirrors.sp.join(',') + ')');
ok(mirrors.alone === 0, 'se só resta UM animal no rebanho, nenhum predador pode escolhê-lo (' + mirrors.alone + ')');

// 3) onça faminta caça o bezerro e ele MORRE de verdade (sai do rebanho, deixa carcaça); saciada não ataca; vaca adulta só com muita fome
const jag = async (hun, who, tot = 6) => JSON.parse(await run(p, `(() => {
  let mortos = 0, ataques = 0; const tot = ${tot}; const alvos = {}; const HUNTING = { stalk: 1, chase: 1, pounce: 1, jfight: 1, eat: 1, drag: 1, investigate: 1 };
  for (let n = 0; n < tot; n++) { ${reset}
    ${who === 'cow' ? 'herd.pop(); const adult = Object.assign({}, herd[0], { id: 9002, x: ' + cx + ', y: ' + cy + ', calf: false, age: 999, state: "rest", t: 99, path: null, busy: false, dead: false, founder: 0 }); herd.push(adult);' : ''}
    const j = faSpawn('jaguar', ${cx} - 170, ${cy}, false); j.age = 9999; j.hun = ${hun}; j.id = 700 + n; j.cd = 0; j.state = 'idle'; j.t = 0.1; j.sz = 1; j.stam = 1;
    const before = herd.length; let hit = false;
    for (let k = 0; k < 1800; k++) { j.hun = ${hun}; j.cd = Math.min(j.cd, 0.1); update(0.05); if (HUNTING[j.state] && j.tgt && j.tgt.farm) { hit = true; alvos[j.tgt.sp] = (alvos[j.tgt.sp] || 0) + 1; } if (herd.length < before) break; }
    if (hit) ataques++; if (herd.length < before) mortos++;
  }
  fauna.length = 0; return JSON.stringify({ mortos, ataques, tot, alvos });
})()`));
const jFome = await jag(0.9, 'calf'), jSaciada = await jag(0.2, 'calf'), jVacaMod = await jag(0.4, 'cow'), jVacaFome = await jag(0.95, 'cow', 12);
console.log('onça × bezerro: faminta', JSON.stringify(jFome), '· saciada', JSON.stringify(jSaciada), '· vaca fome 0,4', JSON.stringify(jVacaMod), '· vaca fome 0,95', JSON.stringify(jVacaFome));
ok(jFome.ataques >= 4, 'a onça faminta ataca o bezerro (' + jFome.ataques + '/' + jFome.tot + ')');
ok(jFome.mortos >= 1, 'e o bezerro morre de verdade e sai do rebanho em pelo menos um dos casos (' + jFome.mortos + '/' + jFome.tot + ')');
ok(jSaciada.ataques === 0, 'a onça saciada não ataca o bezerro (' + jSaciada.ataques + '/' + jSaciada.tot + ')');
ok(jVacaMod.ataques === 0, 'vaca adulta não é atacada por onça com fome moderada (' + jVacaMod.ataques + '/' + jVacaMod.tot + ')');
ok(jVacaFome.ataques >= 1, 'vaca adulta é atacada por onça muito faminta (' + jVacaFome.ataques + '/' + jVacaFome.tot + ')');

// 4) raposa comum caça galinha (por fome e percepção) e, quando pega, a galinha morre de verdade e deixa carcaça
const fox = JSON.parse(await run(p, `(() => {
  let ataques = 0, tot = 10; const HUNTING = { stalk: 1, chase: 1, fight: 1, eat: 1, investigate: 1 };
  for (let n = 0; n < tot; n++) { ${reset}
    const c0 = chx[0]; c0.x = ${cx}; c0.y = ${cy}; for (const c of chx) if (c !== c0) { c.x = ${cx} + 400; c.y = ${cy} + 400; }
    const f = faSpawn('fox', ${cx} - 65, ${cy}, false); f.age = 9999; f.hun = 0.9; f.id = 800 + n; f.cd = 0; f.state = 'idle'; f.t = 0.1; f.sz = 1; f.stam = 1;
    let hit = false;
    for (let k = 0; k < 1800 && !hit; k++) { f.hun = Math.max(f.hun, 0.8); f.cd = Math.min(f.cd, 0.1); update(0.05); if (HUNTING[f.state] && f.tgt && f.tgt.farm) hit = true; }
    if (hit) ataques++;
  }
  fauna.length = 0;
  // parte B: a raposa já está espreitando a galinha a 30 px (o caso em que o esconderijo funcionou): ela a pega e a galinha MORRE
  let mortas = 0, carc = 0, nb = 8;
  for (let n = 0; n < nb; n++) { ${reset}
    const c0 = chx[0]; c0.x = ${cx}; c0.y = ${cy}; for (const c of chx) if (c !== c0) { c.x = ${cx} + 400; c.y = ${cy} + 400; }
    update(0.05);
    const px = farmPrey().find((q) => q.real === c0);
    const f = faSpawn('fox', ${cx} - 30, ${cy}, false); f.age = 9999; f.hun = 0.9; f.id = 900 + n; f.cd = 0; f.sz = 1; f.stam = 1;
    f.tgt = px; f.state = 'stalk'; f.t = 40; f.lastSeen = { x: px.x, y: px.y, t: ecoNow() }; f.loseT = 0; f.obsN = 0;
    const before = chx.length;
    for (let k = 0; k < 600 && chx.length === before; k++) { f.hun = Math.max(f.hun, 0.8); update(0.05); }
    if (chx.length < before) { mortas++; if (CARC.some((c) => c.chk)) carc++; }
  }
  fauna.length = 0; return JSON.stringify({ ataques, tot, mortas, carc, nb });
})()`));
console.log('raposa × galinha:', JSON.stringify(fox));
ok(fox.ataques >= 3, 'a raposa comum faminta ataca galinhas que detecta (' + fox.ataques + '/' + fox.tot + ')');
ok(fox.mortas >= fox.nb * 0.4 && fox.carc === fox.mortas, 'quando a raposa pega a galinha ela MORRE de verdade (' + fox.mortas + '/' + fox.nb + ') e deixa carcaça (' + fox.carc + ')');

// 5) medo: o bezerro e as galinhas fogem de uma onça que se aproxima (a pé) antes de ser pegos
const fear = JSON.parse(await run(p, `(() => { ${reset}
  const j = faSpawn('jaguar', ${cx} - 120, ${cy}, false); j.age = 9999; j.hun = 0.05; j.id = 777; j.cd = 999; j.state = 'idle'; j.t = 999; j.sz = 1;
  let fled = false, moved = 0; const x0 = calf.x;
  for (let k = 0; k < 120; k++) { j.x = ${cx} - 40; j.y = ${cy}; j.state = 'go'; j.mv = true; update(0.05); const pm = farmDebug.byReal.get(calf); if (pm && pm.hj === 'flee') fled = true; }
  moved = Math.abs(calf.x - x0);
  fauna.length = 0; return JSON.stringify({ fled, moved: Math.round(moved) });
})()`));
ok(fear.fled && fear.moved > 20, 'o bezerro percebe a onça e foge (fugiu=' + fear.fled + ', andou ' + fear.moved + ' px)');

ok(errs.length === 0, 'sem erros no console' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
await close();
process.exitCode = failures() ? 1 : 0;
