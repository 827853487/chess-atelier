"""Audit local PGN endings without assuming that recorded wins end in mate."""
import collections
import hashlib
import io
import json
import re
from pathlib import Path
import chess
import chess.pgn

ROOT = Path(__file__).resolve().parents[1]


def main():
    sources = json.loads((ROOT/'data/library-sources.json').read_text(encoding='utf-8'))
    metadata = {row['file']: row for row in sources['collections']}
    report = {'files': [], 'totals': {}, 'masters': {}, 'issues': [], 'reference': {}}
    totals, masters = collections.Counter(), collections.Counter()
    for file in sorted((ROOT/'data/complete').glob('*.pgn')):
        raw = file.read_bytes()
        pack = metadata.get(file.name, {})
        if pack.get('sha256') and hashlib.sha256(raw).hexdigest() != pack['sha256']:
            report['issues'].append({'file':file.name, 'issue':'manifest checksum mismatch'})
        rows, count = [], collections.Counter()
        try:
            text,encoding = raw.decode('utf-8-sig'),'utf-8'
        except UnicodeDecodeError:
            text,encoding = raw.decode('latin-1'),'latin-1'
        index = 0
        text = text.replace('\r\n','\n').replace('\r','\n')
        # Old annotated packs can contain two blank lines after their headers.
        # Parse each Event record separately, normalizing only that separator;
        # otherwise python-chess treats a header as an empty extra game.
        chunks = [s for s in re.split(r'(?=^\[Event\s+")',text,flags=re.M) if s.strip()]
        for chunk in chunks:
            chunk = re.sub(r'(?m)(^\[[^\n]*\]\r?\n)\s*\n+',r'\1\n',chunk)
            game = chess.pgn.read_game(io.StringIO(chunk))
            if game is None:
                report['issues'].append({'file':file.name,'issue':'empty record'})
                continue
            index += 1
            moves = list(game.mainline_moves())
            board = game.end().board()
            result = game.headers.get('Result', '*')
            mate = board.is_checkmate()
            category = 'checkmate' if mate else 'recorded_win_without_mate' if result in ('1-0','0-1') else 'recorded_draw' if result == '1/2-1/2' else 'unfinished_or_instructional'
            count[category] += 1
            if game.errors:
                report['issues'].append({'file':file.name,'index':index,'issue':'parse error','errors':[str(e) for e in game.errors]})
            if mate and result not in ('*', board.result()):
                report['issues'].append({'file':file.name,'index':index,'issue':'mate/result mismatch','result':result,'actual':board.result()})
            declared = game.headers.get('PlyCount', '')
            if declared.isdigit() and int(declared) != len(moves):
                report['issues'].append({'file':file.name,'index':index,'issue':'PlyCount mismatch','declared':int(declared),'moves':len(moves)})
            rows.append({'fen':board.fen(en_passant='fen'),'plies':len(moves),'mate':mate,'check':board.is_check(),'result':result,'white':game.headers.get('White',''),'black':game.headers.get('Black',''),'event':game.headers.get('Event','')})
        count['games'] = index
        totals.update(count)
        if pack.get('group') == 'masters':
            masters.update(count)
        report['files'].append({'file':file.name,'group':pack.get('group','legacy'),'kind':pack.get('kind','legacy'),'encoding':encoding,'sha256':hashlib.sha256(raw).hexdigest(),**dict(count)})
        report['reference'][file.name] = rows
        print(file.name, index, 'records', flush=True)
    report['totals'], report['masters'] = dict(totals), dict(masters)
    target = ROOT/'test-results/game-endings-audit.json'
    target.parent.mkdir(exist_ok=True)
    target.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'totals':report['totals'],'masters':report['masters'],'issues':report['issues']},ensure_ascii=False),flush=True)


if __name__ == '__main__':
    main()
