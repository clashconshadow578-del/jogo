#!/usr/bin/env python3
"""Monta a folha de sprites da sucuri do jogo (public/assets/sprites/animals/anaconda.webp) a partir de tools/anaconda/folha-sucuri.jpg.

A folha de origem vem com o xadrez "de transparência" gravado na imagem (JPEG), sombras cinza e legendas riscadas de roxo. Aqui:
  1. fundo = pixels cinza (xadrez, sombra, texto branco: quase sem saturação); roxo do risco = fundo; cobra = o resto;
  2. cada cobra é um pedaço separado da máscara (12 no total) e é reconhecida pela posição:
       linha 1: deslizando para a ESQUERDA (2 quadros)      linha 2: deslizando para a DIREITA (2 quadros)
       linha 3: enrolada, de frente (4 quadros)             linha 4: enrolada, com a cabeça levantada (4 quadros)
  3. cada cobra é reduzida para o tamanho de jogo (média por área só dos pixels da cobra, sem franja cinza; alfa em 0/255);
  4. os quadros vão para uma folha de 5 linhas x 4 colunas de F x F px, com a CABEÇA no mesmo ponto em todos os quadros que deslizam
     (x = CABECA da borda da cabeça, y = F/2) e o centro da cobra em (F/2, F/2) nos quadros enrolados. O jogo (entities/wild/Anaconda.js)
     usa esses pontos como âncora, gira os quadros em 90 graus para cima e para baixo e estica o corpo ao redor da presa engolida.

Linhas da folha gerada (4 colunas): 0 = esquerda e 1 = direita (2 quadros cada), 2 = enrolada de frente (parada, descansando) e
3 = enrolada com a cabeça levantada (pronta para o bote). Veja ANA.ROW em Anaconda.js.

Uso:  python3 tools/anaconda/make-anaconda.py [--previa]      (requer Pillow, numpy e scipy; ferramenta opcional, fora do jogo)
      --previa grava tools/anaconda/previa-sucuri.png: a folha sobre um fundo verde, para conferir a olho.
"""
import os
import sys
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

AQUI = os.path.dirname(os.path.abspath(__file__))
SAIDA = os.path.join(AQUI, '..', '..', 'public', 'assets', 'sprites', 'animals', 'anaconda.webp')
PREVIA = os.path.join(AQUI, 'previa-sucuri.png')
F = 160            # lado de cada quadro da folha (px de jogo)
LONGO = 128        # comprimento da cobra esticada (px de jogo)
CABECA = 10        # coluna da ponta da cabeça nos quadros que deslizam (do lado da cabeça)


def mascara(a):
    mx, mn = a.max(2), a.min(2)
    bg = ((mx - mn) < 16) & (mx > 38)                                   # cinza do xadrez, sombra e texto branco
    roxo = ((a[..., 0] - a[..., 1]) > 12) & ((a[..., 2] - a[..., 1]) > 5) & (mx < 130)   # risco roxo sobre as legendas
    cinza = ((mx - mn) < 34) & (mx > 105)                  # resto da sombra (cinza-quente) colado na cobra; as manchas claras do dorso que caírem aqui são refeitas em limpar()
    fg = ~bg & ~roxo & ~cinza
    return ndi.binary_opening(fg, iterations=1)


def limpar(mm):
    """Tira os pontinhos soltos da sombra e tapa os buracos pequenos (as manchas claras do dorso, de cinza-oliva quase sem saturação, caem
    como "fundo" na máscara): buracos de até ~2500 px da folha de origem fecham; vãos grandes (entre as voltas de uma cobra enrolada) ficam."""
    m = ndi.binary_closing(mm, iterations=3)
    lab, n = ndi.label(~m)
    if n:
        tam = ndi.sum(~m, lab, range(1, n + 1))
        for i, t in enumerate(tam):
            if t <= 2500 and not (lab[0, :] == i + 1).any() and not (lab[-1, :] == i + 1).any() and not (lab[:, 0] == i + 1).any() and not (lab[:, -1] == i + 1).any():
                m |= lab == i + 1
    nucleo = ndi.binary_opening(m, iterations=3)           # o corpo sem fios finos nem pontos
    lab, n = ndi.label(nucleo)
    if n:
        maior = int(np.argmax(ndi.sum(nucleo, lab, range(1, n + 1)))) + 1
        nucleo = lab == maior
    return m & ndi.binary_dilation(nucleo, iterations=4)


def achar(m):
    """As 12 cobras: (caixa, máscara) em quatro linhas, cada uma ordenada da esquerda para a direita."""
    lab, n = ndi.label(ndi.binary_dilation(m, iterations=3))
    tam = ndi.sum(m, lab, range(1, n + 1))
    objs = ndi.find_objects(lab)
    cobras = []
    for i, (t, o) in enumerate(zip(tam, objs)):
        if t < 3000:
            continue
        mm = limpar(m & (lab == i + 1))
        cobras.append((o, mm))
    cobras.sort(key=lambda c: (c[0][0].start + c[0][0].stop) / 2)
    linhas = []
    for o, mm in cobras:
        cy = (o[0].start + o[0].stop) / 2
        if linhas and abs(cy - linhas[-1][0]) < 120:
            linhas[-1][1].append((o, mm))
        else:
            linhas.append([cy, [(o, mm)]])
    linhas = [sorted(l[1], key=lambda c: c[0][1].start) for l in linhas]
    if [len(l) for l in linhas] != [2, 2, 4, 4]:
        raise SystemExit('esperava 2+2+4+4 cobras, achei ' + str([len(l) for l in linhas]))
    return linhas


