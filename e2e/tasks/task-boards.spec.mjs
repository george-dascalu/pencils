import {test,expect,useApp,onDevices} from '../fixtures.mjs';
import {newCard} from '../helpers/new-card.mjs';
import {chooseCardPane,cardSection,chooseCardSection} from '../helpers/card-panes.mjs';
const app=useApp(async store=>{
 const project=await store.createProject({title:'Card board links',key:'BL'}),card=await store.createTask(project.id,{title:'Plan the launch',body:'Keep this description.'});
 const board=await store.createBoard(project.id,{title:'Launch canvas'}),other=await store.createBoard(project.id,{title:'Research canvas'});
 let legacy=await store.createBoard(project.id,{title:'Legacy linked canvas'});
 legacy=await store.updateBoard(project.id,legacy.id,{revision:legacy.revision,settings:{...legacy.settings,linked_tasks:[card.id]}});
 const doc=await store.createDocument(project.id,{title:'Launch brief',body:'Brief'});
 return{project,card,board,other,legacy,doc};
});
async function open(page,card){await page.goto(`${app.base}/#project/${app.project.id}/list`);await page.locator(`[data-action="task-open"][data-id="${card.id}"]:visible`).first().click();await expect(page.locator('#task-form')).toBeVisible();await chooseCardSection(page,'Boards');}
const section=page=>cardSection(page,'Boards');
onDevices(['desktop','ipad','phone'],()=>{
 test('cards link, search, open and unlink boards with the same controls as Documents @gate',async({page,device})=>{
  await page.emulateMedia({reducedMotion:'no-preference'});
  const card=await app.store.createTask(app.project.id,{title:'Device board links'});await open(page,card);
  const boards=section(page);await expect(boards).toBeVisible();
  const add=boards.getByRole('button',{name:'Link a board',exact:true});await add.click();
  expect((await add.boundingBox()).height).toBeGreaterThanOrEqual(device==='desktop'?32:44);
  // Below the card's tabs (F0.23-10) on desktop and iPad; stacked on phones.
  // In the card's tabs the tab row is the section's own first row (F0.23-23).
  await expect(boards).toHaveCSS('margin-top',device==='phone'?'20px':'0px');
  const picker=page.getByRole('dialog',{name:'Link a board',exact:true});await expect(picker).toBeVisible();
  await expect(picker).toHaveCSS('transition-property','opacity, translate, scale');
  await expect(picker).toHaveCSS('padding','8px');
  if(device!=='desktop')await expect(picker.getByRole('searchbox')).not.toBeFocused();
  const b=await picker.boundingBox();expect(b.x).toBeGreaterThanOrEqual(0);expect(b.x+b.width).toBeLessThanOrEqual(page.viewportSize().width+1);
  await picker.getByRole('searchbox',{name:'Find a board',exact:true}).fill('Launch');
  await expect(picker.locator('[data-board-link-add]')).toHaveCount(1);await picker.locator(`[data-board-link-add="${app.board.id}"]`).click();
  await expect.poll(async()=> (await app.store.snapshot(app.project.id)).tasks.find(v=>v.id===card.id).boards).toEqual([app.board.id]);
  await page.reload();await page.locator(`[data-action="task-open"][data-id="${card.id}"]:visible`).first().click();
  await expect(section(page).locator(`[data-board-open="${app.board.id}"]`)).toHaveText('Launch canvas');
  await section(page).getByRole('button',{name:'Link a board',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Link a board',exact:true}).locator(`[data-board-link-add="${app.board.id}"]`)).toHaveCount(0);
  await page.keyboard.press('Escape');await expect(page.locator('#task-form')).toBeVisible();
  await section(page).locator(`[data-board-open="${app.board.id}"]`).click();
  await expect(page.locator('#task-form')).toHaveCount(0);await expect(page.locator(`.board-tools[data-board="${app.board.id}"]`)).toBeVisible();
  await open(page,card);await section(page).getByRole('button',{name:'Remove Launch canvas',exact:true}).click();
  await expect.poll(async()=> (await app.store.snapshot(app.project.id)).tasks.find(v=>v.id===card.id).boards).toEqual([]);
  await expect(section(page)).toContainText('No linked boards.');
 });
});
test('new cards save linked boards, preserve Document links, and show board names in version history',async({page})=>{
 await page.goto(`${app.base}/#project/${app.project.id}/list`);await newCard(page);
 await page.locator('#task-form [name=title]').fill('New linked card');await chooseCardSection(page,'Boards');
 await section(page).getByRole('button',{name:'Link a board',exact:true}).click();await page.locator(`[data-board-link-add="${app.board.id}"]`).click();
 await chooseCardSection(page,'Documents');await page.locator('.task-documents [data-document-link-toggle]').click();await page.locator(`[data-document-link-add="${app.doc.id}"]`).click();
 await page.getByRole('button',{name:'Create card',exact:true}).click();
 await expect.poll(async()=>(await app.store.snapshot(app.project.id)).tasks.find(v=>v.title==='New linked card')?.boards).toEqual([app.board.id]);
 const card=(await app.store.snapshot(app.project.id)).tasks.find(v=>v.title==='New linked card');expect(card.documents).toEqual([app.doc.id]);
 await open(page,card);await section(page).getByRole('button',{name:'Remove Launch canvas',exact:true}).click();
 await chooseCardPane(page,'history');await expect(page.locator('.task-history-panel')).toContainText('Boards');await expect(page.locator('.task-history-panel')).toContainText('Launch canvas');
});
test('existing board-to-card links appear once in Boards and do not create a second Canvases section',async({page})=>{
 await open(page,app.card);await expect(section(page)).toContainText('Linked from');await expect(section(page).locator(`[data-board-open="${app.legacy.id}"]`)).toHaveCount(1);
 await expect(page.getByRole('heading',{name:'Canvases',exact:true})).toHaveCount(0);
});
test('browser drafts restore every selected board before a new card is created',async({page})=>{
 await page.goto(`${app.base}/#project/${app.project.id}/list`);await newCard(page);await chooseCardSection(page,'Boards');
 for(const board of [app.board,app.other]){await section(page).getByRole('button',{name:'Link a board',exact:true}).click();await page.locator(`[data-board-link-add="${board.id}"]`).click();}
 page.once('dialog',dialog=>dialog.accept());
 await page.locator('.task-dialog [data-action="dialog-close"]').click();
 await newCard(page);await page.getByRole('button',{name:'Restore draft',exact:true}).click();
 await expect(section(page).locator('[data-board-open]')).toHaveCount(2);
 await page.locator('#task-form [name=title]').fill('Restored board links');await page.getByRole('button',{name:'Create card',exact:true}).click();
 await expect.poll(async()=>(await app.store.snapshot(app.project.id)).tasks.find(v=>v.title==='Restored board links')?.boards).toEqual([app.board.id,app.other.id]);
});
test('an unavailable board keeps an editable link that can be removed without opening it',async({page})=>{
 const board=await app.store.createBoard(app.project.id,{title:'Removed canvas'});
 const card=await app.store.createTask(app.project.id,{title:'Keep the reference',boards:[board.id]});
 await app.store.removeRecord(app.project.id,'boards',board.id,board.revision);await open(page,card);
 await expect(section(page).locator(`[data-board-open="${board.id}"]`)).toBeDisabled();
 await section(page).getByRole('button',{name:'Remove Unavailable board',exact:true}).click();
 await expect.poll(async()=>(await app.store.snapshot(app.project.id)).tasks.find(v=>v.id===card.id).boards).toEqual([]);
});
test('turning off Boards hides its link controls and preserves existing links when editing the card',async({page})=>{
 const project=await app.store.createProject({title:'Boards disabled',schema:{views_off:['board']}}),board=(await app.store.snapshot(project.id)).boards[0];
 const card=await app.store.createTask(project.id,{title:'Linked but hidden',boards:[board.id]});
 await page.goto(`${app.base}/#project/${project.id}/list`);await page.locator(`[data-action="task-open"][data-id="${card.id}"]:visible`).first().click();
 await expect(section(page)).toHaveCount(0);await page.locator('#task-form [name=title]').fill('Edited with Boards disabled');
 await expect.poll(async()=>(await app.store.snapshot(project.id)).tasks.find(v=>v.id===card.id)?.title).toBe('Edited with Boards disabled');
 expect((await app.store.snapshot(project.id)).tasks.find(v=>v.id===card.id).boards).toEqual([board.id]);
});
test('a board link stays queued through a failed save and reload, then saves after reconnection',async({page})=>{
 const card=await app.store.createTask(app.project.id,{title:'Offline link'});await open(page,card);
 const endpoint=`**/api/projects/${app.project.id}/tasks/${card.id}`;
 await page.route(endpoint,route=>route.request().method()==='PATCH'?route.fulfill({status:503,json:{error:'Test offline'}}):route.continue());
 await section(page).getByRole('button',{name:'Link a board',exact:true}).click();await page.locator(`[data-board-link-add="${app.board.id}"]`).click();
 await expect(page.locator('[data-autosave-status]')).toContainText('Pending');
 await page.reload();await page.locator(`[data-action="task-open"][data-id="${card.id}"]:visible`).first().click();
 await expect(section(page).locator(`[data-board-open="${app.board.id}"]`)).toBeVisible();
 await page.unroute(endpoint);
 await expect.poll(async()=>(await app.store.snapshot(app.project.id)).tasks.find(v=>v.id===card.id).boards,{timeout:15000}).toEqual([app.board.id]);
});
