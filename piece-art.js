// High-contrast vector Chess Atelier set, with user-selectable alternate open-license artwork.
// 棋子标记串在一次绘制里是固定的，这里缓存 HTML 字符串，
// 避免长棋谱每走一步都重新拼接同一段 SVG / img 标签。
const choices=new Set(['fantasy','chessnut','rhosgfx']);
// Bump when SVG artwork changes so an existing browser cache sees the new set.
const ART_REVISION='3';
export function setPieceStyle(v){document.documentElement.dataset.pieceStyle=choices.has(v)?v:'rhosgfx';}
const cache=new Map();
export function pieceSvg(type,color,theme=document.documentElement.dataset.theme||'walnut',style=document.documentElement.dataset.pieceStyle||'rhosgfx'){
 const code=(color==='w'?'w':'b')+type.toUpperCase();
 const key=theme+'|'+style+'|'+code;
 let html=cache.get(key);
 if(html===undefined){
  html=`<span class="piece-visual"><span class="piece-backup" aria-hidden="true">${fallbackSvg(type,color)}</span><img class="piece-art-img" alt="" draggable="false" decoding="async" src="./assets/pieces-themed/${theme}/${style}/${code}.svg?v=${ART_REVISION}" onload="this.parentElement.classList.remove('asset-failed');delete this.dataset.retry;this.parentElement.classList.add('asset-ready')" onerror="var v=this.parentElement;v.classList.remove('asset-ready');if(this.dataset.retry){v.classList.add('asset-failed');return}this.dataset.retry='1';var s=this.src;setTimeout(function(){this.src=s},90)" /></span>`;
  cache.set(key,html);
 }
 return html;
}

/* ------------------------------------------------------------------
   棋子节点复用池 —— 走子闪烁的根治点
   旧实现里 drawBoard() 每次换格都是 prior.remove() 再新建 <span class="piece">。
   新建的 <img> 必须等自己的 onload 才会拿到 .asset-ready，而样式层给
   .piece-art-img 设了 opacity:0 → 1，于是落子那一帧一定会看到一次淡入，
   也就是「走子时候会有闪烁」。
   这里把节点按「主题|风格|棋子」缓存复用：节点里的图片早已解码、
   asset-ready 早已打好，插入即显示，既没有淡入，也省掉每步的图片解码。
   ------------------------------------------------------------------ */
const POOL=new Map();   // poolKey -> 尚未使用的节点
const WARM=new Set();   // 已确认该资源在浏览器里可用
let poolScope='';
const artScope=()=>`${document.documentElement.dataset.theme||'walnut'}|${document.documentElement.dataset.pieceStyle||'rhosgfx'}`;
const artKey=(type,color)=>artScope()+'|'+color+type;
function ensureScope(){
 const s=artScope();
  if(s!==poolScope){poolScope=s;POOL.clear();}
}
function markWarm(node){
 const v=node.firstElementChild;
 if(!v)return;
 v.classList.remove('asset-failed');v.classList.add('asset-ready');
}
function buildNode(type,color,theme=document.documentElement.dataset.theme||'walnut',style=document.documentElement.dataset.pieceStyle||'rhosgfx'){
 const node=document.createElement('span');
 node.className='piece';
 node.dataset.artScope=theme+'|'+style;
 node.innerHTML=pieceSvg(type,color,theme,style);
 const visual=node.firstElementChild;
 if(visual){
  visual.dataset.piece=(color==='w'?'w':'b')+type;
  const img=visual.querySelector('.piece-art-img');
  const key=theme+'|'+style+'|'+color+type;
  img?.addEventListener('load',()=>WARM.add(key),{once:true});
  // src 命中内存缓存时 Chrome 会同步给 complete，此时可以直接判定为可用
  if(img&&img.complete&&img.naturalWidth>0)WARM.add(key);
  if(WARM.has(key))markWarm(node);
 }
 return node;
}
export function acquirePiece(type,color){
 ensureScope();
 const key=artKey(type,color);
 const node=(POOL.get(key)||[]).pop();
 if(node){node.style.opacity='';return node;}
 const fresh=buildNode(type,color);
 if(WARM.has(key))markWarm(fresh);
 return fresh;
}
export function releasePiece(node){
 if(!node)return;
 // 必须先离场：旧实现只 remove()，这里若不摘掉，节点会留在原格里变成"分身"
 node.remove();
 node.style.opacity='';
 const code=node.firstElementChild?.dataset.piece;
 if(!code)return;
 ensureScope();
 if(node.dataset.artScope&&node.dataset.artScope!==artScope())return;
 const key=artScope()+'|'+code;
 let list=POOL.get(key);
 if(!list)POOL.set(key,list=[]);
 if(list.length<10)list.push(node);
}
export function resetPiecePool(){POOL.clear();poolScope='';}
// Decode the complete target set before replacing any visible pieces.
const PREPARED=new Map();
export async function preparePieceArt(theme,style){
 const requests=[];
 for(const color of ['w','b'])for(const type of ['p','n','b','r','q','k']){
  const key=theme+'|'+style+'|'+color+type;
  if(!PREPARED.has(key)){
   const image=new Image();image.decoding='async';
   image.src=`./assets/pieces-themed/${theme}/${style}/${color+type.toUpperCase()}.svg?v=${ART_REVISION}`;
   PREPARED.set(key,image.decode().then(()=>{WARM.add(key);return image;},()=>{PREPARED.delete(key);}));
  }
  requests.push(PREPARED.get(key));
 }
 await Promise.all(requests);
 // Decode the actual nodes that will be inserted, not just separate Image objects.
 // In particular, async SVG decoding can otherwise start halfway through a scale animation.
 const nodes=[],want={p:9,n:3,b:3,r:3,q:2,k:2};
 for(const color of ['w','b'])for(const type of Object.keys(want))for(let i=0;i<want[type];i++)nodes.push(buildNode(type,color,theme,style));
 await Promise.all(nodes.map(async node=>{const image=node.querySelector('img');try{await image.decode();markWarm(node);}catch{}}));
 return nodes;
}
/* 开局前把每种棋子各备好若干个已加载节点，之后任何一次落子都只是搬一个现成节点。 */
export function preloadPieceArt(prepared=[]){
 ensureScope();
 for(const node of prepared){const code=node.firstElementChild?.dataset.piece;if(!code||node.dataset.artScope!==artScope())continue;const key=artScope()+'|'+code;let list=POOL.get(key);if(!list)POOL.set(key,list=[]);list.push(node);}
 const want={p:9,n:3,b:3,r:3,q:2,k:2};
 for(const color of ['w','b'])for(const type of Object.keys(want)){
  const key=artKey(type,color),list=POOL.get(key)||[];
  while(list.length<want[type])list.push(buildNode(type,color));
  POOL.set(key,list);
 }
}
