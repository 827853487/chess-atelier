"""Curate named, completed opening games from the PGN Mentor opening archives.

Explicit maintenance command only. Application startup uses the resulting local PGNs.
"""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import io
import json
import re
from urllib.request import Request, urlopen
import zipfile

import chess.pgn
from enrich_library import ROOT, DEST, factual_copy, fingerprint, export_games, parse
from library_catalog import write_catalog, write_packs

BASE = 'https://www.pgnmentor.com/openings/'
SOURCES = [
    ('london-real-games', '伦敦体系实战', [('London2e6', 80), ('London2g6', 80)]),
    ('italian-real-games', '意大利开局实战', [('GiuocoPiano', 100)]),
    ('spanish-berlin-games', '西班牙开局·柏林防御', [('RuyLopezBerlin', 100)]),
    ('sicilian-najdorf-games', '西西里防御·纳伊多夫', [('SicilianNajdorf6Be3', 100)]),
    ('french-advance-games', '法兰西防御·推进变例', [('FrenchAdvance', 100)]),
    ('caro-kann-games', '卡罗康防御实战', [('Caro-KannClassic', 100)]),
    ('slav-exchange-games', '斯拉夫防御·兑换变例', [('SlavExchange', 100)]),
    ('petroff-games', '俄罗斯防御实战', [('PetroffMain', 100)]),
    ('vienna-games', '维也纳开局实战', [('Vienna', 100)]),
]
NEW_IDS = {s[0] for s in SOURCES}
HEADER = re.compile(r'^\[(\w+)\s+"((?:[^"\\]|\\.)*)"\]\s*$', re.M)


def fetch(name):
    url = BASE + name + '.zip'
    request = Request(url, headers={'User-Agent': 'ChessAtelier/1.6 (local factual PGN library)'})
    with urlopen(request, timeout=60) as response:
        raw = response.read(35_000_001)
    if len(raw) > 35_000_000:
        raise ValueError('Archive too large: ' + url)
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        entries = [f for f in archive.infolist() if f.filename.lower().endswith('.pgn')]
        if len(entries) != 1 or entries[0].file_size > 100_000_000:
            raise ValueError('Unexpected archive contents: ' + url)
        payload = archive.read(entries[0])
    try:
        text = payload.decode('utf-8-sig')
    except UnicodeDecodeError:
        text = payload.decode('cp1252')
    text = text.replace('\r\r\n', '\n').replace('\r\n', '\n').replace('\r', '\n')
    candidates = []
    for index, chunk in enumerate(re.split(r'(?=^\[Event\s+")', text, flags=re.M)):
        if not chunk.strip():
            continue
        headers = dict(HEADER.findall(chunk))
        if any(not headers.get(k, '').strip() or '?' in headers[k] for k in ['White', 'Black', 'Event']):
            continue
        if not re.match(r'\d{4}\.', headers.get('Date', '')) or headers.get('Result') not in ['1-0', '0-1', '1/2-1/2']:
            continue
        ratings = [int(headers[k]) for k in ['WhiteElo', 'BlackElo'] if headers.get(k, '').isdigit()]
        quality = (min(ratings) if len(ratings) == 2 else 0, max(ratings, default=0), headers['Date'])
        candidates.append((quality, headers['Date'], index, chunk))
    # Mostly games with strong recorded ratings, plus a small historical cross-section.
    ranked = sorted(candidates, key=lambda row: row[0], reverse=True)
    historical = sorted(candidates, key=lambda row: (row[1], row[2]))
    print('Fetched', name, len(candidates), 'named completed candidate games', flush=True)
    return {'url': url, 'sourceSha256': hashlib.sha256(raw).hexdigest(), 'ranked': ranked, 'historical': historical}


def choose(source, target, seen):
    games = []
    considered = set()
    invalid = 0
    # First retain up to fifteen historical games, then fill with the highest rated.
    queues = [(source['historical'], min(15, target)), (source['ranked'], target)]
    for candidates, limit in queues:
        for _, _, index, chunk in candidates:
            if len(games) >= limit:
                break
            if index in considered:
                continue
            considered.add(index)
            try:
                original = chess.pgn.read_game(io.StringIO(chunk))
                game = factual_copy(original)
                if int(game.headers['PlyCount']) < 32:
                    continue
                sig = fingerprint(game)
            except (ValueError, IndexError, AttributeError):
                invalid += 1
                continue
            if sig in seen:
                continue
            games.append(game)
            seen.add(sig)
    if len(games) != target:
        raise ValueError(f"Only {len(games)} valid distinct games available from {source['url']}")
    return games, invalid


def main():
    manifest_path = ROOT / 'data' / 'library-sources.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    collections = [p for p in manifest['collections'] if p['id'] not in NEW_IDS]
    old_london = next(p for p in collections if p['id'] == 'london-master-games')
    old_london.update(label='伦敦体系示范片段', kind='line', section='示范片段')
    seen = set()
    for path in DEST.glob('*.pgn'):
        if path.stem in NEW_IDS:
            continue
        try:
            text = path.read_text(encoding='utf-8-sig')
        except UnicodeDecodeError:
            text = path.read_text(encoding='cp1252')
        for game in parse(text):
            if not game.errors:
                seen.add(fingerprint(game))
    names = [name for _, _, archives in SOURCES for name, _ in archives]
    with ThreadPoolExecutor(max_workers=4) as workers:
        fetched = dict(zip(names, workers.map(fetch, names)))
    additions = []
    for ident, label, archives in SOURCES:
        games, sources = [], []
        for name, quota in archives:
            source = fetched[name]
            selected, invalid = choose(source, quota, seen)
            games.extend(selected)
            sources.append({k: source[k] for k in ['url', 'sourceSha256']} | {'games': len(selected), 'invalidCandidatesOmitted': invalid})
        content = export_games(games).encode('utf-8')
        (DEST / (ident + '.pgn')).write_bytes(content)
        additions.append({'id': ident, 'label': label, 'group': 'openings', 'section': '开局实战', 'kind': 'game', 'file': ident + '.pgn', 'games': len(games), 'sources': sources, 'sha256': hashlib.sha256(content).hexdigest()})
        print(ident, len(games), 'valid complete games', flush=True)
    manifest['collections'] = collections + additions
    manifest['openingUpdatedAt'] = datetime.now(timezone.utc).isoformat()
    manifest['openingAdditionCount'] = sum(p['games'] for p in additions)
    manifest['totalNewEntries'] = sum(p['games'] for p in manifest['collections'])
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    write_packs(manifest)
    write_catalog(manifest)
    print('Added:', manifest['openingAdditionCount'], 'new distinct opening games; documented records:', manifest['totalNewEntries'], flush=True)


if __name__ == '__main__':
    main()
