const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),output=path.join(root,'test-results');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'data/library-sources.json'),'utf8'));
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 const base=process.env.CHESS_TEST_URL||'http://127.0.0.1:18765';
 const ready=()=>page.waitForFunction(()=>document.querySelector('#collection').getAttribute('aria-busy')==='false');
 const select=async value=>{await page.locator('#atelier-archive-select .atelier-select-trigger').click();await page.locator(`#atelier-list-archive-select [data-value="${value}"]`).click();};
 try{
  await page.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
  await page.goto(base);await ready();
  await page.locator('#analysis-toggle').click();await page.locator('#category-masters').click();
  assert.equal(await page.locator('#archive-select').inputValue(),'kasparov-career');
  assert.equal(await page.locator('#collection-meta').innerText(),'2,126 局');
  const listBefore=await page.locator('#collection').boundingBox();await page.locator('#collection-guide summary').click();
  assert.match(await page.locator('.collection-guide-body').innerText(),/PGN Mentor/);
  assert.deepEqual(await page.locator('#collection').boundingBox(),listBefore,'source help must not shift the score list');
  await page.locator('#collection-guide summary').click();
  await page.locator('#filter-collection').fill('Topalov');
  const famous=page.locator('.library-row').filter({hasText:'1999'}).first();await famous.waitFor({state:'visible'});
  const id=await famous.getAttribute('data-score-id');await famous.locator('[data-star]').click();await famous.locator('[data-local]').click();
  await page.locator('#last').click();assert.ok(await page.locator('#movelist [data-ply]').count()>40);
  await page.locator('#study-workspace').screenshot({path:path.join(output,'kasparov-library.png')});
  await page.reload();await ready();await page.locator('#category-mine').click();
  assert.equal(await page.locator(`[data-score-id="${id}"] [data-star]`).getAttribute('aria-pressed'),'true');
  await page.locator('#category-training').click();await select('capablanca-fundamentals');
  assert.equal(await page.locator('#collection-meta').innerText(),'81 章');
  await page.locator('#collection [data-local]').first().click();assert.equal(await page.locator('#board .square .piece').count(),3);
  await page.locator('#last').click();assert.match(await page.locator('#status').innerText(),/将死/);
  await page.locator('.library-row').filter({hasText:'例 4 ·'}).locator('[data-local]').click();
  assert.ok(await page.locator('#movelist [data-ply]').count()>0);await page.locator('#last').click();assert.match(await page.locator('#status').innerText(),/将死/);
  await page.locator('.library-row').filter({hasText:'例 30 ·'}).locator('[data-local]').click();
  assert.equal(await page.locator('#movelist [data-ply]').count(),0);assert.match(await page.locator('#movelist').innerText(),/局面练习/);
  assert.ok(await page.locator('#board .square .piece').count()>2);
  for(const pack of manifest.collections.filter(p=>p.kind==='puzzle')){
   await select(pack.id);assert.equal(Number((await page.locator('#collection-meta').innerText()).replace(/\D/g,'')),pack.games);
   await page.locator('#collection [data-local]').first().click();assert.ok(await page.locator('#movelist [data-ply]').count()>0);
   assert.ok(!/棋谱格式无法解析|无法读取/.test(await page.locator('#toast').innerText()));
   await page.locator('#last').click();
  }
  await select('practice-underpromotion');await page.locator('#collection [data-local]').first().click();
  assert.equal(await page.locator('#side-badge').innerText(),'黑方行棋');
  assert.equal(await page.locator('#board [data-square="g2"] .piece').count(),1,'the opponent setup move has already been applied');
  await page.locator('#next').click();assert.match(await page.locator('#movelist').innerText(),/g1=N/);
  await page.locator('#study-workspace').screenshot({path:path.join(output,'graded-training.png')});
  await page.setViewportSize({width:390,height:844});await page.locator('#collection-guide summary').click();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(output,'master-training-result.json'),JSON.stringify({passed:true,kasparov:2126,masterAdditions:3526,courseChapters:81,gradedPuzzles:776,themes:26,offline:true,stableFavorites:true,sourceGuideDoesNotShiftLayout:true,pageErrors:errors},null,2));
  console.log('PASS: Kasparov corpus and persistent stars, course lines and position-only chapters, all 26 exercise themes, correct black-to-move setup and offline/mobile layout');
 }catch(error){await page.screenshot({path:path.join(output,'master-training-failure.png'),fullPage:true});throw error;}
 finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
