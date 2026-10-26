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
