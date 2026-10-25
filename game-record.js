import { Chess } from './vendor/chess.js';

const START_FEN = new Chess().fen();
const ROSTER = ['Event','Site','Date','Round','White','Black','Result'];
export function cloneRecord(game, ply=game.history().length, origin=game.header().FEN||game.history({verbose:true})[0]?.before||game.fen()) {
 const copy=new Chess(origin);
 const headers=game.header();
 for(const [k,v] of Object.entries(headers))copy.header(k,v);
 for(const m of game.history({verbose:true}).slice(0,ply))copy.move({from:m.from,to:m.to,promotion:m.promotion});
 if(ply<game.history().length)copy.header('Result','*');
 return copy;
}
export function recordRows(game){
 const initial=game.history({verbose:true})[0]?.before||game.header().FEN||game.fen();
 let number=Number(initial.split(' ')[5]),row=null;
 const rows=[];
 game.history({verbose:true}).forEach((m,i)=>{
  if(m.color==='w'||!row){row={number,white:null,black:null};rows.push(row);}
  row[m.color==='w'?'white':'black']={...m,ply:i+1};
  if(m.color==='b')number++;
 });
 return rows;
}
export function gameResult(game){
 if(game.isCheckmate())return game.turn()==='w'?'0-1':'1-0';
 if(game.isDraw())return '1/2-1/2';
 const result=game.header().Result;
 return ['1-0','0-1','1/2-1/2','*'].includes(result)?result:'*';
}
export function standardPgn(game, overrides={}){
 const h=game.header(),moves=game.history({verbose:true});
 const initial=moves[0]?.before||h.FEN||game.fen();
 const d=new Date(),pad=n=>String(n).padStart(2,'0');
 const defaults={Event:'Casual Game',Site:'?',Date:`${d.getFullYear()}.${pad(d.getMonth()+1)}.${pad(d.getDate())}`,Round:'-',White:'?',Black:'?'};
 const tags={...defaults,...h,...overrides,Result:gameResult(game)};
 if(initial!==START_FEN){tags.SetUp='1';tags.FEN=initial;}else{delete tags.SetUp;delete tags.FEN;}
 tags.PlyCount=String(moves.length);
 const esc=s=>String(s??'?').replace(/[\r\n\t]/g,' ').replace(/\\/g,'\\\\').replace(/"/g,'\\"');
 const keys=[...ROSTER,...Object.keys(tags).filter(k=>!ROSTER.includes(k)&&/^[A-Za-z][A-Za-z0-9_]*$/.test(k)).sort()];
 const head=keys.map(k=>`[${k} "${esc(tags[k])}"]`).join('\n');
 const words=[];
 for(const row of recordRows(game)){
  if(row.white)words.push(`${row.number}.`,row.white.san);
  else words.push(`${row.number}...`);
  if(row.black)words.push(row.black.san);
 }
 words.push(tags.Result);
 const lines=[];let line='';
 for(const word of words){if(line&&line.length+word.length+1>79){lines.push(line);line='';}line+=(line?' ':'')+word;}
 if(line)lines.push(line);
 return head+'\n\n'+lines.join('\n')+'\n\n';
}
