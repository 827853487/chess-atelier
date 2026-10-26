import { Chess } from './vendor/chess.js';
import { engineRequest, moveQuality } from './engine-client.js';
export function setupPostReview({state,cachedHistory,enginePosition,goto,drawArrow,analysis}){
 const $=id=>document.getElementById(id);let record=null,controller=null,timer=null,epoch=0,lastView=-1,error='';
 function stop(){clearTimeout(timer);timer=null;controller?.abort();controller=null;epoch++;}
 function clearMarks(){document.querySelectorAll('.review-mark').forEach(node=>node.remove());}
 function close(){stop();state.postReview=false;error='';$('post-review').hidden=true;clearMarks();state.arrow=null;drawArrow();analysis.setReviewMode(false);sync();}
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
 function render(){
  clearMarks();if(!state.postReview||!record)return;
  const index=state.view,current=record.results.get(index),move=record.moves[index-1],quality=qualityAt(index);
  $('post-review').hidden=false;$('review-progress').textContent=`${record.results.size} / ${record.positions.length} 局面`;
  $('review-meter').style.width=(record.results.size/record.positions.length*100)+'%';
  $('review-move-title').textContent=index?`${move?.color==='w'?'白':'黑'} ${move?.san||''}${quality?' · '+quality.label:''}`:'初始局面';
  $('review-comment').textContent=error||(!current?'正在加载此步分析…':quality?quality.loss>=10000?'将杀形势发生变化。':quality.loss>0?`引擎参考：约损失 ${(quality.loss/100).toFixed(1)} 兵。`:'与引擎参考一致。':index?'正在补全前一局面的比较…':'按着法逐步查看；关闭复盘可自行推演。');
  const line=currentLine(current,index),suggestion=$('review-suggestion');suggestion.hidden=!line;
  suggestion.textContent=line?'参考：'+line.map(move=>move.san).join('  '):'';
  suggestion.onclick=line?()=>{state.arrow={from:line[0].from,to:line[0].to};drawArrow();}:null;
  if(current)analysis.renderReview(current,record.positions[index]);else analysis.reviewLoading();
  if(move&&quality){const cell=document.querySelector(`#board > [data-square="${move.to}"]`);if(cell?.querySelector('.piece')){const badge=document.createElement('span');badge.className='review-mark review-'+quality.cls;badge.textContent=quality.cls==='best'?'★':quality.cls==='good'?'✓':quality.cls==='ok'?'~':quality.loss>=250?'??':'?';badge.title=move.san+' · '+quality.label+'（Stockfish 参考）';badge.setAttribute('aria-label',badge.title);cell.append(badge);}}
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
  if(available){button.textContent=state.postReview?'关闭复盘':'复盘分析';button.title=state.postReview?'停止模型分析，恢复自行推演':'加载 Stockfish 逐步复盘';}
  else button.title='对弈结束后可复盘';
  if(state.postReview){if(lastView!==state.view){stop();lastView=state.view;error='';}render();schedule();}
 }
 $('side-badge').addEventListener('click',()=>{
  if(state.postReview){close();return;}
  if(!record)record=createRecord();state.postReview=true;error='';lastView=-1;analysis.setReviewMode(true);goto(0);sync();
 });
 window.addEventListener('pagehide',stop);
 return {sync,close};
}
