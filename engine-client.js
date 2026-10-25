import { browserEngineEnabled, browserEngineRequest, browserEngineStatus } from './browser-engine.js';

export async function engineStatus(){
 if(browserEngineEnabled())return browserEngineStatus();
 const response=await fetch('/api/engine',{cache:'no-store'});
 if(!response.ok)throw Error('本地引擎连接失败');
 return response.json();
}
export async function engineRequest(path, body, {signal, onUpdate}={}){
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
export function scoreValue(pv){
 if(Number.isFinite(pv?.mate))return pv.mate>0?100000-Math.abs(pv.mate):pv.mate<0?-100000+Math.abs(pv.mate):0;
 return Number.isFinite(pv?.cp)?pv.cp:null;
}
export function scoreLabel(pv){
 if(Number.isFinite(pv?.mate))return `${pv.mate>=0?'白':'黑'}方 ${Math.abs(pv.mate)} 步将杀`;
 if(!Number.isFinite(pv?.cp))return '暂无评分';
 const n=pv.cp/100;return (n>0?'+':'')+n.toFixed(2);
}
export function moveQuality(previous,current,move){
 const best=previous?.pvs?.[0],after=current?.pvs?.[0];
 if(!best||!after||!previous.complete||!current.complete)return null;
 if(best.moves.split(' ')[0]===move.from+move.to+(move.promotion||''))return {label:'最佳',loss:0,cls:'best'};
 const beforeScore=scoreValue(best),afterScore=scoreValue(after);
 if(beforeScore===null||afterScore===null)return null;
 const loss=Math.max(0,(beforeScore-afterScore)*(move.color==='w'?1:-1));
 return {loss,label:loss<30?'良好':loss<100?'可改进':loss<250?'失误':'严重失误',cls:loss<30?'good':loss<100?'ok':'bad'};
}
