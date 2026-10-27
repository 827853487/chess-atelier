"""Ensure a released page really carries the complete, pinned engine."""
import base64
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class PayloadParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.collect = False
        self.parts = []
        self.browser_mode = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'html':
            self.browser_mode = attrs.get('data-engine') == 'browser'
        if tag == 'script' and attrs.get('id') == 'stockfish-payload':
            assert attrs.get('type') == 'application/json'
            self.collect = True

    def handle_endtag(self, tag):
        if tag == 'script':
            self.collect = False

    def handle_data(self, data):
        if self.collect:
            self.parts.append(data)


parser = PayloadParser()
parser.feed((ROOT / 'dist/index.html').read_text(encoding='utf-8'))
assert parser.browser_mode
payload = json.loads(''.join(parser.parts))
assert payload['version'] == '19.0.1-lite-single'
manifest = json.loads((ROOT / 'vendor/stockfish/manifest.json').read_text(encoding='utf-8'))
for name, content in [('stockfish-19-lite-single.js', payload['script'].encode('utf-8')),
                      ('stockfish-19-lite-single.wasm', base64.b64decode(payload['wasm'], validate=True))]:
    assert hashlib.sha256(content).hexdigest() == manifest['files'][name]['sha256'], name
assert 'fonts.googleapis.com' not in (ROOT / 'dist/styles.css').read_text(encoding='utf-8')
print('PASS: HTML contains the exact licensed JS/WASM release, browser mode and no Google Fonts import')
