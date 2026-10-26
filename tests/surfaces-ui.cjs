const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6R2kAAAAASUVORK5CYII=','base64');
const sync=n=>Buffer.from([(n>>21)&127,(n>>14)&127,(n>>7)&127,n&127]);
const data=Buffer.concat([Buffer.from([0]),Buffer.from('image/png\0'),Buffer.from([3,0]),png]),size=Buffer.alloc(4);size.writeUInt32BE(data.length);const frame=Buffer.concat([Buffer.from('APIC'),size,Buffer.alloc(2),data]),cover=Buffer.concat([Buffer.from([73,68,51,3,0,0]),sync(frame.length),frame]);
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true}),results=[];
 try{for(const width of [1440,390]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/analyze',r=>r.abort());
  await page.route('**/assets/music/*.mp3',r=>r.request().headers().range==='bytes=0-2097151'?r.fulfill({status:206,contentType:'audio/mpeg',body:cover}):r.continue());
  await page.goto(process.env.CHESS_TEST_URL||'http://127.0.0.1:18765');await page.waitForFunction(()=>document.querySelector('#collection').getAttribute('aria-busy')==='false');
  const idle=()=>page.waitForFunction(()=>!document.querySelector('.floating-piece,.appearance-ghost,#board.is-opening'));
  const fade=selector=>page.locator(selector).evaluate(n=>({visible:!n.hidden&&getComputedStyle(n).display!=='none',opacity:Number(getComputedStyle(n).opacity),state:n.dataset.surfaceState}));
  await page.locator('#music-toggle').click();await page.waitForTimeout(210);assert.equal(await page.locator('#music-shuffle').count(),0);
  await page.evaluate(()=>document.querySelector('#music-close').click());await page.waitForTimeout(60);const musicFade=await fade('#music-panel');assert.ok(musicFade.visible&&musicFade.opacity>0&&musicFade.opacity<1);
  await page.locator('#music-toggle').click();await page.waitForTimeout(230);assert.equal(await page.locator('#music-panel').isVisible(),true,'reopen cancels a pending exit');
  await page.locator('[data-era=baroque]').click();await page.waitForFunction(()=>!document.querySelector('#music-audio').paused);await page.waitForSelector('.now-art img');await page.waitForTimeout(220);
  assert.equal(await page.locator('.now-art img').last().evaluate(n=>n.complete&&n.naturalWidth>0),true,'actual ID3 cover is decoded and shown');
  const bars=await page.locator('.wave-bars i').evaluateAll(ns=>ns.map(n=>({width:getComputedStyle(n).width,round:parseFloat(getComputedStyle(n).borderRadius)})));assert.equal(bars.length,5);assert.ok(bars.every(n=>n.width==='3px'&&n.round>=3));
  await page.locator('#music-panel').screenshot({path:path.resolve(__dirname,`../test-results/surfaces-player-${width}.png`)});
  await page.evaluate(()=>document.querySelector('.board-heading').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true})));await page.waitForTimeout(60);assert.ok((await fade('#music-panel')).opacity<1);await page.waitForTimeout(180);assert.equal(await page.locator('#music-panel').isVisible(),false);
  await page.locator('#settings-toggle').click();await page.waitForTimeout(220);await page.locator('#atelier-move-hints .atelier-select-trigger').click();await page.waitForTimeout(210);
  await page.locator('#settings-dialog .settings-head strong').click();await page.waitForTimeout(60);const menuFade=await fade('#atelier-list-move-hints');assert.ok(menuFade.visible&&menuFade.opacity>0&&menuFade.opacity<1);await page.waitForTimeout(160);
  await page.evaluate(()=>document.querySelector('#settings-close').click());await page.waitForTimeout(55);const settingsFade=await fade('#settings-dialog');assert.ok(settingsFade.visible&&settingsFade.opacity>0&&settingsFade.opacity<1);
  await page.locator('#settings-toggle').click();await page.waitForTimeout(230);assert.equal(await page.locator('#settings-dialog').isVisible(),true);
  await page.keyboard.press('Escape');await page.waitForTimeout(230);assert.equal(await page.locator('#settings-dialog').isVisible(),false);
  await page.locator('[data-play-mode=book]').click();await idle();await page.locator('[data-square=e2]').click();
  await page.locator('#settings-toggle').click();await page.waitForTimeout(1000);await page.locator('#atelier-piece-style .atelier-select-trigger').click();await page.waitForTimeout(200);
  const samples=await page.evaluate(()=>new Promise(resolve=>{const started=performance.now(),frames=[];document.querySelector('#atelier-list-piece-style [data-value=maestro]').click();let n=0;function tick(){const old=document.querySelector('.appearance-ghost'),cell=document.querySelector('[data-square=e2]'),piece=cell.querySelector('.appearance-ghost');frames.push({time:performance.now()-started,active:!!old,scale:piece?piece.getBoundingClientRect().width/cell.getBoundingClientRect().width:0,opacity:piece?Number(getComputedStyle(piece).opacity):0});if(++n<45)requestAnimationFrame(tick);else resolve(frames);}requestAnimationFrame(tick);}));
  fs.writeFileSync(path.resolve(__dirname,`../test-results/surface-style-frames-${width}.json`),JSON.stringify(samples));assert.ok(samples.find(f=>f.active)?.time<180,'prepared styles start promptly after selecting an already selected board piece');assert.ok(samples.some(f=>f.scale>.5&&f.opacity<.45&&f.opacity>0),'fade is visible while the old piece is still large');await idle();assert.equal(await page.locator('[data-square=e2] .piece-visual').getAttribute('data-piece'),'wp');
  await page.locator('#settings-close').click();await page.waitForTimeout(200);
  await page.emulateMedia({reducedMotion:'reduce'});await page.locator('#music-toggle').click();await page.locator('#music-toggle').click();assert.equal(await page.locator('#music-panel').isVisible(),false);
  assert.deepEqual(errors,[]);results.push({width,musicFade,menuFade,settingsFade,styleStart:samples.find(f=>f.active)?.time,bars,passed:true});await page.close();
 }
 fs.writeFileSync(path.resolve(__dirname,'../test-results/surfaces-ui-result.json'),JSON.stringify({passed:true,results},null,2));console.log('PASS: reversible panel/dialog/menu exits, Escape and rapid reopen, equal FFT bars, real embedded cover, warm style latency/strong fade and reduced motion');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
