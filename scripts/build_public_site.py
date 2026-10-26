"""Export only the public, self-contained browser application (no Python service).

Usage: python scripts/build_public_site.py --output <directory> [--site-url <origin>]
No credentials, native executables, browser records or runtime caches are copied.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=Path, default=ROOT / 'dist')
    parser.add_argument('--site-url', default='')
    args = parser.parse_args()
    output = args.output.resolve()
    if output == ROOT or output in ROOT.parents:
        raise ValueError('Output must not replace the source directory')
    files = [ROOT / name for name in ['index.html', 'app.bundle.js', 'interaction.js',
        'custom-select.js', 'vendor/chess.js', 'ATTRIBUTION.md', 'data/CURRICULUM.md',
        'data/LIBRARY_SOURCES.md', 'data/library-sources.json', 'data/training-source-rows.csv']]
    files += list(ROOT.glob('*.css'))
    files += list((ROOT / 'assets').rglob('*.svg'))
    files += [p for p in (ROOT/'assets/pieces').iterdir() if p.is_file() and p.suffix in ('.md','.json','.txt')]
    files += [ROOT/'assets/pieces-themed/manifest.json',ROOT/'scripts/build_piece_themes.py',ROOT/'scripts/import_lichess_pieces.py']
    files += [ROOT / 'assets/music/playlist.json']
    playlist=json.loads((ROOT / 'assets/music/playlist.json').read_text(encoding='utf-8'))
    for track in playlist:
        filename=track.get('file','')
        if Path(filename).name!=filename or not filename.lower().endswith(('.mp3','.ogg','.oga','.flac','.wav')):
            raise ValueError('Invalid local music filename')
        file=ROOT / 'assets/music' / filename
        if track.get('sha256') and hashlib.sha256(file.read_bytes()).hexdigest()!=track['sha256']:
            raise ValueError('Local recording checksum mismatch: '+filename)
        files.append(file)
    files += list((ROOT / 'assets/music').glob('*.txt'))
    files += list((ROOT / 'assets/music').glob('*.json'))
    files += [p for p in [ROOT/'data/MUSIC_SOURCES.md',ROOT/'data/CHESS_QUOTES.md',ROOT/'data/ONLINE_MUSIC.md'] if p.is_file()]
    files=list(dict.fromkeys(files))
    files += list((ROOT / 'data/complete').glob('*.pgn'))
    manifest = json.loads((ROOT / 'vendor/stockfish/manifest.json').read_text(encoding='utf-8'))
    for name, meta in manifest['files'].items():
        file = ROOT / 'vendor/stockfish' / name
        if hashlib.sha256(file.read_bytes()).hexdigest() != meta['sha256']:
            raise ValueError('Stockfish asset checksum mismatch: ' + name)
        files.append(file)
    files.append(ROOT / 'vendor/stockfish/manifest.json')
    allowed = {file.relative_to(ROOT).as_posix() for file in files}
    allowed.update(['browser-config.js', '.nojekyll', 'build-manifest.json'])
    if output.exists():
        unexpected = [p for p in output.rglob('*') if p.is_file() and p.relative_to(output).as_posix() not in allowed]
        if unexpected:
            raise ValueError('Unexpected files in output; inspect them before rebuilding: ' + str(unexpected[:3]))
    output.mkdir(parents=True, exist_ok=True)
    for file in files:
        target = output / file.relative_to(ROOT)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(file, target)
    html = (output / 'index.html').read_text(encoding='utf-8')
    html = html.replace('<script src="./app.bundle.js', '<script src="./browser-config.js"></script><script src="./app.bundle.js')
    if args.site_url:
        url = args.site_url.rstrip('/') + '/'
        if not url.startswith('https://') or any(c in url for c in '<>"\''):
            raise ValueError('Expected HTTPS site URL')
        html = html.replace('</head>', f'<link rel="canonical" href="{url}"/><meta name="description" content="棋境：在浏览器中下棋、使用 Stockfish 实时分析，学习大师对局与分级专题棋谱。"/></head>')
    (output / 'index.html').write_text(html, encoding='utf-8')
    (output / 'browser-config.js').write_text("globalThis.CHESS_ENGINE_MODE='browser';\n", encoding='utf-8')
    (output / '.nojekyll').write_text('', encoding='utf-8')
    report = {p.relative_to(output).as_posix(): {'bytes': p.stat().st_size,
        'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in output.rglob('*')
        if p.is_file() and p.name != 'build-manifest.json'}
    (output / 'build-manifest.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(f'Public build: {len(report)} files, {sum(row["bytes"] for row in report.values()):,} bytes → {output}')


if __name__ == '__main__':
    main()
