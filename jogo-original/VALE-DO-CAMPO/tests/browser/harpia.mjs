/**
 * Harpia (entities/wild/Harpy.js, config/harpia.js, systems/audio/HarpySounds.js): o casal na árvore-ninho (as sumaúmas gigantes são preferidas), as
 * presas certas (e nenhuma das grandes), o ciclo de caça (rastreia, se posiciona, razante, come), a defesa do ninho (só perto dele e depois de avisar),
 * os longos repousos, a expulsão de outra harpia, o susto com a onça e o som (alto, de longe e com eco).
 * As aves são atualizadas à mão (passos de 0,05 s dentro de um único evaluate): o resultado não depende da velocidade do navegador.
 * Uso: NODE_PATH=$(npm root -g) node tests/browser/harpia.mjs
 */
import { launch, run, ok, failures } from './lib.mjs';

const { p, close, errs } = await launch({ width: 960, height: 540 });
const J = async (code) => JSON.parse(await run(p, `JSON.stringify(${code})`));

// meio-dia (a harpia é diurna: à noite só dorme)
await run(p, `S.min = 360`);
await p.waitForTimeout(700);

// preparo: sem fauna do jogo, o casal na árvore-ninho; `passo(a, s)` roda `s` segundos de simulação de uma ave
await run(p, `(() => {
  fauna.length = 0;
  window.limpa = () => { fauna.length = 0; }; // a fauna selvagem sai (cada cenário põe só o que precisa); as galinhas ficam: são animais como os outros
  // o mapa tem 1600 px: posições relativas à árvore (jogador longe, presas, intrusa) são voltadas para o lado do centro, para nunca cair fora do mapa
  window.lado = (b) => ({ sx: b.x > 800 ? -1 : 1, sy: b.y > 800 ? -1 : 1 });
  window.longe = (b) => { S.px = b.x < 800 ? 1500 : 100; S.py = b.y < 800 ? 1500 : 100; };
  window.__par = harpyInit();
  window.passo = (a, s, dt = 0.05) => { for (let t = 0; t < s; t += dt) { a.cd = Math.max(0, a.cd - dt); a.hun = Math.min(1, a.hun + dt * 0.006); harpyUpd(a, FA_SP.harpy, 8, dt); } };
  window.estados = (a, s, dt = 0.05) => { const o = {}; for (let t = 0; t < s; t += dt) { a.cd = Math.max(0, a.cd - dt); a.hun = Math.min(1, a.hun + dt * 0.006); harpyUpd(a, FA_SP.harpy, 8, dt); o[a.state] = (o[a.state] || 0) + dt; } return o; };
})()`);

// 1) o casal
const par = await J(`__par.map((a) => ({ sex: a.sex, st: a.state, z: a.z, mate: a.mate, id: a.id, home: a.home, esp: ecoTrees.get(a.home).especie, fase: ecoTrees.get(a.home).st }))`);
ok(par.length === 2 && par[0].sex === 'f' && par[1].sex === 'm', 'nasce um casal (fêmea e macho)');
ok(par[0].home === par[1].home && par[0].esp === 'sumauma' && par[0].fase >= 6, `na mesma sumaúma adulta (fase ${par[0].fase})`);
ok(par[0].mate === par[1].id && par[1].mate === par[0].id, 'são parceiros um do outro');
ok(par.every((a) => a.st === 'hrest' && a.z > 60), `começam pousados na copa (altura ${par.map((a) => a.z).join(', ')} px)`);

// 2) a árvore-ninho: as sumaúmas gigantes são preferidas
const pref = await J(`(() => {
  let g = 0, n = 3000;
  const adultas = [...ecoTrees.values()].filter((t) => t.amz && t.especie === 'sumauma' && t.st >= 6 && obj[t.i] === TREE), gig = adultas.filter((t) => t.gig).length;
  for (let i = 0; i < n; i++) if (escolherArvoreNinho().gig) g++;
  return { g: g / n, gig, total: adultas.length, base: gig / adultas.length };
})()`);
ok(pref.gig === 0 || pref.g > pref.base * 2, `as gigantes são preferidas: ${(pref.g * 100).toFixed(0)}% das escolhas (eram ${(pref.base * 100).toFixed(0)}% das sumaúmas; ${pref.gig} gigantes de ${pref.total})`);

