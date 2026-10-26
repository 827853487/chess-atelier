// Read artwork from THIS recording, never guess an album by composer/title.
// ID3 APIC, FLAC PICTURE and Vorbis/Opus METADATA_BLOCK_PICTURE are supported.
const COVER_LIMIT=2*1024*1024;
const coverAscii=(b,a,n)=>String.fromCharCode(...b.subarray(a,a+n));
function coverImage(bytes){
 if(bytes.length<12||bytes.length>COVER_LIMIT)return null;
 const mime=bytes[0]===255&&bytes[1]===216?'image/jpeg':coverAscii(bytes,1,3)==='PNG'?'image/png':coverAscii(bytes,0,4)==='RIFF'&&coverAscii(bytes,8,4)==='WEBP'?'image/webp':null;
 return mime?{mime,bytes:bytes.slice()}:null;
}
function flacPicture(bytes){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let at=0;
 const uint=()=>{if(at+4>bytes.length)throw Error('Short picture');const value=view.getUint32(at);at+=4;return value;};
 try{const type=uint(),mimeLength=uint();at+=mimeLength;const descriptionLength=uint();at+=descriptionLength;for(let i=0;i<4;i++)uint();const size=uint();if(size>COVER_LIMIT||at+size>bytes.length)return null;const image=coverImage(bytes.subarray(at,at+size));return image?{...image,type}:null;}catch{return null;}
}
function coverBase64(text){try{if(text.length>COVER_LIMIT*1.4)return null;return Uint8Array.from(atob(text),c=>c.charCodeAt(0));}catch{return null;}}
function commentCover(packet){
 const offset=coverAscii(packet,0,8)==='OpusTags'?8:packet[0]===3&&coverAscii(packet,1,6)==='vorbis'?7:-1;if(offset<0)return null;
 const view=new DataView(packet.buffer,packet.byteOffset,packet.byteLength);let at=offset;
 const uint=()=>{if(at+4>packet.length)throw Error('Short comment');const value=view.getUint32(at,true);at+=4;return value;};
 try{const vendor=uint();at+=vendor;const count=Math.min(256,uint());for(let i=0;i<count;i++){const size=uint();if(size>COVER_LIMIT*1.4||at+size>packet.length)return null;const text=new TextDecoder().decode(packet.subarray(at,at+size));at+=size;const eq=text.indexOf('='),name=text.slice(0,eq).toUpperCase(),value=text.slice(eq+1);if(name==='METADATA_BLOCK_PICTURE'){const b=coverBase64(value),image=b&&flacPicture(b);if(image)return image;}if(name==='COVERART'){const b=coverBase64(value),image=b&&coverImage(b);if(image)return image;}}}catch{}return null;
}
export function extractEmbeddedCover(input){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input);if(bytes.length<10||bytes.length>COVER_LIMIT)return null;
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),sync=at=>((bytes[at]&127)<<21)|((bytes[at+1]&127)<<14)|((bytes[at+2]&127)<<7)|(bytes[at+3]&127);
 if(coverAscii(bytes,0,3)==='ID3'&&[3,4].includes(bytes[3])){
  const version=bytes[3],end=Math.min(bytes.length,10+sync(6));let at=10,fallback=null;
  if(bytes[5]&64){if(at+4>end)return null;at+=version===4?sync(at):4+view.getUint32(at);}
  for(let n=0;n<128&&at+10<=end;n++){
   const id=coverAscii(bytes,at,4),size=version===4?sync(at+4):view.getUint32(at+4),flags=bytes[at+9];at+=10;
   if(!size||size>COVER_LIMIT||at+size>end)break;
   if(id==='APIC'&&!(flags&(version===4?12:192))){
    let data=bytes.subarray(at,at+size);
    if((bytes[5]&128)||(version===4&&(flags&2))){const clean=[];for(let i=0;i<data.length;i++){clean.push(data[i]);if(data[i]===255&&data[i+1]===0)i++;}data=Uint8Array.from(clean);}
    const encoding=data[0];let pos=1;while(pos<data.length&&data[pos])pos++;const type=data[++pos];pos++;
    if(encoding===1||encoding===2){while(pos+1<data.length&&(data[pos]||data[pos+1]))pos+=2;pos+=2;}else{while(pos<data.length&&data[pos])pos++;pos++;}
    const image=coverImage(data.subarray(pos));if(image){if(type===3)return image;fallback=image;}
   }at+=size;
  }return fallback;
 }
 if(coverAscii(bytes,0,4)==='fLaC'){
  for(let at=4,n=0;n<128&&at+4<=bytes.length;n++){
   const type=bytes[at]&127,last=!!(bytes[at]&128),size=(bytes[at+1]<<16)|(bytes[at+2]<<8)|bytes[at+3];at+=4;if(at+size>bytes.length)break;
   if(type===6){const image=flacPicture(bytes.subarray(at,at+size));if(image)return image;}at+=size;if(last)break;
  }
 }
 if(coverAscii(bytes,0,4)==='OggS'){
  let parts=[],length=0;
  for(let at=0,n=0;n<64&&at+27<=bytes.length;n++){
   if(coverAscii(bytes,at,4)!=='OggS')break;const count=bytes[at+26],start=at+27+count;if(start>bytes.length)break;let data=start;
   for(let i=0;i<count;i++){const size=bytes[at+27+i];if(data+size>bytes.length)return null;parts.push(bytes.subarray(data,data+size));length+=size;data+=size;if(size<255){const packet=new Uint8Array(length);let p=0;for(const part of parts){packet.set(part,p);p+=part.length;}const image=commentCover(packet);if(image)return image;parts=[];length=0;}}
   at=data;
  }
 }return null;
}
export async function readMusicCover(url,{signal,blob}={}){
 try{
  if(blob)return extractEmbeddedCover(await blob.slice(0,COVER_LIMIT).arrayBuffer());
  const response=await fetch(url,{signal,headers:{Range:`bytes=0-${COVER_LIMIT-1}`},credentials:'omit',cache:'force-cache'});if(!response.ok)return null;
  const reader=response.body.getReader(),parts=[];let size=0;
  let required=COVER_LIMIT;
  try{while(size<required){const row=await reader.read();if(row.done)break;const part=row.value.subarray(0,COVER_LIMIT-size);parts.push(part);size+=part.length;
   if(parts.length===1&&part.length>=10&&coverAscii(part,0,3)==='ID3')required=Math.min(COVER_LIMIT,10+((part[6]&127)<<21)+((part[7]&127)<<14)+((part[8]&127)<<7)+(part[9]&127));
  }}finally{await reader.cancel().catch(()=>{});}
  const data=new Uint8Array(size);let at=0;for(const part of parts){data.set(part,at);at+=part.length;}return extractEmbeddedCover(data);
 }catch{return null;}
}
