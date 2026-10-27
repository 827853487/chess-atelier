const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const base=process.env.CHESS_TEST_URL||'http://127.0.0.1:18865/dist/';
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:800,height:1280},isMobile:true,hasTouch:true});
  await context.addInitScript(()=>{
   const original=HTMLMediaElement.prototype.captureStream;
   window.__captureCount=0;
   HTMLMediaElement.prototype.captureStream=function(){
    window.__captureCount++;const live=original.call(this),delayed=new MediaStream();
    setTimeout(()=>{for(const track of live.getAudioTracks()){delayed.addTrack(track);delayed.dispatchEvent(new MediaStreamTrackEvent('addtrack',{track}));}},2200);
    return delayed;
   };
   const NativeContext=window.AudioContext;window.__contexts=[];
   window.AudioContext=class extends NativeContext{constructor(...args){super(...args);window.__contexts.push(this);}};
  });
  await context.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.locator('#music-toggle').click();
  assert.equal(await page.locator('#music-title').innerText(),'即刻开始聆听');assert.equal(await page.locator('#music-artist').innerText(),'点击暂停键播放');
  await page.locator('[data-era=baroque]').click();
  await page.waitForFunction(()=>document.querySelector('#music-audio').currentTime>3);
  await page.evaluate(()=>{document.querySelector('#music-audio').currentTime=15;});
  const moving=async()=>{
   await page.waitForFunction(()=>[...document.querySelectorAll('.wave-bars i')].some(n=>Number(n.style.transform.match(/[\d.]+/)?.[0])>.3));
   const frames=await page.evaluate(()=>new Promise(resolve=>{const a=[];let n=0;function tick(){a.push([...document.querySelectorAll('.wave-bars i')].map(b=>b.style.transform).join());if(++n<60)requestAnimationFrame(tick);else resolve(a);}tick();}));
   assert.ok(new Set(frames).size>5,'visualizer must keep measuring real changing data');
  };
  await moving();assert.equal(await page.evaluate(()=>window.__captureCount),1,'late track must reuse the existing stream');
  await page.locator('#music-toggle').click();const time=await page.locator('#music-audio').evaluate(a=>a.currentTime);
  await page.evaluate(()=>Promise.all(window.__contexts.map(c=>c.suspend())));
  await page.locator('#music-toggle').click();await moving();assert.ok(await page.locator('#music-audio').evaluate((a,time)=>!a.paused&&a.currentTime>time,time));
  await page.locator('#music-next').click();await page.waitForFunction(()=>document.querySelector('#music-audio').currentTime>.2);await page.evaluate(()=>document.querySelector('#music-audio').currentTime=15);await moving();
  await page.locator('#music-play').click();await page.waitForTimeout(200);assert.equal(await page.locator('#music-audio').evaluate(a=>a.paused),true);
  assert.ok(await page.locator('.wave-bars i').evaluateAll(nodes=>nodes.every(n=>n.style.transform==='scaleY(0.12)')));
  assert.deepEqual(errors,[]);console.log('PASS: delayed capture track, reuse, reopened panel/context recovery, next track, pause and initial copy');await context.close();
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
