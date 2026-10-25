// Quiet Material-inspired state overlay: no expanding dark ripple.
document.addEventListener('pointerdown', event => {
 const button=event.target.closest?.('button:not(.square)');
 if (!button||button.disabled||event.button!==0)return;
 button.classList.remove('press-feedback'); void button.offsetWidth;button.classList.add('press-feedback');
 setTimeout(()=>button.classList.remove('press-feedback'),240);
},{passive:true});
