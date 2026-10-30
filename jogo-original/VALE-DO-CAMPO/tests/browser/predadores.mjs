/**
 * Onça e sucuri: camuflagem no mato alto, faro, presas que fogem, sucuri que TRAVA o jogador, salto da onça e fome → agressividade.
 * Uso: NODE_PATH=$(npm root -g) node tests/browser/predadores.mjs
 */
import { launch, run, ok, failures } from './lib.mjs';

const { p, close, errs } = await launch({ width: 960, height: 540 });

// campo limpo: 40 x 30 tiles de grama sem árvores, perto do jogador
await run(p, `(() => {
  const fx = Math.floor(S.px / 16) - 20, fy = Math.floor(S.py / 16) + 6;
  for (let y = -3; y < 34; y++) for (let x = -3; x < 44; x++) { const i = (fy + y) * MW + fx + x; ground[i] = GRASS; obj[i] = 0; delete crops[i]; mato[i] = 4; wl[i] = 0; }
  window.__f = [fx, fy]; return 1;
})()`);
const F = JSON.parse(await run(p, 'JSON.stringify(window.__f)'));
const T = (dx, dy) => [(F[0] + dx) * 16 + 8, (F[1] + dy) * 16 + 8];

// 1) cobertura do mato por fase
const cob = JSON.parse(await run(p, `(() => { const r = []; const i = (window.__f[1] + 5) * MW + window.__f[0] + 5; for (const m of [4, 100, 140, 230]) { mato[i] = m; r.push(coverAt(window.__f[0] * 16 + 5 * 16 + 8, (window.__f[1] + 5) * 16 + 8)); } mato[i] = 4; return JSON.stringify(r); })()`));
ok(cob[0] === 0 && cob[3] === 1 && cob[1] < cob[2] && cob[2] < cob[3], 'cobertura cresce com a fase da planta: ' + cob);

// 2) a onça espreitando no mato alto quase some; no chão limpo, à vista
const [jx, jy] = T(10, 10), [dx, dy] = T(10 + 3, 10); // cervo a ~48 px
const vis = JSON.parse(await run(p, `(() => {
  const mk = (sp, x, y, st) => { const a = faSpawn(sp, x, y, false); a.state = st; a.mv = false; a.dir = 0; a.hun = 0.1; return a; };
  const j = mk('jaguar', ${jx}, ${jy}, 'stalk'), d = mk('deer', ${dx}, ${dy}, 'idle'); d.dir = Math.PI; // cervo olhando para a onça
  const i0 = (window.__f[1] + 10) * MW + window.__f[0] + 10;
  const out = {};
  for (const k of [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) mato[(window.__f[1] + 10) * MW + window.__f[0] + k] = 4;
  const sense = () => { let n = 0; for (let t = 0; t < 40; t++) { d.state = 'idle'; if (senseTarget(d, animalTarget(j), 190).seen) n++; } return n; };
  out.limpo = sense();
  mato[i0] = 230; out.mato = sense();
  mato[i0] = 4; fauna.length = 0; return JSON.stringify(out);
})()`));
ok(vis.limpo > 30 && vis.mato < vis.limpo * 0.4, 'onça espreitando: à vista no chão limpo (' + vis.limpo + '/40), quase some no mato fechado (' + vis.mato + '/40)');

// 3) nariz da presa: a onça escondida no mato é sentida de perto, mas não de longe
const nose = JSON.parse(await run(p, `(() => {
  const mk = (sp, x, y, st) => { const a = faSpawn(sp, x, y, false); a.state = st; a.mv = false; a.hun = 0.1; return a; };
  const [x0, y0] = [${jx}, ${jy}];
  const j = mk('jaguar', x0, y0, 'stalk'), d = mk('deer', x0 + 30, y0, 'idle'), far = mk('deer', x0 + 150, y0, 'idle');
  const i0 = (window.__f[1] + 10) * MW + window.__f[0] + 10;
  for (let k = 0; k < 14; k++) mato[(window.__f[1] + 10) * MW + window.__f[0] + 10 + k] = 230;
  const near = senseTarget(d, animalTarget(j), 170).smelled, lejos = senseTarget(far, animalTarget(j), 170).smelled;
  for (let k = 0; k < 14; k++) mato[(window.__f[1] + 10) * MW + window.__f[0] + 10 + k] = 4;
  fauna.length = 0; return JSON.stringify({ near, lejos });
})()`));
ok(nose.near === true && nose.lejos === false, 'a presa sente a onça escondida de perto (' + nose.near + ') e não de longe (' + nose.lejos + ')');

