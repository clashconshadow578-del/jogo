/**
 * Fase 2 da migração: o chão de grama parada desenhado pela GPU (PixiJS).
 *
 * Como era: para cada tile de grama parada o jogo copiava um pedacinho de 16x16 da imagem pré-pronta `fuseLayer`
 * (TileRenderer.js), ~600 cópias por quadro. Como fica: o PixiJS guarda a `fuseLayer` inteira como textura na placa de
 * vídeo e desenha o trecho visível de uma vez (1 sprite); o resultado vai para o canvas do jogo numa só cópia, recortada
 * apenas nos tiles escolhidos por pixiPlanTiles (TileRenderer.js). Os outros tiles continuam sendo desenhados ao vivo.
 *
 * Só funciona com ?pixi e com o PixiJS já pronto; senão devolve false e tudo roda como antes.
 */
import { TS } from '../../config/constants.js';
import { getPixi } from './PixiBridge.js';

const MODO_2D = typeof location !== 'undefined' && /[?&]pixi2d\b/.test(location.search);

let sprite = null,
  stage = null,
  boundSrc = null;

/**
 * Desenha no canvas `g` (já com a câmera aplicada) os tiles do recorte `plan.path`, vindos de `plan.fuse`; o trecho de
 * tiles [gx0..gx1] x [gy0..gy1] é o que o laço do chão visita. Devolve true se desenhou.
 */
export function pixiGroundDraw(g, plan, gx0, gx1, gy0, gy1) {
  const px = getPixi();
  if (!px) return false;
  if (g.isPixiCtx) {
    // camadas inteiras no PixiJS (PixiCtx.js): cada trecho de tiles vira 1 sprite da textura do chão, sem recorte nem cópia
    const r = plan.runs;
    for (let i = 0; i < r.length; i += 3)
      g.drawImage(plan.fuse, r[i], r[i + 1], r[i + 2], TS, r[i], r[i + 1], r[i + 2], TS);
    px.groundFrames = (px.groundFrames || 0) + 1;
    px.coveredTiles = plan.n;
    return true;
  }
  const { PIXI, app } = px;
  const w = (gx1 - gx0 + 1) * TS,
    h = (gy1 - gy0 + 1) * TS;
  if (w > app.canvas.width || h > app.canvas.height) return false; // não cabe no quadro do PixiJS: desenho antigo
  if (MODO_2D) {
    // ?pixi2d (só para testes): MESMA lógica da fase 2 (quais tiles, recorte, ordem), mas a cópia vem direto da imagem pronta
    // e não do WebGL. Serve para provar que a lógica não muda nenhum pixel, separando isso das diferenças do WebGL.
    g.save();
    g.clip(plan.path);
    g.drawImage(plan.fuse, gx0 * TS, gy0 * TS, w, h, gx0 * TS, gy0 * TS, w, h);
    g.restore();
    px.groundFrames = (px.groundFrames || 0) + 1;
    px.coveredTiles = plan.n;
    return true;
  }
  if (plan.fuse !== boundSrc) {
    // a imagem é pintada inteira uma vez e nunca muda: vira textura uma vez só
    sprite = new PIXI.Sprite(PIXI.Texture.from(plan.fuse));
    stage = new PIXI.Container();
    stage.addChild(sprite);
    boundSrc = plan.fuse;
  }
  sprite.x = -gx0 * TS;
  sprite.y = -gy0 * TS;
  app.renderer.render({ container: stage });
  g.save();
  g.clip(plan.path);
  g.drawImage(app.canvas, 0, 0, w, h, gx0 * TS, gy0 * TS, w, h);
  g.restore();
  px.groundFrames = (px.groundFrames || 0) + 1; // contador para os testes
  px.coveredTiles = plan.n; // mostrado no contador ?fps
  return true;
}
