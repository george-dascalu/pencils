import { test, expect, useApp, onDevices } from '../fixtures.mjs';
import { reveal } from '../helpers/menu-controls.mjs';
const app = useApp(async store => {
  const project = await store.createProject({ title:'Hourly calendar' });
  await store.createTask(project.id, { title:'All-day deadline', due:'2026-11-02' });
  return { project };
});
async function open(page, project = app.project) {
  await page.clock.setFixedTime(new Date('2026-11-02T12:00:00'));
  await page.goto(`${app.base}/#project/${project.id}/calendar`);
  await (await reveal(page.locator('#calendar-mode'))).selectOption('week');
  if(await page.locator('.mobile-view-options[open]').count()) await page.getByRole('button',{name:'Close view options',exact:true}).click();
  await page.locator('.calendar-hours').waitFor();
}
onDevices(['desktop','ipad','phone'], () => test('drag an hour range, create a timed card, and retain its time after reload', async({ page, device }) => {
  const project=await app.store.createProject({title:`Hourly ${device}`});
  await app.store.createTask(project.id,{title:'All-day deadline',due:'2026-11-02'});
  await open(page, project);
  const day = page.locator('.calendar-hours-day[data-calendar-date="2026-11-02"]');
  const start = day.locator('[data-hour="9"]');
  await start.scrollIntoViewIfNeeded();
  const a = await start.boundingBox(), end = await day.locator('[data-hour="10"]').boundingBox();
  await page.mouse.move(a.x+a.width/2,a.y+1); await page.mouse.down();
  await page.mouse.move(end.x+end.width/2,end.y+end.height/2,{steps:8});
  await expect(page.locator('.calendar-time-selection')).toContainText('09:00 – 10:30');
  await page.mouse.up();
  const form=page.locator('#task-form');
  await expect(form.getByLabel('Start time',{exact:true})).toHaveValue('09:00');
  await expect(form.getByLabel('End time',{exact:true})).toHaveValue('10:30');
  const allDay=await form.locator('[data-task-allday]').boundingBox();
  expect(allDay.width, 'the All day icon stays square').toBe(allDay.height);
  const title=`Time range ${device}`;
  await form.getByLabel('Card title',{exact:true}).fill(title);
  await form.getByRole('button',{name:'Create card',exact:true}).click();
  await expect(page.locator('.calendar-timed-card', {hasText:title})).toBeVisible();
  await page.reload();
  await expect(page.locator('.calendar-timed-card',{hasText:title})).toContainText('09:00 – 10:30');
  await expect(page.locator('.calendar-all-day')).toContainText('All-day deadline');
}));
test('keyboard creates an hour and Escape cancels a drag without opening a card', async({ page })=>{
  await open(page);
  const slot=page.locator('.calendar-hours-day').first().locator('[data-hour="11"]');
  await slot.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#task-form [name="start_time"]')).toHaveValue('11:00');
  await page.locator('[data-action="dialog-close"]').click();
  const a=await slot.boundingBox();
  await page.mouse.move(a.x+a.width/2,a.y+1); await page.mouse.down(); await page.mouse.move(a.x+a.width/2,a.y+50);
  await page.keyboard.press('Escape'); await page.mouse.up();
  await expect(page.locator('#task-form')).toHaveCount(0);
  await expect(page.locator('.calendar-time-selection')).toHaveCount(0);
});

onDevices(['ipad','phone'],()=>test('a tap chooses an hour without opening the keyboard',async({page})=>{
  await open(page);
  const slot=page.locator('.calendar-hours-day').first().locator('[data-hour="12"]');
  await slot.scrollIntoViewIfNeeded(); await slot.tap();
  await expect(page.locator('#task-form [name="start_time"]')).toHaveValue('12:30');
  await expect(page.locator('#task-form [name="title"]')).not.toBeFocused();
}));
onDevices(['ipad'],()=>test('a swipe scrolls hours; holding then dragging selects a time range',async({page,browserName})=>{
  test.skip(browserName!=='chromium','Raw touches need Chromium DevTools');
  await open(page);
  const cdp=await page.context().newCDPSession(page), scroll=page.locator('.calendar-hours-scroll');
  const slot=page.locator('.calendar-hours-day').first().locator('[data-hour="9"]');
  await slot.scrollIntoViewIfNeeded();
  let r=await slot.boundingBox(); const before=await scroll.evaluate(el=>el.scrollTop);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x+r.width/2,y:r.y+40}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:r.x+r.width/2,y:r.y-60}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect.poll(()=>scroll.evaluate(el=>el.scrollTop)).toBeGreaterThan(before);
  await expect(page.locator('#task-form')).toHaveCount(0);
  await scroll.evaluate(el=>el.scrollTop=7*64); await slot.scrollIntoViewIfNeeded();
  r=await slot.boundingBox();
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x+r.width/2,y:r.y+1}]});
  await expect(page.locator('.calendar-time-selection')).toBeVisible();
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:r.x+r.width/2,y:r.y+96}]});
  await expect(page.locator('.calendar-time-selection')).toContainText('09:00 – 10:30');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect(page.locator('#task-form [name="due_time"]')).toHaveValue('10:30');
}));

// The hours run under the floating bottom bar, so the edge that scrolls them while selecting is the bar's top.
onDevices(['ipad'],()=>test('a time range held just above the bottom bar scrolls the hours',async({page})=>{
  await open(page);
  const cdp=await page.context().newCDPSession(page), scroll=page.locator('.calendar-hours-scroll');
  // A redraw can still move the hours after they show, so aim once the point is on the 01:00 slot.
  const slot=page.locator('.calendar-hours-day').first().locator('[data-hour="1"]');
  let at;
  await expect.poll(async()=>{
    await scroll.evaluate(el=>el.scrollTop=0);
    const r=await slot.boundingBox(); at={x:r.x+r.width/2,y:r.y+r.height/2};
    return slot.evaluate((el,p)=>document.elementFromPoint(p.x,p.y)===el,at);
  }).toBe(true);
  const barTop=await page.evaluate(()=>document.querySelector('.topbar .tabs').getBoundingClientRect().top);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[at]});
  await expect(page.locator('.calendar-time-selection')).toBeVisible();
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:at.x,y:barTop-10}]});
  await expect.poll(()=>scroll.evaluate(el=>el.scrollTop)).toBeGreaterThan(100);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
}));

test('times can be edited and cleared without losing the dates',async({page})=>{
  const project=await app.store.createProject({title:'Edit hours'});
  const card=await app.store.createTask(project.id,{title:'Review',start:'2026-11-02',due:'2026-11-02',start_time:'09:00',due_time:'10:00'});
  await open(page,project);
  await page.locator('.calendar-timed-card .calendar-card-title').click();
  const form=page.locator('#task-form');
  await form.getByLabel('End time',{exact:true}).fill('11:30');
  await form.getByLabel('End time',{exact:true}).blur();
  await expect.poll(async()=> (await app.store.snapshot(project.id)).tasks.find(t=>t.id===card.id).due_time).toBe('11:30');
  await form.getByRole('button',{name:'All day',exact:true}).click();
  await expect.poll(async()=> (await app.store.snapshot(project.id)).tasks.find(t=>t.id===card.id).due_time).toBe(null);
  await page.locator('[data-action="dialog-close"]').click();
  await expect(page.locator('.calendar-timed-card')).toHaveCount(0);
  await expect(page.locator('.calendar-all-day')).toContainText('Review');
  expect((await app.store.snapshot(project.id)).tasks.find(t=>t.id===card.id).due).toBe('2026-11-02');
});
