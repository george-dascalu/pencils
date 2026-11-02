import { test, expect, useApp, onDevices } from '../fixtures.mjs';
import { reveal } from '../helpers/menu-controls.mjs';

const app = useApp(async store => {
  const project = await store.createProject({title:'Resize calendar events'});
  const card = await store.createTask(project.id,{title:'Review',start:'2026-11-02',due:'2026-11-02',start_time:'09:00',due_time:'10:00'});
  return {project,card};
});
const card = page => page.locator(`.calendar-timed-card[data-id="${app.card.id}"]`);
const handle = (page,end) => card(page).locator(`[data-calendar-time-end="${end}"]`);
const scroll = page => page.locator('.calendar-hours-scroll');
const saved = async () => (await app.store.snapshot(app.project.id)).tasks.find(t=>t.id===app.card.id);
async function open(page) {
  await app.store.updateTask(app.project.id,app.card.id,{revision:(await saved()).revision,start:'2026-11-02',due:'2026-11-02',start_time:'09:00',due_time:'10:00'});
  await page.clock.setFixedTime(new Date('2026-11-02T12:00:00'));
  await page.goto(`${app.base}/#project/${app.project.id}/calendar`);
  await (await reveal(page.locator('#calendar-mode'))).selectOption('week');
  if(await page.locator('.mobile-view-options[open]').count()) await page.getByRole('button',{name:'Close view options',exact:true}).click();
  await card(page).scrollIntoViewIfNeeded();
}
async function begin(page,end) {
  await handle(page,end).scrollIntoViewIfNeeded();
  const r=await handle(page,end).boundingBox();
  await page.mouse.move(r.x+r.width/2,r.y+r.height/2); await page.mouse.down();
}
async function move(page,minutes) {
  const r=await card(page).locator('..').boundingBox();
  await page.mouse.move(r.x+r.width/2,r.y+minutes/1440*r.height,{steps:8});
}

onDevices(['desktop','ipad','phone'],()=>test('resize both timed endpoints in quarter hours, preview the size and retain it after reload',{tag:'@gate'},async({page,device})=>{
  await open(page);
  await card(page).hover();
  await expect(handle(page,'due')).toHaveCSS('height',device==='desktop'?'32px':'44px');
  await expect(handle(page,'due')).toHaveCSS('cursor','ns-resize');
  await begin(page,'due'); await move(page,10*60+15);
  await expect(page.locator('.calendar-drag-preview')).toContainText('09:00 – 10:15');
  await expect(card(page)).toHaveCSS('height','80px');
  await page.mouse.up();
  await expect.poll(async()=> (await saved()).due_time).toBe('10:15');
  await begin(page,'start'); await move(page,8*60+45);
  await expect(page.locator('.calendar-drag-preview')).toContainText('08:45 – 10:15');
  await page.mouse.up();
  await expect.poll(async()=> (await saved()).start_time).toBe('08:45');
  await page.reload();
  await expect(card(page)).toContainText('08:45 – 10:15');
  expect((await saved()).due).toBe('2026-11-02');
}));

test('resizing follows scroll and Escape restores the event without saving',async({page})=>{
  await open(page);
  const before=await card(page).getAttribute('style');
  await begin(page,'due'); await move(page,11*60);
  const r=await scroll(page).boundingBox(), top=await scroll(page).evaluate(el=>el.scrollTop);
  await page.mouse.move(r.x+150,r.y+r.height-8,{steps:4});
  await expect.poll(()=>scroll(page).evaluate(el=>el.scrollTop)).toBeGreaterThan(top+50);
  await expect.poll(()=>card(page).evaluate(el=>el.getBoundingClientRect().height)).toBeGreaterThan(128);
  await page.keyboard.press('Escape'); await page.mouse.up();
  await expect(card(page)).toHaveAttribute('style',before);
  await expect(card(page)).toContainText('09:00 – 10:00');
  expect((await saved()).due_time).toBe('10:00');
  await expect(page.locator('#task-form')).toHaveCount(0);
  await begin(page,'due'); await move(page,11*60);
  await page.mouse.move(2,2,{steps:6});
  await expect(page.locator('.calendar-drag-preview')).toContainText('Release to cancel');
  await expect(card(page)).toHaveAttribute('style',before);
  await page.mouse.up();
  expect((await saved()).due_time).toBe('10:00');
});

