/* Chess Atelier V13 offline: bundled rules, vector pieces and lesson data. */
(()=>{
'use strict';
const { surfaceOpen, showSurface, hideSurface, installDialogMotion }=(()=>{
// One reversible lifecycle for floating surfaces. DOM removal/native close only
// happens after the exit, so a quick reopen cannot be closed by an older task.
const surfaceEffects=new WeakMap();
const reducedSurfaceMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
function surfaceOpen(element){return !!element&&element.dataset.surfaceState!=='closing'&&(element.tagName==='DIALOG'?element.open:!element.hidden&&!element.classList.contains('hidden'));}
function surfaceTransition(element,opening,commit){
 if(!element)return Promise.resolve();
 const prior=surfaceEffects.get(element);
 if(prior?.opening===opening)return prior.done;
 const visible=element.tagName==='DIALOG'?element.open:!element.hidden&&!element.classList.contains('hidden');
 const computed=getComputedStyle(element),continuing=visible&&(!opening||!!prior||element.dataset.surfaceState==='open');
 const opacity=continuing?Number(computed.opacity):0,transform=continuing?computed.transform:'translateY(-5px) scale(.985)';
 prior?.animation.cancel();
 if(!opening&&!visible){commit();return Promise.resolve();}
 element.hidden=false;element.classList.remove('hidden');element.inert=!opening;
 element.dataset.surfaceState=opening?'open':'closing';
 if(reducedSurfaceMotion()){surfaceEffects.delete(element);commit();return Promise.resolve();}
 const visibility=element.style.visibility;element.style.visibility='visible';
 const animation=element.animate([{opacity,transform},{opacity:opening?1:0,transform:opening?'none':'translateY(-5px) scale(.985)'}],{duration:opening?180:160,easing:'cubic-bezier(.2,0,.2,1)',fill:'both'});
 const entry={opening,animation,done:null};surfaceEffects.set(element,entry);
 entry.done=animation.finished.catch(()=>{}).then(()=>{
  if(surfaceEffects.get(element)!==entry)return;
  surfaceEffects.delete(element);element.style.visibility=visibility;
  commit();animation.cancel();
 });return entry.done;
}
function showSurface(element){return surfaceTransition(element,true,()=>{});}
function hideSurface(element,commit=()=>{element.hidden=true;element.classList.add('hidden');}){return surfaceTransition(element,false,commit);}
function installDialogMotion(dialogs){
 for(const dialog of dialogs){
  const close=dialog.close.bind(dialog),show=dialog.showModal.bind(dialog);
  const trigger=()=>document.querySelector(`[aria-controls="${dialog.id}"]`);
  dialog.showModal=()=>{if(!dialog.open)show();trigger()?.setAttribute('aria-expanded','true');showSurface(dialog);};
  dialog.close=value=>{trigger()?.setAttribute('aria-expanded','false');return hideSurface(dialog,()=>{if(dialog.open)close(value);dialog.inert=false;});};
  dialog.addEventListener('cancel',event=>{event.preventDefault();dialog.close();});
 }
}
// custom-select.js is a small standalone script loaded after the bundle.
globalThis.ChessSurfaces={show:showSurface,hide:hideSurface,isOpen:surfaceOpen};

return { surfaceOpen, showSurface, hideSurface, installDialogMotion };
})();
const { extractEmbeddedCover, readMusicCover }=(()=>{
// Read artwork from THIS recording, never guess an album by composer/title.
// ID3 APIC, FLAC PICTURE and Vorbis/Opus METADATA_BLOCK_PICTURE are supported.
const COVER_LIMIT=2*1024*1024;
const coverAscii=(b,a,n)=>String.fromCharCode(...b.subarray(a,a+n));
function coverImage(bytes){
 if(bytes.length<12||bytes.length>COVER_LIMIT)return null;
 const mime=bytes[0]===255&&bytes[1]===216?'image/jpeg':coverAscii(bytes,1,3)==='PNG'?'image/png':coverAscii(bytes,0,4)==='RIFF'&&coverAscii(bytes,8,4)==='WEBP'?'image/webp':null;
 return mime?{mime,bytes:bytes.slice()}:null;
}
function flacPicture(bytes){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let at=0;
 const uint=()=>{if(at+4>bytes.length)throw Error('Short picture');const value=view.getUint32(at);at+=4;return value;};
 try{const type=uint(),mimeLength=uint();at+=mimeLength;const descriptionLength=uint();at+=descriptionLength;for(let i=0;i<4;i++)uint();const size=uint();if(size>COVER_LIMIT||at+size>bytes.length)return null;const image=coverImage(bytes.subarray(at,at+size));return image?{...image,type}:null;}catch{return null;}
}
function coverBase64(text){try{if(text.length>COVER_LIMIT*1.4)return null;return Uint8Array.from(atob(text),c=>c.charCodeAt(0));}catch{return null;}}
function commentCover(packet){
 const offset=coverAscii(packet,0,8)==='OpusTags'?8:packet[0]===3&&coverAscii(packet,1,6)==='vorbis'?7:-1;if(offset<0)return null;
 const view=new DataView(packet.buffer,packet.byteOffset,packet.byteLength);let at=offset;
 const uint=()=>{if(at+4>packet.length)throw Error('Short comment');const value=view.getUint32(at,true);at+=4;return value;};
 try{const vendor=uint();at+=vendor;const count=Math.min(256,uint());for(let i=0;i<count;i++){const size=uint();if(size>COVER_LIMIT*1.4||at+size>packet.length)return null;const text=new TextDecoder().decode(packet.subarray(at,at+size));at+=size;const eq=text.indexOf('='),name=text.slice(0,eq).toUpperCase(),value=text.slice(eq+1);if(name==='METADATA_BLOCK_PICTURE'){const b=coverBase64(value),image=b&&flacPicture(b);if(image)return image;}if(name==='COVERART'){const b=coverBase64(value),image=b&&coverImage(b);if(image)return image;}}}catch{}return null;
}
function extractEmbeddedCover(input){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input);if(bytes.length<10||bytes.length>COVER_LIMIT)return null;
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),sync=at=>((bytes[at]&127)<<21)|((bytes[at+1]&127)<<14)|((bytes[at+2]&127)<<7)|(bytes[at+3]&127);
 if(coverAscii(bytes,0,3)==='ID3'&&[3,4].includes(bytes[3])){
  const version=bytes[3],end=Math.min(bytes.length,10+sync(6));let at=10,fallback=null;
  if(bytes[5]&64){if(at+4>end)return null;at+=version===4?sync(at):4+view.getUint32(at);}
  for(let n=0;n<128&&at+10<=end;n++){
   const id=coverAscii(bytes,at,4),size=version===4?sync(at+4):view.getUint32(at+4),flags=bytes[at+9];at+=10;
   if(!size||size>COVER_LIMIT||at+size>end)break;
   if(id==='APIC'&&!(flags&(version===4?12:192))){
    let data=bytes.subarray(at,at+size);
    if((bytes[5]&128)||(version===4&&(flags&2))){const clean=[];for(let i=0;i<data.length;i++){clean.push(data[i]);if(data[i]===255&&data[i+1]===0)i++;}data=Uint8Array.from(clean);}
    const encoding=data[0];let pos=1;while(pos<data.length&&data[pos])pos++;const type=data[++pos];pos++;
    if(encoding===1||encoding===2){while(pos+1<data.length&&(data[pos]||data[pos+1]))pos+=2;pos+=2;}else{while(pos<data.length&&data[pos])pos++;pos++;}
    const image=coverImage(data.subarray(pos));if(image){if(type===3)return image;fallback=image;}
   }at+=size;
  }return fallback;
 }
 if(coverAscii(bytes,0,4)==='fLaC'){
  for(let at=4,n=0;n<128&&at+4<=bytes.length;n++){
   const type=bytes[at]&127,last=!!(bytes[at]&128),size=(bytes[at+1]<<16)|(bytes[at+2]<<8)|bytes[at+3];at+=4;if(at+size>bytes.length)break;
   if(type===6){const image=flacPicture(bytes.subarray(at,at+size));if(image)return image;}at+=size;if(last)break;
  }
 }
 if(coverAscii(bytes,0,4)==='OggS'){
  let parts=[],length=0;
  for(let at=0,n=0;n<64&&at+27<=bytes.length;n++){
   if(coverAscii(bytes,at,4)!=='OggS')break;const count=bytes[at+26],start=at+27+count;if(start>bytes.length)break;let data=start;
   for(let i=0;i<count;i++){const size=bytes[at+27+i];if(data+size>bytes.length)return null;parts.push(bytes.subarray(data,data+size));length+=size;data+=size;if(size<255){const packet=new Uint8Array(length);let p=0;for(const part of parts){packet.set(part,p);p+=part.length;}const image=commentCover(packet);if(image)return image;parts=[];length=0;}}
   at=data;
  }
 }return null;
}
async function readMusicCover(url,{signal,blob}={}){
 try{
  if(blob)return extractEmbeddedCover(await blob.slice(0,COVER_LIMIT).arrayBuffer());
  const response=await fetch(url,{signal,headers:{Range:`bytes=0-${COVER_LIMIT-1}`},credentials:'omit',cache:'force-cache'});if(!response.ok)return null;
  const reader=response.body.getReader(),parts=[];let size=0;
  let required=COVER_LIMIT;
  try{while(size<required){const row=await reader.read();if(row.done)break;const part=row.value.subarray(0,COVER_LIMIT-size);parts.push(part);size+=part.length;
   if(parts.length===1&&part.length>=10&&coverAscii(part,0,3)==='ID3')required=Math.min(COVER_LIMIT,10+((part[6]&127)<<21)+((part[7]&127)<<14)+((part[8]&127)<<7)+(part[9]&127));
  }}finally{await reader.cancel().catch(()=>{});}
  const data=new Uint8Array(size);let at=0;for(const part of parts){data.set(part,at);at+=part.length;}return extractEmbeddedCover(data);
 }catch{return null;}
}

return { extractEmbeddedCover, readMusicCover };
})();
const { Chess }=(()=>{
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
class Chess {
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
Chess;

return { Chess };
})();
const { cloneRecord, recordRows, gameResult, standardPgn, recordEnding }=(()=>{

const START_FEN = new Chess().fen();
const ROSTER = ['Event','Site','Date','Round','White','Black','Result'];
function cloneRecord(game, ply=game.history().length, origin=game.header().FEN||game.history({verbose:true})[0]?.before||game.fen()) {
 const copy=new Chess(origin);
 const headers=game.header();
 for(const [k,v] of Object.entries(headers))copy.header(k,v);
 for(const m of game.history({verbose:true}).slice(0,ply))copy.move({from:m.from,to:m.to,promotion:m.promotion});
 if(ply<game.history().length)copy.header('Result','*');
 return copy;
}
function recordRows(game){
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
function gameResult(game){
 if(game.isCheckmate())return game.turn()==='w'?'0-1':'1-0';
 const result=game.header().Result;
 // Preserve a recorded result rather than inferring an unclaimed draw.
 if(['1-0','0-1','1/2-1/2'].includes(result))return result;
 if(game.isDraw())return '1/2-1/2';
 return ['1-0','0-1','1/2-1/2','*'].includes(result)?result:'*';
}
function recordEnding(game,{recorded=false,atEnd=false,result=game.header().Result}={}){
 // A mate prediction is not checkmate. Check the actual board first.
 if(game.isCheckmate())return {title:`将死 · ${game.turn()==='w'?'黑方':'白方'}获胜`,detail:''};
 if(recorded&&atEnd){
  if(result==='1-0')return {title:'白方获胜',detail:''};
  if(result==='0-1')return {title:'黑方获胜',detail:''};
  if(result==='1/2-1/2')return {title:'和棋',detail:''};
 }
 if(game.isStalemate())return {title:'逼和',detail:'无合法着法且王未被将军'};
 if(game.isInsufficientMaterial())return {title:'和棋',detail:'双方子力不足以将杀'};
 // In a published mainline, claimable draws do not terminate playback.
 if(!recorded&&game.isDraw())return {title:'和棋',detail:game.isThreefoldRepetition()?'三次重复局面':game._s?.half>=100?'五十回合规则':'符合和棋规则'};
 if(recorded&&atEnd)return {title:'棋谱结束',detail:''};
 return null;
}
function standardPgn(game, overrides={}){
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

return { cloneRecord, recordRows, gameResult, standardPgn, recordEnding };
})();
const { browserEngineEnabled, browserEngineRequest, browserEngineStatus }=(()=>{

// Public builds use two local Web Workers; desktop builds keep the native Python bridge.
function browserEngineEnabled(){return globalThis.CHESS_ENGINE_MODE==='browser';}
const LEVELS={1:{name:'入门',elo:1300,ms:350},2:{name:'一般',elo:1600,ms:500},3:{name:'进阶',elo:1900,ms:700},4:{name:'高手',elo:2200,ms:1000},5:{name:'大师',elo:2600,ms:1400},6:{name:'顶级',elo:3000,ms:2200}};
const abortError=()=>new DOMException('操作已取消','AbortError');
const assetUrl=new URL('./vendor/stockfish/stockfish-19-lite-single.js',document.baseURI).href;
class UciWorker{
 constructor(){this.worker=null;this.ready=null;this.listeners=new Set();this.queue=Promise.resolve();this.eloMin=1320;this.eloMax=3190;}
 fail(error){
  this.worker?.terminate();this.worker=null;this.ready=null;
  for(const listener of [...this.listeners])listener.reject(error);
 }
 send(command){this.worker.postMessage(command);}
 waitFor(predicate,timeout=30000){
  return new Promise((resolve,reject)=>{
   const cleanup=()=>{clearTimeout(timer);this.listeners.delete(listener);};
   const listener={line:line=>{try{if(predicate(line)){cleanup();resolve(line);}}catch(error){cleanup();reject(error);}},reject:error=>{cleanup();reject(error);}};
   const timer=setTimeout(()=>listener.reject(Error('浏览器 Stockfish 响应超时，请重试。')),timeout);
   this.listeners.add(listener);
  });
 }
 ensure(){
  if(this.ready)return this.ready;
  this.ready=(async()=>{
   if(typeof WebAssembly!=='object'||typeof Worker!=='function')throw Error('当前浏览器不支持本地 Stockfish，请使用新版浏览器。');
   this.worker=new Worker(assetUrl);
   this.worker.onmessage=event=>{
    if(typeof event.data!=='string')return;
    for(const line of event.data.split(/\r?\n/)){
     const elo=line.match(/^option name UCI_Elo .* min (\d+) max (\d+)/);
     if(elo){this.eloMin=Number(elo[1]);this.eloMax=Number(elo[2]);}
     for(const listener of [...this.listeners])listener.line(line);
    }
   };
   this.worker.onerror=event=>{event.preventDefault();this.fail(Error('浏览器 Stockfish 加载失败，请刷新或重试。'));};
   const uci=this.waitFor(line=>line==='uciok');this.send('uci');await uci;
   // Single-thread WASM needs no SharedArrayBuffer / cross-origin isolation.
   this.send('setoption name Hash value 16');this.send('setoption name UCI_ShowWDL value true');
   const ready=this.waitFor(line=>line==='readyok');this.send('isready');await ready;
  })().catch(error=>{this.fail(error);throw error;});
  return this.ready;
 }
 request(body,analysis,{signal,onUpdate}={}){
  const task=this.queue.catch(()=>{}).then(async()=>{
   if(signal?.aborted)throw abortError();
   await this.ensure();if(signal?.aborted)throw abortError();
   const origin=body.origin||body.fen,moves=body.moves||[];
   if(typeof origin!=='string'||origin.length>160||!Array.isArray(moves)||moves.length>2048)throw Error('无效的局面或着法记录');
   const game=new Chess(origin);
   for(const uci of moves){if(!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci))throw Error('无效 UCI 着法');game.move(uci);}
   if(game.fen()!==new Chess(body.fen).fen())throw Error('局面与着法记录不一致');
   const result=game.isCheckmate()?(game.turn()==='w'?'0-1':'1-0'):game.isDraw()?'1/2-1/2':'*';
   const base={available:true,source:'stockfish',name:'Stockfish 19 Lite',local:true,browser:true,fen:game.fen(),perspective:'white'};
   if(result!=='*'){
    const data=analysis?{...base,terminal:true,result,pvs:[],complete:true}:{ok:true,terminal:true,result,uci:null};onUpdate?.(data);return data;
   }
   const level=LEVELS[body.level||2];if(!analysis&&!level)throw Error('难度应为 1–6');
   const limited=!analysis&&level.elo!==null;
   this.send('setoption name UCI_LimitStrength value '+limited);
   this.send('setoption name Skill Level value 20');
   if(limited)this.send('setoption name UCI_Elo value '+Math.max(this.eloMin,Math.min(this.eloMax,level.elo)));
   this.send('setoption name MultiPV value '+(analysis?3:1));
   this.send('position fen '+origin+(moves.length?' moves '+moves.join(' '):''));
   const sign=game.turn()==='w'?1:-1,count=Math.min(3,game.moves().length),batches=new Map();let rows=null,lastEmit=0;
   let aborted=false,stopTimer;
   const stop=()=>{aborted=true;this.send('stop');stopTimer=setTimeout(()=>this.fail(abortError()),1500);};
   signal?.addEventListener('abort',stop,{once:true});
   try{
    if(signal?.aborted)throw abortError();
    const best=this.waitFor(line=>{
     if(line.startsWith('bestmove '))return true;
     if(!analysis||aborted||!line.startsWith('info ')||/\b(?:upperbound|lowerbound)\b/.test(line))return false;
     const depth=line.match(/\bdepth (\d+)/),score=line.match(/\bscore (cp|mate) (-?\d+)/),pv=line.match(/\bpv (.+)$/);
     if(!depth||!score||!pv)return false;
     const rank=Number(line.match(/\bmultipv (\d+)/)?.[1]||1),wdl=line.match(/\bwdl (\d+) (\d+) (\d+)/);
     const row={depth:Number(depth[1]),moves:pv[1],[score[1]]:sign*Number(score[2])};
     if(wdl)row.wdl=(sign===1?wdl.slice(1):wdl.slice(1).reverse()).map(Number);
     let batch=batches.get(row.depth);if(!batch||rank===1)batches.set(row.depth,batch=new Map());batch.set(rank,row);
     while(batches.size>24)batches.delete(batches.keys().next().value);
     if(batch.size>=count&&batch.has(1)&&new Set([...batch.values()].map(item=>item.moves.split(' ')[0])).size>=count){
      rows=[...batch].sort((a,b)=>a[0]-b[0]).map(([,value])=>value);
      if(performance.now()-lastEmit>=120){lastEmit=performance.now();onUpdate?.({...base,depth:rows[0].depth,pvs:rows,complete:false});}
     }
     return false;
    },15000);
    this.send('go movetime '+(analysis?(body.review?450:1200):level.ms));
    const answer=await best;
    if(aborted||signal?.aborted)throw abortError();
    if(analysis){
     if(!rows?.length)throw Error('Stockfish 未返回分析，请重试。');
     const data={...base,depth:rows[0].depth,pvs:rows,complete:true};onUpdate?.(data);return data;
    }
    const uci=answer.split(/\s+/)[1];game.move(uci);
    return {ok:true,...base,uci,level:Number(body.level||2)};
   }catch(error){
    if(error.name!=='AbortError')this.fail(error);
    throw error;
   }finally{clearTimeout(stopTimer);signal?.removeEventListener('abort',stop);}
  });
  this.queue=task;return task;
 }
}
const play=new UciWorker(),analysis=new UciWorker();
async function browserEngineStatus(){
 await play.ensure();
 return {available:true,source:'stockfish',name:'Stockfish 19 Lite',local:true,browser:true,eloRange:[play.eloMin,play.eloMax],levels:Object.fromEntries(Object.entries(LEVELS).map(([key,value])=>[key,{...value,engineElo:value.elo===null?null:Math.max(play.eloMin,Math.min(play.eloMax,value.elo))}]))};
}
function browserEngineRequest(path,body,options){
 if(path==='/api/play')return play.request(body,false,options);
 if(path==='/api/analyze')return analysis.request(body,true,options);
 return Promise.reject(Error('不支持的浏览器引擎请求'));
}
window.addEventListener('pagehide',()=>{play.fail(abortError());analysis.fail(abortError());});

return { browserEngineEnabled, browserEngineRequest, browserEngineStatus };
})();
const { engineRequest, engineStatus, scoreValue, scoreLabel, moveQuality }=(()=>{

async function engineStatus(){
 if(browserEngineEnabled())return browserEngineStatus();
 const response=await fetch('/api/engine',{cache:'no-store'});
 if(!response.ok)throw Error('本地引擎连接失败');
 return response.json();
}
async function engineRequest(path, body, {signal, onUpdate}={}){
 if(browserEngineEnabled())return browserEngineRequest(path,body,{signal,onUpdate});
 const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});
 if(!response.ok){let data;try{data=await response.json();}catch{}throw Error(data?.message||`本地引擎请求失败 (${response.status})`);}
 if(!onUpdate)return response.json();
 const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',last=null;
 try{
  while(true){
   const {done,value}=await reader.read();buffer+=decoder.decode(value,{stream:!done});
   let end;
   while((end=buffer.indexOf('\n\n'))>=0){
    const event=buffer.slice(0,end);buffer=buffer.slice(end+2);
    const line=event.split('\n').find(s=>s.startsWith('data: '));if(!line)continue;
    const data=JSON.parse(line.slice(6));if(data.error)throw Error(data.message);
    last=data;onUpdate(data);
   }
   if(done)break;
  }
 }finally{reader.releaseLock();}
 if(!last?.complete)throw Error('本地分析连接中断，请重试。');
 return last;
}
function scoreValue(pv){
 if(Number.isFinite(pv?.mate))return pv.mate>0?100000-Math.abs(pv.mate):pv.mate<0?-100000+Math.abs(pv.mate):0;
 return Number.isFinite(pv?.cp)?pv.cp:null;
}
function scoreLabel(pv){
 if(Number.isFinite(pv?.mate))return `${pv.mate>=0?'白':'黑'}方 ${Math.abs(pv.mate)} 步将杀`;
 if(!Number.isFinite(pv?.cp))return '暂无评分';
 const n=pv.cp/100;return (n>0?'+':'')+n.toFixed(2);
}
function moveQuality(previous,current,move){
 const best=previous?.pvs?.[0],after=current?.pvs?.[0];
 if(!best||!after||!previous.complete||!current.complete)return null;
 if(best.moves.split(' ')[0]===move.from+move.to+(move.promotion||''))return {label:'最佳',loss:0,cls:'best'};
 const beforeScore=scoreValue(best),afterScore=scoreValue(after);
 if(beforeScore===null||afterScore===null)return null;
 const loss=Math.max(0,(beforeScore-afterScore)*(move.color==='w'?1:-1));
 return {loss,label:loss<30?'良好':loss<100?'可改进':loss<250?'失误':'严重失误',cls:loss<30?'good':loss<100?'ok':'bad'};
}

return { engineRequest, engineStatus, scoreValue, scoreLabel, moveQuality };
})();
const { CHESS_QUOTE_DATA }=(()=>{
// Verified short extracts and original practice prompts. See data/CHESS_QUOTES.md.
// Translations below were written for this project, not copied from modern editions.
const QUOTE_SOURCES={
 capablanca:'https://www.gutenberg.org/files/33870/33870-h/33870-h.htm',
 franklin:'https://founders.archives.gov/documents/Franklin/01-29-02-0608',
 lasker:'https://archive.org/details/commonsenseinche00laskrich',
 zweig:'https://www.tha.de/homes/harsch/germanica/Chronologie/20Jh/Zweig/zwe_scha.html'
};
const VERIFIED_QUOTES=[
 {text:'The control of the centre is of great importance.',translation:'控制中心具有重要意义。',source:'卡帕布兰卡《国际象棋基础》§7',sourceUrl:QUOTE_SOURCES.capablanca,kind:'quote'},
 {text:'In all endings of this kind, care must be taken not to drift into a stale mate.',translation:'在这类残局中，必须留意不要走成逼和。',source:'卡帕布兰卡《国际象棋基础》§1（基础将杀）',sourceUrl:QUOTE_SOURCES.capablanca,kind:'quote'},
 {text:'It is generally advisable to advance the Pawn that is free from opposition.',translation:'通常应优先考虑推进前方没有对方兵阻挡的兵。',source:'卡帕布兰卡《国际象棋基础》§3',sourceUrl:QUOTE_SOURCES.capablanca,kind:'quote'},
 {text:'Naturally, these principles have sometimes to be modified to suit the exigencies of the position.',translation:'这些原则有时也须依照具体局面的要求作出调整。',source:'卡帕布兰卡《国际象棋基础》§14',sourceUrl:QUOTE_SOURCES.capablanca,kind:'quote'},
 {text:'the value of a piece can often be measured by the number of squares it commands.',translation:'一枚棋子的价值，常可由它控制的格子数量来衡量。',source:'卡帕布兰卡《国际象棋基础》§14（节选）',sourceUrl:QUOTE_SOURCES.capablanca,kind:'quote'},
 {text:'the co-operation of the King is needed.',translation:'王的协同是必要的。',source:'卡帕布兰卡《国际象棋基础》§1（基础将杀，节选）',sourceUrl:QUOTE_SOURCES.capablanca,kind:'quote'},
 {text:'The game of Chess is not merely an idle amusement.',translation:'国际象棋并不只是消遣。',source:'本杰明·富兰克林《棋之道德》',sourceUrl:QUOTE_SOURCES.franklin,kind:'quote'},
 {text:'For life is a kind of chess',translation:'因为人生也如同一盘棋。',source:'本杰明·富兰克林《棋之道德》（节选）',sourceUrl:QUOTE_SOURCES.franklin,kind:'quote'},
 {text:'Foresight, which looks a little into futurity',translation:'远见，使人向未来多看一步。',source:'本杰明·富兰克林《棋之道德》（节选）',sourceUrl:QUOTE_SOURCES.franklin,kind:'quote'},
 {text:'Caution, not to make our moves too hastily.',translation:'谨慎，不要过于仓促地落子。',source:'本杰明·富兰克林《棋之道德》（节选）',sourceUrl:QUOTE_SOURCES.franklin,kind:'quote'},
 {text:'persevering in the search of resources.',translation:'坚持寻找可用的办法。',source:'本杰明·富兰克林《棋之道德》（节选）',sourceUrl:QUOTE_SOURCES.franklin,kind:'quote'},
 {text:'common sense triumphs over trickery, and rightly so.',translation:'常识战胜了诡计，理当如此。',source:'伊曼纽尔·拉斯克《国际象棋常识》（节选）',sourceUrl:QUOTE_SOURCES.lasker,kind:'quote'},
 {text:'However, I do not ask you to believe me blindly.',translation:'不过，我并不要求你盲目相信我。',source:'伊曼纽尔·拉斯克《国际象棋常识》',sourceUrl:QUOTE_SOURCES.lasker,kind:'quote'},
 {text:'common sense tells us exactly how to proceed.',translation:'常识会告诉我们该如何着手。',source:'伊曼纽尔·拉斯克《国际象棋常识》（节选）',sourceUrl:QUOTE_SOURCES.lasker,kind:'quote'},
 {text:'An attack will direct itself in the first instance against your weakest points',translation:'攻击首先会指向你最薄弱的地方。',source:'伊曼纽尔·拉斯克《国际象棋常识》（第91页，节选）',sourceUrl:QUOTE_SOURCES.lasker,kind:'quote'},
 {text:'je mehr sich einer begrenzt, umso mehr ist er andererseits dem Unendlichen nah',translation:'一个人越是专注于狭窄的领域，另一方面便越接近无限。',source:'斯蒂芬·茨威格《象棋的故事》（叙述者谈专注，节选）',sourceUrl:QUOTE_SOURCES.zweig,kind:'quote'}
];

// Original prompts: these are not quotations and carry no historical attribution.
const ORIGINAL_PRACTICE_NOTES=`
开局时，先问新走出的棋子是否给下一枚棋子让出了路线。
过早出后之前，数一数对手能带着节奏攻击它的着法。
同一枚轻子走第二次前，看看其余棋子是否仍停在原位。
易位不是仪式；先确认易位一侧的兵形和开放线。
中心紧闭时，侧翼行动才更有时间慢慢展开。
选择开局变例时，也要考虑自己愿意进入哪种残局。
遇到陌生开局，不必先猜名字，先辨认中心兵形。
对手偏离主线时，重新检查具体威胁，而不是机械惩罚。
出子受阻时，找到挡路的那枚兵，再考虑它该怎样前进。
开局里的多一个兵，可能要用几个出子节奏交换。
王还在中央时，开线的收益应同时从双方角度计算。
棋子看似都已出动，也要确认两辆车是否能够互相照应。
边兵的推进也会改变主教的斜线，不只是增加侧翼空间。
开局准备可以记住分岔点，不必只记一长串答案。
面对弃兵，先比较接受后能否安全完成出子。
每次后与车排成一线，都值得检查是否存在串击。
双重攻击的目标未必是两枚棋子，也可能是棋子与将杀。
发现牵制后，确认被牵制的子是否真的不能离开。
吃子时先检查回吃是否打开了另一条攻击线。
计算闪击时，别忽略移开棋子的落点也可能带着威胁。
一枚棋子承担两项防守任务时，尝试分别攻击这两个目标。
交换防守子之前，确认自己是否仍有力量进入弱点。
诱离一个防守者之后，还要算它能否沿另一条路线返回。
将杀网中的逃生格，有时比被攻击的格子更值得注意。
逼迫对手走王之前，先确定王的新位置是否反而安全。
计算中间着时，暂缓习惯性的回吃，再列出所有将军。
底线战术不仅取决于有没有通气孔，也取决于重子能否侵入。
马的叉击常以一个将军为起点，先查看双方王与后的距离。
寻找组合时，把所有未被保护的棋子圈在心里。
漂亮的弃子需要具体后续，不能只靠对手看起来难受。
评价一枚马的站位，既看现在的控制格，也看它能否被兵驱赶。
好象与坏象的区别，往往藏在己方兵占据的颜色里。
交换对手最活跃的棋子，可能比立刻改善自己的棋子更有效。
一个永久弱点只有在能够接近时，才成为实际目标。
空间优势需要支撑；过多推进也可能留下难以保护的格子。
在封闭局面中，找出双方能够打开局面的兵突破。
开放线被争夺时，先计算进入格是否能站稳。
把车放上半开放线之后，寻找可供重子进入的横线。
局面没有弱点可攻时，可以考虑迫使对手作出一次选择。
两翼都有目标时，比较转移子力需要多少步。
限制对手的反击，常常能让自己的计划更容易执行。
交换之前，分别想象双方剩下的最强与最差棋子。
兵形固定之后，留意哪一种轻子更适合留下来。
不要只给格子命名，也要判断对手能否利用它。
一枚暂时退后的棋子，有时正在为更好的路线让路。
兵链的根部通常比最前端更容易受到持续攻击。
孤兵带来的开放线与活动力，可能补偿它的防守负担。
叠兵并不总是缺点；先看它们打开了什么路线。
形成远方通路兵之前，计算己王是否还能守住另一翼。
兵突破往往要求精确次序，不妨把三种推进顺序都试算。
留住一枚兵，有时能为残局保留关键的等着。
翼兵多数的价值，需要能够推进的空间来兑现。
向前推兵前，确定它留下的格子会不会成为对方据点。
锁住中心时，也许同时锁住了自己的主教。
兵交换能打开线，也能替对手修复一个结构弱点。
过路兵权利只在当下有效；把它纳入这一着的计算。
兵残局中，先画出双方王能否进入的关键格。
通路兵进入第七横线后，升变格的控制常比保护兵本身更急。
面对边兵残局，务必单独检查角落是否造成逼和。
兵越少，每次交换所改变的局面性质可能越大。
车残局里，活跃的车常能比被动守兵的车制造更多机会。
让王参与残局时，仍要先确认对方是否拥有连续将军。
车在通路兵后方的原则很有用，但要检查是否有具体战术例外。
兵残局中多出一个节奏，可能改变整个对王关系。
同色象残局里，尝试把对方的兵固定在己象能够攻击的颜色。
异色象残局不要过早判和，王的进入路线仍须计算。
后残局的第一项检查，是自己的王会不会遭到长将。
残局转化为兵残局之前，把最后一段算到明确结果。
车兵将杀时，先减少对方王的活动范围，再靠近自己的王。
单后将杀时，为对方的王留意至少一个合法着法，避免逼和。
弱升变不仅为了战术，有时也是避免立即逼和的办法。
守残局时，可以把目标缩小为建立一个可重复维持的阵形。
领先一兵不代表可以忽略活跃度；交换前先比较剩余子力。
残局中的横向防守和侧面将军，常能比正面阻挡更灵活。
一旦进入熟悉的基本残局，先认出模型，再计算具体细节。
计算候选着法时，先写出两到三种真正不同的想法。
一条变化算到局面安静时，再停下来评价结果。
别把对手的自然应手当作唯一应手，专门寻找它的反击。
计算的最后一着也要做一次漏着检查。
连续强制着法结束后，重新清点双方子力与王的安全。
如果分支越来越乱，回到起点核对第一着的必要性。
想象棋盘时，特别留心已经移开的兵和新打开的斜线。
只有当局面确实相同，才能把两条变化合并计算。
估计一个计划之前，先数清它需要几着无强制性的准备。
候选着法难以区分时，比较哪一着给对手留下的选择更少。
将军不一定是最佳着法，但值得作为强制分支优先核对。
进攻需要计算终点；防守同样需要计算终点。
考虑重复局面时，把行棋方和易位权也纳入比较。
一条看似赢子的变化，可能在最后遇到逼和或长将。
停止计算之前，问一句：对方是否还有更强的将军？
防守时先区分真正的威胁与只让人不舒服的姿态。
对方准备进攻时，寻找能迫使其分心保护的目标。
主动交换一枚攻击子，有时比增加第三个防守者更省力。
遇到猛烈进攻，不妨先确认对手是否已经投入足够子力。
王的逃跑路线也可以提前准备，而不是等到被将军才找。
必须让步时，选择最容易恢复或最难被利用的弱点。
劣势局面中的每一着，都可以争取增加对手的技术难度。
防守要寻找资源，不必急着证明自己此前没有下错。
对手在一翼集中子力时，检查另一翼是否存在及时的突破。
不要因为一枚棋子被攻击，就自动移动它；也许有更强的反击。
阻挡进攻线时，比较挡线子是否还会继续受到攻击。
防守阵形的稳固程度，也取决于有没有足够的等待着法。
用将军争取节奏之前，确保不会把对方的王送到更好的格子。
守住一个威胁后，立即确认有没有新产生的第二个威胁。
顽强并不等于拒绝交换；有些简化正是守和的机会。
复盘可以先找最早的计划分歧，而不是只找最后的漏子。
先写下自己的判断，再查看引擎，比较才会更具体。
分析一盘大师棋时，可以在关键局面遮住后续着法。
同一开局看两盘不同兵形的实战，比只背一条长主线更有帮助。
把反复出错的局面按原因分类，而不是只记输赢。
复习一题时，试着解释为什么其他自然着法不行。
发现更好着法后，再找出它解决了自己原方案的哪个问题。
结束复盘时，带走一条下次能够执行的检查习惯。
一个引擎首选不是完整解释，继续观察它后续要求怎样配合。
比较候选线时，先确认分析的起点与行棋方一致。
评估值的轻微变化，不必立刻解释为一次明显失误。
学习残局时，可以从同一阵形更换行棋方再练一次。
重新做一题前，先独立回忆思路，而不是直接回忆答案。
研究开局时，为每个关键兵突破配上一盘示范对局。
PGN 能保存主线；重要的思考也可以另外写下自己的短笔记。
输掉上一盘，不必把急于追回的心情带进下一盘。
发现漏着之后，先检查当前局面，机会并没有因此自动消失。
用掉很多时间的一步，落子前仍值得做最后一次检查。
优势时可以放慢确认，劣势时也保留清醒判断的节奏。
不熟悉的局面是学习材料，不是必须立即摆脱的错误。
不要让刚看到的精彩战术遮住对手眼前的简单威胁。
面对名气更大的对手，仍然只需处理棋盘上的这一步。
一盘棋中的耐心，不是永远等待，而是愿意为计划做准备。
走出被迫的一着之后，把注意力重新放回可选择的未来。
如果思绪被结果占满，就回到棋子、格子和具体应手。
暂时看不见计划时，先确认最需要改善的是哪一枚棋子。
每盘棋都可以有一个小目标，例如少漏一条长斜线。
复盘自己的胜局，也能发现被结果掩盖的问题。
对手的好棋值得记录；它也是下一次训练的题目。
清楚地理解一个基本局面，比模糊地看过十个更可靠。
看谱时先认出上一着改变的线路，再按下一步。
在大师对局中暂停一次，自己决定何时交换后。
回放到转折点时，比较双方最差棋子的命运。
遇到漂亮组合，往前退几着，找出它赖以成立的准备。
收藏一盘棋时，可以给自己留下再次观看的理由。
分析关闭时的棋句是一般提示，不能代替当前局面的计算。
观察同一兵形的多盘棋，可以分清常见计划与偶然战术。
从中间续走参考谱时，先确认当前行棋方和起始局面。
放映可以帮助看整体，逐着暂停更适合练习独立判断。
如果一盘棋显得过于复杂，先只追踪双方的中心兵。
下一轮观看，可以改为追踪某一枚马如何找到据点。
研究将杀局时，数清限制逃生格的每一枚棋子。
不要把参考主线当成唯一合法答案，其他候选仍可独立检验。
将一段残局从双方视角各走一遍，会更容易记住防守资源。
学完一个主题后，回到完整实战中寻找它出现的条件。
`.trim().split('\n').map(text=>({text,kind:'note'}));

const CHESS_QUOTE_DATA=[...VERIFIED_QUOTES,...ORIGINAL_PRACTICE_NOTES];

return { CHESS_QUOTE_DATA };
})();
const { CHESS_NOTES, createNoteDeck, setupRestNotes }=(()=>{

// Original practice notes, not attributed quotations or position-specific engine advice.
const ORIGINAL_NOTES = [
 ...`落子之前，先看看对手上一着改变了什么。
将军、吃子、威胁，可以作为计算的起点。
好棋也需要一个合适的时机。
有时最有力的一步，是让最差的棋子找到工作。
中心不仅是一块地方，也是一组路线。
计划可以改变，王的安全始终值得检查。
先找到对手的想法，再决定自己的计划。
交换之前，看看交换后谁更活跃。
兵不能后退，推进前多看一眼身后的格子。
开放线的价值，常常取决于谁能先进入。
计算得慢一点，常能少走一次回头路。
一盘棋的故事，不只写在吃掉的棋子上。
优势需要耐心，劣势需要韧性。
没有直接威胁时，可以改善棋子的配合。
落子后留下的空格，也属于这步棋的一部分。
让每一枚棋子，都能看见同伴。
多问一句：对方最强的应手是什么？
看见好棋之后，仍可以寻找更好的选择。
短暂的安静，可能是重新布局的机会。
防守不是等待，也可以是在准备反击。
双象喜欢空间，马往往需要一个稳固的落脚点。
兵形决定路线，子力决定节奏。
一个被忽略的后排，可能比多出的兵更重要。
把注意力留给局面，而不是刚才的遗憾。
在残局里，王也可以走到舞台中央。
通路兵的价值，还要看它能否得到支持。
换后之后，再重新判断王的位置。
胜势之中，仍要检查对手最后的反击。
守和的资源，有时藏在逼和与重复局面里。
每次兵的交换，都可能打开一条新的线。
马的前哨，最好有兵与同伴共同照应。
不要只计算自己的进攻，也计算对手的回手。
一条斜线的尽头，也许正站着对方的王。
后走得很远，未必比轻子配合走得更好。
先检查悬空的棋子，再构想遥远的计划。
争夺空间时，也要为棋子留下退路。
开放中心之前，比较双方王的位置。
堵住一条路线，有时比追赶棋子更有效。
残局中的一步等待，可能改变整个局面。
学一盘名局，不妨先猜一猜大师的下一着。
同一个局面，可以从双方的视角各看一次。
记录一个疑问，常比背下一串着法更有价值。
复盘时，先寻找转折，再寻找答案。
别急着模仿妙手，先理解它成立的条件。
吃子是一种选择，保持压力也是一种选择。
多一兵时，可以考虑简化，也要注意剩下的兵形。
异色象残局里，活动性与王的安全仍然重要。
车后的通路兵，常常比眼前的一次将军更值得留意。
计算到局面安静下来，判断往往更清楚。
对手留给你的弱点，需要合适的棋子才能利用。
保住主动权，有时比立即收回一个兵更重要。
局面复杂时，先梳理最直接的威胁。
没有必要让每一步都显得惊人。
一着朴素的防守，也可以是整盘棋的关键。
棋盘上最安静的格子，有时藏着最好的路线。
不要把开局原则，当成不必计算的理由。
王车易位之前，仍要观察两翼的危险。
被将军时，比较走王、吃子与挡住攻击线的选择。
子力领先时，仍要留心自己的王是否暴露。
残局不只计算距离，也计算轮到谁走。
多给自己一次检查，会少给对手一次机会。
一盘棋可以结束，一个好问题可以继续研究。
研究棋谱时，停在你不理解的那一着。
耐心也是棋盘上的一种力量。
把复杂局面拆成几组小问题。
先看棋子，再看格子，最后看它们之间的联系。
优势不是终点，而是下一段计划的起点。
尝试解释一着棋，比只记住它更容易留下印象。
走得自然之前，先确认它走得安全。
当你不知道做什么时，看看哪枚棋子最需要帮助。`.split('\n').map(text=>({text})),
 {text:'A quiet move can carry a clear idea.',translation:'安静的一着，也可以承载清晰的想法。'},
 {text:'Before you move, ask what changed.',translation:'落子之前，先问局面发生了什么变化。'},
 {text:'Give your least active piece a better square.',translation:'为最不活跃的棋子，找一个更好的格子。'},
 {text:'A plan begins with the position in front of you.',translation:'计划，始于眼前的局面。'},
 {text:'Count the reply, not just the threat.',translation:'既看自己的威胁，也计算对手的应手。'},
 {text:'The king becomes a traveller in the endgame.',translation:'到了残局，王也可以成为远行者。'},
 {text:'An open file is an invitation, not a guarantee.',translation:'开放线提供机会，但并不保证优势。'},
 {text:'Make room for every piece to take part.',translation:'为每枚棋子留下参与战斗的空间。'},
 {text:'A good defence keeps asking questions.',translation:'好的防守，也不断向对手提出问题。'},
 {text:'Look once more before the final move.',translation:'在最后落子之前，再检查一次。'},
 {text:'Study the turning point, not only the result.',translation:'研究转折，不只关注结果。'},
 {text:'Patience can turn a small edge into a lasting one.',translation:'耐心，可以让微小优势变得持久。'}
];

const CHESS_NOTES=[...new Map([...ORIGINAL_NOTES,...CHESS_QUOTE_DATA].map(note=>[note.text,note])).values()];

function createNoteDeck(notes,{storage,rng=Math.random}={}){
 const signature=notes.map(note=>note.text).join('\n');let hash=2166136261;for(const char of signature){hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619);}
 const version=String(hash>>>0),key='ChessAtelierNotesDeckV2';let remaining=[],last=-1;
 try{const saved=JSON.parse(storage?.getItem(key)||'null');if(saved?.version===version&&Array.isArray(saved.remaining)){remaining=[...new Set(saved.remaining.filter(i=>Number.isInteger(i)&&i>=0&&i<notes.length))];last=saved.last;}}catch{}
 return ()=>{
  if(!remaining.length){remaining=notes.map((_,i)=>i);for(let i=remaining.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[remaining[i],remaining[j]]=[remaining[j],remaining[i]];}if(remaining.length>1&&remaining[0]===last)[remaining[0],remaining[1]]=[remaining[1],remaining[0]];}
  last=remaining.shift();try{storage?.setItem(key,JSON.stringify({version,remaining,last}));}catch{}
  return notes[last];
 };
}
function setupRestNotes(){
 const rest=document.querySelector('#analysis-rest'),text=document.querySelector('#chess-note'),translation=document.querySelector('#chess-note-translation'),source=document.querySelector('#chess-note-source');
 let storage;try{storage=localStorage;}catch{}
 const pick=createNoteDeck(CHESS_NOTES,{storage});
 function next(){
  const note=pick();text.textContent=note.text;text.lang=note.lang||(note.source?.includes('茨威格')?'de':note.translation?'en':'zh-CN');
  translation.textContent=note.translation?'（'+note.translation+'）':'';translation.hidden=!note.translation;
  source.replaceChildren();source.hidden=!note.source;
  if(note.source){const label=document.createElement(note.sourceUrl?'a':'span');label.textContent='— '+note.source;if(note.sourceUrl){label.href=note.sourceUrl;label.target='_blank';label.rel='noopener noreferrer';}source.append(label);}
 }
 rest.addEventListener('dblclick',event=>{if(event.target.closest('a'))return;event.preventDefault();next();});
 rest.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();next();}});
 next();return next;
}

