"""Rebuild solid white SVGs from each style's matching filled glyph silhouettes.

The original Unicode white glyphs describe a hollow contour: changing their
fill does not fill their body. Use the corresponding black glyph geometry,
including its detail cutouts, with the existing near-white / dark palette.
Run from any directory; no font or third-party drawing dependency is needed.
The historical script name remains compatible; --styles rhosgfx limits it to classic.
"""
import argparse
from copy import deepcopy
from pathlib import Path
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
ET.register_namespace('', 'http://www.w3.org/2000/svg')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--styles', nargs='+', choices=['rhosgfx', 'fantasy', 'chessnut'],
                        default=['rhosgfx', 'fantasy', 'chessnut'])
    styles = parser.parse_args().styles
    folders = []
    for style in styles:
        folders.append(ROOT / 'assets/pieces' / style)
        folders += sorted((ROOT / 'assets/pieces-themed').glob('*/' + style))
    count = 0
    for folder in folders:
        for piece in 'PNBRQK':
            target = folder / f'w{piece}.svg'
            old = ET.parse(target).getroot()
            palette = next(node.attrib for node in old.iter() if node.tag.endswith('path'))
            root = deepcopy(ET.parse(folder / f'b{piece}.svg').getroot())
            # The minimal glyph uses a much larger font coordinate system. Keep
            # its outline at least 2 SVG units, not a barely visible hairline.
            transform = next(node.get('transform', '') for node in root.iter()
                             if node.tag.rsplit('}', 1)[-1] == 'g')
            scale = float(re.search(r'scale\(([-.\d]+)', transform).group(1))
            stroke = f"{max(float(palette['stroke-width']), round(2 / abs(scale))):g}"
            for node in root.iter():
                if node.tag.endswith('path'):
                    for attr in ('fill', 'stroke', 'stroke-width', 'stroke-linejoin', 'paint-order'):
                        node.set(attr, palette[attr])
                    node.set('stroke-width', stroke)
            target.write_text(ET.tostring(root, encoding='unicode') + '\n', encoding='utf-8')
            count += 1
    print(f'Rebuilt {count} solid white SVGs across {len(styles)} styles (source + six themes).')


if __name__ == '__main__':
    main()
