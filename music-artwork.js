import { musicComposerInitial } from './music-order.js';

// Render the same local monogram as the web player to PNG. System media UIs
// cannot read DOM/CSS, and Chrome for Android expects bitmap artwork (512px).
const artworkCache=new Map();
export function musicArtwork(track){
 if(!track||typeof document==='undefined'||typeof getComputedStyle!=='function')return [];
 try{
  const root=getComputedStyle(document.documentElement),tile=document.querySelector('.now-art'),letter=tile?.querySelector('[data-current=true]');
  const tileStyle=tile?getComputedStyle(tile):null,textStyle=letter?getComputedStyle(letter):null;
  const initial=musicComposerInitial(track),start=root.getPropertyValue('--accent').trim()||'#80634c',end=root.getPropertyValue('--ink').trim()||'#45382d',color=textStyle?.color||root.getPropertyValue('--paper').trim()||'#fffcf8';
  const ratio=Math.max(.35,Math.min(.8,(parseFloat(textStyle?.fontSize)||36)/(parseFloat(tileStyle?.width)||56))),family=textStyle?.fontFamily||'Georgia,serif';
  const key=JSON.stringify([initial,start,end,color,ratio,family]);
  if(artworkCache.has(key))return artworkCache.get(key);
  const artwork=[512,256].map(size=>{
   const canvas=document.createElement('canvas');canvas.width=canvas.height=size;const context=canvas.getContext('2d');
   if(!context)throw Error('Canvas unavailable');
   const gradient=context.createLinearGradient(0,0,size,size);gradient.addColorStop(0,start);gradient.addColorStop(1,end);
   context.fillStyle=gradient;context.fillRect(0,0,size,size);context.fillStyle=color;context.font=`400 ${size*ratio}px ${family}`;context.textAlign='center';context.textBaseline='alphabetic';
   const metrics=context.measureText(initial),ascent=metrics.actualBoundingBoxAscent||size*ratio*.7,descent=metrics.actualBoundingBoxDescent||0;
   context.fillText(initial,size/2,(size+ascent-descent)/2);
   return {src:canvas.toDataURL('image/png'),sizes:`${size}x${size}`,type:'image/png'};
  });
  artworkCache.set(key,artwork);while(artworkCache.size>8)artworkCache.delete(artworkCache.keys().next().value);
  return artwork;
 }catch{return [];}
}
