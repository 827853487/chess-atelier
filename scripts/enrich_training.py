"""Build an attributed classical course and graded CC0 puzzles, entirely offline at runtime.

The maintenance collector uses Python 3.14's streaming zstd reader (or python-zstandard).
It never downloads the complete large Lichess archive to disk.
"""
import csv
from datetime import datetime, timezone
import hashlib
import io
import json
import re
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import chess
import chess.pgn
from enrich_library import FACT_TAGS, factual_copy, fingerprint
from library_catalog import ROOT, commit_collections, save_collection

DATABASE = 'https://database.lichess.org/lichess_db_puzzle.csv.zst'
REFERENCE = 'https://www.gutenberg.org/ebooks/33870'
COURSE_REPO = 'https://github.com/lordlinks/Chess_Fundamentals'
TEX_SOURCE = 'https://raw.githubusercontent.com/lordlinks/Chess_Fundamentals/main/chess_fundamentals.tex'
STUDIES = ['uL7pPw98', 'k3M5fqR7']
# Identifier, readable name, curriculum group, independently written learning objective.
THEMES = [
 ('fork','双重攻击','战术·基本手段','寻找能同时制造两个威胁的着法。'),
 ('pin','牵制','战术·基本手段','利用被牵制的棋子不能自由移动这一限制。'),
 ('skewer','串击','战术·基本手段','先攻击前方重要棋子，再获得其后的目标。'),
 ('discoveredAttack','闪击','战术·基本手段','移开遮挡棋子，释放后方棋子的攻击。'),
 ('doubleCheck','双将','战术·基本手段','计算两个棋子同时将军时王的应对。'),
 ('capturingDefender','消除防守','战术·组合计算','先处理关键防守子，再兑现后续威胁。'),
 ('deflection','引离','战术·组合计算','迫使防守子离开必须守住的线路或格子。'),
 ('attraction','引入','战术·组合计算','把对方关键棋子吸引到有利于组合的位置。'),
 ('interference','截断','战术·组合计算','通过占据关键格切断对手棋子的联系。'),
 ('clearance','腾挪','战术·组合计算','让出关键线路或格子，给后续行动创造空间。'),
 ('intermezzo','中间着','战术·组合计算','先检查是否有比立即回应更强的插入着法。'),
 ('quietMove','静着','战术·组合计算','寻找不将军、不立即吃子但建立强制威胁的着法。'),
 ('defensiveMove','防守与解围','战术·组合计算','先识别对方威胁，再寻找准确的应对资源。'),
 ('backRankMate','底线将杀','将杀模式','检查底线上的王是否缺少逃生格。'),
 ('smotheredMate','闷杀','将杀模式','利用对方自己的棋子封住王的退路。'),
 ('mateIn1','一步将杀','将杀模式','在所有合法将军中找出立即将死的一着。'),
 ('mateIn2','两步将杀','将杀模式','计算首着及对方应手，完成强制将杀。'),
 ('mateIn3','三步将杀','将杀模式','把强制将军、封锁退路和最后一击连成变化。'),
 ('promotion','升变突破','残局·计算与技术','比较兵的推进、护送和升变后的威胁。'),
 ('underPromotion','弱升变','残局·计算与技术','考虑升为车、象或马的特殊作用。'),
 ('zugzwang','等着与楚茨文克','残局·计算与技术','寻找把不利走棋义务交给对手的方法。'),
 ('pawnEndgame','兵残局计算','残局·计算与技术','结合王的活动、兵的推进和节奏计算结果。'),
 ('rookEndgame','车残局计算','残局·计算与技术','比较车的活跃程度、王的位置和通路兵。'),
 ('bishopEndgame','象残局计算','残局·计算与技术','结合色格、兵形和象的远程作用寻找变化。'),
 ('knightEndgame','马残局计算','残局·计算与技术','检查马的跳跃、叉击及兵的推进节奏。'),
 ('queenEndgame','后残局计算','残局·计算与技术','重点计算将军、王的安全与通路兵。'),
]


def open_url(url):
    for attempt in range(4):
        try:return urlopen(Request(url, headers={'User-Agent':'ChessAtelier local factual curriculum collector'}), timeout=60)
        except HTTPError as error:
            if error.code!=429 or attempt==3:raise
            print('Source rate limit; waiting 60 seconds before retry:',url,flush=True)
            error.close();time.sleep(60)


def read_games(stream):
    while (game:=chess.pgn.read_game(stream)) is not None:yield game