// 4) faro da onça: sente a presa a centenas de px, mesmo saciada e atrás de árvores
const sc = JSON.parse(await run(p, `(() => {
  const mk = (sp, x, y) => { const a = faSpawn(sp, x, y, false); a.mv = false; return a; };
  const [x0, y0] = [${jx}, ${jy}];
  const j = mk('jaguar', x0, y0); j.hun = 0.05;
  const b1 = mk('boar', x0 + 380, y0), b2 = mk('boar', x0 + 520, y0), b3 = mk('boar', x0 + 280, y0);
  const r = { aberto380: senseTarget(j, animalTarget(b1)).smelled, a520: senseTarget(j, animalTarget(b2)).smelled };
  for (let k = 3; k < 12; k++) obj[(window.__f[1] + 10) * MW + window.__f[0] + 10 + k * 2] = 1; // árvores no caminho (o faro perde 30%)
  r.arvores280 = senseTarget(j, animalTarget(b3)).smelled;
  for (let k = 3; k < 12; k++) obj[(window.__f[1] + 10) * MW + window.__f[0] + 10 + k * 2] = 0;
  fauna.length = 0; return JSON.stringify(r);
})()`));
ok(sc.aberto380 === true && sc.arvores280 === true, 'onça saciada sente a queixada a 380 px (aberto) e a 280 px atrás de árvores (faro)');
ok(sc.a520 === false, 'mas não a 520 px');

// 5) presas fogem de uma onça visível andando a ~140 px (antes ignoravam)
const flee = JSON.parse(await run(p, `(() => {
  fauna.length = 0;
  const mk = (sp, x, y, st) => { const a = faSpawn(sp, x, y, false); a.state = st; a.mv = false; a.hun = 0.1; return a; };
  const [x0, y0] = [${jx}, ${jy}];
  let fugiram = 0, tot = 0;
  for (let n = 0; n < 8; n++) {
    fauna.length = 0;
    const j = mk('jaguar', x0, y0 + n * 0, 'idle'), d = mk('deer', x0 + 75, y0, 'forage'); d.dir = Math.PI; d.id = 100 + n;
    j.cd = 999; j.t = 999; d.t = 999;
    for (let k = 0; k < 120; k++) update(0.05);
    tot++; if (d.state === 'flee' || d.state === 'alert' || Math.hypot(d.x - x0, d.y - y0) > 160) fugiram++;
  }
  fauna.length = 0; return JSON.stringify({ fugiram, tot });
})()`));
ok(flee.fugiram >= 6, 'cervo reage (alerta ou foge) a uma onça parada à vista a ~75 px em ' + flee.fugiram + '/' + flee.tot);

// 6) sucuri trava o jogador, aperta e dá para se debater
const lock = JSON.parse(await run(p, `(() => {
  fauna.length = 0;
  const [px, py] = [${T(20, 18).join(',')}];
  S.px = px; S.py = py; S.vida = 100; S.inside = false;
  const a = faSpawn('anaconda', px + 20, py, false); a.state = 'phold'; a.t = PLAYER_PREY.anaconda.holdT; a.hgap = 0.2; a.hide = false; a.id = 77;
  playerFx.snareUntil = ecoNow() + 5; playerFx.snareSlow = 0;
  const out = { lento: playerSlow(), hp0: S.vida };
  for (let k = 0; k < 20; k++) update(0.1);
  out.hp1 = S.vida; out.estado = a.state; out.lento2 = playerSlow();
  let toques = 0; while (a.state === 'phold' && toques < 30) { playerStruggle(PLAYER_PREY.anaconda.struggle); toques++; for (let k = 0; k < 2; k++) update(0.05); }
  out.toques = toques; out.estadoFim = a.state; out.livre = playerSlow(); out.freeUntil = playerFx.freeUntil > ecoNow();
  fauna.length = 0; return JSON.stringify(out);
})()`));
ok(lock.lento === 0 && lock.lento2 === 0, 'preso pela sucuri o jogador não anda (velocidade ×' + lock.lento + ')');
ok(lock.hp1 < lock.hp0, 'a constrição machuca enquanto prende (' + lock.hp0 + ' → ' + lock.hp1 + ')');
ok(lock.estadoFim !== 'phold' && lock.toques <= 14, 'debatendo-se (' + lock.toques + ' toques) o jogador se solta');
ok(lock.livre === 1 && lock.freeUntil, 'depois de solto volta a andar e ganha alguns segundos sem ser preso de novo');

