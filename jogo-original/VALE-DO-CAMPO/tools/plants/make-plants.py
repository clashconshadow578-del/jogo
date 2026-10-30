#!/usr/bin/env python3
"""Recorta a folha de sprites das plantas amazônicas (tools/plants/folha-plantas.jpg) em 8 PNGs de fundo transparente.

A folha vem com o xadrez "de transparência" gravado na imagem (JPEG) e legendas "FASE n". Aqui:
  1. fundo = pixels cinza (xadrez e texto branco: quase sem saturação); planta = o resto;
  2. cada célula da grade (2 linhas x 4 fases) vira uma máscara limpa (sem ruído, sem buracos);
  3. recorta a caixa da planta, reduz para o tamanho de jogo (média por área, alfa em 0/255 para a borda ficar nítida);
  4. grava public/assets/sprites/plants/<especie>_<fase>.png (linha de cima = helicônia, de baixo = samambaia).

Uso:  python3 tools/plants/make-plants.py      (requer Pillow, numpy e scipy; ferramenta opcional, fora do jogo)
"""
import os
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

AQUI = os.path.dirname(os.path.abspath(__file__))
SAIDA = os.path.join(AQUI, '..', '..', 'public', 'assets', 'sprites', 'plants')
ESPECIES = ['helikonia', 'samambaia']          # linha 0, linha 1
LARGURA = [16, 22, 28, 34]                       # largura final (px de jogo) por fase; a altura segue a proporção
COLUNAS = [0.0, 0.215, 0.51, 0.745, 1.0]       # limites das 4 fases na largura da folha
LINHAS = [0.0, 0.5, 1.0]


def mascara(a):
    mx, mn = a.max(2), a.min(2)
    bg = ((mx - mn) < 16) & (mx > 38)             # cinza do xadrez e branco do texto
    fg = ndi.binary_opening(~bg, iterations=1)
    return ndi.binary_fill_holes(ndi.binary_closing(fg, iterations=3))


def realce(px):
    """A média por área escurece e empasta as cores: devolve brilho e saturação (e um pouco de contraste) para a
    sprite ler bem em tamanho pequeno, sob a luz do jogo."""
    rgb = px[..., :3].astype(np.float64) / 255
    lum = rgb.mean(2, keepdims=True)
    rgb = lum + (rgb - lum) * 1.3                  # saturação
    rgb = (rgb - 0.45) * 1.18 + 0.45 + 0.07         # contraste e brilho
    px = px.copy()
    px[..., :3] = np.clip(rgb * 255, 0, 255).astype(np.uint8)
    px[px[..., 3] == 0, :3] = 0
    return px


def main():
    im = Image.open(os.path.join(AQUI, 'folha-plantas.jpg')).convert('RGB')
    a = np.array(im).astype(np.int32)
    H, W = a.shape[:2]
    m = mascara(a)
    os.makedirs(SAIDA, exist_ok=True)
    for r, esp in enumerate(ESPECIES):
        for f in range(4):
            x0, x1 = int(COLUNAS[f] * W), int(COLUNAS[f + 1] * W)
            y0, y1 = int(LINHAS[r] * H), int(LINHAS[r + 1] * H)
            mm = m[y0:y1, x0:x1]
            lab, n = ndi.label(ndi.binary_dilation(mm, iterations=4))
            if n == 0:
                raise SystemExit(f'{esp} fase {f + 1}: nada encontrado')
            # fica com os pedaços de bom tamanho (descarta restos do texto e do ruído)
            tam = ndi.sum(mm, lab, range(1, n + 1))
            ok = np.isin(lab, [k + 1 for k, t in enumerate(tam) if t > tam.max() * 0.01])
            mm = mm & ok
            mm = ndi.binary_erosion(mm, iterations=1) | (mm & ~ndi.binary_erosion(mm, iterations=3))  # tira o halo do JPEG
            ys, xs = np.where(mm)
            by0, by1, bx0, bx1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
            rgb = a[y0:y1, x0:x1][by0:by1, bx0:bx1].astype(np.float64)
            al = mm[by0:by1, bx0:bx1].astype(np.float64)
            w = LARGURA[f]
            h = max(1, round((by1 - by0) * w / (bx1 - bx0)))
            # média por área ponderada pelo alfa (cores do fundo não vazam para a borda)
            def red(x):
                return np.array(Image.fromarray(x.astype(np.float32), 'F').resize((w, h), Image.BOX))
            A = red(al)
            out = np.zeros((h, w, 4), np.uint8)
            for c in range(3):
                out[..., c] = np.clip(red(rgb[..., c] * al) / np.maximum(A, 1e-6), 0, 255)
            out[..., 3] = np.where(A >= 0.5, 255, 0)
            out[out[..., 3] == 0, :3] = 0
            out = realce(out)
            Image.fromarray(out, 'RGBA').save(os.path.join(SAIDA, f'{esp}_{f + 1}.png'), optimize=True)
            print(f'{esp}_{f + 1}.png  {w}x{h}')


if __name__ == '__main__':
    main()
