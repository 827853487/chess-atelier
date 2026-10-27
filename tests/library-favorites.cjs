const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const output=path.resolve(__dirname,'../test-results');fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const url=process.env.CHESS_TEST_URL||'http://127.0.0.1:18765';
 const category=id=>page.locator(`[data-category="${id}"]`);
 const select=async value=>{await page.locator('#atelier-archive-select .atelier-select-trigger').click();await page.locator(`#atelier-list-archive-select [data-value="${value}"]`).click();};
 const ready=()=>page.waitForFunction(()=>document.querySelector('#collection').getAttribute('aria-busy')==='false');
 try{
  await page.route('**/*',route=>route.request().url().startsWith(url)?route.continue():route.abort());
  await page.goto(url);await ready();
  assert.equal(await page.locator('#analysis-heading').innerText(),'局势分析');
  assert.equal(await page.locator('#import').isVisible(),false);assert.equal(await page.locator('#new-pack').isVisible(),false);
  const heights=[];
  for(const id of ['masters','mine','training','mine','openings']){
   await category(id).click();heights.push((await page.locator('#collection').boundingBox()).height);
   assert.equal(await page.locator('#import').isVisible(),id==='mine');
   assert.equal(await page.locator('#new-pack').isVisible(),id==='mine');
  }
  assert.equal(new Set(heights.map(Math.round)).size,1);
  await category('masters').click();await select('world-1972');
  assert.equal(await page.locator('#collection [data-local]').count(),21);
  assert.ok(!(await page.locator('#collection-meta').innerText()).includes('大师对局'));
  const row=page.locator('.library-row').first(),id=await row.getAttribute('data-score-id');
  await row.locator('[data-star]').click();
  assert.equal(await page.locator('#movelist [data-ply]').count(),0,'starring must not open or play the score');
  await category('mine').click();await select('mine:starred');assert.equal(await page.locator(`[data-score-id="${id}"]`).count(),1);
  await page.reload();await ready();assert.equal(await page.locator('#archive-select').inputValue(),'mine:starred');
  assert.equal(await page.locator(`[data-score-id="${id}"] [data-star]`).getAttribute('aria-pressed'),'true');
  await page.locator('#study-workspace').screenshot({path:path.join(output,'starred-library.png'),animations:'disabled'});
  await page.locator(`[data-score-id="${id}"] [data-star]`).click();assert.equal(await page.locator('#collection .library-row').count(),0);
  await category('masters').click();await select('world-1972');assert.equal(await page.locator('#collection [data-local]').count(),21);
  assert.equal(await page.locator(`[data-score-id="${id}"] [data-star]`).getAttribute('aria-pressed'),'false');
  console.log('PASS: stable category layout, personal-only tools, no repeated category prefix, persistent/reversible stars');

  for(const [cat,pack] of [['training','pawn-endgames'],['training','rook-endgames'],['training','minor-endgames'],['training','grigoriev-studies'],['openings','london-master-games']]){
   await category(cat).click();await select(pack);assert.ok(await page.locator('#collection [data-local]').count()>0);
   await page.locator('#collection [data-local]').first().click();await page.locator('#last').click();
   assert.equal(await page.locator('#panel-notes').isVisible(),true);assert.equal(await page.locator('#export').count(),0);
   assert.ok(!(await page.locator('#ply').textContent()).startsWith('0 /'));
  }
  await category('training').click();await select('rook-endgames');
  await page.locator('#study-workspace').screenshot({path:path.join(output,'expanded-endgames.png'),animations:'disabled'});
  for(const width of [886,390,320]){
   await page.setViewportSize({width,height:900});await category('mine').click();await select('mine:starred');
   const before=await category('mine').boundingBox();await category('masters').click();const after=await category('masters').boundingBox();
   assert.ok(Math.abs(before.y-after.y)<2,'category controls must not jump when an empty view replaces a full one');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: all added study types replay offline; empty/full category switches stay aligned at 886/390/320 px');
  fs.writeFileSync(path.join(output,'library-favorites-result.json'),JSON.stringify({passed:true,pageErrors:errors},null,2));
 }catch(error){await page.screenshot({path:path.join(output,'library-favorites-failure.png'),fullPage:true});console.error(errors);throw error;}
 finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
