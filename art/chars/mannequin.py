"""The mannequin: a neutral base human in a tee, trousers and trainers with a chunky hair shape.
Proves the Human builder; every band member's script has this shape (spec + hair + outfit + props).

    tools/art.sh art/chars/mannequin.py            -> vendor/models/mannequin.glb
    tools/art.sh art/chars/mannequin.py out.glb    -> somewhere else (scratch builds, variants)
"""
import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
from sjart import *          # noqa: E402
from sjart import outfit     # noqa: E402

PALETTE = dict(skin='#F2B48C', hair='#3A2B52', tee='#F25C3B', trousers='#2E3A66', shoe='#FFC93C', sole='#FFFFFF', cap='#FFFFFF')


def build(spec=None, name='mannequin', pal=PALETTE, hair=True):
    reset()
    h = Human(spec or HumanSpec())
    ch = Character(name, h, skin=pal['skin'])
    outfit.trousers(ch, pal['trousers'])
    outfit.tee(ch, pal['tee'])
    outfit.sneakers(ch, upper=pal['shoe'], sole=pal['sole'], cap=pal['cap'], lace=pal['sole'])
    if hair:
        outfit.hair_cap(ch, pal['hair'], sweep=-0.6)
        H, y0 = h.spec.height, h.head_cy
        # a chunky forelock swept to the character's right (on a spring chain) and two spikes at the back
        outfit.tuft(ch, 'Forelock', pal['hair'], [(0.035, y0 - 0.03, H - 0.012), (0.012, y0 - 0.115, H + 0.022), (-0.045, y0 - 0.175, H - 0.004),
                                                  (-0.088, y0 - 0.180, H - 0.062)], [(0, 0.058), (0.45, 0.050), (0.8, 0.030), (1, 0.010)],
                    spring='forelock', flat=0.62)
        for i, (x, a) in enumerate(((0.05, 0.0), (-0.045, 0.012))):
            outfit.tuft(ch, 'Spike%d' % (i + 1), pal['hair'], [(x, y0 + 0.07, H - 0.07 - a), (x * 1.3, y0 + 0.150, H - 0.085 - a), (x * 1.5, y0 + 0.200, H - 0.13 - a)],
                        [(0, 0.050), (0.5, 0.038), (1, 0.008)], flat=0.7)
    return ch


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else None
    build().export(out)
