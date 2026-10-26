const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=process.env.CHESS_TEST_URL||'http://127.0.0.1:18865/dist/';
const output=path.resolve(__dirname,'../test-results');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[],apiRequests=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('request',request=>{if(new URL(request.url()).pathname.includes('/api/'))apiRequests.push(request.url());});
 await context.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
 const move=async(from,to)=>{await page.locator(`#board [data-square="${from}"]`).click();await page.locator(`#board [data-square="${to}"]`).click();};
 try{
  await page.goto(base);await page.waitForFunction(()=>document.querySelector('#collection').getAttribute('aria-busy')==='false',null,{timeout:120000});
  await page.waitForFunction(()=>document.querySelectorAll('.engine-pv').length===3&&document.querySelector('#engine-probability').dataset.pending==='false',null,{timeout:45000});
  const initialOdds=await page.locator('#engine-probability').innerText();assert.match(initialOdds,/%/);
  // Stop and replace analysis several times; an old search must not overwrite the current view.
  await page.locator('#fileinput').setInputFiles({name:'public-playback.pgn',mimeType:'application/x-chess-pgn',buffer:Buffer.from('[Event "Public playback"]\n[Result "*"]\n\n1. e4 e5 2. Nf3 Nc6 *')});await page.locator('#collection [data-local]').first().click();await page.waitForFunction(()=>!document.querySelector('#board.is-opening'));
  await page.locator('#next').click();await page.locator('#analysis-toggle').click();
  await page.locator('#next').click();await page.locator('#analysis-toggle').click();
  await page.waitForFunction(()=>document.querySelector('#engine-probability').dataset.pending==='false',null,{timeout:30000});
  await page.locator('[data-play-mode="book"]').click();await move('e2','e4');
  await page.waitForFunction(()=>document.querySelectorAll('#movelist [data-ply]').length===2,null,{timeout:30000});
  assert.match(await page.locator('#difficulty-note').innerText(),/浏览器轻量版/);
  const completed=await page.locator('#movelist').innerText();assert.match(completed,/e4/);
  await page.locator('#first').click();await page.locator('#autoplay').click();
  await page.waitForFunction(()=>document.querySelector('#autoplay').getAttribute('aria-pressed')==='false',null,{timeout:12000});
  assert.equal(await page.locator('#movelist').innerText(),completed);
  const download=page.waitForEvent('download');await page.locator('#export').click();
  const file=await download;await file.saveAs(path.join(output,'public-duel.pgn'));
  assert.match(fs.readFileSync(path.join(output,'public-duel.pgn'),'utf8'),/\[Event "Local Computer Game"\]/);
  // Reset while a full-strength move is pending; its late result must be ignored.
  await page.locator('#atelier-bot-level .atelier-select-trigger').click();await page.locator('#atelier-list-bot-level [data-value="6"]').click();
  await move('g1','f3');await page.locator('#reset').click();
  await page.waitForTimeout(3000);assert.equal(await page.locator('#movelist [data-ply]').count(),0);
  await page.locator('#atelier-side .atelier-select-trigger').click();await page.locator('#atelier-list-side [data-value="b"]').click();
  await page.waitForFunction(()=>document.querySelectorAll('#movelist [data-ply]').length===1,null,{timeout:30000});
  await page.screenshot({path:path.join(output,'public-browser-engine.png'),fullPage:true});
  assert.deepEqual(apiRequests,[],'public build must not depend on a Python API or remote engine');assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(output,'public-site-result.json'),JSON.stringify({passed:true,url:base,browserStockfish:true,analysis:true,computerReply:true,playback:true,pgnExport:true,cancellation:true,blackPlayer:true,apiRequests,pageErrors:errors},null,2));
  console.log('PASS: static subdirectory hosting, real browser Stockfish analysis/play, cancellation, replay and PGN export without API requests');
 }catch(error){await page.screenshot({path:path.join(output,'public-site-failure.png'),fullPage:true});throw error;}
 finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
