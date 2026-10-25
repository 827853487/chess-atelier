const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),output=path.join(root,'test-results');fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true}),errors=[];let analysisRequests=0;
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('/api/analyze'))analysisRequests++;});
 await page.addInitScript(()=>Math.random=()=>.99);
 const url=process.env.CHESS_TEST_URL||'http://127.0.0.1:18765';
 const category=id=>page.locator(`[data-category="${id}"]`);
 const select=async(id,value)=>{await page.locator(`#atelier-${id} .atelier-select-trigger`).click();await page.locator(`#atelier-list-${id} [data-value="${value}"]`).click();};
 const move=async(from,to)=>{await page.locator(`#board [data-square="${from}"]`).click();await page.locator(`#board [data-square="${to}"]`).click();};
 const done=()=>page.waitForFunction(()=>document.querySelector('#analysis-state').textContent==='分析完成',null,{timeout:15000});
 try{
  await page.goto(url);await done();await page.waitForFunction(()=>document.querySelector('#collection').getAttribute('aria-busy')==='false');
  assert.equal(await page.locator('#analysis-heading').innerText(),'局势分析');assert.equal(await page.locator('#analysis-toggle').innerText(),'实时分析');
  assert.equal(await page.locator('#panel-notes').isVisible(),true);assert.equal(await page.locator('#export').isVisible(),false);assert.equal(await page.locator('#save').isVisible(),false);
  assert.equal(await page.locator('#archive-select').inputValue(),'openings');
  assert.equal(await page.locator('#archive-select option[value="*"]').count(),0);
  await category('masters').click();await select('archive-select','world-1972');
  await category('training').click();await category('masters').click();assert.equal(await page.locator('#archive-select').inputValue(),'kasparov-career');
  await page.locator('#settings-toggle').click();
  const links=await page.locator('.settings-links a').evaluateAll(nodes=>nodes.map(n=>n.href));
  assert.ok(links.indexOf('https://stockfishchess.org/')<links.indexOf('https://commons.wikimedia.org/'));await page.locator('#settings-close').click();
  console.log('PASS: study mode shows read-only notation and hides export/save; category menus start with first pack and contain no All option; Stockfish resource link');

  await page.locator('#analysis-toggle').click();await page.waitForTimeout(220);
  assert.equal(await page.locator('.analysis-live').isVisible(),false);assert.equal(await page.locator('#analysis-rest').isVisible(),true);
  assert.equal(await page.locator('#chess-note').getAttribute('lang'),'en');assert.match(await page.locator('#chess-note-translation').innerText(),/^（.+）$/);
  assert.equal(await page.locator('#analysis-rest blockquote').evaluate(el=>getComputedStyle(el).fontStyle),'italic');
  const quote=await page.locator('#chess-note').innerText();await page.locator('#analysis-rest').dblclick();assert.notEqual(await page.locator('#chess-note').innerText(),quote);
  const requests=analysisRequests;await move('e2','e4');await page.waitForTimeout(500);assert.equal(analysisRequests,requests,'disabled analysis must make no position requests');
  await page.locator('.analysis-card-wrap').screenshot({path:path.join(output,'paused-chess-notes.png')});
  await page.locator('#analysis-toggle').click();await done();assert.equal(await page.locator('#analysis-rest').isVisible(),false);
  console.log('PASS: quick data fade, italic bilingual notes, double-click switching and no analysis requests while disabled');

  await category('mine').click();
  const pgn='[Event "Mating finish"]\n[White "White"]\n[Black "Black"]\n[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1\n';
  await page.locator('#fileinput').setInputFiles({name:'mate.pgn',mimeType:'application/x-chess-pgn',buffer:Buffer.from(pgn)});
  await page.waitForFunction(()=>document.querySelector('#archive-select').value==='mine:我的棋谱');
  await page.locator('#collection [data-local]').first().click();await page.locator('#last').click();
  assert.match(await page.locator('#game-result').innerText(),/将死.*黑方获胜/);assert.ok(!/认输|超时/.test(await page.locator('#game-result').innerText()));
  const checked=page.locator('#board .square.check');assert.equal(await checked.count(),1);
  assert.ok(await checked.evaluate(el=>getComputedStyle(el,'::before').boxShadow.includes('0.72')));
  assert.equal(await checked.evaluate(el=>getComputedStyle(el).animationName),'none');
  assert.equal(await page.locator('#panel-notes').isVisible(),true);assert.equal(await page.locator('#export').isVisible(),false);
  await page.locator('#movelist [data-ply="2"]').click();assert.equal(await page.locator('#ply').textContent(),'2 / 4');
  assert.equal(await page.locator('#record-heading').innerText(),'棋谱着法');
  assert.equal(await page.locator('#movelist [data-ply="2"]').evaluate(el=>getComputedStyle(el).cursor),'pointer');
  assert.equal(await page.locator('#movelist [data-ply="2"]').evaluate(el=>getComputedStyle(el).caretColor),'rgba(0, 0, 0, 0)');
  assert.equal(await page.locator('#filter-collection').evaluate(el=>getComputedStyle(el).cursor),'text');
  assert.notEqual(await page.locator('#filter-collection').evaluate(el=>getComputedStyle(el).caretColor),'rgba(0, 0, 0, 0)');
  console.log('PASS: gentle check highlight, concise checkmate result and read-only study notation');

  await page.locator('[data-play-mode="book"]').click();await select('bot-level','1');
  assert.equal(await page.locator('#save').isVisible(),true);assert.equal(await page.locator('#panel-notes').isVisible(),true);
  await move('e2','e4');await page.waitForFunction(()=>document.querySelectorAll('#movelist [data-ply]').length===2,null,{timeout:15000});
  const pendingDownload=page.waitForEvent('download');await page.locator('#export').click();const download=await pendingDownload;await download.saveAs(path.join(output,'revised-duel.pgn'));
  assert.match(fs.readFileSync(path.join(output,'revised-duel.pgn'),'utf8'),/1\. e4 /);
  await page.locator('#save').click();await page.locator('#save-title').fill('Revised workflow saved');await page.locator('#save-confirm').click();
  await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('已保存'));
  await page.locator('[data-play-mode="free"]').click();assert.equal(await page.locator('#save').isVisible(),false);
  assert.match(await page.locator('#collection').innerText(),/Revised workflow saved/);
  console.log('PASS: duel records, standard PGN export and local save remain functional');

  await page.locator('[data-play-mode="book"]').click();
  if(await page.locator('#analysis-toggle').getAttribute('aria-pressed')==='true')await page.locator('#analysis-toggle').click();
  await page.route('**/api/play',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({ok:false,message:'测试：引擎不可用'})}));
  await move('e2','e4');await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('引擎不可用'));
  assert.equal(await page.locator('#retry-engine').isVisible(),true,'computer recovery must remain available while analysis is off');
  await page.unroute('**/api/play');await page.locator('#retry-engine').click();
  await page.waitForFunction(()=>document.querySelectorAll('#movelist [data-ply]').length===2,null,{timeout:15000});
  await page.route('**/api/play',async route=>{await new Promise(r=>setTimeout(r,700));try{await route.continue();}catch{}});
  await page.locator('#reset').click();await move('e2','e4');await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('思考'));
  await page.locator('#reset').click();await page.waitForTimeout(1200);assert.equal(await page.locator('#movelist [data-ply]').count(),0);
  await page.unroute('**/api/play');await select('side','b');
  await page.waitForFunction(()=>document.querySelectorAll('#movelist [data-ply]').length===1,null,{timeout:15000});
  console.log('PASS: engine retry with notes visible, cancellation after reset and computer first move for a black player');

  const component=await browser.newPage();
  await component.setContent('<select id="archive-select"><option value="one">唯一合集</option></select>');
  await component.addStyleTag({path:path.join(root,'library-ui.css')});await component.addScriptTag({path:path.join(root,'custom-select.js')});
  assert.equal(await component.locator('.atelier-select-trigger').isEnabled(),false);
  assert.equal(await component.locator('.atelier-select-trigger>svg').isVisible(),false);await component.close();
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(output,'revised-workflow-result.json'),JSON.stringify({passed:true,pageErrors:errors},null,2));
 }catch(error){await page.screenshot({path:path.join(output,'revised-workflow-failure.png'),fullPage:true});console.error(errors);throw error;}
 finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