// 7) salto da onça sobre o jogador: parte da corrida, derruba (trava um instante) e morde
const leap = JSON.parse(await run(p, `(() => {
  const tent = () => {
  fauna.length = 0;
  resetEcology(); // zera a trava de "um caçador por vez" que o teste da sucuri deixou
  const [px, py] = [${T(20, 18).join(',')}];
  S.px = px; S.py = py; S.vida = 100; S.inside = false; S.vx = 0; S.vy = 0; playerFx.snareUntil = 0; playerFx.freeUntil = 0;
  const a = faSpawn('jaguar', px - 90, py, false); a.age = 9999; a.hun = 0.5; a.id = 55; a.sz = 1;
  a.state = 'pstalk'; a.t = 30; a.startD = 100; a.bites = 0; a.cd = 0;
  a.pl = { x: px, y: py, vx: 0, vy: 0, sp: 0, t: ecoNow() }; a.seePl = true; // a onça já viu o jogador (jagWatchPlayer faria isso)
  let saltou = false, mordeu = false, travou = false, vida = S.vida;
  for (let k = 0; k < 160; k++) { S.vx = 0; S.vy = 0; update(0.05); if (a.leapT > 0) saltou = true; if (playerSlow() === 0) travou = true; if (S.vida < vida) { mordeu = true; break; } }
  const r = { saltou, mordeu, travou, vida: S.vida, estado: a.state };
  fauna.length = 0; return r;
  };
  let r = null;
  for (let k = 0; k < 6; k++) { r = tent(); if (r.saltou && r.mordeu && r.travou) break; }
  return JSON.stringify(r);
})()`));
ok(leap.saltou && leap.mordeu, 'a onça salta sobre o jogador e morde (saltou=' + leap.saltou + ', mordeu=' + leap.mordeu + ', vida ' + leap.vida + ')');
ok(leap.travou, 'o salto derruba o jogador por um instante');

// 7b) a onça NÃO recua correndo depois de atacar (parecia medo): sem estado 'retreat' perto do jogador
const noFear = JSON.parse(await run(p, `(() => {
  fauna.length = 0; resetEcology();
  const [px, py] = [${T(20, 18).join(',')}];
  S.px = px; S.py = py; S.vida = 100; S.inside = false; S.vx = 0; S.vy = 0;
  const seen = new Set(); let maxD = 0;
  for (const hun of [0.1, 0.6, 0.95]) {
    fauna.length = 0; resetEcology(); S.vida = 100;
    const a = faSpawn('jaguar', px - 25, py, false); a.age = 9999; a.hun = hun; a.id = 90; a.cd = 0; a.state = 'pattack'; a.t = 0.1; a.bites = 0; a.atk = true;
    a.pl = { x: px, y: py, vx: 0, vy: 0, sp: 0, t: ecoNow() }; a.seePl = true;
    for (let k = 0; k < 200; k++) { S.vx = 0; S.vy = 0; S.vida = Math.max(S.vida, 60); update(0.05); seen.add(a.state); maxD = Math.max(maxD, Math.hypot(a.x - px, a.y - py)); }
  }
  fauna.length = 0; return JSON.stringify({ estados: [...seen], maxD: Math.round(maxD) });
})()`));
ok(!noFear.estados.includes('retreat'), 'depois de atacar a onça não entra em recuo (estados: ' + noFear.estados.join(',') + ')');

