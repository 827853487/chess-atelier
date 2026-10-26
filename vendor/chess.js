/* Chess Atelier bundled chess rules: complete legal move generation, SAN and PGN.
   Designed to initialize and operate without CDN/network availability. */
const START='rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const FILES='abcdefgh';
const DIR={n:[-33,-31,-18,-14,14,18,31,33],b:[-17,-15,15,17],r:[-16,-1,1,16],k:[-17,-16,-15,-1,1,15,16,17]};
const on=i=>i>=0&&i<128&&!(i&0x88);
const side=p=>p==='.'?0:p===p.toUpperCase()?1:-1;
const sq=i=>FILES[i&7]+(8-(i>>4));
const at=s=>(8-Number(s[1]))*16+FILES.indexOf(s[0]);
const color=t=>t===1?'w':'b';
const pieceType=p=>p.toLowerCase();
function fromFen(fen){
 const parts=fen.trim().split(/\s+/), rows=parts[0]?.split('/');if(rows?.length!==8)throw Error('Invalid FEN ranks');
 const b=Array(128).fill('.');for(let r=0;r<8;r++){let col=0;for(const p of rows[r]){if(/[1-8]/.test(p))col+=Number(p);else {if(!/[KQRBNPkqrbnp]/.test(p)||col>=8)throw Error('Invalid FEN piece');b[r*16+col++]=p;}}if(col!==8)throw Error('Invalid FEN rank length');}
 if(b.filter(p=>p==='K').length!==1||b.filter(p=>p==='k').length!==1)throw Error('Both kings required');
 if(!/^[wb]$/.test(parts[1]))throw Error('Invalid turn');
 const rights=parts[2]||'-';return {b,t:parts[1]==='w'?1:-1,c:(rights.includes('K')?1:0)|(rights.includes('Q')?2:0)|(rights.includes('k')?4:0)|(rights.includes('q')?8:0),ep:parts[3]&&parts[3]!=='-'?at(parts[3]):-1,half:Math.max(0,Number(parts[4])||0),full:Math.max(1,Number(parts[5])||1)};
}
function toFen(s){let rows=[];for(let r=0;r<8;r++){let row='',n=0;for(let c=0;c<8;c++){let p=s.b[r*16+c];if(p==='.')n++;else {if(n)row+=n,n=0;row+=p;}}if(n)row+=n;rows.push(row);}const rights=(s.c&1?'K':'')+(s.c&2?'Q':'')+(s.c&4?'k':'')+(s.c&8?'q':'');return rows.join('/')+' '+color(s.t)+' '+(rights||'-')+' '+(s.ep>=0?sq(s.ep):'-')+' '+s.half+' '+s.full;}
function attacked(s,target,by){
 for(let f=0;f<128;f++){if(!on(f)||side(s.b[f])!==by)continue;const p=s.b[f].toLowerCase();
 if(p==='p'){const l=f-16*by-1,r=f-16*by+1;if((on(l)&&target===l)||(on(r)&&target===r))return true;continue;}
 for(const d of DIR[p]||DIR.k){for(let t=f+d;on(t);t+=d){if(t===target)return true;if(s.b[t]!=='.'||p==='n'||p==='k')break;}}
 }return false;
}
function checked(s,w=s.t){return attacked(s,s.b.indexOf(w===1?'K':'k'),-w);}
function apply(s,m){const [f,t,promo,flag]=m,b=s.b.slice(),piece=b[f],captured=b[t];let c=s.c;b[f]='.';b[t]=promo?(s.t===1?promo.toUpperCase():promo):piece;
 if(flag==='ep')b[t+16*s.t]='.';
 if(flag==='castle'){const rf=t>f?f+3:f-4,rt=t>f?f+1:f-1;b[rt]=b[rf];b[rf]='.';}
 if(piece==='K')c&=~3;if(piece==='k')c&=~12;
 const rb={119:1,112:2,7:4,0:8};if(piece.toLowerCase()==='r')c&=~(rb[f]||0);if(captured.toLowerCase()==='r')c&=~(rb[t]||0);
 return {b,t:-s.t,c,ep:piece.toLowerCase()==='p'&&Math.abs(t-f)===32?(t+f)/2:-1,half:piece.toLowerCase()==='p'||captured!=='.'||flag==='ep'?0:s.half+1,full:s.full+(s.t===-1?1:0)};
}
function pseudo(s){const out=[];for(let f=0;f<128;f++){if(!on(f)||side(s.b[f])!==s.t)continue;const p=s.b[f].toLowerCase();
 const add=(t,flag='')=>{if(s.b[t].toLowerCase()==='k')return;if(p==='p'&&((t>>4)===0||(t>>4)===7))for(const q of ['q','r','b','n'])out.push([f,t,q,flag]);else out.push([f,t,'',flag]);};
 if(p==='p'){const t=f-16*s.t;if(on(t)&&s.b[t]==='.'){add(t);const u=t-16*s.t;if(on(u)&&(f>>4)===(s.t===1?6:1)&&s.b[u]==='.')add(u);}
 for(const d of [-1,1]){const u=t+d;if(!on(u)||((u&7)-(f&7))!==d)continue;if(side(s.b[u])===-s.t)add(u);else if(u===s.ep&&s.b[u]==='.'&&s.b[u+16*s.t]===(s.t===1?'p':'P'))add(u,'ep');}
 }else{for(const d of DIR[p]||DIR.k){for(let t=f+d;on(t);t+=d){if(side(s.b[t])===s.t)break;add(t);if(s.b[t]!=='.'||p==='n'||p==='k')break;}}
 const home=s.t===1?116:4,rook=s.t===1?'R':'r',bits=s.t===1?[1,2]:[4,8];if(p==='k'&&f===home&&!checked(s)){
 if((s.c&bits[0])&&s.b[f+3]===rook&&s.b[f+1]==='.'&&s.b[f+2]==='.'&&!attacked(s,f+1,-s.t)&&!attacked(s,f+2,-s.t))add(f+2,'castle');
 if((s.c&bits[1])&&s.b[f-4]===rook&&s.b[f-1]==='.'&&s.b[f-2]==='.'&&s.b[f-3]==='.'&&!attacked(s,f-1,-s.t)&&!attacked(s,f-2,-s.t))add(f-2,'castle');}}
 }return out;}
