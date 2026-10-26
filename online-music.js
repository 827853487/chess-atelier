// Optional, anonymous Commons discovery. Playback stays in period-music.js.
// Sources and scope: data/ONLINE_MUSIC.md. No DOM or audio elements are used here.
const ONLINE_COMPOSERS={
 baroque:[
  ['Johann Sebastian Bach','巴赫',/Bach|\bBWV\b|Goldberg|Wohltemperiert|Well[- ]Tempered/i],
  ['George Frideric Handel','亨德尔',/Handel|Händel|Haendel|\bHWV\b/i],
  ['Antonio Vivaldi','维瓦尔第',/Vivaldi|\bRV\s*\d/i],
  ['Domenico Scarlatti','斯卡拉蒂',/Scarlatti/i]
 ],
 classical:[
  ['Wolfgang Amadeus Mozart','莫扎特',/Mozart/i],
  ['Joseph Haydn','海顿',/Haydn|\bHob\./i],
  ['Ludwig van Beethoven','贝多芬',/Beethoven/i],
  ['Christoph Willibald Gluck','格鲁克',/Gluck/i]
 ],
 romantic:[
  ['Frédéric Chopin','肖邦',/Chopin/i],
  ['Franz Schubert','舒伯特',/Schubert/i],
  ['Robert Schumann','舒曼',/Schumann/i],
  ['Johannes Brahms','勃拉姆斯',/Brahms/i]
 ],
 modern:[
  ['Claude Debussy','德彪西',/Debussy/i],
  ['Maurice Ravel','拉威尔',/Ravel/i],
  ['Erik Satie','萨蒂',/Satie|Gymnopédie|Gymnopedie|Gnossienne/i],
  ['Sergei Rachmaninoff','拉赫玛尼诺夫',/Rachmaninoff|Rachmaninov/i]
 ]
};
const ONLINE_CACHE_KEY='ChessAtelierOnlineMusicV1',ONLINE_ERAS=Object.keys(ONLINE_COMPOSERS);
const ONLINE_PER_ERA=60,ONLINE_MAX_BYTES=30*1024*1024,ONLINE_CACHE_AGE=14*86400000;
const ONLINE_ENTITIES={amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' ',ndash:'–',mdash:'—',hellip:'…',eacute:'é',Eacute:'É',aacute:'á',agrave:'à',ouml:'ö',uuml:'ü',auml:'ä',szlig:'ß',ccedil:'ç'};
function onlineText(value,limit=160){
 return String(value??'').replace(/<!--[\s\S]*?-->|<(?:script|style)\b[^>]*>[\s\S]*?<\/(?:script|style)>/gi,' ')
  .replace(/<[^>]*>/g,' ').replace(/&#(x[\da-f]+|\d+);/gi,(_,code)=>{
   const point=code[0].toLowerCase()==='x'?parseInt(code.slice(1),16):Number(code);
   return point>0&&point<=0x10ffff&&!(point>=0xd800&&point<=0xdfff)?String.fromCodePoint(point):' ';
  }).replace(/&([a-z][a-z0-9]+);/gi,(_,name)=>ONLINE_ENTITIES[name]??' ')
  .replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,limit);
}
function onlineUrl(value,host){
 try{const url=new URL(String(value));return url.protocol==='https:'&&url.hostname===host&&!url.username&&!url.password?url.href:null;}catch{return null;}
}
function onlineLicense(meta){
 const label=onlineText(meta.LicenseShortName?.value||meta.UsageTerms?.value,100),usage=onlineText(meta.UsageTerms?.value,180);
 if(/\b(?:NC|ND)\b|non[- ]?commercial|no derivatives|fair use|permission required/i.test(label+' '+usage))return null;
 const raw=onlineText(meta.LicenseUrl?.value,350);let url;
 try{url=new URL(raw);}catch{}
 if(url?.protocol==='https:'&&url.hostname==='creativecommons.org'){
  if(/^\/licenses\/by(?:-sa)?\/(?:1\.0|2\.0|2\.5|3\.0|4\.0)\/?$/.test(url.pathname))return {license:label||'Creative Commons '+url.pathname.split('/')[2],licenseUrl:url.href};
  if(/^\/publicdomain\/zero\/1\.0\/?$/.test(url.pathname))return {license:'CC0',licenseUrl:url.href};
  if(/^\/publicdomain\/mark\/1\.0\/?$/.test(url.pathname))return {license:'Public domain',licenseUrl:url.href};
 }
 if(/^(?:CC0(?: 1\.0)?|Public domain)$/i.test(label))return {license:label,licenseUrl:/CC0/i.test(label)?'https://creativecommons.org/publicdomain/zero/1.0/':'https://creativecommons.org/publicdomain/mark/1.0/'};
 if(/^CC[ -]BY(?:[ -]SA)?[ -](?:1\.0|2\.0|2\.5|3\.0|4\.0)$/i.test(label)){
  const share=/[ -]SA/i.test(label),version=label.match(/\d\.\d/)[0];
  return {license:label,licenseUrl:`https://creativecommons.org/licenses/${share?'by-sa':'by'}/${version}/`};
 }
 if(/^BSD(?: [23]-Clause)?$/i.test(label)&&url?.protocol==='https:'&&url.hostname==='opensource.org'&&/bsd/i.test(url.pathname))return {license:label,licenseUrl:url.href};
 return null;
}
function onlineTrack(page,era,composer){
 const info=page?.imageinfo?.[0],file=String(page?.title||'').replace(/^File:/,''),meta=info?.extmetadata||{};
 if(page?.ns!==6||!info||file.length>250||!file||!/\.(?:mp3|ogg|oga|wav|flac|opus|webm)$/i.test(file))return null;
 if(/(?:^|[\s_\-.])(?:excerpt|preview|sample|test|spoken|speech|interview|tutorial|midi)(?:[\s_\-.]|$)/i.test(file))return null;
 const bytes=Number(info.size),mime=String(info.mime||'').toLowerCase();
 if(!Number.isFinite(bytes)||bytes<200000||bytes>ONLINE_MAX_BYTES||(!mime.startsWith('audio/')&&mime!=='application/ogg')||String(info.mediatype).toUpperCase()==='VIDEO')return null;
 const remoteUrl=onlineUrl(info.url,'upload.wikimedia.org'),license=onlineLicense(meta);
 if(!remoteUrl||!license)return null;
 const title=onlineText(meta.ObjectName?.value||meta.Title?.value||file.replace(/_/g,' ').replace(/\.[^.]+$/,''),120);
 const description=onlineText(meta.ImageDescription?.value,2400),artist=onlineText(meta.Artist?.value,180);
 // A broad category can contain medleys, arrangements and unrelated material.
 // Require additional textual evidence for the attributed composer/work family.
 if(!composer[2].test(file+' '+title+' '+description+' '+artist))return null;
 const duration=(info.metadata||[]).find(row=>/^(?:playtime_seconds|duration)$/i.test(row.name||''))?.value;
 if(duration!==undefined&&Number.isFinite(Number(duration))&&Number(duration)<35)return null;
 const sourceUrl=onlineUrl(info.descriptionurl,'commons.wikimedia.org')||'https://commons.wikimedia.org/wiki/'+encodeURIComponent('File:'+file).replace(/%20/g,'_');
 const credit=onlineText(meta.Attribution?.value||meta.Credit?.value||artist,240);
 return {id:'commons:'+file,file,title,composer:composer[1],performer:artist||'演奏者见来源页',era,sourceUrl,...license,credit,remoteUrl,online:true,bytes,mime};
}
function onlineCursor(value){
 if(!value||typeof value!=='object'||Array.isArray(value))return null;
 const rows=Object.entries(value);if(rows.length>8)return null;
 if(rows.some(([key,text])=>!/^(?:continue|[a-z]+continue)$/.test(key)||typeof text!=='string'||text.length>1600))return null;
 return Object.fromEntries(rows);
}
function onlineEmptyState(){return Object.fromEntries(ONLINE_ERAS.map(era=>[era,{composerIndex:0,cursor:null,tracks:[],round:0}]));}
function onlineReadCache(){
 const state=onlineEmptyState();
 try{
  const raw=globalThis.localStorage?.getItem(ONLINE_CACHE_KEY);if(!raw||raw.length>400000)return state;
  const saved=JSON.parse(raw);if(saved.version!==1||!Number.isFinite(saved.savedAt)||Date.now()-saved.savedAt>ONLINE_CACHE_AGE)return state;
  for(const era of ONLINE_ERAS){
   const row=saved.eras?.[era];if(!row||typeof row!=='object')continue;
   state[era].composerIndex=Number.isInteger(row.composerIndex)&&row.composerIndex>=0&&row.composerIndex<ONLINE_COMPOSERS[era].length?row.composerIndex:0;
   state[era].cursor=onlineCursor(row.cursor);state[era].round=Number.isInteger(row.round)&&row.round>=0?Math.min(row.round,1000000):0;
   const unique=new Map();
   for(const track of Array.isArray(row.tracks)?row.tracks:[]){
    if(!track||track.era!==era||typeof track.file!=='string'||track.id!=='commons:'+track.file||!onlineUrl(track.remoteUrl,'upload.wikimedia.org')||!onlineUrl(track.sourceUrl,'commons.wikimedia.org'))continue;
    if(!Number.isFinite(track.bytes)||track.bytes<=0||track.bytes>ONLINE_MAX_BYTES||typeof track.mime!=='string')continue;
    const license=onlineLicense({LicenseShortName:{value:track.license},LicenseUrl:{value:track.licenseUrl}});if(!license)continue;
    unique.set(track.id,{...track,...license,title:onlineText(track.title,120),composer:onlineText(track.composer,40),performer:onlineText(track.performer,180),credit:onlineText(track.credit,240),online:true});
   }
   state[era].tracks=[...unique.values()].slice(-ONLINE_PER_ERA);
  }
 }catch{}
 return state;
}
const onlineState=onlineReadCache(),onlineInFlight=new Map();
let onlineQueue=Promise.resolve(),onlineLastRequest=0,onlineAllTurn=0,onlineCooldown=0;
function onlineSaveCache(){
 try{globalThis.localStorage?.setItem(ONLINE_CACHE_KEY,JSON.stringify({version:1,savedAt:Date.now(),eras:onlineState}));}catch{}
}
async function onlineDiscoverPage(era){
 const state=onlineState[era];
 if(Date.now()<onlineCooldown)return {tracks:state.tracks.slice(),hasMore:true,message:'在线目录暂时限流，先使用已缓存的曲目。'};
 const [name]=ONLINE_COMPOSERS[era][state.composerIndex],params=new URLSearchParams({action:'query',format:'json',formatversion:'2',origin:'*',generator:'categorymembers',gcmtitle:'Category:Audio files of music by '+name,gcmtype:'file',gcmlimit:'35',prop:'imageinfo',iiprop:'url|size|mime|mediatype|metadata|extmetadata',iiextmetadatalanguage:'en',...state.cursor});
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);
 try{
  const response=await fetch('https://commons.wikimedia.org/w/api.php?'+params,{signal:controller.signal,credentials:'omit',headers:{'Api-User-Agent':'ChessAtelier/1.2 (https://github.com/827853487/chess-atelier)'}});
  if(!response.ok){
   if(response.status===429||response.status===503){const wait=Number(response.headers.get('Retry-After'));onlineCooldown=Date.now()+Math.min(300,Number.isFinite(wait)&&wait>0?wait:30)*1000;}
   throw Error('Commons HTTP '+response.status);
  }
  const data=await response.json();
  if(data.error){if(/continue/i.test(String(data.error.code)))state.cursor=null;throw Error('Commons API error');}
  const composer=ONLINE_COMPOSERS[era][state.composerIndex],page=[];
  for(const entry of data.query?.pages||[]){const track=onlineTrack(entry,era,composer);if(track&&!page.some(row=>row.id===track.id))page.push(track);}
  const known=new Map(state.tracks.map(track=>[track.id,track]));for(const track of page)known.set(track.id,track);
  state.tracks=[...known.values()].slice(-ONLINE_PER_ERA);state.cursor=onlineCursor(data.continue);
  let hasMore=true;
  if(!state.cursor){state.composerIndex=(state.composerIndex+1)%ONLINE_COMPOSERS[era].length;if(state.composerIndex===0){state.round++;hasMore=false;}}
  onlineSaveCache();
  return {tracks:page.length?page:state.tracks.slice(),hasMore,message:page.length?undefined:hasMore?'本页没有合适录音，可继续读取下一页。':'本轮作曲家目录已读取完成。'};
 }catch(error){
  return {tracks:state.tracks.slice(),hasMore:true,message:error.name==='AbortError'?'在线目录读取超时，先使用本地或缓存曲目。':'暂时无法读取在线目录，先使用本地或缓存曲目。'};
 }finally{clearTimeout(timeout);}
}

export function discoverMusic(era='all'){
 const requested=era==='all'||ONLINE_ERAS.includes(era)?era:'all';
 if(onlineInFlight.has(requested))return onlineInFlight.get(requested);
 const actual=requested==='all'?ONLINE_ERAS[onlineAllTurn++%ONLINE_ERAS.length]:requested;
 if(onlineInFlight.has(actual)){
  const existing=onlineInFlight.get(actual);onlineInFlight.set(requested,existing);
  const clear=()=>{if(onlineInFlight.get(requested)===existing)onlineInFlight.delete(requested);};existing.then(clear,clear);
  return existing;
 }
 const task=onlineQueue.catch(()=>{}).then(async()=>{
  const wait=Math.max(0,900-(Date.now()-onlineLastRequest));if(wait)await new Promise(resolve=>setTimeout(resolve,wait));
  onlineLastRequest=Date.now();return onlineDiscoverPage(actual);
 });
 onlineQueue=task.then(()=>{},()=>{});onlineInFlight.set(requested,task);onlineInFlight.set(actual,task);
 const clear=()=>{for(const [key,value] of onlineInFlight)if(value===task)onlineInFlight.delete(key);};task.then(clear,clear);
 return task;
}
