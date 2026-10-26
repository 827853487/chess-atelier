// Pure selection logic shared by playback and its tests.
export function selectMusicTrack(pool,{currentId=null,recent=[],shuffle=true,direction=1,rng=Math.random}={}){
 if(!pool.length)return null;
 if(!shuffle){const index=pool.findIndex(track=>track.id===currentId);return pool[index<0?(direction<0?pool.length-1:0):(index+direction+pool.length)%pool.length];}
 const fresh=pool.filter(track=>track.id!==currentId&&!recent.slice(-2).includes(track.id));
 const other=pool.filter(track=>track.id!==currentId),choices=fresh.length?fresh:other.length?other:pool;
 return choices[Math.min(choices.length-1,Math.floor(rng()*choices.length))];
}
const COMPOSER_ALIASES={
 巴赫:['Johann Sebastian Bach','J. S. Bach','JS Bach','Bach'],亨德尔:['George Frideric Handel','Handel','Händel'],维瓦尔第:['Antonio Vivaldi','Vivaldi'],斯卡拉蒂:['Domenico Scarlatti','Scarlatti'],
 莫扎特:['Wolfgang Amadeus Mozart','W. A. Mozart','Mozart'],海顿:['Joseph Haydn','Haydn'],贝多芬:['Ludwig van Beethoven','Beethoven'],格鲁克:['Christoph Willibald Gluck','Gluck'],
 肖邦:['Frédéric Chopin','Frederic Chopin','Chopin, Frédéric','Chopin'],舒伯特:['Franz Schubert','Schubert'],舒曼:['Robert Schumann','Schumann'],勃拉姆斯:['Johannes Brahms','Brahms'],
 德彪西:['Claude Debussy','Debussy'],萨蒂:['Erik Satie','Satie'],拉威尔:['Maurice Ravel','Ravel'],拉赫玛尼诺夫:['Sergei Rachmaninoff','Rachmaninoff']
};
export function musicDisplayTitle(track){
 if(!track)return '';
 let title=String(track.title||track.file||'').trim();
 const names=[track.composer,...(COMPOSER_ALIASES[track.composer]||[])].filter(Boolean).sort((a,b)=>b.length-a.length);
 for(const name of names){if(title.toLocaleLowerCase().startsWith(name.toLocaleLowerCase())){const rest=title.slice(name.length);if(/^[\s·:：|,–—-]+/.test(rest)){title=rest.replace(/^[\s·:：|,–—-]+/,'');break;}}}
 return title||track.title||track.file||'';
}
export function musicCopyTitle(track){return [track?.composer,musicDisplayTitle(track)].filter(Boolean).join(' - ');}
