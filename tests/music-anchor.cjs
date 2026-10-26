const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage(),errors=[],checks=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(process.env.CHESS_TEST_URL||'http://127.0.0.1:18765');await page.waitForFunction(()=>!!globalThis.ChessSurfaces);
  await page.locator('#music-toggle').click();await page.waitForTimeout(240);
  for(const viewport of [{width:2560,height:1100},{width:1920,height:1000},{width:1440,height:1000},{width:820,height:900},{width:390,height:844},{width:320,height:700},{width:1200,height:320}]){
   await page.setViewportSize(viewport);await page.waitForTimeout(230);
   const m=await page.evaluate(()=>{const panel=document.querySelector('#music-panel'),p=panel.getBoundingClientRect(),b=document.querySelector('#music-toggle').getBoundingClientRect(),width=document.documentElement.clientWidth,expectedWidth=Math.min(414,width-24),center=(b.left+b.right)/2;return {left:p.left,right:p.right,top:p.top,bottom:p.bottom,width:p.width,expectedWidth,expectedLeft:Math.max(12,Math.min(center-expectedWidth/2,width-12-expectedWidth)),centerGap:Math.abs((p.left+p.right)/2-center),buttonBottom:b.bottom,viewport:width,height:innerHeight,overflow:getComputedStyle(panel).overflowY,mainCenter:(document.querySelector('.music-main-controls').getBoundingClientRect().left+document.querySelector('.music-main-controls').getBoundingClientRect().right)/2,panelCenter:(p.left+p.right)/2};});
   assert.ok(Math.abs(m.left-m.expectedLeft)<1&&Math.abs(m.width-m.expectedWidth)<1,JSON.stringify(m));assert.ok(m.left>=11&&m.right<=m.viewport-11&&m.top>=m.buttonBottom+8&&m.bottom<=m.height-10,JSON.stringify(m));assert.ok(Math.abs(m.mainCenter-m.panelCenter)<1,'transport buttons remain centered inside the anchored panel');
   if(viewport.width>=1920)assert.ok(m.centerGap<1,'wide screens align the popup center to the music button');
   assert.equal(m.overflow,'auto');checks.push({...viewport,...m});
   if([2560,390].includes(viewport.width))await page.screenshot({path:path.resolve(__dirname,`../test-results/music-anchor-${viewport.width}.png`)});
  }
  await page.locator('#music-toggle').click();await page.waitForTimeout(190);await page.setViewportSize({width:2560,height:1100});await page.locator('#music-toggle').click();await page.waitForTimeout(230);assert.equal(await page.locator('#music-panel').isVisible(),true);assert.deepEqual(errors,[]);
  fs.writeFileSync(path.resolve(__dirname,'../test-results/music-anchor.json'),JSON.stringify({passed:true,checks},null,2));console.log('PASS: music popup centers under its button, viewport clamping, responsive resize/reopen, short-screen scrolling and centered transport');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