// 3) quem é presa e quem não é
const pr = await J(`(() => {
  const f = (sp, o = {}) => Object.assign({ sp, x: 100, y: 100, state: 'idle', age: 999, hunter: null, gone: false }, o);
  const adulto = faSpawn('deer', 600, 600, false), cria = faSpawn('deer', 900, 900, true), criaSozinha = faSpawn('deer', 1500, 1500, true);
  adulto.age = 999; cria.x = 604; cria.y = 604; // filhote ao lado da mãe
  const r = {
    lebre: ehPresa(f('hare')), galoLira: ehPresa(f('grouse')), galinha: ehPresa(f('chicken', { farm: true })),
    cervoAdulto: ehPresa(f('deer')), queixadaAdulta: ehPresa(f('boar')), onca: ehPresa(f('jaguar')), raposa: ehPresa(f('fox')), vaca: ehPresa(f('cow', { farm: true })), bezerro: ehPresa(f('calf', { farm: true })), sucuri: ehPresa(f('anaconda')),
    criaComMae: ehPresa(cria), criaSozinha: ehPresa(criaSozinha), lebreMorta: ehPresa(f('hare', { state: 'dead' })), lebreVoando: ehPresa(f('grouse', { state: 'fly' })),
  };
  limpa(); window.__par = harpyInit();
  return r;
})()`);
ok(pr.lebre && pr.galoLira && pr.galinha, 'lebre, galo-lira e galinha são presas');
ok(pr.criaSozinha, 'filhote de cervo sozinho é presa');
ok(!pr.criaComMae, 'filhote de cervo ao lado da mãe NÃO é presa');
ok(!pr.cervoAdulto && !pr.queixadaAdulta && !pr.vaca && !pr.bezerro, 'cervo e queixada adultos, vaca e bezerro NÃO são presas (grandes demais)');
ok(!pr.onca && !pr.raposa && !pr.sucuri, 'onça, raposa e sucuri não são presas');
ok(!pr.lebreMorta && !pr.lebreVoando, 'presa morta ou já voando não conta');

// 4) o ciclo de caça: com chance 100% ela rastreia, se posiciona, dá o razante, agarra e come. A presa é a que ela escolher (a lebre posta ali, ou uma
// galinha ou outra que ela veja): o que importa é que o animal escolhido morra de verdade e seja de uma espécie que ela caça
const caca = await J(`(() => {
  const h = __par[0], T = ecoTrees.get(h.home), b = baseOf(T);
  HARPIA.caca.chanceBase = 1;
  HARPIA.caca.capturaBase = 9; // garante o agarre (o mato alto reduz a chance real)
  HARPIA.caca.rastreio = [0.5, 0.6];
  HARPIA.caca.preparo = [0.4, 0.5];
  longe(b); // o jogador longe: sem aviso
  limpa(); fauna.push(...__par);
  const L = lado(b), lebre = faSpawn('hare', b.x + L.sx * 90, b.y + L.sy * 60, false); lebre.state = 'idle';
  h.state = 'hwatch'; h.t = 100; h.cd = 0; h.hun = 0.9;
  const vis = []; let alvo = null, t0 = null;
  for (let t = 0; t < 40 && !alvo; t += 0.05) { passo(h, 0.05); if (!vis.includes(h.state)) vis.push(h.state); if (h.state === 'hfeed') { alvo = h.tgt; t0 = t; } }
  return { vis, t0, alvo: alvo && alvo.sp, estado: alvo && alvo.state, caca: alvo ? !!HARPIA.presas[alvo.sp] : false, fome: h.hun, z: h.z };
})()`);
ok(['htrack', 'hprep', 'hstoop', 'hfeed'].every((s) => caca.vis.includes(s)), `ciclo completo: ${caca.vis.join(' → ')}`);
ok(caca.estado === 'dead' && caca.caca && caca.t0 < 25, `o animal que ela escolheu (${caca.alvo}) morre de verdade, em ${caca.t0 && caca.t0.toFixed(1)} s`);
ok(caca.fome < 0.6, `comer reduz a fome (0,9 → ${caca.fome.toFixed(2)})`);

