import { Chess } from './vendor/chess.js';
import { engineRequest, engineStatus } from './engine-client.js';
import { setupRestNotes } from './chess-notes.js';

export function setupLocalAnalysis({state,viewGame,enginePosition,drawArrow,maybeBookReply}){
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
   status('对局结束');empty('对局结束 · 可回退复盘');return;
  }
  const rows=variations(data,viewGame().fen());if(!rows.length)return;
  // Iterations update suggestions; probabilities settle only once per position.
  if(data.complete)odds(rows[0].wdl);
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
   for(const option of select.options){const level=data.levels[option.value];if(level)option.textContent=level.name+(level.elo?` · ${level.elo}`:' · 不限强度');}
   select.dispatchEvent(new CustomEvent('change',{detail:{engineOptions:true}}));
   $('#difficulty-note').textContent=data.browser?'Stockfish 浏览器轻量版；目标 Elo 随设备变化，分析始终全强度。':'目标 Elo 随设备表现略有变化；分析始终全强度。';
  }catch(error){status('本地引擎不可用');empty(error.message);$('#retry-engine').classList.remove('hidden');}
 }
 $('#analysis-toggle').addEventListener('click',()=>{
  if(state.postReview){state.closeReview?.();return;}
  enabled=!enabled;$('#analysis-toggle').setAttribute('aria-pressed',String(enabled));
  $('.coach-card').dataset.paused=String(!enabled);
  $('.analysis-live').inert=!enabled;$('.analysis-live').setAttribute('aria-hidden',String(!enabled));
  $('#analysis-rest').setAttribute('aria-hidden',String(enabled));$('#analysis-rest').tabIndex=enabled?-1:0;
  if(!enabled){state.arrow=null;drawArrow();nextNote();}
  scheduleEngine();
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
  enabled=on;$('#analysis-toggle').setAttribute('aria-pressed',String(on));
  $('#analysis-toggle span').textContent=state.postReview?'复盘分析':'实时分析';
  $('#analysis-toggle').setAttribute('aria-label',state.postReview?'复盘分析':'实时分析');
  $('.coach-card').dataset.paused=String(!on);$('.analysis-live').inert=!on;$('.analysis-live').setAttribute('aria-hidden',String(!on));
  $('#analysis-rest').setAttribute('aria-hidden',String(on));$('#analysis-rest').tabIndex=on?-1:0;
  if(!on)nextNote();scheduleEngine();
 }
 return {scheduleEngine,refreshEngineStatus,setReviewMode,renderReview:render,reviewLoading:()=>{empty('正在分析当前局面…');status('复盘分析中',true);$('#engine-probability').dataset.pending='true';}};
}
