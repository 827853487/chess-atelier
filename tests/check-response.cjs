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
  const sampled=page.evaluate(()=>new Promise(resolve=>{const values=[1];const tick=()=>{values.push(Number(getComputedStyle(document.querySelector('#board .square.check'),'::before').opacity));if(values.length<28)requestAnimationFrame(tick);else resolve(values);};requestAnimationFrame(tick);}));sampled.catch(()=>{});
  const pulse=await page.evaluate(()=>{document.querySelector('#board [data-square=a7]').click();const css=getComputedStyle(document.querySelector('#board .square.check'),'::before');return {name:css.animationName,iterations:css.animationIterationCount,duration:css.animationDuration};});
  assert.deepEqual(pulse,{name:'check-response',iterations:'1',duration:'0.18s'});
  const values=await sampled;assert.ok(Math.min(...values)<.8);
  assert.equal(values[0],1);assert.equal(values.at(-1),1);
  const direction=values.slice(1).map((value,i)=>Math.sign(value-values[i])).filter(Boolean);
  assert.deepEqual(direction.filter((value,i)=>i===0||value!==direction[i-1]),[-1,1],'one continuous fade-down then return');
  assert.equal(await page.locator('#ply').innerText(),baseline);
  await page.waitForTimeout(220);assert.equal(await king.evaluate(el=>getComputedStyle(el,'::before').animationName),'none');
  assert.equal(await king.evaluate(el=>getComputedStyle(el,'::before').opacity),'1');
  await page.locator('#board [data-square=a6]').click();assert.equal(await king.evaluate(el=>getComputedStyle(el,'::before').animationIterationCount),'1');
  await page.waitForTimeout(250);
  await page.locator('.board-block').screenshot({path:path.join(output,'gentle-check-frame.png')});
  // A valid block of the bishop's diagonal removes the frame and accepts the move.
  await page.locator('#board [data-square=b8]').click();await page.locator('#board [data-square=c6]').click();
  await page.waitForFunction(()=>!document.querySelector('#board .square.check'));
  await page.waitForFunction(()=>document.querySelectorAll('#movelist [data-ply]').length===4);
  await page.emulateMedia({reducedMotion:'reduce'});await page.locator('#prev').click();await page.locator('#board [data-square=a7]').click();
  assert.equal(await page.locator('#board .square.check').evaluate(el=>getComputedStyle(el,'::before').animationName),'none');
  fs.writeFileSync(path.join(output,'check-response-result.json'),JSON.stringify({passed:true,pulses:1,pulseMs:180,invalidMoveRejected:true,legalEvasionAccepted:true,reducedMotionSupported:true},null,2));
  console.log('PASS: persistent check border, one short pulse returning to the original style, legal evasions and reduced-motion support');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
