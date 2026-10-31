#!/usr/bin/env python3
"""Monta as folhas de sprites da harpia do jogo a partir das 4 folhas de origem (tools/harpia/folha-*.jpg).

As folhas de origem são pixel art AMPLIADA sem suavização (cada pixel original virou um bloco de 6,25 px; 5 px na folha do razante), com o xadrez "de
transparência" gravado na imagem (JPEG, com dois tons de cinza diferentes em cada folha). Todas as harpias olham para a direita. Aqui, para cada folha:
  1. acha a grade do pixel original (período e fase nos dois eixos, pelas bordas da ave) e lê UMA cor por pixel original (a mediana do centro do
     bloco): a folha volta ao tamanho nativo, nítida, sem o borrão que uma redução por média faria;
  2. o fundo é o que é NEUTRO (quase sem saturação) e claro como o xadrez daquela folha; a ave é o resto;
  3. cada quadro é a célula da grade (colunas x linhas) onde o artista o desenhou; fica só o maior pedaço da célula (some o quadradinho cinza
     solto e a peça de pata solta que sobraram em algumas folhas) e os buracos pequenos fecham (a "calça" de penas da coxa é um padrão quadriculado
     com os mesmos tons do fundo, que vira buraco na máscara);
  4. todos os quadros de uma folha usam a MESMA janela de recorte (a união das caixas das aves, medida na célula), então continuam registrados entre
     si como o artista desenhou (o corpo balança, os pés andam...), e são ajustados à escala da folha (1,0 = tamanho nativo; menor reduz por média da
     ave com um pouco de nitidez; alfa em 0/255);
  5. saem public/assets/sprites/animals/harpy/<nome>.webp (grade de quadros, mesma ordem da origem) e src/config/harpiaSprites.js (tamanho do quadro,
     número de quadros e o ponto de âncora de cada folha: o pé nas folhas em pé, o centro do corpo nas que voam).

Uso:  python3 tools/harpia/make-harpia.py [--previa]      (requer Pillow, numpy e scipy; ferramenta opcional, fora do jogo)
      --previa grava tools/harpia/previa-<nome>.png: cada folha sobre um fundo verde, para conferir a olho.
"""
import json
import os
import sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

AQUI = os.path.dirname(os.path.abspath(__file__))
SAIDA = os.path.join(AQUI, '..', '..', 'public', 'assets', 'sprites', 'animals', 'harpy')
CONFIG = os.path.join(AQUI, '..', '..', 'src', 'config', 'harpiaSprites.js')

# nome, arquivo, colunas, linhas, quadros, escala sobre o tamanho NATIVO do pixel art (1,0 = nativo), âncora ('pe' = pé no chão, 'corpo' = centro do corpo)
FOLHAS = [
    ('andar', 'folha-andando.jpg', 6, 3, 18, 0.5, 'pe'),       # andando no chão
    ('parada', 'folha-parada.jpg', 6, 4, 23, 0.5, 'pe'),       # pousada: observando, piscando
    ('voo', 'folha-voo.jpg', 4, 3, 12, 0.65, 'corpo'),         # voando (bater de asas)
    ('razante', 'folha-razante.jpg', 3, 4, 12, 0.45, 'corpo'),  # razante: asas recolhidas e garras à frente
]
FOLGA = 10      # px nativos a mais em volta da célula ao procurar a ave (as asas passam um pouco da célula)
BURACO = 70     # buracos de até ~este tamanho (px nativos) fecham


def niveis(a):
    """Os dois tons de cinza do xadrez desta folha, pelos picos do brilho na borda."""
    H, W, _ = a.shape
    m = np.zeros((H, W), bool)
    m[:14, :] = m[:, :14] = m[-14:, :] = m[:, -14:] = True
    v = a.max(2)[m].astype(int)
    h = np.convolve(np.bincount(v, minlength=256).astype(float), np.ones(5), 'same')
    med = int(np.median(v))
    return int(np.argmax(h[:med])), med + int(np.argmax(h[med:]))


def fundo_alto(a):
    """Máscara do fundo na resolução da imagem: qualquer neutro claro (os dois tons do xadrez e os tons intermediários dos quadradinhos soltos);
    o neutro claro DENTRO da ave (a "calça" de penas) fecha depois como buraco."""
    mx, mn = a.max(2), a.min(2)
    p1, p2 = niveis(a)
    return ((mx - mn) <= 4) & (mx >= min(p1, p2) - 9)


def ajustar(perfil, lo=4.6, hi=7.4):
    """Período e fase (px) da grade de degraus do pixel art, pelo perfil de bordas: onde a soma nas bordas da grade mais passa a soma no meio dos blocos."""
    n = len(perfil)
    xs = np.arange(n)
    melhor = (-1.0, None, None)
    for p in np.arange(lo, hi, 0.004):
        for ph in np.arange(0, p, 0.25):
            pos = ph + np.arange(0, int((n - ph) / p)) * p
            sc = np.interp(pos, xs, perfil).mean() - np.interp(pos + p / 2, xs, perfil).mean()
            if sc > melhor[0]:
                melhor = (sc, p, ph)
    return melhor[1], melhor[2]


