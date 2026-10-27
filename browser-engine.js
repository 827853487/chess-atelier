import { Chess } from './vendor/chess.js';
import { prepareBrowserEngineAssets } from './engine-assets.js';

// Public builds use two local Web Workers; desktop builds keep the native Python bridge.
export function browserEngineEnabled(){return globalThis.CHESS_ENGINE_MODE==='browser';}
const LEVELS={1:{name:'入门',elo:1300,ms:350},2:{name:'一般',elo:1600,ms:500},3:{name:'进阶',elo:1900,ms:700},4:{name:'高手',elo:2200,ms:1000},5:{name:'大师',elo:2600,ms:1400},6:{name:'顶级',elo:3000,ms:2200}};
const abortError=()=>new DOMException('操作已取消','AbortError');
class UciWorker{
 constructor(){this.worker=null;this.ready=null;this.listeners=new Set();this.queue=Promise.resolve();this.eloMin=1320;this.eloMax=3190;this.generation=0;}
 fail(error){
  this.generation++;
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
  const generation=this.generation;
  this.ready=(async()=>{
   if(typeof WebAssembly!=='object'||typeof Worker!=='function')throw Error('当前浏览器不支持本地 Stockfish，请使用新版浏览器。');
   const {workerUrl}=await prepareBrowserEngineAssets();
   if(generation!==this.generation)throw abortError();
   this.worker=new Worker(workerUrl);
   this.worker.onmessage=event=>{
    if(typeof event.data!=='string')return;
    for(const line of event.data.split(/\r?\n/)){
     const elo=line.match(/^option name UCI_Elo .* min (\d+) max (\d+)/);
     if(elo){this.eloMin=Number(elo[1]);this.eloMax=Number(elo[2]);}
     for(const listener of [...this.listeners])listener.line(line);
    }
   };
   this.worker.onerror=event=>{event.preventDefault();if(generation===this.generation)this.fail(Error('浏览器 Stockfish 加载失败，请刷新或重试。'));};
   const uci=this.waitFor(line=>line==='uciok',30000);this.send('uci');await uci;
   // Single-thread WASM needs no SharedArrayBuffer / cross-origin isolation.
   this.send('setoption name Hash value 16');this.send('setoption name UCI_ShowWDL value true');
   const ready=this.waitFor(line=>line==='readyok');this.send('isready');await ready;
  })().catch(error=>{if(generation===this.generation)this.fail(error);throw error;});
  return this.ready;
 }
 async waitUntilReady(signal){
  if(signal?.aborted)throw abortError();
  let abort;
  try{
   await Promise.race([this.ensure(),new Promise((resolve,reject)=>{
    abort=()=>reject(abortError());signal?.addEventListener('abort',abort,{once:true});
   })]);
  }finally{if(abort)signal?.removeEventListener('abort',abort);}
 }
 request(body,analysis,{signal,onUpdate}={}){
  const task=this.queue.catch(()=>{}).then(async()=>{
   if(signal?.aborted)throw abortError();
   await this.waitUntilReady(signal);if(signal?.aborted)throw abortError();
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
export async function browserEngineStatus(){
 // The initial status probe shares the analysis worker. Do not compile a second
 // WASM instance on a phone until the user actually starts a computer game.
 await analysis.ensure();
 return {available:true,source:'stockfish',name:'Stockfish 19 Lite',local:true,browser:true,eloRange:[analysis.eloMin,analysis.eloMax],levels:Object.fromEntries(Object.entries(LEVELS).map(([key,value])=>[key,{...value,engineElo:value.elo===null?null:Math.max(analysis.eloMin,Math.min(analysis.eloMax,value.elo))}]))};
}
export function browserEngineRequest(path,body,options){
 if(path==='/api/play')return play.request(body,false,options);
 if(path==='/api/analyze')return analysis.request(body,true,options);
 return Promise.reject(Error('不支持的浏览器引擎请求'));
}
window.addEventListener('pagehide',()=>{play.fail(abortError());analysis.fail(abortError());});
