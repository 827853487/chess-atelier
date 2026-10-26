"""Build static theme SVGs from the untouched, attributed Lichess originals.

Only paint colors change. Paths, stroke widths/joins, viewBoxes, gradients,
filters, opacity and transforms remain the author's original artwork.
There is no runtime CSS fill/stroke override or font-glyph reconstruction.
"""
import hashlib
import json
from pathlib import Path
import re
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/pieces'
ET.register_namespace('', 'http://www.w3.org/2000/svg')
ET.register_namespace('xlink', 'http://www.w3.org/1999/xlink')
# Deep themed ink + almost-white body. Original outlines carry contrast on light
# squares; dark bodies stay clearly separated from the medium-value board tiles.
PALETTES = {
    'walnut': ('#30241d', '#fffaf2'),
    'sage': ('#20382a', '#f8fff5'),
    'slate': ('#203640', '#f5fcff'),
    'oat': ('#323025', '#fffdf2'),
    'blush': ('#38262f', '#fff7fb'),
    'mist': ('#29323c', '#f8fbff'),
}
PAINTS = {'fill', 'stroke', 'stop-color', 'flood-color', 'lighting-color', 'color'}


def rgb(value):
    value = {'black': '#000', 'white': '#fff'}.get(value.lower(), value)
    if not re.fullmatch(r'#[\da-fA-F]{3}(?:[\da-fA-F]{3})?', value):
        return None
    raw = value[1:]
    if len(raw) == 3:
        raw = ''.join(char * 2 for char in raw)
    return tuple(int(raw[i:i+2], 16) for i in (0, 2, 4))


def paint(value, dark, light, side):
    source = rgb(value.strip())
    if source is None:
        return value  # none, URLs and every gradient/filter reference stay intact.
    level = sum(channel * weight for channel, weight in zip(source, (.2126, .7152, .0722))) / 255
    # Preserve all intermediate shades. Compress dark-piece midtones so Maestro
    # remains dark against the board rather than turning into a medium tile color.
    weight = level ** (1.8 if side == 'b' else .85)
    return '#' + ''.join(f'{round(a+(b-a)*weight):02x}' for a, b in zip(dark, light))


def main():
    manifest = json.loads((SOURCE / 'manifest.json').read_text(encoding='utf-8'))
    derived = {}
    for theme, (dark_hex, light_hex) in PALETTES.items():
        dark, light = rgb(dark_hex), rgb(light_hex)
        for relative, meta in manifest['files'].items():
            source = SOURCE / relative
            raw = source.read_bytes()
            if hashlib.sha256(raw).hexdigest() != meta['sha256']:
                raise ValueError('Original SVG modified: ' + relative)
            style, filename = relative.split('/')
            side = filename[0]
            svg = ET.fromstring(raw)
            for node in svg.iter():
                for key, value in list(node.attrib.items()):
                    if key in PAINTS:
                        node.set(key, paint(value, dark, light, side))
                    elif key == 'style':
                        # Replace paint declarations only; leave stroke-width,
                        # line join, opacity and all geometry settings untouched.
                        node.set(key, re.sub(r'(^|;)(\s*(?:fill|stroke|stop-color|flood-color|lighting-color|color)\s*:\s*)([^;]+)',
                            lambda match: match[1]+match[2]+paint(match[3], dark, light, side), value))
            # SVG's implicit default fill is black. Make that color explicit so
            # author's implicit detail paths follow the themed ink as well.
            if not svg.get('fill') and not re.search(r'(?:^|;)\s*fill\s*:', svg.get('style', '')):
                svg.set('fill', dark_hex)
            info = manifest['styles'][style]
            comment = ET.Comment(f" {style}: {info['author']}; {info['license']}; source {meta['url']}; modified: {theme} colors only; geometry and strokes unchanged. ")
            svg.insert(0, comment)
            target = ROOT / 'assets/pieces-themed' / theme / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            output = (ET.tostring(svg, encoding='unicode') + '\n').encode()
            target.write_bytes(output)
            derived[f'{theme}/{relative}'] = {'sha256': hashlib.sha256(output).hexdigest(), 'source': relative}
    (ROOT / 'assets/pieces-themed/manifest.json').write_text(json.dumps({'palettes': PALETTES, 'files': derived}, indent=2)+'\n', encoding='utf-8')
    print(f'Built {len(derived)} static SVGs: four original styles across six themes.')


if __name__ == '__main__':
    main()