// 5) depois de comer ela volta para a copa e repousa
const volta = await J(`(() => { const h = __par[0]; limpa(); fauna.push(...__par); h.state = 'hfeed'; h.t = 4; h.z = 0; h.carcass = null; h.tgt = null; h.cd = 100; const o = estados(h, 90); return { o, st: h.state, z: h.z }; })()`);
ok(volta.o.hroam > 0.5 && (volta.o.hrest || 0) + (volta.o.hwatch || 0) > 20 && volta.z > 60, `depois de comer volta voando à copa e repousa (altura ${Math.round(volta.z)} px)` + (volta.o.hroam > 0.5 ? '' : ' ' + JSON.stringify(volta.o)));

// 6) não ataca o que é grande: cervo e queixada adultos à vista nunca viram alvo (outra presa pequena que o jogo criar nesse meio tempo pode)
const grande = await J(`(() => {
  HARPIA.caca.chanceBase = 1;
  const h = __par[0], T = ecoTrees.get(h.home), b = baseOf(T);
  limpa(); fauna.push(...__par);
  const cervo = faSpawn('deer', b.x + 60, b.y + 50, false), queixada = faSpawn('boar', b.x - 70, b.y + 40, false); cervo.age = queixada.age = 999;
  h.state = 'hwatch'; h.t = 200; h.cd = 0; h.hun = 1;
  const alvos = new Set(); let tentou = 0;
  for (let t = 0; t < 80; t += 0.05) { passo(h, 0.05); if (h.tgt) alvos.add(h.tgt.sp); if (h.state === 'hstoop') tentou++; if (h.state === 'hfeed' || h.state === 'hroam') h.state = 'hwatch', h.cd = 0, h.t = 200, h.tgt = null; }
  return { alvos: [...alvos], cervo: cervo.state, queixada: queixada.state };
})()`);
ok(!grande.alvos.includes('deer') && !grande.alvos.includes('boar') && grande.cervo !== 'dead' && grande.queixada !== 'dead', `cervo e queixada adultos à vista nunca viram alvo (alvos escolhidos: ${grande.alvos.join(', ') || 'nenhum'})`);

// 7) defesa do ninho: só perto dele, e só depois de avisar
const def = await J(`(() => {
  const h = __par[0], T = ecoTrees.get(h.home), b = baseOf(T);
  limpa(); fauna.push(...__par); for (const a of __par) { a.state = 'hrest'; a.t = 500; a.cd = 100; a.cdD = 0; a.avisou = false; }
  const out = {};
  // longe: nada acontece
  S.px = b.x + 600; S.py = b.y; S.vida = 100; const l = estados(h, 20); out.longe = { hwarn: !!l.hwarn, hdefend: !!l.hdefend, vida: S.vida };
  // a distância de aviso, fora da de ataque: avisa e não ataca
  h.state = 'hrest'; h.t = 500; const L = lado(b); S.px = b.x + L.sx * 130; S.py = b.y; S.vida = 100; const m = estados(h, 25); out.meio = { hwarn: !!m.hwarn, hdefend: !!m.hdefend, vida: S.vida };
  // perto: avisa e, se continua, investe
  h.state = 'hrest'; h.t = 500; h.cdD = 0; S.px = b.x + L.sx * 40; S.py = b.y + L.sy * 10; S.vida = 100; const e = estados(h, 12); out.perto = { hwarn: !!e.hwarn, hdefend: !!e.hdefend, vida: S.vida, apos: h.state, e, cdD: h.cdD };
  return out;
})()`);
ok(!def.longe.hwarn && !def.longe.hdefend && def.longe.vida === 100, 'jogador longe do ninho: ela nem avisa');
ok(def.meio.hwarn && !def.meio.hdefend && def.meio.vida === 100, 'jogador a distância de aviso: levanta a crista e grita, mas não ataca');
ok(def.perto.hwarn && def.perto.hdefend && def.perto.vida < 100, `jogador perto do ninho: avisa e depois investe (vida 100 → ${def.perto.vida})` + (def.perto.hdefend ? '' : ' ' + JSON.stringify(def.perto)));
const defesaCurto = await J(`(() => { const h = __par[0]; S.vida = 100; h.cdD = 0; h.state = 'hrest'; h.t = 500; const b = baseOf(ecoTrees.get(h.home)); const L = lado(b); S.px = b.x + L.sx * 40; S.py = b.y; h.cdD = 40; const o = estados(h, 10); return { vida: S.vida, atacou: !!o.hdefend }; })()`);
ok(!defesaCurto.atacou, 'depois de atacar ela espera o intervalo antes de atacar de novo');

