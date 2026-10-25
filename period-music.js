import { MUSIC_SEED } from './music-library.js';
const ERAS={
 baroque:{label:'巴洛克',names:['巴赫','亨德尔','维瓦尔第','斯卡拉蒂'],composers:['Johann Sebastian Bach','George Frideric Handel','Antonio Vivaldi','Domenico Scarlatti']},
 classical:{label:'古典',names:['莫扎特','贝多芬','海顿'],composers:['Wolfgang Amadeus Mozart','Ludwig van Beethoven','Joseph Haydn']},
 romantic:{label:'浪漫',names:['肖邦','勃拉姆斯','舒伯特','舒曼','李斯特','柴可夫斯基','巴拉基列夫'],composers:['Frédéric Chopin','Johannes Brahms','Franz Schubert','Robert Schumann','Franz Liszt','Pyotr Ilyich Tchaikovsky']},
 modern:{label:'近现代',names:['德彪西','拉威尔','萨蒂','拉赫玛尼诺夫'],composers:['Claude Debussy','Maurice Ravel','Erik Satie','Sergei Rachmaninoff']}
};
const $=id=>document.getElementById(id),players=[$('music-audio'),$('music-next-audio')],state={era:'all',shuffle:true,active:0,track:null,history:[],known:new Map(),seen:new Set(),failed:new Set(),fetching:new Set(),count:new Map(),upNext:null,preloaded:null,serial:0,errors:0,playing:false};
const catalog=MUSIC_SEED.map(([file,title,composer,form])=>({id:file,file,title,composer,form,era:Object.keys(ERAS).find(k=>ERAS[k].names.some(n=>composer.includes(n)))||'modern'}));catalog.forEach(t=>state.seen.add(t.id));
const audio=()=>players[state.active],standby=()=>players[1-state.active],rand=a=>a[Math.floor(Math.random()*a.length)],isLocal=location.protocol==='http:'||location.protocol==='https:';
// 音频直连 Wikimedia Commons：这条路径在任何托管方式下都可用，
// 不依赖本机代理，因此在线版与本地版行为完全一致。
const source=t=>t.localUrl||fallback(t);
const fallback=t=>'https://commons.wikimedia.org/wiki/Special:Redirect/file/'+encodeURIComponent(t.file).replace(/%20/g,'_');
const playIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.8 18.7 12 8 18.2z"/></svg>',pauseIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM14 5h4v14h-4z"/></svg>';
function tracks(){const out=[...catalog,...[...state.known.values()].flat()];const ids=new Set();return out.filter(t=>(state.era==='all'||t.era===state.era)&&!state.failed.has(t.id)&&!ids.has(t.id)&&!!ids.add(t.id));}
function choose(direction=1){const all=tracks();if(!all.length)return null;if(state.shuffle){const recent=new Set(state.history.slice(-6)),pool=all.filter(t=>!recent.has(t.id));return rand(pool.length?pool:all);}const index=all.findIndex(t=>t.id===state.track?.id);return all[(index+direction+all.length)%all.length];}
const time=s=>Number.isFinite(s)&&s>=0?Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0'):'0:00';
function resetProgress(){
 $('music-elapsed').textContent='0:00';$('music-duration').textContent='0:00';
 $('music-seek').value=0;$('music-seek').style.setProperty('--seek-progress','0%');
}
function progressReady(p){return p&&!p.paused&&p.readyState>=3&&Number.isFinite(p.currentTime);}
function render(){const playing=state.playing&&!audio().paused;document.querySelector('#music-panel').classList.toggle('is-playing',playing);$('music-toggle').classList.toggle('music-is-playing',playing);$('music-toggle').setAttribute('aria-label',playing?'古典乐，正在播放':'古典乐，未播放');
 // 只在图标真正变化时重绘。innerHTML 替换会摧毁事件目标，
 // 使外层「点击组件外才收起」的 contains 判定失效。
 const play=$('music-play'),want=playing?pauseIcon:playIcon;
 if(play.dataset.icon!==(playing?'pause':'play')){play.dataset.icon=playing?'pause':'play';play.innerHTML=want;play.setAttribute('aria-label',playing?'暂停':'播放');play.title=playing?'暂停':'播放';}
 const title=state.track?.title||'选择时期后播放';if($('music-title').textContent!==title){$('music-title').textContent=title;queueMicrotask(updateTrackOverflow);}const artist=state.track?.composer||'钢琴与管弦乐';if($('music-artist').textContent!==artist)$('music-artist').textContent=artist;$('music-shuffle').setAttribute('aria-pressed',String(state.shuffle));$('music-shuffle').title=state.shuffle?'切换为顺序播放':'切换为随机播放';document.querySelectorAll('.era-btn').forEach(b=>{const on=b.dataset.era===state.era;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',String(on));});const countEl=$('music-count');if(countEl)countEl.textContent=String(tracks().length);}
function updateTrackOverflow(){
 const title=$('music-title'),wrap=title?.closest('.music-title-viewport');if(!title||!wrap)return;
 const overflow=title.scrollWidth>wrap.clientWidth+6;
 // 曲名长短会改变面板内部布局进而让面板跳动：固定单行高度并裁掉多余部分
 title.classList.toggle('title-scroll',overflow);
 title.style.setProperty('--track-shift',overflow?Math.min(0,wrap.clientWidth-title.scrollWidth-14)+'px':'0px');
}
// 面板定位跟随顶栏实际高度：顶栏在不同断点下高度不一，交给 JS 测量避免错位。
function syncPanelAnchor(){
 const head=document.querySelector('.masthead');
 if(!head)return;
 const h=Math.round(head.getBoundingClientRect().height);
 if(h>0&&h<200)document.documentElement.style.setProperty('--masthead-h',h+'px');
}
window.addEventListener('resize',()=>{syncPanelAnchor();if(!$('music-panel').classList.contains('hidden'))requestAnimationFrame(updateTrackOverflow);},{passive:true});
if(window.ResizeObserver)new ResizeObserver(syncPanelAnchor).observe(document.querySelector('.masthead')||document.body);
syncPanelAnchor();
// Load a candidate into the standby player before it is needed, so switching
// tracks (or pressing play for the first time) starts almost instantly.
function preloadTrack(item){
 if(!item)return;
 state.upNext=item;
 const p=standby();
 if(state.preloaded?.id===item.id&&state.preloaded.index===1-state.active&&p.src)return;
 state.preloaded={id:item.id,index:1-state.active};
 p.dataset.fallback='0';p.preload='auto';p.src=source(item);p.load();
 p.addEventListener('error',()=>{
  if(state.preloaded?.id===item.id){state.preloaded=null;state.upNext=null;}
 },{once:true});
}
function prefetch(){const next=choose(1);if(!next)return;preloadTrack(next);}
// Warm the server-side Commons URL cache for a batch of recordings with one API
// call; each first playback then skips the metadata round trip (~1s saved).
// The browser still streams through the local proxy, which works on networks
// where Wikimedia is not directly reachable.
const warmedFiles=new Set();
let warmApiUsable=null;
async function warmAudioUrls(){
 if(globalThis.CHESS_ENGINE_MODE==='browser')return;
 const files=tracks().map(t=>t.file).filter(f=>!warmedFiles.has(f)).slice(0,50);
 if(!files.length||!isLocal)return;
 if(warmApiUsable===false)return;
 files.forEach(f=>warmedFiles.add(f));
 try{
  const response=await fetch('/api/remote/audio-urls?files='+encodeURIComponent(files.join('|')),{cache:'force-cache'});
  // 仅本机serve.py 提供该预热接口；静态托管时收到 404，标记一次就不再试
  if(response.status===404||response.status===405){warmApiUsable=false;return;}
  if(!response.ok)return;
  await response.json();warmApiUsable=true;
 }catch{warmApiUsable=false;}
}
function preloadFirst(){const next=choose(1);if(next)preloadTrack(next);}
async function start(item){if(!item)return;const serial=++state.serial,was=audio();
 // "ready" means: this exact track was preloaded on the standby player AND it
 // actually has usable data (readyState >= 2). A preloaded track that errored
 // (429 etc.) will have readyState 0 — we must reload it fresh.
 const ready=state.preloaded?.id===item.id&&state.preloaded.index===1-state.active&&standby().src&&standby().readyState>=2;
 was.pause();state.active=1-state.active;const now=audio();
 if(!ready){now.pause();now.dataset.fallback='0';now.src=source(item);now.preload='auto';now.load();}
 state.track=item;resetProgress();state.history.push(item.id);if(state.history.length>32)state.history.shift();state.playing=false;state.errors=0;state.upNext=null;state.preloaded=null;render();
 try{await now.play();if(state.serial===serial){state.playing=!now.paused;render();prefetch();}}
 catch(e){if(serial!==state.serial)return;if(e.name==='NotAllowedError'){state.playing=false;render();}else retry(now);}}

function advance(dir=1){const next=dir===1&&state.upNext&&!state.failed.has(state.upNext.id)?state.upNext:choose(dir);if(next)start(next);}
function retry(p){if(p!==audio()||!state.track)return;if(!state.track.localUrl&&p.dataset.fallback!=='1'){p.dataset.fallback='1';p.src=fallback(state.track);p.load();p.play().then(()=>{state.playing=true;render();prefetch();}).catch(()=>fail(p));}else fail(p);}
function fail(p){if(p!==audio()||!state.track)return;state.failed.add(state.track.id);state.errors++;if(state.errors>=6||!tracks().length){state.playing=false;render();}else advance();}
function wire(p){p.preload='auto';p.volume=.25;
 p.addEventListener('playing',()=>{if(p===audio()){state.playing=true;render();if(Number.isFinite(p.duration))$('music-duration').textContent=time(p.duration);}});
 p.addEventListener('play',()=>{if(p===audio()&&p.readyState>=3){state.playing=true;render();}});
 p.addEventListener('pause',()=>{if(p===audio()){state.playing=false;render();}});
 p.addEventListener('durationchange',()=>{if(p===audio()&&Number.isFinite(p.duration)&&p.duration>0)$('music-duration').textContent=time(p.duration);});
 p.addEventListener('timeupdate',()=>{if(p!==audio()||!progressReady(p))return;$('music-elapsed').textContent=time(p.currentTime);if(Number.isFinite(p.duration)&&p.duration>0){$('music-seek').value=Math.round(p.currentTime/p.duration*1000);$('music-seek').style.setProperty('--seek-progress',Math.round(p.currentTime/p.duration*100)+'%');if(p.duration-p.currentTime<45&&!state.upNext)prefetch();}});
 p.addEventListener('ended',()=>{if(p===audio()){resetProgress();advance();}});
 p.addEventListener('error',()=>{if(p===audio()&&state.playing)retry(p);});
}
async function query(params){for(const url of ['https://commons.wikimedia.org/w/api.php?'+params]){const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);try{const r=await fetch(url,{signal:controller.signal});if(r.ok){const data=await r.json();if(data.query?.pages)return data;}}catch{}finally{clearTimeout(timeout);}}return null;}
// Commons 文件名常是上传者随手写的（988-aria lehman1 之类），直接当曲名
// 既难读也像乱码。优先用 extmetadata 里的真实作品名；取不到时再从文件名里
// 剥掉编号与上传者后缀，实在认不出来就退回「作曲家 + 时期」而不是原样展示。
function prettyTitle(file,meta,composer){
 const listed=String(meta?.['ObjectName']?.value||meta?.['Title']?.value||'').trim();
 const source=listed||file.replace(/_/g,' ').replace(/\.(ogg|oga|mp3|opus|flac|wav)$/i,'');
 let t=source
  .replace(/\b(File|Audio|Recording|Track|Ogg Vorbis|MP3)\b/gi,' ')
  .replace(/\.(ogg|oga|mp3|opus|flac|wav)$/i,' ')
  // 开头形如 "988-" "01 -" "988_v11." 的纯编号
  .replace(/^[\s._-]*(?:\d{1,4}[a-z]?[-_\s.])+/i,'')
  // 结尾形如 "-lehman1" "-v11" "v11 lehman1" 的上传者 / 版本后缀
  .replace(/[-_]?\s*v\d{1,3}\b\s*[-_]?\s*[a-z]{2,14}\d{0,3}\s*$/i,'')
  .replace(/[-_]?\s*[a-z]{2,14}\s*\d{1,3}\s*$/i,'')
  .replace(/\s*v\d{1,3}\b\s*$/i,' ')
  .replace(/[._]+/g,' ')
  .replace(/\s+/g,' ')
  .replace(/^[\s·—\-.,]+|[\s·—\-.,]+$/g,'');
 // 清洗后仍像编号、版本号或单个无意义词：Commons 上这类文件多为拼凑的
 // 试录，既看不出作品名也不保证录得好，宁可跳过也不要出现在列表里。
 // 有效曲名至少包含一个长度 >=3 的单词（Op. / No. / 奏鸣曲之类缩写也算），
 // 否则视为上传者随手命名的噪声文件，直接不收录。
 if(!t||t.length<4||!/[A-Za-z\u4e00-\u9fa5]{3,}/.test(t))return null;
 return t.slice(0,70);
}
function ingest(era,composer,data){const bucket=state.known.get(era)||[];let added=0;
 for(const page of data?.query?.pages||[]){
  const file=String(page.title||'').replace(/^File:/,''),info=page.imageinfo?.[0];
  if(page.ns!==6||!info||!/\.(ogg|oga|mp3|opus|flac|wav)$/i.test(file)||info.size<600000||info.size>160000000||/midi|excerpt|preview|sample|test|spoken/i.test(file)||state.seen.has(file))continue;
  const title=prettyTitle(file,page.extmetadata,composer);
  if(!title)continue;
  state.seen.add(file);
  bucket.push({id:file,file,title,composer,era});
  added++;
 }
 state.known.set(era,bucket);return added;}
async function discover(){const era=state.era==='all'?rand(Object.keys(ERAS)):state.era;if(state.fetching.has(era))return;const k=state.count.get(era)||0,composer=ERAS[era].composers[k%ERAS[era].composers.length];state.count.set(era,k+1);state.fetching.add(era);try{let q=new URLSearchParams({action:'query',format:'json',formatversion:'2',origin:'*',generator:'categorymembers',gcmtitle:'Category:Audio files of music by '+composer,gcmtype:'file',gcmlimit:'70',prop:'imageinfo|extmetadata',iiprop:'url|size|mime|extmetadata'});const first=await query(q);if(ingest(era,composer,first)<6){q=new URLSearchParams({action:'query',format:'json',formatversion:'2',origin:'*',generator:'search',gsrsearch:`"${composer}" filetype:audio`,gsrnamespace:'6',gsrlimit:'55',prop:'imageinfo|extmetadata',iiprop:'url|size|mime|extmetadata'});ingest(era,composer,await query(q));}render();warmAudioUrls();if(!state.upNext)prefetch();}finally{state.fetching.delete(era);}}
async function localManifest(){try{const r=await fetch('./assets/music/playlist.json');if(!r.ok)return;const rows=await r.json();if(!Array.isArray(rows))return;for(const t of rows){if(typeof t.file!=='string'||!/^[\w .()\-]+\.(mp3|ogg|oga|flac|wav)$/i.test(t.file))continue;const id='local:'+t.file;if(state.seen.has(id))continue;state.seen.add(id);catalog.unshift({id,localUrl:'./assets/music/'+encodeURIComponent(t.file),title:t.title||t.file,composer:t.composer||'',era:ERAS[t.era]?t.era:'romantic'});}}catch{}}
function closeMusicPanel(){const p=$('music-panel');if(!p||p.classList.contains('hidden'))return;p.classList.add('hidden');$('music-toggle').setAttribute('aria-expanded','false');}
export function setupPeriodMusic(){
 players.forEach(wire);
 $('music-toggle').addEventListener('click',e=>{e.stopPropagation();const open=!$('music-panel').classList.toggle('hidden');$('music-toggle').setAttribute('aria-expanded',String(open));if(open){discover();preloadFirst();warmAudioUrls();requestAnimationFrame(updateTrackOverflow);}});
 $('music-close').addEventListener('click',closeMusicPanel);
 // 点击组件外部才收起。面板内的播放、切歌、时期切换都会替换 innerHTML，
 // 因此不能用「事件到达时 target 是否仍在面板内」判断——改为在捕获阶段
 // 记录路径（此时 target 尚未被替换），再在冒泡阶段比对。
 let insidePath=null;
 document.addEventListener('pointerdown',e=>{
  const panel=$('music-panel');
  insidePath=panel.classList.contains('hidden')?null:[...e.composedPath()].includes(panel);
 },true);
 document.addEventListener('click',e=>{
  const panel=$('music-panel');if(panel.classList.contains('hidden'))return;
  if(e.composedPath().includes(panel))return;
  if(insidePath){insidePath=null;return;}
  if(e.target.closest?.('#music-toggle'))return;
  closeMusicPanel();
 });
 // 键盘操作也要能关闭面板，避免焦点停留在已收起的内容上
 $('music-panel').addEventListener('keydown',e=>{if(e.key==='Escape')closeMusicPanel();});
 document.querySelectorAll('.era-btn').forEach(b=>{
  // Start buffering the era's first recording on press, before the click lands,
  // so playback begins immediately when the era button is activated.
  b.addEventListener('pointerdown',()=>{
   const era=b.dataset.era;if(era===state.era)return;
   const previous=state.era;state.era=era;
   const pick=choose(1);
   state.era=previous;
   if(pick)preloadTrack(pick);
  });
  b.addEventListener('click',()=>{
   state.era=b.dataset.era;state.history=[];
   const wanted=b.dataset.era;
   if(!state.upNext||(wanted!=='all'&&state.upNext.era!==wanted)){state.preloaded=null;state.upNext=null;preloadFirst();}
   render();advance();discover();warmAudioUrls();
  });
 });
 $('music-play').addEventListener('click',()=>{const p=audio();if(p.paused){if(p.src)p.play().then(()=>{state.playing=true;render();prefetch();}).catch(()=>retry(p));else advance();}else{p.pause();render();}});
 $('music-prev').addEventListener('click',()=>advance(-1));$('music-next').addEventListener('click',()=>advance(1));
 $('music-shuffle').addEventListener('click',()=>{state.shuffle=!state.shuffle;state.preloaded=null;state.upNext=null;render();prefetch();});
 $('music-seek').addEventListener('input',e=>{e.target.style.setProperty('--seek-progress',Math.round(Number(e.target.value)/10)+'%');const p=audio();if(Number.isFinite(p.duration)&&p.duration>0)p.currentTime=p.duration*Number(e.target.value)/1000;});
 $('music-seek').addEventListener('pointerup',e=>e.target.blur());
 $('music-seek').addEventListener('keyup',e=>{if(e.key==='Enter'||e.key===' ')e.target.blur();});
 localManifest().then(render);render();requestAnimationFrame(updateTrackOverflow);
 document.fonts?.ready?.then(()=>{syncPanelAnchor();requestAnimationFrame(updateTrackOverflow);});
}
