const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const context=vm.createContext({});vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../music-order.js'),'utf8').replace(/^export /gm,'')+';globalThis.pick=selectMusicTrack',context);
const pool=['a','b','c','d'].map(id=>({id}));
test('shuffle previous selects a fresh track instead of rewinding the just-heard one',()=>{for(let i=0;i<20;i++){const chosen=context.pick(pool,{currentId:'b',recent:['a','b'],shuffle:true,direction:-1});assert.ok(['c','d'].includes(chosen.id));}});
test('sequential playback supports previous/next and wraps the real playlist',()=>{assert.equal(context.pick(pool,{currentId:'b',shuffle:false,direction:-1}).id,'a');assert.equal(context.pick(pool,{currentId:'d',shuffle:false}).id,'a');assert.equal(context.pick(pool,{shuffle:false}).id,'a');});
test('empty and single-track libraries remain well-defined',()=>{assert.equal(context.pick([]),null);assert.equal(context.pick([pool[0]],{currentId:'a'}).id,'a');});
test('visible music titles omit composer but clipboard titles retain complete attribution',()=>{
 const display=vm.runInContext('musicDisplayTitle',context),copy=vm.runInContext('musicCopyTitle',context);
 assert.equal(display({composer:'巴赫',title:'巴赫 · 三部创意曲'}),'三部创意曲');
 assert.equal(copy({composer:'巴赫',title:'巴赫 · 三部创意曲'}),'巴赫 - 三部创意曲');
 assert.equal(display({composer:'巴赫',title:'Johann Sebastian Bach: Goldberg Variations'}),'Goldberg Variations');
 assert.equal(display({composer:'维拉罗伯斯',title:'Bachianas Brasileiras'}),'Bachianas Brasileiras');
});

test('performer credits omit old placeholders and duplicate composer names',()=>{
 const performer=vm.runInContext('musicPerformer',context);
 for(const name of ['演奏者见来源页','演奏者见详情页','详见来源页面','Unknown',''])assert.equal(performer({composer:'巴赫',performer:name}),'');
 assert.equal(performer({composer:'巴赫',performer:'Johann Sebastian Bach'}),'');
 assert.equal(performer({composer:'巴赫',performer:'Johann Sebastian Bach (1685–1750)；Randolph Hokanson'}),'Randolph Hokanson');
 assert.equal(performer({composer:'巴赫',performer:'Johann Sebastian Bach (composer); John Harrison'}),'John Harrison');
 assert.equal(performer({composer:'巴赫',performer:'John Harrison；Wichita State University Chamber Players'}),'John Harrison；Wichita State University Chamber Players');
});

test('Commons performer fields precede generic artist fields without losing valid credits',()=>{
 const sandbox=vm.createContext({URL});
 for(const file of ['music-order.js','online-music.js'])vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../'+file),'utf8').replace(/^import .*;\s*$/gm,'').replace(/^export /gm,''),sandbox);
 const track=vm.runInContext('onlineTrack',sandbox),page={ns:6,title:'File:Bach fixture.mp3',imageinfo:[{url:'https://upload.wikimedia.org/wikipedia/commons/a/a1/Bach_fixture.mp3',size:500000,mime:'audio/mpeg',mediatype:'AUDIO',metadata:[{name:'artist',value:'Johann Sebastian Bach'}],extmetadata:{Artist:{value:'Randolph Hokanson'},LicenseShortName:{value:'Public domain'}}}]};
 assert.equal(track(page,'baroque',['Johann Sebastian Bach','巴赫',/Bach/]).performer,'Randolph Hokanson');
 page.imageinfo[0].extmetadata.Performer={value:'John Harrison'};assert.equal(track(page,'baroque',['Johann Sebastian Bach','巴赫',/Bach/]).performer,'John Harrison');
 delete page.imageinfo[0].extmetadata.Performer;page.imageinfo[0].extmetadata.Artist={value:'Johann Sebastian Bach'};assert.equal(track(page,'baroque',['Johann Sebastian Bach','巴赫',/Bach/]).performer,'');
});


test('credit prefixes and player placeholders are removed without damaging names',()=>{
 const performer=vm.runInContext('musicPerformer',context);
 for(const text of ['player','by','player by','Performed by','Artist: Unknown'])assert.equal(performer({performer:text}),'');
 assert.equal(performer({performer:'player by John Harrison'}),'John Harrison');
 assert.equal(performer({performer:'Performed by Randolph Hokanson'}),'Randolph Hokanson');
 assert.equal(performer({performer:'by Byron Janis'}),'Byron Janis');
 assert.equal(performer({performer:'John Player'}),'John Player');
});

test('composer monograms use known surname initials with safe local fallback',()=>{
 const initial=vm.runInContext('musicComposerInitial',context);
 assert.equal(initial({composer:'巴赫'}),'B');assert.equal(initial({composer:'莫扎特'}),'M');assert.equal(initial({composer:'肖邦'}),'C');assert.equal(initial({composer:'Ludwig van Beethoven'}),'B');assert.equal(initial({composer:'Chopin, Frédéric'}),'C');assert.equal(initial({composer:'未知作曲家'}),'M');assert.equal(initial({}),'M');
 assert.equal(initial({composer:'格里格'}),'G');assert.equal(initial({composer:'巴拉基列夫'}),'B');assert.equal(initial({composer:'格鲁克'}),'G');assert.equal(initial({composer:'Antonín Dvořák'}),'D');assert.equal(initial({composer:'未知',composerEnglish:'Jean Sibelius'}),'S');
});
test('sequential history retraces the actual random order without losing the forward path',()=>{
 const remember=vm.runInContext('recordMusicVisit',context),step=vm.runInContext('musicHistoryStep',context);let timeline={entries:[],cursor:-1};
 for(const id of ['c','a','d'])timeline=remember(timeline,{id,title:id});
 let target=step(timeline,-1);assert.equal(target.track.id,'a');timeline=remember(timeline,target.track,target.index);
 target=step(timeline,-1);assert.equal(target.track.id,'c');timeline=remember(timeline,target.track,target.index);
 assert.equal(step(timeline,-1),null);assert.equal(step(timeline,1).track.id,'a');assert.equal(timeline.entries.length,3);
 timeline=remember(timeline,{id:'new-random'});assert.deepEqual(Array.from(timeline.entries,t=>t.id),['c','a','d','new-random']);assert.equal(step(timeline,-1).track.id,'d');
});
test('history skips failed recordings and bounds storage while retaining recording metadata',()=>{
 const remember=vm.runInContext('recordMusicVisit',context),step=vm.runInContext('musicHistoryStep',context);let timeline={entries:[],cursor:-1};
 for(const id of ['a','b','c','d'])timeline=remember(timeline,{id,remoteUrl:'https://audio.test/'+id},null,3);
 assert.deepEqual(Array.from(timeline.entries,t=>t.id),['b','c','d']);assert.equal(timeline.cursor,2);
 const found=step(timeline,-1,new Set(['c']));assert.equal(found.track.id,'b');assert.equal(found.track.remoteUrl,'https://audio.test/b');assert.equal(timeline.entries.length,3);
});
test('every bundled composer produces a Latin monogram',()=>{
 const initial=vm.runInContext('musicComposerInitial',context),c=vm.createContext({});vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../music-library.js'),'utf8').replace(/^export /gm,'')+';globalThis.seed=MUSIC_SEED',c);
 const locals=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../assets/music/playlist.json'),'utf8'));
 for(const track of [...locals,...c.seed.map(row=>({composer:row[2]}))])assert.match(initial(track),/^[A-Z]$/);
});
