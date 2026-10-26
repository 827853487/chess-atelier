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
  assert.equal(await page.locator('html').getAttribute('data-piece-style'),'cburnett');
  assert.equal(await page.locator('#piece-style').inputValue(),'cburnett');
  assert.equal(await page.locator('#atelier-piece-style .atelier-selected-label').innerText(),'经典');
  assert.deepEqual(await page.locator('#piece-style option').allTextContents(),['经典','拟真','极简','抽象']);
  const revision=new URL(await page.locator('#board .piece-art-img').first().getAttribute('src'),base).searchParams.get('v');
  await page.locator('#analysis-toggle').click();await page.locator('#settings-toggle').click();
  const themes=[];
  for(const style of ['cburnett','maestro','mpchess','totoy']){
   await select('piece-style',style);
   await page.waitForFunction(s=>document.documentElement.dataset.pieceStyle===s&&!document.querySelector('.appearance-ghost'),style);
   for(const theme of ['walnut','sage','oat','blush','slate','mist']){
   await select('theme',theme);
   await page.waitForFunction(t=>document.documentElement.dataset.theme===t&&!document.querySelector('.appearance-ghost'),theme);
   const palette=await page.evaluate(async({theme,style,revision})=>{
    const css=getComputedStyle(document.documentElement),svg=await (await fetch(`./assets/pieces-themed/${theme}/${style}/wP.svg?v=${revision}`)).text();
    const shape=new DOMParser().parseFromString(svg,'image/svg+xml').documentElement;
    const image=new Image();image.src=`./assets/pieces-themed/${theme}/${style}/wP.svg?v=${revision}`;await image.decode();
    const canvas=document.createElement('canvas');canvas.width=canvas.height=100;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,100,100);
    return {theme,style,light:css.getPropertyValue('--light').trim(),dark:css.getPropertyValue('--dark').trim(),fill:shape.getAttribute('fill'),outline:shape.getAttribute('fill'),bodyPixel:[...ctx.getImageData(50,60,1,1).data]};
   },{theme,style,revision});
   assert.equal(palette.bodyPixel[3],255,'original pawn body remains opaque');
   assert.ok(palette.bodyPixel.slice(0,3).every(channel=>channel>=200),'white piece body remains distinguishable from dark ink');
   const luminance=value=>{const channels=value.startsWith('rgb')?value.match(/[\d.]+/g).slice(0,3).map(Number):value.replace('#','').match(/\w\w/g).map(x=>parseInt(x,16));const c=channels.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;};
   const ink=luminance(palette.outline);palette.inkLightTileContrast=(luminance(palette.light)+.05)/(ink+.05);palette.inkDarkTileContrast=(luminance(palette.dark)+.05)/(ink+.05);
   assert.ok(palette.inkLightTileContrast>=7&&palette.inkDarkTileContrast>=4,'original themed contours separate from both board tiles: '+JSON.stringify(palette));
   themes.push(palette);
   }
  }
  await select('piece-style','maestro');
  await page.waitForFunction(()=>document.documentElement.dataset.pieceStyle==='maestro');
  await page.reload();await ready();
  assert.equal(await page.locator('html').getAttribute('data-piece-style'),'maestro','preserve a previously selected style');
  await page.evaluate(()=>localStorage.setItem('ChessAtelierPieceStyleV3','invalid-style'));
  await page.reload();await ready();assert.equal(await page.locator('html').getAttribute('data-piece-style'),'cburnett','invalid settings fall back to classic');
  const gallery=await context.newPage();await gallery.setViewportSize({width:1760,height:1080});
  themes.sort((a,b)=>['walnut','sage','oat','blush','slate','mist'].indexOf(a.theme)-['walnut','sage','oat','blush','slate','mist'].indexOf(b.theme));
  await gallery.setContent(`<base href="${base}/"><style>body{margin:20px;background:#eeeae5;color:#242720;font:16px system-ui}main{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}.card{padding:14px;background:#fff;border-radius:12px}h2{font-size:17px;margin:0 0 8px}.row{display:flex}.row img{width:64px;height:64px}</style><main>${themes.map(t=>`<section class="card"><h2>${t.theme} · ${{cburnett:'经典',maestro:'拟真',mpchess:'极简',totoy:'抽象'}[t.style]}</h2>${['w','b'].map(c=>['light','dark'].map(color=>`<div class="row" style="background:${t[color]}">${[...'PNBRQK'].map(p=>`<img src="assets/pieces-themed/${t.theme}/${t.style}/${c+p}.svg?v=${revision}">`).join('')}</div>`).join('')).join('')}</section>`).join('')}</main>`);
  await gallery.locator('img').evaluateAll(images=>Promise.all(images.map(image=>image.decode())));
  await gallery.screenshot({path:path.join(output,'lichess-styles-six-themes.png'),fullPage:true});
  await gallery.screenshot({path:path.join(output,'lichess-styles-walnut.png'),clip:{x:0,y:0,width:1760,height:340}});
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(output,'classic-pieces-result.json'),JSON.stringify({passed:true,default:'cburnett',savedChoicePreserved:true,invalidChoiceFallback:true,themes,pageErrors:errors},null,2));
  console.log('PASS: classic first/default, preserved preferences, all four original Lichess styles across all six themes');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