return { CHESS_NOTES, createNoteDeck, setupRestNotes };
})();
const { setupLocalAnalysis }=(()=>{



function setupLocalAnalysis({state,viewGame,enginePosition,drawArrow,maybeBookReply,toast}){
 const $=q=>document.querySelector(q);
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const cache=new Map();let timer=null,controller=null,sequence=0,enabled=true;
 const nextNote=setupRestNotes();
 const key=p=>JSON.stringify([p.origin,p.moves]);
 const remember=(k,data)=>{cache.delete(k);cache.set(k,data);while(cache.size>128)cache.delete(cache.keys().next().value);};
 function status(text,busy=false){
  $('#analysis-state').textContent=text;
  $('#engine-insight').setAttribute('aria-busy',String(busy));
  $('#engine-connection').dataset.state=busy?'busy':text.includes('不可用')?'error':'ready';
 }
 function empty(message){$('#engine-insight').innerHTML=`<div class="engine-empty">${escape(message)}</div>`;}
 function odds(wdl){
  const box=$('#engine-probability'),total=Array.isArray(wdl)?wdl.reduce((a,b)=>a+b,0):0;
  box.dataset.known=String(total>0);box.dataset.pending='false';
  if(!total){
   for(const side of ['white','draw','black']){$(`#odds-${side}`).textContent='—';$(`#odds-bar-${side}`).style.width=(side==='draw'?100:0)+'%';}
   return;
  }
  const white=Math.round(100*wdl[0]/total),draw=Math.min(100-white,Math.round(100*wdl[1]/total)),black=100-white-draw;
  for(const [i,side] of ['white','draw','black'].entries()){
   $(`#odds-bar-${side}`).style.width=(100*wdl[i]/total)+'%';
   $(`#odds-${side}`).textContent=[white,draw,black][i]+'%';
  }
  $('#engine-probability-bar').setAttribute('aria-label',`白胜 ${white}%，和棋 ${draw}%，黑胜 ${black}%`);
 }
 function variations(data,fen){
  return (data.pvs||[]).slice(0,3).map((pv,i)=>{
   const game=new Chess(fen),moves=[];
   for(const uci of pv.moves.split(/\s+/).slice(0,8)){try{moves.push(game.move(uci));}catch{break;}}
   return moves.length?{...pv,i,moves}:null;
  }).filter(Boolean);
 }
 function render(data,position){
  if(key(enginePosition())!==key(position))return;
  state.analysis=data;
  if(data.terminal){
   odds(data.result==='1-0'?[1000,0,0]:data.result==='0-1'?[0,0,1000]:[0,1000,0]);
   status('对局结束');if(!state.postReview)empty('对局结束 · 可回退复盘');return;
  }
  const rows=variations(data,viewGame().fen());if(!rows.length)return;
  // Iterations update suggestions; probabilities settle only once per position.
  if(data.complete)odds(rows[0].wdl);
  if(state.postReview){status(data.complete?'分析完成':'正在分析',!data.complete);if(data.complete)$('#retry-engine').classList.add('hidden');return;}
  $('#engine-insight').innerHTML=`<div class="engine-pvs">${rows.map(row=>`<button class="engine-pv" type="button" data-pv="${row.i}" title="${escape(row.moves.map(m=>m.san).join(' → '))}" aria-label="候选 ${row.i+1}：${escape(row.moves[0].san)}，在棋盘标记"><span class="engine-pv-rank">${row.i+1}</span><strong>${escape(row.moves[0].san)}</strong><span class="engine-pv-line">${escape(row.moves.slice(1).map(m=>m.san).join('  '))||'—'}</span></button>`).join('')}</div>`;
  status(data.complete?'分析完成':'正在分析',!data.complete);
  if(!state.engineError)$('#retry-engine').classList.add('hidden');
 }
 function scheduleEngine(){
  clearTimeout(timer);controller?.abort();controller=null;const seq=++sequence;
  if(state.postReview)return;
  if(!enabled){status('实时分析已关闭');$('#engine-connection').dataset.state='paused';return;}
  const position=enginePosition(),k=key(position),cached=cache.get(k);
  if(cached)render(cached,position);
  else{state.analysis=null;empty(enabled?'分析中…':'分析已暂停');}
  if(cached?.complete)return;
  $('#engine-probability').dataset.pending='true';status('正在分析',true);
  timer=setTimeout(async()=>{
   timer=null;
   const request=controller=new AbortController(),timeout=setTimeout(()=>request.abort(),12000);
   try{
    await engineRequest('/api/analyze',{...position,stream:true},{signal:request.signal,onUpdate:data=>{
     if(seq!==sequence)return;remember(k,data);render(data,position);
    }});
   }catch(error){
    if(seq!==sequence||request.signal.aborted&&controller!==request)return;
    status('本地分析不可用');empty(error.name==='AbortError'?'分析超时，请重试。':error.message);
    $('#retry-engine').classList.remove('hidden');
   }finally{clearTimeout(timeout);if(controller===request)controller=null;}
  },180);
 }
 async function refreshEngineStatus(){
  try{
   const data=await engineStatus();
   if(!data.available)throw Error(data.message||'本地 Stockfish 不可用');
   const select=$('#bot-level');
   for(const option of select.options){const level=data.levels[option.value];if(level)option.textContent=level.name+' · '+(level.elo||3190);}
   select.dispatchEvent(new CustomEvent('change',{detail:{engineOptions:true}}));
  }catch(error){status('本地引擎不可用');empty(error.message);$('#retry-engine').classList.remove('hidden');}
 }
 $('#analysis-toggle').addEventListener('click',()=>{
  if(state.postReview)state.closeReview?.();
  enabled=!enabled;$('#analysis-toggle').setAttribute('aria-pressed',String(enabled));
  $('.coach-card').dataset.paused=String(!enabled);
  $('.analysis-live').inert=!enabled;$('.analysis-live').setAttribute('aria-hidden',String(!enabled));
  $('#analysis-rest').setAttribute('aria-hidden',String(enabled));$('#analysis-rest').tabIndex=enabled?-1:0;
  if(!enabled){state.arrow=null;drawArrow();}
  $('#review-toggle').setAttribute('aria-disabled',String(!enabled));scheduleEngine();
 });
 $('#engine-insight').addEventListener('click',event=>{
  const button=event.target.closest('[data-pv]');if(!button||!state.analysis)return;
  const row=variations(state.analysis,viewGame().fen()).find(r=>r.i===Number(button.dataset.pv));
  if(row){state.arrow={from:row.moves[0].from,to:row.moves[0].to};drawArrow();}
 });
 $('#retry-engine').addEventListener('click',()=>{
  if(state.postReview){state.retryReview?.();return;}
  refreshEngineStatus();cache.delete(key(enginePosition()));scheduleEngine();
  if(state.mode==='book'&&state.duelStarted&&!state.review&&viewGame().turn()!==state.side&&!state.busy)maybeBookReply();
 });
 window.addEventListener('pagehide',()=>{clearTimeout(timer);controller?.abort();});
 function setReviewMode(on){
  if(on&&!enabled){toast?.('请先打开实时分析');return false;}
  $('#analysis-toggle').setAttribute('aria-pressed',String(enabled));
  $('#analysis-toggle span').textContent='实时分析';$('#analysis-toggle').setAttribute('aria-label','实时分析');
  $('.coach-card').dataset.review=String(on);
  $('.coach-card').dataset.paused=String(!enabled);$('.analysis-live').inert=!enabled;$('.analysis-live').setAttribute('aria-hidden',String(!enabled));
  $('#analysis-rest').setAttribute('aria-hidden',String(enabled));$('#analysis-rest').tabIndex=enabled?-1:0;
  scheduleEngine();
 }
 return {scheduleEngine,refreshEngineStatus,setReviewMode,isEnabled:()=>enabled,boardReset:nextNote,renderReview:render,reviewLoading:()=>{status('正在分析当前局面',true);$('#engine-probability').dataset.pending='true';}};
}

return { setupLocalAnalysis };
})();
const { setupPostReview }=(()=>{


function setupPostReview({state,cachedHistory,enginePosition,goto,drawArrow,analysis,whenFlightsIdle}){
 const $=id=>document.getElementById(id);let record=null,controller=null,timer=null,epoch=0,lastView=-1,error='',annotationKey='',annotationJob=0,textMotion=null,textAnimation=null,textSignature='';
 const departingMarks=new Set();
 function stop(){clearTimeout(timer);timer=null;controller?.abort();controller=null;epoch++;}
 function clearMarks(){
  annotationKey='';annotationJob++;
  for(const node of document.querySelectorAll('#board .review-mark:not(.is-leaving)')){
   if(matchMedia('(prefers-reduced-motion: reduce)').matches){node.remove();continue;}
   const style=getComputedStyle(node),cell=node.parentElement,ghost=node.cloneNode(true),opacity=style.opacity,transform=style.transform;
   Object.assign(ghost.style,{left:(cell.offsetLeft+node.offsetLeft)+'px',top:(cell.offsetTop+node.offsetTop)+'px',right:'auto',width:style.width,height:style.height});
   ghost.classList.add('is-leaving');$('board').append(ghost);departingMarks.add(ghost);node.remove();
   const animation=ghost.animate([{opacity,transform},{opacity:0,transform:'translateY(-2px) scale(.72)'}],{duration:150,easing:'ease-out',fill:'both'});
   animation.finished.catch(()=>{}).then(()=>{ghost.remove();departingMarks.delete(ghost);});
  }
 }
 function fadeEvaluation(){
  textAnimation?.cancel();const node=$('review-evaluation');
  if(!state.postReview){node.style.opacity='';return;}
  if(textMotion?.view===state.view&&textMotion.started===null){node.style.opacity='0';return;}
  const remaining=textMotion?.view===state.view?Math.max(1,textMotion.duration-(performance.now()-textMotion.started)):180;
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){node.style.opacity='';return;}
  node.style.opacity='';const animation=textAnimation=node.animate([{opacity:0},{opacity:1}],{duration:remaining,easing:'linear',fill:'both'});
  animation.finished.catch(()=>{}).then(()=>{if(textAnimation===animation){animation.cancel();textAnimation=null;node.style.opacity='';}});
 }
 function prepareMotion(index){if(!state.postReview)return;textMotion={view:index,started:null,duration:0};textAnimation?.cancel();textAnimation=null;$('review-evaluation').style.opacity='0';}
 function motionStarted(duration){if(textMotion?.view!==state.view)return;textMotion.started=performance.now();textMotion.duration=duration;fadeEvaluation();}
 function boardResetStarted(){clearMarks();textMotion=null;textSignature='';textAnimation?.cancel();textAnimation=null;$('review-evaluation').style.opacity='';}
 function close(){stop();state.postReview=false;error='';$('post-review').hidden=true;boardResetStarted();state.arrow=null;drawArrow();analysis.setReviewMode(false);sync();}
 state.closeReview=close;state.retryReview=()=>{error='';stop();schedule();render();};
 function createRecord(){
  const moves=cachedHistory().map(move=>({...move})),game=new Chess(state.origin),uci=[];
  const positions=[{fen:game.fen(),origin:state.origin,moves:[]}];
  for(const move of moves){game.move({from:move.from,to:move.to,promotion:move.promotion});uci.push(move.from+move.to+(move.promotion||''));positions.push({fen:game.fen(),origin:state.origin,moves:uci.slice()});}
  return {game:state.game,length:moves.length,last:moves.at(-1)?.san,moves,positions,results:new Map()};
 }
 function qualityAt(index){
  const before=record.results.get(index-1),after=record.results.get(index),move=record.moves[index-1];if(!before||!after||!move)return null;
  if(after.terminal&&after.result!=='1/2-1/2')return {label:'将死',cls:'best',loss:0};
  const adjusted=after.terminal?{...after,pvs:[{moves:'',cp:0}]}:after;
  return moveQuality(before,adjusted,move);
 }
 function currentLine(data,index){
  const pv=data?.pvs?.[0];if(!pv)return null;
  const game=new Chess(record.positions[index].fen),moves=[];
  for(const uci of pv.moves.split(/\s+/).slice(0,4)){try{moves.push(game.move(uci));}catch{break;}}
  return moves.length?moves:null;
 }
 function positionSummary(data){
  if(data?.terminal)return data.result==='1/2-1/2'?'本局和棋。':(data.result==='1-0'?'白方':'黑方')+'将死获胜。';
  const best=data?.pvs?.[0];if(!best)return '';
  if(Number.isFinite(best.mate))return scoreLabel(best)+'。';
  if(!Number.isFinite(best.cp))return '';
  const amount=Math.abs(best.cp),side=best.cp>=0?'白方':'黑方';
  return amount<35?'引擎判断双方局势接近。':side+(amount<120?'略占优势。':amount<300?'占优。':'明显占优。');
 }
 function moveComment(index,current,quality){
  if(error)return error;
  if(!current)return '正在加载此步分析…';
  if(!index)return positionSummary(current)+'使用箭头或着法记录逐步查看。';
  if(!quality)return '正在补全走前局面，完成后显示本步评价。';
  if(quality.label==='将死')return positionSummary(current);
  const text=quality.cls==='best'?'与引擎首选一致。':quality.cls==='good'?'与引擎首选的评分接近。':quality.loss>=10000?'这一步改变了将杀形势。':`相较走前的引擎参考，约损失 ${(quality.loss/100).toFixed(1)} 兵。`;
  const previous=currentLine(record.results.get(index-1),index-1),alternative=previous?.[0];
  return text+(quality.loss>=30&&alternative?'走前更优参考为 '+alternative.san+'。':'')+positionSummary(current);
 }
 function lineDescription(line){
  if(!line?.length)return '';
  const move=line[0],names={p:'兵',n:'马',b:'象',r:'车',q:'后',k:'王'};
  const action=move.flags?.includes('k')?'短易位':move.flags?.includes('q')?'长易位':`${names[move.piece]}从 ${move.from} ${move.captured?'吃到':'走到'} ${move.to}`;
  return `${move.color==='w'?'白':'黑'}方可考虑${action}${move.promotion?'，升变为'+names[move.promotion]:''}${move.san.includes('#')?'，形成将死':move.san.includes('+')?'，形成将军':''}。箭头标出第一着。`;
 }
 function annotate(index,move,quality,line){
  const key=JSON.stringify([index,state.orientation,quality?.label,line?.map(m=>m.san)]);if(key===annotationKey)return;
  clearMarks();annotationKey=key;const job=annotationJob,snapshot=record;
  state.arrow=null;drawArrow();
  // goto() draws the final board before registering the flight. Wait a frame first,
  // then wait for the actual moving piece to land before revealing its annotation.
  requestAnimationFrame(async()=>{await whenFlightsIdle();requestAnimationFrame(()=>{
   if(job!==annotationJob||!state.postReview||record!==snapshot||state.view!==index)return;
   if(line?.length){state.arrow={from:line[0].from,to:line[0].to};drawArrow();}
   if(move&&quality){const cell=document.querySelector(`#board > [data-square="${move.to}"]`);if(cell?.querySelector('.piece')){
    const badge=document.createElement('span');badge.className='review-mark review-'+quality.cls;
    badge.textContent=quality.cls==='best'?'★':quality.cls==='good'?'✓':quality.cls==='ok'?'~':quality.loss>=250?'??':'?';
    badge.title=move.san+' · '+quality.label+'（Stockfish 参考）';badge.setAttribute('aria-label',badge.title);cell.append(badge);
   }}
  });});
 }
 function render(){
  if(!state.postReview||!record)return;
  const index=state.view,current=record.results.get(index),move=record.moves[index-1],quality=qualityAt(index);
  $('post-review').hidden=false;$('review-progress').textContent=`${record.results.size} / ${record.positions.length} 局面`;
  $('review-meter').style.width=(record.results.size/record.positions.length*100)+'%';
  $('review-move-title').textContent=index?`第 ${Math.ceil(index/2)} 回合 · ${move?.color==='w'?'白':'黑'} ${move?.san||''}${quality?' · '+quality.label:''}`:'初始局面';
  $('review-move-title').dataset.quality=quality?.cls||'';
  $('review-comment').textContent=moveComment(index,current,quality);
  const line=currentLine(current,index),suggestion=$('review-suggestion');suggestion.hidden=!line;
  suggestion.textContent=line?'后续参考：'+line.map(move=>move.san).join(' → '):'';
  $('review-line-description').textContent=lineDescription(line);$('review-line-description').hidden=!line;
  const signature=JSON.stringify([index,$('review-move-title').textContent,$('review-comment').textContent,suggestion.textContent]);
  if(signature!==textSignature){textSignature=signature;fadeEvaluation();}
  suggestion.onclick=line?()=>{annotationKey='';annotate(index,move,quality,line);}:null;
  if(current)analysis.renderReview(current,record.positions[index]);else analysis.reviewLoading();
  annotate(index,move,quality,line);
 }
 function schedule(){if(timer||controller||!state.postReview||!record||error)return;timer=setTimeout(pump,80);}
 async function pump(){
  timer=null;if(!state.postReview||!record)return;
  const order=[state.view,...(state.view?[state.view-1]:[]),...record.positions.map((_,i)=>i)],index=order.find(i=>!record.results.has(i));
  if(index===undefined){render();return;}
  const snapshot=record,token=epoch,request=controller=new AbortController(),timeout=setTimeout(()=>request.abort(),15000);
  try{
   const data=await engineRequest('/api/analyze',{...snapshot.positions[index],stream:true,review:true},{signal:request.signal,onUpdate:data=>{if(token===epoch&&state.postReview&&state.view===index)analysis.renderReview(data,snapshot.positions[index]);}});
   if(token!==epoch||snapshot!==record||!state.postReview)return;
   record.results.set(index,data);render();
  }catch(exception){if(token===epoch&&state.postReview){error=exception.name==='AbortError'?'分析超时，请重试。':exception.message||'复盘分析暂不可用，请重试。';render();$('retry-engine').classList.remove('hidden');}}
  finally{clearTimeout(timeout);if(controller===request)controller=null;if(token===epoch)schedule();}
 }
 function sync(){
  const moves=cachedHistory();
  if(record&&(record.game!==state.game||record.length!==moves.length||record.last!==moves.at(-1)?.san)){
   const wasActive=state.postReview,previous=record;stop();record=null;clearMarks();if(wasActive){record=createRecord();for(const [index,data] of previous.results)if(record.positions[index]?.fen===previous.positions[index]?.fen&&record.positions[index]?.origin===previous.positions[index]?.origin&&record.positions[index]?.moves.join(' ')===previous.positions[index]?.moves.join(' '))record.results.set(index,data);}else $('post-review').hidden=true;
  }
  const button=$('review-toggle');button.setAttribute('aria-pressed',String(!!state.postReview));button.setAttribute('aria-disabled',String(!analysis.isEnabled()));
  if(state.postReview){if(lastView!==state.view){stop();clearMarks();lastView=state.view;error='';}render();schedule();}
 }
 $('review-toggle').addEventListener('click',()=>{
  if(!analysis.isEnabled()){state.notify?.('请先打开实时分析');return;}
  if(state.postReview){close();return;}
  if(!record)record=createRecord();state.postReview=true;error='';lastView=-1;analysis.setReviewMode(true);sync();
 });
 window.addEventListener('pagehide',()=>{stop();textAnimation?.cancel();for(const node of departingMarks)node.remove();departingMarks.clear();});
 return {sync,close,prepareMotion,motionStarted,boardResetStarted,motionSettled:()=>{textMotion=null;textAnimation?.cancel();textAnimation=null;$('review-evaluation').style.opacity='';if(state.postReview)render();}};
}

return { setupPostReview };
})();
const { LESSONS }=(()=>{
// Curated, manually annotated chess lines. Historic scores are factual move records.
const LESSONS = [
  {id:'italian', stage:'开局', level:'入门', title:'意大利开局', english:'Italian Game', subtitle:'迅速出子，协调进攻 f7', theme:'中心与出子', pgn:'1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d3 d6 6. O-O O-O', notes:{2:'白方争夺 e5，同时让王翼马进入战场。',5:'白格象指向 f7，这是黑方开局最敏感的格子之一。',9:'c3 为 d4 的中心推进提供支持。',11:'d3 稳固 e4；当中心尚未准备好时，不必急于打开。'},intro:'观察两边如何完成出子与易位，再考虑 d4 突破。', origin:'教学示例'},
  {id:'ruy', stage:'开局', level:'入门', title:'西班牙开局', english:'Ruy Lopez', subtitle:'向中心施加长期压力', theme:'中心与牵制', pgn:'1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6', notes:{5:'Bb5 施压保卫 e5 的 c6 马，间接争夺中心。',9:'白方先易位，将王置于较安全的位置。',11:'Re1 加强 e4，准备后续的中心行动。'}, intro:'不必立即吃掉 c6 马，长期的中心压力也具有价值。',origin:'教学示例'},
  {id:'queens', stage:'开局', level:'入门', title:'后翼弃兵', english:"Queen's Gambit", subtitle:'用侧翼兵换取中心主动权', theme:'兵形与中心', pgn:'1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7 5. e3 O-O 6. Nf3 Nbd7',notes:{3:'c4 给 d5 兵施压；这不是为了盲目牺牲，而是争夺中心。',5:'e6 巩固 d5，但暂时限制黑格象的活动。',9:'e3 巩固中心，为白格象出动创造机会。'},intro:'对比双方的兵链：中心空间与子力活动是本局重点。',origin:'教学示例'},
  {id:'london',stage:'开局',level:'入门',title:'伦敦体系',english:'London System',subtitle:'稳健布阵与协调发展',theme:'结构与计划',pgn:'1. d4 d5 2. Bf4 Nf6 3. e3 e6 4. Nf3 Bd6 5. Bg3 O-O 6. Bd3 c5 7. c3 Nc6',notes:{3:'先出黑格象，再走 e3，避免象被自己的兵链限制。',9:'Bg3 让象保留在有用的斜线上。',13:'c3 巩固 d4，准备稳步发展。'},intro:'理解每一步如何共同支持同一套结构，而不是机械背谱。',origin:'教学示例'},
  {id:'sicilian',stage:'开局',level:'进阶',title:'西西里防御',english:'Sicilian Defense',subtitle:'不对称兵形与反击机会',theme:'动态中心',pgn:'1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be3 e5 7. Nb3 Be6',notes:{2:'...c5 从侧翼攻击 d4，形成不对称结构。',6:'白方 d4 中心突破，黑方用侧翼兵交换。',10:'...a6 控制 b5，为后翼扩张做好准备。'},intro:'黑方放弃完全对称的中心，以换取反击和空间上的不平衡。',origin:'教学示例'},
  {id:'caro',stage:'开局',level:'入门',title:'卡罗-康防御',english:'Caro–Kann',subtitle:'稳健中心与轻子发展',theme:'兵形',pgn:'1. e4 c6 2. d4 d5 3. Nc3 dxe4 4. Nxe4 Bf5 5. Ng3 Bg6 6. h4 h6 7. Nf3 Nd7', notes:{2:'...c6 支撑 d5，以稳健的兵链争夺中心。',8:'...Bf5 在 ...e6 前发展后翼象，是重要结构特点。',12:'h4 争夺王翼空间，但也形成新弱点。'},intro:'观察为什么黑方可以先解决后翼象的发展问题。',origin:'教学示例'},
  {id:'french',stage:'开局',level:'进阶',title:'法兰西防御',english:'French Defense',subtitle:'封闭中心与兵链突破',theme:'兵链',pgn:'1. e4 e6 2. d4 d5 3. Nc3 Nf6 4. e5 Nfd7 5. f4 c5 6. Nf3 Nc6 7. Be3 cxd4',notes:{2:'...e6 支撑随后 ...d5 的中心反击。',8:'e5 赢得空间，也让中心变得较封闭。',10:'...c5 立即攻击白方 d4 兵链根部。'},intro:'学习识别兵链的底部，而不是只盯着前端的兵。',origin:'教学示例'},
  {id:'kingsindian',stage:'开局',level:'进阶',title:'王翼印度防御',english:"King's Indian Defense",subtitle:'先让对手占中心，再从侧翼反击',theme:'空间与反击',pgn:'1. d4 Nf6 2. c4 g6 3. Nc3 Bg7 4. e4 d6 5. Nf3 O-O 6. Be2 e5 7. O-O Nc6',notes:{4:'...g6 计划用 g7 象从长斜线影响中心。',8:'白方建立宽阔的中心；黑方暂时选择弹性布局。',12:'...e5 用兵反击中心，而非任由白方扩张。'},intro:'两种思路的对抗：直接占领中心，与远距离控制中心。',origin:'教学示例'},
  {id:'opera',stage:'中局',level:'入门',title:'歌剧院对局',english:'The Opera Game · 1858',subtitle:'莫菲：出子、开放线与连续先手',theme:'发展优势与战术',pgn:'[Event "Opera Game"]\n[Site "Paris"]\n[Date "1858.??.??"]\n[White "Paul Morphy"]\n[Black "Duke Karl / Count Isouard"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0',notes:{7:'黑方过早出象钉马，没有解决后翼出子的问题。',13:'Bc4 针对 f7，并同时发展轻子。',19:'白方牺牲马，依靠先手打开攻击线。思考：打开的线由哪些棋子利用？',23:'白方长易位让车直接进入 d 线，发展与攻击合为一体。',27:'Rd1 进一步利用开放线，限制黑方王和重子。',31:'Qb8+ 是引离防守的战术：黑马不得不吃后。',33:'Rd8# 完成将死。注意它依赖所有之前的出子与线位控制。'},intro:'核心问题：为什么“出子速度”能够转化为具体的将杀？',origin:'1858 历史实战'},
  {id:'immortal',stage:'中局',level:'进阶',title:'不朽之局',english:'The Immortal Game · 1851',subtitle:'安德森：弃子与攻王网络',theme:'先手与将杀',pgn:'[Event "Immortal Game"]\n[Site "London"]\n[Date "1851.??.??"]\n[White "Adolf Anderssen"]\n[Black "Lionel Kieseritzky"]\n[Result "1-0"]\n\n1. e4 e5 2. f4 exf4 3. Bc4 Qh4+ 4. Kf1 b5 5. Bxb5 Nf6 6. Nf3 Qh6 7. d3 Nh5 8. Nh4 Qg5 9. Nf5 c6 10. g4 Nf6 11. Rg1 cxb5 12. h4 Qg6 13. h5 Qg5 14. Qf3 Ng8 15. Bxf4 Qf6 16. Nc3 Bc5 17. Nd5 Qxb2 18. Bd6 Qxa1+ 19. Ke2 Bxg1 20. e5 Na6 21. Nxg7+ Kd8 22. Qf6+ Nxf6 23. Be7# 1-0',notes:{3:'王翼弃兵寻求快速出子和开放线，具有明显风险。',7:'黑后早早介入，使双方形成尖锐、充满先手的局面。',33:'Nd5 将战斗中心转向黑王，威胁不断累积。',41:'Nxg7+ 让黑王暴露于连续将军之下。',43:'Qf6+ 送后是战术手段，而不是单纯丢失物质。',45:'Be7# 构成漂亮的双马、双象协同将杀网络。'},intro:'本局适合练习“计算迫着”：将军、吃子、制造直接威胁。',origin:'1851 历史实战'},
  {id:'legal',stage:'中局',level:'入门',title:'勒加尔将杀',english:"Légal's Mate",subtitle:'表面失后与三轻子配合', theme:'战术与钉子',pgn:'1. e4 e5 2. Nf3 d6 3. Bc4 Bg4 4. Nc3 g6 5. Nxe5 Bxd1 6. Bxf7+ Ke7 7. Nd5#',notes:{8:'这里的钉住需要重新计算，不能只依靠“马不能动”的直觉。',9:'Nxe5 以牺牲后为诱饵，关键在于接下来的强迫性将军。',11:'黑方吃后却忽视王的安全；物质价值不是唯一标准。',14:'Nd5# 用两马一象协调封堵黑王逃路。'},intro:'练习判断“钉住”是否成立，以及强迫着如何决定战术优先级。',origin:'经典战术范例'},
  {id:'scholar',stage:'中局',level:'入门',title:'学者将杀',english:"Scholar's Mate",subtitle:'认识 f7 软点与双子协同',theme:'弱点与防守',pgn:'1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7#',notes:{3:'白后过早出动并非稳健选择；对方正确防守后容易被追赶。',5:'象与后同时瞄准 f7，这是重要的战术警报。',6:'...Nf6 忽视 f7 的直接威胁。',7:'Qxf7# 成立的关键：f7 由象保护，黑王无安全逃格。'},intro:'把它当成“学会识别威胁”的练习，而不是推荐常规开局走法。',origin:'经典战术范例'},
  {id:'pawnend',stage:'残局',level:'入门',title:'王兵残局：对王',english:'King & Pawn · Opposition',subtitle:'理解先后手与关键格',theme:'对王与逼走',fen:'8/4k3/8/4K3/4P3/8/8/8 w - - 0 1',notes:{},intro:'白先走。双方都只有王和一个白兵。尝试利用王的位置打开通路，并关注轮到谁走。',origin:'教学局面'},
  {id:'rookend',stage:'残局',level:'入门',title:'单车将杀',english:'Rook & King vs King',subtitle:'用王和车把对手压向棋盘边缘',theme:'基础将杀',fen:'8/8/3k4/8/8/8/4K3/R7 w - - 0 1',notes:{},intro:'白先走。不要孤立地用车追王：先缩小活动区域，再让己王协助。',origin:'教学局面'},
  {id:'queenend',stage:'残局',level:'入门',title:'单后将杀',english:'Queen & King vs King',subtitle:'控制空间，避免逼和',theme:'基础将杀',fen:'8/8/3k4/8/8/8/4K3/Q7 w - - 0 1',notes:{},intro:'白先走。后可以迅速限制王，但必须避免逼和：该走棋的一方无合法着法且未被将军。',origin:'教学局面'},
  {id:'pawnrace',stage:'残局',level:'进阶',title:'兵的升变竞赛',english:'Passed Pawn Race',subtitle:'计算谁先升变及王能否阻挡',theme:'升变与节奏',fen:'8/8/8/3k4/8/4K3/P7/8 w - - 0 1',notes:{},intro:'白先走。首先观察双方王离通路兵有多远，再决定是否推进。',origin:'教学局面'},
  {id:"scotch",stage:"开局",level:"入门",title:"苏格兰开局",english:"Scotch Game",subtitle:"开放中心与迅速出子",theme:"开局计划",pgn:"1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Nxd4 Bc5 5. Be3 Qf6 6. c3 Nge7",notes:{},intro:"请对照双方的子力出动、中心控制及易位时机。",origin:"教学主线"},
  {id:"petrov",stage:"开局",level:"入门",title:"俄罗斯防御",english:"Petrov Defense",subtitle:"中心均衡与战术精度",theme:"开局计划",pgn:"1. e4 e5 2. Nf3 Nf6 3. Nxe5 d6 4. Nf3 Nxe4 5. d4 d5 6. Bd3 Bd6",notes:{},intro:"请对照双方的子力出动、中心控制及易位时机。",origin:"教学主线"},
  {id:"vienna",stage:"开局",level:"进阶",title:"维也纳开局",english:"Vienna Game",subtitle:"灵活的王翼空间",theme:"开局计划",pgn:"1. e4 e5 2. Nc3 Nf6 3. f4 d5 4. fxe5 Nxe4 5. Nf3",notes:{},intro:"请对照双方的子力出动、中心控制及易位时机。",origin:"教学主线"},
  {id:"twoknights",stage:"开局",level:"进阶",title:"双马防御",english:"Two Knights Defense",subtitle:"快速攻王与中心反击",theme:"开局计划",pgn:"1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 d5 5. exd5 Na5 6. Bb5+ c6 7. dxc6 bxc6",notes:{},intro:"请对照双方的子力出动、中心控制及易位时机。",origin:"教学主线"},
  {id:"evans",stage:"开局",level:"进阶",title:"埃文斯弃兵",english:"Evans Gambit",subtitle:"牺牲侧翼兵换取发展先手",theme:"开局计划",pgn:"1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. b4 Bxb4 5. c3 Ba5 6. d4 exd4 7. O-O",notes:{},intro:"请对照双方的子力出动、中心控制及易位时机。",origin:"教学主线"},
  {id:"slav",stage:"开局",level:"入门",title:"斯拉夫防御",english:"Slav Defense",subtitle:"稳固后翼兵链",theme:"开局计划",pgn:"1. d4 d5 2. c4 c6 3. Nf3 Nf6 4. Nc3 dxc4 5. a4 Bf5 6. e3 e6",notes:{},intro:"请对照双方的子力出动、中心控制及易位时机。",origin:"教学主线"},
  {id:"qga",stage:"开局",level:"入门",title:"后翼弃兵接受变化",english:"Queen’s Gambit Accepted",subtitle:"夺回中心与发展优势",theme:"开局计划",pgn:"1. d4 d5 2. c4 dxc4 3. Nf3 Nf6 4. e3 e6 5. Bxc4 c5 6. O-O a6",notes:{},intro:"请对照双方的子力出动、中心控制及易位时机。",origin:"教学主线"},
  {id:"nimzo",stage:"开局",level:"进阶",title:"尼姆佐印度防御",english:"Nimzo-Indian Defense",subtitle:"钉马与兵形控制",theme:"开局计划",pgn:"1. d4 Nf6 2. c4 e6 3. Nc3 Bb4 4. e3 O-O 5. Bd3 d5 6. Nf3 c5",notes:{},intro:"请对照双方的子力出动、中心控制及易位时机。",origin:"教学主线"},
  {id:"english",stage:"开局",level:"入门",title:"英国式开局",english:"English Opening",subtitle:"从侧翼影响中心",theme:"开局计划",pgn:"1. c4 e5 2. Nc3 Nf6 3. g3 d5 4. cxd5 Nxd5 5. Bg2 Nb6 6. Nf3 Nc6",notes:{},intro:"请对照双方的子力出动、中心控制及易位时机。",origin:"教学主线"},
  {id:"scandi",stage:"开局",level:"入门",title:"斯堪的纳维亚防御",english:"Scandinavian Defense",subtitle:"后早出后的节奏问题",theme:"开局计划",pgn:"1. e4 d5 2. exd5 Qxd5 3. Nc3 Qa5 4. d4 Nf6 5. Nf3 c6",notes:{},intro:"请对照双方的子力出动、中心控制及易位时机。",origin:"教学主线"},
  {id:"dutch",stage:"开局",level:"入门",title:"荷兰防御",english:"Dutch Defense",subtitle:"控制 e4 与王翼布局",theme:"开局计划",pgn:"1. d4 f5 2. g3 Nf6 3. Bg2 e6 4. Nf3 Be7 5. O-O O-O",notes:{},intro:"请对照双方的子力出动、中心控制及易位时机。",origin:"教学主线"},
  {id:"accelerated",stage:"开局",level:"进阶",title:"加速龙式",english:"Accelerated Dragon",subtitle:"长对角线与中央结构",theme:"开局计划",pgn:"1. e4 c5 2. Nf3 Nc6 3. d4 cxd4 4. Nxd4 g6 5. Nc3 Bg7 6. Be3 Nf6",notes:{},intro:"请对照双方的子力出动、中心控制及易位时机。",origin:"教学主线"},
  {id:"pirc",stage:"开局",level:"入门",title:"皮尔茨防御",english:"Pirc Defense",subtitle:"后发制人与中心反击",theme:"开局计划",pgn:"1. e4 d6 2. d4 Nf6 3. Nc3 g6 4. Nf3 Bg7 5. Be2 O-O",notes:{},intro:"请对照双方的子力出动、中心控制及易位时机。",origin:"教学主线"},
  {id:"queensindian",stage:"开局",level:"入门",title:"后翼印度防御",english:"Queen’s Indian Defense",subtitle:"以长对角线牵制中心",theme:"开局计划",pgn:"1. d4 Nf6 2. c4 e6 3. Nf3 b6 4. g3 Bb7 5. Bg2 Be7 6. O-O O-O",notes:{},intro:"请对照双方的子力出动、中心控制及易位时机。",origin:"教学主线"}
];

return { LESSONS };
})();
const { pieceSvg, setPieceStyle, acquirePiece, releasePiece, resetPiecePool, preloadPieceArt, preparePieceArt, warmPieceStyles }=(()=>{
// Original Lichess artwork: Cburnett (Colin M. L. Burnett, GPL-2.0+),
// Maestro (sadsnake1, CC-BY-NC-SA-4.0), Mpchess (Maxime Chupin, GPL-3.0+),
// Totoy (Kosal Sen, CC-BY-4.0). Exact source commit/hash and licenses:
// assets/pieces/manifest.json and README.md. Theme SVGs only change colors;
// no runtime fill/stroke overrides, glyph substitution, or geometry changes.
// 棋子标记串在一次绘制里是固定的，这里缓存 HTML 字符串，
// 避免长棋谱每走一步都重新拼接同一段 SVG / img 标签。
const choices=new Set(['cburnett','maestro','mpchess','totoy']);
// Bump when SVG artwork changes so an existing browser cache sees the new set.
const ART_REVISION='4';
function setPieceStyle(v){document.documentElement.dataset.pieceStyle=choices.has(v)?v:'cburnett';}
const cache=new Map();
function pieceSvg(type,color,theme=document.documentElement.dataset.theme||'walnut',style=document.documentElement.dataset.pieceStyle||'cburnett'){
 const code=(color==='w'?'w':'b')+type.toUpperCase();
 const key=theme+'|'+style+'|'+code;
 let html=cache.get(key);
 if(html===undefined){
  html=`<span class="piece-visual"><span class="piece-missing" aria-hidden="true" hidden>?</span><img class="piece-art-img" alt="" draggable="false" decoding="async" src="./assets/pieces-themed/${theme}/${style}/${code}.svg?v=${ART_REVISION}" onload="this.parentElement.classList.remove('asset-failed');this.parentElement.classList.add('asset-ready');this.previousElementSibling.hidden=true" onerror="if(!this.dataset.original){this.dataset.original='1';this.src='./assets/pieces/${style}/${code}.svg?v=${ART_REVISION}'}else{this.parentElement.classList.add('asset-failed');this.previousElementSibling.hidden=false}" /></span>`;
  cache.set(key,html);
 }
 return html;
}

/* ------------------------------------------------------------------
   棋子节点复用池 —— 走子闪烁的根治点
   旧实现里 drawBoard() 每次换格都是 prior.remove() 再新建 <span class="piece">。
   新建的 <img> 必须等自己的 onload 才会拿到 .asset-ready，而样式层给
   .piece-art-img 设了 opacity:0 → 1，于是落子那一帧一定会看到一次淡入，
   也就是「走子时候会有闪烁」。
   这里把节点按「主题|风格|棋子」缓存复用：节点里的图片早已解码、
   asset-ready 早已打好，插入即显示，既没有淡入，也省掉每步的图片解码。
   ------------------------------------------------------------------ */
const POOL=new Map();   // poolKey -> 尚未使用的节点
const WARM=new Set();   // 已确认该资源在浏览器里可用
let poolScope='';
const artScope=()=>`${document.documentElement.dataset.theme||'walnut'}|${document.documentElement.dataset.pieceStyle||'cburnett'}`;
const artKey=(type,color)=>artScope()+'|'+color+type;
function ensureScope(){
 const s=artScope();
  if(s!==poolScope){poolScope=s;POOL.clear();}
}
function markWarm(node){
 const v=node.firstElementChild;
 if(!v)return;
 v.classList.remove('asset-failed');v.classList.add('asset-ready');
}
function buildNode(type,color,theme=document.documentElement.dataset.theme||'walnut',style=document.documentElement.dataset.pieceStyle||'cburnett'){
 const node=document.createElement('span');
 node.className='piece';
 node.dataset.artScope=theme+'|'+style;
 node.innerHTML=pieceSvg(type,color,theme,style);
 const visual=node.firstElementChild;
 if(visual){
  visual.dataset.piece=(color==='w'?'w':'b')+type;
  const img=visual.querySelector('.piece-art-img');
  const key=theme+'|'+style+'|'+color+type;
  img?.addEventListener('load',()=>WARM.add(key),{once:true});
  // src 命中内存缓存时 Chrome 会同步给 complete，此时可以直接判定为可用
  if(img&&img.complete&&img.naturalWidth>0)WARM.add(key);
  if(WARM.has(key))markWarm(node);
 }
 return node;
}
function acquirePiece(type,color){
 ensureScope();
 const key=artKey(type,color);
 const node=(POOL.get(key)||[]).pop();
 if(node){node.style.opacity='';return node;}
 const fresh=buildNode(type,color);
 if(WARM.has(key))markWarm(fresh);
 return fresh;
}
function releasePiece(node){
 if(!node)return;
 // 必须先离场：旧实现只 remove()，这里若不摘掉，节点会留在原格里变成"分身"
 node.remove();
 node.style.opacity='';
 const code=node.firstElementChild?.dataset.piece;
 if(!code)return;
 ensureScope();
 if(node.dataset.artScope&&node.dataset.artScope!==artScope())return;
 const key=artScope()+'|'+code;
 let list=POOL.get(key);
 if(!list)POOL.set(key,list=[]);
 if(list.length<10)list.push(node);
}
function resetPiecePool(){POOL.clear();poolScope='';}
// Decode the complete target set before replacing any visible pieces.
const PREPARED=new Map();
const PREPARED_NODES=new Map();
async function preparePieceArt(theme,style){
 const scope=theme+'|'+style;
 if(PREPARED_NODES.has(scope))return PREPARED_NODES.get(scope).promise;
 const entry={nodes:null,promise:null};
 entry.promise=prepareNodes(theme,style).then(nodes=>{entry.nodes=nodes;return nodes;}).catch(error=>{PREPARED_NODES.delete(scope);throw error;});
 PREPARED_NODES.set(scope,entry);
 // Keep a few decoded sets, without retaining every theme ever visited.
 if(PREPARED_NODES.size>8)PREPARED_NODES.delete(PREPARED_NODES.keys().next().value);
 return entry.promise;
}
async function prepareNodes(theme,style){
 const requests=[];
 for(const color of ['w','b'])for(const type of ['p','n','b','r','q','k']){
  const key=theme+'|'+style+'|'+color+type;
  if(!PREPARED.has(key)){
   const image=new Image();image.decoding='async';
   image.src=`./assets/pieces-themed/${theme}/${style}/${color+type.toUpperCase()}.svg?v=${ART_REVISION}`;
   PREPARED.set(key,image.decode().then(()=>{WARM.add(key);return image;},()=>{PREPARED.delete(key);}));
  }
  requests.push(PREPARED.get(key));
 }
 await Promise.all(requests);
 // Decode the actual nodes that will be inserted, not just separate Image objects.
 // In particular, async SVG decoding can otherwise start halfway through a scale animation.
 const nodes=[],want={p:9,n:3,b:3,r:3,q:2,k:2};
 for(const color of ['w','b'])for(const type of Object.keys(want)){
  for(let i=0;i<want[type];i++)nodes.push(buildNode(type,color,theme,style));
  // Yield between small batches so decoding never freezes a menu fade or a click.
  await new Promise(resolve=>setTimeout(resolve,0));
 }
 await Promise.all(nodes.map(async node=>{const image=node.querySelector('img');try{await image.decode();markWarm(node);}catch{}}));
 return nodes;
}
function warmPieceStyles(theme){
 for(const style of choices)preparePieceArt(theme,style).catch(()=>{});
}
/* 开局前把每种棋子各备好若干个已加载节点，之后任何一次落子都只是搬一个现成节点。 */
function preloadPieceArt(prepared=[]){
 ensureScope();
 const scope=prepared[0]?.dataset.artScope;
 if(scope&&PREPARED_NODES.get(scope)?.nodes===prepared)PREPARED_NODES.delete(scope);
 for(const node of prepared){const code=node.firstElementChild?.dataset.piece;if(!code||node.dataset.artScope!==artScope())continue;const key=artScope()+'|'+code;let list=POOL.get(key);if(!list)POOL.set(key,list=[]);list.push(node);}
 const want={p:9,n:3,b:3,r:3,q:2,k:2};
 for(const color of ['w','b'])for(const type of Object.keys(want)){
  const key=artKey(type,color),list=POOL.get(key)||[];
  while(list.length<want[type])list.push(buildNode(type,color));
  POOL.set(key,list);
 }
}

return { pieceSvg, setPieceStyle, acquirePiece, releasePiece, resetPiecePool, preloadPieceArt, preparePieceArt, warmPieceStyles };
})();
const { MUSIC_SEED, MUSIC_GROUPS, EXTENDED_GROUPS }=(()=>{
// Actual filenames verified against Wikimedia Commons category listings, Oct 2026.
// These are recordings by different performers, not recordings by the composers except where specified.
const MUSIC_SEED=[
 ['Bach Sinfonien01.ogg','巴赫 · 三部创意曲 No.1','巴赫','钢琴'],
 ['Bach Sinfonien02.ogg','巴赫 · 三部创意曲 No.2','巴赫','钢琴'],
 ['Bach Sinfonien03.ogg','巴赫 · 三部创意曲 No.3','巴赫','钢琴'],
 ['Bach Sinfonien04.ogg','巴赫 · 三部创意曲 No.4','巴赫','钢琴'],
 ['Bach Sinfonien05.ogg','巴赫 · 三部创意曲 No.5','巴赫','钢琴'],
 ['Bach Invention 2P 14th.ogg','巴赫 · 二部创意曲 No.14','巴赫','钢琴'],
 ['Bach Brahms Chaconne.ogg','巴赫—勃拉姆斯 · 恰空改编','巴赫','钢琴'],
 ['Balakirev islamej.ogg','巴拉基列夫 · 伊斯拉美','巴拉基列夫','钢琴'],
 ['Brahms Rhapsody in B minor, Op 79 No 1.ogg','勃拉姆斯 · 狂想曲 Op.79 No.1','勃拉姆斯','钢琴'],
 ['Brahms Intermezzo Op. 76 No. 7.ogg','勃拉姆斯 · 间奏曲 Op.76 No.7','勃拉姆斯','钢琴'],
 ['Brahms - Hungarian Dance No. 1 (performed by the composer).oga','勃拉姆斯 · 匈牙利舞曲 No.1（作曲家演奏）','勃拉姆斯','历史录音'],
 ['Chopin - Fantasie Impromptu Op. 66 played by Dario Fernandez Torre.oga','肖邦 · 幻想即兴曲 Op.66','肖邦','钢琴'],
 ['Barcarolle-op-60.ogg','肖邦 · 船歌 Op.60','肖邦','钢琴'],
 ['Chopin-Berceuse.ogg','肖邦 · 摇篮曲 Op.57','肖邦','钢琴'],
 ['1 Chopin, Berceuse (piano-Christine Hartley).ogg','肖邦 · 摇篮曲（Christine Hartley）','肖邦','钢琴'],
 ['Allegro de Concert Op. 46 in A Major.mp3','肖邦 · 音乐会快板 Op.46','肖邦','钢琴'],
 ['Chopin Impromptus Op.29, JMC, Han.ogg','肖邦 · 即兴曲 Op.29','肖邦','钢琴'],
 ['Chopin - Piano Concerto no. 1, Op. 11 (string quartet)-1.ogg','肖邦 · 钢琴协奏曲 No.1 · I（室内乐版）','肖邦','协奏曲'],
 ['Chopin - Piano Concerto no. 1, Op. 11 (string quartet)-2.ogg','肖邦 · 钢琴协奏曲 No.1 · II（室内乐版）','肖邦','协奏曲'],
 ['Chopin - Piano Concerto no. 1, Op. 11 (string quartet)-3.ogg','肖邦 · 钢琴协奏曲 No.1 · III（室内乐版）','肖邦','协奏曲'],
 ['Beethoven - 32 Variations in C Minor, WoO 80.ogg','贝多芬 · c小调32首变奏曲','贝多芬','钢琴'],
 ['Ludwig van Beethoven - Symphonie 5 c-moll - 1. Allegro con brio.ogg','贝多芬 · 第五交响曲 · I','贝多芬','管弦乐'],
 ['Ludwig van Beethoven - Symphonie 5 c-moll - 2. Andante con moto.ogg','贝多芬 · 第五交响曲 · II','贝多芬','管弦乐'],
 ['Clair de lune (Claude Debussy) Suite bergamasque.ogg','德彪西 · 月光（贝加马斯克组曲）','德彪西','钢琴'],
 ['Claude Debussy - 2nd Arabesque (JMC, Han).oga','德彪西 · 第二阿拉伯风格曲','德彪西','钢琴'],
 ['Claude Debussy - I Livre Prelude VIII... (...La fille aux cheveux de lin) - Patrizia Prati.ogg','德彪西 · 亚麻色头发的少女（Patrizia Prati）','德彪西','钢琴'],
 ['Claude Debussy - I Livre Prelude I... (...Danseuses de Delphes) - Patrizia Prati.ogg','德彪西 · 德尔菲舞姬（Patrizia Prati）','德彪西','钢琴'],
 ['02 Mozart KV 421 1.ogg','莫扎特 · 弦乐四重奏 K.421 · I','莫扎特','室内乐'],
 ['06 Mozart KV 421 4.ogg','莫扎特 · 弦乐四重奏 K.421 · IV','莫扎特','室内乐'],
 ['Divertimento in E-flat major - KV 113 - 1st movement.oga','莫扎特 · 降E大调嬉游曲 K.113 · I','莫扎特','管弦乐'],
 ['Divertimento in F major, K. 138 (125c) - 1st movement.oga','莫扎特 · F大调嬉游曲 K.138 · I','莫扎特','管弦乐'],
 ['Wolfgang Amadeus Mozart - Flute Quartet No. 1 in D Major - 1. Allegro.ogg','莫扎特 · D大调长笛四重奏 · I','莫扎特','室内乐'],
 ['Wolfgang Amadeus Mozart - Flute Quartet No. 1 in D Major - 2. Adagio.ogg','莫扎特 · D大调长笛四重奏 · II','莫扎特','室内乐'],
 ['Brahms - Piano quartet Gmin - 1. Allegro.ogg','勃拉姆斯 · g小调钢琴四重奏 · I','勃拉姆斯','室内乐'],
 ['Brahms - Piano quartet Gmin - 2. Allegro, ma non troppo.ogg','勃拉姆斯 · g小调钢琴四重奏 · II','勃拉姆斯','室内乐'],
 ['Brahms - Piano quartet Gmin - 3. Andante con moto.ogg','勃拉姆斯 · g小调钢琴四重奏 · III','勃拉姆斯','室内乐'],
 ['Brahms - Piano quartet Gmin - 4. Presto, Rondo alla Zingarese.ogg','勃拉姆斯 · g小调钢琴四重奏 · IV','勃拉姆斯','室内乐'],
];
const MUSIC_GROUPS=[
 ['essentials','编辑精选','', '音乐编选'],
 ['piano','钢琴 · 精品录音','Audio files of classical music for piano','钢琴'],
 ['schnabel','阿图尔·施纳贝尔 · 贝多芬',"Audio files of Beethoven's Piano Sonatas Played by Artur Schnabel",'贝多芬'],
 ['chopin','肖邦 · 夜曲','Audio files of nocturnes by Frédéric Chopin','肖邦'],
 ['ballades','肖邦 · 叙事曲','Audio files of ballades by Frédéric Chopin','肖邦'],
 ['waltzes','肖邦 · 圆舞曲','Audio files of waltzes by Frédéric Chopin','肖邦'],
 ['mazurkas','肖邦 · 玛祖卡','Audio files of mazurkas by Frédéric Chopin','肖邦'],
 ['beethoven','贝多芬 · 经典','Audio files of music by Ludwig van Beethoven','贝多芬'],
 ['sonatas','贝多芬 · 钢琴奏鸣曲','Audio files of piano music by Ludwig van Beethoven','贝多芬'],
 ['mozart','莫扎特 · 经典','Audio files of music by Wolfgang Amadeus Mozart','莫扎特'],
 ['concertos','莫扎特 · 协奏曲','Audio files of concertos by Wolfgang Amadeus Mozart','莫扎特'],
 ['symphonies','莫扎特 · 交响曲','Audio files of symphonies by Wolfgang Amadeus Mozart','莫扎特'],
 ['debussy','德彪西 · 印象主义','Audio files of music by Claude Debussy','德彪西'],
 ['chopin-all','肖邦 · 作品','Audio files of music by Frédéric Chopin','肖邦'],
 ['chopin-sonata','肖邦 · 奏鸣曲','Audio files of sonatas by Frédéric Chopin','肖邦'],
 ['piano-haydn','海顿 · 钢琴','Audio files of piano music by Joseph Haydn','海顿'],
];

// The library provides online category entry points; these are not preloaded audio files.
const EXTENDED_GROUPS = [["bach", "巴赫 · 钢琴与复调", "Audio files of music by Johann Sebastian Bach", "巴赫"], ["handel", "亨德尔 · 巴洛克", "Audio files of music by George Frideric Handel", "亨德尔"], ["vivaldi", "维瓦尔第 · 协奏曲", "Audio files of music by Antonio Vivaldi", "维瓦尔第"], ["scarlatti", "斯卡拉蒂 · 键盘奏鸣曲", "Audio files of music by Domenico Scarlatti", "斯卡拉蒂"], ["schubert", "舒伯特 · 钢琴与艺术歌曲", "Audio files of music by Franz Schubert", "舒伯特"], ["schumann", "舒曼 · 钢琴诗篇", "Audio files of music by Robert Schumann", "舒曼"], ["brahms", "勃拉姆斯 · 钢琴与交响", "Audio files of music by Johannes Brahms", "勃拉姆斯"], ["liszt", "李斯特 · 炫技钢琴", "Audio files of music by Franz Liszt", "李斯特"], ["mendelssohn", "门德尔松 · 浪漫主义", "Audio files of music by Felix Mendelssohn", "门德尔松"], ["tchaikovsky", "柴可夫斯基 · 浪漫主义", "Audio files of music by Pyotr Ilyich Tchaikovsky", "柴可夫斯基"], ["rachmaninoff", "拉赫玛尼诺夫 · 钢琴", "Audio files of music by Sergei Rachmaninoff", "拉赫玛尼诺夫"], ["scriabin", "斯克里亚宾 · 钢琴", "Audio files of music by Alexander Scriabin", "斯克里亚宾"], ["ravel", "拉威尔 · 印象主义", "Audio files of music by Maurice Ravel", "拉威尔"], ["satie", "萨蒂 · 极简钢琴", "Audio files of music by Erik Satie", "萨蒂"], ["prokofiev", "普罗科菲耶夫 · 现代", "Audio files of music by Sergei Prokofiev", "普罗科菲耶夫"], ["mahler", "马勒 · 交响曲", "Audio files of music by Gustav Mahler", "马勒"], ["dvorak", "德沃夏克 · 交响与室内乐", "Audio files of music by Antonín Dvořák", "德沃夏克"], ["grieg", "格里格 · 钢琴与协奏", "Audio files of music by Edvard Grieg", "格里格"], ["saintsaens", "圣桑 · 协奏曲", "Audio files of music by Camille Saint-Saëns", "圣桑"], ["sibelius", "西贝柳斯 · 北欧交响", "Audio files of music by Jean Sibelius", "西贝柳斯"], ["pianoconcerto", "钢琴协奏曲精选", "Audio files of piano concertos", "钢琴协奏曲"], ["chamber", "室内乐精选", "Audio files of chamber music", "室内乐"], ["concertos", "协奏曲全集", "Audio files of concertos", "协奏曲"], ["symphonic", "交响曲精选", "Audio files of symphonies", "交响曲"], ["sonatas-all", "钢琴奏鸣曲", "Audio files of piano sonatas", "奏鸣曲"], ["etudes", "练习曲（钢琴）", "Audio files of études", "练习曲"], ["piano-history", "历史钢琴录音", "Audio files of classical music by performer", "演奏名家"], ["historical", "古典音乐历史录音", "Audio files of classical music by source", "历史录音"]];

return { MUSIC_SEED, MUSIC_GROUPS, EXTENDED_GROUPS };
})();
const { EXTRA_SCORE_PACKS }=(()=>{
// Generated by the explicit scripts/enrich_*.py maintenance commands.
const EXTRA_SCORE_PACKS = [
 {
  "id": "world-1927",
  "label": "1927 世界冠军赛",
  "group": "masters",
  "section": "世界冠军赛",
  "file": "world-1927.pgn",
  "kind": "game",
  "revision": "0a32e1890bd456e6"
 },
 {
  "id": "world-1960",
  "label": "1960 塔尔—鲍特维尼克",
  "group": "masters",
  "section": "世界冠军赛",
  "file": "world-1960.pgn",
  "kind": "game",
  "revision": "c8f7f49b1fe36f16"
 },
 {
  "id": "world-1972",
  "label": "1972 菲舍尔—斯帕斯基",
  "group": "masters",
  "section": "世界冠军赛",
  "file": "world-1972.pgn",
  "kind": "game",
  "revision": "9e73d82453490868"
 },
 {
  "id": "world-1985",
  "label": "1985 卡斯帕罗夫—卡尔波夫",
  "group": "masters",
  "section": "世界冠军赛",
  "file": "world-1985.pgn",
  "kind": "game",
  "revision": "e5002ac3d876c512"
 },
 {
  "id": "world-2018",
  "label": "2018 卡尔森—卡鲁阿纳",
  "group": "masters",
  "section": "世界冠军赛",
  "file": "world-2018.pgn",
  "kind": "game",
  "revision": "d839104c1cba2727"
 },
 {
  "id": "world-2021",
  "label": "2021 卡尔森—涅波姆尼亚奇",
  "group": "masters",
  "section": "世界冠军赛",
  "file": "world-2021.pgn",
  "kind": "game",
  "revision": "e1c71406d61386a3"
 },
 {
  "id": "zurich-1953",
  "label": "1953 苏黎世候选人赛",
  "group": "masters",
  "section": "经典锦标赛",
  "file": "zurich-1953.pgn",
  "kind": "game",
  "revision": "6eb099da2b0335ff"
 },
 {
  "id": "hastings-1895",
  "label": "1895 黑斯廷斯锦标赛",
  "group": "masters",
  "section": "经典锦标赛",
  "file": "hastings-1895.pgn",
  "kind": "game",
  "revision": "a70b35291f5e8a46"
 },
 {
  "id": "cairns-2019",
  "label": "2019 凯恩斯杯精选",
  "group": "masters",
  "section": "经典锦标赛",
  "file": "cairns-2019.pgn",
  "kind": "game",
  "revision": "47bf99b1f6fb8efc"
 },
 {
  "id": "grigoriev-studies",
  "label": "格里戈里耶夫残局研究",
  "group": "training",
  "section": "残局研究",
  "file": "grigoriev-studies.pgn",
  "kind": "study",
  "revision": "f35ac1e8c16dd69c"
 },
 {
  "id": "london-master-games",
  "label": "伦敦体系示范片段",
  "group": "openings",
  "section": "示范片段",
  "file": "london-master-games.pgn",
  "kind": "line",
  "revision": "48b1e8a675cb21e7"
 },
 {
  "id": "pawn-endgames",
  "label": "经典兵残局",
  "group": "training",
  "section": "实战残局",
  "file": "pawn-endgames.pgn",
  "kind": "fragment",
  "revision": "072c487072b202de"
 },
 {
  "id": "rook-endgames",
  "label": "经典车残局",
  "group": "training",
  "section": "实战残局",
  "file": "rook-endgames.pgn",
  "kind": "fragment",
  "revision": "175ab78e198c9805"
 },
 {
  "id": "minor-endgames",
  "label": "经典轻子残局",
  "group": "training",
  "section": "实战残局",
  "file": "minor-endgames.pgn",
  "kind": "fragment",
  "revision": "6d7f3d77f5aec934"
 },
 {
  "id": "mating-classics",
  "label": "经典短局与将杀",
  "group": "training",
  "section": "战术实战",
  "file": "mating-classics.pgn",
  "kind": "game",
  "revision": "fb21c82df2913430"
 },
 {
  "id": "london-real-games",
  "label": "伦敦体系实战",
  "group": "openings",
  "section": "开局实战",
  "file": "london-real-games.pgn",
  "kind": "game",
  "revision": "a98f424754509e51"
 },
 {
  "id": "italian-real-games",
  "label": "意大利开局实战",
  "group": "openings",
  "section": "开局实战",
  "file": "italian-real-games.pgn",
  "kind": "game",
  "revision": "6070339582b4e83c"
 },
 {
  "id": "spanish-berlin-games",
  "label": "西班牙开局·柏林防御",
  "group": "openings",
  "section": "开局实战",
  "file": "spanish-berlin-games.pgn",
  "kind": "game",
  "revision": "452820f92c45d32e"
 },
 {
  "id": "sicilian-najdorf-games",
  "label": "西西里防御·纳伊多夫",
  "group": "openings",
  "section": "开局实战",
  "file": "sicilian-najdorf-games.pgn",
  "kind": "game",
  "revision": "11bb5a6d8086ef48"
 },
 {
  "id": "french-advance-games",
  "label": "法兰西防御·推进变例",
  "group": "openings",
  "section": "开局实战",
  "file": "french-advance-games.pgn",
  "kind": "game",
  "revision": "24a871377207cc46"
 },
 {
  "id": "caro-kann-games",
  "label": "卡罗康防御实战",
  "group": "openings",
  "section": "开局实战",
  "file": "caro-kann-games.pgn",
  "kind": "game",
  "revision": "4d55bdf765d76a0f"
 },
 {
  "id": "slav-exchange-games",
  "label": "斯拉夫防御·兑换变例",
  "group": "openings",
  "section": "开局实战",
  "file": "slav-exchange-games.pgn",
  "kind": "game",
  "revision": "16b7cb2e9d071f7b"
 },
 {
  "id": "petroff-games",
  "label": "俄罗斯防御实战",
  "group": "openings",
  "section": "开局实战",
  "file": "petroff-games.pgn",
  "kind": "game",
  "revision": "ab29320155528e96"
 },
 {
  "id": "vienna-games",
  "label": "维也纳开局实战",
  "group": "openings",
  "section": "开局实战",
  "file": "vienna-games.pgn",
  "kind": "game",
  "revision": "0bc44b6ae7d62e70"
 },
 {
  "id": "kasparov-career",
  "label": "卡斯帕罗夫对局",
  "group": "masters",
  "section": "世界冠军与名家",
  "file": "kasparov-career.pgn",
  "kind": "game",
  "description": "收录 PGN Mentor 本次棋手谱库中通过检查的具名、已定结果的标准棋完整主线，按年代排序；不是所有生涯对局的穷尽目录。",
  "referenceTitle": "PGN Mentor 棋手库",
  "referenceUrl": "https://www.pgnmentor.com/files.html",
  "coverage": "validated source corpus",
  "revision": "17eeb720bd3393b4"
 },
 {
  "id": "karpov-selection",
  "label": "卡尔波夫实战精选",
  "group": "masters",
  "section": "世界冠军与名家",
  "file": "karpov-selection.pgn",
  "kind": "game",
  "description": "从 PGN Mentor 棋手库按时间均匀选取 160 盘，覆盖不同阶段及胜和负结果；这是实战精选，不是官方最佳对局排名。",
  "referenceTitle": "PGN Mentor 棋手库",
  "referenceUrl": "https://www.pgnmentor.com/files.html",
  "coverage": "chronological selection",
  "revision": "ddc7361acb22ea42"
 },
 {
  "id": "capablanca-selection",
  "label": "卡帕布兰卡实战精选",
  "group": "masters",
  "section": "世界冠军与名家",
  "file": "capablanca-selection.pgn",
  "kind": "game",
  "description": "从 PGN Mentor 棋手库按时间均匀选取 160 盘，覆盖不同阶段及胜和负结果；这是实战精选，不是官方最佳对局排名。",
  "referenceTitle": "PGN Mentor 棋手库",
  "referenceUrl": "https://www.pgnmentor.com/files.html",
  "coverage": "chronological selection",
  "revision": "4ed352101b8cef82"
 },
 {
  "id": "botvinnik-selection",
  "label": "鲍特维尼克实战精选",
  "group": "masters",
  "section": "世界冠军与名家",
  "file": "botvinnik-selection.pgn",
  "kind": "game",
  "description": "从 PGN Mentor 棋手库按时间均匀选取 160 盘，覆盖不同阶段及胜和负结果；这是实战精选，不是官方最佳对局排名。",
  "referenceTitle": "PGN Mentor 棋手库",
  "referenceUrl": "https://www.pgnmentor.com/files.html",
  "coverage": "chronological selection",
  "revision": "ff51b933f426a9ff"
 },
 {
  "id": "petrosian-selection",
  "label": "彼得罗相实战精选",
  "group": "masters",
  "section": "世界冠军与名家",
  "file": "petrosian-selection.pgn",
  "kind": "game",
  "description": "从 PGN Mentor 棋手库按时间均匀选取 160 盘，覆盖不同阶段及胜和负结果；这是实战精选，不是官方最佳对局排名。",
  "referenceTitle": "PGN Mentor 棋手库",
  "referenceUrl": "https://www.pgnmentor.com/files.html",
  "coverage": "chronological selection",
  "revision": "633c6973e5f4b3f8"
 },
 {
  "id": "anand-selection",
  "label": "阿南德实战精选",
  "group": "masters",
  "section": "世界冠军与名家",
  "file": "anand-selection.pgn",
  "kind": "game",
  "description": "从 PGN Mentor 棋手库按时间均匀选取 160 盘，覆盖不同阶段及胜和负结果；这是实战精选，不是官方最佳对局排名。",
  "referenceTitle": "PGN Mentor 棋手库",
  "referenceUrl": "https://www.pgnmentor.com/files.html",
  "coverage": "chronological selection",
  "revision": "c6023cf2c32235f9"
 },
 {
  "id": "carlsen-selection",
  "label": "卡尔森实战精选",
  "group": "masters",
  "section": "世界冠军与名家",
  "file": "carlsen-selection.pgn",
  "kind": "game",
  "description": "从 PGN Mentor 棋手库按时间均匀选取 200 盘，覆盖不同阶段及胜和负结果；这是实战精选，不是官方最佳对局排名。",
  "referenceTitle": "PGN Mentor 棋手库",
  "referenceUrl": "https://www.pgnmentor.com/files.html",
  "coverage": "chronological selection",
  "revision": "27770e1e688ee49a"
 },
 {
  "id": "judit-polgar-selection",
  "label": "尤迪特·波尔加实战精选",
  "group": "masters",
  "section": "世界冠军与名家",
  "file": "judit-polgar-selection.pgn",
  "kind": "game",
  "description": "从 PGN Mentor 棋手库按时间均匀选取 120 盘，覆盖不同阶段及胜和负结果；这是实战精选，不是官方最佳对局排名。",
  "referenceTitle": "PGN Mentor 棋手库",
  "referenceUrl": "https://www.pgnmentor.com/files.html",
  "coverage": "chronological selection",
  "revision": "4daeae592a228d0d"
 },
 {
  "id": "hou-yifan-selection",
  "label": "侯逸凡实战精选",
  "group": "masters",
  "section": "世界冠军与名家",
  "file": "hou-yifan-selection.pgn",
  "kind": "game",
  "description": "从 PGN Mentor 棋手库按时间均匀选取 120 盘，覆盖不同阶段及胜和负结果；这是实战精选，不是官方最佳对局排名。",
  "referenceTitle": "PGN Mentor 棋手库",
  "referenceUrl": "https://www.pgnmentor.com/files.html",
  "coverage": "chronological selection",
  "revision": "9bd7989791a409ee"
 },
 {
  "id": "ding-liren-selection",
  "label": "丁立人实战精选",
  "group": "masters",
  "section": "世界冠军与名家",
  "file": "ding-liren-selection.pgn",
  "kind": "game",
  "description": "从 PGN Mentor 棋手库按时间均匀选取 160 盘，覆盖不同阶段及胜和负结果；这是实战精选，不是官方最佳对局排名。",
  "referenceTitle": "PGN Mentor 棋手库",
  "referenceUrl": "https://www.pgnmentor.com/files.html",
  "coverage": "chronological selection",
  "revision": "c9caf5ed5a0c7ba5"
 },
 {
  "id": "capablanca-fundamentals",
  "label": "卡帕布兰卡·国际象棋基础",
  "group": "training",
  "section": "经典教材·循序渐进",
  "file": "capablanca-fundamentals.pgn",
  "kind": "course",
  "description": "按公开整理版的 81 章顺序学习基本将杀、兵残局、子力配合、中局战略及 14 盘范局。保留整理版的 65 A／65 B 等编号；仅提供局面和参考主线，不等同于原书完整注释或所有分支。",
  "referenceTitle": "Capablanca · Chess Fundamentals（公开原书）",
  "referenceUrl": "https://www.gutenberg.org/ebooks/33870",
  "coverage": "all 81 chapters of the two linked public study exports",
  "revision": "c47e8f1ea97276e6"
 },
 {
  "id": "practice-fork",
  "label": "双重攻击 · 分级练习",
  "group": "training",
  "section": "战术·基本手段",
  "file": "practice-fork.pgn",
  "kind": "puzzle",
  "description": "寻找能同时制造两个威胁的着法。 按题目等级分从低到高练习；先独立计算，再用着法记录和本地分析核对。参考线不是所有合法解法的穷尽。",
  "referenceTitle": "Lichess CC0 题库与主题体系",
  "referenceUrl": "https://database.lichess.org/#puzzles",
  "coverage": "graded curated subset",
  "revision": "9847b3c0fd70e629"
 },
 {
  "id": "practice-pin",
  "label": "牵制 · 分级练习",
  "group": "training",
  "section": "战术·基本手段",
  "file": "practice-pin.pgn",
  "kind": "puzzle",
  "description": "利用被牵制的棋子不能自由移动这一限制。 按题目等级分从低到高练习；先独立计算，再用着法记录和本地分析核对。参考线不是所有合法解法的穷尽。",
  "referenceTitle": "Lichess CC0 题库与主题体系",
  "referenceUrl": "https://database.lichess.org/#puzzles",
  "coverage": "graded curated subset",
  "revision": "d169361509a38871"
 },
 {
  "id": "practice-skewer",
  "label": "串击 · 分级练习",
  "group": "training",
  "section": "战术·基本手段",
  "file": "practice-skewer.pgn",
  "kind": "puzzle",
  "description": "先攻击前方重要棋子，再获得其后的目标。 按题目等级分从低到高练习；先独立计算，再用着法记录和本地分析核对。参考线不是所有合法解法的穷尽。",
  "referenceTitle": "Lichess CC0 题库与主题体系",
  "referenceUrl": "https://database.lichess.org/#puzzles",
  "coverage": "graded curated subset",
  "revision": "3777200cd2b2cd02"
 },
 {
  "id": "practice-discoveredattack",
  "label": "闪击 · 分级练习",
  "group": "training",
  "section": "战术·基本手段",
  "file": "practice-discoveredattack.pgn",
  "kind": "puzzle",
  "description": "移开遮挡棋子，释放后方棋子的攻击。 按题目等级分从低到高练习；先独立计算，再用着法记录和本地分析核对。参考线不是所有合法解法的穷尽。",
  "referenceTitle": "Lichess CC0 题库与主题体系",
  "referenceUrl": "https://database.lichess.org/#puzzles",
  "coverage": "graded curated subset",
  "revision": "376a27747cf364a2"
 },
 {
  "id": "practice-doublecheck",
  "label": "双将 · 分级练习",
  "group": "training",
  "section": "战术·基本手段",
  "file": "practice-doublecheck.pgn",
  "kind": "puzzle",
  "description": "计算两个棋子同时将军时王的应对。 按题目等级分从低到高练习；先独立计算，再用着法记录和本地分析核对。参考线不是所有合法解法的穷尽。",
  "referenceTitle": "Lichess CC0 题库与主题体系",
  "referenceUrl": "https://database.lichess.org/#puzzles",
  "coverage": "graded curated subset",
  "revision": "4d02cca4c0fa3aba"
 },
 {
  "id": "practice-capturingdefender",
  "label": "消除防守 · 分级练习",
  "group": "training",
  "section": "战术·组合计算",
  "file": "practice-capturingdefender.pgn",
  "kind": "puzzle",
  "description": "先处理关键防守子，再兑现后续威胁。 按题目等级分从低到高练习；先独立计算，再用着法记录和本地分析核对。参考线不是所有合法解法的穷尽。",
  "referenceTitle": "Lichess CC0 题库与主题体系",
  "referenceUrl": "https://database.lichess.org/#puzzles",
  "coverage": "graded curated subset",
  "revision": "80dba18d20c95bb6"
 },
 {
  "id": "practice-deflection",
  "label": "引离 · 分级练习",
  "group": "training",
  "section": "战术·组合计算",
  "file": "practice-deflection.pgn",
  "kind": "puzzle",
  "description": "迫使防守子离开必须守住的线路或格子。 按题目等级分从低到高练习；先独立计算，再用着法记录和本地分析核对。参考线不是所有合法解法的穷尽。",
  "referenceTitle": "Lichess CC0 题库与主题体系",
  "referenceUrl": "https://database.lichess.org/#puzzles",
  "coverage": "graded curated subset",
  "revision": "510e7928a69292c3"
 },
 {
  "id": "practice-attraction",
  "label": "引入 · 分级练习",
  "group": "training",
  "section": "战术·组合计算",
  "file": "practice-attraction.pgn",
  "kind": "puzzle",
  "description": "把对方关键棋子吸引到有利于组合的位置。 按题目等级分从低到高练习；先独立计算，再用着法记录和本地分析核对。参考线不是所有合法解法的穷尽。",
  "referenceTitle": "Lichess CC0 题库与主题体系",
  "referenceUrl": "https://database.lichess.org/#puzzles",
  "coverage": "graded curated subset",
  "revision": "9f1e675f953786ae"
 },
 {
  "id": "practice-interference",
  "label": "截断 · 分级练习",
  "group": "training",
  "section": "战术·组合计算",
  "file": "practice-interference.pgn",
  "kind": "puzzle",
  "description": "通过占据关键格切断对手棋子的联系。 按题目等级分从低到高练习；先独立计算，再用着法记录和本地分析核对。参考线不是所有合法解法的穷尽。",
  "referenceTitle": "Lichess CC0 题库与主题体系",
  "referenceUrl": "https://database.lichess.org/#puzzles",
  "coverage": "graded curated subset",
  "revision": "70b8c769eb10a4ab"
 },
 {
  "id": "practice-clearance",
  "label": "腾挪 · 分级练习",
  "group": "training",
  "section": "战术·组合计算",
  "file": "practice-clearance.pgn",
  "kind": "puzzle",
  "description": "让出关键线路或格子，给后续行动创造空间。 按题目等级分从低到高练习；先独立计算，再用着法记录和本地分析核对。参考线不是所有合法解法的穷尽。",
  "referenceTitle": "Lichess CC0 题库与主题体系",
  "referenceUrl": "https://database.lichess.org/#puzzles",
  "coverage": "graded curated subset",
  "revision": "4d4699f2cb2a9158"
 },
 {
  "id": "practice-intermezzo",
  "label": "中间着 · 分级练习",
  "group": "training",
  "section": "战术·组合计算",
  "file": "practice-intermezzo.pgn",
  "kind": "puzzle",
  "description": "先检查是否有比立即回应更强的插入着法。 按题目等级分从低到高练习；先独立计算，再用着法记录和本地分析核对。参考线不是所有合法解法的穷尽。",
  "referenceTitle": "Lichess CC0 题库与主题体系",
  "referenceUrl": "https://database.lichess.org/#puzzles",
  "coverage": "graded curated subset",
  "revision": "5e34c9c315947a3c"
 },
 {
  "id": "practice-quietmove",
  "label": "静着 · 分级练习",
  "group": "training",
  "section": "战术·组合计算",
  "file": "practice-quietmove.pgn",
  "kind": "puzzle",
  "description": "寻找不将军、不立即吃子但建立强制威胁的着法。 按题目等级分从低到高练习；先独立计算，再用着法记录和本地分析核对。参考线不是所有合法解法的穷尽。",
  "referenceTitle": "Lichess CC0 题库与主题体系",
  "referenceUrl": "https://database.lichess.org/#puzzles",
  "coverage": "graded curated subset",
  "revision": "3f417190d8abc650"
 },
 {
  "id": "practice-defensivemove",
  "label": "防守与解围 · 分级练习",
  "group": "training",
  "section": "战术·组合计算",
  "file": "practice-defensivemove.pgn",
  "kind": "puzzle",
  "description": "先识别对方威胁，再寻找准确的应对资源。 按题目等级分从低到高练习；先独立计算，再用着法记录和本地分析核对。参考线不是所有合法解法的穷尽。",
  "referenceTitle": "Lichess CC0 题库与主题体系",
  "referenceUrl": "https://database.lichess.org/#puzzles",
  "coverage": "graded curated subset",
  "revision": "5a114c97a9e9a850"
 },
 {
  "id": "practice-backrankmate",
  "label": "底线将杀 · 分级练习",
  "group": "training",
  "section": "将杀模式",
  "file": "practice-backrankmate.pgn",
  "kind": "puzzle",
  "description": "检查底线上的王是否缺少逃生格。 按题目等级分从低到高练习；先独立计算，再用着法记录和本地分析核对。参考线不是所有合法解法的穷尽。",
  "referenceTitle": "Lichess CC0 题库与主题体系",
  "referenceUrl": "https://database.lichess.org/#puzzles",
  "coverage": "graded curated subset",
  "revision": "60496115efdabd90"
 },
 {
  "id": "practice-smotheredmate",
  "label": "闷杀 · 分级练习",
  "group": "training",
  "section": "将杀模式",
  "file": "practice-smotheredmate.pgn",
  "kind": "puzzle",
  "description": "利用对方自己的棋子封住王的退路。 按题目等级分从低到高练习；先独立计算，再用着法记录和本地分析核对。参考线不是所有合法解法的穷尽。",
  "referenceTitle": "Lichess CC0 题库与主题体系",
  "referenceUrl": "https://database.lichess.org/#puzzles",
  "coverage": "graded curated subset",
  "revision": "a096157c16e7edac"
 },
 {
  "id": "practice-matein1",
  "label": "一步将杀 · 分级练习",
  "group": "training",
  "section": "将杀模式",
  "file": "practice-matein1.pgn",
  "kind": "puzzle",
  "description": "在所有合法将军中找出立即将死的一着。 按题目等级分从低到高练习；先独立计算，再用着法记录和本地分析核对。参考线不是所有合法解法的穷尽。",
  "referenceTitle": "Lichess CC0 题库与主题体系",
  "referenceUrl": "https://database.lichess.org/#puzzles",
  "coverage": "graded curated subset",
  "revision": "a62b36070c71ba7d"
 },
 {
  "id": "practice-matein2",
  "label": "两步将杀 · 分级练习",
  "group": "training",
  "section": "将杀模式",
  "file": "practice-matein2.pgn",
  "kind": "puzzle",
  "description": "计算首着及对方应手，完成强制将杀。 按题目等级分从低到高练习；先独立计算，再用着法记录和本地分析核对。参考线不是所有合法解法的穷尽。",
  "referenceTitle": "Lichess CC0 题库与主题体系",
  "referenceUrl": "https://database.lichess.org/#puzzles",
  "coverage": "graded curated subset",
  "revision": "35ee2101c99bcedc"
 },
 {
  "id": "practice-matein3",
  "label": "三步将杀 · 分级练习",
  "group": "training",
  "section": "将杀模式",
  "file": "practice-matein3.pgn",
  "kind": "puzzle",
  "description": "把强制将军、封锁退路和最后一击连成变化。 按题目等级分从低到高练习；先独立计算，再用着法记录和本地分析核对。参考线不是所有合法解法的穷尽。",
  "referenceTitle": "Lichess CC0 题库与主题体系",
  "referenceUrl": "https://database.lichess.org/#puzzles",
  "coverage": "graded curated subset",
  "revision": "5a1b0147bae5566a"
 },
 {
  "id": "practice-promotion",
  "label": "升变突破 · 分级练习",
  "group": "training",
  "section": "残局·计算与技术",
  "file": "practice-promotion.pgn",
  "kind": "puzzle",
  "description": "比较兵的推进、护送和升变后的威胁。 按题目等级分从低到高练习；先独立计算，再用着法记录和本地分析核对。参考线不是所有合法解法的穷尽。",
  "referenceTitle": "Lichess CC0 题库与主题体系",
  "referenceUrl": "https://database.lichess.org/#puzzles",
  "coverage": "graded curated subset",
  "revision": "f94686943900e78f"
 },
 {
  "id": "practice-underpromotion",
  "label": "弱升变 · 分级练习",
  "group": "training",
  "section": "残局·计算与技术",
  "file": "practice-underpromotion.pgn",
  "kind": "puzzle",
  "description": "考虑升为车、象或马的特殊作用。 按题目等级分从低到高练习；先独立计算，再用着法记录和本地分析核对。参考线不是所有合法解法的穷尽。",
  "referenceTitle": "Lichess CC0 题库与主题体系",
  "referenceUrl": "https://database.lichess.org/#puzzles",
  "coverage": "graded curated subset",
  "revision": "e988a42faee7305c"
 },
 {
  "id": "practice-zugzwang",
  "label": "等着与楚茨文克 · 分级练习",
  "group": "training",
  "section": "残局·计算与技术",
  "file": "practice-zugzwang.pgn",
  "kind": "puzzle",
  "description": "寻找把不利走棋义务交给对手的方法。 按题目等级分从低到高练习；先独立计算，再用着法记录和本地分析核对。参考线不是所有合法解法的穷尽。",
  "referenceTitle": "Lichess CC0 题库与主题体系",
  "referenceUrl": "https://database.lichess.org/#puzzles",
  "coverage": "graded curated subset",
  "revision": "126710d390814c3e"
 },
 {
  "id": "practice-pawnendgame",
  "label": "兵残局计算 · 分级练习",
  "group": "training",
  "section": "残局·计算与技术",
  "file": "practice-pawnendgame.pgn",
  "kind": "puzzle",
  "description": "结合王的活动、兵的推进和节奏计算结果。 按题目等级分从低到高练习；先独立计算，再用着法记录和本地分析核对。参考线不是所有合法解法的穷尽。",
  "referenceTitle": "Lichess CC0 题库与主题体系",
  "referenceUrl": "https://database.lichess.org/#puzzles",
  "coverage": "graded curated subset",
  "revision": "a30560387ace5797"
 },
 {
  "id": "practice-rookendgame",
  "label": "车残局计算 · 分级练习",
  "group": "training",
  "section": "残局·计算与技术",
  "file": "practice-rookendgame.pgn",
  "kind": "puzzle",
  "description": "比较车的活跃程度、王的位置和通路兵。 按题目等级分从低到高练习；先独立计算，再用着法记录和本地分析核对。参考线不是所有合法解法的穷尽。",
  "referenceTitle": "Lichess CC0 题库与主题体系",
  "referenceUrl": "https://database.lichess.org/#puzzles",
  "coverage": "graded curated subset",
  "revision": "515cebc40c5e3b6c"
 },
 {
  "id": "practice-bishopendgame",
  "label": "象残局计算 · 分级练习",
  "group": "training",
  "section": "残局·计算与技术",
  "file": "practice-bishopendgame.pgn",
  "kind": "puzzle",
  "description": "结合色格、兵形和象的远程作用寻找变化。 按题目等级分从低到高练习；先独立计算，再用着法记录和本地分析核对。参考线不是所有合法解法的穷尽。",
  "referenceTitle": "Lichess CC0 题库与主题体系",
  "referenceUrl": "https://database.lichess.org/#puzzles",
  "coverage": "graded curated subset",
  "revision": "759a401256908641"
 },
 {
  "id": "practice-knightendgame",
  "label": "马残局计算 · 分级练习",
  "group": "training",
  "section": "残局·计算与技术",
  "file": "practice-knightendgame.pgn",
  "kind": "puzzle",
  "description": "检查马的跳跃、叉击及兵的推进节奏。 按题目等级分从低到高练习；先独立计算，再用着法记录和本地分析核对。参考线不是所有合法解法的穷尽。",
  "referenceTitle": "Lichess CC0 题库与主题体系",
  "referenceUrl": "https://database.lichess.org/#puzzles",
  "coverage": "graded curated subset",
  "revision": "0363db0042fd193e"
 },
 {
  "id": "practice-queenendgame",
  "label": "后残局计算 · 分级练习",
  "group": "training",
  "section": "残局·计算与技术",
  "file": "practice-queenendgame.pgn",
  "kind": "puzzle",
  "description": "重点计算将军、王的安全与通路兵。 按题目等级分从低到高练习；先独立计算，再用着法记录和本地分析核对。参考线不是所有合法解法的穷尽。",
  "referenceTitle": "Lichess CC0 题库与主题体系",
  "referenceUrl": "https://database.lichess.org/#puzzles",
  "coverage": "graded curated subset",
  "revision": "e20f2d28e0cfae22"
 }
];

return { EXTRA_SCORE_PACKS };
})();
const { SCORE_PACKS, PACK_GROUPS, VIRTUAL_PACKS, ALL_PACKS, scorePackName, scoreCategory, scoreInCollection, personalPackName }=(()=>{

// 本地内置棋谱合集。文件位于 data/complete/，打开页面后即可阅读，无需逐个载入。
const SCORE_PACKS = [
 ...EXTRA_SCORE_PACKS.filter(p=>p.id==='kasparov-career'),
 {id:'morphy-anderssen',label:'莫菲与安德森',group:'masters',file:'morphy-anderssen.pgn'},
 {id:'fischer',label:'菲舍尔名局',group:'masters',file:'fischer.pgn'},
 {id:'tal',label:'塔尔名局',group:'masters',file:'tal.pgn'},
 {id:'alekhine',label:'阿廖欣名局',group:'masters',file:'alekhine.pgn',revision:'20261026'},
 {id:'capablanca-1924',label:'卡帕布兰卡（纽约1924）',group:'masters',file:'capablanca-1924.pgn'},
 {id:'chess-classics',label:'世界名局',group:'masters',section:'名局选集',file:'chess-classics.pgn',revision:'20261026'},
 {id:'book-of-favorites',label:'名局佳作',group:'masters',section:'名局选集',file:'book-of-favorites.pgn'},
 {id:'instructive',label:'经典教学对局',group:'training',section:'教学实战',file:'instructive.pgn'},
 {id:'logical-chess',label:'逻辑棋谱',group:'training',section:'教学实战',file:'logical-chess.pgn'},
 ...EXTRA_SCORE_PACKS.filter(p=>p.id!=='kasparov-career')
];
const VIRTUAL_PACKS = [
 {id:'openings',label:'开局示范',group:'openings'},
 {id:'tactics',label:'战术范例',group:'training',section:'主题练习'},
 {id:'endings',label:'残局练习',group:'training',section:'主题练习'}
];
const PACK_GROUPS = [
 {id:'openings',label:'开局学习',allLabel:'全部开局'},
 {id:'masters',label:'大师对局',allLabel:'全部大师对局'},
 {id:'training',label:'专题训练',allLabel:'全部训练'},
 {id:'mine',label:'我的棋谱',allLabel:'全部我的棋谱'}
];
const ALL_PACKS = [...VIRTUAL_PACKS, ...SCORE_PACKS];

// Provenance takes priority over subject: an imported master game is still the user's score.
function personalPackName(label){return !label||['导入','我的保存','我的棋谱'].includes(label)?'我的棋谱':label;}
function scorePackName(score){
 const origin=String(score.origin||'');
 if(/^(?:import|save)-/.test(String(score.id||'')))return personalPackName(origin);
 if(origin==='开局示范'||origin==='开局主线')return '开局示范';
 if(origin==='残局练习'||origin==='战术范例')return origin;
 return origin.replace(/\s*·\s*公开\s*(棋谱|PGN)$/,'').replace(/^大师实战$/,'大师名局').replace(/^内置经典实战$/,'世界名局').replace(/^Lichess CC0\s*·\s*开局谱系$/,'开局示范').replace(/^课程$/,'开局示范')||'大师对局';
}
function scoreCategory(score){
 const id=String(score.id||'');
 if(/^(?:import|save)-/.test(id))return 'mine';
 const pack=ALL_PACKS.find(p=>p.label===scorePackName(score));
 if(pack)return pack.group;
 if(score.stage==='开局')return 'openings';
 if(['中局','残局'].includes(score.stage))return 'training';
 return id.startsWith('complete-')||score.stage==='实战'?'masters':'training';
}
function scoreInCollection(score,category,packId='*',starred=false){
 if(category==='mine'){
  if(packId==='mine:starred')return starred;
  if(packId==='*')return scoreCategory(score)==='mine'||starred;
 }
 if(scoreCategory(score)!==category)return false;
 if(packId==='*')return true;
 const pack=ALL_PACKS.find(p=>p.id===packId);
 const rawLabel=pack?pack.label:packId.replace(/^(?:mine|extra|legacy):/,'');
 const label=category==='mine'?personalPackName(rawLabel):rawLabel;
 return scorePackName(score)===label;
}

return { SCORE_PACKS, PACK_GROUPS, VIRTUAL_PACKS, ALL_PACKS, scorePackName, scoreCategory, scoreInCollection, personalPackName };
})();
const { setupLogoEasterEgg }=(()=>{
// Decorative SVG assets stay local and follow the existing UI's reduced-motion setting.
function setupLogoEasterEgg(){
 const logo=document.querySelector('#home'),wrap=document.querySelector('.brand-wrap');
 if(!logo||!wrap)return;
 const decoration=document.createElement('span');
 decoration.className='brand-surprises';decoration.id='brand-surprises';decoration.setAttribute('aria-hidden','true');
 decoration.dataset.visible='false';
 decoration.innerHTML=`<span class="logo-surprise logo-orange" hidden><svg viewBox="0 0 44 44" focusable="false"><path d="M23 12c0-5 1-8 4-10" fill="none" stroke="#6f6940" stroke-width="2" stroke-linecap="round"/><path d="M24 9C28 1 36 3 38 6c-3 6-10 7-14 3Z" fill="#70965d"/><path d="M23 13C8 7 2 19 7 32c5 13 25 13 31-1 5-13-2-23-15-18Z" fill="#ef952f"/><path d="M23 13c-8-3-15 1-16 10-2 11 6 18 16 18 9 0 15-6 16-14-5 13-25 13-29 1-2-7 4-13 13-15Z" fill="#dc7e25" opacity=".48"/><path d="M12 20c1-3 3-5 6-5" fill="none" stroke="#ffe0a2" stroke-width="2.4" stroke-linecap="round" opacity=".85"/><g fill="#c87328" opacity=".45"><circle cx="28" cy="22" r=".8"/><circle cx="32" cy="28" r=".7"/><circle cx="25" cy="34" r=".8"/><circle cx="18" cy="29" r=".7"/><circle cx="15" cy="34" r=".6"/></g></svg></span>
 <span class="logo-surprise logo-jasmine" hidden><svg viewBox="0 0 48 48" focusable="false"><path d="M23 30c1 5 4 9 5 15" fill="none" stroke="#719365" stroke-width="2" stroke-linecap="round"/><path d="M26 38c-2-7-10-8-13-6 1 7 7 10 13 6Z" fill="#8ba676"/><path d="M27 39c1-7 7-10 12-8-1 7-6 10-12 8Z" fill="#6f9567"/><g fill="#fffdf6" stroke="#d9d6bf" stroke-width=".8"><ellipse cx="24" cy="15" rx="6" ry="11"/><ellipse cx="24" cy="15" rx="6" ry="11" transform="rotate(60 24 23)"/><ellipse cx="24" cy="15" rx="6" ry="11" transform="rotate(120 24 23)"/><ellipse cx="24" cy="15" rx="6" ry="11" transform="rotate(180 24 23)"/><ellipse cx="24" cy="15" rx="6" ry="11" transform="rotate(240 24 23)"/><ellipse cx="24" cy="15" rx="6" ry="11" transform="rotate(300 24 23)"/></g><g fill="#fffefb" stroke="#e6e1cd" stroke-width=".7"><ellipse cx="24" cy="19" rx="3.8" ry="6.6" transform="rotate(30 24 23)"/><ellipse cx="24" cy="19" rx="3.8" ry="6.6" transform="rotate(120 24 23)"/><ellipse cx="24" cy="19" rx="3.8" ry="6.6" transform="rotate(210 24 23)"/><ellipse cx="24" cy="19" rx="3.8" ry="6.6" transform="rotate(300 24 23)"/></g><circle cx="24" cy="23" r="2.1" fill="#ddc873"/></svg></span>`;
 wrap.append(decoration);
 const orange=decoration.querySelector('.logo-orange'),jasmine=decoration.querySelector('.logo-jasmine');
 let count=0,lastTap=-Infinity,expiresAt=0,timer=null,cycle=0,closing=[];
 function hide(){
  orange.hidden=true;jasmine.hidden=true;decoration.dataset.visible='false';
  wrap.classList.remove('has-surprise');count=0;lastTap=-Infinity;expiresAt=0;
  clearTimeout(timer);cycle++;for(const animation of closing)animation.cancel();closing=[];
 }
 function scheduleRetraction(now){
  const token=++cycle;
  for(const animation of closing)animation.cancel();closing=[];clearTimeout(timer);
  const duration=matchMedia('(prefers-reduced-motion: reduce)').matches?0:300;
  const delay=Math.max(0,expiresAt-now),start=document.timeline.currentTime;
  // Schedule on the animation timeline now, rather than waiting for a future input or timer to start it.
  for(const element of [orange,jasmine].filter(el=>!el.hidden)){
   const animation=element.animate([{opacity:1,transform:'translateX(0) scale(1)'},{opacity:0,transform:'translateX(-14px) scale(.65)'}],{delay,duration,easing:'cubic-bezier(.8,-.2,.8,.2)',fill:'forwards'});
   if(start!==null)animation.startTime=start;
   closing.push(animation);
  }
  Promise.all(closing.map(animation=>animation.finished)).then(()=>{if(token===cycle)hide();}).catch(()=>{});
  // Cleanup fallback; the visual exit above can finish on the compositor without a click.
  timer=setTimeout(()=>{if(token===cycle)hide();},delay+duration+40);
 }
 function tap(){
  const now=Date.now(),tapTime=performance.now();
  if(expiresAt&&now>expiresAt+400)hide();
  if(tapTime-lastTap>1400)count=0;
  lastTap=tapTime;count++;
  if(count>=6){orange.hidden=false;decoration.dataset.visible='true';wrap.classList.add('has-surprise');}
  if(count>=12)jasmine.hidden=false;
  if(!orange.hidden){
   expiresAt=Math.max(expiresAt,now+5000);
   if(count>12)expiresAt=Math.min(now+10000,expiresAt+350);
   scheduleRetraction(now);
  }
 }
 logo.addEventListener('click',tap);
 window.addEventListener('pagehide',()=>{clearTimeout(timer);hide();});
}

return { setupLogoEasterEgg };
})();
const { readStarredScores, writeStarredScores }=(()=>{
const STAR_KEY='ChessAtelierStarredScoresV1';
function readStarredScores(storage){
 try{const ids=JSON.parse(storage.getItem(STAR_KEY)||'[]');return new Set(Array.isArray(ids)?ids.filter(id=>typeof id==='string'):[]);}catch{return new Set();}
}
function writeStarredScores(storage,ids){storage.setItem(STAR_KEY,JSON.stringify([...ids]));}

return { readStarredScores, writeStarredScores };
})();
const { LOCAL_MUSIC }=(()=>{
const LOCAL_MUSIC = [{"file": "baroque-01.mp3", "title": "巴赫 · 三部创意曲 No.1，BWV 787", "composer": "巴赫", "era": "baroque", "performer": "Randolph Hokanson", "credit": "Randolph Hokanson; Al Goldstein collection, Pandora Music / ibiblio.org", "license": "CC BY-SA 2.0", "licenseUrl": "https://creativecommons.org/licenses/by-sa/2.0", "sourceUrl": "https://commons.wikimedia.org/wiki/File:Bach_Sinfonien01.ogg", "originalFile": "Bach Sinfonien01.ogg", "downloadUrl": "https://upload.wikimedia.org/wikipedia/commons/a/a9/Bach_Sinfonien01.ogg", "duration": 76.65, "bytes": 920703, "sha256": "c051433e3841d53784ee5c883555f251ebd9ff4a4472e8e1107752e548f120fb", "originalBytes": 1358960, "originalSha256": "d8ae7518f90781279b888165b95e666eb31aed5c273d70a15da9d8de5f8902db", "commonsSha1": "c416f652e2114dc7f8763c72310c0b5e612e1d04", "commonsPageId": 2893368, "commonsRevisionId": 1227002104, "changeNote": "Transcoded from the original recording to MP3, stereo 44.1 kHz / 96 kbit/s; complete recording, no cuts or musical edits.", "fetchedAt": "2026-10-26T03:08:28.472360+00:00", "licenseId": "CC-BY-SA-2.0"}, {"file": "baroque-02.mp3", "title": "巴赫 · 三部创意曲 No.2，BWV 788", "composer": "巴赫", "era": "baroque", "performer": "Randolph Hokanson", "credit": "Randolph Hokanson; Al Goldstein collection, Pandora Music / ibiblio.org", "license": "CC BY-SA 2.0", "licenseUrl": "https://creativecommons.org/licenses/by-sa/2.0", "sourceUrl": "https://commons.wikimedia.org/wiki/File:Bach_Sinfonien02.ogg", "originalFile": "Bach Sinfonien02.ogg", "downloadUrl": "https://upload.wikimedia.org/wikipedia/commons/4/44/Bach_Sinfonien02.ogg", "duration": 110.87, "bytes": 1331348, "sha256": "e5915d6db7f294fcab6cbec3d60d8a4969dcb982544a3bb0147f7dbe11ec005c", "originalBytes": 1971330, "originalSha256": "38b5d94cd897758ac77601c0e2a0b46dc08e1f0e9bd4a3dab9a8b55489a26225", "commonsSha1": "8d54323638aebfaa3f46bd8dc710c998defacc74", "commonsPageId": 2893377, "commonsRevisionId": 1227002113, "changeNote": "Transcoded from the original recording to MP3, stereo 44.1 kHz / 96 kbit/s; complete recording, no cuts or musical edits.", "fetchedAt": "2026-10-26T03:08:28.472360+00:00", "licenseId": "CC-BY-SA-2.0"}, {"file": "baroque-03.mp3", "title": "维瓦尔第 · 四季《春》第二乐章", "composer": "维瓦尔第", "era": "baroque", "performer": "John Harrison；Robert Turizziani；Wichita State University Chamber Players", "credit": "Recording copyright John Harrison; violin John Harrison, conductor Robert Turizziani, Wichita State University Chamber Players", "license": "CC BY-SA 4.0", "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/deed.en", "sourceUrl": "https://commons.wikimedia.org/wiki/File:Vivaldi_-_Four_Seasons_1_Spring_mvt_2_Largo_-_John_Harrison_violin.oga", "originalFile": "Vivaldi - Four Seasons 1 Spring mvt 2 Largo - John Harrison violin.oga", "downloadUrl": "https://upload.wikimedia.org/wikipedia/commons/9/9f/Vivaldi_-_Four_Seasons_1_Spring_mvt_2_Largo_-_John_Harrison_violin.oga", "duration": 171.64, "bytes": 2060478, "sha256": "a61c0768996a173ae0063b44b3c1bc72ac69b30303c144986d0bfa14f694443f", "originalBytes": 3288210, "originalSha256": "6cbca92e88c875f5ad1fa49480d83dac44138538a2c1f565462609f0cc071bc7", "commonsSha1": "372b38ce78af5fb8bc1b4b7de9c05e6f698255ac", "commonsPageId": 81855, "commonsRevisionId": 859454774, "changeNote": "Transcoded from the original recording to MP3, stereo 44.1 kHz / 96 kbit/s; complete recording, no cuts or musical edits.", "fetchedAt": "2026-10-26T03:08:28.472360+00:00", "licenseId": "CC-BY-SA-4.0"}, {"file": "baroque-04.mp3", "title": "维瓦尔第 · 四季《夏》第三乐章", "composer": "维瓦尔第", "era": "baroque", "performer": "John Harrison；Robert Turizziani；Wichita State University Chamber Players", "credit": "Recording copyright John Harrison; violin John Harrison, conductor Robert Turizziani, Wichita State University Chamber Players", "license": "CC BY-SA 4.0", "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0/deed.en", "sourceUrl": "https://commons.wikimedia.org/wiki/File:Vivaldi_-_Four_Seasons_2_Summer_mvt_3_Presto_-_John_Harrison_violin.oga", "originalFile": "Vivaldi - Four Seasons 2 Summer mvt 3 Presto - John Harrison violin.oga", "downloadUrl": "https://upload.wikimedia.org/wikipedia/commons/f/fa/Vivaldi_-_Four_Seasons_2_Summer_mvt_3_Presto_-_John_Harrison_violin.oga", "duration": 158.96, "bytes": 1908445, "sha256": "a788a4e836b076922a26aea8b73ad799b811804407c6e7d9446fa88052dd167f", "originalBytes": 3009285, "originalSha256": "93017216c1967d288f4840861d300e3ff3047ff5df67d97e56ca82c1f24aadc8", "commonsSha1": "502ad0e427100729c11d4387a924130c31b35a66", "commonsPageId": 81931, "commonsRevisionId": 859454953, "changeNote": "Transcoded from the original recording to MP3, stereo 44.1 kHz / 96 kbit/s; complete recording, no cuts or musical edits.", "fetchedAt": "2026-10-26T03:08:28.472360+00:00", "licenseId": "CC-BY-SA-4.0"}, {"file": "classical-05.mp3", "title": "莫扎特 · 降E大调嬉游曲 K.113 第一乐章", "composer": "莫扎特", "era": "classical", "performer": "Tsumugi Orchestra；Takashi Inoue", "credit": "The Tsumugi Orchestra, conducted by Takashi Inoue; recorded 15 August 2010, Fukuoka City Children’s Science and Culture Center Hall", "license": "CC BY 3.0", "licenseUrl": "https://creativecommons.org/licenses/by/3.0", "sourceUrl": "https://commons.wikimedia.org/wiki/File:Divertimento_in_E-flat_major_-_KV_113_-_1st_movement.oga", "originalFile": "Divertimento in E-flat major - KV 113 - 1st movement.oga", "downloadUrl": "https://upload.wikimedia.org/wikipedia/commons/e/e1/Divertimento_in_E-flat_major_-_KV_113_-_1st_movement.oga", "duration": 195.33, "bytes": 2344795, "sha256": "292dee135031dd1ea808d039eb35384bcc4a247f7fe81e4111e3e5d215c2bfe3", "originalBytes": 3632522, "originalSha256": "f11d69999c34214ed196154dba7f75346e978372fcff4faa31a0a03c432693c1", "commonsSha1": "debd4737e3bd562c7ebb9140f55716ce19f1508e", "commonsPageId": 22479217, "commonsRevisionId": 1069945948, "changeNote": "Transcoded from the original recording to MP3, stereo 44.1 kHz / 96 kbit/s; complete recording, no cuts or musical edits.", "fetchedAt": "2026-10-26T03:08:28.472360+00:00", "licenseId": "CC-BY-3.0"}, {"file": "classical-06.mp3", "title": "莫扎特 · F大调嬉游曲 K.138 第一乐章", "composer": "莫扎特", "era": "classical", "performer": "Tsumugi Orchestra；Takashi Inoue", "credit": "The Tsumugi Orchestra, conducted by Takashi Inoue; recorded 15 August 2010, Fukuoka City Children’s Science and Culture Center Hall", "license": "CC BY 3.0", "licenseUrl": "https://creativecommons.org/licenses/by/3.0", "sourceUrl": "https://commons.wikimedia.org/wiki/File:Divertimento_in_F_major%2C_K._138_%28125c%29_-_1st_movement.oga", "originalFile": "Divertimento in F major, K. 138 (125c) - 1st movement.oga", "downloadUrl": "https://upload.wikimedia.org/wikipedia/commons/f/f4/Divertimento_in_F_major%2C_K._138_%28125c%29_-_1st_movement.oga", "duration": 251.93, "bytes": 3024083, "sha256": "5fad546a5a8c89c952a5c49bd54dc7f91bcc9eca404b066a3e86f4f668b954a4", "originalBytes": 9301667, "originalSha256": "63e359aa4cc44a3aaf7a6a32428f28af4bc7d1558bfc436314d799a835886ca3", "commonsSha1": "de6de325c868f4c5fe6b38fc97fd3787403e2b5c", "commonsPageId": 22463857, "commonsRevisionId": 1206996035, "changeNote": "Transcoded from the original recording to MP3, stereo 44.1 kHz / 96 kbit/s; complete recording, no cuts or musical edits.", "fetchedAt": "2026-10-26T03:08:28.472360+00:00", "licenseId": "CC-BY-3.0"}, {"file": "classical-07.mp3", "title": "莫扎特 · D大调长笛四重奏 K.285 第二乐章", "composer": "莫扎特", "era": "classical", "performer": "Felix Skowronek；Philadelphia Quartet", "credit": "Felix Skowronek with the Philadelphia Quartet; Al Goldstein collection, Pandora Music / ibiblio.org", "license": "CC BY-SA 2.0", "licenseUrl": "https://creativecommons.org/licenses/by-sa/2.0", "sourceUrl": "https://commons.wikimedia.org/wiki/File:Wolfgang_Amadeus_Mozart_-_Flute_Quartet_No._1_in_D_Major_-_2._Adagio.ogg", "originalFile": "Wolfgang Amadeus Mozart - Flute Quartet No. 1 in D Major - 2. Adagio.ogg", "downloadUrl": "https://upload.wikimedia.org/wikipedia/commons/2/2a/Wolfgang_Amadeus_Mozart_-_Flute_Quartet_No._1_in_D_Major_-_2._Adagio.ogg", "duration": 149.24, "bytes": 1791835, "sha256": "cf04f79ba8c25943b47a19399e8b85721043cb055c8cb85896d6cfca70fe894f", "originalBytes": 4473399, "originalSha256": "c8985c984a41f5277f69616f9d9fd6c70e33930f38e4110e2ec5311d843f0ae9", "commonsSha1": "1610a84eca076a2fc25c2cd079e2fc7976adbc84", "commonsPageId": 9997618, "commonsRevisionId": 650296457, "changeNote": "Transcoded from the original recording to MP3, stereo 44.1 kHz / 96 kbit/s; complete recording, no cuts or musical edits.", "fetchedAt": "2026-10-26T03:08:28.472360+00:00", "licenseId": "CC-BY-SA-2.0"}, {"file": "classical-08.mp3", "title": "贝多芬 · 月光奏鸣曲 第二乐章", "composer": "贝多芬", "era": "classical", "performer": "Bernd Krueger（数码钢琴录制）", "credit": "Bernd Krueger; piano-midi.de; created in MIDI and recorded from a digital piano", "license": "CC BY-SA 2.0 de", "licenseUrl": "https://creativecommons.org/licenses/by-sa/2.0/de/deed.en", "sourceUrl": "https://commons.wikimedia.org/wiki/File:Beethoven_Moonlight_2nd_movement.ogg", "originalFile": "Beethoven Moonlight 2nd movement.ogg", "downloadUrl": "https://upload.wikimedia.org/wikipedia/commons/4/47/Beethoven_Moonlight_2nd_movement.ogg", "duration": 124.97, "bytes": 1500308, "sha256": "ea0fb263347164902280522627eea4dadedca2c28c3458dda0193b0f043ffaa0", "originalBytes": 2317258, "originalSha256": "1ed00a13f9bf930ebb4a46deca354321c86289680e0f99777dd6e13855f317d8", "commonsSha1": "7a3bceb2828a189b437cfe9b44b10eade33ecfec", "commonsPageId": 1908097, "commonsRevisionId": 1158867894, "changeNote": "Transcoded from the original recording to MP3, stereo 44.1 kHz / 96 kbit/s; complete recording, no cuts or musical edits.", "fetchedAt": "2026-10-26T03:08:28.472360+00:00", "licenseId": "LicenseRef-CC-BY-SA-2.0-DE"}, {"file": "romantic-09.mp3", "title": "肖邦 · 摇篮曲 Op.57", "composer": "肖邦", "era": "romantic", "performer": "Veronica van der Knaap", "credit": "Veronica van der Knaap; public concert, Christchurch, New Zealand", "license": "Public domain", "licenseUrl": "https://commons.wikimedia.org/wiki/Commons:Copyright_tags#Public_domain", "sourceUrl": "https://commons.wikimedia.org/wiki/File:Chopin-Berceuse.ogg", "originalFile": "Chopin-Berceuse.ogg", "downloadUrl": "https://upload.wikimedia.org/wikipedia/commons/d/d5/Chopin-Berceuse.ogg", "duration": 290.24, "bytes": 3483629, "sha256": "7929a5930432ab476cd597bf55a3605e5f5fbecfc40b570fce494abbf92fa3cb", "originalBytes": 5052936, "originalSha256": "4fe734920ea60a84d38a73c77233f885f557488a47eccf53da1da7548a3caf12", "commonsSha1": "6307873ca99d7745f92da377c5bd29f51f62e77d", "commonsPageId": 389414, "commonsRevisionId": 857610399, "changeNote": "Transcoded from the original recording to MP3, stereo 44.1 kHz / 96 kbit/s; complete recording, no cuts or musical edits.", "fetchedAt": "2026-10-26T03:08:28.472360+00:00", "licenseId": "LicenseRef-Public-Domain"}, {"file": "romantic-10.mp3", "title": "勃拉姆斯 · 间奏曲 Op.76 No.7", "composer": "勃拉姆斯", "era": "romantic", "performer": "Dysprosia", "credit": "Copyright © Dysprosia; redistribution under the accompanying BSD notice", "license": "BSD", "licenseId": "BSD-3-Clause", "licenseUrl": "http://opensource.org/licenses/bsd-license.php", "sourceUrl": "https://commons.wikimedia.org/wiki/File:Brahms_Intermezzo_Op._76_No._7.ogg", "originalFile": "Brahms Intermezzo Op. 76 No. 7.ogg", "downloadUrl": "https://upload.wikimedia.org/wikipedia/commons/5/57/Brahms_Intermezzo_Op._76_No._7.ogg", "duration": 236.14, "bytes": 2834434, "sha256": "9292a2b91981bfe792976d4fb4d897106609b7e7b28908fca11cbe23aa539379", "originalBytes": 1877928, "originalSha256": "b00dd84bac332493362f3542782819cb71ffe3326f0eb1ef5d15dbc227393bf3", "commonsSha1": "eb0f0115347be0a74b6853aa97a4aae6fafcbbcf", "commonsPageId": 56736, "commonsRevisionId": 1227002547, "changeNote": "Transcoded from the original recording to MP3, stereo 44.1 kHz / 96 kbit/s; complete recording, no cuts or musical edits.", "fetchedAt": "2026-10-26T03:25:11.215858+00:00", "licenseNotice": "LICENSE-Dysprosia-BSD.txt"}, {"file": "romantic-11.mp3", "title": "肖邦 · 第一即兴曲 Op.29", "composer": "肖邦", "era": "romantic", "performer": "Jason M. C., Han", "credit": "Jason M. C., Han; own recording published on Wikimedia Commons", "license": "CC BY-SA 4.0", "licenseId": "CC-BY-SA-4.0", "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0", "sourceUrl": "https://commons.wikimedia.org/wiki/File:Chopin_Impromptus_Op.29%2C_JMC%2C_Han.ogg", "originalFile": "Chopin Impromptus Op.29, JMC, Han.ogg", "downloadUrl": "https://upload.wikimedia.org/wikipedia/commons/d/d7/Chopin_Impromptus_Op.29%2C_JMC%2C_Han.ogg", "duration": 285.93, "bytes": 3431906, "sha256": "b148c877283725fe28b73c955aa8a0d77a65374c243b74e67007fd5f69f829b4", "originalBytes": 3410416, "originalSha256": "fb5ecf1fd70ad7c54cd0033b8ab6ae167cc8d3e951b2674d9fa14b70bd0533e0", "commonsSha1": "5f58d5b6bf8af7637b5232fb23ec632930470655", "commonsPageId": 107680897, "commonsRevisionId": 857612049, "changeNote": "Transcoded from the original recording to MP3, stereo 44.1 kHz / 96 kbit/s; complete recording, no cuts or musical edits.", "fetchedAt": "2026-10-26T03:25:11.215858+00:00"}, {"file": "romantic-12.mp3", "title": "格里格 · 特罗尔豪根的婚礼日 Op.65 No.6", "composer": "格里格", "era": "romantic", "performer": "Harald Vetter", "credit": "Harald Vetter; recording made available through IMSLP / Wikimedia Commons", "license": "CC BY 4.0", "licenseId": "CC-BY-4.0", "licenseUrl": "https://creativecommons.org/licenses/by/4.0", "sourceUrl": "https://commons.wikimedia.org/wiki/File:Edvard-Grieg-Lyric-Pieces-Op-65_-No-6-Wedding-Day-at-Troldhaugen.ogg", "originalFile": "Edvard-Grieg-Lyric-Pieces-Op-65 -No-6-Wedding-Day-at-Troldhaugen.ogg", "downloadUrl": "https://upload.wikimedia.org/wikipedia/commons/7/74/Edvard-Grieg-Lyric-Pieces-Op-65_-No-6-Wedding-Day-at-Troldhaugen.ogg", "duration": 416.02, "bytes": 4992984, "sha256": "47de15cf0104468cda7fbd7e422eec9fcb0d3bb96461320039d639334094997d", "originalBytes": 4844665, "originalSha256": "756c33f773e8cd82ea61447ee1d94e1b87360b4945037b068d93e302d3c5cf23", "commonsSha1": "c56120b2749eada2ee79aecc8fd73707e1ca547a", "commonsPageId": 158393522, "commonsRevisionId": 1227004369, "changeNote": "Transcoded from the original recording to MP3, stereo 44.1 kHz / 96 kbit/s; complete recording, no cuts or musical edits.", "fetchedAt": "2026-10-26T03:25:11.215858+00:00"}, {"file": "modern-13.mp3", "title": "德彪西 · 第二阿拉伯风格曲", "composer": "德彪西", "era": "modern", "performer": "Jason M. C., Han", "credit": "Jason M. C., Han; own recording, 11 July 2017", "license": "CC BY-SA 4.0", "licenseId": "CC-BY-SA-4.0", "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0", "sourceUrl": "https://commons.wikimedia.org/wiki/File:Claude_Debussy_-_2nd_Arabesque_%28JMC%2C_Han%29.oga", "originalFile": "Claude Debussy - 2nd Arabesque (JMC, Han).oga", "downloadUrl": "https://upload.wikimedia.org/wikipedia/commons/5/59/Claude_Debussy_-_2nd_Arabesque_%28JMC%2C_Han%29.oga", "duration": 269.97, "bytes": 3240690, "sha256": "00890683ee1196605b885421c3b2c66b573ed41e8a4cdecda40ccdc81c952ca2", "originalBytes": 2893410, "originalSha256": "6564591d0860d491065e43f69c4740e20243f8092cb10367bf29a36753c32042", "commonsSha1": "9bda231bc83c86310fb40a5894c691f14e0dfaf4", "commonsPageId": 60836249, "commonsRevisionId": 1227003717, "changeNote": "Transcoded from the original recording to MP3, stereo 44.1 kHz / 96 kbit/s; complete recording, no cuts or musical edits.", "fetchedAt": "2026-10-26T03:25:11.215858+00:00"}, {"file": "modern-14.mp3", "title": "德彪西 · 亚麻色头发的少女", "composer": "德彪西", "era": "modern", "performer": "Patrizia Prati", "credit": "Patrizia Prati, piano; live performance at Museum of Romanticism, Madrid", "license": "CC BY-SA 4.0", "licenseId": "CC-BY-SA-4.0", "licenseUrl": "https://creativecommons.org/licenses/by-sa/4.0", "sourceUrl": "https://commons.wikimedia.org/wiki/File:Claude_Debussy_-_I_Livre_Prelude_VIII..._%28...La_fille_aux_cheveux_de_lin%29_-_Patrizia_Prati.ogg", "originalFile": "Claude Debussy - I Livre Prelude VIII... (...La fille aux cheveux de lin) - Patrizia Prati.ogg", "downloadUrl": "https://upload.wikimedia.org/wikipedia/commons/8/8d/Claude_Debussy_-_I_Livre_Prelude_VIII..._%28...La_fille_aux_cheveux_de_lin%29_-_Patrizia_Prati.ogg", "duration": 169.33, "bytes": 2032579, "sha256": "fda5265a5e7ce104bd14149725121403c90d5960759e82e068476fc9bb6cc8a6", "originalBytes": 8987598, "originalSha256": "5e2649f2c80fee6b83cef07684439656a122ecac3c3d87114223f787a9247bad", "commonsSha1": "8d2ca9cfcbff634128c68715362e325cd4772154", "commonsPageId": 49096186, "commonsRevisionId": 1180994390, "changeNote": "Transcoded from the original recording to MP3, stereo 44.1 kHz / 96 kbit/s; complete recording, no cuts or musical edits.", "fetchedAt": "2026-10-26T03:25:11.215858+00:00"}, {"file": "modern-15.mp3", "title": "萨蒂 · 第一吉姆诺佩迪", "composer": "萨蒂", "era": "modern", "performer": "Kevin MacLeod", "credit": "Erik Satie: Gymnopedie No 1 by Kevin MacLeod", "license": "CC BY 3.0", "licenseId": "CC-BY-3.0", "licenseUrl": "https://creativecommons.org/licenses/by/3.0", "sourceUrl": "https://commons.wikimedia.org/wiki/File:Kevin_MacLeod_-_Erik_Satie_Gymnopedie_No_1.ogg", "originalFile": "Kevin MacLeod - Erik Satie Gymnopedie No 1.ogg", "downloadUrl": "https://upload.wikimedia.org/wikipedia/commons/6/68/Kevin_MacLeod_-_Erik_Satie_Gymnopedie_No_1.ogg", "duration": 187.09, "bytes": 2245738, "sha256": "8172ca74293ca6a7963fcbef19c3a9fee1e2807520ad22cfae54ce025da5c90a", "originalBytes": 3572839, "originalSha256": "67a914a1e3e00d2381fed9d2c0278c47b1088d9077789a973a04189f013fd76b", "commonsSha1": "b8d8b104f3216e6cf81e3023f1e4e957fa74668f", "commonsPageId": 88993389, "commonsRevisionId": 1044293663, "changeNote": "Transcoded from the original recording to MP3, stereo 44.1 kHz / 96 kbit/s; complete recording, no cuts or musical edits.", "fetchedAt": "2026-10-26T03:25:11.215858+00:00"}, {"file": "modern-16.mp3", "title": "拉威尔 · 鹅妈妈《睡美人的帕凡舞曲》", "composer": "拉威尔", "era": "modern", "performer": "Duo Campion/Vachon", "credit": "Duo Campion/Vachon; piano duet interpretation", "license": "CC BY-SA 3.0", "licenseId": "CC-BY-SA-3.0", "licenseUrl": "https://creativecommons.org/licenses/by-sa/3.0", "sourceUrl": "https://commons.wikimedia.org/wiki/File:Ravel_Duo_Campion-Vachon_Ma_Mere_l%27oye_1_Pavane_de_la_Belle_au_bois_dormant.OGG", "originalFile": "Ravel Duo Campion-Vachon Ma Mere l'oye 1 Pavane de la Belle au bois dormant.OGG", "downloadUrl": "https://upload.wikimedia.org/wikipedia/commons/1/12/Ravel_Duo_Campion-Vachon_Ma_Mere_l%27oye_1_Pavane_de_la_Belle_au_bois_dormant.OGG", "duration": 99.33, "bytes": 1192795, "sha256": "d1e0abd92dffed43ba6f6f4dd8de37aaade70f373618102b929cb4a708e37562", "originalBytes": 1113011, "originalSha256": "e451f40995617fd8488cd81c4f463f7f072a0d8b5f6dbc75b6080f701a47906d", "commonsSha1": "7bbaf7a44b96679f56f5c1cd7a810487f58baadd", "commonsPageId": 2958355, "commonsRevisionId": 689895345, "changeNote": "Transcoded from the original recording to MP3, stereo 44.1 kHz / 96 kbit/s; complete recording, no cuts or musical edits.", "fetchedAt": "2026-10-26T03:25:11.215858+00:00"}];

return { LOCAL_MUSIC };
})();
const { selectMusicTrack, musicDisplayTitle, musicCopyTitle }=(()=>{
// Pure selection logic shared by playback and its tests.
function selectMusicTrack(pool,{currentId=null,recent=[],shuffle=true,direction=1,rng=Math.random}={}){
 if(!pool.length)return null;
 if(!shuffle){const index=pool.findIndex(track=>track.id===currentId);return pool[index<0?(direction<0?pool.length-1:0):(index+direction+pool.length)%pool.length];}
 const fresh=pool.filter(track=>track.id!==currentId&&!recent.slice(-2).includes(track.id));
 const other=pool.filter(track=>track.id!==currentId),choices=fresh.length?fresh:other.length?other:pool;
 return choices[Math.min(choices.length-1,Math.floor(rng()*choices.length))];
}
const COMPOSER_ALIASES={
 巴赫:['Johann Sebastian Bach','J. S. Bach','JS Bach','Bach'],亨德尔:['George Frideric Handel','Handel','Händel'],维瓦尔第:['Antonio Vivaldi','Vivaldi'],斯卡拉蒂:['Domenico Scarlatti','Scarlatti'],
 莫扎特:['Wolfgang Amadeus Mozart','W. A. Mozart','Mozart'],海顿:['Joseph Haydn','Haydn'],贝多芬:['Ludwig van Beethoven','Beethoven'],格鲁克:['Christoph Willibald Gluck','Gluck'],
 肖邦:['Frédéric Chopin','Frederic Chopin','Chopin, Frédéric','Chopin'],舒伯特:['Franz Schubert','Schubert'],舒曼:['Robert Schumann','Schumann'],勃拉姆斯:['Johannes Brahms','Brahms'],
 德彪西:['Claude Debussy','Debussy'],萨蒂:['Erik Satie','Satie'],拉威尔:['Maurice Ravel','Ravel'],拉赫玛尼诺夫:['Sergei Rachmaninoff','Rachmaninoff']
};
function musicDisplayTitle(track){
 if(!track)return '';
 let title=String(track.title||track.file||'').trim();
 const names=[track.composer,...(COMPOSER_ALIASES[track.composer]||[])].filter(Boolean).sort((a,b)=>b.length-a.length);
 for(const name of names){if(title.toLocaleLowerCase().startsWith(name.toLocaleLowerCase())){const rest=title.slice(name.length);if(/^[\s·:：|,–—-]+/.test(rest)){title=rest.replace(/^[\s·:：|,–—-]+/,'');break;}}}
 return title||track.title||track.file||'';
}
function musicCopyTitle(track){return [track?.composer,musicDisplayTitle(track)].filter(Boolean).join(' - ');}

return { selectMusicTrack, musicDisplayTitle, musicCopyTitle };
})();
const { discoverMusic }=(()=>{
// Optional, anonymous Commons discovery. Playback stays in period-music.js.
// Sources and scope: data/ONLINE_MUSIC.md. No DOM or audio elements are used here.
const ONLINE_COMPOSERS={
 baroque:[
  ['Johann Sebastian Bach','巴赫',/Bach|\bBWV\b|Goldberg|Wohltemperiert|Well[- ]Tempered/i],
  ['George Frideric Handel','亨德尔',/Handel|Händel|Haendel|\bHWV\b/i],
  ['Antonio Vivaldi','维瓦尔第',/Vivaldi|\bRV\s*\d/i],
  ['Domenico Scarlatti','斯卡拉蒂',/Scarlatti/i]
 ],
 classical:[
  ['Wolfgang Amadeus Mozart','莫扎特',/Mozart/i],
  ['Joseph Haydn','海顿',/Haydn|\bHob\./i],
  ['Ludwig van Beethoven','贝多芬',/Beethoven/i],
  ['Christoph Willibald Gluck','格鲁克',/Gluck/i]
 ],
 romantic:[
  ['Frédéric Chopin','肖邦',/Chopin/i],
  ['Franz Schubert','舒伯特',/Schubert/i],
  ['Robert Schumann','舒曼',/Schumann/i],
  ['Johannes Brahms','勃拉姆斯',/Brahms/i]
 ],
 modern:[
  ['Claude Debussy','德彪西',/Debussy/i],
  ['Maurice Ravel','拉威尔',/Ravel/i],
  ['Erik Satie','萨蒂',/Satie|Gymnopédie|Gymnopedie|Gnossienne/i],
  ['Sergei Rachmaninoff','拉赫玛尼诺夫',/Rachmaninoff|Rachmaninov/i]
 ]
};
const ONLINE_CACHE_KEY='ChessAtelierOnlineMusicV1',ONLINE_ERAS=Object.keys(ONLINE_COMPOSERS);
const ONLINE_PER_ERA=60,ONLINE_MAX_BYTES=30*1024*1024,ONLINE_CACHE_AGE=14*86400000;
const ONLINE_ENTITIES={amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' ',ndash:'–',mdash:'—',hellip:'…',eacute:'é',Eacute:'É',aacute:'á',agrave:'à',ouml:'ö',uuml:'ü',auml:'ä',szlig:'ß',ccedil:'ç'};
function onlineText(value,limit=160){
 return String(value??'').replace(/<!--[\s\S]*?-->|<(?:script|style)\b[^>]*>[\s\S]*?<\/(?:script|style)>/gi,' ')
  .replace(/<[^>]*>/g,' ').replace(/&#(x[\da-f]+|\d+);/gi,(_,code)=>{
   const point=code[0].toLowerCase()==='x'?parseInt(code.slice(1),16):Number(code);
   return point>0&&point<=0x10ffff&&!(point>=0xd800&&point<=0xdfff)?String.fromCodePoint(point):' ';
  }).replace(/&([a-z][a-z0-9]+);/gi,(_,name)=>ONLINE_ENTITIES[name]??' ')
  .replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,limit);
}
function onlineUrl(value,host){
 try{const url=new URL(String(value));return url.protocol==='https:'&&url.hostname===host&&!url.username&&!url.password?url.href:null;}catch{return null;}
}
function onlineLicense(meta){
 const label=onlineText(meta.LicenseShortName?.value||meta.UsageTerms?.value,100),usage=onlineText(meta.UsageTerms?.value,180);
 if(/\b(?:NC|ND)\b|non[- ]?commercial|no derivatives|fair use|permission required/i.test(label+' '+usage))return null;
 const raw=onlineText(meta.LicenseUrl?.value,350);let url;
 try{url=new URL(raw);}catch{}
 if(url?.protocol==='https:'&&url.hostname==='creativecommons.org'){
  if(/^\/licenses\/by(?:-sa)?\/(?:1\.0|2\.0|2\.5|3\.0|4\.0)\/?$/.test(url.pathname))return {license:label||'Creative Commons '+url.pathname.split('/')[2],licenseUrl:url.href};
  if(/^\/publicdomain\/zero\/1\.0\/?$/.test(url.pathname))return {license:'CC0',licenseUrl:url.href};
  if(/^\/publicdomain\/mark\/1\.0\/?$/.test(url.pathname))return {license:'Public domain',licenseUrl:url.href};
 }
 if(/^(?:CC0(?: 1\.0)?|Public domain)$/i.test(label))return {license:label,licenseUrl:/CC0/i.test(label)?'https://creativecommons.org/publicdomain/zero/1.0/':'https://creativecommons.org/publicdomain/mark/1.0/'};
 if(/^CC[ -]BY(?:[ -]SA)?[ -](?:1\.0|2\.0|2\.5|3\.0|4\.0)$/i.test(label)){
  const share=/[ -]SA/i.test(label),version=label.match(/\d\.\d/)[0];
  return {license:label,licenseUrl:`https://creativecommons.org/licenses/${share?'by-sa':'by'}/${version}/`};
 }
 if(/^BSD(?: [23]-Clause)?$/i.test(label)&&url?.protocol==='https:'&&url.hostname==='opensource.org'&&/bsd/i.test(url.pathname))return {license:label,licenseUrl:url.href};
 return null;
}
function onlineTrack(page,era,composer){
 const info=page?.imageinfo?.[0],file=String(page?.title||'').replace(/^File:/,''),meta=info?.extmetadata||{};
 if(page?.ns!==6||!info||file.length>250||!file||!/\.(?:mp3|ogg|oga|wav|flac|opus|webm)$/i.test(file))return null;
 if(/(?:^|[\s_\-.])(?:excerpt|preview|sample|test|spoken|speech|interview|tutorial|midi)(?:[\s_\-.]|$)/i.test(file))return null;
 const bytes=Number(info.size),mime=String(info.mime||'').toLowerCase();
 if(!Number.isFinite(bytes)||bytes<200000||bytes>ONLINE_MAX_BYTES||(!mime.startsWith('audio/')&&mime!=='application/ogg')||String(info.mediatype).toUpperCase()==='VIDEO')return null;
 const remoteUrl=onlineUrl(info.url,'upload.wikimedia.org'),license=onlineLicense(meta);
 if(!remoteUrl||!license)return null;
 const title=onlineText(meta.ObjectName?.value||meta.Title?.value||file.replace(/_/g,' ').replace(/\.[^.]+$/,''),120);
 const description=onlineText(meta.ImageDescription?.value,2400),artist=onlineText(meta.Artist?.value,180);
 // A broad category can contain medleys, arrangements and unrelated material.
 // Require additional textual evidence for the attributed composer/work family.
 if(!composer[2].test(file+' '+title+' '+description+' '+artist))return null;
 const duration=(info.metadata||[]).find(row=>/^(?:playtime_seconds|duration)$/i.test(row.name||''))?.value;
 if(duration!==undefined&&Number.isFinite(Number(duration))&&Number(duration)<35)return null;
 const sourceUrl=onlineUrl(info.descriptionurl,'commons.wikimedia.org')||'https://commons.wikimedia.org/wiki/'+encodeURIComponent('File:'+file).replace(/%20/g,'_');
 const credit=onlineText(meta.Attribution?.value||meta.Credit?.value||artist,240);
 return {id:'commons:'+file,file,title,composer:composer[1],performer:artist||'演奏者见来源页',era,sourceUrl,...license,credit,remoteUrl,online:true,bytes,mime};
}
function onlineCursor(value){
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const rows=Object.entries(value);if(rows.length>8)return null;
 if(rows.some(([key,text])=>!/^(?:continue|[a-z]+continue)$/.test(key)||typeof text!=='string'||text.length>1600))return null;
 return Object.fromEntries(rows);
}
function onlineEmptyState(){return Object.fromEntries(ONLINE_ERAS.map(era=>[era,{composerIndex:0,cursor:null,tracks:[],round:0}]));}
function onlineReadCache(){
 const state=onlineEmptyState();
 try{
  const raw=globalThis.localStorage?.getItem(ONLINE_CACHE_KEY);if(!raw||raw.length>400000)return state;
  const saved=JSON.parse(raw);if(saved.version!==1||!Number.isFinite(saved.savedAt)||Date.now()-saved.savedAt>ONLINE_CACHE_AGE)return state;
  for(const era of ONLINE_ERAS){
   const row=saved.eras?.[era];if(!row||typeof row!=='object')continue;
   state[era].composerIndex=Number.isInteger(row.composerIndex)&&row.composerIndex>=0&&row.composerIndex<ONLINE_COMPOSERS[era].length?row.composerIndex:0;
   state[era].cursor=onlineCursor(row.cursor);state[era].round=Number.isInteger(row.round)&&row.round>=0?Math.min(row.round,1000000):0;
   const unique=new Map();
   for(const track of Array.isArray(row.tracks)?row.tracks:[]){
    if(!track||track.era!==era||typeof track.file!=='string'||track.id!=='commons:'+track.file||!onlineUrl(track.remoteUrl,'upload.wikimedia.org')||!onlineUrl(track.sourceUrl,'commons.wikimedia.org'))continue;
    if(!Number.isFinite(track.bytes)||track.bytes<=0||track.bytes>ONLINE_MAX_BYTES||typeof track.mime!=='string')continue;
    const license=onlineLicense({LicenseShortName:{value:track.license},LicenseUrl:{value:track.licenseUrl}});if(!license)continue;
    unique.set(track.id,{...track,...license,title:onlineText(track.title,120),composer:onlineText(track.composer,40),performer:onlineText(track.performer,180),credit:onlineText(track.credit,240),online:true});
   }
   state[era].tracks=[...unique.values()].slice(-ONLINE_PER_ERA);
  }
 }catch{}
 return state;
}
const onlineState=onlineReadCache(),onlineInFlight=new Map();
let onlineQueue=Promise.resolve(),onlineLastRequest=0,onlineAllTurn=0,onlineCooldown=0;
function onlineSaveCache(){
 try{globalThis.localStorage?.setItem(ONLINE_CACHE_KEY,JSON.stringify({version:1,savedAt:Date.now(),eras:onlineState}));}catch{}
}
async function onlineDiscoverPage(era){
 const state=onlineState[era];
 if(Date.now()<onlineCooldown)return {tracks:state.tracks.slice(),hasMore:true,message:'在线目录暂时限流，先使用已缓存的曲目。'};
 const [name]=ONLINE_COMPOSERS[era][state.composerIndex],params=new URLSearchParams({action:'query',format:'json',formatversion:'2',origin:'*',generator:'categorymembers',gcmtitle:'Category:Audio files of music by '+name,gcmtype:'file',gcmlimit:'35',prop:'imageinfo',iiprop:'url|size|mime|mediatype|metadata|extmetadata',iiextmetadatalanguage:'en',...state.cursor});
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);
 try{
  const response=await fetch('https://commons.wikimedia.org/w/api.php?'+params,{signal:controller.signal,credentials:'omit',headers:{'Api-User-Agent':'ChessAtelier/1.2 (https://github.com/827853487/chess-atelier)'}});
  if(!response.ok){
   if(response.status===429||response.status===503){const wait=Number(response.headers.get('Retry-After'));onlineCooldown=Date.now()+Math.min(300,Number.isFinite(wait)&&wait>0?wait:30)*1000;}
   throw Error('Commons HTTP '+response.status);
  }
  const data=await response.json();
  if(data.error){if(/continue/i.test(String(data.error.code)))state.cursor=null;throw Error('Commons API error');}
  const composer=ONLINE_COMPOSERS[era][state.composerIndex],page=[];
  for(const entry of data.query?.pages||[]){const track=onlineTrack(entry,era,composer);if(track&&!page.some(row=>row.id===track.id))page.push(track);}
  const known=new Map(state.tracks.map(track=>[track.id,track]));for(const track of page)known.set(track.id,track);
  state.tracks=[...known.values()].slice(-ONLINE_PER_ERA);state.cursor=onlineCursor(data.continue);
  let hasMore=true;
  if(!state.cursor){state.composerIndex=(state.composerIndex+1)%ONLINE_COMPOSERS[era].length;if(state.composerIndex===0){state.round++;hasMore=false;}}
  onlineSaveCache();
  return {tracks:page.length?page:state.tracks.slice(),hasMore,message:page.length?undefined:hasMore?'本页没有合适录音，可继续读取下一页。':'本轮作曲家目录已读取完成。'};
 }catch(error){
  return {tracks:state.tracks.slice(),hasMore:true,message:error.name==='AbortError'?'在线目录读取超时，先使用本地或缓存曲目。':'暂时无法读取在线目录，先使用本地或缓存曲目。'};
 }finally{clearTimeout(timeout);}
}

