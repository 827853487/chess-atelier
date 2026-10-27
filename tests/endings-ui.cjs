const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true}),checks=[];
 try{for(const width of [1440,390,320]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/analyze',r=>r.abort());
  await page.goto(process.env.CHESS_TEST_URL||'http://127.0.0.1:18765');
  const idle=async()=>{await page.waitForFunction(()=>!document.querySelector('#board.is-opening,.floating-piece,.appearance-ghost'));await page.waitForTimeout(70);};await idle();
  const layout=await page.evaluate(()=>{const box=s=>document.querySelector(s).getBoundingClientRect(),mode=box('#mode-segment'),bar=box('.play-mode-bar'),badge=box('#side-badge'),controls=box('.engine-controls'),toolbar=box('.engine-toolbar');return {center:Math.abs((mode.left+mode.right-bar.left-bar.right)/2),statusGap:badge.left-mode.right,right:Math.abs(toolbar.right-controls.right),overflow:document.documentElement.scrollWidth>innerWidth,font:parseFloat(getComputedStyle(document.querySelector('#side-badge')).fontSize)};});
  assert.ok(layout.center<1&&layout.right<2&&layout.statusGap>=3&&!layout.overflow,JSON.stringify({width,...layout}));assert.ok(layout.font>=13);
  assert.equal(await page.locator('#music-toggle .music-status-icon').isVisible(),true);
  const actions=await page.locator('.board-actions').evaluate(n=>{const row=n.getBoundingClientRect(),buttons=[...n.children].filter(x=>getComputedStyle(x).display!=='none').map(x=>x.getBoundingClientRect());return {count:buttons.length,gap:Math.abs((buttons[0].left+buttons.at(-1).right-row.left-row.right)/2),widths:buttons.map(x=>x.width)};});
  if(width<701){assert.equal(actions.count,3);assert.ok(actions.gap<1);assert.ok(Math.max(...actions.widths)-Math.min(...actions.widths)<1);}
  assert.match(await page.locator('#bot-level option[value="1"]').textContent(),/1300/);assert.match(await page.locator('#bot-level option[value="6"]').textContent(),/3000/);
  await page.locator('#next').click();await idle();
  for(const cls of ['last-from','last-to'])assert.match(await page.locator('#board > .'+cls).evaluate(n=>getComputedStyle(n).boxShadow),/inset/);
  await page.locator('[data-play-mode=book]').click();await idle();await page.locator('[data-square=e2]').click();
  const selected=await page.locator('#board > .selected').evaluate(n=>({shadow:getComputedStyle(n).boxShadow,before:getComputedStyle(n,'::before').content,after:getComputedStyle(n,'::after').content,background:getComputedStyle(n).backgroundColor,normal:getComputedStyle(document.querySelector('[data-square=c2]')).backgroundColor}));
  assert.match(selected.shadow,/inset/);assert.equal(selected.before,'none');assert.equal(selected.after,'none');assert.equal(selected.background,selected.normal);
  await page.locator('[data-play-mode=free]').click();await idle();
  for(const fixture of [{name:'Mate',body:'1. f3 e5 2. g4 Qh4# 0-1',result:'0-1',title:'将死 · 黑方获胜'},{name:'Recorded win',body:'1. e4 e5 1-0',result:'1-0',title:'白方获胜'},{name:'Lesson excerpt',body:'1. d4 d5 *',result:'*',title:'棋谱结束'}]){
   const pgn=`[Event "${fixture.name}"]\n[White "${fixture.name}"]\n[Black "Black"]\n[Result "${fixture.result}"]\n\n${fixture.body}`;
   await page.locator('#fileinput').setInputFiles({name:fixture.name+'.pgn',mimeType:'application/x-chess-pgn',buffer:Buffer.from(pgn)});
   await page.locator('#collection .library-open').filter({hasText:fixture.name}).first().click();await idle();await page.locator('#last').click();await idle();
   assert.equal(await page.locator('#game-result').count(),0);assert.equal(await page.locator('#side-badge').innerText(),fixture.title.replace(/^将死 · /,''));assert.equal(await page.locator('#status').innerText(),fixture.title);assert.ok(await page.locator('#side-badge').evaluate(n=>Number(getComputedStyle(n).fontWeight)===400));
   if(fixture.name==='Mate')await page.locator('.board-block').screenshot({path:path.resolve(__dirname,`../test-results/quiet-result-${width}.png`)});
   await page.locator('#flip').click();await idle();assert.equal(await page.locator('#side-badge').innerText(),fixture.title.replace(/^将死 · /,''));
   await page.locator('#prev').click();await idle();assert.equal(await page.locator('#game-result').count(),0);assert.equal(await page.locator('#side-badge').getAttribute('class'),'side-badge');
  }
  await page.locator('#settings-toggle').click();await page.waitForTimeout(260);const arrows=await page.locator('.source-external').evaluateAll(ns=>ns.map(n=>{const a=n.getBoundingClientRect(),p=n.parentElement.getBoundingClientRect();return {width:a.width,height:a.height,center:Math.abs((a.top+a.bottom-p.top-p.bottom)/2),tag:n.tagName};}));
  assert.equal(arrows.length,3);assert.ok(arrows.every(a=>Math.abs(a.width-10)<.1&&Math.abs(a.height-10)<.1&&a.center<1),JSON.stringify(arrows));await page.locator('#settings-dialog').screenshot({path:path.resolve(__dirname,`../test-results/endings-settings-${width}.png`)});await page.locator('#settings-close').click();
  checks.push({width,layout,selected,arrows,errors});assert.deepEqual(errors,[]);await page.close();
 }
 fs.writeFileSync(path.resolve(__dirname,'../test-results/endings-ui-result.json'),JSON.stringify({passed:true,checks},null,2));console.log('PASS: three viewport widths, centered modes/right analysis controls, yellow outlines/quiet selection, mate/result/excerpt endings, source SVG arrows');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
