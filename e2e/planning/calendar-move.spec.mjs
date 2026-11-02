import { test, expect, useApp, onDevices } from '../fixtures.mjs';
import { reveal } from '../helpers/menu-controls.mjs';
const app=useApp(async store=>({project:await store.createProject({title:'Move times'})}));
async function open(page,device) {
 const task=await app.store.createTask(app.project.id,{title:`Review ${device}`,assignee:'George',status:'todo',priority:'high',start:'2026-11-02',due:'2026-11-02',start_time:'09:00',due_time:'11:00'});
 await page.clock.setFixedTime(new Date('2026-11-02T12:00:00'));
 await page.goto(`${app.base}/#project/${app.project.id}/calendar`);
 await (await reveal(page.locator('#calendar-mode'))).selectOption('week');
 if(await page.locator('.mobile-view-options[open]').count()) await page.getByRole('button',{name:'Close view options',exact:true}).click();
 const card=()=>page.locator(`.calendar-timed-card[data-id="${task.id}"]`);
 await card().scrollIntoViewIfNeeded();
 const saved=async()=> (await app.store.snapshot(app.project.id)).tasks.find(t=>t.id===task.id);
 return {task,card,saved};
}
onDevices(['desktop','ipad','phone'],()=>test('move a timed card within a day and across days, keeping duration and allowing cancellation @gate',async({page,device})=>{
 const {card,saved}=await open(page,device);
 const drag=async(day,delta,cancel=false)=>{
  await card().scrollIntoViewIfNeeded();
  const a=await card().boundingBox(), target=await page.locator(`.calendar-hours-day[data-calendar-date="${day}"]`).boundingBox();
  const x=a.x+a.width/2,y=a.y+35;
  await page.mouse.move(x,y);await page.mouse.down();
  await page.mouse.move(target.x+target.width/2,y+delta*target.height/1440,{steps:8});
  await expect(page.locator('.calendar-placement')).toHaveCount(1);
  await expect(page.locator('.calendar-placement')).toHaveCSS('height','128px');
  if(cancel)await page.keyboard.press('Escape');
  await page.mouse.up();
 };
 await drag('2026-11-02',30);
 await expect.poll(async()=> (await saved()).start_time).toBe('09:30');
 expect((await saved()).due_time).toBe('11:30');
 await drag('2026-11-03',-15);
 await expect.poll(async()=> [(await saved()).start,(await saved()).start_time]).toEqual(['2026-11-03','09:15']);
 expect((await saved()).due_time).toBe('11:15');
 await drag('2026-11-04',30,true);
 expect((await saved()).start).toBe('2026-11-03');
 await expect(page.locator('#task-form')).toHaveCount(0);
 await page.reload();
 await expect(card()).toContainText('09:15 – 11:15');
 // A spacious event shows the shared box; compact events keep just title and times.
 await card().scrollIntoViewIfNeeded();
 const fields=card().locator('.calendar-event-fields');
 if(device==='desktop'){
  await expect(fields).toBeVisible();
  await expect(fields.locator('.task-assignee')).toHaveText('George');
  await expect(fields.locator('.field-chip-status')).toHaveText('To do');
  await expect(fields.locator('.field-chip-priority')).toHaveAttribute('title','High priority');
  expect(await fields.evaluate(el=>getComputedStyle(el).borderTopWidth)).toBe('1px');
  expect(await fields.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  await page.evaluate(()=>document.documentElement.dataset.fieldsOff='assignee status priority');
  await expect(fields).toBeHidden();
  await page.evaluate(()=>document.documentElement.removeAttribute('data-fields-off'));
 } else await expect(fields).toBeHidden();
 await page.screenshot({path:`/tmp/calendar-move-${device}.png`});
 if(device==='desktop') {
  await card().evaluate(el=>el.style.height='60px');
  await expect(fields).toBeHidden();
  await card().evaluate(el=>el.style.height='128px');
  await expect(fields).toBeVisible();
 }
 const grip=card().locator('[data-calendar-time-end="due"]');
 expect(await grip.evaluate(el=>getComputedStyle(el,'::after').height)).toBe('4px');
 await card().locator('.calendar-card-title').focus(); await page.keyboard.press('Alt+ArrowUp');
 await expect.poll(async()=> (await saved()).start_time).toBe('09:00');
}));
onDevices(['ipad'],()=>test('touch drags the event body without scrolling behind it',async({page,browserName,device})=>{
 test.skip(browserName!=='chromium','Raw touch needs Chromium DevTools');
 const {card,saved}=await open(page,device);
 const a=await card().boundingBox(), next=await page.locator('.calendar-hours-day[data-calendar-date="2026-11-03"]').boundingBox();
 const cdp=await page.context().newCDPSession(page), scroll=page.locator('.calendar-hours-scroll');
 const before=await scroll.evaluate(el=>el.scrollTop), x=a.x+a.width/2,y=a.y+35;
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
 for(let i=1;i<=8;i++) await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+(next.x+next.width/2-x)*i/8,y:y+32*i/8}]});
 await expect(page.locator('.calendar-placement')).toBeVisible();
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await expect.poll(async()=> [(await saved()).start,(await saved()).start_time]).toEqual(['2026-11-03','09:30']);
 expect(await scroll.evaluate(el=>el.scrollTop)).toBe(before);
 await expect(page.locator('#task-form')).toHaveCount(0);
}));
