"""Vendor the four requested Lichess SVG sets verbatim, pinned to a source commit.

Sources and individual licenses live in assets/pieces/README.md and manifest.json.
No glyph substitution, stroke reconstruction, or silhouette conversion is performed.
"""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import urllib.request
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
REVISION = 'e1ebe0e4b25bbd83c4524fbb3207c5dad6ff688a'
BASE = f'https://raw.githubusercontent.com/lichess-org/lila/{REVISION}/'
STYLES = {
    'cburnett': {'label': '经典', 'author': 'Colin M. L. Burnett', 'license': 'GPL-2.0-or-later', 'licenseUrl': 'https://www.gnu.org/licenses/old-licenses/gpl-2.0.html'},
    'maestro': {'label': '拟真', 'author': 'sadsnake1', 'license': 'CC-BY-NC-SA-4.0', 'licenseUrl': 'https://creativecommons.org/licenses/by-nc-sa/4.0/'},
    'mpchess': {'label': '极简', 'author': 'Maxime Chupin', 'license': 'GPL-3.0-or-later', 'licenseUrl': 'https://www.gnu.org/licenses/gpl-3.0.html'},
    'totoy': {'label': '抽象', 'author': 'Kosal Sen', 'license': 'CC-BY-4.0', 'licenseUrl': 'https://creativecommons.org/licenses/by/4.0/'},
}


def main():
    folder = ROOT / 'assets/pieces'
    jobs = [(style, color + piece) for style in STYLES for color in 'wb' for piece in 'PNBRQK']

    def download(job):
        style, code = job
        url = BASE + f'public/piece/{style}/{code}.svg'
        data = urllib.request.urlopen(url, timeout=40).read()
        svg = ET.fromstring(data)
        if svg.tag != '{http://www.w3.org/2000/svg}svg' or not svg.get('viewBox'):
            raise ValueError('Invalid SVG: ' + url)
        if any(node.tag.rsplit('}', 1)[-1] in ('script', 'foreignObject') for node in svg.iter()):
            raise ValueError('Unexpected active SVG content')
        target = folder / style / (code + '.svg')
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        return target.relative_to(folder).as_posix(), {'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data), 'url': url}

    with ThreadPoolExecutor(max_workers=6) as executor:
        files = dict(executor.map(download, jobs))
    copying = urllib.request.urlopen(BASE + 'COPYING.md', timeout=40).read()
    (folder / 'LICHESS-COPYING.md').write_bytes(copying)
    manifest = {'repository': 'https://github.com/lichess-org/lila', 'revision': REVISION,
                'fetchedAt': datetime.now(timezone.utc).isoformat(), 'styles': STYLES, 'files': files}
    (folder / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Vendored {len(files)} original SVGs at Lichess commit {REVISION}.')


if __name__ == '__main__':
    main()
