// Lucide shuffle/menu paths; copyright Lucide and Feather contributors.
// Original SVGs, pinned source and full ISC/MIT notices: assets/icons/.
const MODE_ICONS = {"random": "<svg aria-hidden=\"true\"\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"m18 14 4 4-4 4\" />\n  <path d=\"m18 2 4 4-4 4\" />\n  <path d=\"M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22\" />\n  <path d=\"M2 6h1.972a4 4 0 0 1 3.6 2.2\" />\n  <path d=\"M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45\" />\n</svg>", "sequence": "<svg aria-hidden=\"true\"\n  xmlns=\"http://www.w3.org/2000/svg\"\n  width=\"24\"\n  height=\"24\"\n  viewBox=\"0 0 24 24\"\n  fill=\"none\"\n  stroke=\"currentColor\"\n  stroke-width=\"2\"\n  stroke-linecap=\"round\"\n  stroke-linejoin=\"round\"\n>\n  <path d=\"M4 5h16\" />\n  <path d=\"M4 12h16\" />\n  <path d=\"M4 19h16\" />\n</svg>"};
export function setupMusicModeButton(button,isRandom,onToggle){
 let visible=null,running=false,feedbackTimer;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const desired=()=>isRandom()?'random':'sequence';
 const replace=mode=>{button.innerHTML=MODE_ICONS[mode];button.dataset.mode=mode;visible=mode;};
 function render(){
  button.setAttribute('aria-pressed',String(isRandom()));
  button.setAttribute('aria-label',isRandom()?'随机播放，切换为顺序播放':'顺序播放，切换为随机播放');
  button.title=isRandom()?'随机播放':'顺序播放 · 沿已播放记录切换';
  if(visible===null){replace(desired());return;}
  if(running||visible===desired())return;
  running=true;
  (async()=>{
   while(visible!==desired()){
    const old=button.querySelector('svg');
    if(!reduced.matches)await old.animate([{opacity:1},{opacity:0}],{duration:80,fill:'forwards',easing:'ease-out'}).finished.catch(()=>{});
    replace(desired());
    if(!reduced.matches)await button.querySelector('svg').animate([{opacity:0},{opacity:1}],{duration:110,easing:'ease-in'}).finished.catch(()=>{});
   }
  })().finally(()=>{running=false;});
 }
 button.addEventListener('click',()=>{
  clearTimeout(feedbackTimer);button.classList.add('mode-feedback');feedbackTimer=setTimeout(()=>button.classList.remove('mode-feedback'),260);
  onToggle();render();
 });
 render();return {render};
}
