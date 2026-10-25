"""Pin and vendor the unmodified Stockfish.js 19 lite single-thread engine.

Run only during maintenance. Public visitors fetch these local assets, not a CDN.
Keep the corresponding source archive and GPL notice beside the binary.
"""
import hashlib
import json
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
VERSION = '19.0.1'
DEST = ROOT / 'vendor/stockfish'


def fetch(url, limit=25_000_000):
    with urlopen(Request(url, headers={'User-Agent': 'ChessAtelier/1.2'}), timeout=40) as response:
        raw = response.read(limit + 1)
    if len(raw) > limit:
        raise ValueError('Download exceeded bounded asset size: ' + url)
    return raw


def main():
    DEST.mkdir(parents=True, exist_ok=True)
    files = {}
    for name in ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm']:
        url = f'https://github.com/nmrugg/stockfish.js/releases/download/v{VERSION}/{name}'
        raw = fetch(url)
        if name.endswith('.wasm') and raw[:4] != b'\0asm':
            raise ValueError('Not a WebAssembly binary')
        (DEST / name).write_bytes(raw)
        files[name] = {'url': url, 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}
        print(name, len(raw), 'bytes', flush=True)
    for name in ['Copying.txt', 'AUTHORS', 'README.md']:
        url = f'https://raw.githubusercontent.com/nmrugg/stockfish.js/v{VERSION}/{name}'
        raw = fetch(url)
        (DEST / name).write_bytes(raw)
        files[name] = {'url': url, 'sha256': hashlib.sha256(raw).hexdigest()}
    url = f'https://codeload.github.com/nmrugg/stockfish.js/tar.gz/refs/tags/v{VERSION}'
    raw = fetch(url)
    (DEST / 'source.tar.gz').write_bytes(raw)
    files['source.tar.gz'] = {'url': url, 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}
    (DEST / 'manifest.json').write_text(json.dumps({'package': 'stockfish', 'version': VERSION,
        'build': 'lite-single', 'license': 'GPL-3.0', 'files': files}, indent=2) + '\n', encoding='utf-8')
    print('Pinned engine and corresponding source vendored.', flush=True)


if __name__ == '__main__':
    main()
