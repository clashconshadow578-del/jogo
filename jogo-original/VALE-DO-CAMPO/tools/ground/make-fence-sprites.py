#!/usr/bin/env python3
"""Monta a folha de sprites da cerca a partir da folha de referência fornecida (fence-reference.png).

Uso: python3 tools/ground/make-fence-sprites.py [pasta_de_saida]

A referência é uma prancha com rótulos e fundo xadrez. Este script:
  1. separa cada peça da prancha (remove o xadrez, os rótulos e as franjas claras da borda e limpa pontinhos soltos);
  2. monta os 20 quadros do jogo reaproveitando as peças da prancha, todas na mesma escala e com a mesma luz:
       - poste e braços de estacas (esquerda/direita) vêm do trecho reto nº 16: o braço tem 3 estacas, de fresta
         a fresta, então as fileiras emendam sem falha de um tile para o outro;
       - cerca que segue para o Sul: travessa vertical feita do miolo do tronco, que liga um poste ao de baixo;
       - portões: fechado/aberto horizontal (nº 54 e 52) e vertical (nº 45 e 48).

Saída (public/assets/sprites/objects/ por padrão):
  fence.png   20 quadros de 120x144 lado a lado (2400x144):
                0..15  cerca por conexões (bit 1=Norte, 2=Leste, 4=Sul, 8=Oeste)
                16     portão horizontal fechado   17  portão horizontal aberto
                18     portão vertical fechado     19  portão vertical aberto
  ../items/fence.png e gate.png   ícones 32x32 do inventário

Em jogo cada quadro é reduzido 6:1 (20x24 px) e desenhado em (tile.x - 2, tile.y); a escala do tile é
96 px de arte = 16 px de jogo. Medidas em config/fences.js (FRAME_ART).
"""
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
REF = os.path.join(HERE, 'fence-reference.png')
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', '..', 'public', 'assets', 'sprites', 'objects')
ITEMS = os.path.join(OUT, '..', 'items')
os.makedirs(OUT, exist_ok=True)
os.makedirs(ITEMS, exist_ok=True)

FW, FH = 120, 144          # tamanho de um quadro (px de arte); 6 px de arte = 1 px de jogo
DARK = (58, 34, 20, 255)   # cor do contorno da madeira (amostrada da prancha)
TILE = 96                  # largura do tile em px de arte (16 px de jogo)
PAD_X = (FW - TILE) // 2   # margem lateral do quadro
CAP_Y = 8                  # y (no quadro) do topo do poste


# ---------------------------------------------------------------- extração
def load_components():
    im = Image.open(REF).convert('RGB')
    a = np.array(im).astype(int)
    mx, mn = a.max(2), a.min(2)
    sat = mx - mn
    bg = (mn > 185) & (sat < 22)            # xadrez branco/cinza e sombras pálidas
    fg = ~bg
    lab, _ = ndi.label(ndi.binary_dilation(fg, iterations=3))
    out = {}
    for i, sl in enumerate(ndi.find_objects(lab)):
        wood = ((sat[sl] > 35) & (lab[sl] == i + 1)).sum()
        if wood <= 150:
            continue                         # rótulos de texto e ruído
        m = (lab[sl] == i + 1) & fg[sl]
        out[i + 1] = clean(a[sl], m)
    return out


def clean(rgb, mask):
    """RGBA da peça: só a madeira, sem franja clara nas bordas e sem pontinhos soltos."""
    mask = mask.copy()
    lum = rgb.mean(2)
    sat = rgb.max(2) - rgb.min(2)
    for _ in range(2):                       # franja: pixel claro e neutro encostado no vazio
        edge = mask & ~ndi.binary_erosion(mask, border_value=0)
        mask &= ~(edge & (lum > 190) & (sat < 45))
    lab, n = ndi.label(mask)                 # ilhas minúsculas (restos do xadrez)
    if n > 1:
        sizes = ndi.sum(mask, lab, range(1, n + 1))
        keep = {k + 1 for k, s in enumerate(sizes) if s >= max(12, 0.01 * sizes.max())}
        mask = np.isin(lab, list(keep))
    # Frestas entre estacas: o fundo da prancha aparece por elas como riscos claros e neutros. Dentro da peça
    # viram sombra escura (nunca branco); na borda ficam transparentes.
    slit = mask & (lum > 165) & (sat < 45)
    outside = ndi.binary_propagation(~mask, mask=~mask | slit, border_value=1)   # claros ligados ao fora
    mask &= ~(slit & outside)
    inner = slit & ~outside
    closed = ndi.binary_closing(mask, iterations=1) | mask
    rgba = np.dstack([rgb.astype(np.uint8), (closed * 255).astype(np.uint8)])
    rgba[(closed & ~mask) | inner, :3] = DARK[:3]
    rgba[~closed] = 0
    mask = closed
    img = Image.fromarray(rgba, 'RGBA')
    bbox = img.getchannel('A').getbbox()
    return img.crop(bbox)


def scaled(img, s):
    w, h = max(1, round(img.width * s)), max(1, round(img.height * s))
    return img.convert('RGBa').resize((w, h), Image.LANCZOS).convert('RGBA')


