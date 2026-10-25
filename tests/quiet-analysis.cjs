const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const path=require('node:path'),fs=require('node:fs');
const output=path.resolve(__dirname,'../test-results');fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 const done=()=>page.waitForFunction(()=>document.querySelector('#analysis-state')?.textContent==='分析完成',null,{timeout:15000});
 const widths=()=>page.locator('#engine-probability-bar>span').evaluateAll(nodes=>nodes.map(el=>el.style.width));
 try{
  await page.goto(process.env.CHESS_TEST_URL||'http://127.0.0.1:18765');await done();
  assert.equal(await page.locator('#engine-name').innerText(),'Stockfish');
  assert.equal(await page.locator('#study-analyze,#move-explanation,.engine-score,.engine-pv-score').count(),0);
  assert.equal(await page.locator('.engine-pv').count(),3);
  const header=await page.locator('.engine-toolbar').boundingBox();assert.ok(header.height<=30);
  const select=await page.locator('#atelier-archive-select').boundingBox(),search=await page.locator('#filter-collection').boundingBox();assert.ok(Math.abs(search.width/(search.width+select.width)-.6)<.01);
  const labels=await page.locator('.engine-odds-labels b').allTextContents();assert.equal(labels.map(parseFloat).reduce((a,b)=>a+b,0),100);
  const before=await widths();
  await page.locator('#board [data-square=e2]').click();await page.locator('#board [data-square=e4]').click();
  await page.waitForFunction(()=>document.querySelector('#engine-probability').dataset.pending==='true');
  assert.deepEqual(await widths(),before,'hold the previous settled estimate while the new search runs');
  await done();assert.equal(await page.locator('#engine-probability').getAttribute('data-pending'),'false');
  assert.equal(await page.locator('#odds-bar-white').evaluate(el=>getComputedStyle(el).transitionDuration),'0.75s');
  for(const theme of ['walnut','sage','slate','oat','blush','mist']){
   await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
   const colors=await page.locator('#engine-probability-bar>span').evaluateAll(nodes=>nodes.map(el=>getComputedStyle(el).backgroundColor));
   assert.equal(new Set(colors).size,3);
  }
  await page.evaluate(()=>document.documentElement.dataset.theme='walnut');
  await page.screenshot({path:path.join(output,'quiet-analysis-desktop.png'),fullPage:true});
  await page.locator('.engine-pv').first().click();assert.equal(await page.locator('#candidate-arrow').getAttribute('visibility'),'visible');
  console.log('PASS: compact analysis, no version/deep-score clutter, settled/smooth themed probabilities and arrow suggestions');

  // Real time, no mouse movement, click or page input after the twelfth click.
  await page.locator('#analysis-toggle').click();
  for(let i=0;i<12;i++)await page.locator('#home').click();
  await page.waitForTimeout(350);
  const contrast=await page.locator('.logo-surprise').evaluateAll(nodes=>nodes.map(el=>getComputedStyle(el).backgroundColor));assert.notEqual(contrast[0],contrast[1]);
  const logo=await page.locator('#home').boundingBox(),orange=await page.locator('.logo-orange').boundingBox();assert.ok(orange.x-logo.x-logo.width<20,'surprises must sit beside the logo');
  await page.locator('.masthead').screenshot({path:path.join(output,'logo-trays-desktop.png')});
  await page.waitForTimeout(5200);
  assert.equal(await page.locator('.logo-orange').isVisible(),false);assert.equal(await page.locator('.logo-jasmine').isVisible(),false);
  console.log('PASS: contrast trays, logo-adjacent placement, both retract automatically without another input');
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:path.join(output,'quiet-analysis-mobile.png'),fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(output,'quiet-analysis-result.json'),JSON.stringify({passed:true,pageErrors:errors},null,2));
 }catch(error){await page.screenshot({path:path.join(output,'quiet-analysis-failure.png'),fullPage:true});console.error('Page errors:',errors);throw error;}
 finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
