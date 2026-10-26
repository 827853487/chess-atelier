const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),output=path.join(root,'test-results'),catalog=JSON.parse(fs.readFileSync(path.join(root,'assets/music/playlist.json'),'utf8'));
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true}),context=await browser.newContext({viewport:{width:1440,height:1000},permissions:['clipboard-read','clipboard-write']}),page=await context.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 const base=process.env.CHESS_TEST_URL||'http://127.0.0.1:18765';
 await context.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
 try{
  await page.goto(base);await page.waitForFunction(()=>document.querySelector('#collection').getAttribute('aria-busy')==='false');await page.locator('#analysis-toggle').click();
  await page.evaluate(()=>{const original=Element.prototype.animate;window.logoTurns=[];Element.prototype.animate=function(...args){const animation=original.apply(this,args);if(this.classList.contains('brand-flip'))window.logoTurns.push(animation);return animation;};document.querySelector('#home').click();});
  await page.waitForTimeout(250);const same=await page.evaluate(()=>{const first=window.logoTurns[0],time=first.currentTime;for(let i=0;i<20;i++)document.querySelector('#home').click();return window.logoTurns.length===1&&first.currentTime>=time;});assert.equal(same,true,'rapid clicks never rewind the running rotation');
  await page.waitForTimeout(2300);assert.equal(await page.evaluate(()=>window.logoTurns.length),2,'a burst coalesces to exactly one additional turn');
  await page.locator('#home').click();await page.waitForTimeout(1200);assert.equal(await page.evaluate(()=>window.logoTurns.length),3);
  await page.locator('#settings-toggle').click();assert.deepEqual((await page.locator('#settings-dialog .settings-links a').allTextContents()).map(text=>text.replace('↗','')),['Lichess','Stockfish','Wikimedia Commons']);assert.equal(await page.locator('.settings-links .source-external').count(),3);
  assert.ok((await page.locator('#settings-dialog').boundingBox()).width<=400);assert.ok((await page.locator('#settings-dialog .atelier-select').first().boundingBox()).width<=133);await page.locator('#settings-close').click();
  const card=await page.locator('#study-workspace').boundingBox(),list=await page.locator('#collection').boundingBox();assert.ok(list.x>card.x+8&&list.x+list.width<card.x+card.width-8&&list.y+list.height<card.y+card.height-6,'scroll surface stays inside rounded card border');
  await page.locator('#music-toggle').click();
  assert.equal(await page.locator('#music-online,#music-list,#music-status,#music-source').count(),0);
  for(const era of ['baroque','classical','romantic','modern','all']){
   await page.locator(`[data-era=${era}]`).click();await page.waitForFunction(()=>{const audio=document.querySelector('#music-audio');return !audio.paused&&audio.currentTime>.1;},null,{timeout:25000});
   const label=await page.locator('#music-title').innerText();assert.ok(catalog.some(track=>track.title.replace(new RegExp('^'+track.composer+'[ ·:：–—-]+'),'')===label&&(era==='all'||track.era===era)));
   await page.waitForFunction(()=>Number(document.querySelector('#music-panel').dataset.buffered)>=3,null,{timeout:30000});
  }
  await page.waitForFunction(()=>document.querySelector('#music-audio').currentTime>1);
  const spectrum=await page.evaluate(()=>new Promise(resolve=>{const frames=[];let n=0;function sample(){frames.push([...document.querySelectorAll('.wave-bars i')].map(node=>node.style.transform).join('|'));if(++n<75)requestAnimationFrame(sample);else resolve(frames);}requestAnimationFrame(sample);}));
  assert.ok(new Set(spectrum).size>5,'spectrum follows actual changing audio frequency data');assert.ok(await page.locator('.wave-bars i').evaluateAll(nodes=>nodes.every(node=>getComputedStyle(node).animationName==='none')));
  await page.locator('#music-title').click();await page.locator('#music-copy-toast').waitFor({state:'visible'});assert.equal(await page.locator('#music-copy-toast').innerText(),'已复制');const copied=await page.evaluate(()=>navigator.clipboard.readText());assert.ok(catalog.some(track=>copied===track.composer+' - '+track.title.replace(new RegExp('^'+track.composer+'[ ·:：–—-]+'),'')));assert.equal(await page.evaluate(()=>getSelection().toString()),'');
  await page.locator('[data-era=baroque]').click();const a=await page.locator('#music-title').innerText();await page.locator('#music-next').click();const b=await page.locator('#music-title').innerText();await page.locator('#music-prev').click();const c=await page.locator('#music-title').innerText();assert.notEqual(a,b);assert.notEqual(c,a);assert.notEqual(c,b);
  await page.locator('#music-shuffle').click();const current=await page.locator('#music-title').innerText();await page.locator('#music-next').click();await page.locator('#music-prev').click();assert.equal(await page.locator('#music-title').innerText(),current,'sequential previous restores the prior playlist track');
  await page.locator('#music-panel').screenshot({path:path.join(output,'local-classical-player.png')});await page.locator('#music-toggle').click();
  await page.setViewportSize({width:390,height:844});await page.locator('#settings-toggle').click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.locator('#settings-dialog').screenshot({path:path.join(output,'compact-settings-mobile.png')});
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'media-ui-result.json'),JSON.stringify({passed:true,localTracks:catalog.length,realFft:true,erasAutoPlay:true,threeBuffers:true,shufflePreviousFresh:true,sequentialPrevious:true,queuedLogoTurns:true,insetCardBorders:true,compactSettings:true,pageErrors:errors},null,2));
  console.log('PASS: real local MP3 playback for all eras, three buffers, ordering, queued logo rotations, card borders and compact settings');
 }catch(error){await page.screenshot({path:path.join(output,'media-ui-failure.png'),fullPage:true});throw error;}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
