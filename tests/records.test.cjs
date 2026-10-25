const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const context=vm.createContext({console});
for(const file of ['vendor/chess.js','game-record.js','engine-client.js']){
 const source=fs.readFileSync(path.join(root,file),'utf8').replace(/^import .*;\s*$/gm,'').replace(/^export default .*;\s*$/gm,'').replace(/^export /gm,'');
 vm.runInContext(source,context,{filename:file});
}
vm.runInContext('globalThis.api={Chess,cloneRecord,recordRows,standardPgn,gameResult,moveQuality,scoreLabel}',context);
const {Chess,cloneRecord,recordRows,standardPgn,gameResult,moveQuality}=context.api;

test('standard roster, SAN, checkmate result and import/export round trip',()=>{
 const g=new Chess();for(const m of ['f3','e5','g4','Qh4#'])g.move(m);
 const pgn=standardPgn(g);assert.match(pgn,/\[Result "0-1"\]/);assert.match(pgn,/1\. f3 e5 2\. g4 Qh4# 0-1\n\n$/);
 const copy=new Chess();copy.loadPgn(pgn,{strict:true});assert.equal(copy.fen(),g.fen());
 assert.deepEqual(Array.from(pgn.matchAll(/^\[(\w+)/gm)).slice(0,7).map(m=>m[1]),['Event','Site','Date','Round','White','Black','Result']);
});
test('black-to-move custom position keeps FEN and starts at move 23',()=>{
 const g=new Chess('4k3/8/8/8/8/8/8/4K2R b K - 0 23');g.move('Kd7');g.move('Rh7+');
 assert.match(standardPgn(g),/23\.\.\. Kd7 24\. Rh7\+ \*/);
 assert.match(g.pgn(),/23\.\.\. Kd7 24\. Rh7\+/);
 assert.equal(recordRows(g)[0].number,23);assert.equal(recordRows(g)[0].white,null);
 const copy=new Chess();copy.loadPgn(standardPgn(g),{strict:true});assert.equal(copy.fen(),g.fen());
});
test('branching at an earlier ply keeps prior moves and clears imported result',()=>{
 const g=new Chess();g.loadPgn('[Event "Test"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 1-0');
 const branch=cloneRecord(g,2);branch.move('Bc4');
 assert.equal(branch.history().join(' '),'e4 e5 Bc4');assert.equal(gameResult(branch),'*');
 assert.equal(g.history().length,4);assert.match(standardPgn(branch),/1\. e4 e5 2\. Bc4 \*/);
});
test('repetition history survives cloning and is exported as a draw',()=>{
 const g=new Chess();for(const m of ['Nf3','Nf6','Ng1','Ng8','Nf3','Nf6','Ng1','Ng8'])g.move(m);
 assert.equal(cloneRecord(g).isThreefoldRepetition(),true);assert.equal(gameResult(g),'1/2-1/2');
});
test('castling, en passant and underpromotion survive PGN round trip',()=>{
 const games=[new Chess(),new Chess('4k3/P7/8/8/8/8/8/4K3 w - - 0 1')];
 for(const m of ['e4','a6','e5','d5','exd6','cxd6','Nf3','Nf6','Be2','e6','O-O'])games[0].move(m);
 games[1].move('a8=N');
 for(const g of games){const copy=new Chess();copy.loadPgn(standardPgn(g),{strict:true});assert.equal(copy.fen(),g.fen());}
});
test('PGN imports retain checks delivered by either form of castling',()=>{
 const longCastle=new Chess();
 longCastle.loadPgn('1. e4 e5 2. Nc3 Bc5 3. f4 Bxg1 4. Rxg1 d6 5. d4 Nc6 6. dxe5 dxe5 7. Qxd8+ Kxd8 8. fxe5 Nxe5 9. Bf4 Ng6 10. O-O-O+ Bd7 *');
 assert.equal(longCastle.history().length,20);
 assert.equal(longCastle.get('c1').type,'k');assert.equal(longCastle.get('d1').type,'r');
 const shortCastle=new Chess('5k2/8/8/8/8/8/8/4K2R w K - 0 1');
 shortCastle.move('O-O+');shortCastle.move('Ke7');
 const copy=new Chess();copy.loadPgn(shortCastle.pgn(),{strict:true});
 assert.equal(copy.fen(),shortCastle.fen());assert.equal(copy.history()[0],'O-O+');
});
test('headers preserve metadata and correctly unescape quotes and backslashes',()=>{
 const g=new Chess();g.header('Event','A "quoted" \\ event','Date','1992.11.04','White','Fischer','Black','Spassky','ECO','C92');g.move('e4');
 const copy=new Chess();copy.loadPgn(standardPgn(g),{strict:true});assert.equal(copy.header().Event,g.header().Event);assert.equal(copy.header().Date,'1992.11.04');assert.equal(copy.header().ECO,'C92');
});
test('a body-only result is retained, illegal SAN fails instead of skipping a move',()=>{
 const g=new Chess();g.loadPgn('1. e4 e5 1/2-1/2');assert.equal(g.header().Result,'1/2-1/2');
 assert.throws(()=>new Chess().loadPgn('1. e4 e4 2. Nf3',{strict:false}),/Invalid PGN move/);
});
test('move-quality scores use a consistent white perspective for either mover',()=>{
 const previous={complete:true,pvs:[{cp:100,moves:'e2e4'}]},current={complete:true,pvs:[{cp:-100,moves:'d7d5'}]};
 assert.equal(moveQuality(previous,current,{from:'d2',to:'d4',color:'w'}).loss,200);
 assert.equal(moveQuality({complete:true,pvs:[{cp:-100,moves:'e7e5'}]},{complete:true,pvs:[{cp:100,moves:'d2d4'}]},{from:'d7',to:'d5',color:'b'}).loss,200);
 assert.equal(moveQuality(previous,current,{from:'e2',to:'e4',color:'w'}).label,'最佳');
 assert.equal(moveQuality({...previous,complete:false},current,{color:'w'}),null);
});
// Produce real application exports for independent validation with python-chess.
if(process.env.PGN_FIXTURES){
 fs.mkdirSync(process.env.PGN_FIXTURES,{recursive:true});
 const games=[];const g=new Chess();for(const m of ['e4','e5','Nf3','Nc6','Bb5','a6','Ba4','Nf6','O-O'])g.move(m);games.push(g);
 const black=new Chess('4k3/8/8/8/8/8/8/4K2R b K - 0 23');black.move('Kd7');black.move('Rh7+');games.push(black);
 games.forEach((game,i)=>fs.writeFileSync(path.join(process.env.PGN_FIXTURES,`export-${i}.pgn`),standardPgn(game)));
}
