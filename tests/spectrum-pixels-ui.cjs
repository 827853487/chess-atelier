const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const assert=require('node:assert/strict');
const base=process.env.CHESS_TEST_URL||'http://127.0.0.1:18865/dist/';
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  for(const ratio of [1,1.25,1.5,2,3]){
   const context=await browser.newContext({viewport:{width:800,height:1100},deviceScaleFactor:ratio,isMobile:true,hasTouch:true});await context.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());
   const page=await context.newPage();await page.goto(base);await page.locator('#music-toggle').click();await page.waitForTimeout(350);
   const bars=await page.locator('.wave-bars i').evaluateAll(nodes=>nodes.map(n=>{const b=n.getBoundingClientRect();return {left:b.left*devicePixelRatio,width:b.width*devicePixelRatio};}));
   assert.equal(bars.length,5);assert.ok(bars.every(b=>Math.abs(b.width-Math.round(b.width))<.08&&Math.abs(b.left-Math.round(b.left))<.08),JSON.stringify({ratio,bars}));
   assert.ok(Math.max(...bars.map(b=>b.width))-Math.min(...bars.map(b=>b.width))<.03);assert.ok(bars.slice(1).every((b,i)=>b.left>=bars[i].left+bars[i].width+2));
   await page.locator('#music-panel').screenshot({path:`test-results/music-pixels-${ratio}.png`});await context.close();
  }
  console.log('PASS: five equal bars snapped to physical pixels at DPR 1/1.25/1.5/2/3');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
