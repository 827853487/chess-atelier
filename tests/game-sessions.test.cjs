const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const box=vm.createContext({console});
for(const file of ['vendor/chess.js','game-record.js','game-sessions.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8').replace(/^import .*;\s*$/gm,'').replace(/^export default .*;\s*$/gm,'').replace(/^export /gm,''),box);
vm.runInContext('globalThis.api={Chess,createTrialRecord,standardPgn,readRecentGames,writeRecentGames,updateRecentGames}',box);
const {Chess,createTrialRecord,standardPgn,readRecentGames,writeRecentGames,updateRecentGames}=box.api;
const store=()=>({value:null,getItem(){return this.value;},setItem(k,v){this.value=v;}});
test('a trial keeps the complete prefix and can branch without changing the study continuation',()=>{
 const study=new Chess();study.loadPgn('[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 1-0');
 const original=study.fen(),trial=createTrialRecord(study,3);
 assert.equal(trial.history().join(' '),'e4 e5 Nf3');assert.equal(trial.header().Result,'*');assert.equal(trial.turn(),'b');trial.move('Nf6');
 assert.equal(study.fen(),original);assert.equal(study.history().length,6);const loaded=new Chess();loaded.loadPgn(standardPgn(trial));assert.equal(loaded.history().join(' '),'e4 e5 Nf3 Nf6');assert.equal(loaded.fen(),trial.fen());
});
test('custom black-to-move starts retain FEN, turn, move number and repetition history',()=>{
 const fen='r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 23',game=new Chess(fen);game.move('O-O');game.move('O-O-O');const trial=createTrialRecord(game,1,fen);assert.equal(trial.turn(),'w');assert.equal(trial.history()[0],'O-O');const copy=new Chess();copy.loadPgn(standardPgn(trial));assert.equal(copy.header().FEN,fen);assert.equal(copy.fen(),trial.fen());
 const repeated=new Chess();for(const move of ['Nf3','Nf6','Ng1','Ng8','Nf3','Nf6','Ng1','Ng8'])repeated.move(move);assert.equal(createTrialRecord(repeated,8).isThreefoldRepetition(),true);
});
test('recent saves update one session, roll to twenty, and survive a storage round trip',()=>{
 let rows=[];const memory=store();for(let i=0;i<24;i++)rows=updateRecentGames(rows,{id:'recent-'+i,pgn:'1. e4 *',title:String(i)});
 assert.equal(rows.length,20);assert.equal(rows[0].id,'recent-23');assert.equal(rows.at(-1).id,'recent-4');rows=updateRecentGames(rows,{id:'recent-7',pgn:'1. e4 e5 *',title:'updated'});assert.equal(rows.length,20);assert.equal(rows[0].id,'recent-7');assert.equal(rows.filter(x=>x.id==='recent-7').length,1);writeRecentGames(memory,rows);assert.equal(JSON.stringify(readRecentGames(memory)),JSON.stringify(rows));
 const backup={...rows.at(-1),id:'save-backup'};rows=updateRecentGames(rows,{id:'recent-new',pgn:'1. d4 *'});assert.equal(backup.id,'save-backup');assert.equal(backup.pgn,'1. e4 *');
});
test('corrupt storage is tolerated, while failed writes are surfaced to the caller',()=>{
 assert.equal(readRecentGames({getItem(){throw Error('disabled');}}).length,0);assert.equal(readRecentGames({getItem:()=>'{'}).length,0);assert.equal(readRecentGames({getItem:()=>JSON.stringify([null,{id:'bad',pgn:'x'},{id:'recent-good',pgn:'x'},{id:'recent-good',pgn:'duplicate'}])}).length,1);assert.throws(()=>writeRecentGames({setItem(){throw Error('quota');}},[]),/quota/);
});
