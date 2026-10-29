/**
 * Ferramentas do teste de ecossistema (rodam DENTRO do jogo via VDC.run). Instaladas uma vez por página.
 * O laço do jogo é parado e o tempo avança à mão (determinístico, com Math.random semeado).
 */
import { run } from './lib.mjs';

export async function installTools(p) {
  await p.evaluate(() => { window.requestAnimationFrame = () => 0; });
  await run(p, `(() => {
    const Pc = VDC.modules['entities/ai/Perception'];
    const Eco = VDC.modules['config/ecosystem'];
    const AS = VDC.modules['rendering/AnimalStatus'];
    const T = (globalThis.T = { Pc, Eco, AS });
    T.seed = (s) => { let a = s >>> 0; Math.random = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
    T.home = { x: S.px, y: S.py };
    { const an = fauna.find((a) => a.sp === 'anaconda'); T.snake = an ? { x: an.x, y: an.y } : null; } // a sucuri inicial mora na água: guarda o lugar
    T.C = { x: 0, y: 0 };
    T.field = (tx, ty, r = 16) => {            // campo limpo de grama: sem árvores/objetos/mato/água
      T.C = { x: tx * TS + 8, y: ty * TS + 8 };
      for (let y = ty - r; y <= ty + r; y++) for (let x = tx - r; x <= tx + r; x++) {
        const i = y * MW + x; ground[i] = GRASS; obj[i] = 0; mato[i] = 0; delete crops[i]; wet[i] = 0; shroom[i] = 0;
      }
    };
    T.open = (r = 14) => { T.reset(); const tx = (T.home.x / TS) | 0, ty = ((T.home.y / TS) | 0) - 4; T.field(tx, ty, r); T.player(T.C.x, T.C.y + 300); return T.C; }; // campo aberto no mapa; jogador longe do centro
    T.reset = () => {
      fauna.length = 0; TRAILS.length = 0; herd.length = 1; chx.length = 0; fox.length = 0;
      Pc.resetEcology(); Pc.playerFx.snareUntil = 0;
      S.jagDone = true; S.inside = false; S.vida = 100; S.vx = 0; S.vy = 0; S.min = 360; // 12:00
      setSleeping(false); setFaInitDone(true);
      T.isT = (a) => a.T;
    };
    T.mk = (sp, x, y, o = {}) => {
      const a = faSpawn(sp, x, y, false);
      if (sp === 'anaconda') anaInitA(a);
      Object.assign(a, { T: 1, age: 999, stam: 1, state: 'idle', t: 99, cd: 0, hun: 0.3, thi: 0.1, mv: false, dir: 0, sz: 1 }, o);
      return a;
    };
    T.player = (x, y) => { S.px = x; S.py = y; S.vx = 0; S.vy = 0; };
    T.tick = (dt) => {
      S.min += dt; updateFauna(dt);
      for (let i = fauna.length - 1; i >= 0; i--) if (!fauna[i].T) fauna.splice(i, 1); // faManage pode semear bichos: o teste só quer os seus
    };
    T.step = (dt, secs, f) => { const n = Math.round(secs / dt); for (let i = 0; i < n; i++) { T.tick(dt); if (f && f(i, i * dt)) return i * dt; } return secs; };
    T.d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    T.dP = (a) => Math.hypot(a.x - S.px, a.y - S.py);
    T.wall = (tx, ty0, ty1, code = ROCK) => { for (let y = ty0; y <= ty1; y++) obj[y * MW + tx] = code; };
    // jogador simulado: velocidade (px/s) numa direção; atualiza S.vx/S.vy (que a percepção usa) e a posição
    T.mv = (ang, sp, dt) => { S.vx = Math.cos(ang) * sp; S.vy = Math.sin(ang) * sp; S.px += S.vx * dt; S.py += S.vy * dt; };
    T.stand = () => { S.vx = 0; S.vy = 0; };
    T.render = () => { render(performance.now() / 1000); };
    return 1;
  })()`);
}
