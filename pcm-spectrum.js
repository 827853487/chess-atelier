// Small real FFT for a decoded recording. This is a visual-only fallback when
// captureStream is unavailable; it never generates or routes audible audio.
export function createPcmSpectrum(buffer){
 const size=512,real=new Float64Array(size),imag=new Float64Array(size),window=new Float64Array(size),reverse=new Uint16Array(size);
 for(let i=0;i<size;i++){
  window[i]=.5-.5*Math.cos(2*Math.PI*i/(size-1));let n=i,j=0;
  for(let b=0;b<9;b++){j=(j<<1)|(n&1);n>>=1;}reverse[i]=j;
 }
 const channels=Array.from({length:Math.min(2,buffer.numberOfChannels)},(_,i)=>buffer.getChannelData(i));
 // Match the same approximate frequency bands as the live 48kHz analyser.
 const edges=[0,190,380,750,1500,3000].map(hz=>Math.max(1,Math.min(size/2,Math.round(hz*size/buffer.sampleRate))));
 return seconds=>{
  const start=Math.floor(Math.max(0,seconds)*buffer.sampleRate)-size/2;
  // Use the strongest channel so opposite stereo phases cannot cancel into a
  // false silent indicator, while retaining actual waveform frequencies.
  let channel=channels[0],peak=-1;
  for(const candidate of channels){let energy=0;for(let i=0;i<size;i++){const value=candidate[start+i]||0;energy+=value*value;}if(energy>peak){peak=energy;channel=candidate;}}
  for(let i=0;i<size;i++){
   const index=start+i,sample=index>=0&&index<buffer.length?channel[index]:0;
   real[reverse[i]]=sample*window[i];imag[reverse[i]]=0;
  }
  for(let length=2;length<=size;length*=2){
   const half=length/2,angle=-2*Math.PI/length;
   for(let start=0;start<size;start+=length)for(let j=0;j<half;j++){
    const cos=Math.cos(angle*j),sin=Math.sin(angle*j),a=start+j,b=a+half,r=real[b]*cos-imag[b]*sin,q=real[b]*sin+imag[b]*cos;
    real[b]=real[a]-r;imag[b]=imag[a]-q;real[a]+=r;imag[a]+=q;
   }
  }
  return edges.slice(0,-1).map((from,i)=>{
   const to=Math.max(from+1,edges[i+1]);let total=0;
   for(let k=from;k<to;k++){const amplitude=4*Math.hypot(real[k],imag[k])/size,db=20*Math.log10(Math.max(1e-7,amplitude));total+=Math.max(0,Math.min(1,(db+100)/70));}
   return total/(to-from);
  });
 };
}
