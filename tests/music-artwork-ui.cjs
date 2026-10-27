const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.CHESS_TEST_URL||'http://127.0.0.1:18865/dist/';
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  for(const tablet of [false,true]){
   const context=await browser.newContext({viewport:tablet?{width:800,height:1280}:{width:1440,height:1000},isMobile:tablet,hasTouch:tablet});
   const page=await context.newPage(),errors=[],fonts=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/fonts\.(googleapis|gstatic)/.test(r.url()))fonts.push(r.url());});
   await context.route('**/*',r=>r.request().url().startsWith(base)&&!r.request().url().includes('/vendor/stockfish/')?r.continue():r.abort());
   await page.goto(base);await page.locator('#music-toggle').click();await page.locator('[data-era=baroque]').click();
   await page.waitForFunction(()=>navigator.mediaSession.metadata?.artwork.length===2&&!document.querySelector('#music-audio').paused);
   let previous='';
   const themes=await page.locator('#theme option').evaluateAll(options=>options.map(o=>o.value));
   for(const theme of themes){
    await page.evaluate(theme=>{const s=document.querySelector('#theme');s.value=theme;s.dispatchEvent(new Event('change',{bubbles:true}));},theme);
    await page.waitForFunction(theme=>document.documentElement.dataset.theme===theme,theme);
    await page.waitForTimeout(800);
    const art=await page.evaluate(async()=>{
     const data=navigator.mediaSession.metadata.artwork[0],image=new Image();image.src=data.src;await image.decode();
     const canvas=document.createElement('canvas');canvas.width=canvas.height=512;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
     const bg=[...ctx.getImageData(2,2,1,1).data],pixels=ctx.getImageData(120,100,270,310).data;let light=0;
     for(let i=0;i<pixels.length;i+=4)if(pixels[i]+pixels[i+1]+pixels[i+2]>660)light++;
     const probe=document.createElement('span');probe.style.color='var(--accent)';document.body.append(probe);const accent=getComputedStyle(probe).color;probe.remove();
     return {src:data.src,sizes:data.sizes,type:data.type,width:image.naturalWidth,height:image.naturalHeight,bg,light,webMatchesTheme:getComputedStyle(document.querySelector('.now-art')).backgroundImage.includes(accent)};
    });
    assert.equal(art.width,512);assert.equal(art.height,512);assert.equal(art.sizes,'512x512');assert.equal(art.type,'image/png');assert.ok(art.light>100,'cover has a clearly visible light monogram');assert.ok(art.bg.slice(0,3).reduce((a,b)=>a+b)<600,'theme background is darker than system white fallback');
    assert.equal(art.webMatchesTheme,true,'web and system covers share the dark theme background');
    if(previous)assert.notEqual(art.src,previous,'system artwork updates with page theme');previous=art.src;
   }
   await page.locator('#music-next').click();await page.waitForFunction(()=>!document.querySelector('#music-audio').paused);
   assert.equal(await page.locator('#music-title').innerText(),await page.evaluate(()=>navigator.mediaSession.metadata.title));
   assert.deepEqual(fonts,[]);assert.deepEqual(errors,[]);
   await page.locator('#music-panel').screenshot({path:'test-results/'+(tablet?'tablet':'desktop')+'-music-artwork.png'});
   const png=await page.evaluate(()=>navigator.mediaSession.metadata.artwork[0].src.split(',')[1]);fs.writeFileSync('test-results/system-monogram.png',Buffer.from(png,'base64'));
   console.log('PASS: '+(tablet?'Android tablet-size':'desktop')+' native Media Session PNG artwork, all themes, no Google Fonts or engine fetch, readable monogram and track metadata');await context.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
