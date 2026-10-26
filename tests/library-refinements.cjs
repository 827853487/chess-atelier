const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const output=path.resolve(__dirname,'../test-results');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 const select=async value=>{await page.locator('#atelier-archive-select .atelier-select-trigger').click();await page.locator(`#atelier-list-archive-select [data-value="${value}"]`).click();};
 const ready=()=>page.waitForFunction(()=>Number(document.querySelector('#category-openings .category-count').textContent.replaceAll(',',''))>=1000);
 try{
  await page.goto(process.env.CHESS_TEST_URL||'http://127.0.0.1:18765');await ready();
  // Seed an old personal library in this isolated test profile, then exercise the real upgrade path.
  await page.evaluate(async()=>{
   const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('ChessAtelierLibraryV4',1);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
   await new Promise((resolve,reject)=>{
    const tx=db.transaction('games','readwrite');
    for(const [id,origin,title] of [['import-old','导入','Old import'],['save-old','我的保存','Old save'],['save-custom','专题笔记','Custom score']])tx.objectStore('games').put({id,origin,title,pgn:'[Event "Migration test"]\n[White "White"]\n[Black "Black"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 1-0',stage:'复盘'});
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
   });db.close();
   localStorage.setItem('ChessAtelierUserPacks',JSON.stringify(['导入','我的保存','专题笔记']));
   localStorage.setItem('ChessAtelierMineOrder',JSON.stringify(['我的保存','导入','专题笔记']));
   localStorage.setItem('ChessAtelierStarredScoresV1',JSON.stringify(['save-old','complete-london-master-games-0']));
  });
  await page.reload();await ready();await page.locator('#category-mine').click();
  const options=await page.locator('#archive-select option').allTextContents();
  assert.deepEqual(options,['星标收藏 ★','我的棋谱','专题笔记']);
  assert.match(await page.locator('#collection').innerText(),/Old save/);
  assert.match(await page.locator('#collection').innerText(),/伦敦体系示范片段 1/);
  await select('mine:我的棋谱');assert.equal(await page.locator('#collection .library-row').count(),2);
  assert.match(await page.locator('#collection').innerText(),/Old import/);assert.match(await page.locator('#collection').innerText(),/Old save/);
  assert.equal(await page.locator('[data-score-id="save-old"] [data-star]').getAttribute('aria-pressed'),'true');
  await page.locator('#new-pack').click();assert.equal(await page.locator('#pack-list .pack-row[data-pack="我的棋谱"]').count(),1);await page.locator('#pack-close').click();
  await page.locator('[data-score-id="save-old"] [data-local]').click();await page.locator('#last').click();await page.waitForTimeout(600);
  assert.equal(await page.locator('#side-badge').innerText(),'白方获胜');assert.equal(await page.locator('#status').innerText(),'白方获胜');
  // Header results must end the display even when the final board still has legal moves.
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:1000});await page.waitForTimeout(120);
   assert.equal(await page.locator('#game-result').count(),0);
   await page.locator('#flip').click();await page.waitForTimeout(80);
   assert.equal(await page.locator('#side-badge').innerText(),'白方获胜');
  }
  await page.locator('#prev').click();assert.match(await page.locator('#side-badge').innerText(),/方行棋$/);assert.equal(await page.locator('#game-result').count(),0);
  console.log('PASS: old personal collections merge without losing records, custom packs or stars; replay finish and result position work in both orientations');
  await page.setViewportSize({width:1440,height:1000});await page.locator('#category-masters').click();await select('world-2021');
  await page.locator('#atelier-archive-select .atelier-select-trigger').click();
  assert.equal(await page.locator('#atelier-list-archive-select').evaluate(el=>el.scrollTop),0);
  await page.locator('#atelier-archive-select .atelier-select-trigger').press('Escape');
  // Opening/keyboard scrolling a long dropdown must leave its trigger, pane and page still.
  for(const width of [1440,390])for(const category of ['masters','training']){
   await page.setViewportSize({width,height:1000});await page.locator('#category-'+category).click();
   const trigger=page.locator('#atelier-archive-select .atelier-select-trigger');
   await trigger.scrollIntoViewIfNeeded();await page.waitForTimeout(150);
   const before=await page.evaluate(()=>({y:scrollY,right:document.querySelector('.right').scrollTop,top:document.querySelector('#atelier-archive-select').getBoundingClientRect().top}));
   await trigger.click();
   const frames=await page.evaluate(()=>new Promise(resolve=>{
    const samples=[];let count=0;
    const frame=()=>{const menu=document.querySelector('#atelier-list-archive-select');samples.push({y:scrollY,right:document.querySelector('.right').scrollTop,top:document.querySelector('#atelier-archive-select').getBoundingClientRect().top,menuTop:menu.getBoundingClientRect().top,transform:getComputedStyle(menu).transform});if(++count<16)requestAnimationFrame(frame);else resolve(samples);};requestAnimationFrame(frame);
   }));
   for(const frame of frames){assert.ok(Math.abs(frame.y-before.y)<1);assert.ok(Math.abs(frame.right-before.right)<1);assert.ok(Math.abs(frame.top-before.top)<1);assert.equal(frame.transform,'none');assert.ok(Math.abs(frame.menuTop-frames[0].menuTop)<1);}
   await page.locator('#atelier-archive-select').press('End');
   assert.equal(await page.evaluate(()=>scrollY),before.y);
   assert.equal(await page.locator('.right').evaluate(el=>el.scrollTop),before.right);
   await trigger.press('Escape');
  }
  await page.setViewportSize({width:1440,height:1000});await page.locator('#category-masters').click();await page.waitForTimeout(220);
  const style=await page.locator('#category-masters').evaluate(el=>({color:getComputedStyle(el).backgroundColor,border:getComputedStyle(el).borderWidth}));
  assert.equal(style.border,'0px');assert.equal(style.color,await page.locator('.mode-segment .selected').evaluate(el=>getComputedStyle(el).backgroundColor));
  const search=await page.locator('#filter-collection').boundingBox(),packs=await page.locator('#atelier-archive-select').boundingBox();
  assert.ok(Math.abs(search.width/(search.width+packs.width)-.6)<.01);assert.match(await page.locator('#collection-meta').innerText(),/^[\d,]+ 局$/);
  await page.locator('#category-openings').click();await select('london-real-games');assert.equal(await page.locator('#collection-meta').innerText(),'160 局');
  assert.ok(!(await page.locator('#collection').innerText()).includes('?'));
  await page.locator('#collection [data-local]').first().click();
  await page.waitForFunction(()=>document.querySelector('.engine-pv')!==null,null,{timeout:15000});
  assert.ok(parseFloat(await page.locator('.engine-pv').first().evaluate(el=>getComputedStyle(el).fontSize))>=14);
  const color=await page.locator('#engine-name').evaluate(el=>getComputedStyle(el).color);
  await page.locator('#analysis-toggle').click();await page.waitForTimeout(180);
  assert.notEqual(await page.locator('#engine-name').evaluate(el=>getComputedStyle(el).color),color);
  assert.deepEqual(errors,[]);
  await page.screenshot({path:path.join(output,'refined-library-desktop.png')});
  fs.writeFileSync(path.join(output,'library-refinements-result.json'),JSON.stringify({passed:true,openingGames:960,londonGames:160,legacyRecordsPreserved:true,pageErrors:errors},null,2));
  console.log('PASS: stable dropdown opening/keyboard scrolling, themed categories, 3/5 search width, named London games, readable analysis and dimmed paused engine');
 }catch(error){await page.screenshot({path:path.join(output,'library-refinements-failure.png'),fullPage:true});throw error;}
 finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
