const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const assert=require('node:assert/strict');
const base=process.env.CHESS_TEST_URL||'http://127.0.0.1:18865/dist/';
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:800,height:1100},isMobile:true,hasTouch:true});
  await context.addInitScript(()=>{
   Math.random=()=>0;const later=window.setTimeout;window.setTimeout=(fn,ms,...args)=>later(fn,ms===2500?100000:ms,...args);
   window.__lead=0;window.__modeAnimations=[];const animate=Element.prototype.animate;
   Element.prototype.animate=function(frames,options){if(this.tagName.toLowerCase()==='svg'&&this.closest('#music-shuffle'))window.__modeAnimations.push({frames,duration:options.duration});return animate.call(this,frames,options);};
  });
  const fetches=[],media=[],inFlight=new Set();let maxInFlight=0;
  context.on('request',request=>{if(request.resourceType()==='fetch'&&request.url().includes('/assets/music/')&&!request.url().includes('.json')){fetches.push(request.url());inFlight.add(request);maxInFlight=Math.max(maxInFlight,inFlight.size);}if(request.resourceType()==='media')media.push(request.url());});
  context.on('requestfinished',r=>inFlight.delete(r));context.on('requestfailed',r=>inFlight.delete(r));
  await context.route('**/*',async route=>{
   const request=route.request(),url=request.url();if(!url.startsWith(base))return route.abort();
   if(request.resourceType()==='fetch'&&url.includes('/assets/music/')&&!url.includes('.json')){
    await new Promise(resolve=>setTimeout(resolve,1200));
    try{return await route.continue();}catch{return;}
   }
   return route.continue();
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base);
  assert.equal(await page.locator('#music-shuffle').getAttribute('aria-pressed'),'false');assert.equal(await page.locator('#music-shuffle').getAttribute('data-mode'),'sequence');assert.equal(await page.locator('#music-shuffle svg path').count(),4);
  await page.evaluate(()=>{
   const audio=document.querySelector('#music-audio');Object.defineProperty(audio,'buffered',{configurable:true,get:()=>({length:window.__lead>0?1:0,start:()=>0,end:()=>audio.currentTime+window.__lead})});
   document.querySelector('#music-toggle').addEventListener('pointerdown',()=>document.querySelector('[data-era=baroque]').click(),{once:true});
  });
  await page.locator('#music-toggle').click();await page.waitForFunction(()=>!document.querySelector('#music-audio').paused&&document.querySelector('#music-audio').currentTime>.2);
  assert.equal(fetches.length,0,'do not fetch future songs while the current buffer has no headroom');assert.equal(await page.locator('#music-panel').getAttribute('data-preload-count'),'1');
  await page.evaluate(()=>{window.__lead=4;document.querySelector('#music-audio').dispatchEvent(new Event('progress'));});
  await page.waitForFunction(()=>document.querySelector('#music-panel').dataset.nextBuffered==='false');await page.waitForTimeout(150);assert.equal(fetches.length,1);
  const target=fetches[0];await page.locator('#music-toggle').click();await page.locator('#music-toggle').click();assert.equal(fetches.length,1,'reopening does not reroll or restart the candidate');
  await page.evaluate(()=>{window.__lead=0;document.querySelector('#music-audio').dispatchEvent(new Event('waiting'));});await page.waitForTimeout(200);assert.equal(fetches.length,1,'low headroom retains the existing download instead of discarding it');
  await page.evaluate(()=>{window.__lead=200;document.querySelector('#music-audio').dispatchEvent(new Event('progress'));});
  await page.waitForFunction(()=>document.querySelector('#music-panel').dataset.nextBuffered==='true');assert.equal(fetches.length,1);assert.equal(fetches[0],target);assert.equal(maxInFlight,1);
  await page.locator('#music-next').click();await page.waitForFunction(()=>document.querySelector('#music-audio').currentTime>.1);
  assert.ok(await page.locator('#music-audio').evaluate(a=>a.src.startsWith('blob:')),'the next song plays from its completed local buffer');assert.equal(media.filter(url=>url===target).length,0,'no second media download for the prepared song');
  const align=await page.evaluate(()=>{const a=document.querySelector('.wave-bars').getBoundingClientRect(),b=document.querySelector('#music-shuffle').getBoundingClientRect();return Math.abs((a.left+a.right-b.left-b.right)/2);});assert.ok(align<1,'spectrum and mode icon share the same vertical centerline');assert.ok(await page.locator('.wave-bars i').evaluateAll(nodes=>nodes.every(n=>getComputedStyle(n).width==='2px'&&getComputedStyle(n).height==='18px')));
  const button=page.locator('#music-shuffle'),before=await button.boundingBox();await button.click();await page.waitForFunction(()=>document.querySelector('#music-shuffle').dataset.mode==='random');
  assert.equal(await button.locator('svg path').count(),5);await page.waitForTimeout(400);
  assert.deepEqual(await page.evaluate(()=>window.__modeAnimations.slice(0,2).map(a=>a.duration)),[80,110]);
  assert.equal(await button.evaluate(b=>getComputedStyle(b).backgroundColor),'rgba(0, 0, 0, 0)');assert.equal(await button.evaluate(b=>getComputedStyle(b).backgroundImage),'none');
  const after=await button.boundingBox();assert.equal(before.width,after.width);assert.equal(before.height,after.height);
  await button.evaluate(b=>{b.click();b.click();b.click();});await page.waitForTimeout(600);assert.equal(await button.getAttribute('data-mode'),'sequence');assert.equal(await button.locator('svg').count(),1);
  await page.emulateMedia({reducedMotion:'reduce'});await button.click();assert.equal(await button.getAttribute('data-mode'),'random');
  assert.deepEqual(errors,[]);await page.waitForTimeout(500);await page.locator('#music-panel').screenshot({path:'test-results/music-buffer-mode.png'});console.log('PASS: current-first headroom, one stable next request, retained download on low headroom, complete Blob playback, conventional icons, transient tray and fade/reduced-motion transitions');await context.close();
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
