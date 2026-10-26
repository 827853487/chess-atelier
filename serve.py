"""Chess Atelier HTTP server. Run: python serve.py [--port 8765] [--db games.sqlite]
Local Stockfish play/analysis; optional public score and music resources.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
import re
import sqlite3
import time
import threading
import socket
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.request import build_opener, ProxyHandler, getproxies, HTTPRedirectHandler
from pathlib import Path
from threading import RLock
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlencode, urlsplit, quote, unquote
from urllib.request import Request, urlopen
from local_engine import PLAY_ENGINE, ANALYSIS_ENGINE, EngineUnavailable, EngineBusy, board_from_request

ROOT = Path(__file__).resolve().parent
APP_ID = hashlib.sha256(str(ROOT).encode('utf-8')).hexdigest()[:16]
APP_REVISION = hashlib.sha256(b''.join((ROOT/name).read_bytes() for name in ('serve.py','local_engine.py','launch.py','launch_lan.py','app.bundle.js','engine-ui.css'))).hexdigest()[:16]
COMMONS_QUERY = frozenset(('action','format','formatversion','origin','generator','gsrsearch','gsrnamespace','gsrlimit','gsroffset','prop','iiprop','cmtitle','cmtype','cmlimit','gcmtitle','gcmtype','gcmlimit','gcmcontinue','list','titles','cmcontinue','iiextmetadatafilter','iiextmetadatalanguage'))
MASTER_BOOKS={'fischer':'My Memorable 60.pgn','tal':'Life and Games of Mikhail Tal.pgn'}
ARCHIVE_PACKS={
 'chess-classics':'ChessClassics.pgn','morphy-anderssen':'MorphyAnderssen.pgn','capablanca-1924':'NewYork1924.pgn',
 'alekhine':'AlexanderAlekhine.pgn','book-of-favorites':'BookofFavoriteGames.pgn',
 'reti-1933':'MastersoftheChessboardReti1933.pgn',
 'world-2018':'CarlsenCaruana_2018WorldChampionship.pgn','tal-botvinnik':'TalBotvinnik1960.pgn',
 'alekhine-1935':'AlekhineEuwe_1935WorldChampionship.pgn','alekhine-1937':'AlekhineEuwe_1937WorldChampionship.pgn',
 'tal-lifes':'TheLifeandGamesofMikhailTal1997.pgn','bronstein-browne':'BronsteinBrowne1990.pgn',
 'kamsky':'GataKamsky.pgn',
 'candidates-2018':'CandidatesTournament2018.pgn','candidates-2020':'CandidatesTournament2020.pgn',
 'london':'LondonSystemMasterGames.pgn','london-kid':'LondonSystemKingsIndianDefence.pgn',
 'tcecs15':'TCECSeason15Superfinal2019_Lc0Stockfish.pgn','tcec14':'Lc0StockfishTCEC14Superfinal2019.pgn',
 'cairns2019':'CairnsCup2019.pgn','domination-studies':'KasparianDominationStudies.pgn',
 'endgame-studies':'EndgameStudiesGrigoriev.pgn','instructive':'MostInstructiveGamesChernev.pgn',
 'logical-chess':'LogicalChessMoveByMoveChernev.pgn','camden-school':'CamdenChessSchool.pgn',
 'shankland-method':'ShanklandMethod.pgn','amateurs-mind':'TheAmateursMindSilman.pgn',
 'calculation':'CalculationAagaard.pgn','thinking-box':'ThinkingInsideTheBoxAagaard.pgn',
 'modern-training':'GameChangerSadlerRegan2019.pgn',
 'english-opening':'HowtoPlaytheEnglishOpeningKarpov.pgn'
}
# Famous complete PGNs are acquired without Lichess authentication and stored on disk.
# Once successfully downloaded, reopening the website does not need network for these scores.
LIBRARY_DIR=ROOT/'data'/'complete'
BUILTIN_SCORES={
 'fischer':('brianerdelyi/ChessPGN','My Memorable 60.pgn'),
 'tal':('brianerdelyi/ChessPGN','Life and Games of Mikhail Tal.pgn'),
 'chess-classics':('usefulmove/chessdb','ChessClassics.pgn'),
 'morphy-anderssen':('usefulmove/chessdb','MorphyAnderssen.pgn'),
 'capablanca-1924':('usefulmove/chessdb','NewYork1924.pgn'),
 'alekhine':('usefulmove/chessdb','AlexanderAlekhine.pgn'),
 'book-of-favorites':('usefulmove/chessdb','BookofFavoriteGames.pgn'),
 'instructive':('usefulmove/chessdb','MostInstructiveGamesChernev.pgn'),
 'logical-chess':('usefulmove/chessdb','LogicalChessMoveByMoveChernev.pgn'),
}
LIBRARY_PROGRESS={'started':False,'finished':False,'busy':False,'message':'准备中'}
LIBRARY_PROGRESS_LOCK=RLock()
def cached_library_files():
    result=[]
    for key in BUILTIN_SCORES:
        path=LIBRARY_DIR/(key+'.pgn')
        result.append({'id':key,'ready':path.is_file() and path.stat().st_size>3000,
                       'bytes':path.stat().st_size if path.is_file() else 0})
    return result

def download_library_background():
    with LIBRARY_PROGRESS_LOCK:
        if LIBRARY_PROGRESS['busy']:return
        LIBRARY_PROGRESS.update(started=True,finished=False,busy=True,message='正在准备经典完整棋谱')
    LIBRARY_DIR.mkdir(parents=True,exist_ok=True)
    for key,(repo,path) in BUILTIN_SCORES.items():
        dest=LIBRARY_DIR/(key+'.pgn')
        if dest.exists() and dest.stat().st_size>3000:continue
        with LIBRARY_PROGRESS_LOCK:LIBRARY_PROGRESS['message']='下载 '+key
        url='https://raw.githubusercontent.com/'+repo+'/main/'+quote(path)
        try:
            raw,_=upstream(url,cap=15_000_000,timeout=23)
            if len(raw)<3000 or b'[White ' not in raw or b'[Black ' not in raw:
                raise ValueError('Not a complete PGN collection')
            temp=dest.with_suffix('.part');temp.write_bytes(raw);temp.replace(dest)
        except Exception as e:
            print('经典棋谱下载未完成: '+key+' '+str(e)[:140],flush=True)
    ready=sum(p['ready'] for p in cached_library_files())
    with LIBRARY_PROGRESS_LOCK:
        LIBRARY_PROGRESS.update(finished=True,busy=False,
           message=('已准备 '+str(ready)+' 个完整对局合集') if ready else '首次准备需要联网；请检查代理设置')

def start_library_download():
    thread=threading.Thread(target=download_library_background,name='chess-books',daemon=True)
    thread.start()

CACHE_LOCK=RLock()
CACHE={}
CACHE_LIMIT=85
USER_AGENT='ChessAtelier/1.2 (classical-music-and-chess-learning; contact via originating repository)'
VERSION='1.6-stockfish'
PROXY_URL=os.environ.get('CHESS_ATELIER_PROXY','').strip()
HTTP_OPENER=None
AUDIO_URL_LOCK=RLock()
AUDIO_URLS={}
AUDIO_URL_LIMIT=4000
AUDIO_EXT=re.compile(r'\.(ogg|oga|mp3|opus|flac|wav|webm)$',re.I)


def resolve_audio_urls(filenames):
    """Resolve Commons file names to direct upload.wikimedia.org media URLs.

    Commons media URLs are content-addressed and permanent, so resolved URLs are
    cached in memory for the lifetime of the server. Resolving a whole batch in a
    single API call removes the per-track metadata round trip that made the first
    playback of every recording slow.
    """
    names=[]
    for name in filenames:
        if 0<len(name)<250 and AUDIO_EXT.search(name) and name not in names:
            names.append(name)
    with AUDIO_URL_LOCK:
        pending=[n for n in names if n not in AUDIO_URLS]
    if pending:
        for start in range(0,len(pending),50):
            chunk=pending[start:start+50]
            titles='|'.join('File:'+n for n in chunk)
            params=urlencode({'action':'query','format':'json','formatversion':'2',
                              'titles':titles,'prop':'imageinfo','iiprop':'url|mime'})
            try:
                data,_=upstream('https://commons.wikimedia.org/w/api.php?'+params,
                                cap=1_000_000,timeout=15)
                for page in json.loads(data).get('query',{}).get('pages',[]):
                    title=str(page.get('title') or '')
                    if not title.startswith('File:'):continue
                    info=(page.get('imageinfo') or [{}])[0]
                    url=info.get('url') or ''
                    if urlsplit(url).scheme=='https' and urlsplit(url).hostname=='upload.wikimedia.org':
                        with AUDIO_URL_LOCK:
                            if len(AUDIO_URLS)>=AUDIO_URL_LIMIT:
                                AUDIO_URLS.pop(next(iter(AUDIO_URLS)),None)
                            AUDIO_URLS[title[5:]]=url
            except Exception as exc:
                print('audio url resolution failed: '+str(exc)[:140],flush=True)
    with AUDIO_URL_LOCK:
        return {n:AUDIO_URLS.get(n,'') for n in names}


def upstream_headers(url):
    return {'User-Agent':USER_AGENT,'Accept':'application/json, text/plain, application/x-chess-pgn, */*'}


def upstream(url, cap=30_000_000, timeout=18):
    req=Request(url,headers=upstream_headers(url))
    with (HTTP_OPENER or build_opener()).open(req,timeout=timeout) as resp:
        raw=resp.read(cap+1)
        if len(raw)>cap:raise ValueError('Upstream content too large')
        ct=resp.headers.get('Content-Type','application/octet-stream')
        return raw,ct


def cached_get(url,ttl,cap=30_000_000):
    now=time.time()
    with CACHE_LOCK:
        entry=CACHE.get(url)
        if entry and entry[0]>now:return entry[1:]
    data,ct=upstream(url,cap)
    with CACHE_LOCK:
        if len(data)>6_000_000:return data,ct  # Do not pin huge PGNs in server RAM.
        if len(CACHE)>=CACHE_LIMIT:
            oldest=next(iter(CACHE));CACHE.pop(oldest,None)
        CACHE[url]=(now+ttl,data,ct)
    return data,ct

def live_diagnostics():
    local=PLAY_ENGINE.status()
    return {'ok':local['available'],'version':VERSION,'engine':local,
            'message':'对弈与局面分析仅使用本地 Stockfish，无需远程引擎或访问密钥。'}


class AtelierServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = os.name != 'nt'
    request_queue_size = 128

    def server_bind(self):
        if os.name == 'nt':
            self.socket.setsockopt(socket.SOL_SOCKET,socket.SO_EXCLUSIVEADDRUSE,1)
        super().server_bind()


class Handler(SimpleHTTPRequestHandler):
    def engine_request(self, data, play=False):
        try:
            board = board_from_request(data)
            if play:
                level = int(data.get('level', 2))
                return self.payload(PLAY_ENGINE.play(board, level))
            seconds = 4.0 if data.get('deep') else .45 if data.get('review') else 1.2
            updates = ANALYSIS_ENGINE.analyze(board, seconds)
            # Acquire the engine before sending HTTP headers, so busy/unavailable remain real errors.
            first = next(updates)
        except (ValueError, TypeError) as exc:
            return self.payload({'ok':False,'message':str(exc)},400)
        except EngineBusy as exc:
            return self.payload({'ok':False,'message':str(exc)},503)
        except EngineUnavailable as exc:
            return self.payload({'ok':False,'available':False,'message':str(exc)},503)
        if not data.get('stream'):
            try:
                last = first
                for last in updates:pass
                return self.payload(last)
            except (EngineUnavailable, EngineBusy) as exc:
                return self.payload({'available':False,'message':str(exc)},503)
            finally:
                updates.close()
        self.send_response(200)
        self.send_header('Content-Type','text/event-stream; charset=utf-8')
        self.send_header('Cache-Control','no-store')
        self.send_header('Connection','close')
        self.end_headers()
        self.close_connection = True
        def emit(value):
            self.wfile.write(('data: '+json.dumps(value,ensure_ascii=False)+'\n\n').encode('utf-8'))
            self.wfile.flush()
        try:
            emit(first)
            for value in updates:emit(value)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):pass
        except (EngineUnavailable, EngineBusy) as exc:
            try:emit({'error':True,'message':str(exc)})
            except OSError:pass
        finally:
            updates.close()

    def do_POST(self):
        path=urlsplit(self.path).path
        if path not in ('/api/play','/api/analyze'):
            return self.payload({'message':'Not Found'},404)
        try:
            size=int(self.headers.get('Content-Length','0'))
            if not 0<size<=32768:raise ValueError('请求长度不正确')
            data=json.loads(self.rfile.read(size))
            if not isinstance(data,dict):raise ValueError('请求必须为 JSON 对象')
        except (ValueError,UnicodeDecodeError) as exc:
            return self.payload({'message':str(exc)},400)
        return self.engine_request(data,play=path=='/api/play')

    def serve_piece(self,path):
        match=re.fullmatch(r'/assets/pieces/(atelier|chessnut|rhosgfx|fantasy)/(w|b)(K|Q|R|B|N|P)\.svg',path)
        if not match:return self.payload('Not Found',404,'text/plain; charset=utf-8')
        style,color,pc=match.groups()
        name=color+pc+'.svg'
        folder=ROOT/'assets'/'pieces'/style
        dest=folder/name
        if dest.exists() and dest.stat().st_size>200:
            return self.payload(dest.read_bytes(),200,'image/svg+xml')
        if style=='atelier':return self.payload('Missing bundled piece',404,'text/plain; charset=utf-8')
        raw_path=f'https://raw.githubusercontent.com/lichess-org/lila/master/public/piece/{style}/{name}'
        try:
            data,ct=upstream(raw_path,cap=150_000,timeout=7)
            if not (data.lstrip().startswith(b'<svg') or b'<svg' in data[:300]):raise ValueError('不是 SVG 棋子')
            folder.mkdir(parents=True,exist_ok=True)
            dest.write_bytes(data)
            return self.payload(data,200,'image/svg+xml')
        except Exception as exc:
            return self.payload('棋子素材暂不可用',503,'text/plain; charset=utf-8')


    dbfile:Path|None=None
    def __init__(self,*args,**kwargs):
        super().__init__(*args,directory=str(ROOT),**kwargs)
    def end_headers(self):
        if urlsplit(self.path).path.endswith(('.html','.css','.js')) or urlsplit(self.path).path in ('','/'):
            self.send_header('Cache-Control','no-store, max-age=0, must-revalidate')
        self.send_header('Access-Control-Allow-Origin','*')
        self.send_header('Access-Control-Allow-Methods','GET, HEAD, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers','Content-Type')
        self.send_header('X-Content-Type-Options','nosniff')
        super().end_headers()
    def do_OPTIONS(self):
        self.send_response(204);self.end_headers()
    def payload(self,body,status=200,ctype='application/json; charset=utf-8'):
        if isinstance(body,(dict,list)):
            body=json.dumps(body,ensure_ascii=False,separators=(',',':')).encode()
        if isinstance(body,str):body=body.encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type',ctype)
        self.send_header('Content-Length',str(len(body)))
        self.send_header('Cache-Control','no-store' if urlsplit(self.path).path in ('/api/engine','/api/play','/api/analyze') else 'private, max-age=60')
        self.end_headers()
        try:self.wfile.write(body)
        except (BrokenPipeError,ConnectionResetError):pass
    def getdb(self):
        if self.dbfile is None or not self.dbfile.is_file():return None
        con=sqlite3.connect('file:'+str(self.dbfile.resolve())+'?mode=ro',uri=True,timeout=5)
        con.row_factory=sqlite3.Row
        return con
    def db_request(self,path,q):
        conn=self.getdb()
        if conn is None:return self.payload({'error':'尚未导入本机棋谱数据库；可使用大师库在线查询'},503)
        try:
            if path=='/api/status':
                return self.payload({'ok':True,'games':conn.execute('SELECT COUNT(*) FROM games').fetchone()[0]})
            if path=='/api/position':
                fen=q.get('fen',[''])[0];parts=fen.strip().split()
                if len(parts)<4 or len(fen)>160:return self.payload({'error':'FEN invalid'},400)
                key=' '.join(parts[:4]);data=conn.execute('''SELECT uci,MAX(san) san,
                   SUM(CASE WHEN result='1-0' THEN 1 ELSE 0 END) white,
                   SUM(CASE WHEN result='1/2-1/2' THEN 1 ELSE 0 END) draws,
                   SUM(CASE WHEN result='0-1' THEN 1 ELSE 0 END) black
                   FROM positions WHERE position_key=? GROUP BY uci ORDER BY COUNT(*) DESC LIMIT 16''',(key,)).fetchall()
                totals=conn.execute('''SELECT SUM(result='1-0') white,SUM(result='1/2-1/2') draws,SUM(result='0-1') black FROM positions WHERE position_key=?''',(key,)).fetchone()
                games=conn.execute('''SELECT g.id,g.white,g.black,g.year,g.white_rating,g.black_rating,g.result,p.ply FROM positions p JOIN games g ON g.id=p.game_id WHERE p.position_key=? LIMIT 20''',(key,)).fetchall()
                seen=set();examples=[]
                for r in games:
                    if r['id'] in seen:continue
                    seen.add(r['id']);examples.append({'id':'db-'+str(r['id']),'year':r['year'],'white':{'name':r['white'],'rating':r['white_rating']},'black':{'name':r['black'],'rating':r['black_rating']},'ply':r['ply']})
                return self.payload({'white':totals['white'] or 0,'draws':totals['draws'] or 0,'black':totals['black'] or 0,'moves':[dict(x) for x in data],'topGames':examples,'recentGames':[]})
            if path.startswith('/api/game/'):
                gid=path.removeprefix('/api/game/')
                if not gid.isdecimal():return self.payload({'error':'invalid ID'},400)
                item=conn.execute('SELECT pgn FROM games WHERE id=?',(int(gid),)).fetchone()
                if not item:return self.payload({'error':'game missing'},404)
                return self.payload(item['pgn'],200,'application/x-chess-pgn; charset=utf-8')
            return self.payload({'error':'not found'},404)
        finally:conn.close()
    def remote_request(self,path,q):
        if path in ('/api/remote/health','/api/remote/diagnostics'):
            return self.payload(live_diagnostics())
        ttl=300;cap=30_000_000;ctype=None
        if path.startswith('/api/remote/archive'):
            pack=path.split('/')[-1]
            if pack in ARCHIVE_PACKS:
                url='https://raw.githubusercontent.com/usefulmove/chessdb/main/'+quote(ARCHIVE_PACKS[pack]);ttl=86400
            elif pack in MASTER_BOOKS:
                url='https://raw.githubusercontent.com/brianerdelyi/ChessPGN/main/'+quote(MASTER_BOOKS[pack]);ttl=86400
            else:return self.payload({'error':'unknown PGN collection'},400)
            cap=45_000_000
        elif path=='/api/remote/commons':
            args={k:v[0] for k,v in q.items() if k in COMMONS_QUERY and len(v[0])<450}
            args['format']='json';args['origin']='*';args['formatversion']='2'
            url='https://commons.wikimedia.org/w/api.php?'+urlencode(args);ttl=1800;cap=5_000_000
        elif path=='/api/remote/audio-urls':
            # Batch warm-up: resolve many recordings in one Commons API call so the
            # first playback of each track skips the metadata round trip.
            raw=q.get('files',[''])[0] or ''
            files=[f for f in raw.split('|') if 0<len(f)<250 and AUDIO_EXT.search(f)][:50]
            if not files:return self.payload({'error':'no valid audio files'},400)
            return self.payload(resolve_audio_urls(files))
        else:return self.payload({'error':'unknown endpoint'},404)
        try:
            data,ct=cached_get(url,ttl,cap)
            if path.endswith('/commons'):
                json.loads(data) # Never treat invalid HTML error page as chess/music JSON.
            if '/archive/' in path and b'[White ' not in data:
                raise ValueError('Source did not contain complete chess scores')
            if '/archive/' in path or '/game/' in path:ct='application/x-chess-pgn; charset=utf-8'
            return self.payload(data,200,ct)
        except HTTPError as exc:
            self.log_error('upstream %s HTTP %s',url,exc.code)
            return self.payload({'error':'远程请求失败','details':'HTTP '+str(exc.code),'source':path},502)
        except (URLError,TimeoutError,OSError,ValueError) as exc:
            self.log_error('upstream %s %s',url,type(exc).__name__)
            return self.payload({'error':'上游公开数据库无法访问','source':path,'details':str(exc)[:120]},502)
    def stream_audio(self,q):
        filename=q.get('file',[''])[0]
        if not (0<len(filename)<250 and re.search(r'\.(ogg|oga|mp3|opus|flac|wav|webm)$',filename,re.I)):
            return self.payload({'error':'Invalid public audio filename'},400)
        url=resolve_audio_urls([filename]).get(filename,'')
        if not url:
            return self.payload({'error':'Commons did not return a trusted media URL'},502)
        try:
            headers={'User-Agent':USER_AGENT,'Accept':'audio/*, application/ogg, */*'}
            if self.headers.get('Range'):
                value=self.headers['Range']
                if not re.fullmatch(r'bytes=\d+-\d*',value):return self.payload({'error':'Invalid range'},416)
                headers['Range']=value
            request=Request(url,headers=headers)
            with (HTTP_OPENER or build_opener()).open(request,timeout=18) as audio:
                if urlsplit(audio.geturl()).hostname not in ('upload.wikimedia.org','commons.wikimedia.org'):
                    return self.payload({'error':'Media redirected outside Commons'},502)
                status=206 if audio.status==206 else 200
                self.send_response(status)
                mime=audio.headers.get('Content-Type','application/octet-stream')
                self.send_header('Content-Type',mime)
                self.send_header('Accept-Ranges','bytes')
                if audio.headers.get('Content-Range'):self.send_header('Content-Range',audio.headers.get('Content-Range'))
                if audio.headers.get('Content-Length'):self.send_header('Content-Length',audio.headers.get('Content-Length'))
                self.send_header('Cache-Control','public,max-age=1800')
                self.send_header('Connection','close')
                self.close_connection=True
                self.end_headers()
                while True:
                    block=audio.read(262144)
                    if not block:break
                    try:self.wfile.write(block)
                    except (BrokenPipeError,ConnectionResetError):break
        except (HTTPError,URLError,OSError,ValueError,KeyError,IndexError) as exc:
            self.log_error('Commons streaming error: %s',type(exc).__name__)
            return self.payload({'error':'公开录音无法读取','details':str(exc)[:160]},502)
    def do_GET(self):
        if self.path.startswith("/assets/pieces/"):return self.serve_piece(urlsplit(self.path).path)
        parts=urlsplit(self.path);path=parts.path;q=parse_qs(parts.query)
        if path=='/api/library/status':
            with LIBRARY_PROGRESS_LOCK:progress=LIBRARY_PROGRESS.copy()
            return self.payload({'ok':True,'packs':cached_library_files(),**progress})
        if path.startswith('/api/library/pgn/'):
            key=path.removeprefix('/api/library/pgn/')
            if key not in BUILTIN_SCORES:return self.payload({'error':'Not found'},404)
            source=LIBRARY_DIR/(key+'.pgn')
            if not source.is_file():return self.payload({'error':'Not cached yet'},404)
            return self.payload(source.read_bytes(),200,'application/x-chess-pgn; charset=utf-8')
        if path=='/api/health':return self.payload({'ok':True,'version':VERSION,'local_server':True,'app_id':APP_ID,'revision':APP_REVISION})
        if path=='/api/engine':
            return self.payload(PLAY_ENGINE.status())
        if path in ('/api/analyze','/api/play'):
            data={'fen':q.get('fen',[''])[0], 'level':q.get('level',['2'])[0]}
            return self.engine_request(data,play=path=='/api/play')
        if path=='/api/remote/audio':return self.stream_audio(q)
        if path.startswith('/api/remote/'):return self.remote_request(path,q)
        if path in ('/api/status','/api/position') or path.startswith('/api/game/'):
            try:return self.db_request(path,q)
            except sqlite3.DatabaseError as exc:return self.payload({'error':'数据库不可用','details':str(exc)[:120]},503)
        if path in ('','/'):
            self.path='/index.html'
        return super().do_GET()

def main():
    global HTTP_OPENER,PROXY_URL
    p=argparse.ArgumentParser(description='棋境 · 国际象棋练习')
    p.add_argument('--port',type=int,default=8765)
    p.add_argument('--host',default='127.0.0.1')
    p.add_argument('--db',type=Path,default=ROOT/'chess-games.sqlite')
    p.add_argument('--proxy',default=PROXY_URL,help='可选本地 HTTP/HTTPS 代理，例如 http://127.0.0.1:7897')
    p.add_argument('--check',action='store_true',help='检测本地 Stockfish，然后退出')
    a=p.parse_args();Handler.dbfile=a.db
    PROXY_URL=a.proxy
    HTTP_OPENER=build_opener(ProxyHandler({'http':a.proxy,'https':a.proxy})) if a.proxy else build_opener()
    if a.check:
        try:
            result=live_diagnostics()
            print(json.dumps(result,indent=2,ensure_ascii=False),flush=True)
        finally:
            PLAY_ENGINE.close()
            ANALYSIS_ENGINE.close()
        raise SystemExit(0 if result['ok'] else 1)
    print('棋境已启动: http://'+a.host+':'+str(a.port),flush=True)
    print('本地模式：内置棋谱与人机对弈。古典乐如需在线曲目，浏览器将直连 Wikimedia Commons。',flush=True)
    # 页面一次会并发请求 18 个样式表 + 数十张棋子图。socketserver 默认 backlog 只有 5，
    # 突发连接会直接被拒（浏览器表现为样式/图片偶发加载失败）。这里把队列放大到 128。
    server=AtelierServer((a.host,a.port),Handler)
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:
        server.server_close()
        PLAY_ENGINE.close()
        ANALYSIS_ENGINE.close()
if __name__=='__main__':main()
