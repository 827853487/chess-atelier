const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context=vm.createContext({});vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../pcm-spectrum.js'),'utf8').replace(/^export /gm,''),context);
function recording({stereo=false}={}){
 const rate=8000,samples=new Float32Array(rate*3);
 for(let i=0;i<rate*2;i++)samples[i]=.1*Math.sin(2*Math.PI*(i<rate?125:2200)*i/rate);
 const right=Float32Array.from(samples,v=>-v);
 return {sampleRate:rate,length:samples.length,numberOfChannels:stereo?2:1,getChannelData:i=>i?right:samples};
}
test('decoded real frequencies follow playback position, including silence and seeking',()=>{
 const sample=context.createPcmSpectrum(recording()),bass=sample(.5),treble=sample(1.5),silence=sample(2.5);
 assert.equal(bass.indexOf(Math.max(...bass)),0);assert.equal(treble.indexOf(Math.max(...treble)),4);
 assert.ok(silence.every(n=>n===0));assert.deepEqual(Array.from(sample(.5)),Array.from(bass));
});
test('opposite-phase stereo cannot turn an audible recording into a silent spectrum',()=>{
 const bands=context.createPcmSpectrum(recording({stereo:true}))(.5);assert.ok(bands[0]>.1);assert.ok(bands.every(n=>Number.isFinite(n)&&n>=0&&n<=1));
});
