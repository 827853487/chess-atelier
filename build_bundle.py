from pathlib import Path
import re
p=Path(__file__).parent
sections=[('vendor/chess.js',['Chess']),('game-record.js',['cloneRecord','recordRows','gameResult','standardPgn']),('browser-engine.js',['browserEngineEnabled','browserEngineRequest','browserEngineStatus']),('engine-client.js',['engineRequest','engineStatus','scoreValue','scoreLabel','moveQuality']),('chess-notes.js',['CHESS_NOTES','setupRestNotes']),('analysis-ui.js',['setupLocalAnalysis']),('library.js',['LESSONS']),('piece-fallback.js',['pieceSvg']),('piece-art.js',['pieceSvg','setPieceStyle','acquirePiece','releasePiece','resetPiecePool','preloadPieceArt','preparePieceArt']),('music-library.js',['MUSIC_SEED','MUSIC_GROUPS','EXTENDED_GROUPS']),('extra-collections.js',['EXTRA_SCORE_PACKS']),('master-collections.js',['SCORE_PACKS','PACK_GROUPS','VIRTUAL_PACKS','ALL_PACKS','scorePackName','scoreCategory','scoreInCollection','personalPackName']),('logo-easter-egg.js',['setupLogoEasterEgg']),('favorites.js',['readStarredScores','writeStarredScores']),('period-music.js',['setupPeriodMusic'])]
chunks=['/* Chess Atelier V13 offline: bundled rules, vector pieces and lesson data. */','(()=>{','\'use strict\';']
for name,exported in sections:
 text=(p/name).read_text(encoding='utf-8')
 text=re.sub(r'^import .*?;\s*$', '', text,flags=re.M)
 text=re.sub(r'^export (default )?',lambda m: '' if m.group(1) is None else '',text,flags=re.M)
 if name=='vendor/chess.js':text=text.replace('default Chess;','')
 if name=='piece-art.js':text='const fallbackSvg=localPieceSvg;\n'+text
 prefix='localPieceSvg' if name=='piece-fallback.js' else None
 if prefix: chunks.append('const { pieceSvg: localPieceSvg }=(()=>{\n'+text+'\nreturn { pieceSvg };\n})();')
 else:chunks.append('const { '+', '.join(exported)+' }=(()=>{\n'+text+'\nreturn { '+', '.join(exported)+' };\n})();')
text=(p/'app.js').read_text(encoding='utf-8')
text=re.sub(r'^import .*?;\s*$','',text,flags=re.M)
chunks.append(text)
chunks.append('})();')
blob='\n'.join(chunks)
(p/'app.bundle.js').write_text(blob,encoding='utf-8')
html=(p/'index.html').read_text(encoding='utf-8')
html=html.replace('<script type="module" src="./app.js"></script>','<script src="./app.bundle.js" defer></script>')
html=html.replace('<strong>加载国际象棋规则</strong><small>正在准备棋规模块</small>','<strong>棋境</strong><small>正在打开棋盘…</small>')
html=html.replace('直接双击 HTML 不会启动在线数据代理','Stockfish 对弈与分析请运行启动脚本')
(p/'index.html').write_text(html,encoding='utf-8')
print('Bundled',len(blob),'bytes',html.count('app.bundle.js'))