test('zoom changes resize snapping and keyboard handles adjust the same endpoint',{tag:'@gate'},async({page})=>{
  await open(page);
  const out=page.getByRole('button',{name:'Zoom out hours',exact:true});
  while(await out.isEnabled()) await out.click();
  await begin(page,'due'); await move(page,10*60+14);
  await expect(page.locator('.calendar-drag-preview')).toContainText('09:00 – 10:00');
  await expect(page.locator('.calendar-drag-preview')).toContainText('30 min');
  await page.keyboard.press('Escape'); await page.mouse.up();
  await handle(page,'due').focus(); await page.keyboard.press('ArrowDown');
  await expect.poll(async()=> (await saved()).due_time).toBe('10:30');
  await expect(handle(page,'due')).toBeFocused();
  const inside=page.getByRole('button',{name:'Zoom in hours',exact:true});
  while(await page.locator('.calendar-hour-slot').first().evaluate(el=>el.offsetHeight)<64) await inside.click();
  await handle(page,'due').focus(); await page.keyboard.press('ArrowUp');
  await expect.poll(async()=> (await saved()).due_time).toBe('10:15');
});

test('overnight cards expose only their true endpoints, can end at midnight, and imported cards have no time handles',async({page})=>{
  const night=await app.store.createTask(app.project.id,{title:'Night review',start:'2026-11-02',due:'2026-11-03',start_time:'23:00',due_time:'01:00'});
  const imported=await app.store.createTask(app.project.id,{title:'Imported',start:'2026-11-02',due:'2026-11-02',start_time:'12:00',due_time:'13:00'});
  const file=app.store.file(app.project.id,'tasks',imported.id), record=await app.store.read(file);
  await app.store.write(file,{...record.data,source:{provider:'jira',external_id:'one'}},record.body,record);
  await open(page);
  const segments=page.locator(`.calendar-timed-card[data-id="${night.id}"]`);
  await expect(segments).toHaveCount(2);
  await expect(segments.locator('[data-calendar-time-end="start"]')).toHaveCount(1);
  const end=segments.locator('[data-calendar-time-end="due"]');
  await expect(end).toHaveCount(1);
  await expect(page.locator(`.calendar-timed-card[data-id="${imported.id}"] [data-calendar-time-end]`)).toHaveCount(0);
  await end.scrollIntoViewIfNeeded();
  const r=await end.boundingBox(), day=await page.locator('.calendar-hours-day[data-calendar-date="2026-11-03"]').boundingBox();
  await page.mouse.move(r.x+r.width/2,r.y+r.height/2); await page.mouse.down();
  await page.mouse.move(r.x+r.width/2,day.y+1,{steps:8});
  await expect(page.locator('.calendar-drag-preview')).toContainText('23:00 – 00:00');
  await page.mouse.up();
  await expect.poll(async()=> (await app.store.snapshot(app.project.id)).tasks.find(t=>t.id===night.id).due_time).toBe('00:00');
  await expect(segments).toHaveCount(1);
});

onDevices(['ipad'],()=>test('a touch handle resizes without scrolling the page or opening the editor',async({page,browserName})=>{
  test.skip(browserName!=='chromium','Raw touches need Chromium DevTools');
  await open(page);
  const cdp=await page.context().newCDPSession(page);
  const r=await handle(page,'due').boundingBox(), x=r.x+r.width/2, y=r.y+r.height/2;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  for(let i=1;i<=8;i++) await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+32*i/8}]});
  await expect(page.locator('.calendar-drag-preview')).toContainText('09:00 – 10:30');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect.poll(async()=> (await saved()).due_time).toBe('10:30');
  await expect(page.locator('#task-form')).toHaveCount(0);
  expect(await page.evaluate(()=>document.scrollingElement.scrollTop)).toBe(0);
}));
