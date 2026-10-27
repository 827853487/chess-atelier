const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true}),context=await browser.newContext(),page=await context.newPage(),errors=[];let discoveries=0,streams=0;
 page.on('pageerror',e=>errors.push(e.message));const base=process.env.CHESS_TEST_URL||'http://127.0.0.1:18765',root=path.resolve(__dirname,'..'),record=JSON.parse(fs.readFileSync(path.join(root,'assets/music/playlist.json')))[0];
 await context.addInitScript(()=>{Math.random=()=>0;});
 await context.route('**/*',async route=>{
  const url=route.request().url();if(url.startsWith(base))return route.continue();
  if(url.startsWith('https://commons.wikimedia.org/w/api.php')){
   if(route.request().method()==='OPTIONS')return route.fulfill({headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Api-User-Agent'},body:''});
   discoveries++;const pages=[1,2,3].map(i=>({ns:6,title:`File:Bach Prelude BWV 1007 Concert ${i}.mp3`,imageinfo:[{url:`https://upload.wikimedia.org/wikipedia/commons/a/a1/Bach_Prelude_${i}.mp3`,descriptionurl:`https://commons.wikimedia.org/wiki/File:Bach_Prelude_${i}.mp3`,size:record.bytes,mime:'audio/mpeg',mediatype:'AUDIO',metadata:[{name:'playtime_seconds',value:180}],extmetadata:{ObjectName:{value:`Bach - Prelude concert ${i}`},Artist:{value:'Fixture Performer'},LicenseShortName:{value:'CC BY-SA 4.0'},LicenseUrl:{value:'https://creativecommons.org/licenses/by-sa/4.0/'}}}]}));
   return route.fulfill({contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify({query:{pages}})});
  }
  if(url.startsWith('https://upload.wikimedia.org/')){streams++;return route.fulfill({contentType:'audio/mpeg',headers:{'Access-Control-Allow-Origin':'*'},body:fs.readFileSync(path.join(root,'assets/music',record.file))});}
  return route.abort();
 });
 try{
  await page.goto(base);await page.locator('#music-toggle').click();await page.waitForFunction(()=>Number(document.querySelector('#music-panel').dataset.onlineCount)>=3,null,{timeout:15000});
  await page.locator('#music-shuffle').click();await page.locator('[data-era=baroque]').click();await page.waitForFunction(()=>!document.querySelector('#music-audio').paused&&document.querySelector('#music-audio').currentTime>.1);
  await page.waitForFunction(()=>document.querySelector('#music-panel').dataset.nextBuffered==='true');await page.locator('#music-next').click();await page.waitForFunction(()=>!document.querySelector('#music-audio').paused&&document.querySelector('#music-audio').currentTime>.1);
  assert.ok(discoveries>0&&streams>0);assert.match(await page.locator('#music-title').innerText(),/Prelude concert/);assert.match(await page.locator('#music-artist').getAttribute('href'),/commons.*Bach_Prelude/);
  assert.equal(await page.locator('#music-online,#music-list,#music-status,#music-source,#music-more').count(),0);assert.equal(await page.locator('.music-progress').evaluate(node=>node.nextElementSibling.tagName),'AUDIO');assert.deepEqual(errors,[]);
  await page.locator('#music-panel').screenshot({path:path.join(root,'test-results/automatic-music.png')});fs.writeFileSync(path.join(root,'test-results/automatic-music-result.json'),JSON.stringify({passed:true,automaticDiscovery:true,onlineAudioPlayback:true,compactFooter:true,attributionInArtistLink:true,pageErrors:errors},null,2));console.log('PASS: automatic Commons discovery and online playback, no catalogue/footer controls, recording credit retained on artist line');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
