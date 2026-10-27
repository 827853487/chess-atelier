const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function fixture({supported=true,partial=false}={}){
 const actions={},positions=[],events={},calls=[];
 const audio={paused:true,duration:120,currentTime:30,playbackRate:1,addEventListener:(name,fn)=>(events[name]??=[]).push(fn)};
 const session={setActionHandler:(name,fn)=>{if(partial&&name==='seekto')throw Error('unsupported');actions[name]=fn;},setPositionState:value=>positions.push(value)};
 const navigator={audioSession:{type:'auto'},...(supported?{mediaSession:session}:{})};
 const context=vm.createContext({navigator,MediaMetadata:class{constructor(data){Object.assign(this,data);}}});
 for(const name of ['music-order.js','music-session.js'])vm.runInContext(fs.readFileSync(path.resolve(__dirname,'..',name),'utf8').replace(/^import .*;\s*$/gm,'').replace(/^export /gm,''),context);
 const track={composer:'巴赫',title:'Bach - Prelude',performer:'played by Musician'};
 const api=context.setupMusicSession({audio,getTrack:()=>track,play:()=>{calls.push('play');audio.paused=false;},pause:()=>{calls.push('pause');audio.paused=true;},previous:()=>calls.push('previous'),next:()=>calls.push('next')});
 return {api,audio,session,navigator,actions,positions,events,calls,track};
}
test('lock-screen metadata uses cleaned song/artist and follows real playback state',()=>{
 const f=fixture();assert.equal(f.session.metadata.title,'Prelude');assert.equal(f.session.metadata.artist,'巴赫 · Musician');assert.equal(f.session.playbackState,'paused');
 f.audio.paused=false;f.api.sync();assert.equal(f.session.playbackState,'playing');
 f.track.title='Bach - Fugue';f.api.sync();assert.equal(f.session.metadata.title,'Fugue');
 assert.equal(f.navigator.audioSession.type,'auto','setup must not steal audio focus');f.api.activate();assert.equal(f.navigator.audioSession.type,'playback');
});
test('system transport actions use the same player and clamp seeking',()=>{
 const f=fixture();for(const action of ['play','pause','previoustrack','nexttrack'])f.actions[action]();
 assert.deepEqual(f.calls,['play','pause','previous','next']);
 f.actions.seekto({seekTime:999});assert.equal(f.audio.currentTime,120);
 f.actions.seekbackward({seekOffset:200});assert.equal(f.audio.currentTime,0);
 f.actions.seekforward({seekOffset:12});assert.equal(f.audio.currentTime,12);
 f.actions.stop();assert.equal(f.audio.currentTime,0);assert.equal(f.audio.paused,true);
});
test('invalid/unknown media durations cannot publish invalid seek positions',()=>{
 const f=fixture();f.audio.currentTime=200;f.api.sync();assert.equal(f.positions.at(-1).position,120);
 f.audio.duration=NaN;f.api.sync();assert.equal(f.positions.at(-1),undefined);f.actions.seekto({seekTime:50});assert.equal(f.audio.currentTime,200);
});
test('missing or partially implemented media APIs never disable the player',()=>{
 const f=fixture({supported:false});assert.doesNotThrow(()=>{f.api.activate();f.api.sync();});
 const p=fixture({partial:true});assert.equal(p.actions.seekto,undefined);assert.equal(typeof p.actions.nexttrack,'function');
});
