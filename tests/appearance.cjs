const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const output=path.resolve(__dirname,'../test-results');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 const select=async(id,value)=>{await page.locator(`#atelier-${id} .atelier-select-trigger`).click();await page.locator(`#atelier-list-${id} [data-value="${value}"]`).click();};
 const move=async(from,to,plies)=>{await page.locator(`#board [data-square="${from}"]`).click();await page.locator(`#board [data-square="${to}"]`).click();await page.waitForFunction(n=>document.querySelectorAll('#movelist [data-ply]').length===n,plies);};
 const position=()=>page.locator('#board .square').evaluateAll(cells=>cells.map(cell=>[cell.dataset.square,cell.querySelector(':scope > .piece:not(.appearance-ghost) .piece-visual')?.dataset.piece||'']));
 const appearanceDone=()=>page.waitForFunction(()=>!document.querySelector('.appearance-ghost')&&[...document.querySelectorAll('#board .piece')].every(node=>node.getAnimations().length===0));
 try{
  await page.goto(process.env.CHESS_TEST_URL||'http://127.0.0.1:18765');
  await page.waitForFunction(()=>document.querySelector('#collection').getAttribute('aria-busy')==='false');
  await page.waitForFunction(()=>document.querySelectorAll('#board .asset-ready').length===32);
  await page.locator('#flip').click();
  await page.waitForFunction(()=>!document.querySelector('#board.is-opening'));
  assert.equal(await page.locator('#board .piece-visual:not(.asset-ready)').count(),0);
  assert.equal(await page.locator('#board .piece').count(),32);
  await page.locator('#flip').click();
  await page.waitForFunction(()=>!document.querySelector('#board.is-opening'));
  await page.locator('#fileinput').setInputFiles({name:'appearance.pgn',mimeType:'application/x-chess-pgn',buffer:Buffer.from('[Event "Appearance"]\n[Result "*"]\n\n1. e4 e5 2. Nf3 Nc6 *')});
  await page.locator('#collection [data-local]').first().click();await page.locator('#last').click();await page.waitForFunction(()=>!document.querySelector('#board.is-opening')&&!document.querySelector('.floating-piece'));
  const original=await position(),notation=await page.locator('#movelist').innerText();
  await page.locator('#settings-toggle').click();
  let releaseSage;const sageReady=new Promise(resolve=>releaseSage=resolve);
  await page.route('**/assets/pieces-themed/sage/**',async route=>{await sageReady;await route.continue();});
  const before=await page.locator('body').evaluate(el=>getComputedStyle(el).backgroundColor);
  const colorsPromise=page.evaluate(()=>new Promise(resolve=>{const colors=[];const tick=()=>{colors.push(getComputedStyle(document.body).backgroundColor);if(colors.length<90)requestAnimationFrame(tick);else resolve(colors);};requestAnimationFrame(tick);}));
  colorsPromise.catch(()=>{});
  await select('theme','sage');
  assert.equal(await page.locator('html').getAttribute('data-theme'),'walnut','keep the previous decoded set visible while preparing new art');
  assert.equal(await page.locator('#board .piece:not(.appearance-ghost)').count(),32);
  releaseSage();
  await page.waitForFunction(()=>document.documentElement.dataset.theme==='sage');
  const colors=await colorsPromise;await appearanceDone();
  const after=await page.locator('body').evaluate(el=>getComputedStyle(el).backgroundColor);
  assert.notEqual(before,after);assert.ok(new Set(colors).size>=3,'theme colors must interpolate rather than jump');
  assert.deepEqual(await position(),original);assert.equal(await page.locator('#movelist').innerText(),notation);
  await page.unroute('**/assets/pieces-themed/sage/**');
  // Sample every animation frame, including delayed asset preparation and the style change.
  await page.evaluate(()=>{window.styleDurations=[];const original=Element.prototype.animate;Element.prototype.animate=function(frames,options){if(this.classList.contains('piece'))window.styleDurations.push(options.duration);return original.call(this,frames,options);};});
  const sampled=page.evaluate(()=>new Promise(resolve=>{
   const frames=[];let count=0;
   const tick=()=>{
    const cells=[...document.querySelectorAll('#board .square')];let centerError=0,minScale=1,minVisibility=1,incomingScale=1,oldScale=0;
    for(const cell of cells){const pieces=[...cell.querySelectorAll(':scope > .piece')];if(pieces.length)minVisibility=Math.min(minVisibility,1-pieces.reduce((remaining,piece)=>remaining*(1-Number(getComputedStyle(piece).opacity)),1));}
    for(const cell of cells)for(const piece of cell.querySelectorAll(':scope > .piece')){
     const box=cell.getBoundingClientRect(),art=piece.getBoundingClientRect();
     centerError=Math.max(centerError,Math.abs(box.x+box.width/2-art.x-art.width/2),Math.abs(box.y+box.height/2-art.y-art.height/2));
     minScale=Math.min(minScale,art.width/box.width);
     if(!piece.classList.contains('appearance-ghost'))incomingScale=Math.min(incomingScale,art.width/box.width);
     else oldScale=Math.max(oldScale,art.width/box.width);
    }
    frames.push({pieces:document.querySelectorAll('#board .square > .piece:not(.appearance-ghost)').length,cold:document.querySelectorAll('#board .piece-visual:not(.asset-ready)').length,centerError,minScale,minVisibility,incomingScale,oldScale});
    if(++count<105)requestAnimationFrame(tick);else resolve(frames);
   };requestAnimationFrame(tick);
  }));
  await select('piece-style','maestro');
  const frames=await sampled;await appearanceDone();
  assert.ok(frames.every(frame=>frame.pieces===32&&frame.cold===0),'no missing piece nodes or fallback shape during replacement');
  assert.ok(frames.every(frame=>frame.oldScale<.01||frame.incomingScale<.01),'old art must retract completely before the new art grows');
  assert.ok(frames.every(frame=>frame.centerError<.6),'scale only around each square center');
  assert.ok(frames.some(frame=>frame.oldScale>.1&&frame.oldScale<.8&&frame.incomingScale<.01),'old art visibly shrinks first');
  assert.ok(frames.some(frame=>frame.oldScale<.01&&frame.incomingScale>.1&&frame.incomingScale<.8),'new art then grows from the center');
  assert.deepEqual(await position(),original);assert.equal(await page.locator('#movelist').innerText(),notation);
  assert.ok(await page.evaluate(()=>window.styleDurations.length>=64&&window.styleDurations.every(duration=>duration===480)),'all old/new actual decoded nodes use the shared 480ms timeline');
  console.log('PASS: decoded assets swap without fallback; themes interpolate; old pieces shrink to zero before new pieces grow, preserving position/history');
  // Fast successive selections must commit the most recent theme AND style.
  await page.route('**/assets/pieces-themed/slate/**',async route=>{await new Promise(resolve=>setTimeout(resolve,220));await route.continue();});
  await select('theme','slate');await select('piece-style','cburnett');await select('theme','blush');
  await page.waitForFunction(()=>document.documentElement.dataset.theme==='blush'&&document.documentElement.dataset.pieceStyle==='cburnett');
  await page.waitForTimeout(500);await appearanceDone();
  assert.equal(await page.locator('html').getAttribute('data-theme'),'blush');
  assert.ok(await page.locator('#board .piece-art-img').evaluateAll(images=>images.every(image=>image.src.includes('/blush/cburnett/'))));
  assert.deepEqual(await position(),original);await page.unroute('**/assets/pieces-themed/slate/**');
  await page.locator('#settings-close').click();await page.locator('#flip').click();
  await page.locator('#settings-toggle').click();await select('piece-style','maestro');await appearanceDone();
  assert.equal((await position())[0][0],'h1');assert.equal(await page.locator('#movelist').innerText(),notation);
  await page.emulateMedia({reducedMotion:'reduce'});await select('theme','mist');await select('piece-style','mpchess');
  await page.waitForFunction(()=>document.documentElement.dataset.theme==='mist'&&document.documentElement.dataset.pieceStyle==='mpchess');
  assert.equal(await page.locator('#board .appearance-ghost').count(),0);
  assert.ok(await page.locator('#board .piece').evaluateAll(nodes=>nodes.every(node=>node.getAnimations().length===0)));
  assert.ok(parseFloat(await page.locator('html').evaluate(el=>getComputedStyle(el).transitionDuration))<=.001);
  await page.emulateMedia({reducedMotion:'no-preference'});await page.locator('#settings-close').click();
  // Changing appearance during a real computer response must not cancel/reset the game.
  await page.locator('[data-play-mode="book"]').click();await move('e2','e4',1);
  await page.locator('#settings-toggle').click();await select('theme','oat');await select('piece-style','cburnett');await page.locator('#settings-close').click();
  await page.waitForFunction(()=>document.querySelectorAll('#movelist [data-ply]').length===2,null,{timeout:15000});
  await appearanceDone();assert.match(await page.locator('#movelist').innerText(),/e4/);
  await page.locator('.board-block').screenshot({path:path.join(output,'appearance-in-game.png')});
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(output,'appearance-result.json'),JSON.stringify({passed:true,frames:frames.length,maxCenterDrift:Math.max(...frames.map(frame=>frame.centerError)),minimumScale:Math.min(...frames.map(frame=>frame.minScale)),minimumVisibility:Math.min(...frames.map(frame=>frame.minVisibility)),noFallbackFrames:true,historyPreserved:true,computerContinues:true,reducedMotion:true,pageErrors:errors},null,2));
  console.log('PASS: rapid selections, flipped boards, reduced motion and changing appearance while Stockfish responds');
 }catch(error){await page.screenshot({path:path.join(output,'appearance-failure.png'),fullPage:true});throw error;}
 finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