// 8) fome → agressividade: a onça faminta caça uma presa distante; a saciada não se compromete tanto
const trial = async (hun) => JSON.parse(await run(p, `(() => {
  let caca = 0, tot = 6;
  const HUNTING = { stalk: 1, chase: 1, pounce: 1, drag: 1, eat: 1, jfight: 1, track: 1, investigate: 1, pstalk: 1, pchase: 1, pattack: 1, pinvest: 1 }; // inclui caçar o jogador
  for (let n = 0; n < tot; n++) {
    fauna.length = 0;
    const [x0, y0] = [${jx}, ${jy}];
    const j = faSpawn('jaguar', x0, y0, false); j.age = 9999; j.hun = ${hun}; j.id = 300 + n; j.cd = 0; j.state = 'idle'; j.t = 0.1; j.stam = 1;
    const d = faSpawn('deer', x0 + 300, y0 + 10, false); d.state = 'forage'; d.t = 999; d.id = 400 + n; d.age = 9999;
    let hit = false;
    for (let k = 0; k < 900 && !hit; k++) { j.hun = ${hun}; update(0.1); if (HUNTING[j.state]) hit = true; }
    if (hit) caca++;
  }
  fauna.length = 0; return JSON.stringify({ caca, tot });
})()`));
const faminta = await trial(0.95), saciada = await trial(0.05);
console.log('caçadas iniciadas em 90 s: faminta', JSON.stringify(faminta), 'saciada', JSON.stringify(saciada));
ok(faminta.caca >= 5, 'a onça faminta parte para a caça em quase todas as tentativas (' + faminta.caca + '/' + faminta.tot + ')');
ok(faminta.caca > saciada.caca, 'a faminta caça bem mais que a saciada (' + faminta.caca + ' x ' + saciada.caca + ')');

// 9) quando o personagem morre, renasce DENTRO da casa (ao lado da cama), de vida cheia, no dia seguinte
await run(p, `(() => { fauna.length = 0; resetEcology(); S.inside = false; S.vida = 100; window.__d0 = S.day; hurtPlayer({ dmg: 999, from: { x: S.px - 5, y: S.py }, label: 'teste', source: 'A onça' }); return 1; })()`);
await p.waitForTimeout(3500);
const rev = JSON.parse(await run(p, `JSON.stringify({ inside: S.inside, vida: S.vida, dia: S.day - window.__d0, nearBed: nearBed() })`));
ok(rev.inside === true && rev.vida >= 100 && rev.dia === 1, 'morreu: renasce dentro da casa, de vida cheia, no dia seguinte (' + JSON.stringify(rev) + ')');
ok(rev.nearBed === true, 'renasce ao lado da cama (dá para dormir logo)');

// 10) picadas demais desmaiam o personagem por ~6 h de jogo, deitado e indefeso; os animais o veem de muito mais longe
await run(p, `(() => { fauna.length = 0; resetEcology(); wakeUp(false); S.inside = false; S.vida = 100; S.energy = 100; vitals.stings = []; vitals.quiet = 99; return 1; })()`);
const ko1 = JSON.parse(await run(p, `(() => {
  const out = {};
  for (let k = 0; k < 13; k++) { vitals.quiet = 99; stingPlayer(); }
  out.com13 = playerFx.ko;
  vitals.quiet = 99; stingPlayer();
  out.com14 = playerFx.ko; out.vida = Math.round(S.vida);
  return JSON.stringify(out);
})()`));
ok(ko1.com13 === false && ko1.com14 === true, 'desmaia na 14ª picada seguida e não antes (13: ' + ko1.com13 + ', 14: ' + ko1.com14 + ')');
const visKo = JSON.parse(await run(p, `(() => {
  const mk = (x, y) => { const a = faSpawn('jaguar', x, y, false); a.hun = 0.6; a.mv = false; a.dir = 0; a.state = 'idle'; return a; };
  const j = mk(S.px - 300, S.py); // 300 px, olhando para o jogador
  const dormindo = senseTarget(j, playerTarget());
  playerFx.ko = false; const em_pe = senseTarget(j, playerTarget()); playerFx.ko = true;
  fauna.length = 0; return JSON.stringify({ deitado: dormindo.any, emPe: em_pe.any, rm: playerTarget().rangeMul });
})()`));
ok(visKo.deitado === true && visKo.rm > 2, 'desmaiado, a onça o percebe a 300 px (alcance ×' + visKo.rm + ')');
ok(visKo.emPe === false || visKo.deitado, 'em pé, nas mesmas condições, ela não o percebia tão longe (' + visKo.emPe + ')');
const lying = JSON.parse(await run(p, `(() => {
  S.min = 700; const m0 = S.min, d0 = S.day; let n = 0;
  S.vx = 99; S.vy = 99; const x0 = S.px;
  while (playerFx.ko && n < 5000) { update(0.1); n++; }
  return JSON.stringify({ n, ko: playerFx.ko, horas: Math.round(((S.day - d0) * 1200 + S.min - m0) / 60 * 10) / 10, vida: S.vida >= 40, energia: S.energy >= 40, parado: S.px === x0 });
})()`));
ok(lying.ko === false && lying.horas >= 5.5 && lying.horas <= 6.6, 'acorda depois de ~6 h de jogo (' + lying.horas + ' h em ' + lying.n + ' passos)');
ok(lying.vida && lying.energia && lying.parado, 'acorda com vida e estamina mínimas, sem ter saído do lugar');

