const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const assert=require('node:assert/strict');
const base=process.env.CHESS_TEST_URL||'http://127.0.0.1:18865/dist/';
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const context=await browser.newContext();await context.addInitScript(()=>Math.random=()=>0);
  await context.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.locator('#music-toggle').click();
  for(const width of [1440,800,390,320]){
   await page.setViewportSize({width,height:1000});await page.waitForTimeout(200);
   const bounds=await page.evaluate(()=>{
    const p=document.querySelector('#music-panel').getBoundingClientRect(),main=document.querySelector('.music-main-controls').getBoundingClientRect(),toggle=document.querySelector('#music-shuffle').getBoundingClientRect(),play=document.querySelector('#music-play').getBoundingClientRect();
    return {p:{x:p.x,w:p.width,right:p.right},main:{x:main.x,right:main.right,center:(main.left+main.right)/2},toggle:{x:toggle.x,right:toggle.right,w:toggle.width,h:toggle.height,centerY:(toggle.top+toggle.bottom)/2},playY:(play.top+play.bottom)/2};
   });
   assert.ok(Math.abs(bounds.main.center-(bounds.p.x+bounds.p.w/2))<2);assert.ok(bounds.toggle.x>=bounds.main.right+2&&bounds.toggle.right<bounds.p.right);assert.ok(Math.abs(bounds.toggle.centerY-bounds.playY)<1);
   await page.locator('#music-shuffle').click();const after=await page.locator('#music-shuffle').boundingBox();assert.equal(after.width,bounds.toggle.w);assert.equal(after.height,bounds.toggle.h);await page.locator('#music-shuffle').click();
  }
  await page.setViewportSize({width:800,height:1000});
  const title=()=>page.locator('#music-title').innerText();
  const playing=()=>page.waitForFunction(()=>!document.querySelector('#music-audio').paused&&document.querySelector('#music-audio').currentTime>.08);
  const next=async button=>{await page.locator(button).click();await playing();return title();};
  assert.equal(await page.locator('#music-shuffle').getAttribute('aria-pressed'),'false');await page.locator('#music-shuffle').click();
  await page.locator('[data-era=baroque]').click();await playing();const a=await title(),b=await next('#music-next'),c=await next('#music-next');assert.notEqual(a,b);assert.notEqual(b,c);
  await page.locator('#music-play').click();await page.locator('#music-play').click();await playing();
  const before=await page.locator('#music-audio').evaluate(a=>a.currentTime);await page.locator('#music-shuffle').click();assert.equal(await title(),c);assert.ok(await page.locator('#music-audio').evaluate((a,t)=>!a.paused&&a.currentTime>=t,before));
  assert.equal(await next('#music-prev'),b);assert.equal(await next('#music-prev'),a);assert.equal(await next('#music-next'),b);assert.equal(await next('#music-next'),c);
  const d=await next('#music-next');assert.notEqual(d,c);await page.locator('#music-shuffle').click();assert.equal(await page.locator('#music-shuffle').getAttribute('aria-pressed'),'true');
  const random=await next('#music-prev');assert.notEqual(random,c,'random previous draws afresh instead of walking back');await page.locator('#music-shuffle').click();
  assert.equal(await next('#music-prev'),d);assert.equal(await next('#music-prev'),c);assert.equal(await next('#music-next'),d);assert.equal(await next('#music-next'),random);
  const old=await title();await page.locator('[data-era=romantic]').click();await playing();assert.notEqual(await title(),old);assert.equal(await next('#music-prev'),old,'period changes retain the listening timeline');
  await page.evaluate(()=>{const a=document.querySelector('#music-audio'),play=a.play.bind(a);a.play=()=>{a.play=play;return Promise.reject(new DOMException('blocked','NotAllowedError'));};});
  await page.locator('[data-era=classical]').click();await page.waitForFunction(()=>document.querySelector('#music-audio').paused);
  assert.equal(await next('#music-prev'),old,'a blocked start is not inserted into the listening history');
  await page.locator('#music-panel').screenshot({path:'test-results/music-history-toggle.png'});
  assert.deepEqual(errors,[]);console.log('PASS: right-side fixed-size shuffle switch, centered transport at 1440/800/390/320, random-to-history navigation, end extension and cross-period recall');await context.close();
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