def course(local_copy=False):
    games, sources, repairs, position_only = [], [], [], 0
    ordinal = 0
    local_games=list(read_games(io.StringIO((ROOT/'data'/'complete'/'capablanca-fundamentals.pgn').read_text(encoding='utf-8')))) if local_copy else []
    local_pack=next(p for p in json.loads((ROOT/'data'/'library-sources.json').read_text(encoding='utf-8'))['collections'] if p['id']=='capablanca-fundamentals') if local_copy else None
    if local_pack:repairs=list(local_pack.get('sourceCorrections',[]))
    with open_url(TEX_SOURCE) as response:tex_raw=response.read(2_000_001)
    if len(tex_raw)>2_000_000:raise ValueError('Unexpected typeset source size')
    tex=tex_raw.decode('utf-8')
    for study in STUDIES:
        url = f'https://lichess.org/api/study/{study}.pgn'
        if local_copy:
            sources.append(next(s for s in local_pack['sources'] if s['url']==url))
            originals=[game for game in local_games if game.headers.get('Source')==url]
            for game in originals:game.headers['ChapterName']=game.headers['BookChapter']
        else:
            with open_url(url) as response:raw=response.read(4_000_001)
            if len(raw)>4_000_000:raise ValueError('Unexpected course payload')
            sources.append({'url':url,'sourceSha256':hashlib.sha256(raw).hexdigest()})
            originals=read_games(io.StringIO(raw.decode('utf-8-sig')))
        for original in originals:
            ordinal += 1
            chapter = original.headers.get('ChapterName',f'Chapter {ordinal}')
            if not original.headers.get('FEN') and not list(original.mainline_moves()):
                number=re.search(r'Example\s+(\d+)',chapter)
                match=re.search(r'Example\s+'+number.group(1)+r'(?=[}\s.])',tex) if number else None
                if not match:raise ValueError('Missing textbook diagram: '+chapter)
                end=tex.find('\\subsubsection',match.end())
                block=tex[match.start():end if end>=0 else len(tex)]
                fen_match=re.search(r'\\fenboard\{([^}]+)\}',block)
                if not fen_match:raise ValueError('No source FEN for '+chapter)
                original.headers['FEN']=fen_match.group(1);original.headers['SetUp']='1'
                lines=re.findall(r'\\mainline\{([^}]+)\}',block)
                restored_plies=0
                if lines:
                    notation=' '.join(lines).replace(',',' ').replace('\\#','#')
                    restored=chess.pgn.read_game(io.StringIO('[FEN "'+fen_match.group(1)+'"]\n[SetUp "1"]\n\n'+notation+' *'))
                    if restored.errors:raise ValueError('Illegal typeset reference line for '+chapter)
                    restored.headers.update(original.headers);original=restored
                    restored_plies=sum(1 for _ in restored.mainline_moves())
                repairs.append({'chapter':chapter,'reason':'restored missing diagram from the CC0 typeset source','source':TEX_SOURCE,'correctedFen':fen_match.group(1),'referencePliesRestored':restored_plies})
            # Study exports may label impossible classical castling flags as Chess960.
            # These book positions are orthodox chess: validate in that ruleset explicitly.
            board = chess.Board(original.headers.get('FEN',chess.STARTING_FEN),chess960=False)
            original.headers.pop('Variant',None)
            before = original.headers.get('FEN',board.fen())
            if board.status() & chess.STATUS_BAD_CASTLING_RIGHTS:
                board.castling_rights = board.clean_castling_rights()
                original.headers['FEN'] = board.fen()
                repairs.append({'chapter':chapter,'originalFen':before,'correctedFen':board.fen(),'reason':'removed impossible castling rights; pieces and turn unchanged'})
            if original.errors or not board.is_valid():
                raise ValueError('Invalid book chapter: '+chapter)
            moves = list(original.mainline_moves())
            if 'FEN' in original.headers and original.headers.get('Date','')[:4].isdigit() and int(original.headers['Date'][:4])>1942:
                original.headers['Date']='????.??.??'
            if moves:
                game = factual_copy(original)
            else:
                game = chess.pgn.Game();game.headers.update({k:v for k,v in original.headers.items() if k in FACT_TAGS});game.setup(board)
                game.headers['PlyCount'] = '0';position_only += 1
            for color in ['White','Black']:
                if not game.headers.get(color) or '?' in game.headers[color]:game.headers[color] = '白方' if color=='White' else '黑方'
            nonpawns = {piece.piece_type for piece in board.piece_map().values() if piece.piece_type not in [chess.KING,chess.PAWN]}
            topic = '兵的升变与兵残局' if not nonpawns else '车与王的配合' if nonpawns=={chess.ROOK} else '象与王兵的配合' if nonpawns=={chess.BISHOP} else '马与王兵的配合' if nonpawns=={chess.KNIGHT} else '后与王的配合' if nonpawns=={chess.QUEEN} else '子力配合与战略'
            suffix = chapter.replace('Example ','例 ').replace('Game ','范局 ')
            title = suffix+' · '+topic
            if chapter.startswith('Game '):title=suffix+' · '+game.headers['White']+' — '+game.headers['Black']
            game.headers['TrainingTitle']=title;game.headers['BookChapter']=chapter
            game.headers['SourceRecordId']='fundamentals-'+study+'-'+str(ordinal)
            game.headers['Reference']=REFERENCE;game.headers['Source']=url
            if any(item['chapter']==chapter for item in repairs):game.headers['SourceCorrection']='See collection sourceCorrections for documented diagram or castling-flag normalization'
            games.append(game)
    if len(games)!=81:
        raise ValueError(f'Course source changed: expected 81 public study chapters, received {len(games)}')
    sources.append({'url':TEX_SOURCE,'sourceSha256':hashlib.sha256(tex_raw).hexdigest()})
    pack=save_collection('capablanca-fundamentals',games,label='卡帕布兰卡·国际象棋基础',group='training',section='经典教材·循序渐进',kind='course',sources=sources,
                         description='按公开整理版的 81 章顺序学习基本将杀、兵残局、子力配合、中局战略及 14 盘范局。保留整理版的 65 A／65 B 等编号；仅提供局面和参考主线，不等同于原书完整注释或所有分支。',
                         referenceTitle='Capablanca · Chess Fundamentals（公开原书）',referenceUrl=REFERENCE,coverage='all 81 chapters of the two linked public study exports',positionOnly=position_only,
                         transcriptionRepository=COURSE_REPO,sourceCorrections=repairs)
    print('Book course:',len(games),'chapters;',position_only,'position-only;',len(repairs),'documented source repairs',flush=True)
    return pack


