// Stockfish.js 19.0.1, GPL-3.0. Upstream and corresponding source:
// vendor/stockfish/manifest.json, Copying.txt and source.tar.gz.
// These are build-time provenance links only; runtime never downloads a CDN asset.
const ENGINE_FILES=[
 {name:'stockfish-19-lite-single.js',type:'application/javascript',bytes:28230,sha256:'ccb130d7ff29408531c47d859a49f91d59d4f482d05a53eb1a3231a4f624c91a'},
 {name:'stockfish-19-lite-single.wasm',type:'application/wasm',bytes:1845971,sha256:'ee4f115bdb2d32cadf96cada104a05b5ec257d7ad6f57582190b49bc71f096de'}
];
const engineRoot=new URL('./vendor/stockfish/',document.baseURI);
const cacheName='chess-atelier-engine-19.0.1-'+encodeURIComponent(engineRoot.pathname);
let preparedAssets=null;
let embeddedPackage;

function embeddedBytes(file){
 const element=document.getElementById?.('stockfish-payload');
 if(!element)return null;
 embeddedPackage??=JSON.parse(element.textContent);
 if(embeddedPackage.version!=='19.0.1-lite-single')throw Error('网页内引擎版本不匹配，请刷新网页。');
 if(file.name.endsWith('.js'))return new TextEncoder().encode(embeddedPackage.script);
 const raw=atob(embeddedPackage.wasm);return Uint8Array.from(raw,c=>c.charCodeAt(0));
}

async function verifiedBytes(response,file){
 if(!response?.ok)throw Error('引擎文件下载失败'+(response?'（'+response.status+'）':''));
 const bytes=await response.arrayBuffer();
 if(bytes.byteLength!==file.bytes)throw Error('引擎文件不完整，请重试。');
 if(globalThis.crypto?.subtle){
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  const hex=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
  if(hex!==file.sha256)throw Error('引擎文件校验失败，请重试。');
 }
 return bytes;
}

async function loadEngineFile(file){
 const url=new URL(file.name,engineRoot);
 if(url.origin!==location.origin)throw Error('引擎必须由当前网站托管。');
 url.searchParams.set('v',file.sha256.slice(0,16));
 let cache;
 // Safari private browsing / full storage may deny Cache Storage. Downloading
 // and playing still work; persistent caching is an optional optimization.
 try{cache=await globalThis.caches?.open(cacheName);}catch{}
 try{
  const stored=await cache?.match(url.href);
  if(stored)return await verifiedBytes(stored,file);
 }catch{try{await cache?.delete(url.href);}catch{}}
 // Public builds carry both engine files inside the HTML document. If the
 // page arrived, starting Stockfish no longer needs a separate WASM request.
 const embedded=embeddedBytes(file);
 if(embedded){
  const bytes=await verifiedBytes(new Response(embedded),file);
  try{await cache?.put(url.href,new Response(bytes,{headers:{'Content-Type':file.type}}));}catch{}
  return bytes;
 }
 let failure;
 for(let attempt=0;attempt<3;attempt++){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),25000);
  try{
   const response=await fetch(url.href,{signal:controller.signal,mode:'same-origin',credentials:'same-origin',redirect:'error',cache:attempt?'reload':'default'});
   const bytes=await verifiedBytes(response,file);
   try{await cache?.put(url.href,new Response(bytes,{headers:{'Content-Type':file.type}}));}catch{}
   return bytes;
  }catch(error){failure=error;}
  finally{clearTimeout(timeout);}
  if(attempt<2)await new Promise(resolve=>setTimeout(resolve,400*(attempt+1)));
 }
 throw Error('本站 Stockfish 加载失败，请检查网络后重试。'+(failure?.name==='AbortError'?'下载超时。':failure?.message||''));
}

export function prepareBrowserEngineAssets(){
 if(preparedAssets)return preparedAssets;
 preparedAssets=Promise.all(ENGINE_FILES.map(loadEngineFile)).then(([script,wasm])=>{
  embeddedPackage=null;
  const wasmUrl=URL.createObjectURL(new Blob([wasm],{type:'application/wasm'}));
  const scriptUrl=URL.createObjectURL(new Blob([script],{type:'application/javascript'}));
  // The verified blobs now own the bytes. Release the large Base64 DOM string
  // on memory-constrained tablets; subsequent calls reuse this prepared result.
  const payload=document.getElementById?.('stockfish-payload');if(payload)payload.textContent='';
  // Stockfish.js accepts an explicit WASM location in its worker URL fragment.
  // Both blobs came from verified same-origin bytes, so workers need no network,
  // correct server WASM MIME, SharedArrayBuffer, CDN or analysis API.
  return {workerUrl:scriptUrl+'#'+encodeURIComponent(wasmUrl)};
 }).catch(error=>{preparedAssets=null;throw error;});
 return preparedAssets;
}
