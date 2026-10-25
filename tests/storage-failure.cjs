const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const output=path.resolve(__dirname,'../test-results');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 try{
  await page.goto(process.env.CHESS_TEST_URL||'http://127.0.0.1:18765');
  await page.locator('#settings-toggle').click();assert.equal(await page.locator('#settings-toggle').getAttribute('aria-expanded'),'true');
  await page.locator('#settings-close').click();assert.equal(await page.locator('#settings-toggle').getAttribute('aria-expanded'),'false');
  const pgn='[Event "Storage failure"]\n[White "Stored White"]\n[Black "Stored Black"]\n[Result "*"]\n\n1. e4 e5 *';
  await page.locator('#fileinput').setInputFiles({name:'storage.pgn',mimeType:'application/x-chess-pgn',buffer:Buffer.from(pgn)});
  await page.waitForFunction(()=>document.querySelector('#archive-select').value==='mine:我的棋谱');
  const row=page.locator('#collection .library-row').first(),id=await row.getAttribute('data-score-id');await row.locator('[data-star]').click();
  await page.evaluate(()=>{window.originalDelete=IDBObjectStore.prototype.delete;IDBObjectStore.prototype.delete=function(){this.transaction.abort();};});
  await page.locator(`[data-score-id="${id}"] [data-remove]`).click();
  await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('删除失败'));
  assert.equal(await page.locator(`[data-score-id="${id}"]`).count(),1);assert.equal(await page.locator(`[data-score-id="${id}"] [data-star]`).getAttribute('aria-pressed'),'true');
  await page.reload();await page.waitForFunction(()=>document.querySelector('#category-mine').getAttribute('aria-selected')==='true');
  assert.equal(await page.locator(`[data-score-id="${id}"]`).count(),1);
  await page.locator(`#collection [data-score-id="${id}"] [data-star]`).click();
  await page.locator('#atelier-archive-select .atelier-select-trigger').click();await page.locator('#atelier-list-archive-select [data-value="mine:我的棋谱"]').click();
  await page.locator(`[data-score-id="${id}"] [data-remove]`).click();await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('已从合集'));
  assert.equal(await page.locator(`[data-score-id="${id}"]`).count(),0);
  await page.reload();await page.waitForTimeout(400);assert.equal(await page.locator(`[data-score-id="${id}"]`).count(),0);
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(output,'storage-failure-result.json'),JSON.stringify({passed:true,abortedDeleteKeepsRecordAndStar:true,successfulDeletePersists:true,settingsExpandedStateCorrect:true,pageErrors:errors},null,2));
  console.log('PASS: aborted deletion preserves records/stars, successful deletion persists, settings accessibility state matches the dialog');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
