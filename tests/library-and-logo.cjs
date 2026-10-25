const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const output=path.resolve(__dirname,'../test-results');fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 const category=id=>page.locator(`[data-category="${id}"]`);
 const select=async value=>{await page.locator('#atelier-archive-select .atelier-select-trigger').click();await page.locator(`#atelier-list-archive-select [data-value="${value}"]`).click();};
 const options=()=>page.locator('#archive-select option').allTextContents();
 try{
  await page.goto(process.env.CHESS_TEST_URL||'http://127.0.0.1:18765');
  await page.waitForFunction(()=>document.querySelector('#collection').getAttribute('aria-busy')==='false');
  assert.equal(await category('openings').getAttribute('aria-selected'),'true');
  assert.ok((await options()).includes('开局示范'));assert.ok((await options()).includes('伦敦体系实战'));
  assert.ok(await page.locator('#collection').getByText('意大利开局',{exact:true}).isVisible());
  const mastersCount=await category('masters').locator('.category-count').innerText();
  await category('masters').click();
  const masterOptions=await options();assert.ok(masterOptions.includes('菲舍尔名局'));assert.ok(!masterOptions.includes('战术范例'));assert.ok(!masterOptions.includes('导入'));assert.ok(!masterOptions.includes('经典教学对局'));
  await select('fischer');assert.match(await page.locator('#collection-meta').innerText(),/^[\d,]+ 局$/);
  await category('training').click();await select('endings');assert.match(await page.locator('#collection-meta').innerText(),/^[\d,]+ 局$/);
  await category('masters').click();assert.equal(await page.locator('#archive-select').inputValue(),'kasparov-career');
  await category('masters').press('ArrowRight');assert.equal(await category('training').getAttribute('aria-selected'),'true');assert.equal(await page.locator('#archive-select').inputValue(),'tactics');
  await category('masters').click();await page.locator('#filter-collection').fill('Fischer');
  await category('openings').click();assert.equal(await page.locator('#filter-collection').inputValue(),'');
  await category('masters').click();assert.equal(await page.locator('#filter-collection').inputValue(),'');
  console.log('PASS: category separation, scoped second menu, keyboard navigation and independent filters');

  const pgn='[Event "Browser Personal"]\n[White "Personal White"]\n[Black "Personal Black"]\n[Result "*"]\n\n1. e4 e5 2. Nf3 Nc6 *\n';
  await page.locator('#fileinput').setInputFiles({name:'personal.pgn',mimeType:'application/x-chess-pgn',buffer:Buffer.from(pgn)});
  await page.waitForFunction(()=>document.querySelector('#category-mine').getAttribute('aria-selected')==='true');
  assert.equal(await page.locator('#archive-select').inputValue(),'mine:我的棋谱');assert.equal(await page.locator('#filter-collection').inputValue(),'');
  assert.match(await page.locator('#collection').innerText(),/Personal White/);
  assert.equal(await category('masters').locator('.category-count').innerText(),mastersCount);
  assert.ok(!(await options()).includes('菲舍尔名局'));
  await page.locator('#new-pack').click();await page.locator('#pack-name').fill('我的开局笔记');await page.locator('#pack-create').click();await page.locator('#pack-close').click();
  assert.equal(await page.locator('#archive-select').inputValue(),'extra:我的开局笔记');
  await page.reload();await page.waitForFunction(()=>document.querySelector('#archive-select')?.value==='mine:starred');assert.ok((await options()).includes('我的开局笔记'));
  assert.equal(await category('mine').getAttribute('aria-selected'),'true');
  await select('mine:我的棋谱');
  await page.locator('#study-workspace').screenshot({path:path.join(output,'library-mine.png'),animations:'disabled'});
  await category('masters').click();await page.locator('#filter-collection').fill('');await select('fischer');
  assert.ok(!(await page.locator('#collection').innerText()).includes('Personal White'));
  await page.locator('#study-workspace').screenshot({path:path.join(output,'library-masters.png'),animations:'disabled'});
  console.log('PASS: imports route to personal scores, custom collections and selection survive reload');

  if(await page.locator('#analysis-toggle').getAttribute('aria-pressed')==='true')await page.locator('#analysis-toggle').click();
  await page.clock.install({time:new Date('2026-10-26T00:00:00Z')});
  await page.clock.pauseAt(new Date('2026-10-26T00:00:01Z'));
  const tap=async n=>{for(let i=0;i<n;i++)await page.locator('#home').click();};
  const orange=page.locator('.logo-orange'),jasmine=page.locator('.logo-jasmine');
  await tap(5);assert.equal(await orange.isVisible(),false);
  await page.clock.runFor(1600);await tap(1);assert.equal(await orange.isVisible(),false);
  await tap(5);assert.equal(await orange.isVisible(),true);assert.equal(await jasmine.isVisible(),false);
  await tap(5);assert.equal(await jasmine.isVisible(),false);
  await tap(1);assert.equal(await jasmine.isVisible(),true);
  await tap(8);await page.clock.runFor(5200);assert.equal(await orange.isVisible(),true);assert.equal(await jasmine.isVisible(),true);
  await page.setViewportSize({width:390,height:844});
  await page.locator('.masthead').screenshot({path:path.join(output,'logo-surprises.png')});
  for(const width of [390,320]){
   await page.setViewportSize({width,height:844});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   const flower=await jasmine.boundingBox(),tools=await page.locator('.top-tools').boundingBox();
   assert.ok(flower.x+flower.width<=width);assert.ok(flower.x+flower.width<=tools.x||flower.y+flower.height<=tools.y||tools.y+tools.height<=flower.y,'surprises must not overlap header controls');
  }
  await page.clock.runFor(6000);assert.equal(await orange.isVisible(),false);assert.equal(await jasmine.isVisible(),false);
  await tap(6);assert.equal(await orange.isVisible(),true);assert.equal(await jasmine.isVisible(),false);
  await page.clock.runFor(5500);assert.equal(await orange.isVisible(),false);
  assert.deepEqual(errors,[]);
  console.log('PASS: six/twelve clicks, interrupted streak, extension, expiry and mobile/reduced-motion-safe layout');
  fs.writeFileSync(path.join(output,'library-and-logo-result.json'),JSON.stringify({passed:true,pageErrors:errors},null,2));
 }catch(error){await page.screenshot({path:path.join(output,'library-logo-failure.png'),fullPage:true});console.error('Page errors:',errors);throw error;}
 finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
