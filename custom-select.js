/* Chess Atelier · accessible theme-aware select menus.
   Original HTMLSelectElements remain authoritative for all application logic. */
(() => {
  const ids = ['theme', 'piece-style', 'dataset', 'side', 'bot-level', 'ratings', 'speeds', 'animation-speed', 'move-hints', 'archive-select'];
  let opened = null;
  function close(selectWrap, restore = false) {
    if (!selectWrap) return;
    selectWrap.classList.remove('is-open');
    selectWrap.querySelector('.atelier-select-trigger').setAttribute('aria-expanded', 'false');
    if (restore) selectWrap.querySelector('.atelier-select-trigger').focus({ preventScroll: true });
    if (opened === selectWrap) opened = null;
  }
  function init(select) {
    if (!select || select.classList.contains('atelier-native-select')) return;
    const id = select.id;
    const descriptions = {'theme':'页面配色','piece-style':'棋子样式','dataset':'棋谱来源','side':'执棋颜色','bot-level':'电脑难度','ratings':'对局等级','speeds':'对局时限','animation-speed':'走棋动画','move-hints':'走子提示','archive-select':'当前分类的合集'};
    const wrap = document.createElement('div'); wrap.className = 'atelier-select';
    wrap.dataset.for = id;
    wrap.id = 'atelier-' + id;
    // 若 HTML 预留了 .atelier-select-slot 容器，则把原生 select 移进去，
    // 让 label / 触发按钮 / 宽度都由该容器统一定位，避免错位。
    const slot = select.closest('.atelier-select-slot');
    if (slot) slot.append(select);
    const trigger = document.createElement('button');
    trigger.type = 'button'; trigger.className = 'atelier-select-trigger';
    trigger.setAttribute('aria-label',descriptions[id] || select.getAttribute('aria-label') || id);
    trigger.setAttribute('aria-haspopup', 'listbox'); trigger.setAttribute('aria-expanded','false');
    trigger.innerHTML = '<span class="atelier-selected-label"></span><svg aria-hidden="true" viewBox="0 0 20 20"><path d="m5.5 8 4.5 4.5L14.5 8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const list = document.createElement('div'); list.className = 'atelier-select-list';
    list.setAttribute('role','listbox'); list.id = 'atelier-list-' + id;
    trigger.setAttribute('aria-controls',list.id);
    wrap.append(trigger,list);
    select.after(wrap); select.classList.add('atelier-native-select');select.tabIndex=-1;
    const label = document.querySelector('label[for="'+id+'"]');
    if (label) label.addEventListener('click',e=>{if(e.target===label){e.preventDefault();trigger.click();}});
    function items(){return [...list.querySelectorAll('.atelier-option:not([aria-disabled="true"])')];}
    let renderedOptions='';
    function optionsChanged() {
      const signature=select.innerHTML+'|'+select.value;
      if(signature===renderedOptions)return;
      renderedOptions=signature;
      const scroll=list.scrollTop,focused=list.contains(document.activeElement)?document.activeElement.dataset.value:null;
      const active=select.selectedOptions[0];
      trigger.querySelector('.atelier-selected-label').textContent=active?.textContent||'请选择';
      trigger.title=active?.textContent||'';
      const single=id==='archive-select'&&select.options.length<=1;
      wrap.classList.toggle('is-single',single);trigger.disabled=single;
      if(single){trigger.removeAttribute('aria-haspopup');close(wrap);}else trigger.setAttribute('aria-haspopup','listbox');
      list.replaceChildren();
      const addOption=opt=>{
        const row=document.createElement('button');row.type='button';row.className='atelier-option';row.setAttribute('role','option');row.dataset.value=opt.value;
        row.setAttribute('aria-selected',String(opt.value===select.value));
        if(opt.disabled)row.setAttribute('aria-disabled','true');
        const text=document.createElement('span');text.textContent=opt.textContent;
        const mark=document.createElement('svg');mark.setAttribute('viewBox','0 0 20 20');mark.setAttribute('aria-hidden','true');mark.innerHTML='<path d="m4.5 10.5 3.5 3.4L15.5 6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" />';
        row.append(text,mark);
        row.addEventListener('click',()=>selectOption(opt.value));
        list.append(row);
      };
      const walk=parent=>{
        for(const node of parent.children){
          if(node.tagName==='OPTGROUP'){
            const lab=document.createElement('div');
            lab.className='atelier-option-group';
            lab.textContent=node.label;
            list.append(lab);
            walk(node);
          }else if(node.tagName==='OPTION')addOption(node);
        }
      };
      walk(select);
      if(wrap.classList.contains('is-open')){
        list.scrollTop=scroll;
        items().find(row=>row.dataset.value===focused)?.focus({preventScroll:true});
      }
    }
    function selectOption(value){
      close(wrap,true);
      if(select.value!==value){select.value=value;select.dispatchEvent(new Event('change',{bubbles:true}));}
      optionsChanged();
    }
    function open(){
      if(trigger.disabled)return;
      if(opened && opened!==wrap)close(opened);
      optionsChanged();wrap.classList.add('is-open');trigger.setAttribute('aria-expanded','true');opened=wrap;
      const active=list.querySelector('[aria-selected="true"]')||items()[0];
      if(id==='archive-select'){
        list.scrollTop=0;items()[0]?.focus({preventScroll:true});
      }else{
        if(active)list.scrollTop=Math.max(0,active.offsetTop-10);
        active?.focus({preventScroll:true});
      }
    }
    trigger.addEventListener('click',()=>wrap.classList.contains('is-open')?close(wrap):open());
    wrap.addEventListener('keydown',e=>{
      if(!['Escape','ArrowDown','ArrowUp','Home','End','Enter',' '].includes(e.key))return;
      e.preventDefault();
      if(e.key==='Escape'){close(wrap,true);return;}
      if(!wrap.classList.contains('is-open')){open();return;}
      const rows=items();if(!rows.length)return;
      const focused=rows.indexOf(document.activeElement);
      if(e.key==='Enter'||e.key===' '){if(focused>=0)selectOption(rows[focused].dataset.value);return;}
      const next=e.key==='Home'?0:e.key==='End'?rows.length-1:e.key==='ArrowDown'?Math.min(focused+1,rows.length-1):Math.max(focused-1,0);
      const row=rows[next];row.focus({preventScroll:true});
      // Scroll only this menu; scrollIntoView can also move the enclosing page/right pane.
      if(row.offsetTop<list.scrollTop)list.scrollTop=row.offsetTop;
      else if(row.offsetTop+row.offsetHeight>list.scrollTop+list.clientHeight)list.scrollTop=row.offsetTop+row.offsetHeight-list.clientHeight;
    });
    select.addEventListener('change',optionsChanged);
    if(id==='archive-select'){
      let pending=false;
      new MutationObserver(()=>{if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;optionsChanged();});}).observe(select,{childList:true,subtree:true});
    }
    optionsChanged();
  }
  ids.forEach(id=>init(document.getElementById(id)));
  document.addEventListener('pointerdown',e=>{if(opened&&!opened.contains(e.target))close(opened);},{capture:true});
})();
