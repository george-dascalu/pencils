import {test,expect,onDevices,useApp} from '../fixtures.mjs';
import {axeViolations} from '../helpers/documents.mjs';
const app=useApp(async()=>({}));
let project,docs;
test.beforeEach(async()=>{
  project=await app.store.createProject({title:'Pane pickers'});project=await app.store.updateProject(project.id,{revision:project.revision,document_folders:[{id:'folder-finance',title:'Finance',parent:null}]});
  const a=await app.store.createDocument(project.id,{title:'Alpha notes',body:'Alpha text\n'}),b=await app.store.createDocument(project.id,{title:'Beta notes',body:'Beta text\n'}),c=await app.store.createDocument(project.id,{title:'Project budget',document_type:'table',folder:'folder-finance'}),d=await app.store.createDocument(project.id,{title:'Planning guide',body:'Guide text #planning\n'});docs={a,b,c,d};
});
const first=page=>page.locator('#document-form'),second=page=>page.locator('.document-pane');
async function open(page){await page.goto(`${app.base}/#project/${project.id}/documents/${docs.a.id}`);await expect(first(page).locator(".cm-content")).toContainText("Alpha text");await page.goto(`${app.base}/#project/${project.id}/documents/${docs.b.id}`);await expect(first(page).locator(".cm-content")).toContainText("Beta text");await first(page).locator('[data-document-action=tools]').click();await page.getByRole('button',{name:'Split side by side',exact:true}).click();await expect(second(page)).toBeVisible();}
onDevices(['desktop','ipad'],()=>test('both panes have searchable file pickers and changing the first keeps the second editor and its undo history',{tag:'@gate'},async({page,device})=>{
  await open(page);const left=first(page).getByRole('combobox',{name:'Document in the first pane',exact:true}),right=second(page).getByRole('combobox',{name:'Document in the second pane',exact:true});await expect(left).toHaveValue(docs.b.id);await expect(right).toHaveValue(docs.a.id);const bounds=await Promise.all([left.boundingBox(),right.boundingBox()]);expect(bounds[0].width).toBeCloseTo(bounds[1].width,0);expect(bounds[0].height).toBe(bounds[1].height);
  const header=await first(page).locator('.document-heading').boundingBox();for(const action of ['properties','focus','tools']){const control=first(page).locator(`[data-document-action="${action}"]`);if(!await control.count())continue;const box=await control.boundingBox();expect(box.x+box.width).toBeLessThanOrEqual(header.x+header.width+1);}
  await second(page).locator('.cm-content').click();await page.keyboard.press('ControlOrMeta+End');await page.keyboard.type('Unchanged other pane');await page.evaluate(()=>{window.keptPane=document.querySelector('.document-pane .cm-editor');});
  await left.click();const menu=page.getByRole('dialog',{name:'Document in the first pane',exact:true}),search=menu.getByRole('searchbox',{name:'Search files',exact:true});await expect(search).toBeVisible();const fonts=await menu.getByRole('option').first().evaluate(el=>({title:parseFloat(getComputedStyle(el.querySelector('.select-option-label')).fontSize),meta:parseFloat(getComputedStyle(el.querySelector('.select-option-description')).fontSize)}));expect(fonts.meta).toBeLessThan(fonts.title);if(device==='ipad')await expect(search).not.toBeFocused();
  await search.fill('Finance');await expect(menu.getByRole('option')).toHaveCount(1);await expect(menu.getByRole('option')).toContainText('Project budget');await expect(menu.getByRole('option')).toContainText('Finance');await menu.getByRole('option').click();
  await expect(first(page).locator('.document-sheet')).toHaveAttribute('data-ready','true');await expect(second(page).locator('.cm-content')).toContainText('Unchanged other pane');expect(await page.evaluate(()=>window.keptPane===document.querySelector('.document-pane .cm-editor'))).toBe(true);
  await second(page).locator('.cm-content').press('ControlOrMeta+z');await expect(second(page).locator('.cm-content')).not.toContainText('Unchanged other pane');
  await expect(first(page).getByRole('combobox',{name:'Document in the first pane',exact:true})).toHaveValue(docs.c.id);await expect(second(page).getByRole('combobox',{name:'Document in the second pane',exact:true}).locator(`option[value="${docs.c.id}"]`)).toHaveCount(0);
  await page.reload();await expect(first(page).getByRole('combobox',{name:'Document in the first pane',exact:true})).toHaveValue(docs.c.id);await expect(second(page)).toBeVisible();
}));
onDevices(['desktop','ipad'],()=>test('picker search, type filters, keyboard selection and Escape work without opening another file accidentally',{tag:'@gate'},async({page,device})=>{
  await open(page);const picker=second(page).getByRole('combobox',{name:'Document in the second pane',exact:true});await picker.click();const menu=page.getByRole('dialog',{name:'Document in the second pane',exact:true}),search=menu.getByRole('searchbox',{name:'Search files',exact:true});
  await menu.getByRole('button',{name:'Tables',exact:true}).click();await expect(menu.getByRole('option')).toHaveCount(1);await expect(menu.getByRole('option')).toContainText('Project budget');
  const fills=await menu.locator('.select-search-filters').evaluate(el=>({selected:getComputedStyle(el.querySelector('[aria-pressed="true"]')).backgroundColor,other:getComputedStyle(el.querySelector('[aria-pressed="false"]')).backgroundColor}));expect(fills.selected).not.toBe(fills.other);
  await menu.getByRole('button',{name:'All files',exact:true}).click();
  await search.fill('no-such-document');await expect(menu.getByText('No matching files.')).toBeVisible();await search.press('Escape');await expect(search).toHaveValue('');await expect(menu).toBeVisible();
  await search.fill('Planning guide');await expect(menu.getByRole('option')).toHaveCount(1);await search.press('ArrowDown');await page.keyboard.press('Enter');await expect(second(page).locator('.cm-content')).toContainText('Guide text');
  await picker.click();await expect(page.getByRole('dialog',{name:'Document in the second pane',exact:true})).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('#shared-select-menu')).toHaveCount(0);
  await picker.click();expect(await axeViolations(page,['#shared-select-menu'])).toEqual([]);const sizes=await menu.locator('button:visible,input:visible').evaluateAll(els=>els.map(el=>el.getBoundingClientRect().height));for(const height of sizes)expect(height).toBeGreaterThanOrEqual(device==='ipad'?44:28);
  await page.screenshot({path:`/tmp/pencils-pane-picker-${device}.png`});
}));
onDevices(['desktop','ipad'],()=>test('open-file and bookmark filters use the current person and tags are searchable',{tag:'@gate'},async({page})=>{
  await page.goto(`${app.base}/#project/${project.id}/documents/${docs.d.id}`);const star=page.locator('.topbar [data-bookmark]');await expect(star).toBeVisible();if(await star.getAttribute('aria-pressed')!=='true')await star.click();await expect(star).toHaveAttribute('aria-pressed','true');await expect.poll(async()=>{const response=await page.request.get(`${app.base}/api/bookmarks`);return (await response.json()).bookmarks.some(item=>item.kind==='doc'&&item.project===project.id&&item.id===docs.d.id);}).toBe(true);await open(page);
  await second(page).getByRole('combobox',{name:'Document in the second pane',exact:true}).click();const menu=page.getByRole('dialog',{name:'Document in the second pane',exact:true});
  await menu.getByRole('button',{name:'Bookmarked files',exact:true}).click();await expect(menu.getByRole('option')).toContainText(['Planning guide']);
  await menu.getByRole('button',{name:'Open files',exact:true}).click();await expect(menu.getByRole('option')).toHaveCount(2);
  await menu.getByRole('button',{name:'All files',exact:true}).click();const search=menu.getByRole('searchbox',{name:'Search files',exact:true});await search.fill('#planning');await expect(menu.getByRole('option')).toHaveCount(1);await expect(menu.getByRole('option')).toContainText('Planning guide');
  await menu.getByRole('button',{name:'Clear search',exact:true}).click();await expect(search).toHaveValue('');await expect(menu.getByRole('option')).toHaveCount(3);
  await page.keyboard.press('Escape');await expect(menu).toHaveCount(0);
}));
onDevices(['desktop','ipad'],()=>test('a table stays mounted while selecting the first document, and changing the second leaves the first mounted',{tag:'@gate'},async({page})=>{
  await open(page);await second(page).getByRole('combobox',{name:'Document in the second pane',exact:true}).selectOption(docs.c.id);await expect(second(page).locator('.document-sheet')).toHaveAttribute('data-ready','true');
  await second(page).locator('[data-sheet-cell=A1]').click();const formula=second(page).getByRole('textbox',{name:'Cell value or formula',exact:true});await formula.fill('Preserved table');await formula.press('Enter');
  await page.evaluate(()=>{window.keptSheet=document.querySelector('.document-pane .document-sheet');});await first(page).getByRole('combobox',{name:'Document in the first pane',exact:true}).selectOption(docs.d.id);
  expect(await page.evaluate(()=>window.keptSheet===document.querySelector('.document-pane .document-sheet'))).toBe(true);await expect(second(page).locator('[data-sheet-cell=A1]')).toHaveText('Preserved table');
  await page.evaluate(()=>{window.keptMain=document.querySelector('#document-form .cm-editor');});await second(page).getByRole('combobox',{name:'Document in the second pane',exact:true}).selectOption(docs.a.id);expect(await page.evaluate(()=>window.keptMain===document.querySelector('#document-form .cm-editor'))).toBe(true);
  await first(page).locator('[data-document-action=tools]').click();await page.getByRole('button',{name:'Split top and bottom',exact:true}).click();await first(page).getByRole('combobox',{name:'Document in the first pane',exact:true}).selectOption(docs.b.id);await expect(first(page).locator('.cm-content')).toContainText('Beta text');await expect(second(page).locator('.cm-content')).toContainText('Alpha text');
  await second(page).getByRole('button',{name:'Close split',exact:true}).click();await expect(first(page).getByRole('combobox',{name:'Document in the first pane',exact:true})).toHaveCount(0);
}));
onDevices(['desktop','ipad'],()=>test('searchable menus fit long lists, themes and Compact density and remain usable with motion',{tag:'@gate'},async({page,device})=>{
  for(let i=0;i<24;i++)await app.store.createDocument(project.id,{title:`Reference ${i+1} for a very long planning document name`,body:'Reference\n'});
  await open(page);await page.emulateMedia({reducedMotion:'no-preference'});
  for(const theme of ['light','dark']){
    await page.evaluate(theme=>window.PencilsAppearance.write({theme,density:'compact'}),theme);
    const picker=second(page).getByRole('combobox',{name:'Document in the second pane',exact:true});await picker.click();const menu=page.locator('#shared-select-menu'),search=menu.getByRole('searchbox',{name:'Search files',exact:true});await expect(search).toBeVisible();
    const bounds=await menu.boundingBox();expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(page.viewportSize().width);expect(bounds.y+bounds.height).toBeLessThanOrEqual(page.viewportSize().height);
    const scroll=await menu.locator('.select-search-options').evaluate(el=>({scroll:el.scrollHeight,client:el.clientHeight}));expect(scroll.scroll).toBeGreaterThan(scroll.client);
    await search.fill('Reference 24');await expect(menu.getByRole('option')).toHaveCount(1);await search.press('ArrowDown');await page.keyboard.press('Enter');await expect(second(page).locator('.cm-content')).toContainText('Reference');
    await picker.click();await page.keyboard.press('Escape');await picker.click();await expect(page.locator('#shared-select-menu')).toHaveCount(1);await page.keyboard.press('Escape');await expect(page.locator('#shared-select-menu')).toHaveCount(0);
  }
}));
