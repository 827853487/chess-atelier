import { Chess } from './vendor/chess.js';
import { engineRequest, moveQuality, scoreLabel } from './engine-client.js';
export function setupPostReview({state,cachedHistory,enginePosition,goto,drawArrow,analysis,whenFlightsIdle}){
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
  const moves=cachedHistory(),available=state.mode==='free'||moves.length>0&&state.game.isGameOver();
  if(record&&(record.game!==state.game||record.length!==moves.length||record.last!==moves.at(-1)?.san)){
   const wasActive=state.postReview;stop();record=null;state.postReview=false;clearMarks();$('post-review').hidden=true;if(wasActive)analysis.setReviewMode(false);
  }
  const button=$('side-badge');button.disabled=!available;button.classList.toggle('is-review-active',!!state.postReview);button.setAttribute('aria-pressed',String(!!state.postReview));
  if(available){button.textContent=state.postReview?'关闭复盘':'复盘分析';button.title=state.postReview?'停止复盘，返回棋谱浏览':'加载 Stockfish 逐步复盘';}
  else button.title='对弈结束后可复盘';
  if(state.postReview){if(lastView!==state.view){stop();clearMarks();lastView=state.view;error='';}render();schedule();}
 }
 $('side-badge').addEventListener('click',()=>{
  if(state.postReview){close();return;}
  if(!record)record=createRecord();state.postReview=true;error='';lastView=-1;analysis.setReviewMode(true);goto(0);sync();
 });
 window.addEventListener('pagehide',()=>{stop();textAnimation?.cancel();for(const node of departingMarks)node.remove();departingMarks.clear();});
 return {sync,close,prepareMotion,motionStarted,boardResetStarted,motionSettled:()=>{textMotion=null;textAnimation?.cancel();textAnimation=null;$('review-evaluation').style.opacity='';if(state.postReview)render();}};
}
