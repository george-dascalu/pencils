// Owner request: every horizontally scrolling toolbar makes its overflow visible.
import { test, expect, useApp, onDevices } from '../fixtures.mjs';
const app=useApp();
onDevices(['desktop','ipad','phone'],()=>{
  test('scrolling toolbars show directional controls only where more tools are available @gate',async({page,device})=>{
    await page.emulateMedia({reducedMotion:"no-preference"});
    await page.goto(app.base);
    await page.evaluate(()=>{
      const row=document.createElement('div');row.id='test-scroll-toolbar';row.setAttribute('role','toolbar');row.setAttribute('aria-label','test tools');
      Object.assign(row.style,{position:'fixed',left:'20px',top:'160px',width:'240px',height:'var(--control-height)',display:'flex',overflowX:'auto',overflowY:'hidden',gap:'0',zIndex:'105',background:'var(--surface)'});
      for(let i=0;i<14;i++){const b=document.createElement('button');b.type='button';b.className='icon-button';b.textContent=String(i+1);b.setAttribute('aria-label',`Tool ${i+1}`);b.style.flex='0 0 var(--control-height)';row.append(b);}document.body.append(row);
    });
    const row=page.locator('#test-scroll-toolbar'),hints=page.locator('[data-scroll-toolbar="test-scroll-toolbar"]'),left=hints.locator('[data-toolbar-scroll=start]'),right=hints.locator('[data-toolbar-scroll=end]');
    await expect(right).toBeVisible();await expect(left).toBeHidden();
    await page.evaluate(()=>window.PencilsToast('Escape still works',true));await page.keyboard.press('Escape');await expect(page.getByText('Escape still works',{exact:true})).toHaveCount(0,{timeout:1500});
    // Subtle (F0.21-82): no box, border or shadow, a fade over the row's edge and a small muted chevron
    // that fades and slides in and out, keeping its full-size target.
    const style=await right.evaluate(node=>{const css=getComputedStyle(node),fade=getComputedStyle(node,'::before'),icon=node.querySelector('svg').getBoundingClientRect(),r=node.getBoundingClientRect(),probe=document.createElement('span');probe.style.color='var(--muted)';document.body.append(probe);const muted=getComputedStyle(probe).color;probe.remove();return {background:css.backgroundColor,width:Math.round(r.width),height:Math.round(r.height),color:css.color,muted,border:css.borderTopWidth,shadow:css.boxShadow,fade:fade.backgroundImage,icon:icon.width,motion:css.transitionProperty,duration:parseFloat(css.transitionDuration)};});
    expect(style.background).toBe('rgba(0, 0, 0, 0)');expect(style.border).toBe('0px');expect(style.shadow).toBe('none');expect(style.fade).toContain('gradient');
    expect(style.color).toBe(style.muted);expect(style.icon).toBeLessThanOrEqual(16);
    expect(style.motion).toContain('opacity');expect(style.duration).toBeGreaterThan(0);
    expect(style.width).toBeGreaterThanOrEqual(device==='desktop'?28:44);expect(style.height).toBeGreaterThanOrEqual(device==='desktop'?28:44);
    const widthBefore=await row.evaluate(el=>el.clientWidth);
    await right.click();await expect(left).toBeVisible();await expect.poll(()=>row.evaluate(el=>el.scrollLeft)).toBeGreaterThan(0);
    // A fling to the end fades the end arrow out (sliding outwards) rather than dropping it.
    await row.evaluate(el=>el.scrollLeft=el.scrollWidth);await expect(right).not.toHaveAttribute('data-shown');
    const leaving=await right.evaluate(node=>({opacity:getComputedStyle(node).opacity,pointer:getComputedStyle(node).pointerEvents}));
    expect(leaving.pointer,'a leaving arrow takes no taps').toBe('none');
    await expect(right).toBeHidden();await expect(left).toBeVisible();
    await left.click();await expect(right).toBeVisible();
    await row.getByRole('button',{name:'Tool 14',exact:true}).focus();await expect(right).toBeHidden();
    expect(await row.evaluate(el=>el.clientWidth)).toBe(widthBefore);
    await row.evaluate(el=>{while(el.children.length>2)el.lastElementChild.remove();});await expect(hints).toBeHidden();
    await row.evaluate(el=>el.remove());await expect(hints).toHaveCount(0);
  });
  test('with reduced motion the arrows show and hide at once',async({page})=>{
    await page.goto(app.base);
    await page.evaluate(()=>{const row=document.createElement('div');row.id='still-toolbar';row.setAttribute('role','toolbar');Object.assign(row.style,{position:'fixed',left:'20px',top:'160px',width:'240px',height:'var(--control-height)',display:'flex',overflowX:'auto',zIndex:'105'});for(let i=0;i<12;i++){const b=document.createElement('button');b.className='icon-button';b.textContent='x';b.style.flex='0 0 var(--control-height)';row.append(b);}document.body.append(row);});
    const end=page.locator('[data-scroll-toolbar="still-toolbar"] [data-toolbar-scroll=end]');await expect(end).toBeVisible();
    expect(await end.evaluate(node=>getComputedStyle(node).transitionDuration.split(',').every(d=>parseFloat(d)===0))).toBe(true);
  });
  test('toolbar arrows follow their row and never cover a contextual panel @gate',async({page})=>{
    await page.goto(app.base);
    await page.evaluate(()=>{
      const row=document.createElement('div');row.id='test-layer-toolbar';row.setAttribute('role','toolbar');Object.assign(row.style,{position:'fixed',left:'20px',top:'160px',width:'240px',height:'var(--control-height)',display:'flex',overflowX:'auto',zIndex:'105',background:'var(--surface)'});
      for(let i=0;i<12;i++){const b=document.createElement('button');b.className='icon-button';b.textContent='x';b.style.flex='0 0 var(--control-height)';row.append(b);}document.body.append(row);
    });
    const hint=page.locator('[data-scroll-toolbar="test-layer-toolbar"]'),end=hint.locator('[data-toolbar-scroll=end]');await expect(end).toBeVisible();
    await page.locator('#test-layer-toolbar').evaluate(row=>row.style.top='220px');await expect.poll(async()=>Math.round((await hint.boundingBox()).y)).toBe(220);
    await page.evaluate(()=>{const cover=document.createElement('div');cover.id='test-toolbar-cover';Object.assign(cover.style,{position:'fixed',left:'10px',top:'210px',width:'270px',height:'80px',zIndex:'120',background:'var(--surface)'});document.body.append(cover);});
    await expect(hint).toBeHidden();await page.locator('#test-toolbar-cover').evaluate(node=>node.remove());await expect(end).toBeVisible();
  });
  test('toolbar arrows stay usable inside a modal and disappear with their owner @gate',async({page})=>{
    await page.goto(app.base);await page.evaluate(()=>{
      const dialog=document.createElement('dialog');dialog.id='toolbar-test-dialog';const row=document.createElement('div');row.id='modal-scroll-toolbar';row.setAttribute('role','toolbar');Object.assign(row.style,{width:'240px',height:'var(--control-height)',display:'flex',overflowX:'auto'});
      for(let i=0;i<12;i++){const button=document.createElement('button');button.type='button';button.className='icon-button';button.textContent='x';button.style.flex='0 0 var(--control-height)';row.append(button);}dialog.append(row);document.body.append(dialog);dialog.showModal();
    });
    const hint=page.locator('[data-scroll-toolbar="modal-scroll-toolbar"]');await expect(hint.locator('[data-toolbar-scroll=end]')).toBeVisible();await hint.locator('[data-toolbar-scroll=end]').click();
    await expect.poll(()=>page.locator('#modal-scroll-toolbar').evaluate(el=>el.scrollLeft)).toBeGreaterThan(0);
    await page.locator('#toolbar-test-dialog').evaluate(el=>el.close());await expect(hint).toBeHidden();
  });
  test('rapid toolbar replacement leaves no detached indicators or errors @gate',async({page})=>{
    await page.goto(app.base);await page.evaluate(()=>{for(let i=0;i<20;i++){const row=document.createElement('div');row.id=`transient-toolbar-${i}`;row.setAttribute('role','toolbar');document.body.append(row);row.remove();}});
    await expect(page.locator('[data-scroll-toolbar^="transient-toolbar-"]')).toHaveCount(0);
  });
  test('a Table document keeps its real formatting controls usable while its toolbar scrolls @gate',async({page},info)=>{
    const project=await app.store.createProject({title:'Scrolling table controls'}),record=await app.store.mutate(()=>app.store.createDocument(project.id,{title:'Table controls',document_type:'table'}));
    await page.goto(`${app.base}/#project/${project.id}/documents/${record.id}`);await expect(page.locator('.document-sheet')).toHaveAttribute('data-ready','true');
    const tools=page.getByRole('toolbar',{name:'Format table',exact:true});await tools.evaluate(el=>el.style.maxWidth='240px');
    const id=await tools.getAttribute('id'),hints=page.locator(`[data-scroll-toolbar="${id}"]`);await expect(hints.locator('[data-toolbar-scroll=end]')).toBeVisible();
    await hints.locator('[data-toolbar-scroll=end]').click();await expect.poll(()=>tools.evaluate(el=>el.scrollLeft)).toBeGreaterThan(0);
    const bold=tools.getByRole('button',{name:'Bold',exact:true});await bold.click();await expect(bold).toHaveAttribute('aria-pressed','true');
    await page.screenshot({path:info.outputPath('table-toolbar.png')});
  });
});