function discoverMusic(era='all'){
 const requested=era==='all'||ONLINE_ERAS.includes(era)?era:'all';
 if(onlineInFlight.has(requested))return onlineInFlight.get(requested);
 const actual=requested==='all'?ONLINE_ERAS[onlineAllTurn++%ONLINE_ERAS.length]:requested;
 if(onlineInFlight.has(actual)){
  const existing=onlineInFlight.get(actual);onlineInFlight.set(requested,existing);
  const clear=()=>{if(onlineInFlight.get(requested)===existing)onlineInFlight.delete(requested);};existing.then(clear,clear);
  return existing;
 }
 const task=onlineQueue.catch(()=>{}).then(async()=>{
  const wait=Math.max(0,900-(Date.now()-onlineLastRequest));if(wait)await new Promise(resolve=>setTimeout(resolve,wait));
  onlineLastRequest=Date.now();return onlineDiscoverPage(actual);
 });
 onlineQueue=task.then(()=>{},()=>{});onlineInFlight.set(requested,task);onlineInFlight.set(actual,task);
 const clear=()=>{for(const [key,value] of onlineInFlight)if(value===task)onlineInFlight.delete(key);};task.then(clear,clear);
 return task;
}

return { discoverMusic };
})();
const { setupPeriodMusic }=(()=>{






const ERAS={baroque:'巴洛克',classical:'古典',romantic:'浪漫',modern:'近现代'};
const $=id=>document.getElementById(id),audio=$('music-audio');
const local=LOCAL_MUSIC.map(track=>({...track,id:'local:'+track.file,localUrl:'./assets/music/'+encodeURIComponent(track.file)}));
const remoteSeed=MUSIC_SEED.map(([file,title,composer])=>({id:'seed:'+file,file,title,composer,era:/巴赫|亨德尔|维瓦尔第|斯卡拉蒂/.test(composer)?'baroque':/莫扎特|贝多芬|海顿/.test(composer)?'classical':/德彪西|拉威尔|萨蒂/.test(composer)?'modern':'romantic',sourceUrl:'https://commons.wikimedia.org/wiki/File:'+encodeURIComponent(file)}));
const state={era:'all',onlineBackoffUntil:0,onlineTracks:[],track:null,history:[],failed:new Set(),buffers:new Map(),plan:[],serial:0,errors:0,playing:false,status:'',discovering:false};
const source=track=>track.localUrl||track.remoteUrl||'https://commons.wikimedia.org/wiki/Special:Redirect/file/'+encodeURIComponent(track.file).replace(/%20/g,'_');
const coverCache=new Map();let coverCacheBytes=0;
function cacheCover(id,cover){coverCacheBytes-=coverCache.get(id)?.bytes.length||0;coverCache.set(id,cover);coverCacheBytes+=cover?.bytes.length||0;while(coverCache.size>24||coverCacheBytes>6*1024*1024){const first=coverCache.keys().next().value;coverCacheBytes-=coverCache.get(first)?.bytes.length||0;coverCache.delete(first);}}
let coverController=null,coverSequence=0;
function updateCover(track){
 const sequence=++coverSequence;coverController?.abort();coverController=new AbortController();
 const box=document.querySelector('.now-art');for(const old of box.querySelectorAll('img'))hideSurface(old,()=>{URL.revokeObjectURL(old.src);old.remove();});
 const controller=coverController,timeout=setTimeout(()=>controller.abort(),8000),signal=controller.signal;
 const load=coverCache.has(track.id)?Promise.resolve(coverCache.get(track.id)):(async()=>{const cover=await readMusicCover(source(track),{signal,blob:state.buffers.get(track.id)?.blob});if(cover||signal.aborted||!track.localUrl||!track.downloadUrl?.startsWith('https://upload.wikimedia.org/'))return cover;return readMusicCover(track.downloadUrl,{signal});})();
 load.then(async cover=>{clearTimeout(timeout);if(signal.aborted||sequence!==coverSequence)return;cacheCover(track.id,cover);if(!cover)return;const img=new Image();img.alt='';img.title='当前录音内嵌封面';img.src=URL.createObjectURL(new Blob([cover.bytes],{type:cover.mime}));try{await img.decode();if(sequence!==coverSequence){URL.revokeObjectURL(img.src);return;}box.append(img);img.hidden=true;showSurface(img);}catch{URL.revokeObjectURL(img.src);}}).catch(()=>clearTimeout(timeout));
}
let spectrumContext=null,spectrum=null,spectrumSource=null,spectrumFrame=0;
audio.crossOrigin='anonymous';
function stopSpectrum(){cancelAnimationFrame(spectrumFrame);spectrumFrame=0;for(const bar of document.querySelectorAll('.wave-bars i'))bar.style.transform='scaleY(.12)';}
function ensureSpectrum(){
 try{if(!spectrumContext){const Context=window.AudioContext||window.webkitAudioContext;if(!Context)return;spectrumContext=new Context();spectrumSource=spectrumContext.createMediaElementSource(audio);spectrum=spectrumContext.createAnalyser();spectrum.fftSize=1024;spectrum.smoothingTimeConstant=.72;spectrumSource.connect(spectrum);spectrum.connect(spectrumContext.destination);}spectrumContext.resume().catch(()=>{});}catch{}
}
function startSpectrum(){
 stopSpectrum();if(!spectrum)return;const data=new Uint8Array(spectrum.frequencyBinCount),groups=[[1,4],[4,8],[8,16],[16,32],[32,64]],bars=[...document.querySelectorAll('.wave-bars i')];
 const frame=()=>{if(audio.paused||$('music-panel').classList.contains('hidden')){spectrumFrame=0;return;}spectrum.getByteFrequencyData(data);groups.forEach(([from,to],i)=>{let total=0;for(let j=from;j<to;j++)total+=data[j];if(bars[i])bars[i].style.transform=`scaleY(${(.2+.8*Math.sqrt(total/(to-from)/255)).toFixed(3)})`;});spectrumFrame=requestAnimationFrame(frame);};spectrumFrame=requestAnimationFrame(frame);
}
const time=seconds=>Number.isFinite(seconds)&&seconds>=0?Math.floor(seconds/60)+':'+String(Math.floor(seconds%60)).padStart(2,'0'):'0:00';
const playIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.8 18.7 12 8 18.2z"/></svg>',pauseIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM14 5h4v14h-4z"/></svg>';
function tracks(){
 const valid=track=>(state.era==='all'||track.era===state.era)&&!state.failed.has(track.id)&&(!track.mime||!!audio.canPlayType(track.mime));
 const locals=local.filter(valid),online=Date.now()>=state.onlineBackoffUntil?state.onlineTracks.filter(valid):[];
 const recordingKey=track=>String(track.originalFile||track.file).replace(/[_ ]+/g,' ').normalize('NFC').toLowerCase();
 const localKeys=new Set(locals.map(recordingKey));
 return online.length?[...online.filter(track=>!localKeys.has(recordingKey(track))),...locals]:locals.length?locals:remoteSeed.filter(valid);
}
function pick(direction=1){return selectMusicTrack(tracks(),{currentId:state.track?.id,recent:state.history,shuffle:true,direction});}
function resetProgress(){$('music-elapsed').textContent='0:00';$('music-duration').textContent='0:00';$('music-seek').value=0;$('music-seek').style.setProperty('--seek-progress','0%');}
function updateTrackOverflow(){const title=$('music-title'),wrap=title.closest('.music-title-viewport'),overflow=title.scrollWidth>wrap.clientWidth+6;title.classList.toggle('title-scroll',overflow);title.style.setProperty('--track-shift',overflow?Math.min(0,wrap.clientWidth-title.scrollWidth-14)+'px':'0px');}
function syncPanelAnchor(){const header=document.querySelector('.masthead');document.documentElement.style.setProperty('--masthead-h',Math.round(header.getBoundingClientRect().height)+'px');}
function render(){
 const playing=state.playing&&!audio.paused;
 $('music-panel').classList.toggle('is-playing',playing);$('music-toggle').classList.toggle('music-is-playing',playing);$('music-toggle').setAttribute('aria-label',playing?'古典乐，正在播放':'古典乐，未播放');
 const button=$('music-play'),icon=playing?'pause':'play';if(button.dataset.icon!==icon){button.dataset.icon=icon;button.innerHTML=playing?pauseIcon:playIcon;button.setAttribute('aria-label',playing?'暂停':'播放');button.title=playing?'暂停':'播放';}
 $('music-title').textContent=state.track?musicDisplayTitle(state.track):'选择时期即播放';$('music-artist').textContent=[state.track?.composer,state.track?.performer].filter(Boolean).join(' · ')||'本地精选与在线曲库';
 document.querySelectorAll('.era-btn').forEach(button=>{const selected=button.dataset.era===state.era;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));});
 // Recording attribution remains on the compact artist line; no controls or
 // web prompts are inserted below the progress bar.
 const artist=$('music-artist');artist.href=state.track?.sourceUrl||'https://commons.wikimedia.org/';artist.title=[state.track?.credit,state.track?.license,'查看录音来源与许可'].filter(Boolean).join(' · ');
 button.title=state.status||(playing?'暂停':'播放');$('music-panel').dataset.onlineCount=String(state.onlineTracks.length);$('music-panel').dataset.discovering=String(state.discovering);
 requestAnimationFrame(updateTrackOverflow);
}
function disposeBuffer(id){const entry=state.buffers.get(id);if(!entry)return;entry.controller.abort();if(entry.url)URL.revokeObjectURL(entry.url);state.buffers.delete(id);}
function bufferTrack(track){
 if(state.buffers.has(track.id))return;
 const entry={controller:new AbortController(),status:'loading',url:null};state.buffers.set(track.id,entry);
 entry.promise=(async()=>{
  if(track.bytes>8_000_000){entry.status='stream';return;}
  const response=await fetch(source(track),{signal:entry.controller.signal,cache:'force-cache'});if(!response.ok)throw Error('Audio HTTP '+response.status);
  if(Number(response.headers.get('Content-Length'))>8_000_000){entry.status='stream';entry.controller.abort();return;}
  const reader=response.body.getReader(),chunks=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>8_000_000){entry.status='stream';await reader.cancel();return;}chunks.push(value);}
  if(state.buffers.get(track.id)!==entry)return;
  entry.blob=new Blob(chunks,{type:response.headers.get('Content-Type')||'audio/mpeg'});entry.url=URL.createObjectURL(entry.blob);entry.status='ready';
 })().catch(()=>{if(entry.status==='loading')entry.status='failed';}).finally(()=>{
  $('music-panel').dataset.buffered=String([...state.buffers.values()].filter(value=>value.status==='ready').length);
 });
}
function prefetch(){
 const pool=tracks(),plan=[],first=pick(1);if(first&&first.id!==state.track?.id)plan.push(first);
 const remaining=pool.filter(track=>track.id!==state.track?.id&&!plan.some(item=>item.id===track.id));
 for(let i=remaining.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[remaining[i],remaining[j]]=[remaining[j],remaining[i]];}

 plan.push(...remaining.slice(0,3-plan.length));state.plan=plan;
 const keep=new Set([state.track?.id,...plan.map(track=>track.id)]);for(const id of state.buffers.keys())if(!keep.has(id))disposeBuffer(id);
 for(const track of plan)bufferTrack(track);
 $('music-panel').dataset.preloadCount=String(plan.length);
}
function start(track){
 if(!track)return;
 ensureSpectrum();
 const serial=++state.serial;audio.pause();state.track=track;state.playing=false;state.status='';resetProgress();
 updateCover(track);state.history.push(track.id);if(state.history.length>32)state.history.shift();
 audio.src=state.buffers.get(track.id)?.url||source(track);audio.preload='auto';audio.load();
 // play() stays in the user's click stack, including on iPhone. Do not await a manifest/fetch first.
 const request=audio.play();render();prefetch();
 request.then(()=>{if(serial===state.serial){state.playing=!audio.paused;render();}}).catch(error=>{
  if(serial!==state.serial||error.name==='AbortError')return;
  if(error.name==='NotAllowedError'){state.status='浏览器暂停了播放，请点播放继续。';state.playing=false;render();}
  else fail(serial);
 });
}
function advance(direction=1){
 const target=state.plan[0]&&!state.failed.has(state.plan[0].id)?state.plan[0]:pick(direction);
 if(target)start(target);
}
function fail(serial=state.serial){
 if(serial!==state.serial||!state.track)return;
 state.failed.add(state.track.id);state.errors++;state.playing=false;
 if(state.track.online&&state.errors>=3){state.onlineBackoffUntil=Date.now()+60000;state.plan=[];start(pick(1));state.status='在线录音暂不可用，已切换本地精选。';render();return;}
 if(state.errors>=6||!tracks().length){state.status='暂时无法播放，请检查网络后重试。';render();return;}
 state.plan=[];advance();
}
async function expandOnline(){
 if(state.discovering||Date.now()<state.onlineBackoffUntil)return;state.discovering=true;
 const era=state.era;state.status='正在扩充在线曲库…';render();
 try{
  const result=await discoverMusic(era);const seen=new Set(state.onlineTracks.map(track=>track.id));for(const track of result.tracks)if(!seen.has(track.id)){state.onlineTracks.push(track);seen.add(track.id);}
  if(state.era===era){state.status='';prefetch();render();}
 }catch{state.onlineBackoffUntil=Date.now()+30000;}
 finally{state.discovering=false;render();if(state.era!==era)expandOnline();}
}
function closePanel(){hideSurface($('music-panel'));$('music-toggle').setAttribute('aria-expanded','false');stopSpectrum();}
function setupPeriodMusic(){
 let copyTimer;
 const copyTitle=async()=>{if(!state.track)return;const label=musicCopyTitle(state.track),toast=$('music-copy-toast');try{await navigator.clipboard.writeText(label);toast.textContent='已复制';}catch{toast.textContent='复制失败，请允许剪贴板权限';}clearTimeout(copyTimer);showSurface(toast);copyTimer=setTimeout(()=>hideSurface(toast),1400);};
 $('music-copy').addEventListener('click',copyTitle);$('music-copy').addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();copyTitle();}});
 audio.volume=.25;$('music-next-audio').preload='none';
 audio.addEventListener('playing',()=>{state.playing=true;state.errors=0;state.status='';render();startSpectrum();});
 audio.addEventListener('pause',()=>{state.playing=false;stopSpectrum();render();});
 audio.addEventListener('durationchange',()=>{if(Number.isFinite(audio.duration))$('music-duration').textContent=time(audio.duration);});
 audio.addEventListener('timeupdate',()=>{if(!Number.isFinite(audio.currentTime))return;$('music-elapsed').textContent=time(audio.currentTime);if(Number.isFinite(audio.duration)&&audio.duration>0){$('music-seek').value=Math.round(audio.currentTime/audio.duration*1000);$('music-seek').style.setProperty('--seek-progress',Math.round(audio.currentTime/audio.duration*100)+'%');}});
 audio.addEventListener('ended',()=>{resetProgress();advance();expandOnline();});
 audio.addEventListener('error',()=>{if(audio.getAttribute('src')&&audio.error)fail();});
 $('music-toggle').addEventListener('click',event=>{event.stopPropagation();const open=!surfaceOpen($('music-panel'));if(open)showSurface($('music-panel'));else closePanel();$('music-toggle').setAttribute('aria-expanded',String(open));if(open){prefetch();expandOnline();if(!audio.paused)startSpectrum();}else stopSpectrum();});
 $('music-close').addEventListener('click',closePanel);
 document.addEventListener('pointerdown',event=>{if(!event.composedPath().includes($('music-panel'))&&!event.target.closest?.('#music-toggle'))closePanel();});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&surfaceOpen($('music-panel'))){event.preventDefault();closePanel();$('music-toggle').focus({preventScroll:true});}});
 document.querySelectorAll('.era-btn').forEach(button=>button.addEventListener('click',()=>{
  state.era=button.dataset.era;state.failed.clear();state.plan=[];state.errors=0;
  start(pick(1));expandOnline();
 }));
 $('music-play').addEventListener('click',()=>{ensureSpectrum();if(!audio.paused){audio.pause();return;}if(state.track&&!state.failed.has(state.track.id))audio.play().catch(()=>fail());else{state.failed.clear();state.errors=0;start(pick(1));}});
 $('music-prev').addEventListener('click',()=>advance(-1));$('music-next').addEventListener('click',()=>advance(1));
 $('music-seek').addEventListener('input',event=>{if(Number.isFinite(audio.duration)&&audio.duration>0)audio.currentTime=audio.duration*Number(event.target.value)/1000;});
 $('music-seek').addEventListener('pointerup',event=>event.target.blur());
 addEventListener('resize',()=>{syncPanelAnchor();updateTrackOverflow();},{passive:true});new ResizeObserver(syncPanelAnchor).observe(document.querySelector('.masthead'));
 addEventListener('pagehide',()=>{audio.pause();stopSpectrum();coverController?.abort();for(const img of document.querySelectorAll('.now-art img'))URL.revokeObjectURL(img.src);spectrumContext?.suspend();for(const id of [...state.buffers.keys()])disposeBuffer(id);});
 syncPanelAnchor();render();setTimeout(()=>{if(!state.buffers.size&&!state.track)prefetch();if(!state.track)expandOnline();},2500);
}