class TrackedResponse:
    def __init__(self,response):self.response=response;self.sha=hashlib.sha256();self.count=0
    def read(self,size=-1):
        data=self.response.read(size);self.sha.update(data);self.count+=len(data);return data
    def __getattr__(self,name):return getattr(self.response,name)


def candidates():
    buckets={key:[] for key,_,_,_ in THEMES};per_band={key:[0,0,0] for key in buckets}
    with open_url(DATABASE) as response:
        tracked=TrackedResponse(response)
        try:
            from compression import zstd
            reader=zstd.ZstdFile(tracked)
        except ImportError:
            import zstandard
            reader=zstandard.ZstdDecompressor().stream_reader(tracked)
        with io.TextIOWrapper(reader,encoding='utf-8',newline='') as text:
            rows=csv.DictReader(text);fields=rows.fieldnames;scanned=0
            for row in rows:
                scanned+=1
                rating=int(row['Rating'])
                if 800<=rating<=2400 and int(row['Popularity'])>=85 and int(row['NbPlays'])>=300 and int(row['RatingDeviation'])<=85:
                    band=0 if rating<1400 else 1 if rating<1900 else 2
                    for key in set(row['Themes'].split()).intersection(buckets):
                        if per_band[key][band]<45:
                            buckets[key].append(row);per_band[key][band]+=1
                if scanned%50000==0:print('Puzzle rows inspected:',scanned,'; available per theme:',min(map(len,buckets.values())),flush=True)
                if scanned>=350000 or all(len(items)>=90 and min(per_band[key])>=10 for key,items in buckets.items()):break
        metadata={'rowsInspected':scanned,'compressedPrefixBytesRead':tracked.count,'compressedPrefixSha256':tracked.sha.hexdigest(),'archiveSize':response.headers.get('Content-Length'),'fetchedAt':datetime.now(timezone.utc).isoformat(),'license':'CC0-1.0','selection':'rating 800–2400; popularity >=85; plays >=300; rating deviation <=85; target 10 puzzles per rating band per motif, maximum 30; unique puzzle IDs and initial positions across packs'}
    return buckets,fields,metadata


