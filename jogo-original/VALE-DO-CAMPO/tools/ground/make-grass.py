#!/usr/bin/env python3
"""
Gera public/assets/sprites/ground/grass.png: textura de grama rasteira 256x256 px (16x16 tiles de
16 px) que se repete sem emendas. A paleta foi amostrada de uma ilustração de referência
(grama baixa, amarelo-esverdeada, com manchas de sombra de folhagem e floreos minúsculos).

Uso (opcional; o PNG já está no projeto):
    python3 tools/ground/make-grass.py                 # versão do jogo (verde um pouco mais vivo)
    python3 tools/ground/make-grass.py --fiel          # cores exatamente como na ilustração
    python3 tools/ground/make-grass.py --matiz=25 --sat=1.2 [saida.png]
Requer: Pillow e numpy. A semente é fixa, então o resultado é sempre o mesmo.

A ilustração tem luz dourada (matiz ~65 graus, bem amarelada); o jogo é mais verde (~105 graus).
Por padrão a paleta é deslocada +20 graus de matiz e 15% de saturação, como meio-termo.
"""
import colorsys
import os
import sys
import numpy as np
from PIL import Image

N = 256
SEED = 64
PAL = ['#536e34', '#71833b', '#96a04a', '#b2ba57', '#c8cc5e', '#dbd07b']
WHITE, YELLOW = '#f1eedd', '#e6c441'


HUE_SHIFT = 20.0  # graus
SAT_BOOST = 1.15


def rgb(h, tune=True):
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (1, 3, 5))
    if tune and h not in (WHITE, YELLOW):
        hh, ss, vv = colorsys.rgb_to_hsv(r, g, b)
        r, g, b = colorsys.hsv_to_rgb((hh + HUE_SHIFT / 360) % 1, min(1, ss * SAT_BOOST), vv)
    return tuple(int(round(c * 255)) for c in (r, g, b))


def noise(period, seed):
    """Ruído de valor periódico (emenda perfeita nas bordas), interpolação suave."""
    g = np.random.default_rng(seed).random((period, period))
    u = np.arange(N) / (N / period)
    i0 = np.floor(u).astype(int) % period
    i1 = (i0 + 1) % period
    f = u - np.floor(u)
    f = f * f * (3 - 2 * f)
    a = g[np.ix_(i0, i0)] * (1 - f)[None, :] * (1 - f)[:, None]
    b = g[np.ix_(i0, i1)] * f[None, :] * (1 - f)[:, None]
    c = g[np.ix_(i1, i0)] * (1 - f)[None, :] * f[:, None]
    d = g[np.ix_(i1, i1)] * f[None, :] * f[:, None]
    return a + b + c + d


def quant(field, shares):
    """Converte um campo contínuo em índices de paleta com as proporções dadas."""
    cuts = np.cumsum(shares)[:-1]
    th = np.quantile(field, cuts)
    return np.digitize(field, th)


def main(out):
    rng = np.random.default_rng(SEED)
    # tons de fundo: calmos, quase só os três médios da paleta (como a grama baixa da referência)
    tone = 0.30 * noise(8, 1) + 0.25 * noise(16, 2) + 0.25 * noise(32, 3) + 0.20 * noise(64, 4)
    idx = quant(tone, [0.03, 0.22, 0.44, 0.27, 0.04]) + 1
    idx = np.clip(idx, 1, 5)

    # poucas manchas pequenas de sombra de folhagem
    leaf = 0.5 * noise(32, 5) + 0.5 * noise(64, 6)
    idx = np.where(leaf > np.quantile(leaf, 0.975), np.minimum(idx, 1), idx)

    img = np.array([rgb(PAL[i]) for i in idx.ravel()], dtype=np.uint8).reshape(N, N, 3)

    def put(x, y, col):
        img[y % N, x % N] = rgb(col)

    # fiapos de capim: 2-3 px, um passo mais escuros (e alguns mais claros) que o fundo local
    for _ in range(900):
        x, y = int(rng.integers(N)), int(rng.integers(N))
        base = int(idx[y, x])
        up = rng.random() < 0.35
        body = PAL[min(5, base + 1)] if up else PAL[max(0, base - 1)]
        tip = PAL[min(5, base + 2)] if up else PAL[max(0, base - 1)]
        h = int(rng.integers(2, 4))
        lean = int(rng.integers(-1, 2))
        for k in range(h):
            put(x + (lean if k == h - 1 else 0), y - k, tip if k == h - 1 else body)
    # flores minúsculas (1 px), bem esparsas
    for _ in range(18):
        put(int(rng.integers(N)), int(rng.integers(N)), WHITE)
    for _ in range(22):
        put(int(rng.integers(N)), int(rng.integers(N)), YELLOW)

    os.makedirs(os.path.dirname(out), exist_ok=True)
    Image.fromarray(img, 'RGB').save(out, optimize=True)
    print('ok', out, os.path.getsize(out), 'bytes')


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    for a in sys.argv[1:]:
        if a == '--fiel':
            HUE_SHIFT, SAT_BOOST = 0.0, 1.0
        elif a.startswith('--matiz='):
            HUE_SHIFT = float(a.split('=')[1])
        elif a.startswith('--sat='):
            SAT_BOOST = float(a.split('=')[1])
    sys.argv = [sys.argv[0]] + args
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(root, 'public/assets/sprites/ground/grass.png'))
