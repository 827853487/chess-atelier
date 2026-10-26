import { showSurface, hideSurface, surfaceOpen } from './surface-motion.js';
import { readMusicCover } from './music-cover.js';
import { MUSIC_SEED } from './music-library.js';
import { LOCAL_MUSIC } from './local-music.js';
import { selectMusicTrack, musicDisplayTitle, musicCopyTitle, musicPerformer } from './music-order.js';
import { discoverMusic } from './online-music.js';
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
function updateTrackOverflow(){const title=$('music-title'),wrap=title.closest('.music-title-viewport'),overflow=title.scrollWidth>wrap.clientWidth+6;title.classList.toggle('title-scroll',overflow);title.style.setProperty('--track-shift',overflow?Math.min(0,wrap.clientWidth-title.scrollWidth-14)+'px':'0px');const artist=$('music-artist');artist.classList.toggle('is-overflowing',artist.scrollWidth>artist.clientWidth+1);}
function syncPanelAnchor(){const header=document.querySelector('.masthead');document.documentElement.style.setProperty('--masthead-h',Math.round(header.getBoundingClientRect().height)+'px');}
function render(){
 const playing=state.playing&&!audio.paused;
 $('music-panel').classList.toggle('is-playing',playing);$('music-toggle').classList.toggle('music-is-playing',playing);$('music-toggle').setAttribute('aria-label',playing?'古典乐，正在播放':'古典乐，未播放');
 const button=$('music-play'),icon=playing?'pause':'play';if(button.dataset.icon!==icon){button.dataset.icon=icon;button.innerHTML=playing?pauseIcon:playIcon;button.setAttribute('aria-label',playing?'暂停':'播放');button.title=playing?'暂停':'播放';}
 $('music-title').textContent=state.track?musicDisplayTitle(state.track):'选择时期即播放';
 const artist=$('music-artist'),composer=state.track?.composer||'',performer=musicPerformer(state.track),creditKey=JSON.stringify([composer,performer]);
 if(artist.dataset.creditKey!==creditKey){
  artist.dataset.creditKey=creditKey;artist.replaceChildren();
  if(composer){const name=document.createElement('strong');name.className='music-composer';name.textContent=composer;artist.append(name);}
  if(performer){if(composer)artist.append(document.createTextNode(' '));const name=document.createElement('span');name.className='music-performer';name.textContent=performer;artist.append(name);}
  if(!composer&&!performer)artist.textContent='本地精选与在线曲库';
 }
 document.querySelectorAll('.era-btn').forEach(button=>{const selected=button.dataset.era===state.era;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));});
 // Recording attribution remains on the compact artist line; no controls or
 // web prompts are inserted below the progress bar.
 artist.href=state.track?.sourceUrl||'https://commons.wikimedia.org/';artist.title=[[composer,performer].filter(Boolean).join(' '),[state.track?.credit,state.track?.license,'查看录音来源与许可'].filter(Boolean).join(' · ')].filter(Boolean).join('\n');
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
export function setupPeriodMusic(){
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