// 10b) uma onça com fome moderada a ~330 px caça o jogador desmaiado, mas não o jogador em pé escondido no mato
const hunt = async (ko) => JSON.parse(await run(p, `(() => {
  let n = 0;
  for (let t = 0; t < 6; t++) {
    fauna.length = 0; resetEcology(); wakeUp(false); vitals.stings = []; S.vida = 100; S.inside = false; playerFx.snareUntil = 0; playerFx.freeUntil = 0;
    ${ko ? 'playerFx.ko = true; playerFx.koLeft = 9999;' : ''}
    const [px, py] = [${T(24, 18).join(',')}]; S.px = px; S.py = py;
    const j = faSpawn('jaguar', px - 330, py, false); j.age = 9999; j.hun = 0.55; j.id = 600 + t; j.cd = 0; j.state = 'idle'; j.t = 0.1; j.sz = 1; j.stam = 1;
    let hit = false;
    for (let k = 0; k < 600 && !hit; k++) { S.vx = 0; S.vy = 0; S.px = px; S.py = py; S.vida = 100; j.cd = 0; update(0.1); if (['pstalk', 'pchase', 'pattack', 'pobserve'].includes(j.state)) hit = true; }
    if (hit) n++;
  }
  playerFx.ko = false; fauna.length = 0; return JSON.stringify(n);
})()`));
const huntKo = await hunt(true), huntUp = await hunt(false);
console.log('onça a 330 px nota o jogador em 60 s: desmaiado', huntKo + '/6', '· em pé', huntUp + '/6');
ok(huntKo >= 4 && huntKo > huntUp, 'a onça a 330 px percebe e vai atrás do desmaiado (' + huntKo + '/6) muito mais que do jogador em pé (' + huntUp + '/6)');

// 11) coração batendo: abaixo de 40% de vida toca; quanto menor a vida, mais batidas por segundo; acima de 40% fica em silêncio
await run(p, `(() => { fauna.length = 0; wakeUp(false); S.inside = false; return 1; })()`);
await p.evaluate(() => {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' })); // destrava o áudio (o navegador exige um gesto)
  const O = window.AudioContext.prototype, orig = O.createOscillator;
  window.__osc = 0;
  O.createOscillator = function () { window.__osc++; return orig.apply(this, arguments); };
});
const batidas = async (vida) => {
  await run(p, `(() => { S.vida = ${vida}; vitals.quiet = 0; return 1; })()`); // quiet=0: a vida não regenera durante a medição
  await p.evaluate(() => { window.__osc = 0; });
  for (let k = 0; k < 8; k++) { await run(p, `(() => { S.vida = ${vida}; vitals.quiet = 0; return 1; })()`); await p.waitForTimeout(500); }
  return (await p.evaluate(() => window.__osc)) / 2 / 4; // 2 osciladores por batida, 4 s: batidas por segundo
};
const b100 = await batidas(80), b35 = await batidas(35), b10 = await batidas(10), b2 = await batidas(2);
console.log('batidas/s: 80% →', b100, '· 35% →', b35.toFixed(2), '· 10% →', b10.toFixed(2), '· 2% →', b2.toFixed(2));
// (o contador inclui outros sons do jogo, por isso o coração é medido pela diferença para a vida alta)
const h35 = b35 - b100, h5 = b2 - b100; // (2% de vida: o mais acelerado)
ok(h35 > 0.5 && h5 > h35 + 0.4, 'abaixo de 40% o coração bate e acelera muito quando a vida cai (+' + h35.toFixed(2) + ' em 35% contra +' + h5.toFixed(2) + ' em 2% de batidas/s acima do som ambiente); a ordem exata por ponto de vida é testada em vitals.test.js');
await run(p, `(() => { S.vida = 100; return 1; })()`);

ok(errs.length === 0, 'sem erros no console' + (errs.length ? ': ' + errs.slice(0, 2).join(' | ') : ''));
await close();
process.exitCode = failures() ? 1 : 0;