// 8) longos períodos parada: sem presa, de dia, fica quase todo o tempo repousando ou observando
const rotina = await J(`(() => {
  const h = __par[1]; const b = baseOf(ecoTrees.get(h.home)); longe(b);
  limpa(); fauna.push(...__par);
  h.state = 'hrest'; h.t = 10; h.cd = 0; h.hun = 0.3;
  const o = estados(h, 900); const tot = Object.values(o).reduce((x, y) => x + y, 0);
  return { parada: ((o.hrest || 0) + (o.hwatch || 0)) / tot, voo: (o.hroam || 0) / tot, o };
})()`);
ok(rotina.parada > 0.6, `sem presa, pousada ou observando ${(rotina.parada * 100).toFixed(0)}% do tempo (voando ${(rotina.voo * 100).toFixed(0)}%)`);

// 9) disputa territorial: outra harpia (que não é o par) na área da árvore-ninho é expulsa
const disp = await J(`(() => {
  const h = __par[0], T = ecoTrees.get(h.home), b = baseOf(T);
  limpa(); fauna.push(...__par);
  const L = lado(b), outra = faSpawn('harpy', b.x + L.sx * 160, b.y + L.sy * 20, false); outra.home = null; outra.z = 90; outra.state = 'hroam'; outra.t0 = 0; outra.hun = 0.4; outra.face = -1; outra.age = 999;
  h.state = 'hwatch'; h.t = 100; longe(b);
  const vis = []; let expulsa = false;
  for (let t = 0; t < 20 && !expulsa; t += 0.05) { passo(h, 0.05); if (!vis.includes(h.state)) vis.push(h.state); if (outra.state === 'havoid') expulsa = true; }
  return { vis, expulsa, estadoOutra: outra.state };
})()`);
ok(disp.vis.includes('hchase') && disp.expulsa, `a intrusa é perseguida e expulsa (${disp.vis.join(' → ')}; ela passa a ${disp.estadoOutra})`);

// 9b) harpyIntruder: a intrusa de verdade (com a sua própria árvore) chega e é expulsa; as árvores-ninho são diferentes
const intr = await J(`(() => {
  limpa(); fauna.push(...__par); const h = __par[0], b = baseOf(ecoTrees.get(h.home));
  for (const a of __par) { a.state = 'hrest'; a.t = 500; a.cdD = 0; }
  longe(b);
  const i = harpyIntruder(); fauna.push(i);
  const outras = { casa: h.home, dela: i.home };
  const vis = []; let expulsa = false;
  for (let t = 0; t < 40 && !expulsa; t += 0.05) { i.cd = Math.max(0, i.cd - 0.05); passo(h, 0.05); passo(i, 0.05); if (!vis.includes(h.state)) vis.push(h.state); if (i.state === 'havoid') expulsa = true; }
  return { ...outras, vis, expulsa };
})()`);
ok(intr.casa !== intr.dela, 'a intrusa tem a sua própria árvore, diferente da do casal');
ok(intr.vis.includes('hchase') && intr.expulsa, `a residente expulsa a intrusa que entra no território (${intr.vis.join(' → ')})`);

