// Owner request: dropdown assignees, checkbox tag choices (ANY selected tag), priority and custom filters.
import { test, expect, useApp, onDevices } from '../fixtures.mjs';
import { DEFAULT_SCHEMA } from '../../server/model.js';

const app=useApp(async store=>{
  const fields=[{id:'points',name:'Points',type:'number'},{id:'approved',name:'Approved',type:'checkbox'},{id:'category',name:'Category',type:'select',options:['A','B']},{id:'notes',name:'Notes',type:'text'},{id:'review',name:'Review date',type:'date'}];
  const project=await store.createProject({title:'Project filters',schema:{...DEFAULT_SCHEMA,fields}});
  await store.createTask(project.id,{title:'Design budget',assignee:'George',priority:'high',tags:['Design'],fields:{points:0,approved:false,category:'A',notes:'Project budget',review:'2026-11-02'}});
  await store.createTask(project.id,{title:'Build plan',assignee:'Andy',priority:'high',tags:['Build'],fields:{points:3,approved:true,category:'B',notes:'Roadmap',review:'2026-11-03'}});
  await store.createTask(project.id,{title:'Release notes',priority:'low',tags:['Release'],fields:{points:0,approved:false,category:'A',notes:'Release',review:'2026-11-04'}});
  return{project};
});
const options=page=>page.locator('[data-board-menu="filters"]');
async function open(page,device){const trigger=page.locator(device==='phone'?'.mobile-view-options > summary':'[data-board-menu="filters"] > summary');if(!(await trigger.evaluate(el=>el.parentElement.open)))await trigger.click();}
onDevices(['desktop','ipad','phone'],()=>test('project filters use dropdowns, combine ANY selected tags and expose typed custom fields @gate',async({page,device})=>{
  await page.goto(`${app.base}/#project/${app.project.id}/list`);await expect(page.locator('.task-row')).toHaveCount(3);
  await open(page,device);
  await expect(page.locator('#filter-assignee')).toHaveJSProperty('tagName','SELECT');
  await page.locator('#filter-assignee').selectOption('@person:George');
  await expect(page.locator('.task-row')).toHaveCount(1);
  await page.locator('#filter-priority').selectOption('high');
  await page.getByRole('button',{name:'Filter by tags',exact:true}).click();
  const tags=page.locator('#shared-select-menu');
  await expect(tags).toHaveAttribute('aria-label','Tags');
  await tags.getByRole('checkbox',{name:'Design',exact:true}).click();
  await expect(tags.getByRole('checkbox',{name:'Design',exact:true})).toBeChecked();
  await tags.getByRole('checkbox',{name:'Build',exact:true}).click();
  await expect(tags.getByRole('checkbox',{name:'Build',exact:true})).toBeChecked();
  await page.keyboard.press('Escape');
  if(device==='phone')await page.getByRole('button',{name:'Close view options',exact:true}).click();
  await page.getByRole('group',{name:'Active filters',exact:true}).getByRole('button',{name:'Remove Assignee: George filter',exact:true}).click();
  await expect(page.locator('.task-row')).toHaveCount(2);
  await open(page,device);
  await page.locator('[data-filter-custom="approved"]').selectOption('false');
  await page.locator('[data-filter-custom="points"]').fill('0');await page.locator('[data-filter-custom="points"]').blur();
  await expect(page.locator('.task-row')).toHaveCount(1);
  await expect(page.locator('.task-row .task-title').first()).toHaveValue('Design budget');
  const active=page.getByRole('group',{name:'Active filters',exact:true});
  await expect(active).toContainText('Points: 0');await expect(active).toContainText('Approved: No');
  await open(page,device);
  await expect(page.locator('[data-filter-custom="notes"]')).toHaveAttribute('type','text');
  await expect(page.locator('[data-filter-custom="review"]')).toHaveAttribute('type','date');
  await expect(page.locator('[data-filter-custom="category"]')).toHaveJSProperty('tagName','SELECT');
  if(device==='phone')await page.getByRole('button',{name:'Clear filters',exact:true}).click();else await options(page).getByRole('button',{name:'Clear filters',exact:true}).click();
  await expect(active).toHaveCount(0);await expect(page.locator('.task-row')).toHaveCount(3);
}));
