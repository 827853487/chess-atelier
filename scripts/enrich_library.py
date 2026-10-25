"""Fetch factual PGN mainlines, validate, deduplicate, and build documented local collections.

Run explicitly to update the checked-in library; never runs during application startup.
"""
from __future__ import annotations
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import hashlib
import io
import json
import re
from pathlib import Path
import sys
from urllib.request import Request, urlopen

import chess
import chess.pgn
from library_catalog import write_packs, write_catalog

ROOT=Path(__file__).resolve().parents[1]
DEST=ROOT/'data'/'complete'
PGN='https://www.pgnmentor.com/events/'
GITHUB='https://raw.githubusercontent.com/usefulmove/chessdb/main/'
SOURCES=[
 ('world-1927','1927 世界冠军赛','masters','世界冠军赛',PGN+'WorldChamp1927.pgn'),
 ('world-1960','1960 塔尔—鲍特维尼克','masters','世界冠军赛',PGN+'WorldChamp1960.pgn'),
 ('world-1972','1972 菲舍尔—斯帕斯基','masters','世界冠军赛',PGN+'WorldChamp1972.pgn'),
 ('world-1985','1985 卡斯帕罗夫—卡尔波夫','masters','世界冠军赛',PGN+'WorldChamp1985.pgn'),
 ('world-2018','2018 卡尔森—卡鲁阿纳','masters','世界冠军赛',PGN+'WorldChamp2018.pgn'),
 ('world-2021','2021 卡尔森—涅波姆尼亚奇','masters','世界冠军赛',PGN+'WorldChamp2021.pgn'),
 ('zurich-1953','1953 苏黎世候选人赛','masters','经典锦标赛',PGN+'Candidates1953.pgn'),
 ('hastings-1895','1895 黑斯廷斯锦标赛','masters','经典锦标赛',PGN+'Hastings1895.pgn'),
 ('cairns-2019','2019 凯恩斯杯精选','masters','经典锦标赛',GITHUB+'CairnsCup2019.pgn'),
 ('grigoriev-studies','格里戈里耶夫残局研究','training','残局研究',GITHUB+'EndgameStudiesGrigoriev.pgn'),
 ('london-master-games','伦敦体系示范片段','openings','示范片段',GITHUB+'LondonSystemMasterGames.pgn'),
]
FACT_TAGS={'Event','Site','Date','Round','White','Black','Result','ECO','WhiteElo','BlackElo','FEN','SetUp','Setup'}


def fingerprint(game):
    moves=' '.join(m.uci() for m in game.mainline_moves())
    return hashlib.sha256((game.board().fen()+'|'+moves).encode()).hexdigest()


def parse(text):
    for chunk in re.split(r'(?=^\s*\[Event\s+")',text.lstrip('\ufeff'),flags=re.M):
        if not chunk.strip():continue
        stream=io.StringIO(chunk)
        while (game:=chess.pgn.read_game(stream)) is not None:yield game


def factual_copy(game):
    board=game.board()
    if game.errors or not board.is_valid():raise ValueError('Invalid PGN or starting FEN')
    copy=chess.pgn.Game()
    copy.headers.clear()
    for tag in ['Event','Site','Date','Round','White','Black','Result']:
        copy.headers[tag]=game.headers.get(tag,'?') or '?'
    for tag,value in game.headers.items():
        if tag in FACT_TAGS and tag not in copy.headers and value:copy.headers[tag]=value
    copy.headers.pop('Setup',None)
    if board.fen()!=chess.STARTING_FEN:copy.setup(board)
    else:
        copy.headers.pop('FEN',None);copy.headers.pop('SetUp',None)
    node=copy
    for move in game.mainline_moves():
        if move not in board.legal_moves:raise ValueError('Illegal mainline')
        node=node.add_main_variation(move);board.push(move)
    if node is copy:raise ValueError('No played moves (forfeit or position-only record)')
    copy.headers['PlyCount']=str(len(board.move_stack))
    return copy


def export_games(games):
    return '\n\n'.join(g.accept(chess.pgn.StringExporter(headers=True,variations=False,comments=False,columns=79)) for g in games)+'\n\n'


def fetch(source):
    ident,label,group,section,url=source
    with urlopen(Request(url,headers={'User-Agent':'ChessAtelier/1.6 (local factual PGN library)'}),timeout=35) as response:
        raw=response.read(8_000_001)
    if len(raw)>8_000_000 or b'[Event ' not in raw:raise ValueError('Unexpected PGN payload: '+url)
    for encoding in ['utf-8-sig','cp1252']:
        try:text=raw.decode(encoding);break
        except UnicodeDecodeError:continue
    return source,raw,text


