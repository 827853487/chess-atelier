// One reversible lifecycle for floating surfaces. DOM removal/native close only
// happens after the exit, so a quick reopen cannot be closed by an older task.
const surfaceEffects=new WeakMap();
const reducedSurfaceMotion=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
export function surfaceOpen(element){return !!element&&element.dataset.surfaceState!=='closing'&&(element.tagName==='DIALOG'?element.open:!element.hidden&&!element.classList.contains('hidden'));}
function surfaceTransition(element,opening,commit){
 if(!element)return Promise.resolve();
 const prior=surfaceEffects.get(element);
 if(prior?.opening===opening)return prior.done;
 const visible=element.tagName==='DIALOG'?element.open:!element.hidden&&!element.classList.contains('hidden');
 const computed=getComputedStyle(element),continuing=visible&&(!opening||!!prior||element.dataset.surfaceState==='open');
 const opacity=continuing?Number(computed.opacity):0,transform=continuing?computed.transform:'translateY(-5px) scale(.985)';
 prior?.animation.cancel();
 if(!opening&&!visible){commit();return Promise.resolve();}
 element.hidden=false;element.classList.remove('hidden');element.inert=!opening;
 element.dataset.surfaceState=opening?'open':'closing';
 if(reducedSurfaceMotion()){surfaceEffects.delete(element);commit();return Promise.resolve();}
 const visibility=element.style.visibility;element.style.visibility='visible';
 const animation=element.animate([{opacity,transform},{opacity:opening?1:0,transform:opening?'none':'translateY(-5px) scale(.985)'}],{duration:opening?180:160,easing:'cubic-bezier(.2,0,.2,1)',fill:'both'});
 const entry={opening,animation,done:null};surfaceEffects.set(element,entry);
 entry.done=animation.finished.catch(()=>{}).then(()=>{
  if(surfaceEffects.get(element)!==entry)return;
  surfaceEffects.delete(element);element.style.visibility=visibility;
  commit();animation.cancel();
 });return entry.done;
}
export function showSurface(element){return surfaceTransition(element,true,()=>{});}
export function hideSurface(element,commit=()=>{element.hidden=true;element.classList.add('hidden');}){return surfaceTransition(element,false,commit);}
export function installDialogMotion(dialogs){
 for(const dialog of dialogs){
  const close=dialog.close.bind(dialog),show=dialog.showModal.bind(dialog);
  const trigger=()=>document.querySelector(`[aria-controls="${dialog.id}"]`);
  dialog.showModal=()=>{if(!dialog.open)show();trigger()?.setAttribute('aria-expanded','true');showSurface(dialog);};
  dialog.close=value=>{trigger()?.setAttribute('aria-expanded','false');return hideSurface(dialog,()=>{if(dialog.open)close(value);dialog.inert=false;});};
  dialog.addEventListener('cancel',event=>{event.preventDefault();dialog.close();});
 }
}
// custom-select.js is a small standalone script loaded after the bundle.
globalThis.ChessSurfaces={show:showSurface,hide:hideSurface,isOpen:surfaceOpen};