return { setupPeriodMusic };
})();









// Bundled rules module: no network dependency for board and PGN playback.



document.querySelector('#loading').remove();
const $ = q=>document.querySelector(q), $$=q=>[...document.querySelectorAll(q)];
const FILES='abcdefgh';
// 文件字母 → 下标 的查表，避免几何攻击判定里反复 indexOf 字符串
const FILE_INDEX={'a':0,'b':1,'c':2,'d':3,'e':4,'f':5,'g':6,'h':7};
const defaultFen=new Chess().fen();
const pieceName={k:'王',q:'后',r:'车',b:'象',n:'马',p:'兵'};
const val={p:1,n:3.2,b:3.3,r:5.1,q:9,k:0};
const safeText=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const N=n=>new Intl.NumberFormat('zh-CN').format(n||0);
// 棋谱库每次搜索都要拼字符串，这里按条目缓存一份小写检索串。
const searchCache=new WeakMap();
function searchBlob(x){
 let s=searchCache.get(x);
 if(s===undefined){s=(displayName(x)+' '+(x.white||'')+' '+(x.black||'')+' '+(x.stage||'')+' '+(x.origin||'')+' '+(x.eco||'')).toLowerCase();searchCache.set(x,s);}
 return s;
}
let postReview=null,analysisUi=null;
const state={game:new Chess(),origin:defaultFen,view:0,orientation:'w',side:'w',mode:'free',selected:null,legal:[],arrow:null,busy:false,generation:0,analysis:null,review:false,reviewTitle:'', local:[],tab:'notes', db:null,musicIndex:0, soundEnabled:true, hintsEnabled:true, animEnabled:true, catalogCount:0, classicsCount:0, archiveLoaded:new Set(), fullKeys:new Set(),duelStarted:false,currentScoreId:null,currentScoreSource:null,userPacks:[],pendingImportPack:'',packFocus:'我的棋谱',packConfirm:'',promo:null};
// 列表常量：DOM 中同时存在的棋谱行上限，超出部分滚动时再追加。
state.notify=toast;
const LIST_PAGE=120;
let starredIds;try{starredIds=readStarredScores(localStorage);}catch{starredIds=new Set();}
function toggleStarredScore(id){
 const next=new Set(starredIds);next.has(id)?next.delete(id):next.add(id);
 try{writeStarredScores(localStorage,next);}catch{toast('浏览器无法保存收藏，请检查存储空间');return;}
 starredIds=next;collectionDirty=true;state.rebuildArchiveOptions?.();renderCollection();
}
// 棋谱库脏标记：只有数据或筛选条件真的变了才重建列表 DOM，
// 单纯走棋不再触发整份列表重绘。
let collectionDirty=true;
let toastTime,playbackTimer=null,playbackEnd=null;
function toast(t){const e=$('#toast');if(!e)return;e.textContent=t;e.classList.add('show');clearTimeout(toastTime);toastTime=setTimeout(()=>e.classList.remove('show'),2800);}
function history(){return state.game.history({verbose:true});}
// history({verbose:true}) 会逐着重算 SAN，是较贵的一次性调用；
// 一次走棋流程里会被多次读取，这里按「棋局对象 + 着法数」缓存结果。
let histCacheGame=null,histCacheLen=-1,histCacheVal=null;
function cachedHistory(){
 const g=state.game,len=g.history().length;
 if(histCacheGame===g&&histCacheLen===len)return histCacheVal;
 histCacheGame=g;histCacheLen=len;histCacheVal=g.history({verbose:true});
 return histCacheVal;
}
function invalidateViewMemo(){viewMemoKey=null;viewMemoGame=null;histCacheGame=null;histCacheLen=-1;histCacheVal=null;}
// 走一步棋会触发 drawAll / scheduleEngine 等多处读取当前局面。
// viewGame() 每次都要从起始局面重放整盘棋，是主要的卡顿来源之一；
// 这里按「棋局对象 + 步数 + 起始局面」做一层记忆化，同一步只重放一次。
let viewMemoKey=null,viewMemoGame=null;
function viewGame(){
 const key=state.game+'|'+state.view+'|'+state.origin;
 if(viewMemoKey===key&&viewMemoGame)return viewMemoGame;
 let g;
 if(state.view===state.game.history().length)g=state.game;
 else{
  g=cloneRecord(state.game,state.view,state.origin);
 }
 viewMemoKey=key;viewMemoGame=g;
 return g;
}
function headerResult(){return String(state.game.header?.()?.Result||state.currentScoreSource?.result||'');}
function atRecordEnd(moves){return state.review&&moves.length>0&&state.view>=moves.length;}
function finishBanner(g,moves){
 const end=recordEnding(g,{recorded:state.review,atEnd:atRecordEnd(moves),result:headerResult()});
 return end?safeText(end.title)+(end.detail?`<small>${safeText(end.detail)}</small>`:''):'';
}
function locationFor(r,c){return (state.orientation==='w'?FILES[c]:FILES[7-c])+(state.orientation==='w'?8-r:r+1);}
function centerFor(s){let c=FILE_INDEX[s[0]],r=+s[1];return state.orientation==='w'?{x:50+c*100,y:50+(8-r)*100}:{x:50+(7-c)*100,y:50+(r-1)*100};}
let arrowKey='',arrowAnimation=null;const departingArrows=new Set();
function drawArrow(){
 const path=$('#candidate-arrow'),nextKey=state.arrow?JSON.stringify([state.arrow.from,state.arrow.to,state.orientation]):'';
 if(nextKey===arrowKey)return;
 const motion=!matchMedia('(prefers-reduced-motion: reduce)').matches;
 if(path.getAttribute('visibility')==='visible'&&motion){
  const previous=path.cloneNode(true);previous.removeAttribute('id');previous.setAttribute('class','candidate-arrow-exit');
  path.parentElement.append(previous);departingArrows.add(previous);
  const fade=previous.animate([{opacity:getComputedStyle(path).opacity},{opacity:0}],{duration:130,easing:'ease-out',fill:'both'});
  fade.finished.catch(()=>{}).then(()=>{previous.remove();departingArrows.delete(previous);});
 }
 arrowAnimation?.cancel();arrowAnimation=null;arrowKey=nextKey;
 if(!state.arrow){path.setAttribute('visibility','hidden');return;}
 const a=centerFor(state.arrow.from),b=centerFor(state.arrow.to),length=Math.hypot(b.x-a.x,b.y-a.y)||1;
 const dx=(b.x-a.x)/length,dy=(b.y-a.y)/length,nx=-dy,ny=dx;
 const tail={x:a.x+dx*12,y:a.y+dy*12},tip={x:b.x-dx*14,y:b.y-dy*14},base={x:tip.x-dx*26,y:tip.y-dy*26};
 const point=(p,width)=>`${p.x+nx*width},${p.y+ny*width}`;
 path.setAttribute('d',`M${point(tail,6)} L${point(base,6)} L${point(base,16)} L${tip.x},${tip.y} L${point(base,-16)} L${point(base,-6)} L${point(tail,-6)} A6,6 0 0 0 ${point(tail,6)} Z`);
 path.setAttribute('visibility','visible');
 if(motion)arrowAnimation=path.animate([{opacity:0},{opacity:.24}],{duration:180,easing:'ease-out'});
}
// 坐标标签只在翻转棋盘时重写
let lastOrientation=null;
function drawBoard(){
 if(boardAnimating()){boardDrawPending=true;return;}
 const g=viewGame(),moves=cachedHistory(),last=state.view?moves[state.view-1]:null,b=$('#board');
 // 动画中的重绘由上方统一延后，不能抽走正在移动的真实图片节点。

 if(b.querySelectorAll(':scope > .square').length!==64){
  const arrows=$('#arrows');arrows?.remove();b.replaceChildren();const frag=document.createDocumentFragment();
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
   const el=document.createElement('button');el.type='button';el.className='square';el.setAttribute('role','gridcell');
   el.addEventListener('click',()=>clickSquare(el.dataset.square));frag.append(el);
  }b.append(frag);if(arrows)b.append(arrows);
 }
 const cells=b.querySelectorAll(':scope > .square');
 // 棋子样式与主题在一次绘制内是常量，提到循环外避免 64 次 DOM 读取
 const artKey=document.documentElement.dataset.pieceStyle||'cburnett',themeKey=document.documentElement.dataset.theme||'walnut';
 // 一次绘制内，合法着法终点 / 被将军的王 / 终局状态都是常量，提前算一次
 const legalTargets=new Set(),legalCaptures=new Set();
 if(state.hintsEnabled!==false){
  for(const m of state.legal){
   legalTargets.add(m.to);
   if(m.flags?.includes('e'))legalCaptures.add(m.to[0]+m.from[1]);
   else if(m.captured)legalCaptures.add(m.to);
  }
 }
 const checked=g.isCheck();
 const resultBanner=finishBanner(g,moves),turnColor=g.turn(),over=!!resultBanner;
 // 用 classList 做差量更新：只有状态真的变了才动 DOM，
 // 避免每步重设 className 触发全盘样式重算。
 const base=(r,c)=>((r+c)%2?'square dark':'square light');
 for(let r=0;r<8;r++)for(let c=0;c<8;c++){
  const sq=locationFor(r,c),p=g.get(sq),el=cells[r*8+c],pieceKey=p?p.color+p.type+artKey+themeKey:'';
  if(el.dataset.square!==sq)el.dataset.square=sq;
  const wantLast=!!(last&&(last.from===sq||last.to===sq)),wantSel=state.selected===sq;
  const wantCheck=!!(p?.type==='k'&&p.color===turnColor&&checked);
  const wantCapture=legalCaptures.has(sq),wantMark=legalTargets.has(sq)||wantCapture;
  if(el.className!==base(r,c))el.className=base(r,c);
  el.classList.toggle('last',wantLast);el.classList.toggle('last-from',!!last&&last.from===sq);el.classList.toggle('last-to',!!last&&last.to===sq);
  el.classList.toggle('selected',wantSel);
  el.classList.toggle('check',wantCheck);
  el.classList.toggle('can-move',wantMark&&!wantCapture);
  el.classList.toggle('can-capture',wantCapture);
  const label=sq+' '+(p?(p.color==='w'?'白':'黑')+pieceName[p.type]:'空格');
  if(el.getAttribute('aria-label')!==label)el.setAttribute('aria-label',label);
  if(el.dataset.pieceKey!==pieceKey){
   const prior=el.querySelector(':scope > .piece');
   // 回收而不是丢弃：节点连带已解码的图片一起回到池子里，下一次落子直接复用
   if(prior)releasePiece(prior);
   el.dataset.pieceKey=pieceKey;
   if(p)el.prepend(acquirePiece(p.type,p.color));
  }
  const wantKind=wantCapture?'capture':wantMark?'dot':'';
  const tail=el.lastElementChild;
  const hasKind=(tail&&(tail.className==='dot'||tail.className==='capture'))?tail.className:'';
  if(hasKind!==wantKind){if(hasKind)tail.remove();if(wantKind){const mark=document.createElement('span');mark.className=wantKind;mark.setAttribute('aria-hidden','true');el.append(mark);}}
 }

 // 坐标标签只在翻转时需要改；翻转后动画坐标必须作废
 if(lastOrientation!==state.orientation){
  lastOrientation=state.orientation;
  geoCache=null;
  const rankLabels=$('.rank-labels')?.children,fileLabels=$('.file-labels')?.children;
  if(rankLabels)for(let j=0;j<rankLabels.length;j++)rankLabels[j].textContent=state.orientation==='w'?8-j:j+1;
  if(fileLabels)for(let j=0;j<fileLabels.length;j++)fileLabels[j].textContent=state.orientation==='w'?FILES[j]:FILES[7-j];
 }
 drawArrow();
 $('#side-badge').textContent=over?'对局结束':(turnColor==='w'?'白方':'黑方')+'行棋';
 $('#status').textContent=over?'对局结束':state.busy?'Stockfish 正在思考…':checked?'将军 · 请先应对':state.review?'当前棋谱可继续回放':state.mode==='free'?'打谱浏览 · 使用箭头切换着法':turnColor!==state.side?'轮到 Stockfish':'轮到'+(turnColor==='w'?'白方':'黑方');
 const end=$('#game-result');
 if(resultBanner){end.classList.remove('hidden');end.innerHTML=resultBanner;}
 else end.classList.add('hidden');
 $('#ply').textContent=state.view+' / '+moves.length;
 $('#ply').title=state.review?'剩余 '+(moves.length-state.view)+' 个半回合':'当前走棋记录';
 postReview?.sync();
}
let boardDrawPending=false,pendingBoardAction=null,boardFlush=false,undoRunning=false,exclusiveDone=Promise.resolve(),finishExclusive=null;
function boardAnimating(){return activeFlights.size>0||!!openingMotion||appearanceMotion.length>0;}
function boardLocked(){return boardAnimating()||undoRunning;}
function deferBoardAction(action){if(!boardLocked())return false;pendingBoardAction=action;return true;}
function flushBoardWork(){if(boardFlush)return;boardFlush=true;requestAnimationFrame(()=>{boardFlush=false;if(boardLocked())return;const action=pendingBoardAction;pendingBoardAction=null;if(action){action();return;}if(boardDrawPending){boardDrawPending=false;drawBoard();}});}
async function whenBoardIdle(){while(boardLocked()||pendingBoardAction){if(pendingBoardAction&&!boardLocked()){flushBoardWork();await new Promise(requestAnimationFrame);continue;}await Promise.all([whenFlightsIdle(),whenOpeningIdle(),...appearanceMotion.map(item=>item.animation.finished.catch(()=>{})),undoRunning?exclusiveDone:Promise.resolve()]);}}
function flipBoard(){if(deferBoardAction(flipBoard))return;animateOpening(()=>{state.orientation=state.orientation==='w'?'b':'w';clearBoardGeometry();drawBoard();});}
// Smooth piece movement, captures, castling, promotions and step-by-step playback.
let animationSerial=0;
// 格子几何：棋盘是固定网格，只在棋盘盒尺寸变化时重算一次，
// 避免每步动画都做多次 getBoundingClientRect 触发强制回流。
let geoCache=null;
function boardGeometry(){
 const box=$('#board').getBoundingClientRect();
 if(geoCache&&geoCache.w===box.width&&geoCache.h===box.height&&geoCache.ori===state.orientation)return geoCache;
 const unit=box.width/8,map={};
 for(let r=0;r<8;r++)for(let c=0;c<8;c++){
  const sq=(state.orientation==='w'?FILES[c]:FILES[7-c])+(state.orientation==='w'?8-r:r+1);
  map[sq]={x:(state.orientation==='w'?c:7-c)*unit,y:(state.orientation==='w'?r:7-r)*unit,w:unit,h:unit};
 }
 geoCache={w:box.width,h:box.height,ori:state.orientation,map};
 return geoCache;
}
const clearBoardGeometry=()=>{geoCache=null;};
function boardCell(square){return $('#board').querySelector(`[data-square="${square}"]`);}
function squareOffset(sq){
 const board=$('#board'),cell=boardCell(sq);
 if(!board||!cell)return null;
 const b=board.getBoundingClientRect(),c=cell.getBoundingClientRect();
 if(c.width<2||c.height<2)return null;
 return {x:c.left-b.left,y:c.top-b.top,w:c.width,h:c.height};
}
function pulseSquare(square,isCapture){const sq=boardCell(square);if(!sq)return;sq.classList.remove('pulse-move','pulse-capture');void sq.offsetWidth;sq.classList.add(isCapture?'pulse-capture':'pulse-move');setTimeout(()=>sq.classList.remove('pulse-move','pulse-capture'),650);}
/* 飞行中的棋子统一登记。任何一次重绘 / 新的走子都会先把它们落定，
   保证同一时刻只有一枚棋子在飞，也保证不会在动画中途被 DOM 抽走。 */
