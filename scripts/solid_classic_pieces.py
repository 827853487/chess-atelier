"""Rebuild solid classic white SVGs from the matching filled glyph silhouettes.

The original Unicode white glyphs describe a hollow contour: changing their
fill does not fill their body. Use the corresponding black glyph geometry,
including its detail cutouts, with the existing near-white / dark palette.
Run from any directory; no font or third-party drawing dependency is needed.
"""
from copy import deepcopy
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
ET.register_namespace('', 'http://www.w3.org/2000/svg')


def main():
    folders = [ROOT / 'assets/pieces/rhosgfx']
    folders += sorted((ROOT / 'assets/pieces-themed').glob('*/rhosgfx'))
    count = 0
    for folder in folders:
        for piece in 'PNBRQK':
            target = folder / f'w{piece}.svg'
            old = ET.parse(target).getroot()
            palette = next(node.attrib for node in old.iter() if node.tag.endswith('path'))
            root = deepcopy(ET.parse(folder / f'b{piece}.svg').getroot())
            for node in root.iter():
                if node.tag.endswith('path'):
                    for attr in ('fill', 'stroke', 'stroke-width', 'stroke-linejoin', 'paint-order'):
                        node.set(attr, palette[attr])
            target.write_text(ET.tostring(root, encoding='unicode') + '\n', encoding='utf-8')
            count += 1
    print(f'Rebuilt {count} solid classic white SVGs (source + six themes).')


if __name__ == '__main__':
    main()
