const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 const base=process.env.CHESS_TEST_URL||'http://127.0.0.1:18765';
 try{
  await page.goto(base);await page.waitForFunction(()=>document.querySelector('#collection').getAttribute('aria-busy')==='false');
  for(const size of [{width:1440,height:1000},{width:390,height:844},{width:390,height:420},{width:390,height:300}]){
   await page.setViewportSize(size);await page.locator('#settings-toggle').click();await page.waitForTimeout(240);
   assert.equal(await page.locator('#settings-dialog').evaluate(node=>getComputedStyle(node).animationName),'settings-enter');
   const trigger=page.locator('#atelier-move-hints .atelier-select-trigger');await trigger.scrollIntoViewIfNeeded();
   const before=await page.locator('#settings-dialog').boundingBox();await trigger.click();await page.waitForTimeout(210);
   const after=await page.locator('#settings-dialog').boundingBox(),menu=await page.locator('#atelier-list-move-hints').boundingBox();
   for(const key of ['x','y','width','height'])assert.ok(Math.abs(before[key]-after[key])<.6,'menu must not move or resize its dialog');
   assert.ok(menu.x>=after.x&&menu.x+menu.width<=after.x+after.width&&menu.y>=after.y&&menu.y+menu.height<=after.y+after.height,'menu stays inside the visible dialog');
   assert.equal(await page.locator('#settings-dialog .settings-body').evaluate(node=>node.scrollWidth<=node.clientWidth),true,'no horizontal scrollbar');
   if(size.height===420)await page.locator('#settings-dialog').screenshot({path:path.resolve(__dirname,'../test-results/settings-menu-mobile.png')});
   await page.locator('#atelier-list-move-hints [data-value=off]').click();assert.equal(await page.locator('#move-hints').inputValue(),'off');
   await page.locator('#settings-close').click();assert.equal(await page.locator('#settings-dialog .is-open').count(),0);
  }
  await page.setViewportSize({width:1440,height:1000});await page.locator('#analysis-toggle').click();
  const first=await page.locator('#chess-note').innerText();await page.locator('[data-square=e2]').click();await page.locator('[data-square=e4]').click();assert.equal(await page.locator('#movelist [data-ply]').count(),0);assert.equal(await page.locator('#chess-note').innerText(),first);
  await page.locator('#reset').click();await page.waitForFunction(()=>!document.querySelector('#board.is-opening'));assert.notEqual(await page.locator('#chess-note').innerText(),first);
  assert.deepEqual(errors,[]);fs.writeFileSync(path.resolve(__dirname,'../test-results/settings-layout-result.json'),JSON.stringify({passed:true,viewports:4,stableMenu:true,openingAnimation:true,noHorizontalScroll:true,notesOnlyOnReset:true,pageErrors:errors},null,2));
  console.log('PASS: animated settings, stable/drop-up hint menu at four sizes, no overflow and notes refresh only on board reset');
 }catch(error){await page.screenshot({path:path.resolve(__dirname,'../test-results/settings-layout-failure.png'),fullPage:true});throw error;}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