const activeFlights=new Set();
function settleFlights(){
 if(!activeFlights.size)return false;
 animationSerial++;
 for(const f of [...activeFlights])f.finish();
 activeFlights.clear();
 return true;
}
function whenFlightsIdle(){
 if(!activeFlights.size)return Promise.resolve();
 return Promise.all([...activeFlights].map(f=>f.promise).filter(Boolean)).catch(()=>{});
}
function takeMotionNodes(move,reverse=false){
 if(!move||!state.animEnabled||matchMedia('(prefers-reduced-motion: reduce)').matches)return null;
 const take=square=>{const cell=boardCell(square),node=cell?.querySelector(':scope > .piece');if(node){node.remove();cell.dataset.pieceKey='';}return node;};
 const result={mover:take(reverse?move.to:move.from),captured:null,rook:null};
 if(move.captured&&!reverse)result.captured=take(move.flags?.includes('e')?move.to[0]+move.from[1]:move.to);
 if(move.flags?.includes('k')||move.flags?.includes('q')){const rank=move.color==='w'?'1':'8',kingSide=move.flags.includes('k');result.rook=take((reverse?(kingSide?'f':'d'):(kingSide?'h':'a'))+rank);}
 return result;
}
function transition(m,reverse=false,snapshot=null){
 if(!m)return Promise.resolve();
 const from=reverse?m.to:m.from,to=reverse?m.from:m.to,isCapture=!!m.captured;
 const target=boardCell(to)?.querySelector(':scope > .piece'),src=squareOffset(from),end=squareOffset(to);
 showMoveCue(m,reverse);
 const releaseSnapshot=()=>{for(const node of Object.values(snapshot||{}))if(node)releasePiece(node);};
 if(!src||!end||!state.animEnabled||matchMedia('(prefers-reduced-motion: reduce)').matches){releaseSnapshot();playMoveSound(m);return Promise.resolve();}
 const duration=Math.round(Math.max(220,Math.min(360,210+Math.hypot(end.x-src.x,end.y-src.y)*.18))),serial=++animationSerial;
 const ghosts=[],anims=[],landings=[],recycle=[];
 const float=(node,square)=>{if(!node)return null;const loc=squareOffset(square),container=document.createElement('div');container.className='floating-piece';node.style.opacity='';container.append(node);const board=$('#board').getBoundingClientRect();Object.assign(container.style,{left:(loc.x/board.width*100)+'%',top:(loc.y/board.height*100)+'%',width:(loc.w/board.width*100)+'%',height:(loc.h/board.height*100)+'%'});$('#board').append(container);ghosts.push(container);return container;};
 const moving=snapshot?.mover||acquirePiece(reverse&&m.promotion?m.promotion:m.piece,m.color),mover=float(moving,from);
 if(target)target.style.opacity='0';landings.push({node:moving,target,square:to,promoted:!!m.promotion});
 if(snapshot?.captured){const captured=float(snapshot.captured,m.flags?.includes('e')?m.to[0]+m.from[1]:m.to);recycle.push(snapshot.captured);anims.push(captured.animate([{opacity:1,transform:'scale(1)'},{opacity:0,transform:'scale(.74)'}],{duration:duration*.75,easing:'ease-out',fill:'both'}));}
 if(reverse&&isCapture){const restored=boardCell(m.flags?.includes('e')?m.to[0]+m.from[1]:m.to)?.querySelector(':scope > .piece');if(restored)anims.push(restored.animate([{opacity:0},{opacity:1}],{duration,fill:'both',easing:'ease-out'}));}
 const frames=(x,y)=>[{transform:'translate3d(0,0,0)'},{transform:`translate3d(${x/src.w*100}%,${y/src.h*100}%,0)`}];
 const main=mover.animate(frames(end.x-src.x,end.y-src.y),{duration,easing:'cubic-bezier(.32,.02,.2,1)',fill:'both'});anims.push(main);
 if(snapshot?.rook){const rank=m.color==='w'?'1':'8',kingSide=m.flags.includes('k'),rf=(reverse?(kingSide?'f':'d'):(kingSide?'h':'a'))+rank,rt=(reverse?(kingSide?'h':'a'):(kingSide?'f':'d'))+rank,rookTarget=boardCell(rt)?.querySelector(':scope > .piece'),a=squareOffset(rf),b=squareOffset(rt),rook=float(snapshot.rook,rf);if(rookTarget)rookTarget.style.opacity='0';landings.push({node:snapshot.rook,target:rookTarget,square:rt});anims.push(rook.animate(frames(b.x-a.x,b.y-a.y),{duration,easing:'cubic-bezier(.32,.02,.2,1)',fill:'both'}));}
 let resolve,safety;const flight={done:false,promise:new Promise(ready=>resolve=ready)};
 flight.finish=()=>{if(flight.done)return;flight.done=true;clearTimeout(safety);for(const a of anims)a.cancel();for(const item of landings){if(item.promoted){releasePiece(item.node);if(item.target)item.target.style.opacity='';}else{if(item.target)releasePiece(item.target);item.node.remove();boardCell(item.square)?.prepend(item.node);item.node.style.opacity='';}}for(const node of recycle)releasePiece(node);for(const ghost of ghosts)ghost.remove();activeFlights.delete(flight);postReview?.motionSettled();resolve();flushBoardWork();};
 activeFlights.add(flight);postReview?.motionStarted(duration);playMoveSound(m);
 const finish=()=>{const latest=serial===animationSerial&&!flight.done;flight.finish();if(latest&&viewGame().isGameOver())showFinalCelebration();};
 safety=setTimeout(finish,duration+150);main.finished.then(finish,()=>{});return flight.promise;
}
function highlightCheck(mate=false){const king=$('#board .square.check');if(!king)return;king.classList.remove('check-flash','check-mate-flash','check-nudge');void king.offsetWidth;king.classList.add(mate?'check-mate-flash':'check-flash');}
function nudgeCheckedKing(g){
 if(!g?.isCheck())return;
 const king=$('#board .square.check');if(!king)return;
 king.classList.add('check-nudge');
 const pulse=king.getAnimations({subtree:true}).find(animation=>animation.animationName==='check-response');
 // Repeated clicks during the same short pulse do not restart or stack it.
 if(!pulse)king.classList.remove('check-nudge');
 king.onanimationend=event=>{if(event.animationName==='check-response'){king.classList.remove('check-nudge');king.onanimationend=null;}};
}
function showFinalCelebration(){const e=$('#game-result');if(e.classList.contains('hidden'))return;e.classList.remove('result-enter');void e.offsetWidth;e.classList.add('result-enter');}
function showMoveCue(m,reverse=false){const action=reverse?'回退':m.san?.includes('#')?'将死':m.flags?.includes('k')||m.flags?.includes('q')?'王车易位':m.captured?'吃子':m.san?.includes('+')?'将军':'走子';const piece=pieceName[m.piece]||'棋子';const notation=m.san||m.from+'–'+m.to;$('#move-cue').textContent=`${action} · ${notation} · ${piece}${m.captured?' 吃 '+pieceName[m.captured]:''}${m.promotion?' 升变为'+pieceName[m.promotion]:''}`;}
let soundContext;
function playMoveSound(m){try{soundContext??=new (window.AudioContext||window.webkitAudioContext)();if(soundContext.state==='suspended')soundContext.resume();const now=soundContext.currentTime;const notes=m.captured?[660,420]:m.san?.includes('+')?[680,870]:[515];notes.forEach((frequency,i)=>{const osc=soundContext.createOscillator(),gain=soundContext.createGain();osc.type='sine';osc.frequency.setValueAtTime(frequency,now+i*.052);gain.gain.setValueAtTime(.001,now+i*.052);gain.gain.exponentialRampToValueAtTime(.043,now+i*.052+.01);gain.gain.exponentialRampToValueAtTime(.001,now+i*.052+.085);osc.connect(gain).connect(soundContext.destination);osc.start(now+i*.052);osc.stop(now+i*.052+.095);});}catch{}}
function destMoves(square){
 const dest=state.legal.filter(m=>m.to===square);
 if(dest.length)return dest;
 return state.legal.filter(m=>m.flags?.includes('e')&&(m.to[0]+m.from[1])===square);
}
function playChosen(moves){
 if(!moves.length)return;
 const from=moves[0].from,to=moves[0].to;
 if(moves.some(m=>m.flags?.includes('p'))){askPromotion(from,to,moves[0].color||'w');return;}
 makeMove({from,to,promotion:moves[0].promotion});
}
function clickSquare(square){if(boardLocked())return;if(state.mode==='free'){toast('打谱模式仅供浏览，请使用箭头切换着法');return;}if(state.busy||state.promo)return;const g=viewGame();if(g.isGameOver())return;
 stopPlayback();
 if(state.mode==='book'&&!state.duelStarted){toast('请先点击「开始对弈」');return;}
 if(state.mode==='book'&&!state.review&&g.turn()!==state.side){toast('电脑行棋中；可切换为「打谱研究」操作双方');return;}
 const piece=g.get(square);
 if(state.selected){
  const moves=destMoves(square);
  if(moves.length){playChosen(moves);return;}
  const pickingOwn=piece&&piece.color===g.turn()&&square!==state.selected;
  if(!pickingOwn){
   if(g.isCheck()){nudgeCheckedKing(g);$('#move-cue').textContent='正在被将军 · 请先应将';return;}
   state.selected=null;state.legal=[];drawBoard();return;
  }
 }
 if(piece&&piece.color===g.turn()){
  state.selected=square;state.legal=g.moves({square,verbose:true});state.arrow=null;drawBoard();
  if(g.isCheck()&&!state.legal.length){
   nudgeCheckedKing(g);
   $('#move-cue').textContent=piece.type==='k'?'正在被将军 · 王暂无安全格子':'正在被将军 · 这枚棋子无法应将';
  }else $('#move-cue').textContent=state.legal.length?`已选 ${pieceName[piece.type]} · 圆点可走 · 圆环可吃`:`${pieceName[piece.type]} 当前没有合法着法`;
 }else{state.selected=null;state.legal=[];drawBoard();}
}
function clearHints(){state.selected=null;state.legal=[];state.arrow=null;state.analysis=null;}
function makeMove(m,{auto=false,quiet=false}={}){
 if(boardLocked()||state.mode==='book'&&!state.duelStarted||!auto&&state.mode==='book'&&viewGame().turn()!==state.side)return false;
 stopPlayback();let applied,snapshot;
 const legal=fromUci(viewGame(),m.from+m.to+(m.promotion||''));if(!legal)return false;
 snapshot=quiet?null:takeMotionNodes(legal);
 if(state.mode==='book'&&!state.duelStarted)return false;
 try{
  if(state.mode==='book'&&!auto&&viewGame().turn()!==state.side)return false;
  if(state.review||state.view!==history().length){
   state.game=cloneRecord(state.game,state.view,state.origin);state.game.header('Result','*');
   state.review=false;state.reviewTitle='';state.currentScoreId=null;state.currentScoreSource=null;
  }
  applied=state.game.move({from:m.from,to:m.to,promotion:m.promotion});
  state.game.header('Result',gameResult(state.game));invalidateViewMemo();
 }catch{for(const node of Object.values(snapshot||{}))if(node)releasePiece(node);drawBoard();if(!auto)toast('不是合法着法');return false;}
 const gen=state.generation;
 state.view=history().length;clearHints();postReview?.prepareMotion(state.view);
 drawBoard();
 if(!quiet){
  const landed=boardCell(applied.to)?.querySelector(':scope > .piece');
  if(landed)landed.style.opacity='0';
 }
 const fly=quiet?Promise.resolve():transition(applied,false,snapshot);
 if(quiet&&applied)showMoveCue(applied);
 if(state.mode==='book'&&state.duelStarted)state.busy=true;
 const wrapUp=()=>{
  if(gen!==state.generation)return;
  state.busy=false;drawBoard();refreshPanels();
  const done=viewGame();
  if(done.isCheckmate())toast('将死 · '+(applied.color==='w'?'白方':'黑方')+'获胜');
  else if(done.isStalemate())toast('逼和 · 本局判和');
  else if(done.isDraw())toast('和棋');
  if(!auto&&state.mode==='book'&&state.duelStarted)maybeBookReply();
  else state.busy=false;
 };
 Promise.resolve(fly).then(wrapUp);
 return true;
}
let playController=null;
function cancelBusy(){state.generation++;state.busy=false;playController?.abort();playController=null;}
function reset(){
 if(deferBoardAction(reset))return;
 if(state.mode==='book'){beginDuel();return;}
 openLocalScore(LESSONS.find(lesson=>lesson.id==='italian'));
}
function goto(p,{resumeComputer=true}={}){
 if(boardLocked())return Promise.resolve(false);
 const old=state.view,next=Math.min(history().length,Math.max(0,p));if(next===old)return Promise.resolve(false);
 cancelBusy();const moves=cachedHistory(),m=Math.abs(old-next)===1?moves[Math.min(old,next)]:null,snapshot=m?takeMotionNodes(m,next<old):null;
 if(m&&state.animEnabled&&!matchMedia('(prefers-reduced-motion: reduce)').matches)postReview?.prepareMotion(next);
 const update=()=>{state.view=next;clearHints();drawAll();};let motion;
 if(m){update();motion=transition(m,next<old,snapshot);}else motion=animateOpening(update);
 return Promise.resolve(motion).then(()=>{if(resumeComputer&&state.mode==='book'&&!state.review&&state.view===cachedHistory().length&&viewGame().turn()!==state.side&&!viewGame().isGameOver())maybeBookReply();return true;});
}
async function undo(){
 if(boardLocked())return;stopPlayback();
 if(state.review||state.view<history().length){goto(state.view-1);return;}
 cancelBusy();const count=state.mode==='book'&&state.game.turn()===state.side?2:1;
 undoRunning=true;exclusiveDone=new Promise(ready=>finishExclusive=ready);
 try{for(let i=0;i<count&&history().length;i++){const move=cachedHistory().at(-1),snapshot=takeMotionNodes(move,true);state.game.undo();state.game.header('Result','*');invalidateViewMemo();state.view=history().length;clearHints();postReview?.prepareMotion(state.view);drawAll();await transition(move,true,snapshot);}}
 finally{undoRunning=false;finishExclusive?.();finishExclusive=null;$('#move-cue').textContent='已悔棋';flushBoardWork();}
 if(state.mode==='book'&&state.game.turn()!==state.side&&!state.game.isGameOver())maybeBookReply();
}
const UCI_RE=/^[a-h][1-8][a-h][1-8][qrbn]?$/;
// 由着法查棋局对象：先按 UCI 前四位建索引，避免对每个候选都重新生成整盘合法着法。
const uciCache=new WeakMap();
function uciMap(g){
 let m=uciCache.get(g);
 if(!m||m.fen!==g.fen()){const moves=new Map();for(const x of g.moves({verbose:true}))moves.set(x.from+x.to+(x.promotion||''),x);m={fen:g.fen(),moves};uciCache.set(g,m);}
 return m.moves;
}
function fromUci(g,uci){
 if(!UCI_RE.test(uci||''))return null;
 return uciMap(g).get(uci)||null;
}
function moveUci(m){return m.from+m.to+(m.promotion||'');}
function botLevel(){return Number($('#bot-level')?.value||2);}
function enginePosition(g=viewGame()){
 return {fen:g.fen(),origin:state.origin,moves:cachedHistory().slice(0,state.view).map(moveUci)};
}
async function maybeBookReply(){
 const requestedGeneration=state.generation;
 await whenBoardIdle();
 if(requestedGeneration!==state.generation)return;
 if(state.mode!=='book'||!state.duelStarted||state.review||playbackTimer!==null||state.view!==history().length)return;
 if(playController&&!playController.signal.aborted)return;
 const g=viewGame();if(g.turn()===state.side||g.isGameOver()){state.busy=false;return;}
 const token=++state.generation,fen=g.fen();
 playController?.abort();const controller=playController=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),12000);
 state.busy=true;$('#retry-engine').classList.add('hidden');drawBoard();
 try{
  const data=await engineRequest('/api/play',{...enginePosition(g),level:botLevel()},{signal:controller.signal});
  await whenBoardIdle();
  if(token!==state.generation||state.mode!=='book'||state.view!==history().length||viewGame().fen()!==fen)return;
  const move=fromUci(g,data.uci);
  if(!data.ok||!move)throw Error(data.message||'Stockfish 未返回合法着法');
  state.engineError='';makeMove(move,{auto:true});
 }catch(error){
  if(token!==state.generation)return;
  state.busy=false;state.engineError=error.name==='AbortError'?'Stockfish 响应超时，请重试。':error.message;
  drawBoard();$('#status').textContent=state.engineError;
  $('#retry-engine').classList.remove('hidden');toast(state.engineError);
 }finally{clearTimeout(timeout);if(playController===controller)playController=null;}
}
function loadPosition(fen,title='残局练习'){if(deferBoardAction(()=>loadPosition(fen,title)))return false;try{const game=new Chess(fen);animateOpening(()=>{stopPlayback();invalidateViewMemo();cancelBusy();state.game=game;state.origin=game.fen();state.view=0;state.orientation=game.turn();state.review=true;state.reviewTitle=title;clearHints();drawAll();});return true;}catch{toast('无法读取此残局局面');return false;}}
function loadPgn(pgn,title='',targetPly=null){if(deferBoardAction(()=>loadPgn(pgn,title,targetPly)))return false;try{const game=new Chess();game.loadPgn(pgn,{strict:false});const moves=game.history({verbose:true});if(!moves.length)throw Error('空棋谱');animateOpening(()=>{stopPlayback();invalidateViewMemo();state.currentScoreId=null;state.currentScoreSource=null;cancelBusy();state.game=game;state.origin=game.header()?.FEN||defaultFen;state.view=Number.isInteger(targetPly)?Math.min(targetPly,moves.length):0;state.orientation='w';state.review=true;state.reviewTitle=title||'参考棋谱';clearHints();drawAll();});
 if(finishBanner(game,moves)&&state.view>=moves.length)showFinalCelebration();
 return true;}catch(e){console.warn('PGN parse failed',e);toast('棋谱格式无法解析');return false;}}
