/**
 * Tela cheia: o botão ⛶, a tecla F e o botão do menu entram e saem da tela cheia, e o estado visual acompanha.
 * Uso: NODE_PATH=$(npm root -g) node tests/browser/fullscreen.mjs
 */
import { launch, ok, failures } from './lib.mjs';
const { p, errs, close } = await launch({ width: 1000, height: 600 });
await p.waitForTimeout(2000);
const fs = () => p.evaluate(() => !!document.fullscreenElement);
ok(await p.evaluate(() => !!document.getElementById('fsBtn')), 'botão ⛶ existe');
ok(!(await fs()), 'começa fora da tela cheia');
await p.click('#fsBtn');
await p.waitForTimeout(400);
ok(await fs(), 'clique no botão entra em tela cheia');
ok(await p.evaluate(() => document.getElementById('fsBtn').classList.contains('on')), 'botão fica marcado');
await p.keyboard.press('f');
await p.waitForTimeout(400);
ok(!(await fs()), 'tecla F sai da tela cheia');
await p.keyboard.press('f');
await p.waitForTimeout(400);
ok(await fs(), 'tecla F entra em tela cheia');
await p.evaluate(() => document.exitFullscreen());
await p.waitForTimeout(300);
await p.evaluate(() => (document.getElementById('menu').style.display = 'block'));
await p.click('#fsMenuBtn');
await p.waitForTimeout(400);
ok(await fs(), 'botão do menu entra em tela cheia');
ok((await p.evaluate(() => document.getElementById('fsMenuBtn').textContent)).includes('Sair'), 'texto do menu muda para "Sair"');
ok(errs.filter((e) => !/manifest|icon-|404/.test(e)).length === 0, 'sem erros no console ' + errs.join(' | '));
await close();
process.exit(failures() ? 1 : 0);
