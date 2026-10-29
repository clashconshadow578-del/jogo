#!/usr/bin/env python3
"""Gera os ícones 16x16 das ferramentas (5 níveis cada) a partir do pacote de texturas.

Uso: python3 tools/ground/make-tool-icons.py <pasta textures/item do pacote> [saida]

Níveis: 0 madeira (básico) · 1 pedra · 2 ferro · 3 ouro · 4 netherita (roxo, equivale ao irídio).
Enxada e machado vêm direto do pacote. Regador (balde com bico) e foice (tesoura) só existem em um
material, então os tons claros são trocados pela paleta de cada nível; contornos escuros são mantidos.
"""
import os
import sys

from PIL import Image

src = sys.argv[1]
out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'assets', 'sprites', 'tools')
os.makedirs(out, exist_ok=True)

MATERIAL = ['wooden', 'stone', 'iron', 'golden', 'netherite']

# tons claros do original (claro, médio, escuro) -> paleta do nível
LIGHT = [(204, 204, 204), (165, 165, 165), (137, 137, 137)]
PALETTE = [
    [(161, 136, 127), (141, 110, 99), (109, 76, 65)],  # madeira
    [(204, 204, 204), (165, 165, 165), (137, 137, 137)],  # pedra (original)
    [(237, 220, 229), (220, 204, 203), (194, 169, 168)],  # ferro
    [(251, 230, 145), (249, 215, 90), (237, 188, 81)],  # ouro
    [(183, 170, 220), (152, 112, 206), (115, 57, 157)],  # netherita
]
# contornos escuros do original -> contorno do nível (só netherita muda, para não ficar acinzentado)
OUTLINE = {
    4: {(95, 84, 89): (85, 33, 118), (94, 84, 84): (85, 33, 118), (95, 84, 84): (85, 33, 118),
        (77, 76, 76): (60, 30, 90), (61, 53, 61): (16, 0, 32), (60, 53, 61): (16, 0, 32)},
}


def load(name):
    return Image.open(os.path.join(src, name + '.png')).convert('RGBA')


def recolor(img, level):
    img = img.copy()
    px = img.load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            c = (r, g, b)
            if c in LIGHT:
                nr, ng, nb = PALETTE[level][LIGHT.index(c)]
                px[x, y] = (nr, ng, nb, a)
            elif c in OUTLINE.get(level, {}):
                nr, ng, nb = OUTLINE[level][c]
                px[x, y] = (nr, ng, nb, a)
    return img


for lv, mat in enumerate(MATERIAL):
    load(mat + '_hoe').save(os.path.join(out, f'hoe_{lv}.png'))
    load(mat + '_axe').save(os.path.join(out, f'axe_{lv}.png'))
    recolor(load('water_bucket'), lv).save(os.path.join(out, f'can_{lv}.png'))
    recolor(load('shears'), lv).save(os.path.join(out, f'scythe_{lv}.png'))

# tocha: o pacote só tem a versão de bloco (16x16)
tp = os.path.join(src, '..', 'block', 'torch.png')
if os.path.exists(tp):
    Image.open(tp).convert('RGBA').save(os.path.join(out, 'torch.png'))
print('ok ->', os.path.abspath(out))