const legal=s=>pseudo(s).filter(m=>!checked(apply(s,m),s.t));
function san(s,m,all=null){const [f,t,promo,flag]=m,p=s.b[f].toUpperCase(),capture=s.b[t]!=='.'||flag==='ep';let text='';
 if(flag==='castle')text=t>f?'O-O':'O-O-O';else{
 if(p!=='P'){text=p;const others=(all||legal(s)).filter(x=>x[0]!==f&&x[1]===t&&s.b[x[0]]===s.b[f]);if(others.length)text+=!others.some(x=>(x[0]&7)===(f&7))?sq(f)[0]:!others.some(x=>(x[0]>>4)===(f>>4))?sq(f)[1]:sq(f);}
 else if(capture)text=sq(f)[0];text+=(capture?'x':'')+sq(t)+(promo?'='+promo.toUpperCase():'');}
 const next=apply(s,m);return text+(checked(next)?legal(next).length?'+':'#':'');}
function insufficient(s){const p=[];for(let i=0;i<128;i++)if(on(i)&&s.b[i]!=='.'&&s.b[i].toLowerCase()!=='k')p.push([s.b[i].toLowerCase(),((i>>4)+(i&7))%2]);
 return p.length===0||(p.length===1&&['n','b'].includes(p[0][0]))||(p.every(x=>x[0]==='b')&&new Set(p.map(x=>x[1])).size===1);}
