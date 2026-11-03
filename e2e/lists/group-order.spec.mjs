import {test,expect,useApp,onDevices} from '../fixtures.mjs';
const app=useApp();
// The visible List groups, top to bottom.
const groups=page=>page.locator('#view-content section.list-group').evaluateAll(sections=>sections.map(s=>s.dataset.taskDropValue));
const heading=(page,value)=>page.locator(`#view-content section[data-task-drop-value="${value}"] > .section-title`);
const handle=(page,value)=>heading(page,value).locator('[data-group-reorder]');
const toggle=page=>page.locator('[data-feature="group-direction"]');
async function seed(){
  const project=await app.store.createProject({title:'Group order',schema:{statuses:['todo','doing','done'],done:['done'],types:['task','bug']}});
  // Manual card order puts Zoe's card first, so first-appearance grouping would start with Zoe.
  await app.store.createTask(project.id,{title:'Zed card',status:'done',type:'bug',assignee:'Zoe',priority:'low',order:0});
  await app.store.createTask(project.id,{title:'Middle card',status:'doing',type:'task',assignee:'Alice',priority:'urgent',order:1024});
  await app.store.createTask(project.id,{title:'First card',status:'todo',type:'task',assignee:'Mia',priority:'medium',order:2048});
  return project;
}
async function open(page,project){await page.goto(`${app.base}/#project/${project.id}/list`);await expect(page.locator('#view-content section.list-group').first()).toBeVisible();}
// Runs steps with Filters (View options on phones) open, then closes it.
async function inFilters(page,device,steps){
  const phone=device==='phone',trigger=page.locator(phone?'.mobile-view-options > summary':'[data-board-menu="filters"] > summary');
  await trigger.click();await steps();
  if(phone)await page.getByRole('button',{name:'Close view options',exact:true}).click();else await trigger.click();
}
const groupBy=(page,device,value)=>inFilters(page,device,()=>page.locator('#group-by').selectOption(value));
const reverse=(page,device,pressed)=>inFilters(page,device,async()=>{await toggle(page).click();await expect(toggle(page)).toHaveAttribute('aria-pressed',String(pressed));await expect(toggle(page)).toBeFocused();});
async function dragHeading(page,value,target,{cancel=false}={}){
  const grip=handle(page,value);await grip.scrollIntoViewIfNeeded();const r=await grip.boundingBox();
  await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down();await page.mouse.move(r.x+r.width/2,r.y+r.height/2+10,{steps:3});
  await expect(page.locator('.task-group-ghost')).toBeVisible();
  const t=await heading(page,target).boundingBox();await page.mouse.move(t.x+40,t.y+4,{steps:8});
  await expect(page.locator('.task-reorder-marker')).toBeVisible();
  if(cancel)await page.keyboard.press('Escape');
  await page.mouse.up();await expect(page.locator('.task-group-ghost')).toHaveCount(0);
}

onDevices(['desktop','ipad','phone'],()=>{
  test('Group by reverses the group order beside its control, per grouping field and after a reload @gate',async({page,device})=>{
    const project=await seed();await open(page,project);
    expect(await groups(page)).toEqual(['todo','doing','done']);
    await inFilters(page,device,async()=>{
      // Measured once the panel has settled (phones move the fields into View options).
      await expect(async()=>{
        const select=await page.locator('#group-by').boundingBox(),button=await toggle(page).boundingBox(),viewport=page.viewportSize();
        expect(Math.abs((button.y+button.height/2)-(select.y+select.height/2)),'one row with Group by').toBeLessThanOrEqual(4);
        expect(button.x,'after the select').toBeGreaterThan(select.x+select.width-1);
        expect(button.x+button.width,'inside the screen').toBeLessThanOrEqual(viewport.width);
        if(device!=='desktop')expect(Math.min(button.width,button.height)).toBeGreaterThanOrEqual(44);
      }).toPass();
      await expect(toggle(page)).toHaveAttribute('aria-pressed','false');
      await expect(toggle(page)).toHaveAccessibleName('Reverse group order');
    });
    await reverse(page,device,true);
    await expect.poll(()=>groups(page)).toEqual(['done','doing','todo']);
    await inFilters(page,device,async()=>{
      const colors=await toggle(page).evaluate(el=>{const probe=document.createElement('span');probe.style.color='var(--green)';document.body.append(probe);const accent=getComputedStyle(probe).color;probe.remove();return {color:getComputedStyle(el).color,accent};});
      expect(colors.color,'a reversed order is shown in the accent colour').toBe(colors.accent);
    });
    await page.reload();await expect.poll(()=>groups(page)).toEqual(['done','doing','todo']);
    // Other fields keep their natural order: priority high to low, assignees A to Z.
    await groupBy(page,device,'priority');await expect.poll(()=>groups(page)).toEqual(['urgent','medium','low']);
    await groupBy(page,device,'assignee');await expect.poll(()=>groups(page)).toEqual(['Alice','Mia','Zoe']);
    await reverse(page,device,true);await expect.poll(()=>groups(page)).toEqual(['Zoe','Mia','Alice']);
    await groupBy(page,device,'status');await expect.poll(()=>groups(page)).toEqual(['done','doing','todo']);
    await reverse(page,device,false);await expect.poll(()=>groups(page)).toEqual(['todo','doing','done']);
  });
});

onDevices(['desktop','phone'],()=>{
  test('dragging a group heading sets the group order, which the toggle then reverses @gate',async({page,device})=>{
    const project=await seed();await open(page,project);
    const cards=async()=>(await app.store.snapshot(project.id)).tasks.map(({id,status,order})=>({id,status,order})).sort((a,b)=>a.id.localeCompare(b.id));
    const before=await cards();
    await dragHeading(page,'done','todo',{cancel:true});
    expect(await groups(page),'Escape cancels').toEqual(['todo','doing','done']);
    await dragHeading(page,'done','todo');
    await expect.poll(()=>groups(page)).toEqual(['done','todo','doing']);
    await expect(handle(page,'done')).toBeFocused();
    expect(await cards(),'moving a group changes no card').toEqual(before);
    await page.reload();await expect.poll(()=>groups(page)).toEqual(['done','todo','doing']);
    await expect(heading(page,'done'),'the heading leaves out its handle').toHaveAccessibleName('Done, 1 card');
    await handle(page,'done').focus();await page.keyboard.press('Alt+ArrowUp');
    await expect(page.locator('#task-reorder-status')).toHaveText('This group is already first.');
    expect(await groups(page)).toEqual(['done','todo','doing']);
    await page.keyboard.press('Alt+ArrowDown');
    await expect.poll(()=>groups(page)).toEqual(['todo','done','doing']);
    await expect(handle(page,'done')).toBeFocused();
    await reverse(page,device,true);await expect.poll(()=>groups(page)).toEqual(['doing','done','todo']);
    // Dragging a reversed order keeps what is shown and turns the toggle off.
    await dragHeading(page,'todo','doing');
    await expect.poll(()=>groups(page)).toEqual(['todo','doing','done']);
    await inFilters(page,device,()=>expect(toggle(page)).toHaveAttribute('aria-pressed','false'));
    // Grouping by another field starts from its own natural order.
    await groupBy(page,device,'assignee');await expect.poll(()=>groups(page)).toEqual(['Alice','Mia','Zoe']);
  });
});
