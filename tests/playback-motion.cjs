const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));const output=path.resolve(__dirname,'../test-results');
 const idle=()=>page.waitForFunction(()=>!document.querySelector('#board.is-opening,.floating-piece'));
 const layout=()=>page.locator('#board > .square').evaluateAll(cells=>Object.fromEntries(cells.map(c=>[c.dataset.square,c.querySelector('.piece-visual')?.dataset.piece||''])));
 try{
  await page.goto(process.env.CHESS_TEST_URL||'http://127.0.0.1:18765');await page.waitForFunction(()=>document.querySelector('#collection').getAttribute('aria-busy')==='false');await page.locator('#analysis-toggle').click();
  await page.locator('[data-square=e2]').click();await page.locator('[data-square=e4]').click();assert.equal(await page.locator('#movelist [data-ply]').count(),0);assert.match(await page.locator('#toast').innerText(),/仅供浏览/);
  await page.locator('#fileinput').setInputFiles(['A','B'].map((name,i)=>({name:name+'.pgn',mimeType:'application/x-chess-pgn',buffer:Buffer.from(`[Event "${name}"]\n[White "Motion ${name}"]\n[Black "Test"]\n[Result "*"]\n\n${i?'1. d4 d5 2. c4 e6 3. Nc3 Nf6':'1. e4 e5 2. Nf3 Nc6 3. Bb5 a6'} *`)})));
  const row=name=>page.locator('#collection .library-open').filter({hasText:'Motion '+name});await row('A').click();await idle();
  const note=await page.locator('#chess-note').innerText();
  for(const button of ['next','next','prev','next']){
   const frames=await page.evaluate(button=>new Promise(resolve=>{document.querySelector('#'+button).click();const frames=[];let n=0;function sample(){const fly=document.querySelector('.floating-piece');frames.push(fly?getComputedStyle(fly).transform:null);if(++n<25)requestAnimationFrame(sample);else resolve(frames);}requestAnimationFrame(sample);}),button);
   assert.ok(new Set(frames.filter(Boolean)).size>=3,'forward/backward each retain intermediate animation frames');assert.equal(await page.locator('#chess-note').innerText(),note);
  }
  const uninterrupted=await page.evaluate(()=>new Promise(resolve=>{document.querySelector('#next').click();const mover=document.querySelector('.floating-piece'),animation=mover?.getAnimations()[0];document.querySelector('[data-square=e2]').click();resolve(!!mover&&mover.isConnected&&animation.playState!=='idle');}));assert.equal(uninterrupted,true);await idle();
  const beforeFlip=await layout(),ply=await page.locator('#ply').innerText();await page.locator('#flip').click();assert.equal(await page.locator('#board.is-opening').count(),1);await idle();assert.deepEqual(await layout(),beforeFlip);assert.equal(await page.locator('#ply').innerText(),ply);assert.equal(await page.locator('#board > .square').first().getAttribute('data-square'),'h1');
  await page.locator('#flip').click();await idle();
  const switchFrames=await page.evaluate(()=>new Promise(resolve=>{const frames=[];document.querySelector('#next').click();setTimeout(()=>[...document.querySelectorAll('#collection .library-open')].find(n=>n.textContent.includes('Motion B')).click(),55);let n=0;function sample(){frames.push({opening:!!document.querySelector('#board.is-opening'),layers:document.querySelectorAll('.opening-layer').length,flies:document.querySelectorAll('.floating-piece').length});if(++n<75)requestAnimationFrame(sample);else resolve(frames);}requestAnimationFrame(sample);}));
  await idle();assert.ok(switchFrames.some(f=>f.opening));assert.ok(switchFrames.every(f=>f.layers<=1));assert.ok(switchFrames.filter(f=>f.opening).every(f=>f.flies===0));assert.equal(await page.locator('#ply').innerText(),'0 / 6');assert.match(await page.locator('#movelist').innerText(),/d4/);assert.equal(await page.locator('#board > .square > .piece').count(),32);
  const beforeReset=await page.locator('#chess-note').innerText();await page.locator('#reset').click();await idle();assert.notEqual(await page.locator('#chess-note').innerText(),beforeReset);
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'playback-motion-result.json'),JSON.stringify({passed:true,studyReadOnly:true,forwardAndReverseFrames:true,blockedClickPreservesMotion:true,flipPreservesPosition:true,scoreSwitchResetsOnce:true,notesOnlyOnReset:true,pageErrors:errors},null,2));console.log('PASS: read-only study, forward/reverse flights, uninterrupted blocked clicks, preserving flip, mid-flight score reset and reset-only notes');
 }catch(e){await page.screenshot({path:path.join(output,'playback-motion-failure.png'),fullPage:true});throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