def nativo(a):
    """A folha na resolução do pixel art original: (rgb, máscara da ave) com UMA cor por pixel original. Também devolve a grade achada."""
    fg = ndi.binary_dilation(~fundo_alto(a), iterations=2)
    g = a.mean(2)
    gx = np.abs(np.diff(g, axis=1)) * fg[:, 1:]
    gy = np.abs(np.diff(g, axis=0)) * fg[1:, :]
    px, fx = ajustar(gx.sum(0))
    py, fy = ajustar(gy.sum(1))
    H, W, _ = a.shape
    nw, nh = int((W - fx) / px), int((H - fy) / py)
    bg = fundo_alto(a)
    rgb = np.zeros((nh, nw, 3))
    ave = np.zeros((nh, nw), bool)
    for j in range(nh):
        y0, y1 = fy + (j + 0.25) * py, fy + (j + 0.75) * py
        for i in range(nw):
            x0, x1 = fx + (i + 0.25) * px, fx + (i + 0.75) * px
            blk = a[int(y0):max(int(y0) + 1, int(y1)), int(x0):max(int(x0) + 1, int(x1))]
            rgb[j, i] = np.median(blk.reshape(-1, 3), axis=0)
            ave[j, i] = bg[int(y0):max(int(y0) + 1, int(y1)), int(x0):max(int(x0) + 1, int(x1))].mean() < 0.5
    ave = ndi.binary_opening(ave, structure=np.ones((2, 2)))  # tira pontinhos soltos de 1 pixel
    # contorno claro: pixels de borda que misturam o fundo (neutros e claros, encostando no fundo) saem; o creme do peito (colorido) fica
    sat = rgb.max(2) - rgb.min(2)
    for _ in range(2):
        borda = ave & ~ndi.binary_erosion(ave, border_value=1)
        ave = ave & ~(borda & (sat <= 9) & (rgb.max(2) >= 175))
    return rgb, ave, (px, py)


def quadro(m, x0, y0, x1, y1):
    """A ave da janela (x0, y0, x1, y1): só o maior pedaço, com os buracos pequenos fechados. Devolve a máscara da janela inteira."""
    sub = m[y0:y1, x0:x1]
    lab, n = ndi.label(ndi.binary_dilation(sub, iterations=1), structure=np.ones((3, 3)))
    if n == 0:
        return np.zeros_like(sub)
    tam = ndi.sum(sub, lab, range(1, n + 1))
    maior = lab == (int(np.argmax(tam)) + 1)
    s = sub & maior
    lab, n = ndi.label(~s)
    for i, t in enumerate(ndi.sum(~s, lab, range(1, n + 1))):
        if t <= BURACO and not ((lab[0, :] == i + 1).any() or (lab[-1, :] == i + 1).any() or (lab[:, 0] == i + 1).any() or (lab[:, -1] == i + 1).any()):
            s |= lab == i + 1
    return s


def ajustar_escala(rgb, m, k, nw, nh):
    """Do tamanho nativo para o do jogo: k = 1 não muda; k < 1 reduz por média SÓ da ave (sem franja) e devolve um pouco de nitidez e saturação; alfa em 0/255."""
    if k == 1:
        sai = np.zeros(m.shape + (4,), np.uint8)
        sai[..., :3] = np.clip(rgb, 0, 255).astype(np.uint8)
        sai[..., 3] = np.where(m, 255, 0)
        sai[~m, :3] = 0
        return sai
    mf = m.astype(np.float64)

    def red(c):
        return np.array(Image.fromarray(c.astype(np.float32), 'F').resize((nw, nh), Image.BOX))

    cob = red(mf)
    cor = np.stack([red(rgb[..., i] * mf) for i in range(3)], -1) / np.maximum(cob[..., None], 1e-6)
    lum = cor.mean(2, keepdims=True)
    cor = lum + (cor - lum) * 1.15  # saturação
    borr = ndi.gaussian_filter(cor, (0.7, 0.7, 0))
    cor = np.clip(cor + 0.6 * (cor - borr), 0, 255)  # nitidez (máscara de nitidez)
    sai = np.zeros((nh, nw, 4), np.uint8)
    sai[..., :3] = np.clip(cor, 0, 255).astype(np.uint8)
    sai[..., 3] = np.where(cob >= 0.5, 255, 0)
    sai[sai[..., 3] == 0, :3] = 0
    return sai


