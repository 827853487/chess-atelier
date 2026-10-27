import { surfaceOpen, showSurface, hideSurface, installDialogMotion } from './surface-motion.js';
import { setupLocalAnalysis } from './analysis-ui.js';
import { setupPostReview } from './post-review.js';
import { LESSONS } from './library.js';
import { setupPeriodMusic } from './period-music.js';
import { pieceSvg, setPieceStyle, acquirePiece, releasePiece, resetPiecePool, preloadPieceArt, preparePieceArt, warmPieceStyles } from './piece-art.js';
import { SCORE_PACKS, PACK_GROUPS, ALL_PACKS, scorePackName, scoreCategory, scoreInCollection, personalPackName } from './master-collections.js';
import { setupLogoEasterEgg } from './logo-easter-egg.js';
import { readStarredScores, writeStarredScores } from './favorites.js';
import { RECENT_KEY, createTrialRecord, planPositionReturn, readRecentGames, updateRecentGames, writeRecentGames } from './game-sessions.js';

// Bundled rules module: no network dependency for board and PGN playback.
import { Chess } from './vendor/chess.js';
import { cloneRecord, recordRows, gameResult, standardPgn, recordEnding } from './game-record.js';
import { engineRequest, scoreValue, scoreLabel, moveQuality } from './engine-client.js';
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
let positionPinned=false,pinnedStudy=null,lockedStudyPosition=null,duelSession=null,recentGames=[];
try{recentGames=readRecentGames(localStorage);}catch{}
let recentStorageWarned=false;
const recentCopiesPending=new Set();
function rememberRecentGame(){
 if(state.mode!=='book'||!state.duelStarted||!duelSession?.hasMoves)return;
 const pgn=currentPgn();if(pgn===duelSession.savedPgn)return;
 const now=new Date(),entry={id:duelSession.id,pgn,title:duelSession.title||('人机对弈 · 执'+(state.side==='b'?'黑':'白')),origin:'最近对局',recent:true,updatedAt:now.toISOString(),side:state.side,orientation:state.orientation,ply:history().length,result:gameResult(state.game),basePly:duelSession.basePly};
 try{if(localStorage.getItem(RECENT_KEY)!==null)recentGames=readRecentGames(localStorage);}catch{}
 recentGames=updateRecentGames(recentGames,entry);
 try{writeRecentGames(localStorage,recentGames);duelSession.savedPgn=pgn;recentStorageWarned=false;}catch{if(!recentStorageWarned){recentStorageWarned=true;toast('最近对局未能写入，请导出 PGN 备份');}}
 collectionDirty=true;renderRecentGames();
 if(libraryCategory==='mine'&&$('#archive-select').value==='mine:recent')renderCollection();
}
function newDuelSession(basePly=0,title=''){
 duelSession={id:'recent-'+(globalThis.crypto?.randomUUID?.()||Date.now()+'-'+Math.random().toString(36).slice(2)),basePly,title,hasMoves:false,savedPgn:''};
}
function studySnapshot(){return {game:state.game,origin:state.origin,view:state.view,orientation:state.orientation,review:state.review,reviewTitle:state.reviewTitle,currentScoreId:state.currentScoreId,currentScoreSource:state.currentScoreSource};}
function updatePinControls(){
 $('#restore-study').hidden=!positionPinned||!lockedStudyPosition;
}
function captureLockedPosition(){
 const snapshot=studySnapshot();snapshot.game=cloneRecord(snapshot.game,history().length,snapshot.origin);
 lockedStudyPosition=snapshot;updatePinControls();
}
function togglePositionPin(){
 positionPinned=!positionPinned;
 if(positionPinned)captureLockedPosition();else{pinnedStudy=null;lockedStudyPosition=null;updatePinControls();}
 const button=$('#position-pin');button.setAttribute('aria-pressed',String(positionPinned));
 button.title=positionPinned?'允许试走或在对弈模式继续':'锁定局面 · 切换到对弈继续下';
 toast(positionPinned?'允许试走或在对弈模式继续':'已解锁 · 切换模式恢复初始局面');
}
async function restoreStudyTrial(){
 if(undoRunning)return;
 if(deferBoardAction(restoreStudyTrial))return;
 if(!positionPinned||!lockedStudyPosition)return;
 const original={...lockedStudyPosition,game:cloneRecord(lockedStudyPosition.game,lockedStudyPosition.game.history().length,lockedStudyPosition.origin)};
 rememberRecentGame();stopPlayback();cancelBusy();hidePromotion();
 const orientation=state.orientation,route=planPositionReturn(cachedHistory(),state.view,original.game.history({verbose:true}),original.view);
 const count=route.backward.length+route.forward.length,duration=Math.max(48,Math.min(130,Math.round(1050/Math.max(1,count))));
 state.mode='free';state.duelStarted=false;duelSession=null;syncModeControls();
 undoRunning=true;exclusiveDone=new Promise(ready=>finishExclusive=ready);
 $('#restore-study').setAttribute('aria-busy','true');
 try{
  for(const move of route.backward){
   const snapshot=takeMotionNodes(move,true);state.view--;clearHints();postReview?.prepareMotion(state.view);drawBoard();renderMoves();
   await transition(move,true,snapshot,{duration,sound:false});
  }
  state.game=original.game;state.origin=original.origin;state.view=route.common;invalidateViewMemo();
  for(const move of route.forward){
   const snapshot=takeMotionNodes(move);state.view++;clearHints();postReview?.prepareMotion(state.view);drawBoard();renderMoves();
   await transition(move,false,snapshot,{duration,sound:false});
  }
  Object.assign(state,original,{orientation});invalidateViewMemo();clearHints();drawAll();
 }finally{undoRunning=false;$('#restore-study').setAttribute('aria-busy','false');finishExclusive?.();finishExclusive=null;flushBoardWork();}
}
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
 const ending=recordEnding(g,{recorded:state.review,atEnd:atRecordEnd(moves),result:headerResult()}),turnColor=g.turn(),over=!!ending;
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
 const badge=$('#side-badge'),status=$('#status');
 badge.textContent=over?ending.title.replace(/^将死 · /,''):(turnColor==='w'?'白方':'黑方')+'行棋';
 badge.classList.toggle('is-result',over);badge.title=over?[ending.title,ending.detail].filter(Boolean).join(' · '):'';
 status.textContent=over?[ending.title,ending.detail].filter(Boolean).join(' · '):state.busy?'Stockfish 正在思考…':checked?'将军 · 请先应对':state.review?'当前棋谱可继续回放':state.mode==='free'?'打谱浏览 · 使用箭头切换着法':turnColor!==state.side?'轮到 Stockfish':'轮到'+(turnColor==='w'?'白方':'黑方');
 status.classList.toggle('is-result',over);
 $('#ply').textContent=state.view+' / '+moves.length;
 $('#ply').title=state.review?'剩余 '+(moves.length-state.view)+' 个半回合':'当前走棋记录';
 postReview?.sync();
 updatePinControls();
}
let boardDrawPending=false,pendingBoardAction=null,boardFlush=false,undoRunning=false,exclusiveDone=Promise.resolve(),finishExclusive=null;
function boardAnimating(){return activeFlights.size>0||!!openingMotion||appearanceMotion.length>0;}
function boardLocked(){return boardAnimating()||undoRunning;}
function deferBoardAction(action){if(!boardLocked())return false;pendingBoardAction=action;return true;}
function flushBoardWork(){if(boardFlush)return;boardFlush=true;requestAnimationFrame(()=>{boardFlush=false;if(boardLocked())return;const action=pendingBoardAction;pendingBoardAction=null;if(action){action();return;}if(boardDrawPending){boardDrawPending=false;drawBoard();}});}
async function whenBoardIdle(){while(boardLocked()||pendingBoardAction){if(pendingBoardAction&&!boardLocked()){flushBoardWork();await new Promise(requestAnimationFrame);continue;}await Promise.all([whenFlightsIdle(),whenOpeningIdle(),...appearanceMotion.map(item=>item.animation.finished.catch(()=>{})),undoRunning?exclusiveDone:Promise.resolve()]);}}
function flipBoard(){if(deferBoardAction(flipBoard))return;hidePromotion();animateOpening(()=>{state.orientation=state.orientation==='w'?'b':'w';clearBoardGeometry();drawBoard();},{fadeCoordinates:true});}
// Smooth piece movement, captures, castling, promotions and step-by-step playback.
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
function transition(m,reverse=false,snapshot=null,{duration:requestedDuration,sound=true}={}){
 if(!m)return Promise.resolve();
 const from=reverse?m.to:m.from,to=reverse?m.from:m.to,isCapture=!!m.captured;
 const target=boardCell(to)?.querySelector(':scope > .piece'),src=squareOffset(from),end=squareOffset(to);
 showMoveCue(m,reverse);
 const releaseSnapshot=()=>{for(const node of Object.values(snapshot||{}))if(node)releasePiece(node);};
 if(!src||!end||!state.animEnabled||matchMedia('(prefers-reduced-motion: reduce)').matches){releaseSnapshot();if(sound)playMoveSound(m);return Promise.resolve();}
 const duration=requestedDuration??Math.round(Math.max(220,Math.min(360,210+Math.hypot(end.x-src.x,end.y-src.y)*.18)));
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
 activeFlights.add(flight);postReview?.motionStarted(duration);if(sound)playMoveSound(m);
 const finish=()=>flight.finish();
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
function clickSquare(square){if(boardLocked())return;if(state.mode==='free'&&!positionPinned){toast('打谱仅供浏览，锁定图钉后可试走');return;}if(state.busy||state.promo)return;const g=viewGame();if(g.isGameOver())return;
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
 if(boardLocked()||state.mode==='free'&&!positionPinned||state.mode==='book'&&!state.duelStarted||!auto&&state.mode==='book'&&viewGame().turn()!==state.side)return false;
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
 if(state.mode==='book'&&duelSession)duelSession.hasMoves=true;
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
  rememberRecentGame();
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
 hidePromotion();cancelBusy();const moves=cachedHistory(),m=Math.abs(old-next)===1?moves[Math.min(old,next)]:null,snapshot=m?takeMotionNodes(m,next<old):null;
 if(m&&state.animEnabled&&!matchMedia('(prefers-reduced-motion: reduce)').matches)postReview?.prepareMotion(next);
 const update=()=>{state.view=next;clearHints();drawAll();};let motion;
 if(m){update();motion=transition(m,next<old,snapshot);}else motion=animateOpening(update);
 return Promise.resolve(motion).then(()=>{if(resumeComputer&&state.mode==='book'&&!state.review&&state.view===cachedHistory().length&&viewGame().turn()!==state.side&&!viewGame().isGameOver())maybeBookReply();return true;});
}
async function undo(){
 if(boardLocked())return;stopPlayback();hidePromotion();
 if(state.review||state.view<history().length){goto(state.view-1);return;}
 cancelBusy();const count=state.mode==='book'&&state.game.turn()===state.side?2:1;
 undoRunning=true;exclusiveDone=new Promise(ready=>finishExclusive=ready);
 try{for(let i=0;i<count&&history().length;i++){const move=cachedHistory().at(-1),snapshot=takeMotionNodes(move,true);state.game.undo();state.game.header('Result','*');invalidateViewMemo();state.view=history().length;clearHints();postReview?.prepareMotion(state.view);drawAll();await transition(move,true,snapshot);}}
 finally{undoRunning=false;finishExclusive?.();finishExclusive=null;$('#move-cue').textContent='已悔棋';flushBoardWork();}
 rememberRecentGame();
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
function loadPosition(fen,title='残局练习'){if(deferBoardAction(()=>loadPosition(fen,title)))return false;try{const game=new Chess(fen);animateOpening(()=>{lockedStudyPosition=null;stopPlayback();hidePromotion();invalidateViewMemo();cancelBusy();state.game=game;state.origin=game.fen();state.view=0;state.orientation=game.turn();state.review=true;state.reviewTitle=title;clearHints();drawAll();});return true;}catch{toast('无法读取此残局局面');return false;}}
function loadPgn(pgn,title='',targetPly=null){if(deferBoardAction(()=>loadPgn(pgn,title,targetPly)))return false;try{const game=new Chess();game.loadPgn(pgn,{strict:false});const moves=game.history({verbose:true});if(!moves.length)throw Error('空棋谱');animateOpening(()=>{lockedStudyPosition=null;stopPlayback();hidePromotion();invalidateViewMemo();state.currentScoreId=null;state.currentScoreSource=null;cancelBusy();state.game=game;state.origin=game.header()?.FEN||defaultFen;state.view=Number.isInteger(targetPly)?Math.min(targetPly,moves.length):0;state.orientation='w';state.review=true;state.reviewTitle=title||'参考棋谱';clearHints();drawAll();});
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
function exportRecentGame(id){const entry=recentGames.find(row=>row.id===id);if(!entry)return;download(entry.pgn,pgnFileName());}
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
 const pending=state.promo={from,to,color,fen:viewGame().fen()};
 const side=color==='b'?'b':'w';
 box.innerHTML=['q','r','b','n'].map(p=>`<button type="button" data-promo="${p}" aria-label="升变为${pieceName[p]}" title="升变为${pieceName[p]}">${pieceSvg(p,side)}</button>`).join('');
 positionPromotion();
 showSurface(box).then(()=>{if(state.promo===pending&&surfaceOpen(box))box.querySelector('button')?.focus({preventScroll:true});});
}
function positionPromotion(){
 if(!state.promo)return;
 const box=$('#promo-choice'),frame=$('.board-frame'),cell=boardCell(state.promo.to);if(!cell)return;
 const f=frame.getBoundingClientRect(),c=cell.getBoundingClientRect(),board=$('#board').getBoundingClientRect();
 const size=Math.max(32,Math.min(48,Math.round(c.width*.92))),width=size+10,height=size*4+16;
 const x=(c.left+c.right)/2-f.left-frame.clientLeft,y=(c.top+c.bottom)/2-f.top-frame.clientTop,edge=c.top<board.top+board.height/2?'top':'bottom';
 const left=Math.max(6,Math.min(frame.clientWidth-width-6,x-width/2)),desired=edge==='top'?y-size/2-5:y+size/2+5-height;
 const top=Math.max(6,Math.min(frame.clientHeight-height-6,desired));
 box.dataset.edge=edge;box.dataset.surfaceTransform=`translateY(${edge==='top'?-4:4}px) scale(.92)`;
 Object.assign(box.style,{left:left+'px',top:top+'px',width:width+'px',transformOrigin:(x-left)+'px '+(y-top)+'px'});
 box.style.setProperty('--promotion-size',size+'px');box.style.setProperty('--promotion-anchor',(x-left)+'px');
}
function hidePromotion({focus=false}={}){const from=state.promo?.from;state.promo=null;hideSurface($('#promo-choice'));if(focus&&from)boardCell(from)?.focus({preventScroll:true});}
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
 renderRecentGames();
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
   if(libraryCategory==='mine')parts.push('<option value="mine:starred">星标收藏 ★</option><option value="mine:recent">最近对局</option>');
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
  counts.mine+=recentGames.length;
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
 if(['星标收藏','最近对局'].includes(name)||isBuiltinPack(name)||isPinnedPack(name)||userExtras().includes(name)){toast('已有同名合集');return;}
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
 if(x.recent)return new Date(x.updatedAt).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false})+' · '+x.ply+' 着 · '+({'1-0':'白胜','0-1':'黑胜','1/2-1/2':'和棋','*':'未结束'}[x.result]||'未结束');
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
 if(x.recent){const saved=state.local.some(score=>score.recentId===x.id);return `<div class="library-row recent-row${current?' is-current':''}" data-score-id="${safeText(x.id)}"><button type="button" class="library-open" data-local="${idx}"><span class="row-main"><b>${name}</b><small>${safeText(meta)}</small></span></button><div class="recent-row-tools"><button type="button" class="inline-button recent-save" data-save-recent="${safeText(x.id)}" ${saved?'disabled':''}>${saved?'已添加':'加入棋谱'}</button><button type="button" class="inline-button" data-export-recent="${safeText(x.id)}" title="导出 PGN">导出</button></div></div>`;}
 return `<div class="library-row${current?' is-current':''}" data-score-id="${safeText(x.id)}"${current?' aria-current="true"':''}><button type="button" class="library-open" data-local="${idx}"><span class="row-main"><b>${name}</b>${meta?`<small>${safeText(meta)}</small>`:''}</span></button><button type="button" class="score-star" data-star="${safeText(x.id)}" aria-label="${starred?'取消收藏':'收藏'}：${name}" aria-pressed="${starred}" title="${starred?'取消星标':'星标收藏'}"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m12 3 2.8 5.7 6.3.9-4.6 4.5 1.1 6.3L12 17.4l-5.6 3 1.1-6.3-4.6-4.5 6.3-.9Z"/></svg></button>${drop?`<button type="button" class="row-remove" data-remove="${idx}" aria-label="从合集中移除：${name}" title="从合集中移除">×</button>`:''}</div>`;
}
let visibleScores=[],collectionLimit=LIST_PAGE,collectionSig='';
// 棋谱库列表：合集筛选 + 关键词搜索 → 一份扁平列表。
// 只渲染当前页（LISR_PAGE 行），滚动到底自动加页，
// 因此即使本地有几千局棋谱，DOM 里始终只有几十个节点，操作保持流畅。
function collectionFilter(){
 const term=$('#filter-collection').value.toLowerCase().trim(),pack=$('#archive-select').value;
 if(libraryCategory==='mine'&&pack==='mine:recent')return recentGames.filter(x=>!term||searchBlob(x).includes(term));
 return state.local.filter(x=>{
  if(!scoreInCollection(x,libraryCategory,pack,starredIds.has(x.id)))return false;
  if(!term)return true;
  return searchBlob(x).includes(term);
 });
}
function renderCollection(full=true){
 const list=$('#collection');if(!list)return;
 if(full||collectionDirty){
  collectionDirty=false;
  const keepScroll=list.scrollTop;
  const found=collectionFilter();
  visibleScores=found;
  const slice=found.slice(0,collectionLimit);
  list.innerHTML=slice.length?slice.map((x,i)=>collectionRowHtml(x,i)).join('')
   :`<p class="hint">${$('#archive-select').value==='mine:recent'?'对弈后自动保留最近 20 局，可随时加入我的棋谱。':$('#archive-select').value==='mine:starred'?'暂无星标棋谱，点击棋谱右侧的星星即可收藏。':libraryCategory==='mine'&&!state.local.some(x=>scoreCategory(x)==='mine')?'还没有个人棋谱，可以导入 PGN 或保存当前对局。':'当前分类没有匹配的棋谱，试试其他关键词或切换本分类的合集。'}</p>`;
  const storageNote=$('#library-storage-note');if(storageNote){storageNote.hidden=libraryCategory!=='mine';storageNote.textContent=$('#archive-select').value==='mine:recent'?'最近 20 局 · 保存在此浏览器':'收藏与棋谱保存在此浏览器';}
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
 if(state.mode==='book'){setPlayMode('free');if(deferBoardAction(()=>openLocalScore(source)))return;}
 if((source.pgn?loadPgn(source.pgn,source.title,source.recent?source.ply:null):source.fen?loadPosition(source.fen,source.title):false)){
  state.currentScoreId=source.id;state.currentScoreSource=source;
  if(positionPinned)captureLockedPosition();
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
function renderRecentGames(){
 const list=$('#recent-list');if(!list)return;
 const button=$('#recent-games');if(button)button.textContent='最近对局';
 if(!$('#recent-dialog').open)return;
 list.innerHTML=recentGames.length?recentGames.map(entry=>{
  const saved=state.local.some(score=>score.recentId===entry.id);
  const active=entry.id===duelSession?.id||entry.id===state.currentScoreId;
  return `<div class="recent-dialog-row${active?' is-current':''}"><button type="button" class="recent-open" data-open-recent="${safeText(entry.id)}" ${active?'aria-current="true"':''}><b>${safeText(entry.title)}</b><small>${safeText(collectionRowMeta(entry))}</small></button><div class="recent-row-tools"><button type="button" class="inline-button" data-save-recent="${safeText(entry.id)}" ${saved?'disabled':''}>${saved?'已添加':'加入棋谱'}</button><button type="button" class="inline-button" data-export-recent="${safeText(entry.id)}" title="导出 PGN">导出</button></div></div>`;
 }).join(''):'<p class="hint">走出第一步后，将自动保存到这里。</p>';
}
async function saveRecentCopy(id){
 const entry=recentGames.find(row=>row.id===id);if(!entry||recentCopiesPending.has(id))return;
 if(state.local.some(row=>row.recentId===id)){toast('已加入我的棋谱');return;}
 if(!state.db){download(entry.pgn,pgnFileName());toast('浏览器存储不可用，已导出 PGN 备份');return;}
 recentCopiesPending.add(id);
 try{
  const copy={id:'save-'+(globalThis.crypto?.randomUUID?.()||Date.now()+'-'+Math.random().toString(36).slice(2)),recentId:id,title:entry.title,origin:'我的棋谱',stage:'复盘',pgn:entry.pgn};
  await dbTransaction('readwrite',store=>store.put(copy));state.local.push(copy);collectionDirty=true;
  state.rebuildArchiveOptions?.();renderCollection();renderRecentGames();renderPackDialog();toast('已加入我的棋谱');
 }catch{toast('保存失败，请导出 PGN 备份');}finally{recentCopiesPending.delete(id);}
}
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
 active.oldCoordinates?.remove();
 active.layer?.remove();$('#board').classList.remove('is-opening');$('#board').removeAttribute('aria-busy');
 active.resolve();flushBoardWork();
}
function whenOpeningIdle(){return openingMotion?.done||Promise.resolve();}
function animateOpening(update,{animate=true,fadeCoordinates=false}={}){
 clearOpeningMotion();clearAppearanceMotion();settleFlights();
 postReview?.boardResetStarted();state.arrow=null;drawArrow();analysisUi?.boardReset();
 const board=$('#board'),motion=animate&&state.animEnabled&&!matchMedia('(prefers-reduced-motion: reduce)').matches;
 const coordinates=motion&&fadeCoordinates?$('.board-coordinates'):null,oldCoordinates=coordinates?.cloneNode(true);
 const layer=document.createElement('div'),oldNodes=[];
 layer.className='opening-layer';layer.setAttribute('aria-hidden','true');
 if(motion)for(const cell of board.querySelectorAll(':scope > .square')){
  const slot=document.createElement('div');slot.className='opening-cell';layer.append(slot);
  const node=cell.querySelector(':scope > .piece');
  if(node){slot.append(node);oldNodes.push(node);cell.dataset.pieceKey='';}
 }
 update();
 if(!motion)return;
 let resolve;const done=new Promise(ready=>resolve=ready),active={animations:[],oldNodes,layer,oldCoordinates,resolve,done};
 openingMotion=active;board.classList.add('is-opening');board.setAttribute('aria-busy','true');
 const startTime=document.timeline.currentTime;let finishAt=0;
 const run=(node,frames,options)=>{
  const animation=node.animate(frames,{...options,fill:'both'});animation.startTime=startTime;active.animations.push(animation);
  finishAt=Math.max(finishAt,(options.delay||0)+options.duration);
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
 if(coordinates&&oldCoordinates){
  oldCoordinates.classList.add('coordinates-exit');coordinates.parentElement.append(oldCoordinates);
  const revealAt=oldNodes.length?330:0,end=Math.max(finishAt,revealAt+180);
  run(oldCoordinates,[{opacity:1},{opacity:0}],{duration:320,easing:'ease-in'});
  run(coordinates,[{opacity:0},{opacity:1}],{duration:end-revealAt,delay:revealAt,easing:'ease-out'});
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
function setPlayMode(mode,{animate=true,studyTarget=null}={}){
 if(deferBoardAction(()=>setPlayMode(mode,{animate,studyTarget})))return;
 const next=mode==='book'?'book':'free';
 if(next===state.mode&&$('#mode').value===next&&document.body.dataset.playMode===next)return;
 rememberRecentGame();
 stopPlayback();settleFlights();cancelBusy();hidePromotion();
 const keep=positionPinned,fromStudy=state.mode==='free',source=studySnapshot();
 if(keep&&fromStudy)pinnedStudy=source;
 const motion=animateOpening(()=>{
 state.mode=next;
 state.currentScoreId=null;state.currentScoreSource=null;
 state.review=false;state.reviewTitle='';
 state.duelStarted=false;
 if(keep&&next==='book'){
  state.game=createTrialRecord(source.game,source.view,source.origin);state.origin=source.origin;state.view=state.game.history().length;
  state.side=source.orientation;state.orientation=source.orientation;syncSideSelect(state.side);
  if(source.reviewTitle)state.game.header('SourceStudy',source.reviewTitle);
  state.game.header('ContinuationPly',String(state.view),'Date',pgnDate());
  stampDuelRecord();state.duelStarted=true;newDuelSession(state.view,source.reviewTitle?'试下 · '+source.reviewTitle:'');
 }else if(keep&&next==='free'){
  Object.assign(state,studyTarget||pinnedStudy||source);duelSession=null;
 }else{
  pinnedStudy=null;lockedStudyPosition=null;duelSession=null;state.game=new Chess();stampNewRecord();state.origin=defaultFen;state.view=0;
  state.orientation='w';
  if(next==='book'){state.side='w';syncSideSelect('w');state.duelStarted=true;stampDuelRecord();newDuelSession();}
  else{const lesson=LESSONS.find(item=>item.id==='italian');state.game.loadPgn(lesson.pgn);state.review=true;state.reviewTitle=lesson.title;state.currentScoreId=lesson.id;state.currentScoreSource=lesson;}
 }
 clearBoardGeometry();
 invalidateViewMemo();clearHints();
 syncModeControls();
 $('#move-cue').textContent=keep?'已保留当前局面':next==='free'?'初始局面 · 使用箭头浏览棋谱':'初始局面 · 点击棋子开始';
 drawAll();
 },{animate});
 Promise.resolve(motion).then(()=>{if(state.mode==='book'&&state.duelStarted)maybeBookReply();});
}
function syncModeControls(){
 const next=state.mode;
 $('#mode').value=next;
 $$('#mode-segment button').forEach(b=>{let active=b.dataset.playMode===next;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active));});
 $$('.mode-book-only').forEach(el=>el.classList.toggle('hidden',next!=='book'));
 $$('.mode-free-only').forEach(el=>el.classList.toggle('hidden',next==='book'));
 document.body.dataset.playMode=next;$('#right-heading').textContent=next==='book'?'对局':'棋谱';
 $('#record-heading').textContent=next==='book'?'着法记录':'棋谱着法';
 $('#duel-start').textContent=state.duelStarted?'重新开始':'开始对弈';
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
 delete state.game._headers.WhiteType;delete state.game._headers.BlackType;
 state.game.header('Event','Local Computer Game','Site','Local','White',state.side==='w'?'Player':computer,'Black',state.side==='b'?'Player':computer,state.side==='w'?'BlackType':'WhiteType','program');
 delete state.game._headers.WhiteElo;delete state.game._headers.BlackElo;
 if(elos[level])state.game.header(state.side==='w'?'BlackElo':'WhiteElo',String(elos[level]));
}
function stampNewRecord(){state.engineError='';state.game.header('Event','Casual Game','Site','Local','Date',pgnDate(),'Round','-','White','?','Black','?','Result','*');}
function beginDuel({animate=true}={}){
 if(deferBoardAction(()=>beginDuel({animate})))return;
 rememberRecentGame();
 animateOpening(()=>{
 stopPlayback();settleFlights();cancelBusy();hidePromotion();
 state.currentScoreId=null;state.currentScoreSource=null;state.duelStarted=true;
 state.game=new Chess();stampNewRecord();state.origin=defaultFen;state.view=0;
 state.review=false;state.reviewTitle='';
 stampDuelRecord();state.orientation=state.side;clearBoardGeometry();invalidateViewMemo();clearHints();drawAll();
 newDuelSession();
 if(positionPinned){pinnedStudy=null;captureLockedPosition();}
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
 $('#restore-study').addEventListener('click',restoreStudyTrial);
 $('#position-pin').addEventListener('click',togglePositionPin);
 $('#recent-games').addEventListener('click',()=>{$('#recent-dialog').showModal();renderRecentGames();});
 $('#recent-close').addEventListener('click',()=>$('#recent-dialog').close());
 $('#recent-dialog').addEventListener('click',event=>{if(event.target===$('#recent-dialog'))$('#recent-dialog').close();});
 $('#recent-list').addEventListener('click',event=>{
  const exp=event.target.closest('[data-export-recent]');if(exp){exportRecentGame(exp.dataset.exportRecent);return;}
  const save=event.target.closest('[data-save-recent]');if(save){saveRecentCopy(save.dataset.saveRecent);return;}
  const open=event.target.closest('[data-open-recent]');if(open){const entry=recentGames.find(row=>row.id===open.dataset.openRecent);if(entry){$('#recent-dialog').close();openLocalScore(entry);}}
 });
 addEventListener('pagehide',rememberRecentGame);
 addEventListener('storage',event=>{if(event.key===RECENT_KEY||event.key===null){try{recentGames=readRecentGames(localStorage);}catch{}state.rebuildArchiveOptions?.();collectionDirty=true;renderCollection();renderRecentGames();}});
 $('#board').addEventListener('error',e=>{if(e.target.matches('.piece-art-img'))e.target.closest('.assetpiece')?.classList.add('asset-fallback-mode');},true);
 $('#home').addEventListener('click',e=>{e.preventDefault();flipBrandKnight();});
 $('#autoplay').addEventListener('click',togglePlayback);
 $('#duel-start').addEventListener('click',beginDuel);$('#reset').addEventListener('click',reset);$('#undo').addEventListener('click',undo);
 $('#first').addEventListener('click',()=>{stopPlayback();goto(0);});$('#prev').addEventListener('click',()=>{stopPlayback();goto(state.view-1);});$('#next').addEventListener('click',()=>{stopPlayback();goto(state.view+1);});$('#last').addEventListener('click',()=>{stopPlayback();goto(history().length);});
 $('#flip').addEventListener('click',()=>{
  flipBoard();
 });
 $('#save').addEventListener('click',saveGame);
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
  const {from,to,fen}=state.promo;if(viewGame().fen()!==fen){hidePromotion();return;}
  hidePromotion();makeMove({from,to,promotion:b.dataset.promo});
 });
 $('#promo-choice').addEventListener('keydown',event=>{
  if(!state.promo)return;
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();hidePromotion({focus:true});return;}
  if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();event.stopPropagation();let buttons=[...$('#promo-choice').querySelectorAll('button')];
  if($('#promo-choice').dataset.edge==='bottom')buttons.reverse();const index=buttons.indexOf(document.activeElement),step=['ArrowUp','ArrowLeft'].includes(event.key)?-1:1;
  buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+step+buttons.length)%buttons.length].focus();
 });
 document.addEventListener('pointerdown',event=>{if(state.promo&&!$('#promo-choice').contains(event.target))hidePromotion();});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&state.promo){event.preventDefault();hidePromotion({focus:true});}});
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
  const exp=e.target.closest('[data-export-recent]');if(exp){exportRecentGame(exp.dataset.exportRecent);return;}
  const copy=e.target.closest('[data-save-recent]');if(copy){saveRecentCopy(copy.dataset.saveRecent);return;}
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
 addEventListener('resize',()=>{clearBoardGeometry();if(state.promo)positionPromotion();},{passive:true});
 document.addEventListener('keydown',e=>{if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName)||document.querySelector('dialog[open]'))return;if(e.key==='ArrowLeft'){e.preventDefault();stopPlayback();goto(state.view-1);}if(e.key==='ArrowRight'){e.preventDefault();stopPlayback();goto(state.view+1);}});
}
installDialogMotion(document.querySelectorAll('dialog'));
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