def main():
    manifest_path=ROOT/'data'/'library-sources.json'
    previous=json.loads(manifest_path.read_text(encoding='utf-8')) if manifest_path.exists() else {}
    baseline=set();baseline_games=[]
    for path in DEST.glob('*.pgn'):
        if path.stem in {s[0] for s in SOURCES}|{'rook-endgames','pawn-endgames','minor-endgames','mating-classics'}:continue
        try:text=path.read_text(encoding='utf-8-sig')
        except UnicodeDecodeError:text=path.read_text(encoding='cp1252')
        for game in parse(text):
            if not game.errors:
                baseline.add(fingerprint(game));baseline_games.append(game)
    manifest={'fetchedAt':datetime.now(timezone.utc).isoformat(),'policy':'Factual tags and legal mainlines only; comments, prose annotations, NAGs and variations omitted.','collections':[]}
    pool=[];new_distinct=set()
    with ThreadPoolExecutor(max_workers=4) as workers:
        fetched=list(workers.map(fetch,SOURCES))
    for source,raw,text in fetched:
        ident,label,group,section,url=source
        games=[];seen=set();skipped=duplicates=0
        for original in parse(text):
            try:game=factual_copy(original)
            except (ValueError,IndexError):skipped+=1;continue
            sig=fingerprint(game)
            if sig in seen:duplicates+=1;continue
            if sig not in baseline:new_distinct.add(sig)
            seen.add(sig);games.append(game)
        content=export_games(games)
        (DEST/(ident+'.pgn')).write_bytes(content.encode('utf-8'))
        manifest['collections'].append({'id':ident,'label':label,'group':group,'section':section,'file':ident+'.pgn','games':len(games),'source':url,'sourceSha256':hashlib.sha256(raw).hexdigest(),'sha256':hashlib.sha256(content.encode()).hexdigest(),'duplicatesOmitted':duplicates,'invalidOrUnplayedOmitted':skipped,'kind':'study' if ident=='grigoriev-studies' else 'line' if ident=='london-master-games' else 'game'})
        if group=='masters':pool.extend(games)
        print(ident,len(games),'games;',duplicates,'duplicates;',skipped,'invalid/unplayed',flush=True)
    # Real endgame continuations, not invented solutions. Keep the original outcome and provenance.
    snippets={'pawn-endgames':[],'rook-endgames':[],'minor-endgames':[]}
    seen_fens=set()
    for game in pool+baseline_games:
        board=game.board();moves=list(game.mainline_moves());recorded_types=set()
        for ply,move in enumerate(moves):
            nonpawns=[p.piece_type for p in board.piece_map().values() if p.piece_type not in (chess.KING,chess.PAWN)]
            typ='pawn-endgames' if not nonpawns else 'rook-endgames' if set(nonpawns)=={chess.ROOK} else 'minor-endgames' if set(nonpawns)<= {chess.BISHOP,chess.KNIGHT} else None
            if typ and typ not in recorded_types and board.fullmove_number>=20 and len(moves)-ply>=(4 if typ=='pawn-endgames' else 6) and any(board.pieces(chess.PAWN,c) for c in (chess.WHITE,chess.BLACK)):
                fen_key=' '.join(board.fen().split()[:4])
                if fen_key not in seen_fens and len(snippets[typ])<40:
                    fragment=chess.pgn.Game();fragment.headers.update(game.headers);fragment.setup(board)
                    fragment.headers['SourceEvent']=game.headers['Event'];fragment.headers['SourceRound']=game.headers['Round']
                    fragment.headers['SourceStartPly']=str(ply);fragment.headers['Theme']=typ
                    node=fragment
                    for continuation in moves[ply:]:node=node.add_main_variation(continuation)
                    fragment.headers['PlyCount']=str(len(moves)-ply)
                    snippets[typ].append(fragment);seen_fens.add(fen_key);recorded_types.add(typ)
            board.push(move)
    labels={'pawn-endgames':'经典兵残局','rook-endgames':'经典车残局','minor-endgames':'经典轻子残局'}
    for ident,games in snippets.items():
        content=export_games(games);(DEST/(ident+'.pgn')).write_bytes(content.encode('utf-8'))
        manifest['collections'].append({'id':ident,'label':labels[ident],'group':'training','section':'实战残局','file':ident+'.pgn','kind':'fragment','games':len(games),'derivedFrom':[s[0] for s in SOURCES if s[2]=='masters']+['existing bundled historical games; exact event/round/players retained in each record'],'sha256':hashlib.sha256(content.encode()).hexdigest()})
        print(ident,len(games),'real endgame continuations',flush=True)
    mating=[g for g in pool if g.end().board().is_checkmate() and len(list(g.mainline_moves()))<=70][:40]
    content=export_games(mating);(DEST/'mating-classics.pgn').write_bytes(content.encode('utf-8'))
    manifest['collections'].append({'id':'mating-classics','label':'经典短局与将杀','group':'training','section':'战术实战','file':'mating-classics.pgn','kind':'game','games':len(mating),'derivedFrom':[s[0] for s in SOURCES if s[2]=='masters'],'sha256':hashlib.sha256(content.encode()).hexdigest()})
    # Preserve opening packs curated separately by enrich_openings.py.
    generated_ids={p['id'] for p in manifest['collections']}
    manifest['collections'].extend(p for p in previous.get('collections',[]) if p['id'] not in generated_ids)
    for key,value in previous.items():
        if key not in manifest:manifest[key]=value
    manifest['totalNewEntries']=sum(p['games'] for p in manifest['collections'])
    manifest['newDistinctMainlines']=len(new_distinct)
    (ROOT/'data'/'library-sources.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    write_packs(manifest);write_catalog(manifest)
    print('TOTAL:',manifest['totalNewEntries'],'local entries',flush=True)


if __name__=='__main__':main()