def reduzir(a, mm, o, k):
    """Recorta a cobra, reduz k vezes (média por área só da cobra) e devolve RGBA com alfa 0/255."""
    ys, xs = o
    rgb = a[ys, xs].astype(np.float64)
    m = mm[ys, xs].astype(np.float64)
    h, w = m.shape
    nw, nh = max(1, round(w * k)), max(1, round(h * k))

    def red(canal):
        return np.array(Image.fromarray(canal.astype(np.float32), 'F').resize((nw, nh), Image.BOX))

    cob = red(m)
    sai = np.zeros((nh, nw, 4), np.uint8)
    cor = np.stack([red(rgb[..., i] * m) for i in range(3)], -1) / np.maximum(cob[..., None], 1e-6)
    sai[..., :3] = np.clip(cor, 0, 255).astype(np.uint8)
    sai[..., 3] = np.where(cob >= 0.5, 255, 0)
    sai = realce(sai)
    return sai


def realce(px):
    """A média por área escurece e empasta as cores: devolve um pouco de brilho e saturação para a cobra ler bem pequena, sob a luz do jogo."""
    rgb = px[..., :3].astype(np.float64) / 255
    lum = rgb.mean(2, keepdims=True)
    rgb = lum + (rgb - lum) * 1.25
    rgb = (rgb - 0.45) * 1.12 + 0.45 + 0.05
    px = px.copy()
    px[..., :3] = np.clip(rgb * 255, 0, 255).astype(np.uint8)
    px[px[..., 3] == 0, :3] = 0
    return px


def caixa(px):
    ys, xs = np.nonzero(px[..., 3])
    return xs.min(), xs.max(), ys.min(), ys.max()


def colar(folha, px, col, lin, ax, ay):
    """Cola `px` no quadro (col, lin) de modo que o ponto (ax, ay) do `px` fique na âncora do quadro (passada em coordenadas do quadro)."""
    h, w = px.shape[:2]
    x0, y0 = col * F + ax, lin * F + ay
    for yy in range(h):
        for xx in range(w):
            X, Y = x0 + xx, y0 + yy
            if px[yy, xx, 3] and col * F <= X < (col + 1) * F and lin * F <= Y < (lin + 1) * F:
                folha[Y, X] = px[yy, xx]


def main():
    a = np.array(Image.open(os.path.join(AQUI, 'folha-sucuri.jpg')).convert('RGB')).astype(np.int32)
    linhas = achar(mascara(a))
    larg = [o[1].stop - o[1].start for l in linhas[:2] for o, _ in l]
    k = LONGO / float(np.median(larg))
    print('escala', round(k, 4), 'larguras de origem', larg)
    folha = np.zeros((4 * F, 4 * F, 4), np.uint8)
    # deslizando: linha 0 = esquerda, linha 1 = direita; a cabeça fica na âncora (CABECA, F/2) ou (F-1-CABECA, F/2)
    for lin in range(2):
        for col, (o, mm) in enumerate(linhas[lin]):
            px = reduzir(a, mm, o, k)
            x0, x1, y0, y1 = caixa(px)
            esq = lin == 0
            ponta = x0 if esq else x1                               # ponta da cabeça
            faixa = range(ponta, ponta + 7) if esq else range(ponta - 6, ponta + 1)
            ys = np.nonzero(px[:, list(faixa), 3].any(1))[0]
            cy = int(round(ys.mean()))
            ax = (CABECA - ponta) if esq else (F - 1 - CABECA - ponta)
            colar(folha, px, col, lin, ax, F // 2 - cy)
    # enroladas: centro da cobra em (F/2, F/2); linha 2 = de frente (descansando), linha 3 = cabeça levantada (pronta para o bote)
    for lin in (2, 3):
        for col, (o, mm) in enumerate(linhas[lin]):
            px = reduzir(a, mm, o, k)
            x0, x1, y0, y1 = caixa(px)
            colar(folha, px, col, lin, F // 2 - (x0 + x1) // 2, F // 2 - (y0 + y1) // 2)
    img = Image.fromarray(folha, 'RGBA')
    os.makedirs(os.path.dirname(SAIDA), exist_ok=True)
    img.save(SAIDA, lossless=True, quality=100, method=6)
    print('gravado', os.path.relpath(SAIDA), img.size)
    if '--previa' in sys.argv:
        fundo = Image.new('RGBA', img.size, (120, 160, 110, 255))
        fundo.alpha_composite(img)
        fundo.save(PREVIA)
        print('prévia', os.path.relpath(PREVIA))


if __name__ == '__main__':
    main()