# ---------------------------------------------------------------- poste e braços de estacas (peça reta nº 16)
def run_geometry(run):
    """Do trecho reto com poste nas pontas: largura do poste e o período das estacas (centros das frestas)."""
    al = np.array(run.getchannel('A')) > 0
    # frestas entre estacas: colunas vazias na altura das pontas, só no miolo
    band = ~al[9]                                         # entre as pontas, as frestas são vãos de ~10px
    gaps, x, post_w = [], 8, None
    while x < al.shape[1] - 30:
        if band[x]:
            x0 = x
            while x < al.shape[1] and band[x]:
                x += 1
            if post_w is None:
                post_w = x0                                # a primeira fresta marca onde o poste termina
            gaps.append((x0 + x - 1) / 2.0)
        else:
            x += 1
    period = (gaps[-1] - gaps[0]) / (len(gaps) - 1)
    return post_w, gaps, period


def make_parts(run, geo, ground):
    """(poste, braço) na escala do jogo. O braço tem 3 estacas (meio tile) e começa e termina no meio de uma fresta,
    então braços lado a lado (e de tiles vizinhos) emendam sem falha."""
    post_w, gaps, period = geo
    g0 = gaps[1]
    arm = run.crop((int(round(g0)), 0, int(round(g0 + 3 * period)), run.height))
    post = run.crop((0, 0, post_w, run.height))
    s = (TILE / 2.0) / (3 * period)
    return scaled(post, s), scaled(arm, s), s


def rail_strip(post, length):
    """Travessa vertical: o miolo do tronco (85% da largura), repetido para cobrir `length` px, um pouco mais escuro
    (fica atrás dos postes)."""
    w, h = post.size
    body = post.crop((int(w * 0.08), int(h * 0.38), int(w * 0.92), int(h * 0.62)))
    strip = Image.new('RGBA', (body.width, length), (0, 0, 0, 0))
    for y in range(0, length, body.height):
        strip.alpha_composite(body, (0, y))
    a = np.array(strip).astype(float)
    a[..., :3] *= 0.88
    strip = Image.fromarray(a.clip(0, 255).astype(np.uint8), 'RGBA').copy()
    # contorno escuro dos dois lados
    px = strip.load()
    for y in range(length):
        for x in (0, strip.width - 1):
            if px[x, y][3]:
                px[x, y] = DARK
    return strip


def log_center(img):
    al = np.array(img.getchannel('A')) > 0
    cnt = al.sum(0)
    cols = np.where(cnt >= 0.85 * cnt.max())[0]
    return (cols.min() + cols.max()) / 2.0


def place(frame, piece, cx, top=None, bottom=None):
    """Cola a peça (já na escala do jogo) com o centro do tronco em cx e o topo/base na altura pedida."""
    x = int(round(cx - log_center(piece)))
    y = top if top is not None else bottom - piece.height
    frame.alpha_composite(piece, (x, y))


def main():
    comps = load_components()
    geo = run_geometry(comps[16])
    post, arm, s = make_parts(comps[16], geo, None)
    cx = FW / 2.0
    ground = CAP_Y + post.height                           # linha do chão (base dos postes e das estacas)
    frames = []
    for mask in range(16):
        n, e, so, w = bool(mask & 1), bool(mask & 2), bool(mask & 4), bool(mask & 8)
        fr = Image.new('RGBA', (FW, FH), (0, 0, 0, 0))
        if w:
            fr.alpha_composite(arm, (int(round(cx - arm.width)), ground - arm.height))
        if e:
            fr.alpha_composite(arm, (int(round(cx)), ground - arm.height))
        if so:
            # a cerca segue para o Sul: travessa vertical contínua, do meio do poste até o poste do tile de baixo
            # (que a cobre). Sem isso as cercas verticais ficavam como postes soltos.
            y0 = CAP_Y + int(post.height * 0.45)
            y1 = TILE + CAP_Y + int(post.height * 0.3)
            fr.alpha_composite(rail_strip(post, y1 - y0), (int(round(cx - post.width * 0.42)), y0))
        fr.alpha_composite(post, (int(round(cx - post.width / 2.0)), CAP_Y))
        frames.append(fr)

    gates = [(54, 'base'), (52, 'cap'), (45, 'cap'), (48, 'cap')]
    for gid, mode in gates:
        fr = Image.new('RGBA', (FW, FH), (0, 0, 0, 0))
        piece = scaled(comps[gid], s)
        if mode == 'base':
            place(fr, piece, cx, bottom=ground)
        else:
            place(fr, piece, cx, top=CAP_Y)
        frames.append(fr)

    sheet = Image.new('RGBA', (FW * len(frames), FH), (0, 0, 0, 0))
    for i, fr in enumerate(frames):
        sheet.paste(fr, (FW * i, 0))
    sheet.save(os.path.join(OUT, 'fence.png'))

    def icon(fr, name):
        box = fr.getchannel('A').getbbox()
        piece = fr.crop(box)
        k = min(28 / piece.width, 28 / piece.height)
        sm = piece.convert('RGBa').resize((max(1, round(piece.width * k)), max(1, round(piece.height * k))), Image.LANCZOS).convert('RGBA')
        ic = Image.new('RGBA', (32, 32), (0, 0, 0, 0))
        ic.alpha_composite(sm, ((32 - sm.width) // 2, (32 - sm.height) // 2))
        ic.save(os.path.join(ITEMS, name))

    icon(frames[2 | 8], 'fence.png')
    icon(frames[16], 'gate.png')
    json.dump({'frame': [FW, FH], 'tile': TILE, 'capY': CAP_Y, 'logCenter': cx}, open(os.path.join(HERE, 'fence-frames.json'), 'w'))
    print('ok', len(frames), 'quadros de', FW, 'x', FH, '->', os.path.abspath(OUT))


if __name__ == '__main__':
    main()