def to_pgn(row,label):
    board=chess.Board(row['FEN'])
    if not board.is_valid():raise ValueError('Invalid puzzle FEN')
    moves=[chess.Move.from_uci(word) for word in row['Moves'].split()]
    if len(moves)<2 or moves[0] not in board.legal_moves:raise ValueError('Missing setup move')
    board.push(moves[0])
    game=chess.pgn.Game();game.setup(board)
    game.headers.update({'Event':'Lichess puzzle '+row['PuzzleId'],'Site':row['GameUrl'],'White':'白方','Black':'黑方','Result':'*',
                         'PuzzleId':row['PuzzleId'],'PuzzleRating':row['Rating'],'PuzzleThemes':row['Themes'],'PuzzleSetupMove':moves[0].uci(),'PuzzleBeforeFEN':row['FEN'],
                         'PuzzlePopularity':row['Popularity'],'PuzzlePlays':row['NbPlays'],'PuzzleURL':'https://lichess.org/training/'+row['PuzzleId'],
                         'SourceRecordId':'lichess-'+row['PuzzleId'],'Source':DATABASE})
    node=game
    for move in moves[1:]:
        if move not in board.legal_moves:raise ValueError('Illegal puzzle solution')
        node=node.add_main_variation(move);board.push(move)
    if 'mate' in row['Themes'].split() and not board.is_checkmate():raise ValueError('Incomplete mate solution')
    game.headers['PlyCount']=str(len(moves)-1)
    if board.is_checkmate():game.headers['Result']='0-1' if board.turn==chess.WHITE else '1-0'
    level='基础' if int(row['Rating'])<1400 else '进阶' if int(row['Rating'])<1900 else '挑战'
    game.headers['TrainingTitle']=label+' · '+level+' '+row['Rating']+' · '+row['PuzzleId']
    return game


def puzzles():
    buckets,fields,metadata=candidates();selected={};used_ids=set();used_positions=set();raw_rows=[];invalid=0
    # Rarer motifs choose first; common themes then draw from their remaining candidates.
    labels={key:label for key,label,_,_ in THEMES}
    for key in sorted(buckets,key=lambda name:len(buckets[name])):
        pool=sorted(buckets[key],key=lambda row:(int(row['Rating']),row['PuzzleId']))
        bands=[[row for row in pool if (0 if int(row['Rating'])<1400 else 1 if int(row['Rating'])<1900 else 2)==band] for band in range(3)]
        preferred=[]
        for band in bands:
            if band:
                preferred.extend(band[round(i*(len(band)-1)/max(1,min(10,len(band))-1))] for i in range(min(10,len(band))))
        ordered=preferred+pool;games=[];local_ids=set()
        for row in ordered:
            if len(games)>=30:break
            ident=row['PuzzleId']
            if ident in used_ids or ident in local_ids:continue
            try:game=to_pgn(row,labels[key])
            except (ValueError,AssertionError):invalid+=1;continue
            position=' '.join(game.board().fen().split()[:4])
            if position in used_positions:continue
            used_ids.add(ident);local_ids.add(ident);used_positions.add(position);games.append(game);raw_rows.append(row)
        if len(games)<12:raise ValueError('Insufficient reliable puzzles for '+key+': '+str(len(games)))
        selected[key]=sorted(games,key=lambda game:int(game.headers['PuzzleRating']))
    sample=io.StringIO(newline='');writer=csv.DictWriter(sample,fieldnames=fields);writer.writeheader();writer.writerows(sorted(raw_rows,key=lambda row:row['PuzzleId']))
    content=sample.getvalue().encode('utf-8');(ROOT/'data'/'training-source-rows.csv').write_bytes(content)
    metadata.update(sampleRows=len(raw_rows),sourceSampleSha256=hashlib.sha256(content).hexdigest(),invalidCandidatesOmitted=invalid)
    packs=[]
    for key,label,section,objective in THEMES:
        games=selected[key];ratings=[int(game.headers['PuzzleRating']) for game in games]
        packs.append(save_collection('practice-'+key.lower(),games,label=label+' · 分级练习',group='training',section=section,kind='puzzle',source=DATABASE,
                                    description=objective+' 按题目等级分从低到高练习；先独立计算，再用着法记录和本地分析核对。参考线不是所有合法解法的穷尽。',
                                    referenceTitle='Lichess CC0 题库与主题体系',referenceUrl='https://database.lichess.org/#puzzles',coverage='graded curated subset',
                                    ratingMin=min(ratings),ratingMax=max(ratings),theme=key,license='CC0-1.0'))
        print(key,len(games),'graded exercises',flush=True)
    return packs,metadata


def main():
    practice,metadata=puzzles();book=course()
    manifest=commit_collections([book]+practice,'training',metadata)
    print('Training additions:',manifest['trainingAdditionCount'],'records;',len(practice),'motifs plus the classical course',flush=True)


if __name__=='__main__':main()
