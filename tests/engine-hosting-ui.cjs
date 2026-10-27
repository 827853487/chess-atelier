// Real WASM integration: no third-party access, slow/broken first download,
// two independent workers sharing assets, and persistent cache across visits.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
const base=process.env.CHESS_TEST_URL||'http://127.0.0.1:18865/dist/';
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true,args:['--no-proxy-server']});
 try{
  for(const embedded of [true,false])for(const mobile of [false,true]){
   const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile});
   await context.addInitScript(()=>{
    const NativeWorker=window.Worker;window.__readyEngineWorkers=0;
    window.Worker=class extends NativeWorker{
     constructor(...args){super(...args);this.addEventListener('message',event=>{if(event.data==='readyok')window.__readyEngineWorkers++;});}
    };
   });
   const page=await context.newPage(),errors=[],engineRequests=[];let wasmAttempts=0,denyEngine=embedded;
   page.on('pageerror',error=>errors.push(error.message));
   await context.route('**/*',async route=>{
    const url=route.request().url();
    if(!url.startsWith(base))return route.abort();
    if(!embedded&&route.request().isNavigationRequest()){
     const response=await route.fetch(),body=(await response.text()).replace(/<script type="application\/json" id="stockfish-payload">[\s\S]*?<\/script>/,'');
     return route.fulfill({response,body});
    }
    if(url.includes('/api/'))throw Error('Static site attempted an API request: '+url);
    if(url.includes('/vendor/stockfish/')){
     engineRequests.push(url);
     if(denyEngine)return route.abort();
     if(url.includes('.wasm')){
      wasmAttempts++;
      if(wasmAttempts===1)return route.fulfill({status:503,body:'temporary failure'});
      // Beyond the old 12 second deadline. Slow loading must not abandon play.
      await new Promise(resolve=>setTimeout(resolve,13000));
      const response=await route.fetch();return route.fulfill({response,headers:{...response.headers(),'content-type':'text/plain'}});
     }
    }
    return route.continue();
   });
   const analyzed=()=>page.waitForFunction(()=>document.querySelectorAll('.engine-pv').length===3&&document.querySelector('#engine-probability').dataset.pending==='false',null,{timeout:90000});
   await page.goto(base);await analyzed();assert.equal(wasmAttempts,embedded?0:2);
   await page.waitForFunction(()=>window.__readyEngineWorkers===2);
   assert.equal(engineRequests.length,embedded?0:3,'embedded engine needs no download; legacy workers share one asset preparation');
   assert.equal(await page.locator('#retry-engine').isVisible(),false);
   // A later visit has a new JS memory heap. Prevent every engine asset request:
   // the Cache Storage copy must be sufficient to compile both workers again.
   denyEngine=true;engineRequests.length=0;await page.reload();await analyzed();
   await page.waitForFunction(()=>window.__readyEngineWorkers===2);
   assert.equal(engineRequests.length,0,'persistent engine cache survives navigation');
   await page.locator('[data-play-mode=book]').click();
   await page.waitForFunction(()=>!document.querySelector('#board.is-opening'));
   await page.locator('[data-square=e2]').click();await page.locator('[data-square=e4]').click();
   await page.waitForFunction(()=>document.querySelectorAll('#movelist [data-ply]').length===2,null,{timeout:30000});
   assert.deepEqual(errors,[]);await context.close();
   console.log('PASS: '+(embedded?'embedded (all engine downloads blocked)':'legacy (13s cold load, retry, normalized MIME)')+' '+(mobile?'mobile':'desktop')+', both engines prewarmed, persistent cache and real AI reply (proxy disabled)');
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
