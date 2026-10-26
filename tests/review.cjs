const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),output=path.join(root,'test-results'),sandbox=vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(root,'vendor/chess.js'),'utf8').replace(/^export default .*;?$/gm,'').replace(/^export /gm,'')+';globalThis.Rules=Chess',sandbox);const Chess=sandbox.Rules;
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}});let reviewRequests=0;
 try{
  await page.route('**/api/analyze',async route=>{
   const body=route.request().postDataJSON();if(!body.review){await route.abort();return;}
   reviewRequests++;const game=new Chess(body.fen),moves=game.moves({verbose:true}),base={available:true,complete:true,source:'stockfish',perspective:'white',fen:body.fen};
   const data=game.isGameOver()?{...base,terminal:true,result:game.isCheckmate()?'0-1':'1/2-1/2',pvs:[]}:{...base,pvs:moves.slice(0,3).map((m,i)=>({moves:m.from+m.to+(m.promotion||''),depth:12,cp:body.moves.length*15-i*10,wdl:[200,600,200]}))};
   await new Promise(resolve=>setTimeout(resolve,100));await route.fulfill({contentType:'text/event-stream',body:'data: '+JSON.stringify(data)+'\n\n'}).catch(()=>{});
  });
  await page.goto(process.env.CHESS_TEST_URL||'http://127.0.0.1:18765');await page.locator('#analysis-toggle').click();
  const pgn='[Event "Review before playback"]\n[White "White"]\n[Black "Black"]\n[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1';
  await page.locator('#fileinput').setInputFiles({name:'review.pgn',mimeType:'application/x-chess-pgn',buffer:Buffer.from(pgn)});
  await page.locator('#collection [data-local]').first().click();assert.equal(await page.locator('#ply').innerText(),'0 / 4');
  assert.equal(reviewRequests,0,'no review model runs until requested');
  await page.locator('#side-badge').click();await page.waitForFunction(()=>document.querySelector('#review-progress').textContent.startsWith('5 / 5'));
  assert.equal(await page.locator('#analysis-toggle').innerText(),'实时分析');assert.equal(await page.locator('#analysis-toggle').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('.analysis-live > #post-review').count(),1);assert.equal(await page.locator('#engine-insight').isVisible(),false);
  const frames=await page.evaluate(()=>new Promise(resolve=>{const frames=[];document.querySelector('#movelist [data-ply="1"]').click();let n=0;function sample(){frames.push({flying:!!document.querySelector('.floating-piece'),badge:!!document.querySelector('.review-mark')});if(++n<35)requestAnimationFrame(sample);else resolve(frames);}requestAnimationFrame(sample);}));
  assert.ok(frames.some(f=>f.flying));assert.ok(frames.some(f=>f.badge));assert.ok(frames.every(f=>!f.flying||!f.badge),'badges appear only after the moving piece lands');
  await page.waitForSelector('[data-square=f3] .review-mark');assert.ok((await page.locator('.review-mark').boundingBox()).width>=20);
  assert.match(await page.locator('#review-move-title').innerText(),/最佳|良好|可改进|失误/);assert.ok((await page.locator('#review-comment').innerText()).length>8);
  await page.locator('#review-suggestion').click();assert.equal(await page.locator('#candidate-arrow').evaluate(node=>node.tagName.toLowerCase()),'path');
  assert.equal(await page.locator('#candidate-arrow').getAttribute('marker-end'),null);
  await page.waitForFunction(()=>document.querySelector('#candidate-arrow').getAttribute('visibility')==='visible');
  assert.match(await page.locator('#review-line-description').innerText(),/箭头/);
  await page.locator('.right').screenshot({path:path.join(output,'post-review-study.png')});
  const completed=reviewRequests;await page.locator('#side-badge').click();await page.waitForTimeout(250);assert.equal(reviewRequests,completed);
  assert.equal(await page.locator('#post-review').isVisible(),false);
  await page.locator('#side-badge').click();await page.waitForTimeout(300);assert.equal(reviewRequests,completed,'reopening the same record reuses completed results');await page.locator('#side-badge').click();
  await page.route('**/api/play',route=>{const body=route.request().postDataJSON();return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,uci:body.moves.length===1?'e7e5':'d8h4'})});});
  await page.locator('[data-play-mode=book]').click();
  const move=async(a,b,n)=>{await page.locator(`[data-square=${a}]`).click();await page.locator(`[data-square=${b}]`).click();await page.waitForFunction(n=>document.querySelectorAll('#movelist [data-ply]').length===n,n);await page.waitForFunction(()=>!document.querySelector('.floating-piece'));};
  await move('f2','f3',2);await move('g2','g4',4);
  assert.equal(await page.locator('#side-badge').innerText(),'复盘分析');
  await page.locator('#side-badge').click();await page.waitForFunction(()=>document.querySelector('#review-progress').textContent.startsWith('5 / 5'));
  await page.locator('#last').click();await page.waitForSelector('[data-square=h4] .review-mark');assert.match(await page.locator('#review-move-title').innerText(),/将死/);
  await page.locator('#reset').click();await page.waitForFunction(()=>!document.querySelector('#board.is-opening'));assert.equal(await page.locator('#post-review').isVisible(),false);assert.equal(await page.locator('.review-mark').count(),0);
  fs.writeFileSync(path.join(output,'review-result.json'),JSON.stringify({passed:true,studyFromStart:true,duelAfterFinish:true,progressive:true,cachedReopen:true,closingStops:true,badges:true,unifiedArrow:true,resetCleanup:true},null,2));
  console.log('PASS: on-demand study/duel review, progressive results, badges, cached reopening, stopping and seamless single-path arrows');
 }catch(error){await page.screenshot({path:path.join(output,'review-failure.png'),fullPage:true});throw error;}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
