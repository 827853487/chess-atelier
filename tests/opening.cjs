const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const base=process.env.CHESS_TEST_URL||'http://127.0.0.1:18765',output=path.resolve(__dirname,'../test-results');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 const idle=()=>page.waitForFunction(()=>!document.querySelector('#board.is-opening')&&!document.querySelector('.floating-piece'));
 const move=async(a,b)=>{await page.locator(`#board [data-square=${a}]`).click();await page.locator(`#board [data-square=${b}]`).click();await idle();};
 const select=async(id,value)=>{await page.locator(`#atelier-${id} .atelier-select-trigger`).click();await page.locator(`#atelier-list-${id} [data-value="${value}"]`).click();};
 const initial=async()=>{
  assert.equal(await page.locator('#board > .square > .piece').count(),32);
  assert.equal(await page.locator('#movelist [data-ply]').count(),0);
  assert.equal(await page.locator('[data-square=e1] .piece-visual').getAttribute('data-piece'),'wk');
  assert.equal(await page.locator('[data-square=e8] .piece-visual').getAttribute('data-piece'),'bk');
  assert.equal(await page.locator('#board .piece-visual:not(.asset-ready)').count(),0);
 };
 try{
  await page.goto(base);await page.waitForFunction(()=>document.querySelector('#collection').getAttribute('aria-busy')==='false');await page.locator('#analysis-toggle').click();
  await move('e2','e4');await move('e7','e5');await move('g1','f3');
  const sampled=page.evaluate(()=>new Promise(resolve=>{
   const frames=[],started=performance.now();
   const tick=()=>{
    const board=document.querySelector('#board'),layer=board.querySelector('.opening-layer'),box=board.getBoundingClientRect();
    let drift=0,scale=null;if(layer){const b=layer.getBoundingClientRect();scale=b.width/box.width;drift=Math.max(Math.abs(b.x+b.width/2-box.x-box.width/2),Math.abs(b.y+b.height/2-box.y-box.height/2));}
    let overlaps=0;const nodes=[...board.querySelectorAll(':scope > .square > .piece')].filter(n=>Number(getComputedStyle(n).opacity)>.2);
    for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){const a=nodes[i].getBoundingClientRect(),b=nodes[j].getBoundingClientRect();if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>.6&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>.6)overlaps++;}
    frames.push({ms:performance.now()-started,active:board.classList.contains('is-opening'),scale,drift,overlaps});
    if(performance.now()-started<1100)requestAnimationFrame(tick);else resolve(frames);
   };requestAnimationFrame(tick);
  }));
  await page.locator('#reset').click();const frames=await sampled;await idle();await initial();
  const active=frames.filter(f=>f.active);assert.ok(active.length>=8);assert.ok(active.every(f=>f.drift<.6&&f.overlaps===0),'centered contraction and non-overlapping entrances');
  assert.ok(active.some(f=>f.scale!==null&&f.scale<.12),'old board converges to the center');
  assert.ok(active.at(-1).ms-active[0].ms<900,'opening stays below a second');
  // A three-piece study position, including a flipped orientation, starts identically.
  const pgn='[Event "Opening transition position"]\n[SetUp "1"]\n[FEN "7k/8/8/8/8/8/8/KR6 w - - 0 1"]\n[Result "*"]\n\n1. Ka2 *';
  await page.locator('#fileinput').setInputFiles({name:'position.pgn',mimeType:'application/x-chess-pgn',buffer:Buffer.from(pgn)});
  await page.locator('#collection [data-local]').first().click();await page.locator('#last').click();await idle();
  assert.equal(await page.locator('#board > .square > .piece').count(),3);await page.locator('#flip').click();
  await page.locator('#reset').click();await idle();await initial();assert.equal(await page.locator('#board > .square').first().getAttribute('data-square'),'h1');
  await page.locator('#reset').click();await page.locator('#reset').click();await idle();await initial();
  // An intentional board interaction finishes the intro and remains usable immediately.
  await page.locator('#reset').click();await move('e2','e4');assert.equal(await page.locator('#movelist [data-ply]').count(),1);
  await page.locator('#settings-toggle').click();await select('piece-style','chessnut');
  await page.waitForFunction(()=>document.documentElement.dataset.pieceStyle==='chessnut'&&document.querySelector('.appearance-ghost'));
  assert.equal(await page.locator('#board > .square > .piece:not(.appearance-ghost)').first().evaluate(n=>n.getAnimations()[0].effect.getTiming().duration),600);
  await page.waitForFunction(()=>!document.querySelector('.appearance-ghost'));await page.locator('#settings-close').click();
  // Computer-first games wait for the opening instead of cancelling or overlapping it.
  let requestDuringOpening=false;
  await page.route('**/api/play',async route=>{requestDuringOpening=await page.locator('#board.is-opening').count()>0;await route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,uci:'e2e4'})});});
  await page.locator('[data-play-mode=book]').click();await idle();await select('side','b');
  await page.waitForFunction(()=>document.querySelectorAll('#movelist [data-ply]').length===1);await idle();assert.equal(requestDuringOpening,false);
  assert.equal(await page.locator('#board > .square').first().getAttribute('data-square'),'h1');
  await page.locator('[data-play-mode=free]').click();await idle();
  await page.emulateMedia({reducedMotion:'reduce'});await page.locator('#reset').click();assert.equal(await page.locator('.opening-layer').count(),0);await initial();
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'opening-result.json'),JSON.stringify({passed:true,frameCount:frames.length,noOverlaps:true,maxCenterDrift:Math.max(...active.map(f=>f.drift)),threePiecePosition:true,flipped:true,rapidRestart:true,interruptible:true,styleMs:600,computerWaits:true,reducedMotion:true,pageErrors:errors},null,2));
  console.log('PASS: centered opening from arbitrary positions, staggered non-overlapping entry, flipped seats, rapid restarts, 600 ms styles and computer synchronization');
 }catch(error){await page.screenshot({path:path.join(output,'opening-failure.png'),fullPage:true});throw error;}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
