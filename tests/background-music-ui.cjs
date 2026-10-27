// Browser lifecycle / media control contract. This does not emulate an actual
// iOS lock screen or guarantee that a mobile OS will retain a browser process.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const base=process.env.CHESS_TEST_URL||'http://127.0.0.1:18865/dist/';
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  for(const nativeOnly of [false,true]){
   const context=await browser.newContext({viewport:nativeOnly?{width:390,height:844}:{width:1440,height:1000},isMobile:nativeOnly,hasTouch:nativeOnly});
   await context.addInitScript(({nativeOnly})=>{
    window.__actions={};window.__session={setActionHandler:(name,fn)=>window.__actions[name]=fn,setPositionState:value=>window.__position=value};
    Object.defineProperty(navigator,'mediaSession',{value:window.__session});Object.defineProperty(navigator,'audioSession',{value:{type:'auto'}});
    if(nativeOnly){Object.defineProperty(HTMLMediaElement.prototype,'captureStream',{value:undefined});Object.defineProperty(HTMLMediaElement.prototype,'mozCaptureStream',{value:undefined});}
    const Context=window.AudioContext;window.__routedAudio=0;
    if(Context){const original=Context.prototype.createMediaElementSource;Context.prototype.createMediaElementSource=function(...args){window.__routedAudio++;return original.apply(this,args);};}
    let hidden=false;Object.defineProperty(document,'hidden',{get:()=>hidden,configurable:true});
    window.__hide=()=>{hidden=true;document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));};
    window.__show=()=>{hidden=false;document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));};
   },{nativeOnly});
   await context.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
   const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
   await page.goto(base);await page.locator('#music-toggle').click();await page.locator('[data-era=baroque]').click();
   await page.waitForFunction(()=>!document.querySelector('#music-audio').paused&&document.querySelector('#music-audio').currentTime>.2);
   const first=await page.locator('#music-title').innerText();
   assert.equal(await page.evaluate(()=>navigator.audioSession.type),'playback');assert.equal(await page.evaluate(()=>window.__session.metadata.title),first);
   assert.equal(await page.evaluate(()=>window.__routedAudio),0,'native audio must bypass the spectrum rendering graph');
   const before=await page.evaluate(()=>{window.__hide();return document.querySelector('#music-audio').currentTime;});
   await page.waitForTimeout(1000);assert.ok(await page.evaluate(t=>{const a=document.querySelector('#music-audio');return !a.paused&&a.currentTime>t+.4;},before));
   await page.evaluate(()=>window.__actions.pause());assert.equal(await page.locator('#music-audio').evaluate(a=>a.paused),true);
   await page.evaluate(()=>window.__show());await page.waitForTimeout(150);assert.equal(await page.locator('#music-audio').evaluate(a=>a.paused),true,'returning must respect an explicit pause');
   await page.evaluate(()=>window.__actions.play());await page.waitForFunction(()=>!document.querySelector('#music-audio').paused);
   await page.evaluate(()=>{window.__hide();window.__actions.nexttrack();});
   await page.waitForFunction(title=>document.querySelector('#music-title').textContent!==title&&!document.querySelector('#music-audio').paused,first);
   await page.waitForFunction(()=>Number.isFinite(document.querySelector('#music-audio').duration));
   await page.evaluate(()=>{const a=document.querySelector('#music-audio');a.currentTime=20;window.__actions.seekforward({seekOffset:10});});
   assert.ok(await page.locator('#music-audio').evaluate(a=>a.currentTime>=30));
   const second=await page.locator('#music-title').innerText();
   await page.evaluate(()=>document.querySelector('#music-audio').dispatchEvent(new Event('ended')));
   await page.waitForFunction(title=>document.querySelector('#music-title').textContent!==title&&!document.querySelector('#music-audio').paused,second);
   await page.evaluate(()=>window.__show());
   if(!nativeOnly){
    await page.waitForFunction(()=>Number.isFinite(document.querySelector('#music-audio').duration));
    await page.evaluate(()=>{document.querySelector('#music-audio').currentTime=15;});
    await page.waitForFunction(()=>[...document.querySelectorAll('.wave-bars i')].some(n=>Number(n.style.transform.match(/[\d.]+/)?.[0])>.3));
    const frames=await page.evaluate(()=>new Promise(resolve=>{const values=[];let count=0;const sample=()=>{values.push([...document.querySelectorAll('.wave-bars i')].map(n=>n.style.transform).join());if(++count<65)requestAnimationFrame(sample);else resolve(values);};sample();}));
    assert.ok(new Set(frames).size>5,'passive spectrum must retain actual changing frequencies after a track change');
   }
   assert.deepEqual(errors,[]);await context.close();console.log('PASS: '+(nativeOnly?'mobile native audio fallback':'desktop passive spectrum')+', lifecycle continuity, system metadata/actions, no forced resume, background next/ended');
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
