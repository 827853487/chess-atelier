// Decorative SVG assets stay local and follow the existing UI's reduced-motion setting.
export function setupLogoEasterEgg(){
 const logo=document.querySelector('#home'),wrap=document.querySelector('.brand-wrap');
 if(!logo||!wrap)return;
 const decoration=document.createElement('span');
 decoration.className='brand-surprises';decoration.id='brand-surprises';decoration.setAttribute('aria-hidden','true');
 decoration.dataset.visible='false';
 decoration.innerHTML=`<span class="logo-surprise logo-orange" hidden><svg viewBox="0 0 44 44" focusable="false"><path d="M23 12c0-5 1-8 4-10" fill="none" stroke="#6f6940" stroke-width="2" stroke-linecap="round"/><path d="M24 9C28 1 36 3 38 6c-3 6-10 7-14 3Z" fill="#70965d"/><path d="M23 13C8 7 2 19 7 32c5 13 25 13 31-1 5-13-2-23-15-18Z" fill="#ef952f"/><path d="M23 13c-8-3-15 1-16 10-2 11 6 18 16 18 9 0 15-6 16-14-5 13-25 13-29 1-2-7 4-13 13-15Z" fill="#dc7e25" opacity=".48"/><path d="M12 20c1-3 3-5 6-5" fill="none" stroke="#ffe0a2" stroke-width="2.4" stroke-linecap="round" opacity=".85"/><g fill="#c87328" opacity=".45"><circle cx="28" cy="22" r=".8"/><circle cx="32" cy="28" r=".7"/><circle cx="25" cy="34" r=".8"/><circle cx="18" cy="29" r=".7"/><circle cx="15" cy="34" r=".6"/></g></svg></span>
 <span class="logo-surprise logo-jasmine" hidden><svg viewBox="0 0 48 48" focusable="false"><path d="M23 30c1 5 4 9 5 15" fill="none" stroke="#719365" stroke-width="2" stroke-linecap="round"/><path d="M26 38c-2-7-10-8-13-6 1 7 7 10 13 6Z" fill="#8ba676"/><path d="M27 39c1-7 7-10 12-8-1 7-6 10-12 8Z" fill="#6f9567"/><g fill="#fffdf6" stroke="#d9d6bf" stroke-width=".8"><ellipse cx="24" cy="15" rx="6" ry="11"/><ellipse cx="24" cy="15" rx="6" ry="11" transform="rotate(60 24 23)"/><ellipse cx="24" cy="15" rx="6" ry="11" transform="rotate(120 24 23)"/><ellipse cx="24" cy="15" rx="6" ry="11" transform="rotate(180 24 23)"/><ellipse cx="24" cy="15" rx="6" ry="11" transform="rotate(240 24 23)"/><ellipse cx="24" cy="15" rx="6" ry="11" transform="rotate(300 24 23)"/></g><g fill="#fffefb" stroke="#e6e1cd" stroke-width=".7"><ellipse cx="24" cy="19" rx="3.8" ry="6.6" transform="rotate(30 24 23)"/><ellipse cx="24" cy="19" rx="3.8" ry="6.6" transform="rotate(120 24 23)"/><ellipse cx="24" cy="19" rx="3.8" ry="6.6" transform="rotate(210 24 23)"/><ellipse cx="24" cy="19" rx="3.8" ry="6.6" transform="rotate(300 24 23)"/></g><circle cx="24" cy="23" r="2.1" fill="#ddc873"/></svg></span>`;
 wrap.append(decoration);
 const orange=decoration.querySelector('.logo-orange'),jasmine=decoration.querySelector('.logo-jasmine');
 let count=0,lastTap=-Infinity,expiresAt=0,timer=null,cycle=0,closing=[];
 function hide(){
  orange.hidden=true;jasmine.hidden=true;decoration.dataset.visible='false';
  wrap.classList.remove('has-surprise');count=0;lastTap=-Infinity;expiresAt=0;
  clearTimeout(timer);cycle++;for(const animation of closing)animation.cancel();closing=[];
 }
 function scheduleRetraction(now){
  const token=++cycle;
  for(const animation of closing)animation.cancel();closing=[];clearTimeout(timer);
  const duration=matchMedia('(prefers-reduced-motion: reduce)').matches?0:300;
  const delay=Math.max(0,expiresAt-now),start=document.timeline.currentTime;
  // Schedule on the animation timeline now, rather than waiting for a future input or timer to start it.
  for(const element of [orange,jasmine].filter(el=>!el.hidden)){
   const animation=element.animate([{opacity:1,transform:'translateX(0) scale(1)'},{opacity:0,transform:'translateX(-14px) scale(.65)'}],{delay,duration,easing:'cubic-bezier(.8,-.2,.8,.2)',fill:'forwards'});
   if(start!==null)animation.startTime=start;
   closing.push(animation);
  }
  Promise.all(closing.map(animation=>animation.finished)).then(()=>{if(token===cycle)hide();}).catch(()=>{});
  // Cleanup fallback; the visual exit above can finish on the compositor without a click.
  timer=setTimeout(()=>{if(token===cycle)hide();},delay+duration+40);
 }
 function tap(){
  const now=Date.now(),tapTime=performance.now();
  if(expiresAt&&now>expiresAt+400)hide();
  if(tapTime-lastTap>1400)count=0;
  lastTap=tapTime;count++;
  if(count>=6){orange.hidden=false;decoration.dataset.visible='true';wrap.classList.add('has-surprise');}
  if(count>=12)jasmine.hidden=false;
  if(!orange.hidden){
   expiresAt=Math.max(expiresAt,now+5000);
   if(count>12)expiresAt=Math.min(now+10000,expiresAt+350);
   scheduleRetraction(now);
  }
 }
 logo.addEventListener('click',tap);
 window.addEventListener('pagehide',()=>{clearTimeout(timer);hide();});
}