function stateKey(s){return s.b.join('')+':'+s.t+':'+s.c+':'+(s.ep>=0&&legal(s).some(m=>m[3]==='ep')?s.ep:-1);}
function describe(s,m){const [f,t,promotion,flag]=m,pc=s.b[f],cap=flag==='ep'?s.b[t+16*s.t]:s.b[t],piece=pc.toLowerCase();
 return {color:color(s.t),from:sq(f),to:sq(t),piece,promotion:promotion||undefined,captured:cap==='.'?undefined:cap.toLowerCase(),flags:flag==='castle'?(t>f?'k':'q'):flag==='ep'?'e':(cap!=='.'?'c':'')+(promotion?'p':'')+(piece==='p'&&Math.abs(t-f)===32?'b':'n'),san:san(s,m),lan:sq(f)+sq(t)+(promotion||''),before:toFen(s),after:toFen(apply(s,m))};}
function cleanMoveText(t){return t.replace(/0/g,'O').replace(/[!?]+/g,'').replace(/\s*(?:e\.p\.|ep)$/i,'').replace(/[+#]$/,'').replace(/^[a-h][1-8][-x]/,'').trim();}
export class Chess {
 constructor(fen=START){this.load(fen);}
 load(fen){this._s=fromFen(fen);this._states=[this._s];this._history=[];this._headers=fen===START?{}:{SetUp:'1',FEN:toFen(this._s)};return true;}
 reset(){this.load(START);}
 fen(){return toFen(this._s);}
 turn(){return color(this._s.t);}
 get(square){const i=at(square);if(!on(i))return null;const p=this._s.b[i];return p==='.'?null:{type:p.toLowerCase(),color:side(p)===1?'w':'b'};}
 board(){return Array.from({length:8},(_,r)=>Array.from({length:8},(_,c)=>this.get(sq(r*16+c))));}
 moves(options={}){const ms=legal(this._s),sqf=options.square?at(options.square):-1;return ms.filter(m=>sqf<0||m[0]===sqf).map(m=>options.verbose?describe(this._s,m):san(this._s,m,ms));}
 history(options={}){return this._history.map(m=>options.verbose?{...m}:m.san);}
 move(value){let move=null,opts=legal(this._s),name='';if(typeof value==='string'){
  const seek=cleanMoveText(value).replace(/O-O-O/g,'OOO').replace(/O-O/g,'OO');
  move=opts.find(m=>cleanMoveText(san(this._s,m,opts)).replace(/O-O-O/g,'OOO').replace(/O-O/g,'OO')===seek);
  // Older PGNs sometimes retain a redundant origin file/rank (e.g. Nge2
  // when the other knight is pinned). Resolve only a unique LEGAL candidate;
  // never accept an ambiguous token or relax the rules of chess.
  if(!move){
   const parts=/^([KQRBN])?([a-h])?([1-8])?(x?)([a-h][1-8])(?:=?([QRBN]))?$/.exec(seek);
   if(parts){const [,piece,file,rank,capture,to,promotion]=parts,candidates=opts.filter(m=>{
    const from=sq(m[0]),isCapture=this._s.b[m[1]]!=='.'||m[3]==='ep';
    return this._s.b[m[0]].toUpperCase()===(piece||'P')&&sq(m[1])===to&&(!file||from[0]===file)&&(!rank||from[1]===rank)&&!!capture===isCapture&&(!m[2]?!promotion:m[2].toUpperCase()===promotion);
   });if(candidates.length===1)move=candidates[0];}
  }
  if(!move&&/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(value))move=opts.find(m=>sq(m[0])===value.slice(0,2)&&sq(m[1])===value.slice(2,4)&&(!m[2]||m[2]===(value[4]||'q')));
 }else if(value&&typeof value==='object')move=opts.find(m=>sq(m[0])===value.from&&sq(m[1])===value.to&&(!m[2]||m[2]===(value.promotion||'q')));
 if(!move)throw Error('Illegal move: '+JSON.stringify(value));const record=describe(this._s,move);this._s=apply(this._s,move);this._states.push(this._s);this._history.push(record);return {...record};}
 undo(){if(!this._history.length)return null;this._states.pop();this._s=this._states[this._states.length-1];return this._history.pop();}
 isCheck(){return checked(this._s);}
 isCheckmate(){return this.isCheck()&&legal(this._s).length===0;}
 isStalemate(){return !this.isCheck()&&legal(this._s).length===0;}
 isThreefoldRepetition(){const k=stateKey(this._s);return this._states.filter(s=>stateKey(s)===k).length>=3;}
 isInsufficientMaterial(){return insufficient(this._s);}
 isDraw(){return this.isStalemate()||this.isInsufficientMaterial()||this._s.half>=100||this.isThreefoldRepetition();}
 isGameOver(){return this.isCheckmate()||this.isDraw();}
 header(...pairs){if(!pairs.length)return {...this._headers};for(let i=0;i<pairs.length;i+=2)this._headers[pairs[i]]=pairs[i+1];return {...this._headers};}
 loadPgn(pgn,options={}){
  if(typeof pgn!=='string')throw Error('Invalid PGN');
  const headers={};for(const m of pgn.matchAll(/^\s*\[([^\s\]]+)\s+"((?:\\.|[^"\\])*)"\s*\]\s*$/gm))headers[m[1]]=m[2].replace(/\\(["\\])/g,'$1');
  this.load(headers.FEN||START);this._headers=headers;
  let body=pgn.replace(/^\s*\[[^\r\n]*\]\s*$/gm,'\n').replace(/^%.*$/gm,' ');
  let out='',brace=0,variation=0,line=false;
  for(let i=0;i<body.length;i++){
   const c=body[i];
   if(line){if(c==='\n')line=false;continue;}
   if(brace){if(c==='{')brace++;else if(c==='}')brace=Math.max(0,brace-1);continue;}
   if(c==='{'){brace++;continue;}
   if(c===';'){line=true;continue;}
   if(c==='('){variation++;continue;}
   if(c===')'){variation=Math.max(0,variation-1);continue;}
   if(variation)continue;
   out+=c;
  }
  out=out.replace(/\$\d+/g,' ').replace(/[?!]+/g,' ').replace(/\d+\.+(?:\.\.)?/g,' ').replace(/\.{2,}/g,' ').replace(/\s+/g,' ').trim();
  const looksSan=/^(?:O-O-O|O-O|0-0-0|0-0|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=?[QRBN])?)[+#]?$/i;
  for(const raw of out.split(' ')){
   const word=raw.replace(/^[.]+|[.]+$/g,'');
   if(/^(?:1-0|0-1|1\/2-1\/2|\*)$/.test(word)){headers.Result=word;break;}
   if(!word||/^(?:--|\.\.\.)$/.test(word))continue;
   if(!looksSan.test(word))continue;
   try{this.move(word);}catch(e){
    this.load(headers.FEN||START);this._headers=headers;throw new Error('Invalid PGN move '+word+': '+e.message);
   }
  }
  return true;
 }
 pgn(){
  const h=this._headers||{};
  const result=this.isCheckmate()?(this.turn()==='w'?'0-1':'1-0'):(this.isDraw()?'1/2-1/2':h.Result||'*');
  const roster=['Event','Site','Date','Round','White','Black','Result'];
  const fallback={Event:'?',Site:'?',Date:'????.??.??',Round:'-',White:'?',Black:'?',Result:result};
  const extra=Object.keys(h).filter(k=>!roster.includes(k));
  const esc=v=>String(v??'').replaceAll('\\','\\\\').replaceAll('"','\\"');
  const tags=[...roster,...extra].map(k=>`[${k} "${esc(k==='Result'?result:h[k]??fallback[k]??'')}"]`).join('\n');
  const words=[];
  let number=Number((this._history[0]?.before||h.FEN||this.fen()).split(' ')[5]);
  this._history.forEach((m,i)=>{if(m.color==='w')words.push(number+'.');else if(i===0)words.push(number+'...');words.push(m.san);if(m.color==='b')number++;});
  words.push(result);
  let body='',line='';
  for(const w of words){
   if(line&&line.length+1+w.length>79){body+=line+'\n';line=w;}
   else line=line?line+' '+w:w;
  }
  if(line)body+=line;
  return tags+'\n\n'+body+'\n\n';
 }
}
export default Chess;
