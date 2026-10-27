import { musicDisplayTitle, musicPerformer } from './music-order.js';

// Media Session controls the existing HTML audio element; it is not a second
// player and cannot keep a closed tab or a terminated browser process alive.
export function setupMusicSession({audio,getTrack,play,pause,previous,next}){
 const session=navigator.mediaSession;let metadataKey='';
 function activate(){try{if(navigator.audioSession)navigator.audioSession.type='playback';}catch{}}
 function position(){
  if(!session?.setPositionState)return;
  try{
   const duration=audio.duration;
   if(!Number.isFinite(duration)||duration<=0){session.setPositionState();return;}
   session.setPositionState({duration,playbackRate:audio.playbackRate||1,position:Math.min(duration,Math.max(0,audio.currentTime||0))});
  }catch{} // Older browsers may expose only part of Media Session.
 }
 function sync(){
  if(!session)return;
  const track=getTrack();
  try{
   const metadata=track?{title:musicDisplayTitle(track),artist:[track.composer,musicPerformer(track)].filter(Boolean).join(' · '),album:'棋境 · 古典乐'}:null;
   const key=JSON.stringify(metadata);
   if(key!==metadataKey){if(typeof MediaMetadata==='function')session.metadata=metadata?new MediaMetadata(metadata):null;metadataKey=key;}
   session.playbackState=!track?'none':audio.paused?'paused':'playing';
  }catch{}
  position();
 }
 function seek(target,fast=false){
  if(!Number.isFinite(target)||!Number.isFinite(audio.duration)||audio.duration<=0)return;
  const value=Math.max(0,Math.min(audio.duration,target));
  if(fast&&typeof audio.fastSeek==='function')audio.fastSeek(value);else audio.currentTime=value;
  position();
 }
 const safely=fn=>details=>{try{Promise.resolve(fn(details||{})).catch(()=>{});}catch{}};
 const actions={play:()=>{activate();return play();},pause,previoustrack:previous,nexttrack:next,
  seekto:details=>seek(details.seekTime,details.fastSeek),
  seekbackward:details=>seek(audio.currentTime-(details.seekOffset||10)),
  seekforward:details=>seek(audio.currentTime+(details.seekOffset||10)),
  stop:()=>{pause();seek(0);}
 };
 for(const [action,handler] of Object.entries(actions)){try{session?.setActionHandler(action,safely(handler));}catch{}}
 for(const event of ['playing','pause','ended','loadedmetadata','durationchange','seeked','ratechange'])audio.addEventListener(event,sync);
 audio.addEventListener('timeupdate',position);
 sync();return {activate,sync};
}