def main():
    previa = '--previa' in sys.argv
    os.makedirs(SAIDA, exist_ok=True)
    cfg = {}
    for nome, arq, cols, rows, n, k, ancora in FOLHAS:
        a = np.array(Image.open(os.path.join(AQUI, arq)).convert('RGB')).astype(np.float64)
        rgb, m, (px, py) = nativo(a)
        H, W = m.shape
        cw, ch = W / cols, H / rows
        janelas, masc = [], []
        for q in range(n):
            r, c = divmod(q, cols)
            x0, y0 = int(round(c * cw)), int(round(r * ch))
            ex0, ey0, ex1, ey1 = max(0, x0 - FOLGA), max(0, y0 - FOLGA), min(W, int(round((c + 1) * cw)) + FOLGA), min(H, int(round((r + 1) * ch)) + FOLGA)
            sm = quadro(m, ex0, ey0, ex1, ey1)
            ys, xs = np.nonzero(sm)
            if len(xs) == 0:
                raise SystemExit(f'{nome}: quadro {q} vazio')
            janelas.append((xs.min() + ex0 - x0, ys.min() + ey0 - y0, xs.max() + ex0 - x0 + 1, ys.max() + ey0 - y0 + 1))
            masc.append((sm, ex0, ey0, x0, y0))
        ux0, uy0 = min(j[0] for j in janelas), min(j[1] for j in janelas)
        ux1, uy1 = max(j[2] for j in janelas), max(j[3] for j in janelas)
        uw, uh = ux1 - ux0, uy1 - uy0
        fw, fh = (uw, uh) if k == 1 else (int(np.ceil(uw * k)) + 1, int(np.ceil(uh * k)) + 1)
        folha = np.zeros((rows * fh, cols * fw, 4), np.uint8)
        ox_, oy_, mi = [], [], []
        for q in range(n):
            sm, ex0, ey0, x0, y0 = masc[q]
            r, c = divmod(q, cols)
            # janela da união (em pixels nativos), preenchida com a ave deste quadro
            jr = np.zeros((uh, uw, 3))
            jm = np.zeros((uh, uw), bool)
            wx0, wy0 = x0 + ux0, y0 + uy0
            for yy in range(uh):
                sy = wy0 + yy
                ay = sy - ey0
                if sy < 0 or sy >= H or ay < 0 or ay >= sm.shape[0]:
                    continue
                xa, xb = max(wx0, ex0), min(wx0 + uw, ex0 + sm.shape[1], W)
                if xb <= xa:
                    continue
                jm[yy, xa - wx0:xb - wx0] = sm[ay, xa - ex0:xb - ex0]
                jr[yy, xa - wx0:xb - wx0] = rgb[sy, xa:xb]
            red = ajustar_escala(jr, jm, k, fw, fh)
            folha[r * fh:r * fh + red.shape[0], c * fw:c * fw + red.shape[1]] = red
            op = np.nonzero(red[..., 3])
            ox_.append(op[1].mean())
            oy_.append(op[0].mean())
            mi.append(op[0].max() + 1)
        # âncora: pé = base média da ave, x = centro de massa médio; corpo = centro de massa médio
        ax = float(np.mean(ox_)) + 0.5
        ay = float(np.mean(mi)) if ancora == 'pe' else float(np.mean(oy_)) + 0.5
        cfg[nome] = {'cols': cols, 'rows': rows, 'n': n, 'w': int(fw), 'h': int(fh), 'ax': round(ax, 1), 'ay': round(ay, 1)}
        img = Image.fromarray(folha, 'RGBA')
        img.save(os.path.join(SAIDA, nome + '.webp'), lossless=True, quality=100, method=6)
        print(nome, f'grade {px:.2f}x{py:.2f} px; {fw}x{fh} por quadro (nativo {uw}x{uh}), {n} quadros, âncora ({ax:.1f}, {ay:.1f}), escala {k}')
        if previa:
            f = Image.new('RGBA', img.size, (120, 160, 110, 255))
            f.alpha_composite(img)
            f.save(os.path.join(AQUI, f'previa-{nome}.png'))
    with open(CONFIG, 'w', encoding='utf-8') as f:
        f.write('/**\n * Medidas das folhas de sprites da harpia (public/assets/sprites/animals/harpy/<nome>.webp). GERADO por tools/harpia/make-harpia.py: não edite à mão.\n'
                ' * `w` x `h` é o tamanho de cada quadro; `ax`, `ay` o ponto do quadro que fica na posição da ave (o pé, nas folhas em pé; o centro do corpo, nas que voam).\n'
                ' * Todos os quadros olham para a direita (a esquerda é o espelho).\n */\n')
        f.write('export const HARPIA_FOLHAS = ' + json.dumps(cfg, indent=2) + ';\n')
    print('gravado', os.path.relpath(CONFIG))


if __name__ == '__main__':
    main()
