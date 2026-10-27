import { showSurface, hideSurface, surfaceOpen } from './surface-motion.js';
import { MUSIC_SEED } from './music-library.js';
import { LOCAL_MUSIC } from './local-music.js';
import { selectMusicTrack, musicDisplayTitle, musicCopyTitle, musicPerformer, musicComposerInitial } from './music-order.js';
import { discoverMusic } from './online-music.js';
import { setupMusicSession } from './music-session.js';
import { createPcmSpectrum } from './pcm-spectrum.js';
const ERAS={baroque:'巴洛克',classical:'古典',romantic:'浪漫',modern:'近现代'};
const $=id=>document.getElementById(id),audio=$('music-audio');
const local=LOCAL_MUSIC.map(track=>({...track,id:'local:'+track.file,localUrl:'./assets/music/'+encodeURIComponent(track.file)}));
const remoteSeed=MUSIC_SEED.map(([file,title,composer])=>({id:'seed:'+file,file,title,composer,era:/巴赫|亨德尔|维瓦尔第|斯卡拉蒂/.test(composer)?'baroque':/莫扎特|贝多芬|海顿/.test(composer)?'classical':/德彪西|拉威尔|萨蒂/.test(composer)?'modern':'romantic',sourceUrl:'https://commons.wikimedia.org/wiki/File:'+encodeURIComponent(file)}));
const state={era:'all',onlineBackoffUntil:0,onlineTracks:[],track:null,history:[],failed:new Set(),buffers:new Map(),plan:[],serial:0,errors:0,playing:false,status:'',discovering:false};
const source=track=>track.localUrl||track.remoteUrl||'https://commons.wikimedia.org/wiki/Special:Redirect/file/'+encodeURIComponent(track.file).replace(/%20/g,'_');
function updateMonogram(track){
 const box=document.querySelector('.now-art'),initial=musicComposerInitial(track),current=box.querySelector('[data-current=true]');
 box.title=track?.composer||'';
 if(current?.textContent===initial)return;
 for(const old of box.querySelectorAll('.composer-monogram')){delete old.dataset.current;hideSurface(old,()=>old.remove());}
 const letter=document.createElement('span');letter.className='composer-monogram';letter.dataset.current='true';letter.textContent=initial;letter.hidden=true;box.append(letter);showSurface(letter);
}
const labelScrolls=new Map();let labelFrame=0;
function cancelLabelScroll(node){const previous=labelScrolls.get(node);previous?.animation?.cancel();labelScrolls.delete(node);}
function scrollMusicLabel(node,viewport,key){
 if(!node||!viewport)return;
 const distance=Math.max(0,node.scrollWidth-viewport.clientWidth+12),overflow=node.scrollWidth>viewport.clientWidth+2,reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const previous=labelScrolls.get(node),signature=JSON.stringify([key,Math.round(distance),reduced,overflow]);
 if(previous?.signature===signature)return;
 cancelLabelScroll(node);let animation=null;
 if(overflow&&!reduced){const end=`translateX(${-distance}px)`;animation=node.animate([{transform:'translateX(0)',offset:0},{transform:'translateX(0)',offset:.1},{transform:end,offset:.9},{transform:end,offset:1}],{duration:Math.max(8500,distance/18*1000+2400),delay:1600,iterations:Infinity,direction:'alternate',easing:'linear',fill:'both'});}
 labelScrolls.set(node,{signature,animation});viewport.classList.toggle('is-overflowing',overflow);
}
let spectrumContext=null,spectrum=null,spectrumSource=null,spectrumFrame=0,spectrumTap=null,spectrumSerial=-1,spectrumSink=null,spectrumTrack=null,mediaSession=null;
let pcmSpectrum=null,pcmSerial=-1,pcmQueue=Promise.resolve();
audio.crossOrigin='anonymous';
function stopSpectrum(){cancelAnimationFrame(spectrumFrame);spectrumFrame=0;for(const bar of document.querySelectorAll('.wave-bars i'))bar.style.transform='scaleY(.12)';}
function primeSpectrum(){
 if(document.hidden)return;
 const mobile=matchMedia('(pointer: coarse)').matches||/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 if(!audio.captureStream&&!audio.mozCaptureStream&&mobile)return;
 try{if(!spectrumContext){const Context=window.AudioContext||window.webkitAudioContext;if(!Context)return;spectrumContext=new Context();}spectrumContext.resume().catch(()=>{});}catch{}
}
function preparePcmSpectrum(){
 if(!state.track||pcmSerial===state.serial)return;
 const Context=window.OfflineAudioContext||window.webkitOfflineAudioContext;if(!Context)return;
 const serial=state.serial,track=state.track;pcmSerial=serial;pcmSpectrum=null;
 if(Number(track.duration||audio.duration)>900)return;
 bufferTrack(track);const entry=state.buffers.get(track.id);
 (async()=>{
  await entry?.promise;if(state.serial!==serial||!entry?.url)return;
  const response=await fetch(entry.url),bytes=await response.arrayBuffer();if(state.serial!==serial)return;
  // Only decoding is serialized. An old network fetch must not hold up the
  // current recording's visualizer after a quick track change.
  pcmQueue=pcmQueue.catch(()=>{}).then(async()=>{
   if(state.serial!==serial)return;
   // 8 kHz is enough for the displayed bands and bounds decoded memory on phones.
   const context=new Context(1,1,8000),buffer=await context.decodeAudioData(bytes);
   if(state.serial===serial)pcmSpectrum=createPcmSpectrum(buffer);
  });await pcmQueue;
 })().catch(()=>{});
}
function clearSpectrumTap(){
 spectrumSource?.disconnect();spectrum?.disconnect();spectrumSink?.disconnect();
 spectrumTap?.getTracks().forEach(track=>track.stop());
 spectrumSource=null;spectrum=null;spectrumSink=null;spectrumTap=null;spectrumTrack=null;spectrumSerial=-1;
}
function connectSpectrumSource(capture){
 if(capture){
  const track=spectrumTap?.getAudioTracks().find(track=>track.readyState==='live');
  if(!track)return;
  if(spectrumSource&&spectrumTrack===track)return;
  spectrumSource?.disconnect();spectrumTrack=track;
  spectrumSource=spectrumContext.createMediaStreamSource(new MediaStream([track]));
 }else if(!spectrumSource)spectrumSource=spectrumContext.createMediaElementSource(audio);
 if(!spectrum){
  spectrum=spectrumContext.createAnalyser();spectrum.fftSize=1024;spectrum.smoothingTimeConstant=.72;
  if(capture){spectrumSink=spectrumContext.createGain();spectrumSink.gain.value=0;spectrum.connect(spectrumSink);spectrumSink.connect(spectrumContext.destination);}
  else spectrum.connect(spectrumContext.destination);
 }
 spectrumSource.connect(spectrum);
}
function ensureSpectrum(){
 if(document.hidden||audio.paused)return;
 try{
  const capture=audio.captureStream||audio.mozCaptureStream;
  const mobile=matchMedia('(pointer: coarse)').matches||/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  if(!capture&&mobile){preparePcmSpectrum();return;}
  primeSpectrum();if(!spectrumContext)return;
  if(capture&&spectrumSerial!==state.serial){
   clearSpectrumTap();const serial=state.serial,stream=capture.call(audio);spectrumTap=stream;spectrumSerial=serial;
   // Captured tracks can arrive AFTER playing. Keep this stream and connect
   // on addtrack rather than abandoning the visualizer on the first empty read.
   const reconnect=()=>{
    if(spectrumTap!==stream||state.serial!==serial)return;
    if(spectrumTrack?.readyState==='ended'){spectrumSource?.disconnect();spectrumSource=null;spectrumTrack=null;}
    if(!document.hidden&&!audio.paused){try{connectSpectrumSource(true);}catch{}}
   };
   stream.addEventListener('addtrack',reconnect);stream.addEventListener('removetrack',reconnect);
  }
  connectSpectrumSource(!!capture);
  spectrumContext.resume().catch(()=>{});
 }catch{preparePcmSpectrum();}
}
function startSpectrum(){
 stopSpectrum();if(document.hidden)return;
 const groups=[[1,4],[4,8],[8,16],[16,32],[32,64]],bars=[...document.querySelectorAll('.wave-bars i')],started=performance.now();let data=null,lastCheck=-Infinity,lastPcm=-Infinity,pcmLevels=null;
 const frame=now=>{
  if(document.hidden||audio.paused||!surfaceOpen($('music-panel'))){spectrumFrame=0;return;}
  // Recover from delayed tracks, an interrupted AudioContext and returning from
  // background playback. This loop never controls the audible media element.
  if(now-lastCheck>=400){lastCheck=now;ensureSpectrum();}
  const live=spectrum&&spectrumContext?.state==='running'&&(!spectrumTap||spectrumTrack?.readyState==='live');
  if(now-started>3000&&!live)preparePcmSpectrum();
  let levels=null;
  if(live){
   if(data?.length!==spectrum.frequencyBinCount)data=new Uint8Array(spectrum.frequencyBinCount);
   spectrum.getByteFrequencyData(data);levels=groups.map(([from,to])=>{let total=0;for(let j=from;j<to;j++)total+=data[j];return total/(to-from)/255;});
  }else if(pcmSpectrum&&pcmSerial===state.serial){if(now-lastPcm>=50){lastPcm=now;pcmLevels=pcmSpectrum(audio.currentTime);}levels=pcmLevels;}
  if(levels){
   levels.forEach((level,i)=>{if(bars[i])bars[i].style.transform=`scaleY(${(.2+.8*Math.sqrt(level)).toFixed(3)})`;});
  }
  spectrumFrame=requestAnimationFrame(frame);
 };spectrumFrame=requestAnimationFrame(frame);
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
function updateTrackOverflow(){
 if(!surfaceOpen($('music-panel')))return;
 const title=$('music-title'),artist=$('music-artist'),credit=artist.querySelector('.music-credit-text'),key=state.track?.id||'';
 scrollMusicLabel(title,title.closest('.music-title-viewport'),key);scrollMusicLabel(credit,artist,key);
}
function scheduleTrackOverflow(){if(labelFrame)return;labelFrame=requestAnimationFrame(()=>{labelFrame=0;updateTrackOverflow();});}

function syncPanelAnchor(){
 const root=document.documentElement,header=document.querySelector('.masthead'),button=$('music-toggle').getBoundingClientRect(),viewport=window.visualViewport;
 const width=viewport?.width||root.clientWidth,height=viewport?.height||innerHeight,x=viewport?.offsetLeft||0,y=viewport?.offsetTop||0;
 const panelWidth=Math.min(414,width-24),center=(button.left+button.right)/2;
 const left=Math.max(x+12,Math.min(center-panelWidth/2,x+width-12-panelWidth)),top=Math.max(y+8,button.bottom+10);
 root.style.setProperty('--masthead-h',Math.round(header.getBoundingClientRect().height)+'px');
 root.style.setProperty('--music-panel-left',left+'px');root.style.setProperty('--music-panel-top',top+'px');
 root.style.setProperty('--music-panel-width',panelWidth+'px');root.style.setProperty('--music-panel-max-height',Math.max(80,y+height-top-12)+'px');
 root.style.setProperty('--music-panel-origin',Math.max(0,Math.min(panelWidth,center-left))+'px');
}
let anchorFrame=0;
function schedulePanelAnchor(){if(anchorFrame)return;anchorFrame=requestAnimationFrame(()=>{anchorFrame=0;syncPanelAnchor();});}
function render(){
 const playing=state.playing&&!audio.paused;
 $('music-panel').classList.toggle('is-playing',playing);$('music-toggle').classList.toggle('music-is-playing',playing);$('music-toggle').setAttribute('aria-label',playing?'古典乐，正在播放':'古典乐，未播放');
 const button=$('music-play'),icon=playing?'pause':'play';if(button.dataset.icon!==icon){button.dataset.icon=icon;button.innerHTML=playing?pauseIcon:playIcon;button.setAttribute('aria-label',playing?'暂停':'播放');button.title=playing?'暂停':'播放';}
 const title=$('music-title'),titleText=state.track?musicDisplayTitle(state.track):'即刻开始聆听';if(title.textContent!==titleText){cancelLabelScroll(title);title.textContent=titleText;}
 const artist=$('music-artist'),composer=state.track?.composer||'',performer=musicPerformer(state.track),creditKey=JSON.stringify([composer,performer]);
 if(artist.dataset.creditKey!==creditKey){
  artist.dataset.creditKey=creditKey;cancelLabelScroll(artist.querySelector('.music-credit-text'));const text=document.createElement('span');text.className='music-credit-text';artist.replaceChildren(text);
  if(composer){const name=document.createElement('span');name.className='music-composer';name.textContent=composer;text.append(name);}
  if(performer){if(composer)text.append(document.createTextNode(' '));const name=document.createElement('span');name.className='music-performer';name.textContent=performer;text.append(name);}
  if(!composer&&!performer)text.textContent='点击暂停键播放';
 }
 document.querySelectorAll('.era-btn').forEach(button=>{const selected=button.dataset.era===state.era;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));});
 // Recording attribution remains on the compact artist line; no controls or
 // web prompts are inserted below the progress bar.
 artist.href=state.track?.sourceUrl||'https://commons.wikimedia.org/';artist.title=[[composer,performer].filter(Boolean).join(' '),[state.track?.credit,state.track?.license,'查看录音来源与许可'].filter(Boolean).join(' · ')].filter(Boolean).join('\n');
 button.title=state.status||(playing?'暂停':'播放');$('music-panel').dataset.onlineCount=String(state.onlineTracks.length);$('music-panel').dataset.discovering=String(state.discovering);
 scheduleTrackOverflow();
 mediaSession?.sync();
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
 mediaSession?.activate();primeSpectrum();
 const serial=++state.serial;pcmSpectrum=null;audio.pause();state.track=track;state.playing=false;state.status='';resetProgress();
 updateMonogram(track);state.history.push(track.id);if(state.history.length>32)state.history.shift();
 audio.src=state.buffers.get(track.id)?.url||source(track);audio.preload='auto';audio.load();
 // play() stays in the user's click stack, including on iPhone. Do not await a manifest/fetch first.
 const request=audio.play();render();prefetch();
 request.then(()=>{if(serial===state.serial){state.playing=!audio.paused;render();}}).catch(error=>{
  if(serial!==state.serial||error.name==='AbortError')return;
  if(error.name==='NotAllowedError'){state.status='浏览器暂停了播放，请点播放继续。';state.playing=false;render();}
  else fail(serial);
 });
}
function resumePlayback(){
 mediaSession?.activate();primeSpectrum();
 if(!state.track||state.failed.has(state.track.id)){state.failed.clear();state.errors=0;start(pick(1));return;}
 const serial=state.serial;
 return audio.play().catch(error=>{
  if(serial!==state.serial||error.name==='AbortError')return;
  if(error.name==='NotAllowedError'){state.status='请点播放继续。';state.playing=false;render();}
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
function closePanel(){
 const panel=$('music-panel');if(!surfaceOpen(panel))return;
 for(const entry of labelScrolls.values())entry.animation?.pause();
 hideSurface(panel).then(()=>{if(!surfaceOpen(panel))for(const node of labelScrolls.keys())cancelLabelScroll(node);});
 $('music-toggle').setAttribute('aria-expanded','false');stopSpectrum();
}
export function setupPeriodMusic(){
 let copyTimer;
 const copyTitle=async()=>{if(!state.track)return;const label=musicCopyTitle(state.track),toast=$('music-copy-toast');try{await navigator.clipboard.writeText(label);toast.textContent='已复制';}catch{toast.textContent='复制失败，请允许剪贴板权限';}clearTimeout(copyTimer);showSurface(toast);copyTimer=setTimeout(()=>hideSurface(toast),1400);};
 $('music-copy').addEventListener('click',copyTitle);$('music-copy').addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();copyTitle();}});
 audio.volume=.25;$('music-next-audio').preload='none';
 mediaSession=setupMusicSession({audio,getTrack:()=>state.track,play:resumePlayback,pause:()=>audio.pause(),previous:()=>advance(-1),next:()=>advance(1)});
 audio.addEventListener('playing',()=>{state.playing=true;state.errors=0;state.status='';ensureSpectrum();render();startSpectrum();});
 audio.addEventListener('pause',()=>{state.playing=false;stopSpectrum();render();});
 audio.addEventListener('durationchange',()=>{if(Number.isFinite(audio.duration))$('music-duration').textContent=time(audio.duration);});
 audio.addEventListener('timeupdate',()=>{if(!Number.isFinite(audio.currentTime))return;$('music-elapsed').textContent=time(audio.currentTime);if(Number.isFinite(audio.duration)&&audio.duration>0){$('music-seek').value=Math.round(audio.currentTime/audio.duration*1000);$('music-seek').style.setProperty('--seek-progress',Math.round(audio.currentTime/audio.duration*100)+'%');}});
 audio.addEventListener('ended',()=>{resetProgress();advance();expandOnline();});
 audio.addEventListener('error',()=>{if(audio.getAttribute('src')&&audio.error)fail();});
 $('music-toggle').addEventListener('click',event=>{event.stopPropagation();const open=!surfaceOpen($('music-panel'));if(open){syncPanelAnchor();showSurface($('music-panel'));for(const entry of labelScrolls.values())entry.animation?.play();scheduleTrackOverflow();}else closePanel();$('music-toggle').setAttribute('aria-expanded',String(open));if(open){prefetch();expandOnline();if(!audio.paused){primeSpectrum();ensureSpectrum();startSpectrum();}}else stopSpectrum();});
 $('music-close').addEventListener('click',closePanel);
 document.addEventListener('pointerdown',event=>{if(!event.composedPath().includes($('music-panel'))&&!event.target.closest?.('#music-toggle'))closePanel();});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&surfaceOpen($('music-panel'))){event.preventDefault();closePanel();$('music-toggle').focus({preventScroll:true});}});
 document.querySelectorAll('.era-btn').forEach(button=>button.addEventListener('click',()=>{
  state.era=button.dataset.era;state.failed.clear();state.plan=[];state.errors=0;
  start(pick(1));expandOnline();
 }));
 $('music-play').addEventListener('click',()=>{if(!audio.paused)audio.pause();else resumePlayback();});
 $('music-prev').addEventListener('click',()=>advance(-1));$('music-next').addEventListener('click',()=>advance(1));
 $('music-seek').addEventListener('input',event=>{if(Number.isFinite(audio.duration)&&audio.duration>0)audio.currentTime=audio.duration*Number(event.target.value)/1000;});
 $('music-seek').addEventListener('pointerup',event=>event.target.blur());
 addEventListener('resize',()=>{syncPanelAnchor();updateTrackOverflow();},{passive:true});const anchorObserver=new ResizeObserver(schedulePanelAnchor);anchorObserver.observe(document.querySelector('.masthead'));anchorObserver.observe($('music-toggle'));
 addEventListener('scroll',()=>{if(surfaceOpen($('music-panel')))schedulePanelAnchor();},{passive:true});
 window.visualViewport?.addEventListener('resize',schedulePanelAnchor,{passive:true});window.visualViewport?.addEventListener('scroll',schedulePanelAnchor,{passive:true});
 const hideVisuals=()=>{stopSpectrum();for(const entry of labelScrolls.values())entry.animation?.pause();cancelAnimationFrame(labelFrame);labelFrame=0;};
 const restoreVisuals=()=>{render();if(surfaceOpen($('music-panel'))){for(const entry of labelScrolls.values())entry.animation?.play();scheduleTrackOverflow();}if(!audio.paused){ensureSpectrum();startSpectrum();}};
 document.addEventListener('visibilitychange',()=>{if(document.hidden)hideVisuals();else restoreVisuals();});
 // Keep the same audio element and buffered URLs alive. A page lifecycle event
 // must not explicitly stop music; a true tab/process close is handled by the OS.
 addEventListener('pagehide',hideVisuals);
 addEventListener('pageshow',restoreVisuals);
 matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change',scheduleTrackOverflow);
 syncPanelAnchor();render();setTimeout(()=>{if(!state.buffers.size&&!state.track)prefetch();if(!state.track)expandOnline();},2500);
}
