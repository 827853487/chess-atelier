const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const output=path.resolve(__dirname,'../test-results');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 try{
  await page.goto(process.env.CHESS_TEST_URL||'http://127.0.0.1:18765');
  await page.locator('#analysis-toggle').click();
  const pgn='[Event "Check response"]\n[White "White"]\n[Black "Black"]\n[Result "*"]\n\n1. e4 d5 2. Bb5+ *';
  await page.locator('#fileinput').setInputFiles({name:'check.pgn',mimeType:'application/x-chess-pgn',buffer:Buffer.from(pgn)});
  await page.waitForFunction(()=>document.querySelector('#archive-select').value==='mine:我的棋谱');
  await page.locator('#collection [data-local]').first().click();await page.locator('#last').click();await page.waitForTimeout(500);
  const king=page.locator('#board .square.check');assert.equal(await king.getAttribute('data-square'),'e8');
  assert.match(await king.evaluate(el=>getComputedStyle(el,'::before').boxShadow),/0\.72.+2px/);
  assert.equal(await king.evaluate(el=>getComputedStyle(el,'::before').opacity),'1');
  const baseline=await page.locator('#ply').innerText();
  await page.locator('#board [data-square=a7]').click();
  const pulse=await king.evaluate(el=>{const css=getComputedStyle(el,'::before');return {name:css.animationName,iterations:css.animationIterationCount,duration:css.animationDuration};});
  assert.deepEqual(pulse,{name:'check-response',iterations:'2',duration:'0.28s'});
  await page.waitForTimeout(100);
  assert.ok(Number(await king.evaluate(el=>getComputedStyle(el,'::before').opacity))<1);
  assert.equal(await page.locator('#ply').innerText(),baseline);
  await page.waitForTimeout(600);assert.equal(await king.evaluate(el=>getComputedStyle(el,'::before').animationName),'none');
  assert.equal(await king.evaluate(el=>getComputedStyle(el,'::before').opacity),'1');
  await page.locator('#board [data-square=a6]').click();assert.equal(await king.evaluate(el=>getComputedStyle(el,'::before').animationIterationCount),'2');
  await page.waitForTimeout(650);
  await page.locator('.board-block').screenshot({path:path.join(output,'gentle-check-frame.png')});
  // A valid block of the bishop's diagonal removes the frame and accepts the move.
  await page.locator('#board [data-square=b8]').click();await page.locator('#board [data-square=c6]').click();
  await page.waitForFunction(()=>!document.querySelector('#board .square.check'));
  await page.waitForFunction(()=>document.querySelectorAll('#movelist [data-ply]').length===4);
  await page.emulateMedia({reducedMotion:'reduce'});await page.locator('#prev').click();await page.locator('#board [data-square=a7]').click();
  assert.equal(await page.locator('#board .square.check').evaluate(el=>getComputedStyle(el,'::before').animationName),'none');
  fs.writeFileSync(path.join(output,'check-response-result.json'),JSON.stringify({passed:true,pulses:2,invalidMoveRejected:true,legalEvasionAccepted:true,reducedMotionSupported:true},null,2));
  console.log('PASS: muted persistent check border, exactly two flashes for invalid responses, legal evasions and reduced-motion support');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
