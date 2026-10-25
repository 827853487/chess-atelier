"""Download a complete source corpus for Kasparov and clearly labelled master selections."""
from concurrent.futures import ThreadPoolExecutor
import hashlib
import io
import re
from urllib.request import Request, urlopen
import zipfile

import chess.pgn
from enrich_library import factual_copy, fingerprint
from library_catalog import commit_collections, save_collection

SOURCES = [
    ('kasparov-career', '卡斯帕罗夫对局', 'Kasparov', None),
    ('karpov-selection', '卡尔波夫实战精选', 'Karpov', 160),
    ('capablanca-selection', '卡帕布兰卡实战精选', 'Capablanca', 160),
    ('botvinnik-selection', '鲍特维尼克实战精选', 'Botvinnik', 160),
    ('petrosian-selection', '彼得罗相实战精选', 'Petrosian', 160),
    ('anand-selection', '阿南德实战精选', 'Anand', 160),
    ('carlsen-selection', '卡尔森实战精选', 'Carlsen', 200),
    ('judit-polgar-selection', '尤迪特·波尔加实战精选', 'PolgarJ', 120),
    ('hou-yifan-selection', '侯逸凡实战精选', 'Hou', 120),
    ('ding-liren-selection', '丁立人实战精选', 'Ding', 160),
]
HEADERS = re.compile(r'^\[(\w+)\s+"([^"\n]*)"\]', re.M)


def fetch(source):
    ident, label, player, limit = source
    url = 'https://www.pgnmentor.com/players/' + player + '.zip'
    with urlopen(Request(url, headers={'User-Agent': 'ChessAtelier factual PGN collector'}), timeout=60) as response:
        raw = response.read(35_000_001)
    if len(raw) > 35_000_000:
        raise ValueError('Oversized player archive')
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        entries = [p for p in archive.infolist() if p.filename.lower().endswith('.pgn')]
        if len(entries) != 1 or entries[0].file_size > 100_000_000:
            raise ValueError('Unexpected archive contents')
        payload = archive.read(entries[0])
    try:
        text = payload.decode('utf-8-sig')
    except UnicodeDecodeError:
        text = payload.decode('cp1252')
    text = text.replace('\r\r\n', '\n').replace('\r\n', '\n').replace('\r', '\n')
    candidates = []
    excluded_metadata = 0
    for index, chunk in enumerate(re.split(r'(?=^\[Event\s+")', text, flags=re.M)):
        if not chunk.strip():
            continue
        headers = dict(HEADERS.findall(chunk))
        if any(not headers.get(k) or '?' in headers[k] for k in ['White', 'Black', 'Event']) or not headers.get('Date', '')[:4].isdigit() or headers.get('Result') not in ['1-0', '0-1', '1/2-1/2'] or headers.get('SetUp') == '1':
            excluded_metadata += 1
            continue
        candidates.append((headers.get('Date'), index, headers, chunk))
    candidates.sort(key=lambda row: (row[0], row[1]))
    if limit:
        # Draw from every part of the source chronology, not just a single event/era.
        selected_indices = {round(i*(len(candidates)-1)/(limit-1)) for i in range(min(limit,len(candidates)))}
        ordered = [row for i, row in enumerate(candidates) if i in selected_indices] + [row for i, row in enumerate(candidates) if i not in selected_indices]
    else:
        ordered = candidates
    games, seen, invalid, duplicates = [], set(), 0, 0
    for _, _, headers, chunk in ordered:
        if limit and len(games) == limit:
            break
        try:
            game = factual_copy(chess.pgn.read_game(io.StringIO(chunk)))
            if int(game.headers['PlyCount']) < 2:
                raise ValueError('Unplayed or abbreviated record')
        except (ValueError, IndexError):
            invalid += 1
            continue
        signature = fingerprint(game)
        if signature in seen:
            duplicates += 1
            continue
        seen.add(signature)
        game.headers['SourceRecordId'] = signature[:20]
        game.headers['Source'] = url
        games.append(game)
    games.sort(key=lambda game: (game.headers['Date'], game.headers['Event'], game.headers['Round']))
    print(ident, len(games), 'validated named games', flush=True)
    description = ('收录 PGN Mentor 本次棋手谱库中通过检查的具名、已定结果的标准棋完整主线，按年代排序；不是所有生涯对局的穷尽目录。' if limit is None else f'从 PGN Mentor 棋手库按时间均匀选取 {len(games)} 盘，覆盖不同阶段及胜和负结果；这是实战精选，不是官方最佳对局排名。')
    pack = save_collection(ident, games, label=label, group='masters', section='世界冠军与名家', kind='game', source=url,
                           sourceSha256=hashlib.sha256(raw).hexdigest(), sourceRecords=len(candidates)+excluded_metadata,
                           metadataOmitted=excluded_metadata, invalidOrUnplayedOmitted=invalid, duplicatesOmitted=duplicates,
                           coverage='validated source corpus' if limit is None else 'chronological selection', description=description,
                           referenceTitle='PGN Mentor 棋手库', referenceUrl='https://www.pgnmentor.com/files.html')
    return pack


def main():
    with ThreadPoolExecutor(max_workers=3) as workers:
        packs = list(workers.map(fetch, SOURCES))
    manifest = commit_collections(packs, 'champion')
    print('Master additions:', manifest['championAdditionCount'], 'records in', len(packs), 'packs', flush=True)


if __name__ == '__main__':
    main()
