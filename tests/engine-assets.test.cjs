const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'engine-assets.js'),'utf8').replace(/^export /gm,'');
const binaries=new Map(['stockfish-19-lite-single.js','stockfish-19-lite-single.wasm'].map(name=>[name,fs.readFileSync(path.join(root,'vendor/stockfish',name))]));
function makeStore(){
 const entries=new Map();
 return {entries,open:async()=>({match:async key=>entries.get(key)?.clone(),put:async(key,value)=>entries.set(key,value.clone()),delete:async key=>entries.delete(key)})};
}
function create({store=makeStore(),fetchFile,base='https://example.test/chess-atelier/'}={}){
 const calls=[],blobs=[];
 class TestURL extends URL{static createObjectURL(blob){blobs.push(blob);return 'blob:https://example.test/'+blobs.length;}}
 const context=vm.createContext({URL:TestURL,Blob,Response,AbortController,crypto:require('node:crypto').webcrypto,
  document:{baseURI:base},location:{origin:'https://example.test'},caches:store,
  setTimeout:(fn,ms)=>setTimeout(fn,Math.min(ms,5)),clearTimeout,
  fetch:async(url,options)=>{
   calls.push({url,options});const name=new URL(url).pathname.split('/').pop();
   return fetchFile?fetchFile(name,calls.length,options):new Response(binaries.get(name));
  }});
 vm.runInContext(source+'\nglobalThis.load=prepareBrowserEngineAssets;',context);
 return {...context,calls,blobs,store};
}
test('runtime uses only hashed same-origin assets and shares one preparation across workers',async()=>{
 const a=create(),one=a.load(),two=a.load();assert.equal(one,two);
 const result=await one;assert.match(result.workerUrl,/^blob:.*#blob%3A/);assert.equal(a.blobs.length,2);assert.equal(a.calls.length,2);
 for(const {url,options} of a.calls){assert.equal(new URL(url).origin,'https://example.test');assert.equal(new URL(url).searchParams.get('v').length,16);assert.equal(options.mode,'same-origin');assert.equal(options.redirect,'error');}
 assert.equal(a.blobs[0].type,'application/wasm');
});
test('persistent verified bytes start an engine on a later visit without any downloads',async()=>{
 const store=makeStore();await create({store}).load();assert.equal(store.entries.size,2);
 const b=create({store,fetchFile:()=>{throw Error('offline');}});await b.load();assert.equal(b.calls.length,0);
});
test('damaged cached assets are discarded and replaced from this site',async()=>{
 const store=makeStore();await create({store}).load();
 const key=[...store.entries.keys()].find(s=>s.includes('.wasm'));const bad=Buffer.from(binaries.get('stockfish-19-lite-single.wasm'));bad[50]^=1;
 store.entries.set(key,new Response(bad));const b=create({store});await b.load();assert.equal(b.calls.length,1);
 assert.equal(b.calls[0].options.cache,'default');assert.deepEqual(Buffer.from(await store.entries.get(key).clone().arrayBuffer()),binaries.get('stockfish-19-lite-single.wasm'));
});
test('transient errors and incorrect bytes retry; server MIME does not break WASM',async()=>{
 let attempts=0;
 const a=create({fetchFile:name=>{
  if(name.endsWith('.wasm')&&++attempts===1)return new Response('unavailable',{status:503});
  if(name.endsWith('.wasm')&&attempts===2)return new Response(Buffer.alloc(binaries.get(name).length));
  return new Response(binaries.get(name),{headers:{'Content-Type':'text/plain'}});
 }});
 await a.load();assert.equal(attempts,3);assert.equal(a.calls.filter(c=>c.options.cache==='reload').length,2);assert.equal(a.blobs[0].type,'application/wasm');
});
test('storage denial does not prevent play; failed preparation can be retried',async()=>{
 let offline=true;
 const a=create({store:{open:async()=>{throw Error('storage denied');}},fetchFile:name=>{if(offline)throw Error('offline');return new Response(binaries.get(name));}});
 await assert.rejects(a.load(),/本站 Stockfish 加载失败/);offline=false;await a.load();assert.equal(a.blobs.length,2);
});
test('cross-origin engine configuration is rejected before sending any request',async()=>{
 const a=create({base:'https://other.test/'});await assert.rejects(a.load(),/当前网站/);assert.equal(a.calls.length,0);
});
