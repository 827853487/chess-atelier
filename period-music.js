import { MUSIC_SEED } from './music-library.js';
import { LOCAL_MUSIC } from './local-music.js';
import { selectMusicTrack, musicDisplayTitle, musicCopyTitle } from './music-order.js';
import { discoverMusic } from './online-music.js';
const ERAS={baroque:'巴洛克',classical:'古典',romantic:'浪漫',modern:'近现代'};
const $=id=>document.getElementById(id),audio=$('music-audio');
const local=LOCAL_MUSIC.map(track=>({...track,id:'local:'+track.file,localUrl:'./assets/music/'+encodeURIComponent(track.file)}));
const remoteSeed=MUSIC_SEED.map(([file,title,composer])=>({id:'seed:'+file,file,title,composer,era:/巴赫|亨德尔|维瓦尔第|斯卡拉蒂/.test(composer)?'baroque':/莫扎特|贝多芬|海顿/.test(composer)?'classical':/德彪西|拉威尔|萨蒂/.test(composer)?'modern':'romantic',sourceUrl:'https://commons.wikimedia.org/wiki/File:'+encodeURIComponent(file)}));
const state={era:'all',shuffle:true,online:false,onlineTracks:[],track:null,history:[],failed:new Set(),buffers:new Map(),plan:[],serial:0,errors:0,playing:false,status:'',discovering:false};
const source=track=>track.localUrl||track.remoteUrl||'https://commons.wikimedia.org/wiki/Special:Redirect/file/'+encodeURIComponent(track.file).replace(/%20/g,'_');
const time=seconds=>Number.isFinite(seconds)&&seconds>=0?Math.floor(seconds/60)+':'+String(Math.floor(seconds%60)).padStart(2,'0'):'0:00';
const playIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.8 18.7 12 8 18.2z"/></svg>',pauseIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM14 5h4v14h-4z"/></svg>';
function tracks(){
 const valid=track=>(state.era==='all'||track.era===state.era)&&!state.failed.has(track.id)&&(!track.mime||!!audio.canPlayType(track.mime));
 const locals=local.filter(valid),online=state.onlineTracks.filter(valid);
 const recordingKey=track=>String(track.originalFile||track.file).replace(/[_ ]+/g,' ').normalize('NFC').toLowerCase();
 const localKeys=new Set(locals.map(recordingKey));
 return state.online&&online.length?[...online.filter(track=>!localKeys.has(recordingKey(track))),...locals]:locals.length?locals:remoteSeed.filter(valid);
}
function pick(direction=1,forceRandom=false){return selectMusicTrack(tracks(),{currentId:state.track?.id,recent:state.history,shuffle:forceRandom||state.shuffle,direction});}
function resetProgress(){$('music-elapsed').textContent='0:00';$('music-duration').textContent='0:00';$('music-seek').value=0;$('music-seek').style.setProperty('--seek-progress','0%');}
function updateTrackOverflow(){const title=$('music-title'),wrap=title.closest('.music-title-viewport'),overflow=title.scrollWidth>wrap.clientWidth+6;title.classList.toggle('title-scroll',overflow);title.style.setProperty('--track-shift',overflow?Math.min(0,wrap.clientWidth-title.scrollWidth-14)+'px':'0px');}
function syncPanelAnchor(){const header=document.querySelector('.masthead');document.documentElement.style.setProperty('--masthead-h',Math.round(header.getBoundingClientRect().height)+'px');}
function render(){
 const playing=state.playing&&!audio.paused;
 $('music-panel').classList.toggle('is-playing',playing);$('music-toggle').classList.toggle('music-is-playing',playing);$('music-toggle').setAttribute('aria-label',playing?'古典乐，正在播放':'古典乐，未播放');
 const button=$('music-play'),icon=playing?'pause':'play';if(button.dataset.icon!==icon){button.dataset.icon=icon;button.innerHTML=playing?pauseIcon:playIcon;button.setAttribute('aria-label',playing?'暂停':'播放');button.title=playing?'暂停':'播放';}
 $('music-title').textContent=state.track?musicDisplayTitle(state.track):'选择时期即播放';$('music-artist').textContent=[state.track?.composer,state.track?.performer].filter(Boolean).join(' · ')||'本地精选与在线曲库';
 $('music-shuffle').setAttribute('aria-pressed',String(state.shuffle));$('music-shuffle').title=state.shuffle?'乱序：上一首也会选择新曲；点击切换顺序':'顺序：可以向前和向后切换';
 document.querySelectorAll('.era-btn').forEach(button=>{const selected=button.dataset.era===state.era;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));});
 $('music-online')?.setAttribute('aria-pressed',String(state.online));
 $('music-status').textContent=state.status;
 const link=$('music-source');link.href=state.track?.sourceUrl||'https://commons.wikimedia.org/';link.textContent=state.track?`${state.track.localUrl?'本地录音':'在线录音'} · ${state.track.license||'Wikimedia Commons'} ↗`:'Wikimedia Commons 录音来源 ↗';
 const pool=tracks();$('music-count').textContent=String(pool.length);
 const list=$('music-list');list.replaceChildren();for(const track of pool){const row=document.createElement('button');row.type='button';row.dataset.musicId=track.id;row.textContent=musicDisplayTitle(track);row.title=[track.composer,track.performer].filter(Boolean).join(' · ');row.setAttribute('aria-current',String(track.id===state.track?.id));list.append(row);}
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
  entry.url=URL.createObjectURL(new Blob(chunks,{type:response.headers.get('Content-Type')||'audio/mpeg'}));entry.status='ready';
 })().catch(()=>{if(entry.status==='loading')entry.status='failed';}).finally(()=>{
  $('music-panel').dataset.buffered=String([...state.buffers.values()].filter(value=>value.status==='ready').length);
 });
}
function prefetch(){
 if(!local.length&&!state.online&&!state.track)return;
 const pool=tracks(),plan=[],first=pick(1);if(first&&first.id!==state.track?.id)plan.push(first);
 const remaining=pool.filter(track=>track.id!==state.track?.id&&!plan.some(item=>item.id===track.id));
 if(state.shuffle)for(let i=remaining.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[remaining[i],remaining[j]]=[remaining[j],remaining[i]];}
 else if(state.track){const index=pool.findIndex(track=>track.id===state.track.id);remaining.sort((a,b)=>((pool.indexOf(a)-index+pool.length)%pool.length)-((pool.indexOf(b)-index+pool.length)%pool.length));}
 plan.push(...remaining.slice(0,3-plan.length));state.plan=plan;
 const keep=new Set([state.track?.id,...plan.map(track=>track.id)]);for(const id of state.buffers.keys())if(!keep.has(id))disposeBuffer(id);
 for(const track of plan)bufferTrack(track);
 $('music-panel').dataset.preloadCount=String(plan.length);
}
function start(track){
 if(!track)return;
 const serial=++state.serial;audio.pause();state.track=track;state.playing=false;state.status='';resetProgress();
 state.history.push(track.id);if(state.history.length>32)state.history.shift();
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
 const target=state.shuffle&&state.plan[0]&&!state.failed.has(state.plan[0].id)?state.plan[0]:pick(direction);
 if(target)start(target);
}
function fail(serial=state.serial){
 if(serial!==state.serial||!state.track)return;
 state.failed.add(state.track.id);state.errors++;state.playing=false;
 if(state.online&&state.errors>=3){state.online=false;state.plan=[];start(pick(1,true));state.status='在线录音暂不可用，已切换本地精选。';render();return;}
 if(state.errors>=6||!tracks().length){state.status='暂时无法播放，请检查网络后重试。';render();return;}
 state.plan=[];advance();
}
async function expandOnline(){
 if(!state.online||state.discovering)return;state.discovering=true;
 const era=state.era;state.status='正在扩充在线曲库…';render();
 try{
  const result=await discoverMusic(era);const seen=new Set(state.onlineTracks.map(track=>track.id));for(const track of result.tracks)if(!seen.has(track.id)){state.onlineTracks.push(track);seen.add(track.id);}
  if(state.online&&state.era===era){state.status=result.tracks.length?'已加入可播放的在线录音。':result.message||'当前网络无法扩充曲库，仍可播放本地精选。';prefetch();render();}
 }catch{if(state.era===era){state.status='在线曲库暂不可用，本地精选可继续播放。';render();}}
 finally{state.discovering=false;}
}
function closePanel(){$('music-panel').classList.add('hidden');$('music-toggle').setAttribute('aria-expanded','false');}
export function setupPeriodMusic(){
 let copyTimer;
 const copyTitle=async()=>{if(!state.track)return;const label=musicCopyTitle(state.track),toast=$('music-copy-toast');try{await navigator.clipboard.writeText(label);toast.textContent='已复制';}catch{toast.textContent='复制失败，请允许剪贴板权限';}clearTimeout(copyTimer);toast.hidden=false;copyTimer=setTimeout(()=>toast.hidden=true,1400);};
 $('music-copy').addEventListener('click',copyTitle);$('music-copy').addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();copyTitle();}});
 audio.volume=.25;$('music-next-audio').preload='none';
 audio.addEventListener('playing',()=>{state.playing=true;state.errors=0;state.status='';render();});
 audio.addEventListener('pause',()=>{state.playing=false;render();});
 audio.addEventListener('durationchange',()=>{if(Number.isFinite(audio.duration))$('music-duration').textContent=time(audio.duration);});
 audio.addEventListener('timeupdate',()=>{if(!Number.isFinite(audio.currentTime))return;$('music-elapsed').textContent=time(audio.currentTime);if(Number.isFinite(audio.duration)&&audio.duration>0){$('music-seek').value=Math.round(audio.currentTime/audio.duration*1000);$('music-seek').style.setProperty('--seek-progress',Math.round(audio.currentTime/audio.duration*100)+'%');}});
 audio.addEventListener('ended',()=>{resetProgress();advance();if(state.online)expandOnline();});
 audio.addEventListener('error',()=>{if(audio.getAttribute('src')&&audio.error)fail();});
 $('music-toggle').addEventListener('click',event=>{event.stopPropagation();const open=$('music-panel').classList.contains('hidden');$('music-panel').classList.toggle('hidden',!open);$('music-toggle').setAttribute('aria-expanded',String(open));if(open){prefetch();if(state.online)expandOnline();}});
 $('music-close').addEventListener('click',closePanel);
 document.addEventListener('pointerdown',event=>{if(!event.composedPath().includes($('music-panel'))&&!event.target.closest?.('#music-toggle'))closePanel();});
 $('music-panel').addEventListener('keydown',event=>{if(event.key==='Escape')closePanel();});
 document.querySelectorAll('.era-btn').forEach(button=>button.addEventListener('click',()=>{
  state.era=button.dataset.era;if(state.era==='all')state.shuffle=true;state.plan=[];state.errors=0;
  start(pick(1,true));if(state.online)expandOnline();
 }));
 $('music-play').addEventListener('click',()=>{if(!audio.paused){audio.pause();return;}if(state.track&&!state.failed.has(state.track.id))audio.play().catch(()=>fail());else{state.failed.clear();state.errors=0;start(pick(1,true));}});
 $('music-prev').addEventListener('click',()=>advance(-1));$('music-next').addEventListener('click',()=>advance(1));
 $('music-shuffle').addEventListener('click',()=>{state.shuffle=!state.shuffle;prefetch();render();});
 $('music-online').addEventListener('click',()=>{state.online=!state.online;state.plan=[];prefetch();render();if(state.online){if(audio.paused)start(pick(1,true));expandOnline();}});
 $('music-list').addEventListener('click',event=>{const button=event.target.closest('[data-music-id]');if(button)start(tracks().find(track=>track.id===button.dataset.musicId));});
 $('music-more').addEventListener('click',()=>{state.online=true;render();expandOnline();});
 $('music-seek').addEventListener('input',event=>{if(Number.isFinite(audio.duration)&&audio.duration>0)audio.currentTime=audio.duration*Number(event.target.value)/1000;});
 $('music-seek').addEventListener('pointerup',event=>event.target.blur());
 addEventListener('resize',()=>{syncPanelAnchor();updateTrackOverflow();},{passive:true});new ResizeObserver(syncPanelAnchor).observe(document.querySelector('.masthead'));
 addEventListener('pagehide',()=>{audio.pause();for(const id of [...state.buffers.keys()])disposeBuffer(id);});
 syncPanelAnchor();render();setTimeout(()=>{if(!state.buffers.size&&!state.track)prefetch();},2500);
}
