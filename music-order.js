// Pure selection logic shared by playback and its tests.
export function selectMusicTrack(pool,{currentId=null,recent=[],shuffle=true,direction=1,rng=Math.random}={}){
 if(!pool.length)return null;
 if(!shuffle){const index=pool.findIndex(track=>track.id===currentId);return pool[index<0?(direction<0?pool.length-1:0):(index+direction+pool.length)%pool.length];}
 const fresh=pool.filter(track=>track.id!==currentId&&!recent.slice(-2).includes(track.id));
 const other=pool.filter(track=>track.id!==currentId),choices=fresh.length?fresh:other.length?other:pool;
 return choices[Math.min(choices.length-1,Math.floor(rng()*choices.length))];
}
// This timeline retains the actual order heard, independently of catalogue
// ordering and random selection. Navigating it must not append duplicates.
export function recordMusicVisit(timeline,track,index=null,limit=500){
 if(Number.isInteger(index)&&timeline.entries[index]?.id===track.id)return {...timeline,cursor:index};
 const entries=[...timeline.entries,{...track}].slice(-limit);return {entries,cursor:entries.length-1};
}
export function musicHistoryStep(timeline,direction=1,failed=new Set()){
 const step=direction<0?-1:1;
 for(let index=timeline.cursor+step;index>=0&&index<timeline.entries.length;index+=step){
  const track=timeline.entries[index];if(!failed.has(track.id))return {track,index};
 }
 return null;
}
const COMPOSER_ALIASES={
 巴赫:['Johann Sebastian Bach','J. S. Bach','JS Bach','Bach'],亨德尔:['George Frideric Handel','Handel','Händel'],维瓦尔第:['Antonio Vivaldi','Vivaldi'],斯卡拉蒂:['Domenico Scarlatti','Scarlatti'],
 莫扎特:['Wolfgang Amadeus Mozart','W. A. Mozart','Mozart'],海顿:['Joseph Haydn','Haydn'],贝多芬:['Ludwig van Beethoven','Beethoven'],格鲁克:['Christoph Willibald Gluck','Gluck'],
 肖邦:['Frédéric Chopin','Frederic Chopin','Chopin, Frédéric','Chopin'],舒伯特:['Franz Schubert','Schubert'],舒曼:['Robert Schumann','Schumann'],勃拉姆斯:['Johannes Brahms','Brahms'],
 德彪西:['Claude Debussy','Debussy'],萨蒂:['Erik Satie','Satie'],拉威尔:['Maurice Ravel','Ravel'],拉赫玛尼诺夫:['Sergei Rachmaninoff','Rachmaninoff'],
 格里格:['Edvard Grieg','Grieg'],巴拉基列夫:['Mily Balakirev','Balakirev'],格鲁克:['Christoph Willibald Gluck','Gluck']
};
export function musicDisplayTitle(track){
 if(!track)return '';
 let title=String(track.title||track.file||'').trim();
 const names=[track.composer,...(COMPOSER_ALIASES[track.composer]||[])].filter(Boolean).sort((a,b)=>b.length-a.length);
 for(const name of names){if(title.toLocaleLowerCase().startsWith(name.toLocaleLowerCase())){const rest=title.slice(name.length);if(/^[\s·:：|,–—-]+/.test(rest)){title=rest.replace(/^[\s·:：|,–—-]+/,'');break;}}}
 return title||track.title||track.file||'';
}
export function musicCopyTitle(track){return [track?.composer,musicDisplayTitle(track)].filter(Boolean).join(' - ');}
function cleanMusicCredit(value){
 let text=String(value||'').replace(/\s+/g,' ').trim();
 for(let i=0;i<3;i++)text=text.replace(/^(?:(?:played|performed|recorded|composed|written|arranged|performance|music)\s+by\b|(?:player|performer|artist|composer)\b\s*(?:by\b|[:：-])?|by\b)\s*[:：-]?\s*/i,'').trim();
 return text;
}
export function musicPerformer(track){
 let value=cleanMusicCredit(track?.performer);
 // Old cached Commons entries used these UI placeholders as artist metadata.
 if(/^(?:演奏者|演奏者信息)?\s*(?:见|详见|参见).*(?:来源|详情|页面|网页)|^(?:unknown|not specified|n\/a)$/i.test(value))return '';
 const names=[track?.composer,...(COMPOSER_ALIASES[track?.composer]||[])].filter(Boolean).sort((a,b)=>b.length-a.length);
 for(const name of names){
  if(value.toLocaleLowerCase()===name.toLocaleLowerCase())return '';
  if(value.toLocaleLowerCase().startsWith(name.toLocaleLowerCase())){
   const rest=value.slice(name.length).replace(/^\s*[（(]\s*\d{4}\s*[-–—]\s*\d{4}\s*[)）]/,'').replace(/^\s*[（(](?:composer|作曲家)[)）]/i,'');
   if(!rest.trim())return '';
   if(/^[\s·:：|,;；–—-]+/.test(rest)){value=rest.replace(/^[\s·:：|,;；–—-]+/,'');break;}
  }
 }
 value=cleanMusicCredit(value);
 return /^(?:player|performer|artist|by)$/i.test(value)?'':value;
}
export function musicComposerInitial(track){
 const composer=cleanMusicCredit(track?.composer),name=COMPOSER_ALIASES[composer]?.[0]||track?.composerEnglish||composer;
 const family=name.split(',')[0].normalize('NFKD').replace(/\p{M}/gu,'').trim(),words=family.match(/[A-Za-z][A-Za-z'’–-]*/g);
 return words?.at(-1)?.[0]?.toUpperCase()||'M';
}