// 着法记录：只在棋谱长度变化时重建 DOM，回放时仅切换选中态，
// 并用事件委托取代逐个按钮绑定，长棋谱下不再每次走棋都产生上百个监听器。
let movesRenderedLen=-1,movesRenderedId=null;
function renderMoves(){
 const arr=cachedHistory(),div=$('#movelist');
 if(!arr.length){const text=state.mode==='book'?'从第一步开始，记录会自动出现。':state.review?'局面练习，请查看引擎分析。':'选择棋谱，展示全部着法。';if(div.textContent!==text)div.textContent=text;movesRenderedLen=0;movesRenderedId='';return;}
 const id=state.game;
 if(movesRenderedLen!==arr.length||movesRenderedId!==id){
  div.innerHTML=recordRows(state.game).map(row=>`<span class="move-pair"><span class="move-num">${row.number}${row.white?'.':'...'}</span>${row.white?`<button class="move-token" data-ply="${row.white.ply}">${safeText(row.white.san)}</button>`:'<span class="move-token-placeholder"></span>'}${row.black?`<button class="move-token" data-ply="${row.black.ply}">${safeText(row.black.san)}</button>`:''}</span>`).join('');
  movesRenderedLen=arr.length;movesRenderedId=id;
 }
 const prev=div.querySelector('.move-token.selected');
 if(prev)prev.classList.remove('selected');
 const active=div.querySelector(`[data-ply="${state.view}"]`);
 if(active){active.classList.add('selected');
  const a=active.getBoundingClientRect(),box=div.getBoundingClientRect();
  if(a.bottom>box.bottom)div.scrollTop+=a.bottom-box.bottom+6;else if(a.top<box.top)div.scrollTop-=box.top-a.top+6;}
}
function refreshPanels(){renderMoves();scheduleEngine();markCurrentScore();}
function drawAll(){drawBoard();refreshPanels();}
function download(text,name,type='application/x-chess-pgn'){const blob=new Blob([text],{type:type+';charset=utf-8'}),u=URL.createObjectURL(blob),link=document.createElement('a');link.href=u;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(u),2000);}
function pad2(n){return String(n).padStart(2,'0');}
function pgnDate(d=new Date()){return d.getFullYear()+'.'+pad2(d.getMonth()+1)+'.'+pad2(d.getDate());}
function pgnFileName(d=new Date()){return '棋谱_'+d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate())+'_'+pad2(d.getHours())+'-'+pad2(d.getMinutes())+'-'+pad2(d.getSeconds())+'.pgn';}
function currentPgn(){return standardPgn(state.game);}
function exportPgn(){
 if(!history().length&&state.origin===defaultFen){toast('还没有可导出的着法');return;}
 download(currentPgn(),pgnFileName());toast('已导出标准 PGN 棋谱');
}
async function openDb(){return new Promise((resolve,reject)=>{const request=indexedDB.open('ChessAtelierLibraryV4',1);request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains('games'))db.createObjectStore('games',{keyPath:'id'});};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
function dbTransaction(mode,cb){return new Promise((resolve,reject)=>{const tx=state.db.transaction('games',mode),store=tx.objectStore('games');let result;try{result=cb(store);}catch(e){reject(e);return;}tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('本地存储事务已取消'));});}
function readUserPacks(){try{return [...new Set(JSON.parse(localStorage.getItem('ChessAtelierUserPacks')||'[]').filter(x=>typeof x==='string'&&x.trim()).map(personalPackName))].filter(x=>x!=='我的棋谱');}catch{return [];}}
function writeUserPacks(list){state.userPacks=[...new Set(list.map(x=>x.trim()).filter(Boolean))];try{localStorage.setItem('ChessAtelierUserPacks',JSON.stringify(state.userPacks));}catch{}}
function rememberUserPack(name){if(!name||isPinnedPack(name)||ALL_PACKS.some(p=>p.label===name)||['开局示范','开局主线','战术范例','残局练习'].includes(name))return;writeUserPacks([...readUserPacks(),name]);}
function isBuiltinPack(label){return ALL_PACKS.some(p=>p.label===label);}
function isPinnedPack(label){return personalPackName(label)==='我的棋谱';}
function isUserPack(label){return isPinnedPack(label)||state.userPacks.includes(label);}
function isMutableScore(x){const id=x.id||'';return id.startsWith('import-')||id.startsWith('save-');}
function userExtras(){return state.userPacks.filter(n=>n&&!isBuiltinPack(n)&&!isPinnedPack(n));}
function readMineOrder(){
 const extras=userExtras();
 const allowed=new Set(['我的棋谱',...extras]);
 let order;try{order=JSON.parse(localStorage.getItem('ChessAtelierMineOrder')||'[]');}catch{order=[];}
 if(!Array.isArray(order))order=[];
 order=[...new Set(order.map(personalPackName).filter(n=>allowed.has(n)))];
 for(const n of ['我的棋谱',...extras])if(!order.includes(n))order.push(n);
 return order;
}
function writeMineOrder(order){try{localStorage.setItem('ChessAtelierMineOrder',JSON.stringify(order));}catch{}}
async function removeLocalScore(entry,{quiet=false}={}){
 if(!entry||!isMutableScore(entry)){if(!quiet)toast('内置棋谱不能删除');return false;}
 try{if(state.db)await dbTransaction('readwrite',store=>store.delete(entry.id));}
 catch{if(!quiet)toast('删除失败，棋谱已保留，请重试');return false;}
 try{state.fullKeys.delete(scoreSignature(entry));}catch{}
 state.local=state.local.filter(x=>x.id!==entry.id);state.rebuildArchiveOptions?.();
 if(starredIds.has(entry.id)){starredIds.delete(entry.id);try{writeStarredScores(localStorage,starredIds);}catch{}}
 if(state.currentScoreId===entry.id){state.currentScoreId=null;state.currentScoreSource=null;}
 collectionDirty=true;renderCollection();renderPackDialog();
 if(!quiet)toast('已从合集中移除');
 return true;
}
function askPromotion(from,to,color){
 const box=$('#promo-choice');if(!box){makeMove({from,to,promotion:'q'});return;}
 state.promo={from,to};
 const side=color==='b'?'b':'w';
 box.innerHTML=['q','r','b','n'].map(p=>`<button type="button" data-promo="${p}" aria-label="${pieceName[p]}">${pieceSvg(p,side)}</button>`).join('');
 showSurface(box);
}
function hidePromotion(){state.promo=null;hideSurface($('#promo-choice'));}
function lessonOrigin(l){
 if(l.stage==='开局')return '开局示范';
 if(l.stage==='残局')return '残局练习';
 if(l.stage==='中局')return '战术范例';
 return l.origin||'课程';
}
function parsePgnHeaders(chunk){
 const h={};
 for(const m of String(chunk).matchAll(/^\[(\w+)\s+"([^"]*)"\]/gm))h[m[1]]=m[2];
 return h;
}
function scoreSignature(entry){
 return entry.id||[entry.origin||'',entry.pgn||entry.fen||''].join('|');
}
async function initLocal(){
 state.userPacks=readUserPacks();
 state.local=LESSONS.map(l=>({id:l.id,title:l.title,pgn:l.pgn,fen:l.fen,origin:lessonOrigin(l),stage:l.stage,white:'',black:'',date:''}));
 refreshArchiveCount();
 try{state.db=await openDb();const saved=await new Promise((resolve,reject)=>{const tx=state.db.transaction('games','readonly'),req=tx.objectStore('games').getAll();req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error);});
  for(let i=0;i<saved.length;i++){
   const item=saved[i];if(!item?.pgn&&!item?.fen)continue;
   if(item.origin)rememberUserPack(item.origin);
   if(!state.local.some(x=>x.id===item.id)){state.local.push(item);}
   if(i%40===0)await new Promise(r=>setTimeout(r,0));
  }
 }catch(e){console.warn('IndexedDB unavailable',e);}
 state.rebuildArchiveOptions?.();renderCollection();
 loadBuiltinScores();
}
async function loadBuiltinScores(){
 $('#collection').setAttribute('aria-busy','true');
 // Keep parsing / IDs in catalog order, but overlap up to four network round trips.
 const packs=SCORE_PACKS.filter(pack=>!state.archiveLoaded.has(pack.id)),pending=new Map();
 const prefetch=index=>{
  for(let i=index;i<Math.min(index+4,packs.length);i++)if(!pending.has(i)){
   const pack=packs[i];
   pending.set(i,fetch('./data/complete/'+pack.file+(pack.revision?'?v='+pack.revision:''),{cache:'force-cache'})
    .then(async response=>{if(!response.ok)throw Error('PGN HTTP '+response.status);return {text:await response.text()};})
    .catch(error=>({error})));
  }
 };
 for(let index=0;index<packs.length;index++){
  prefetch(index);const pack=packs[index];
  try{
   const result=await pending.get(index);pending.delete(index);
   if(result.error)throw result.error;
   const parts=splitPgn(result.text);
   for(let i=0;i<parts.length;i++){
    const h=parsePgnHeaders(parts[i]);
    const white=h.White||'白方',black=h.Black||'黑方';
    const title=h.TrainingTitle||(pack.kind==='study'?`残局研究 ${i+1} · ${h.Event||white}`:pack.kind==='fragment'?`${white} — ${black} · 第 ${h.FEN?.split(' ')[5]||'?'} 回合`:pack.kind==='line'?`${pack.label} ${i+1}`:`${white} — ${black}`);
    const positionOnly=pack.kind==='course'&&h.PlyCount==='0'&&h.FEN;
    const obj={id:'complete-'+pack.id+'-'+(h.SourceRecordId||i),title,pgn:positionOnly?'':parts[i],fen:positionOnly?h.FEN:'',origin:pack.label,stage:pack.kind==='study'||pack.kind==='fragment'?'残局':pack.kind==='puzzle'||pack.kind==='course'?'专题':'实战',white,black,date:h.Date||'',result:h.Result||'',eco:h.ECO||'',event:h.Event||'',puzzleRating:h.PuzzleRating||'',puzzleSide:h.PuzzleId?h.FEN?.split(' ')[1]:'',bookChapter:h.BookChapter||''};
    const sig=scoreSignature(obj);
    if(state.fullKeys.has(sig))continue;
    state.fullKeys.add(sig);
    state.local.push(obj);
    if(i%80===0)await new Promise(ok=>setTimeout(ok,0));
   }
   state.archiveLoaded.add(pack.id);
   collectionDirty=true;refreshArchiveCount();state.rebuildArchiveOptions?.();renderCollection();
  }catch(e){console.warn('builtin pack unavailable',pack.id,e);}
 }
 setStatus('');
 collectionDirty=true;
 refreshArchiveCount();
 state.rebuildArchiveOptions?.();
 $('#collection').setAttribute('aria-busy','false');
}
function addCompleteScore(entry,opts={}){
 if(!entry?.pgn)return false;
 const sig=scoreSignature(entry);
 if(state.fullKeys.has(sig))return false;state.fullKeys.add(sig);
 if(!opts.alreadyLocal)state.local.push(entry);
 state.classicsCount++;
 return true;
}
// 载入状态统一显示在棋谱列表上方，避免再单开一块状态面板。
let libraryStatus='';
function setStatus(text){libraryStatus=text||'';const el=$('#library-status');if(el)el.textContent=libraryStatus;}
function refreshArchiveCount(){
 collectionDirty=true;
 state.rebuildArchiveOptions?.();
 renderCollection();
 
}
let libraryCategory='openings',libraryPacks={},libraryQueries={};
function rememberLibraryView(){
 libraryPacks[libraryCategory]=$('#archive-select').value;
 try{localStorage.setItem('ChessAtelierLibraryViewV1',JSON.stringify({category:libraryCategory,packs:libraryPacks}));}catch{}
}
function setLibraryCategory(category,{pack,query}={}){
 if(!PACK_GROUPS.some(g=>g.id===category))return;
 libraryPacks[libraryCategory]=$('#archive-select').value;
 libraryQueries[libraryCategory]=$('#filter-collection').value;
 libraryCategory=category;
 libraryPacks[category]=pack||'';
 libraryQueries[category]=query||'';
 $('#filter-collection').value=libraryQueries[category]||'';
 state.rebuildArchiveOptions?.();
 collectionLimit=LIST_PAGE;collectionDirty=true;$('#collection').scrollTop=0;
 renderCollection();rememberLibraryView();
}
function initializeArchives(){
  const select=$('#archive-select'),tabs=$('#library-categories');
 try{
  const saved=JSON.parse(localStorage.getItem('ChessAtelierLibraryViewV1')||'{}');
  if(PACK_GROUPS.some(g=>g.id===saved.category))libraryCategory=saved.category;
 }catch{}
 const rebuild=()=>{
  const group=PACK_GROUPS.find(g=>g.id===libraryCategory);
  const selected=libraryPacks[libraryCategory]||'';
  let packs;
  if(libraryCategory==='mine'){
   const names=[...new Set([...readMineOrder(),...state.local.filter(x=>scoreCategory(x)==='mine').map(collectionPackName)])];
   packs=names.map(label=>({id:isPinnedPack(label)?'mine:'+label:'extra:'+label,label}));
  }else{
   packs=ALL_PACKS.filter(p=>p.group===libraryCategory);
   const legacy=[...new Set(state.local.filter(x=>scoreCategory(x)===libraryCategory).map(collectionPackName))].filter(label=>!packs.some(p=>p.label===label));
   packs=[...packs,...legacy.map(label=>({id:'legacy:'+label,label,section:'其他内置棋谱'}))];
  }
  const sections=new Map();
  for(const p of packs){const section=p.section||(libraryCategory==='masters'?'棋手名局':'');if(!sections.has(section))sections.set(section,[]);sections.get(section).push(p);}
   const parts=[];
   if(libraryCategory==='mine')parts.push('<option value="mine:starred">星标收藏 ★</option>');
  for(const [section,items] of sections){
   if(section)parts.push(`<optgroup label="${safeText(section)}">`);
   for(const p of items)parts.push(`<option value="${safeText(p.id)}">${safeText(p.label)}</option>`);
   if(section)parts.push('</optgroup>');
  }
  select.innerHTML=parts.join('');select.value=[...select.options].some(o=>o.value===selected)?selected:select.options[0]?.value||'';
  libraryPacks[libraryCategory]=select.value;
  $('#filter-collection').placeholder=libraryCategory==='openings'?'搜索开局名称':libraryCategory==='masters'?'搜索棋手 / 赛事':libraryCategory==='training'?'搜索主题 / 棋谱':'搜索我的棋谱';
  $('#import').title=libraryCategory==='mine'?'向当前个人合集导入 PGN':'导入到「我的棋谱」';
  $('.library-actions').hidden=libraryCategory!=='mine';
  const counts={openings:0,masters:0,training:0,mine:0};
  for(const score of state.local){const category=scoreCategory(score);counts[category]++;if(category!=='mine'&&starredIds.has(score.id))counts.mine++;}
  for(const button of tabs.querySelectorAll('[data-category]')){
   const active=button.dataset.category===libraryCategory;
   button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;
   button.querySelector('.category-count').textContent=N(counts[button.dataset.category]);
  }
  $('#collection').setAttribute('aria-labelledby','category-'+libraryCategory);
 };
 state.rebuildArchiveOptions=rebuild;
 select.addEventListener('change',()=>{rememberLibraryView();collectionLimit=LIST_PAGE;collectionDirty=true;$('#collection').scrollTop=0;renderCollection();});
 tabs.addEventListener('click',event=>{const tab=event.target.closest('[data-category]');if(tab)setLibraryCategory(tab.dataset.category);});
 tabs.addEventListener('keydown',event=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();const buttons=[...tabs.querySelectorAll('[data-category]')],i=buttons.findIndex(b=>b.dataset.category===libraryCategory);
  const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(i+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;
  setLibraryCategory(buttons[next].dataset.category);buttons[next].focus();
 });
 rebuild();
}
function splitPgn(pgn){const source=pgn.replace(/\r\n/g,'\n').trim();if(!source)return[];const chunks=source.split(/(?=^\[Event\s+")/m).filter(x=>x.trim());return chunks.length?chunks:[source];}
function currentImportOrigin(){
 if(state.pendingImportPack)return state.pendingImportPack;
 const value=$('#archive-select')?.value||'';
 if(value.startsWith('extra:'))return value.slice(6);
 if(['mine:导入','mine:我的保存','mine:我的棋谱'].includes(value))return '我的棋谱';
 return '';
}
function selectArchivePack(label){
 const select=$('#archive-select');if(!select)return;
 if(isPinnedPack(label))label='我的棋谱';
 const builtin=ALL_PACKS.find(p=>p.label===label),category=builtin?builtin.group:'mine';
 const id=isPinnedPack(label)?'mine:'+label:builtin?builtin.id:'extra:'+label;
 setLibraryCategory(category,{pack:id,query:''});
}
function openPackDialog(){
 state.packConfirm='';
 const cur=currentImportOrigin();
 state.packFocus=cur&&isUserPack(cur)?cur:(userExtras()[0]||'我的棋谱');
 renderPackDialog();
 $('#pack-dialog')?.showModal();
 $('#pack-name')?.focus();
}
function closePackDialog(){$('#pack-dialog')?.close();}
function renderPackDialog(){
 const list=$('#pack-list'),games=$('#pack-games'),labelEl=$('#pack-games-label');
 if(!list||!games)return;
 const rows=readMineOrder();
 if(!rows.includes(state.packFocus))state.packFocus=rows[0]||'我的棋谱';
 list.innerHTML=rows.map((name,i)=>{
  const n=state.local.filter(x=>collectionPackName(x)===name).length;
  const pinned=isPinnedPack(name);
  const confirming=state.packConfirm===name;
  return `<div class="pack-row${name===state.packFocus?' is-current':''}" data-pack="${safeText(name)}">
   <button type="button" class="pack-pick" data-pack="${safeText(name)}"><b>${safeText(name)}</b><small>${N(n)} 局</small></button>
   <button type="button" class="pack-icon" data-move="-1" data-pack="${safeText(name)}" ${i?'':'disabled'} title="上移">↑</button>
   <button type="button" class="pack-icon" data-move="1" data-pack="${safeText(name)}" ${i<rows.length-1?'':'disabled'} title="下移">↓</button>
   ${pinned?'':`<button type="button" class="pack-icon pack-del${confirming?' is-warn':''}" data-del="${safeText(name)}">${confirming?'确认':'删除'}</button>`}
  </div>`;
 }).join('');
 const focus=state.packFocus;
 if(labelEl)labelEl.textContent=focus?('· '+focus):'';
 const items=state.local.filter(x=>collectionPackName(x)===focus);
 games.innerHTML=items.length?items.map(x=>`<div class="pack-game"><span>${safeText(displayName(x))}</span>${isMutableScore(x)?`<button type="button" class="pack-icon" data-drop="${safeText(x.id)}" title="移除">×</button>`:''}</div>`).join(''):'<p class="pack-note">还没有棋谱，可多次点「加入棋谱」导入 PGN。</p>';
}
function createPackFromDialog(){
 const name=($('#pack-name')?.value||'').trim();
 if(!name){toast('请先填写合集名称');return;}
 if(name==='星标收藏'||isBuiltinPack(name)||isPinnedPack(name)||userExtras().includes(name)){toast('已有同名合集');return;}
 rememberUserPack(name);
 $('#pack-name').value='';
 state.packFocus=name;state.packConfirm='';
 state.rebuildArchiveOptions?.();
 selectArchivePack(name);
 collectionDirty=true;renderCollection();renderPackDialog();
 toast('合集「'+name+'」已创建，可继续加入棋谱');
}
function moveUserPack(name,dir){
 const order=readMineOrder();
 const i=order.indexOf(name);if(i<0)return;
 const j=i+Number(dir);if(j<0||j>=order.length)return;
 [order[i],order[j]]=[order[j],order[i]];
 writeMineOrder(order);
 writeUserPacks(order.filter(n=>!isPinnedPack(n)&&!isBuiltinPack(n)));
 state.rebuildArchiveOptions?.();
 renderPackDialog();
}
async function deleteUserPack(name){
 if(!name||isBuiltinPack(name)||isPinnedPack(name))return;
 if(state.packConfirm!==name){state.packConfirm=name;renderPackDialog();return;}
 const doomed=state.local.filter(x=>collectionPackName(x)===name&&isMutableScore(x));
 for(const x of doomed)if(!await removeLocalScore(x,{quiet:true})){
  state.packConfirm='';renderPackDialog();toast('合集未删除，部分棋谱移除失败，请重试');return;
 }
 writeUserPacks(userExtras().filter(n=>n!==name));
 writeMineOrder(readMineOrder().filter(n=>n!==name));
 state.packConfirm='';
 state.packFocus='我的棋谱';
 state.rebuildArchiveOptions?.();
 selectArchivePack('我的棋谱');
 collectionDirty=true;renderCollection();renderPackDialog();
 toast('已删除合集「'+name+'」');
}
async function importFiles(files){if(!files.length)return;if(!state.db)toast('本次导入仅在当前页面有效，建议导出 PGN 备份');
 const keepDialog=!!$('#pack-dialog')?.open;
 let origin=currentImportOrigin();
 if(!origin)origin=keepDialog?(state.packFocus||'我的棋谱'):'我的棋谱';
 if(isBuiltinPack(origin))origin='我的棋谱';
 if(!isPinnedPack(origin))rememberUserPack(origin);
 let imported=0,rejected=0,processed=0;setStatus('正在解析棋谱…');
 for(const file of files){if(file.size>24*1024*1024){rejected++;continue;}
  const text=await file.text(),parts=splitPgn(text);
  for(let i=0;i<parts.length&&i<4000;i++){
   processed++;const chunk=parts[i];let g;try{g=new Chess();g.loadPgn(chunk,{strict:false});if(!g.history().length)throw Error();}catch{rejected++;continue;}
   const headers=g.header(),white=headers.White||'',black=headers.Black||'',date=headers.Date||'',name=white&&black?white+' — '+black:(headers.Event||file.name)+' '+(i+1);
   const id='import-'+Date.now()+'-'+Math.random().toString(36).slice(2,12),obj={id,title:name,pgn:g.pgn()||chunk,origin,white,black,date,result:headers.Result||'',stage:'实战'};
   try{if(state.db)await dbTransaction('readwrite',store=>store.put(obj));state.local.push(obj);imported++;}catch(e){rejected++;}
   if(processed%30===0){setStatus(`已索引 ${N(imported)} 局…`);await new Promise(r=>setTimeout(r,0));}
  }
 }
 const pending=state.pendingImportPack;
 state.pendingImportPack='';
 setStatus(rejected?`已导入 ${N(imported)} 局 · ${N(rejected)} 局未解析`:'');
 collectionDirty=true;state.rebuildArchiveOptions?.();selectArchivePack(origin);renderCollection();
 const dlg=$('#pack-dialog');
 if(keepDialog||pending){if(dlg&&!dlg.open)dlg.showModal();renderPackDialog();}
 toast('已导入 '+N(imported)+' 局到「'+origin+'」');
}
// ---- 棋谱库：按来源分组呈现，替代此前的平铺长列表 ----
// 棋手名清洗：PGN 头信息里常有替换字符、问号占位、HTML 实体与多余空白，
// 直接展示会变成乱码。这里统一整理成「姓, 名」并过滤掉不可显示内容。
function cleanPlayerName(raw){
 let v=String(raw??'')
  .replace(/�/g,'')
  .replace(/&[a-z]+;/gi,' ')
  .replace(/<[^>]*>/g,' ')
  .replace(/[\u0000-\u001f\u007f]/g,' ')
  .replace(/\s+/g,' ')
  .trim();
 if(!v||/^[?\s.\-]+$/.test(v))return '';
 // "Morphy, Paul" → "Paul Morphy"，中文或无逗号的名字原样保留
 if(v.includes(',')){
  const [last,...rest]=v.split(',').map(s=>s.trim()).filter(Boolean);
  if(last&&rest.length)v=rest.join(' ')+' '+last;
 }
 return v.replace(/[^\p{L}\p{N}\s.'’-]/gu,'').replace(/\s+/g,' ').trim();
}
// 清洗日期：PGN 头信息里未知的月 / 日写作 ??.??，直接显示就成了乱码。
function cleanDate(raw){
 const s=String(raw??'').replace(/[^\d?.-]/g,'').trim();
 if(!s||/^[?.-]+$/.test(s))return '';
 const year=s.split('.')[0]||'';
 return /^\d{4}$/.test(year)?year:'';
}
function cleanTitle(raw,white,black,date){
 const w=cleanPlayerName(white),b=cleanPlayerName(black);
 // 标题里常内嵌「 · 1953.??.??」这类日期尾巴，先去掉再统一附加清洗后的年份
 let t=String(raw??'').replace(/[\u0000-\u001f\ufffd]/g,'')
  .replace(/\s*[·|]\s*\d{4}\.\?{2}\.\?{2}\s*$/g,'')
  .replace(/\s*[·|]\s*[?\s.]+$/,'')
  .replace(/\s+/g,' ').trim();
 if(!t||/^[?\s.-]+$/.test(t)||/^[\d.\s?]+$/.test(t))t=(w&&b)?w+' — '+b:'';
 if(!t)return '';
 const year=cleanDate(date);
 if(year&&!t.includes(year)&&!t.includes(year.slice(2)))t+=' · '+year;
 return t;
}
function displayName(x){
 const w=cleanPlayerName(x.white),b=cleanPlayerName(x.black);
 if(w&&b&&/^[?\s.\-]+$/.test(String(x.title||'')))return w+' — '+b;
 //标题里已经含有双方名字则原样使用（避免重复）
 if(w&&b&&x.title&&x.title.includes(w.split(' ').pop())&&x.title.includes(b.split(' ').pop()))return cleanTitle(x.title);
 return cleanTitle(x.title)||(w&&b?w+' — '+b:'未命名对局');
}
// 合集下拉的 value 用 pack.id，显示用 label；棋谱记录 origin 用 label。
function packLabelById(id){return ALL_PACKS.find(p=>p.id===id)?.label||(id.startsWith('extra:')?id.slice(6):id.startsWith('mine:')?id.slice(5):id);}
function packIdByLabel(label){return ALL_PACKS.find(p=>p.label===label)?.id||label;}
function collectionGroupOf(x){
 return scoreCategory(x);
}
function collectionPackName(x){
 return scorePackName(x);
}
function collectionRowMeta(x){
 const parts=[];
 if(x.puzzleSide)parts.push(x.puzzleSide==='w'?'白方先行':'黑方先行');
 const year=cleanDate(x.date);
 if(year)parts.push(year);
 if(x.eco&&/^[A-E]\d{2}$/.test(x.eco))parts.push('ECO '+x.eco);
 // 合集名在搜索栏已经可见，行内再重复一次只是噪音，这里只保留年份与 ECO
 const pack=collectionPackName(x);
 if(pack&&['*','mine:starred'].includes($('#archive-select').value))parts.unshift(pack);
 return parts.filter(Boolean).join(' · ');
}
function collectionRowHtml(x,idx){
 const meta=collectionRowMeta(x);
 const current=x.id===state.currentScoreId;
 const drop=isMutableScore(x);
 const starred=starredIds.has(x.id),name=safeText(displayName(x));
 return `<div class="library-row${current?' is-current':''}" data-score-id="${safeText(x.id)}"${current?' aria-current="true"':''}><button type="button" class="library-open" data-local="${idx}"><span class="row-main"><b>${name}</b>${meta?`<small>${safeText(meta)}</small>`:''}</span></button><button type="button" class="score-star" data-star="${safeText(x.id)}" aria-label="${starred?'取消收藏':'收藏'}：${name}" aria-pressed="${starred}" title="${starred?'取消星标':'星标收藏'}"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m12 3 2.8 5.7 6.3.9-4.6 4.5 1.1 6.3L12 17.4l-5.6 3 1.1-6.3-4.6-4.5 6.3-.9Z"/></svg></button>${drop?`<button type="button" class="row-remove" data-remove="${idx}" aria-label="从合集中移除：${name}" title="从合集中移除">×</button>`:''}</div>`;
}
let visibleScores=[],collectionLimit=LIST_PAGE,collectionSig='';
// 棋谱库列表：合集筛选 + 关键词搜索 → 一份扁平列表。
// 只渲染当前页（LISR_PAGE 行），滚动到底自动加页，
// 因此即使本地有几千局棋谱，DOM 里始终只有几十个节点，操作保持流畅。
function collectionFilter(){
 const term=$('#filter-collection').value.toLowerCase().trim(),pack=$('#archive-select').value;
 return state.local.filter(x=>{
  if(!scoreInCollection(x,libraryCategory,pack,starredIds.has(x.id)))return false;
  if(!term)return true;
  return searchBlob(x).includes(term);
 });
}
function renderCollection(full=true){
 updateCollectionGuide();
 const list=$('#collection');if(!list)return;
 if(full||collectionDirty){
  collectionDirty=false;
  const keepScroll=list.scrollTop;
  const found=collectionFilter();
  visibleScores=found;
  const slice=found.slice(0,collectionLimit);
  list.innerHTML=slice.length?slice.map((x,i)=>collectionRowHtml(x,i)).join('')
   :`<p class="hint">${$('#archive-select').value==='mine:starred'?'暂无星标棋谱，点击棋谱右侧的星星即可收藏。':libraryCategory==='mine'&&!state.local.some(x=>scoreCategory(x)==='mine')?'还没有个人棋谱，可以导入 PGN 或保存当前对局。':'当前分类没有匹配的棋谱，试试其他关键词或切换本分类的合集。'}</p>`;
  list.scrollTop=keepScroll;
  const meta=$('#collection-meta');
  if(meta)meta.textContent=collectionContext(found.length);
  return;
 }
 const found=visibleScores;
 const slice=found.slice(0,collectionLimit);
 const existing=list.querySelectorAll('.library-row').length;
 if(existing>=slice.length)return;
 const extra=slice.slice(existing);
 if(extra.length)list.insertAdjacentHTML('beforeend',extra.map((x,i)=>collectionRowHtml(x,existing+i)).join(''));
 const meta=$('#collection-meta');
 if(meta)meta.textContent=collectionContext(found.length);
}
function updateCollectionGuide(){
 const guide=$('#collection-guide');if(!guide)return;
 const pack=ALL_PACKS.find(p=>p.id===$('#archive-select').value);
 guide.hidden=!pack?.description;
 if(guide.dataset.pack!==pack?.id){guide.open=false;guide.dataset.pack=pack?.id||'';}
 if(!pack?.description)return;
 guide.querySelector('p').textContent=pack.description;
 const link=guide.querySelector('a');link.textContent=pack.referenceTitle||'原始来源';link.href=pack.referenceUrl||'#';
}
function collectionContext(count){
 const kind=ALL_PACKS.find(pack=>pack.id===$('#archive-select').value)?.kind;
 return `${N(count)} ${kind==='puzzle'?'题':kind==='course'?'章':'局'}`;
}
function markCurrentScore(){
 const list=$('#collection');if(!list||!list.firstElementChild)return;
 const rows=list.querySelectorAll('.library-row'),idx=visibleScores.findIndex(x=>x.id===state.currentScoreId);
 rows.forEach((row,i)=>{const on=i===idx;row.classList.toggle('is-current',on);
  if(on)row.setAttribute('aria-current','true');else row.removeAttribute('aria-current');});
}
function openLocalScore(source){
 if(deferBoardAction(()=>openLocalScore(source)))return;
 if(!source)return;
 if((source.pgn?loadPgn(source.pgn,source.title):source.fen?loadPosition(source.fen,source.title):false)){
  state.currentScoreId=source.id;state.currentScoreSource=source;
  markCurrentScore();
 }
}
function fillSavePackSelect(){
 const sel=$('#save-pack');if(!sel)return;
 const names=['我的棋谱',...userExtras()];
 sel.innerHTML=names.map(n=>`<option value="${safeText(n)}">${safeText(n)}</option>`).join('');
 const cur=currentImportOrigin();
 sel.value=names.includes(cur)?cur:'我的棋谱';
}
function openSaveDialog(){
 const pgn=currentPgn();if(!history().length){toast('先走几步再保存');return;}
 fillSavePackSelect();
 $('#save-title').value=state.reviewTitle||('学习棋局 '+new Date().toLocaleDateString('zh-CN'));
 $('#save-dialog')?.showModal();
 $('#save-title')?.focus();
}
function confirmSaveGame(){
 const pgn=currentPgn();if(!pgn.trim()){toast('还没有可保存的着法');return;}
 const name=($('#save-title')?.value||'').trim();if(!name){toast('请填写棋谱名称');return;}
 let origin=personalPackName(($('#save-pack')?.value||'').trim());
 if(isBuiltinPack(origin))origin='我的棋谱';
 if(!isPinnedPack(origin))rememberUserPack(origin);
 const id='save-'+Date.now()+'-'+Math.random().toString(36).slice(2,10),source={id,title:name,origin,pgn,stage:'复盘'};
 $('#save-dialog')?.close();
 if(!state.db){download(pgn,pgnFileName());toast('浏览器存储不可用，已导出 PGN');return;}
 dbTransaction('readwrite',store=>store.put(source)).then(()=>{state.local.push(source);collectionDirty=true;state.rebuildArchiveOptions?.();selectArchivePack(origin);renderCollection();renderPackDialog();toast('棋谱已保存到「'+origin+'」');}).catch(()=>toast('保存失败，请使用「导出 PGN」备份'));
}
function saveGame(){openSaveDialog();}
analysisUi=setupLocalAnalysis({state,viewGame,cachedHistory,enginePosition,drawArrow,maybeBookReply,toast});
const {scheduleEngine,refreshEngineStatus}=analysisUi;
postReview=setupPostReview({state,cachedHistory,enginePosition,goto,drawArrow,analysis:analysisUi,whenFlightsIdle:()=>Promise.all([whenFlightsIdle(),whenOpeningIdle()])});
const playIcon='<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l9 7-9 7z" fill="currentColor" stroke="none"/></svg>';
const pauseIcon='<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 5v14M16 5v14"/></svg>';
function stopPlayback({resumeComputer=false}={}){
 const wasPlaying=playbackTimer!==null;
 if(wasPlaying)clearInterval(playbackTimer);
 playbackTimer=null;playbackEnd=null;
 const button=$('#autoplay');
 if(button){button.innerHTML=playIcon;button.setAttribute('aria-pressed','false');button.setAttribute('aria-label','自动播放棋谱');button.title='自动播放棋谱';}
 if(wasPlaying&&resumeComputer&&state.mode==='book'&&state.duelStarted&&!state.review&&state.view===history().length&&state.game.turn()!==state.side&&!state.game.isGameOver())maybeBookReply();
}
function togglePlayback(){
 if(playbackTimer!==null){stopPlayback({resumeComputer:true});return;}
 const end=history().length;
 if(!end){toast('当前还没有可放映的着法');return;}
 // Freeze the recorded endpoint and pause a pending computer request before reviewing.
 cancelBusy();settleFlights();
 if(state.view>=end)goto(0,{resumeComputer:false});
 playbackEnd=end;
 const button=$('#autoplay');button.innerHTML=pauseIcon;button.title='暂停播放';button.setAttribute('aria-label','暂停放映');button.setAttribute('aria-pressed','true');
 playbackTimer=setInterval(()=>{
  const target=Math.min(playbackEnd,history().length);
  if(state.view>=target){stopPlayback({resumeComputer:true});return;}
  goto(state.view+1,{resumeComputer:false});
  if(state.view>=target)stopPlayback({resumeComputer:true});
 },850);
}
let openingMotion=null;
function clearOpeningMotion(){
 const active=openingMotion;if(!active)return;openingMotion=null;
 for(const animation of active.animations)animation.cancel();
 for(const node of active.oldNodes)releasePiece(node);
 active.layer?.remove();$('#board').classList.remove('is-opening');$('#board').removeAttribute('aria-busy');
 active.resolve();flushBoardWork();
}
function whenOpeningIdle(){return openingMotion?.done||Promise.resolve();}
function animateOpening(update,{animate=true}={}){
 clearOpeningMotion();clearAppearanceMotion();settleFlights();
 postReview?.boardResetStarted();state.arrow=null;drawArrow();analysisUi?.boardReset();
 const board=$('#board'),motion=animate&&state.animEnabled&&!matchMedia('(prefers-reduced-motion: reduce)').matches;
 const layer=document.createElement('div'),oldNodes=[];
 layer.className='opening-layer';layer.setAttribute('aria-hidden','true');
 if(motion)for(const cell of board.querySelectorAll(':scope > .square')){
  const slot=document.createElement('div');slot.className='opening-cell';layer.append(slot);
  const node=cell.querySelector(':scope > .piece');
  if(node){slot.append(node);oldNodes.push(node);cell.dataset.pieceKey='';}
 }
 update();
 if(!motion)return;
 let resolve;const done=new Promise(ready=>resolve=ready),active={animations:[],oldNodes,layer,resolve,done};
 openingMotion=active;board.classList.add('is-opening');board.setAttribute('aria-busy','true');
 const startTime=document.timeline.currentTime;
 const run=(node,frames,options)=>{
  const animation=node.animate(frames,{...options,fill:'both'});animation.startTime=startTime;active.animations.push(animation);
 };
 if(oldNodes.length){
  board.append(layer);
  // Scaling one grid keeps all old piece sizes and distances proportional.
  run(layer,[{transform:'scale(1)',opacity:1},{offset:.35,opacity:.3},{transform:'scale(0)',opacity:0}],{duration:320,easing:'cubic-bezier(.55,.055,.675,.19)'});
 }
 for(const [index,cell] of [...board.querySelectorAll(':scope > .square')].entries()){
  const node=cell.querySelector(':scope > .piece');if(!node)continue;
  const row=Math.floor(index/8),col=index%8,edge=Math.min(row,7-row,col,7-col);
  let x=0,y=0;if(col===edge)x=-26;if(7-col===edge)x=26;if(row===edge)y=-26;if(7-row===edge)y=26;
  const along=x?Math.min(row,7-row):Math.min(col,7-col),delay=(oldNodes.length?330:0)+edge*95+along*14;
  run(node,[{transform:`translate(${x}%,${y}%) scale(.45)`,opacity:0},{transform:'translate(0,0) scale(1)',opacity:1}],{duration:340,delay,easing:'cubic-bezier(.16,1,.3,1)'});
 }
 Promise.all(active.animations.map(animation=>animation.finished.catch(()=>{}))).then(()=>{if(openingMotion===active)clearOpeningMotion();});
 return done;
}
let requestedTheme='walnut',requestedPieceStyle='cburnett',appearanceSequence=0,appearanceMotion=[];
function clearAppearanceMotion(){
 for(const {animation,ghost} of appearanceMotion){animation.cancel();ghost?.remove();}
 appearanceMotion=[];$('#board').classList.remove('is-changing-art');
}
function appearanceAnimation(node,frames,duration,ghost=null,startTime=null,easing='cubic-bezier(.4,0,.2,1)'){
 const animation=node.animate(frames,{duration,easing,fill:'both'});
 if(startTime!==null)animation.startTime=startTime;
 const entry={animation,ghost};appearanceMotion.push(entry);
 const done=animation.finished.catch(()=>{}).then(()=>{
  animation.cancel();ghost?.remove();appearanceMotion=appearanceMotion.filter(item=>item!==entry);if(!appearanceMotion.length)$('#board').classList.remove('is-changing-art');flushBoardWork();
 });
 return done;
}
async function changeAppearance(animate){
 if(deferBoardAction(()=>changeAppearance(animate)))return;
 const sequence=++appearanceSequence,theme=requestedTheme,style=requestedPieceStyle,root=document.documentElement;
 clearOpeningMotion();clearAppearanceMotion();
 const themeChanged=root.dataset.theme!==theme,styleChanged=(root.dataset.pieceStyle||'cburnett')!==style;
 if(!themeChanged&&!styleChanged){setPieceStyle(style);return;}
 const prepared=animate?await preparePieceArt(theme,style):[];
 if(sequence!==appearanceSequence)return;
 const motion=animate&&!matchMedia('(prefers-reduced-motion: reduce)').matches;
 await whenBoardIdle();if(sequence!==appearanceSequence)return;
 const previous=motion?[...$('#board').querySelectorAll('.square > .piece')].map(node=>{
  const square=node.parentElement.dataset.square;
  // Reuse the already rendered image instead of cloning an image that must load again.
  node.remove();return {square,node};
 }):[];
 root.dataset.theme=theme;setPieceStyle(style);resetPiecePool();preloadPieceArt(prepared);drawBoard();
 if(motion){
  $('#board').classList.add('is-changing-art');
  // Style changes have two halves: retract the old set completely, then grow the new set.
  // Keep both on one timeline; ghosts are removed rather than restored on completion.
  const startTime=null,duration=styleChanged?480:240;
  for(const {square,node} of previous){
   node.classList.add('appearance-ghost');$('#board').querySelector(`[data-square="${square}"]`).append(node);
   appearanceAnimation(node,styleChanged?[{transform:'scale(1)',opacity:1},{offset:.12,opacity:.1},{offset:.5,transform:'scale(0)',opacity:0},{transform:'scale(0)',opacity:0}]:[{opacity:1},{offset:.3,opacity:1},{opacity:0}],duration,node,startTime,styleChanged?'ease-in-out':'cubic-bezier(.4,0,.2,1)');
  }
  for(const node of $('#board').querySelectorAll('.square > .piece:not(.appearance-ghost)')){
   appearanceAnimation(node,styleChanged?[{transform:'scale(0)',opacity:0},{offset:.5,transform:'scale(0)',opacity:0},{transform:'scale(1)',opacity:1}]:[{opacity:0},{offset:.7,opacity:1},{opacity:1}],duration,null,startTime,styleChanged?'ease-in-out':'cubic-bezier(.4,0,.2,1)');
  }
  // Anchor the whole set to the first paint after all effects have been installed.
  // A busy SVG/layout frame must not consume the shrink phase before it is visible.
  setTimeout(()=>warmPieceStyles(theme),220);
  const effects=appearanceMotion.map(entry=>entry.animation);for(const animation of effects)animation.pause();
  requestAnimationFrame(time=>{if(sequence!==appearanceSequence)return;const active=new Set(appearanceMotion.map(entry=>entry.animation));for(const animation of effects){if(!active.has(animation))continue;animation.play();animation.startTime=time;}});
 }
}
function applyPieceStyle(value,{animate=true}={}){
 requestedPieceStyle=['cburnett','maestro','mpchess','totoy'].includes(value)?value:'cburnett';
 $('#piece-style').value=requestedPieceStyle;
 try{localStorage.setItem('ChessAtelierPieceStyleV3',requestedPieceStyle);}catch{}
 return changeAppearance(animate);
}
function applyTheme(value,{animate=true}={}){
 requestedTheme=['sage','walnut','slate','oat','mist','blush'].includes(value)?value:'walnut';
 $('#theme').value=requestedTheme;
 try{localStorage.setItem('ChessAtelierTheme',requestedTheme);}catch{}
 return changeAppearance(animate);
}
function initializeThemeMotion(){
 const root=document.documentElement,computed=getComputedStyle(root);
 if(window.CSS?.registerProperty)for(const name of ['bg','paper','sub','ink','muted','line','accent','accent-soft','gold','light','dark','w','d','b','capture-color','move-color','engine-opponent']){
  try{CSS.registerProperty({name:'--'+name,syntax:'<color>',inherits:true,initialValue:computed.getPropertyValue('--'+name).trim()});}catch{}
 }
 root.classList.add('appearance-ready');
}
function setPlayMode(mode,{animate=true}={}){
 if(deferBoardAction(()=>setPlayMode(mode,{animate})))return;
 const next=mode==='book'?'book':'free';
 stopPlayback();settleFlights();cancelBusy();hidePromotion();
 state.mode=next;
 state.currentScoreId=null;state.currentScoreSource=null;
 state.game=new Chess();stampNewRecord();state.origin=defaultFen;state.view=0;
 state.review=false;state.reviewTitle='';
 state.duelStarted=false;
 if(next==='book'){state.side='w';state.orientation='w';syncSideSelect('w');}
 else{state.orientation='w';const lesson=LESSONS.find(item=>item.id==='italian');state.game.loadPgn(lesson.pgn);state.review=true;state.reviewTitle=lesson.title;state.currentScoreId=lesson.id;state.currentScoreSource=lesson;}
 clearBoardGeometry();
 invalidateViewMemo();clearHints();
 $('#mode').value=next;
 $$('#mode-segment button').forEach(b=>{let active=b.dataset.playMode===next;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active));});
 $$('.mode-book-only').forEach(el=>el.classList.toggle('hidden',next!=='book'));
 $$('.mode-free-only').forEach(el=>el.classList.toggle('hidden',next==='book'));
 document.body.dataset.playMode=next;$('#right-heading').textContent=next==='book'?'对局':'棋谱';
 $('#record-heading').textContent=next==='book'?'着法记录':'棋谱着法';
 if(next==='book')beginDuel({animate});
 else animateOpening(()=>{$('#duel-start').textContent='开始对弈';$('#move-cue').textContent='初始局面 · 使用箭头浏览棋谱';drawAll();},{animate});
}
function syncSideSelect(side){
 const sel=$('#side');if(!sel)return;
 if(sel.value!==side)sel.value=side;
 const lab=document.querySelector('#atelier-side .atelier-selected-label');
 if(lab)lab.textContent=sel.selectedOptions[0]?.textContent||(side==='b'?'黑方':'白方');
 document.querySelectorAll('#atelier-list-side .atelier-option').forEach(o=>o.setAttribute('aria-selected',String(o.dataset.value===side)));
}
function stampDuelRecord(){
 const computer='Stockfish',level=Number($('#bot-level').value),elos={1:1300,2:1600,3:1900,4:2200,5:2600,6:3000};
 state.game.header('Event','Local Computer Game','Site','Local','White',state.side==='w'?'Player':computer,'Black',state.side==='b'?'Player':computer,state.side==='w'?'BlackType':'WhiteType','program');
 delete state.game._headers.WhiteElo;delete state.game._headers.BlackElo;
 if(elos[level])state.game.header(state.side==='w'?'BlackElo':'WhiteElo',String(elos[level]));
}
function stampNewRecord(){state.engineError='';state.game.header('Event','Casual Game','Site','Local','Date',pgnDate(),'Round','-','White','?','Black','?','Result','*');}
function beginDuel({animate=true}={}){
 if(deferBoardAction(()=>beginDuel({animate})))return;
 animateOpening(()=>{
 stopPlayback();settleFlights();cancelBusy();hidePromotion();
 state.currentScoreId=null;state.currentScoreSource=null;state.duelStarted=true;
 state.game=new Chess();stampNewRecord();state.origin=defaultFen;state.view=0;
 state.review=false;state.reviewTitle='';
 stampDuelRecord();state.orientation=state.side;clearBoardGeometry();invalidateViewMemo();clearHints();drawAll();
 $('#duel-start').textContent='重新开始';
 $('#move-cue').textContent=state.side==='b'?'电脑先行':'初始局面 · 点击棋子开始';
 if(state.side==='b'){
  const gen=state.generation;
  requestAnimationFrame(()=>{
   clearBoardGeometry();
   requestAnimationFrame(()=>{if(gen===state.generation)maybeBookReply();});
  });
 }
 },{animate});
}
let brandSpin=null;
function flipBrandKnight(){
 const flip=document.querySelector('.brand-flip');if(!flip||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 if(brandSpin)return;
 const turn=()=>{
  const animation=flip.animate([{transform:'rotateY(0deg)'},{transform:'rotateY(360deg)'}],{duration:1120,easing:'linear',fill:'forwards'});
  brandSpin=animation;
  animation.finished.then(()=>{
   if(brandSpin!==animation)return;
   // 360° and 0° have the same pixels; never cancel a rotation in the middle.
   flip.style.transform='rotateY(0deg)';brandSpin=null;animation.cancel();
  }).catch(()=>{});
 };
 turn();
}
window.addEventListener('pagehide',()=>{brandSpin?.cancel();brandSpin=null;});
function setupEvents(){
 document.addEventListener('pointerdown',event=>{const guide=$('#collection-guide');if(guide?.open&&!guide.contains(event.target))hideSurface(guide.querySelector('.collection-guide-body'),()=>{guide.open=false;});});
 $('#board').addEventListener('error',e=>{if(e.target.matches('.piece-art-img'))e.target.closest('.assetpiece')?.classList.add('asset-fallback-mode');},true);
 $('#home').addEventListener('click',e=>{e.preventDefault();flipBrandKnight();});
 $('#autoplay').addEventListener('click',togglePlayback);
 $('#duel-start').addEventListener('click',beginDuel);$('#reset').addEventListener('click',reset);$('#undo').addEventListener('click',undo);
 $('#first').addEventListener('click',()=>{stopPlayback();goto(0);});$('#prev').addEventListener('click',()=>{stopPlayback();goto(state.view-1);});$('#next').addEventListener('click',()=>{stopPlayback();goto(state.view+1);});$('#last').addEventListener('click',()=>{stopPlayback();goto(history().length);});
 $('#flip').addEventListener('click',()=>{
  flipBoard();
 });
 $('#save').addEventListener('click',saveGame);$('#export').addEventListener('click',exportPgn);
 $('#mode').addEventListener('change',e=>setPlayMode(e.target.value));
 $$('#mode-segment button').forEach(b=>b.addEventListener('click',()=>setPlayMode(b.dataset.playMode)));
 $('#bot-level').addEventListener('change',event=>{if(state.mode==='book'&&!state.review&&!event.detail?.engineOptions){stampDuelRecord();toast('难度已更新，下一次电脑思考时生效');}});
 $('#side').addEventListener('change',e=>{
  cancelBusy();
  state.side=e.target.value==='b'?'b':'w';
  state.orientation=state.side;
  if(state.mode==='book')beginDuel();
  else{clearBoardGeometry();drawBoard();}
 });
 // 设置弹窗：右上角齿轮
 $('#settings-toggle').addEventListener('click',()=>{const d=$('#settings-dialog');surfaceOpen(d)?d.close():d.showModal();warmPieceStyles(requestedTheme);});
 $('#settings-close').addEventListener('click',()=>$('#settings-dialog').close());
 $('#settings-dialog').addEventListener('close',()=>$('#settings-toggle').setAttribute('aria-expanded','false'));
 $('#settings-dialog').addEventListener('click',e=>{if(e.target===$('#settings-dialog'))$('#settings-dialog').close();});
 $('#import').addEventListener('click',()=>{state.pendingImportPack=currentImportOrigin()&&!isBuiltinPack(currentImportOrigin())?currentImportOrigin():'';$('#fileinput').click();});
 $('#new-pack')?.addEventListener('click',openPackDialog);
 $('#pack-close')?.addEventListener('click',closePackDialog);
 $('#pack-dialog')?.addEventListener('click',e=>{if(e.target===$('#pack-dialog'))closePackDialog();});
 $('#pack-create')?.addEventListener('click',createPackFromDialog);
 $('#pack-name')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();createPackFromDialog();}});
 $('#pack-add-games')?.addEventListener('click',()=>{state.pendingImportPack=state.packFocus;selectArchivePack(state.packFocus);($('#pack-fileinput')||$('#fileinput')).click();});
 $('#pack-list')?.addEventListener('click',e=>{
  const del=e.target.closest('[data-del]');if(del){deleteUserPack(del.dataset.del);return;}
  const mv=e.target.closest('[data-move]');if(mv){moveUserPack(mv.dataset.pack,mv.dataset.move);return;}
  const pick=e.target.closest('[data-pack]');if(pick){state.packFocus=pick.dataset.pack;state.packConfirm='';renderPackDialog();}
 });
 $('#pack-games')?.addEventListener('click',e=>{
  const drop=e.target.closest('[data-drop]');if(!drop)return;
  const entry=state.local.find(x=>x.id===drop.dataset.drop);if(entry)removeLocalScore(entry);
 });
 $('#save-close')?.addEventListener('click',()=>$('#save-dialog')?.close());
 $('#save-dialog')?.addEventListener('click',e=>{if(e.target===$('#save-dialog'))$('#save-dialog').close();});
 $('#save-confirm')?.addEventListener('click',confirmSaveGame);
 $('#save-title')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();confirmSaveGame();}});
 $('#promo-choice')?.addEventListener('click',e=>{
  const b=e.target.closest('[data-promo]');if(!b||!state.promo)return;
  const {from,to}=state.promo;hidePromotion();makeMove({from,to,promotion:b.dataset.promo});
 });
 const onPick=async e=>{await importFiles([...e.target.files]);e.target.value='';};
 $('#fileinput').addEventListener('change',onPick);
 $('#pack-fileinput')?.addEventListener('change',onPick);
 // 搜索输入做 140ms 防抖：连续输入时不再每敲一下就重建整份列表
 let searchTimer;
 $('#filter-collection').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{collectionLimit=LIST_PAGE;renderCollection();},140);});
 // 着法记录：事件委托，长棋谱下无需为每个着法绑定监听
 $('#movelist').addEventListener('click',e=>{const b=e.target.closest('[data-ply]');if(b){stopPlayback();goto(Number(b.dataset.ply));}});
 // 棋谱库扁平列表：选择对局（事件委托，避免每次重渲染重复绑定）
 $('#collection').addEventListener('click',e=>{
  const star=e.target.closest('[data-star]');if(star){toggleStarredScore(star.dataset.star);return;}
  const rm=e.target.closest('[data-remove]');
  if(rm){e.preventDefault();e.stopPropagation();removeLocalScore(visibleScores[Number(rm.dataset.remove)]);return;}
  const row=e.target.closest('[data-local]');
  if(row)openLocalScore(visibleScores[Number(row.dataset.local)]);
 });
 // 滚动到底自动追加下一批，DOM 中始终只保留少量行
 $('#collection').addEventListener('scroll',()=>{
  const list=$('#collection');
  // 一次追加两页：把「滚到底才多 60 行」变成「滚到底多 240 行」，
 // 几千局的库只需 2~3 次滚动就能看到全部
 if(list.scrollTop+list.clientHeight>=list.scrollHeight-80&&collectionLimit<visibleScores.length){
  collectionLimit=Math.min(collectionLimit+LIST_PAGE*2,visibleScores.length);
  renderCollection(false);
 }
 },{passive:true});
 $('#theme').addEventListener('change',e=>applyTheme(e.target.value));
 $('#piece-style').addEventListener('change',e=>applyPieceStyle(e.target.value));
 $('#animation-speed').addEventListener('change',e=>{state.animEnabled=e.target.value!=='off';});
 const applyHints=on=>{if(deferBoardAction(()=>applyHints(on)))return;state.hintsEnabled=on;const sel=$('#move-hints');if(sel)sel.value=on?'on':'off';try{localStorage.setItem('ChessAtelierMoveHints',on?'on':'off');}catch{}drawBoard();};
 applyHints((()=>{try{return localStorage.getItem('ChessAtelierMoveHints')!=='off';}catch{return true;}})());
 $('#move-hints')?.addEventListener('change',e=>applyHints(e.target.value!=='off'));
 // Center the result on the boundary between the board's two lowest visible ranks.
 new ResizeObserver(()=>{
  const board=$('#board'),result=$('#game-result');
  result.style.left=(board.offsetLeft+board.offsetWidth/2)+'px';
  result.style.top=(board.offsetTop+board.offsetHeight*7/8)+'px';
 }).observe($('#board'));
 addEventListener('resize',()=>{clearBoardGeometry();},{passive:true});
 document.addEventListener('keydown',e=>{if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName)||document.querySelector('dialog[open]'))return;if(e.key==='ArrowLeft'){e.preventDefault();stopPlayback();goto(state.view-1);}if(e.key==='ArrowRight'){e.preventDefault();stopPlayback();goto(state.view+1);}});
}
installDialogMotion(document.querySelectorAll('dialog'));
const guide=$('#collection-guide');guide?.querySelector('summary')?.addEventListener('click',event=>{event.preventDefault();const body=guide.querySelector('.collection-guide-body');if(guide.open&&surfaceOpen(body))hideSurface(body,()=>{guide.open=false;});else{guide.open=true;showSurface(body);}});
initializeArchives();setupEvents();setupLogoEasterEgg();setupPeriodMusic();try{applyTheme(localStorage.getItem('ChessAtelierTheme'),{animate:false});}catch{applyTheme('walnut',{animate:false});}
try{const stored=localStorage.getItem('ChessAtelierPieceStyleV3');applyPieceStyle(['cburnett','maestro','mpchess','totoy'].includes(stored)?stored:'cburnett',{animate:false});}catch{applyPieceStyle('cburnett',{animate:false});}
initializeThemeMotion();
// 先把棋子图片全部预热成「已解码」的备用节点，之后任何一次落子都只是搬一个现成节点，
// 不会再出现新 <img> 等 onload 的那一次淡入。
preloadPieceArt();
preparePieceArt(requestedTheme,requestedPieceStyle);
setTimeout(()=>warmPieceStyles(requestedTheme),700);
refreshEngineStatus();
setPlayMode('free',{animate:false});drawAll();initLocal();

})();