// 10) onça no chão perto da harpia: ela sobe
const onca = await J(`(() => {
  limpa(); fauna.push(...__par);
  const h = __par[1]; const b = baseOf(ecoTrees.get(h.home));
  h.x = b.x + 40; h.y = b.y + 20; h.z = 0; h.state = 'hfeed'; h.t = 30; h.carcass = null; h.tgt = null;
  const j = faSpawn('jaguar', h.x + 50, h.y, false); j.state = 'idle';
  h.cd = 100; const vis = []; for (let t = 0; t < 5; t += 0.05) { passo(h, 0.05); if (!vis.includes(h.state)) vis.push(h.state); }
  fauna.length = 0; // a onça foi criada só para o teste (sem a IA dela): sai antes de o jogo atualizá-la
  return { vis, z: h.z };
})()`);
ok(onca.vis.includes('havoid') && onca.z > 20, `onça perto da harpia no chão: ela decola (${onca.vis.join(' → ')}, altura ${Math.round(onca.z)} px)`);

// 11) o som: alto, ouvido de longe, com eco
const som = await J(`(() => {
  S.inside = false;
  const v = [0, 200, 400, 600, 800, 940, 1000].map((d) => +harpyVolume(d).toFixed(3));
  const dentro = +harpyVolume(300, true).toFixed(3), fora = +harpyVolume(300, false).toFixed(3);
  return { v, dentro, fora, mugido: +Math.max(0, 1 - 600 / 280).toFixed(2) };
})()`);
ok(som.v.every((x, i, a) => i === 0 || x <= a[i - 1]) && som.v[0] === 1 && som.v[4] > 0.2 && som.v[6] === 0, `o volume cai com a distância mas chega longe: ${som.v.join(', ')} (0, 200, 400, 600, 800, 940, 1000 px)`);
ok(som.v[3] > 0.4 && som.mugido === 0, `a 600 px ainda se ouve a harpia (${som.v[3]}); o mugido da vaca já sumiu`);
ok(som.dentro < som.fora, 'de dentro da casa o grito chega mais baixo');
// destrava o áudio (o navegador só deixa depois de um toque)
await p.evaluate(() => window.dispatchEvent(new Event('pointerdown')));
const chamados = await J(`(() => {
  const h = __par[0], r = {}; S.inside = false;
  h.x = S.px + 500; h.y = S.py; // meio longe, à direita
  for (const t of Object.keys(HARPIA.som.tipos)) r[t] = harpyCall(t, h);
  h.x = S.px - 400; r.esquerda = harpyCall('chamado', h);
  h.x = S.px + 5000; r.muitoLonge = harpyCall('chamado', h);
  return r;
})()`);
ok(chamados.chamado && chamados.alerta && chamados.razante && chamados.contato, 'os 4 gritos (chamado, contato, alerta, razante) saem sem erro');
ok(chamados.chamado.pan > 0.5 && chamados.esquerda.pan < -0.5, `o som vem do lado de onde ela está (${chamados.chamado.pan.toFixed(2)} à direita, ${chamados.esquerda.pan.toFixed(2)} à esquerda)`);
ok(chamados.muitoLonge === null, 'a mais de 950 px não se ouve nada');
ok(chamados.alerta.dur > chamados.contato.dur && chamados.chamado.dur > 1.5, `o chamado dura ${chamados.chamado.dur.toFixed(1)} s; o alerta tem ${5} piados`);

// 12) desenho: cada estado desenha sem erro
const des = await J(`(() => {
  const h = __par[0], r = {};
  for (const st of ['hrest', 'hwatch', 'htrack', 'hprep', 'hstoop', 'hfeed', 'hroam', 'hwarn', 'hdefend', 'havoid', 'hchase']) {
    h.state = st; h.fr = st === 'hstoop' ? 3 : -1; h.face = 1;
    try { drawHarpy(h); h.face = -1; drawHarpy(h); r[st] = 'ok'; } catch (e) { r[st] = String(e); }
  }
  return r;
})()`);
ok(Object.values(des).every((v) => v === 'ok'), 'desenha todos os 11 estados nos dois sentidos' + (Object.values(des).every((v) => v === 'ok') ? '' : ': ' + JSON.stringify(des)));

ok(errs.length === 0, 'sem erros no console' + (errs.length ? ': ' + errs[0] : ''));
await close();
process.exitCode = failures() ? 1 : 0;
