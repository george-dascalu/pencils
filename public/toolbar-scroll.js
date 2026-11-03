// Shared directional hints for scrolling control rows. Portals leave the row's
// flex/grid layout, native scrolling and menu positioning unchanged.
const areas='[role="toolbar"], [role="tablist"], .toolbar, .tabs, .tabs-scroll, .document-tabs, .document-embed-tabs, .sheet-tabs, .sheet-format-tools, .selection-row, .phone-board-row, .task-editor-actions, .active-filters';
export const contextualPopoverSelector=':popover-open:not(.toolbar-scroll-indicators)';
export function installToolbarScrollIndicators(icon) {
  const tracked=new Map(),observed=new Set(),life=new AbortController();let frame=0,serial=0,pointerTarget=null;
  const request=()=>{if(!frame)frame=requestAnimationFrame(paint);};
  const resize=new ResizeObserver(request);
  const observe=node=>{if(!observed.has(node)){observed.add(node);resize.observe(node);}};
  function add(scroller){
    if(!scroller.isConnected||!scroller.parentElement||tracked.has(scroller)||scroller.matches('.rich-toolbar')||scroller.closest('.rich-toolbar'))return;
    const overlay=document.createElement('div');overlay.className='toolbar-scroll-indicators';overlay.setAttribute('popover','manual');overlay.hidden=true;
    scroller.setAttribute('data-scroll-controls','');
    const id=scroller.id||`toolbar-scroll-${++serial}`;if(!scroller.id)scroller.id=id;
    overlay.dataset.scrollToolbar=id;
    for(const [side,glyph,direction] of [['start','arrow-left',-1],['end','arrow',1]]){
      const edge=document.createElement('button');edge.type='button';edge.className=`icon-button toolbar-scroll-edge toolbar-scroll-${side}`;edge.dataset.toolbarScroll=side;
      const label=`Scroll ${scroller.getAttribute('aria-label')||'controls'} ${side==='start'?'left':'right'}`;
      edge.setAttribute('aria-label',label);edge.title=label;edge.setAttribute('aria-controls',id);edge.innerHTML=icon(glyph);overlay.append(edge);
      edge.addEventListener('pointerdown',event=>{event.preventDefault();event.stopPropagation();});
      edge.addEventListener('mousedown',event=>{event.preventDefault();event.stopPropagation();});
      edge.addEventListener('click',event=>{event.stopPropagation();scroller.scrollBy({left:direction*Math.max(96,scroller.clientWidth*.7),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});request();});
    }
    scroller.parentElement.append(overlay);tracked.set(scroller,overlay);observe(scroller);
    for(const child of scroller.children)observe(child);
    request();
  }
  function scan(root){if(!(root instanceof Element)||root.closest('.toolbar-scroll-indicators'))return;if(root.matches(areas))add(root);root.querySelectorAll(areas).forEach(add);}
  const visible=(overlay,show)=>{if(show){overlay.hidden=false;if(!overlay.matches(':popover-open'))overlay.showPopover();}else{if(overlay.matches(':popover-open'))overlay.hidePopover();overlay.hidden=true;}};
  function paint(){
    frame=0;for(const node of observed)if(!node.isConnected){resize.unobserve(node);observed.delete(node);}
    for(const [scroller,overlay] of tracked){
      if(!scroller.isConnected){resize.unobserve(scroller);for(const child of scroller.children)resize.unobserve(child);overlay.remove();tracked.delete(scroller);continue;}
      const max=scroller.scrollWidth-scroller.clientWidth;if(max<=2){visible(overlay,false);continue;}
      const style=getComputedStyle(scroller),rect=scroller.getBoundingClientRect();
      const eligible=/auto|scroll/.test(style.overflowX)&&max>2&&rect.width>80&&rect.height>12&&!scroller.closest('[inert]');
      if(!eligible){visible(overlay,false);continue;}
      const left=Math.max(rect.left,0),right=Math.min(rect.right,innerWidth),top=Math.max(rect.top,0),bottom=Math.min(rect.bottom,innerHeight);
      if(right-left<80||bottom-top<12){visible(overlay,false);continue;}
      if(overlay.parentElement!==scroller.parentElement){visible(overlay,false);scroller.parentElement.append(overlay);}
      visible(overlay,true);
      Object.assign(overlay.style,{left:`${left}px`,top:`${top}px`,width:`${right-left}px`,height:`${bottom-top}px`});
      // A contextual panel, dialog or sidebar must keep ownership of the pointer.
      for(const [side,more] of [['start',scroller.scrollLeft>1],['end',scroller.scrollLeft<max-1]]){
        const button=overlay.querySelector(`[data-toolbar-scroll="${side}"]`);button.hidden=!more;
        if(!more)continue;
        const box=button.getBoundingClientRect(),x=box.left+box.width/2,y=box.top+box.height/2;
        const under=document.elementsFromPoint(x,y).find(node=>!node.closest('.toolbar-scroll-indicators'));
        button.hidden=!under||!(scroller===under||scroller.contains(under));
      }
      visible(overlay,[...overlay.children].some(button=>!button.hidden));
    }
  }
  const mutations=new MutationObserver(records=>{
    let changed=false;
    for(const record of records){
      const target=record.target instanceof Element?record.target:record.target.parentElement;
      if(target?.closest('.toolbar-scroll-indicators'))continue;
      if(target?.closest('#canvas-world,.cm-content,.document-prose,[contenteditable="true"]'))continue;
      if(record.type==='attributes')changed ||= record.attributeName==='open'||record.attributeName==='hidden'||[...tracked.keys()].some(node=>target===node||target.contains(node));
      else changed ||= [...record.addedNodes,...record.removedNodes].some(node=>node instanceof Element);
      for(const node of record.addedNodes)scan(node);
      for(const [scroller] of tracked)if(target===scroller){for(const child of scroller.children)observe(child);}
    }
    if(changed)request();
  });
  mutations.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['style','class','hidden','open']});
  const panels='[popover], .selection-popover, .document-panel, [role="listbox"], [role="menu"], [role="dialog"], dialog';
  const focus=event=>{const fromPointer=pointerTarget&&(pointerTarget===event.target||event.target.contains(pointerTarget));pointerTarget=null;if(fromPointer||event.target.closest('.toolbar-scroll-indicators'))return;for(const [scroller] of tracked)if(scroller.contains(event.target)&&event.target.closest(panels)===scroller.closest(panels)&&scroller.scrollWidth>scroller.clientWidth+2){
    const fit=()=>{if(!scroller.isConnected||document.activeElement!==event.target)return;
      const row=scroller.getBoundingClientRect(),item=event.target.getBoundingClientRect();
      scroller.scrollTo({left:scroller.scrollLeft+item.left+item.width/2-row.left-row.width/2,behavior:'instant'});request();};
    fit();requestAnimationFrame(fit);
  }};
  document.addEventListener('focusin',focus,{signal:life.signal});
  document.addEventListener('pointerdown',event=>{pointerTarget=event.target;},{capture:true,passive:true,signal:life.signal});
  document.addEventListener('pointerup',()=>{pointerTarget=null;},{capture:true,passive:true,signal:life.signal});
  document.addEventListener('pointercancel',()=>{pointerTarget=null;},{capture:true,passive:true,signal:life.signal});
  document.addEventListener('keydown',()=>{pointerTarget=null;},{capture:true,signal:life.signal});
  document.addEventListener('toggle',event=>{if(!event.target.closest?.('.toolbar-scroll-indicators'))request();},{capture:true,signal:life.signal});
  document.addEventListener('scroll',request,{capture:true,passive:true,signal:life.signal});
  window.addEventListener('resize',request,{passive:true,signal:life.signal});
  window.visualViewport?.addEventListener('resize',request,{passive:true,signal:life.signal});
  document.fonts?.addEventListener('loadingdone',request,{signal:life.signal});
  scan(document.body);
  return {destroy(){life.abort();mutations.disconnect();resize.disconnect();cancelAnimationFrame(frame);for(const [scroller,overlay] of tracked){scroller.removeAttribute('data-scroll-controls');overlay.remove();}tracked.clear();observed.clear();}};
}
