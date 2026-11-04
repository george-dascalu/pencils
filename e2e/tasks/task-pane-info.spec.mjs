// One geometry decision docks auxiliary panes on the left or switches the content.
import {test,expect,onDevices,useApp} from '../fixtures.mjs';
import {chooseCardPane} from '../helpers/card-panes.mjs';
import {presetCamera} from '../helpers/board-canvas.mjs';

const app=useApp(async store=>{
  const project=await store.createProject({title:'Card panes',key:'PN'});
  let card=await store.createTask(project.id,{title:'Pane card',body:'## Description\n\n'+ 'Keep these details.\n\n'.repeat(40)});
  for(let i=0;i<11;i++)card=await store.updateTask(project.id,card.id,{revision:card.revision,title:`Pane card ${i}`});
  const board=(await store.snapshot(project.id)).boards[0];
  await store.updateBoard(project.id,board.id,{revision:board.revision,nodes:[{id:'card',type:'task',task:card.id,x:150,y:120,w:400,h:260}],edges:[]});
  return {project,card,board};
});
async function open(page,view){
  if(view==='board')await presetCamera(page,app.board.id,{x:-100,y:10,z:0.7});
  await page.goto(`${app.base}/#project/${app.project.id}/${view}`);
  await page.locator(view==='board'?'[data-node="card"] [data-pro="task-details"]':`[data-action="task-open"][data-id="${app.card.id}"]:visible`).first().click();
  await expect(page.locator('#task-form')).toBeVisible();
}
// A resize applies the new layout on the next resize event, so wait for it before measuring or choosing a pane.
const layout=(page,split)=>expect(page.locator('.task-dialog')).toHaveAttribute('data-pane-layout',split?'split':'compact');
async function geometry(page,pane,split){
  await layout(page,split);
  const form=page.locator('#task-form'),panel=form.locator(pane==='history'?'.task-history-panel':'.task-comments-panel'),body=form.locator('.task-editor-content > .dialog-body');
  await expect(panel).toHaveCSS('position','static');
  const [p,d]=await Promise.all([panel.boundingBox(),page.locator('.task-dialog').boundingBox()]);
  expect(p.x).toBeGreaterThanOrEqual(d.x);expect(p.x+p.width).toBeLessThanOrEqual(d.x+d.width+1);
  if(page.viewportSize().width>600)expect(p.y+p.height).toBeLessThanOrEqual(d.y+d.height+1);
  if(split){
    await expect(body).toBeVisible();const b=await body.boundingBox();
    expect(p.x+p.width).toBeLessThanOrEqual(b.x+1);
    expect(Math.abs(p.y-b.y)).toBeLessThanOrEqual(1);
    expect(b.width).toBeGreaterThanOrEqual(620);
    await expect(form.getByRole('combobox',{name:'Card section',exact:true})).toBeHidden();
  }else{
    await expect(body).toBeHidden();
    await expect(form.getByRole('combobox',{name:'Card section',exact:true})).toHaveValue(pane);
  }
}

onDevices(['desktop','ipad','phone'],()=>{
  test('the compact picker supports taps and keyboard dismissal without losing the card @gate',async({page,device})=>{
    await page.setViewportSize({width:device==='phone'?390:820,height:900});
    await page.emulateMedia({reducedMotion:'no-preference'});
    await open(page,'list');
    const picker=page.getByRole('combobox',{name:'Card section',exact:true});
    for(const [pane,label] of [['history','Versions'],['comments','Comments']]){
      if(device==='desktop')await picker.click();else await picker.tap();
      const option=page.locator('#shared-select-menu').getByRole('option',{name:label,exact:true});
      if(device==='desktop')await option.click();else await option.tap();
      await expect(picker).toHaveValue(pane);
      await expect(page.locator(pane==='history'?'.task-history-head h3':'.task-comments-panel .board-comments-head strong')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(picker).toHaveValue('details');
      if(device==='desktop')await expect(picker).toBeFocused();
      await expect(page.locator('#task-form')).toBeVisible();
    }
  });
  for(const view of ['list','board'])test(`${view}: panes use the left side without covering details, or one compact section picker @gate`,async({page,device})=>{
    await open(page,view);
    const widths=device==='desktop'?[1440,1180,1024,900,760]:device==='ipad'?[1024,820]:[390,320];
    for(const width of widths){
      await page.setViewportSize({width,height:900});
      const split=width>=1024;
      await layout(page,split);
      await expect(page.getByRole('button',{name:'Card details',exact:true})).toHaveCount(0);
      for(const pane of ['history','comments']){
        await chooseCardPane(page,pane);await geometry(page,pane,split);
      }
      await chooseCardPane(page,'details');
    }
  });
});

test('resizing an open discussion preserves both the comment draft and detail edits @gate',async({page})=>{
  await open(page,'list');await chooseCardPane(page,'comments');
  const draft=page.locator('.task-comments-panel [contenteditable="true"]');await draft.fill('Keep this unsent comment');
  await page.locator('#task-form [name="title"]').fill('An edit beside the discussion');
  for(const width of [900,1440,820,1180]){
    await page.setViewportSize({width,height:900});await expect(draft).toHaveText('Keep this unsent comment');
    await geometry(page,'comments',width>=1024);
  }
  await chooseCardPane(page,'details');await expect(page.locator('#task-form [name="title"]')).toHaveValue('An edit beside the discussion');
});

test('details and history scroll separately and neither scrolls the workspace behind the card @gate',async({page})=>{
  await page.setViewportSize({width:1440,height:560});
  await open(page,'list');await chooseCardPane(page,'history');
  const panel=page.locator('.task-history-panel'),body=page.locator('.task-editor-content > .dialog-body');
  await expect.poll(()=>panel.evaluate(el=>el.scrollHeight-el.clientHeight)).toBeGreaterThan(0);
  await expect.poll(()=>body.evaluate(el=>el.scrollHeight-el.clientHeight)).toBeGreaterThan(0);
  const original=await page.locator('#view-content').evaluate(el=>el.scrollTop);
  const target=await panel.evaluate(el=>el.scrollHeight-el.clientHeight);
  await panel.hover();
  // Firefox caps a wheel event to one screen; keep scrolling until the boundary.
  await expect.poll(async()=>{await page.mouse.wheel(0,5000);return panel.evaluate(el=>el.scrollTop);}).toBe(target);
  expect(await body.evaluate(el=>el.scrollTop)).toBe(0);
  const historyTop=await panel.evaluate(el=>el.scrollTop);const b=await body.boundingBox();await page.mouse.move(b.x+b.width-8,b.y+40);await page.mouse.wheel(0,400);
  await expect.poll(()=>body.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
  expect(await panel.evaluate(el=>el.scrollTop)).toBe(historyTop);expect(await page.locator('#view-content').evaluate(el=>el.scrollTop)).toBe(original);
});
