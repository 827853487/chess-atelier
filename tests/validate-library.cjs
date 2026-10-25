const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),manifest=JSON.parse(fs.readFileSync(path.join(root,'data/library-sources.json'),'utf8'));
const reference=spawnSync('python',['-c',String.raw`
import csv,io,json,pathlib,chess.pgn
root=pathlib.Path('.')
manifest=json.loads((root/'data/library-sources.json').read_text(encoding='utf-8'))
result={}
sample_path=root/'data/training-source-rows.csv'
samples={row['PuzzleId']:row for row in csv.DictReader(sample_path.open(encoding='utf-8'))} if sample_path.exists() else {}
puzzle_ids=set();puzzle_positions=set()
for pack in manifest['collections']:
 stream=io.StringIO((root/'data/complete'/pack['file']).read_text(encoding='utf-8'))
 rows=[]
 while (game:=chess.pgn.read_game(stream)) is not None:
  assert not game.errors
  assert chess.Board(game.headers.get('FEN',chess.STARTING_FEN)).is_valid(),(pack['id'],game.headers)
  assert game.headers.get('Variant','Standard')=='Standard'
  if pack['kind']=='course' and game.headers.get('PlyCount')=='0':
   assert game.headers.get('FEN') and game.board().fen()!=chess.STARTING_FEN,'Unfilled textbook placeholder'
  if pack['kind']=='puzzle':
   ident=game.headers['PuzzleId'];assert ident not in puzzle_ids;puzzle_ids.add(ident)
   row=samples[ident];board=chess.Board(row['FEN']);words=row['Moves'].split();board.push_uci(words[0])
   assert game.board().fen()==board.fen()
   assert [move.uci() for move in game.mainline_moves()]==words[1:]
   position=' '.join(board.fen().split()[:4]);assert position not in puzzle_positions;puzzle_positions.add(position)
   assert game.headers['PuzzleRating']==row['Rating'] and pack['theme'] in row['Themes'].split()
   assert int(row['Popularity'])>=85 and int(row['NbPlays'])>=300 and int(row['RatingDeviation'])<=85
  if pack['group']=='openings' and pack['kind']=='game':
   assert all(game.headers.get(k) and '?' not in game.headers[k] for k in ['White','Black','Event'])
   assert game.headers['Date'][:4].isdigit()
   assert game.headers['Result'] in ['1-0','0-1','1/2-1/2']
   assert sum(1 for _ in game.mainline_moves())>=32
  rows.append({'plies':sum(1 for _ in game.mainline_moves()),'fen':game.end().board().fen(en_passant='fen')})
 assert len(rows)==pack['games']
 result[pack['id']]=rows
print(json.dumps(result))
`],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024});
assert.equal(reference.status,0,reference.stderr);const expected=JSON.parse(reference.stdout);
const context=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(root,'vendor/chess.js'),'utf8').replace(/^export default .*;\s*$/gm,'').replace(/^export /gm,'')+';globalThis.Chess=Chess;',context);
let count=0;
for(const pack of manifest.collections){
 const content=fs.readFileSync(path.join(root,'data/complete',pack.file),'utf8');
 assert.equal(crypto.createHash('sha256').update(content).digest('hex'),pack.sha256);
 const games=content.split(/(?=^\[Event\s+")/m).filter(x=>x.trim());assert.equal(games.length,pack.games);
 games.forEach((text,i)=>{
  const game=new context.Chess();
  try{game.loadPgn(text,{strict:true});}catch(error){throw new Error(`${pack.id} #${i+1}: ${error.message}`,{cause:error});}
  assert.equal(game.history().length,expected[pack.id][i].plies,`${pack.id} #${i+1} plies`);
  assert.equal(game.fen(),expected[pack.id][i].fen,`${pack.id} #${i+1} FEN`);count++;
 });
 console.log('PASS:',pack.id,games.length,'PGNs, matching independent python-chess replay');
}
assert.equal(count,manifest.totalNewEntries);
fs.writeFileSync(path.join(root,'test-results','library-data-validation.json'),JSON.stringify({passed:true,records:count,collections:manifest.collections.length},null,2));
console.log('PASS:',count,'new local records fully replayed with both rules implementations');
