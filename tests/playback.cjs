const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const output=path.resolve(__dirname,'../test-results');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
 let calls=0,releaseOld,notifyThird;const thirdStarted=new Promise(resolve=>notifyThird=resolve);
 try{
  await page.route('**/api/play',async route=>{
   const call=++calls;
   if(call===3){notifyThird();await new Promise(resolve=>releaseOld=resolve);}
   try{await route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,uci:call===1?'e7e5':call===2?'b8c6':'a7a6'})});}catch{}
  });
  await page.goto(process.env.CHESS_TEST_URL||'http://127.0.0.1:18765');
  await page.locator('#analysis-toggle').click();await page.locator('[data-play-mode="book"]').click();
  assert.equal(await page.locator('#autoplay').isVisible(),true);
  await page.locator('#autoplay').click();assert.match(await page.locator('#toast').innerText(),/还没有/);assert.equal(calls,0);
  const move=async(from,to,plies)=>{await page.locator(`#board [data-square="${from}"]`).click();await page.locator(`#board [data-square="${to}"]`).click();await page.waitForFunction(n=>document.querySelectorAll('#movelist [data-ply]').length===n,plies);};
  await move('e2','e4',2);await move('g1','f3',4);
  const original=await page.locator('#movelist').innerText();
  await page.locator('#movelist [data-ply="2"]').click();await page.locator('#autoplay').click();
  assert.equal(await page.locator('#autoplay').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('#ply').innerText(),'2 / 4');
  await page.locator('.transport').screenshot({path:path.join(output,'duel-playback-button.png')});
  await page.waitForFunction(()=>document.querySelector('#autoplay').getAttribute('aria-pressed')==='false');
  assert.equal(await page.locator('#ply').innerText(),'4 / 4');assert.equal(await page.locator('#movelist').innerText(),original);assert.equal(calls,2);
  await page.locator('#first').click();await page.locator('#autoplay').click();
  await page.waitForFunction(()=>document.querySelector('#ply').textContent==='1 / 4');await page.locator('#autoplay').click();
  const paused=await page.locator('#ply').innerText();await page.waitForTimeout(1000);assert.equal(await page.locator('#ply').innerText(),paused);
  await page.locator('#autoplay').click();await page.waitForFunction(()=>document.querySelector('#autoplay').getAttribute('aria-pressed')==='false');assert.equal(await page.locator('#ply').innerText(),'4 / 4');
  // The pending old reply must not land during review or after a newer reply.
  await page.locator('#board [data-square=f1]').click();await page.locator('#board [data-square=b5]').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('思考'));
  await thirdStarted;assert.equal(calls,3);await page.locator('#autoplay').click();assert.equal(await page.locator('#ply').innerText(),'0 / 5');
  await page.waitForTimeout(1800);assert.equal(await page.locator('#movelist [data-ply]').count(),5);assert.equal(calls,3);
  await page.waitForFunction(()=>document.querySelectorAll('#movelist [data-ply]').length===6,null,{timeout:10000});
  assert.equal(await page.locator('#autoplay').getAttribute('aria-pressed'),'false');assert.equal(calls,4);
  releaseOld();await page.waitForTimeout(350);assert.equal(await page.locator('#movelist [data-ply]').count(),6);
  await page.locator('#movelist [data-ply="2"]').click();await page.locator('#autoplay').click();await page.locator('#reset').click();await page.waitForTimeout(1000);
  assert.equal(await page.locator('#movelist [data-ply]').count(),0);assert.equal(await page.locator('#autoplay').getAttribute('aria-pressed'),'false');
  await page.setViewportSize({width:390,height:844});assert.equal(await page.locator('#autoplay').isVisible(),true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(output,'playback-result.json'),JSON.stringify({passed:true,startsAtSelectedPly:true,stopsAtSnapshotEnd:true,pauseResume:true,computerPausedThenResumed:true,staleReplyIgnored:true,resetCancelsPlayback:true,pageErrors:errors},null,2));
  console.log('PASS: duel playback starts at selected ply, pauses/resumes, stops at the recorded endpoint, resumes Stockfish and ignores abandoned replies');
 }catch(error){await page.screenshot({path:path.join(output,'playback-failure.png'),fullPage:true});throw error;}
 finally{releaseOld?.();await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
