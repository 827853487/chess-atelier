const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const base=process.env.CHESS_TEST_URL||'http://127.0.0.1:18765';
const output=path.resolve(__dirname,'../test-results');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await context.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
 const ready=()=>page.waitForFunction(()=>document.querySelectorAll('#board .asset-ready').length===32&&document.querySelector('#atelier-piece-style'));
 const select=async(id,value)=>{await page.locator(`#atelier-${id} .atelier-select-trigger`).click();await page.locator(`#atelier-list-${id} [data-value="${value}"]`).click();};
 try{
  await page.goto(base);await ready();
  assert.equal(await page.locator('html').getAttribute('data-piece-style'),'rhosgfx');
  assert.equal(await page.locator('#piece-style').inputValue(),'rhosgfx');
  assert.equal(await page.locator('#atelier-piece-style .atelier-selected-label').innerText(),'经典');
  await page.locator('#analysis-toggle').click();await page.locator('#settings-toggle').click();
  const themes=[];
  for(const theme of ['walnut','sage','oat','blush','slate','mist']){
   await select('theme',theme);
   await page.waitForFunction(t=>document.documentElement.dataset.theme===t&&!document.querySelector('.appearance-ghost'),theme);
   const palette=await page.evaluate(async theme=>{
    const css=getComputedStyle(document.documentElement),svg=await (await fetch(`./assets/pieces-themed/${theme}/rhosgfx/wP.svg?v=2`)).text();
    const shape=new DOMParser().parseFromString(svg,'image/svg+xml').querySelector('path');
    const image=new Image();image.src=`./assets/pieces-themed/${theme}/rhosgfx/wP.svg?v=2`;await image.decode();
    const canvas=document.createElement('canvas');canvas.width=canvas.height=100;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,100,100);
    return {theme,light:css.getPropertyValue('--light').trim(),dark:css.getPropertyValue('--dark').trim(),fill:shape.getAttribute('fill'),outline:shape.getAttribute('stroke'),bodyPixel:[...ctx.getImageData(50,60,1,1).data]};
   },theme);
   assert.ok(palette.bodyPixel.every((value,index)=>index===3?value===255:value>=245),'pawn body must be opaque near-white, not hollow');
   const luminance=hex=>{const c=hex.match(/\w\w/g).map(x=>parseInt(x,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;};
   const a=luminance(palette.fill.slice(1)),b=luminance(palette.outline.slice(1));palette.fillOutlineContrast=(a+.05)/(b+.05);
   assert.ok(palette.fillOutlineContrast>=7,'white fill must have a distinct dark contour');
   themes.push(palette);
  }
  await select('piece-style','fantasy');
  await page.waitForFunction(()=>document.documentElement.dataset.pieceStyle==='fantasy');
  await page.reload();await ready();
  assert.equal(await page.locator('html').getAttribute('data-piece-style'),'fantasy','preserve a previously selected style');
  await page.evaluate(()=>localStorage.setItem('ChessAtelierPieceStyleV2','invalid-style'));
  await page.reload();await ready();assert.equal(await page.locator('html').getAttribute('data-piece-style'),'rhosgfx','invalid settings fall back to classic');
  const gallery=await context.newPage({viewport:{width:920,height:1080}});
  await gallery.setContent(`<base href="${base}/"><style>body{margin:20px;background:#eeeae5;color:#242720;font:16px system-ui}main{display:grid;grid-template-columns:1fr 1fr;gap:16px}.card{padding:14px;background:#fff;border-radius:12px}h2{font-size:17px;margin:0 0 8px}.row{display:flex}.row img{width:64px;height:64px}</style><main>${themes.map(t=>`<section class="card"><h2>${t.theme} · 经典</h2>${['w','b'].map(c=>['light','dark'].map(color=>`<div class="row" style="background:${t[color]}">${[...'PNBRQK'].map(p=>`<img src="assets/pieces-themed/${t.theme}/rhosgfx/${c+p}.svg?v=2">`).join('')}</div>`).join('')).join('')}</section>`).join('')}</main>`);
  await gallery.locator('img').evaluateAll(images=>Promise.all(images.map(image=>image.decode())));
  await gallery.screenshot({path:path.join(output,'classic-six-themes.png'),fullPage:true});
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(output,'classic-pieces-result.json'),JSON.stringify({passed:true,default:'rhosgfx',savedChoicePreserved:true,invalidChoiceFallback:true,themes,pageErrors:errors},null,2));
  console.log('PASS: classic default, preserved preferences, opaque white body and dark contours across all six themes');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
