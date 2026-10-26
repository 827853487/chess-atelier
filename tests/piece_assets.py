"""Verify source provenance and preservation of all four original SVG drawings."""
import hashlib
import json
from pathlib import Path
import re
import unittest
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
PAINTS = {'fill', 'stroke', 'stop-color', 'flood-color', 'lighting-color', 'color'}


def structure(node):
    attrs = {}
    for key, value in node.attrib.items():
        if key in PAINTS:
            continue
        if key == 'style':
            value = ';'.join(declaration for declaration in value.split(';') if declaration.split(':')[0].strip() not in PAINTS)
        attrs[key] = value
    return node.tag, attrs, [structure(child) for child in node if isinstance(child.tag, str)]


class PieceAssets(unittest.TestCase):
    def test_all_originals_are_unmodified_and_licensed(self):
        base = ROOT / 'assets/pieces'
        meta = json.loads((base / 'manifest.json').read_text(encoding='utf-8'))
        self.assertEqual(list(meta['styles']), ['cburnett', 'maestro', 'mpchess', 'totoy'])
        self.assertEqual(len(meta['files']), 48)
        self.assertEqual(meta['styles']['maestro']['license'], 'CC-BY-NC-SA-4.0')
        for name, info in meta['files'].items():
            self.assertEqual(hashlib.sha256((base/name).read_bytes()).hexdigest(), info['sha256'], name)
            self.assertIn(meta['revision'], info['url'])
        for filename in ['GPL-2.0.txt', 'GPL-3.0.txt', 'CC-BY-NC-SA-4.0.txt', 'CC-BY-4.0.txt']:
            self.assertGreater((base/filename).stat().st_size, 5000)

    def test_all_theme_derivatives_preserve_geometry_strokes_and_shading_structure(self):
        base = ROOT / 'assets/pieces-themed'
        manifest = json.loads((base/'manifest.json').read_text(encoding='utf-8'))
        self.assertEqual(len(manifest['files']), 288)
        for name, info in manifest['files'].items():
            target = base/name
            self.assertEqual(hashlib.sha256(target.read_bytes()).hexdigest(), info['sha256'], name)
            self.assertEqual(structure(ET.parse(target).getroot()), structure(ET.parse(ROOT/'assets/pieces'/info['source']).getroot()), name)
            self.assertIn('geometry and strokes unchanged', target.read_text(encoding='utf-8'))

    def test_no_legacy_glyph_assets_or_runtime_paint_overrides(self):
        self.assertEqual({p.name for p in (ROOT/'assets/pieces').iterdir() if p.is_dir()}, {'cburnett','maestro','mpchess','totoy'})
        self.assertFalse((ROOT/'piece-fallback.js').exists())
        self.assertFalse((ROOT/'scripts/solid_classic_pieces.py').exists())
        for filename in ['styles.css','app.css','polish.css','engine-ui.css','library-ui.css']:
            css = (ROOT/filename).read_text(encoding='utf-8')
            self.assertNotRegex(css, r'--(?:white-piece|white-outline|black-piece|black-outline)\b')
            self.assertNotRegex(css, r'\.piece-svg\b')


if __name__ == '__main__':
    unittest.main()
