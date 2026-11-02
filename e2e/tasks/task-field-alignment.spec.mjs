import { test, expect, onDevices, useApp } from '../fixtures.mjs';
import { newCard } from '../helpers/new-card.mjs';
const app=useApp(async()=>({}));
onDevices(['desktop','ipad','phone'],()=>test('new-card fields stay centred when optional fields are disabled', {tag:'@gate'}, async({page,device})=>{
  const project=await app.store.createProject({title:'Field alignment'});
  await page.goto(`${app.base}/#project/${project.id}/list`);
  await newCard(page);
  const form=page.locator('#task-form');
  for(const off of ['', 'priority','assignee priority','status','assignee status','start','due']) {
    await page.evaluate(off=>document.documentElement.dataset.fieldsOff=off,off);
    const rects=await form.evaluate(form=>{
      const box=form.querySelector('.task-fields'),dates=form.querySelector('.task-date-range');
      const rect=el=>{const r=el.getBoundingClientRect();return{top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height,centre:r.top+r.height/2};};
      return{box:rect(box),dates:rect(dates),fields:[...box.querySelectorAll(':scope > .field')].filter(el=>el.getClientRects().length).map(rect),control:parseFloat(getComputedStyle(box).getPropertyValue('--control-height'))};
    });
    expect(rects.box.height,`${device} ${off}: no bottom margin inside the field box`).toBeLessThanOrEqual(rects.control+2);
    for(const r of rects.fields)expect(Math.abs(r.centre-rects.box.centre),`${device} ${off}: centred`).toBeLessThanOrEqual(1);
    if(device!=='phone')expect(Math.abs(rects.box.top-rects.dates.top),`${device} ${off}: dates align`).toBeLessThanOrEqual(1);
    if(off==='priority')expect(rects.box.right-rects.fields.at(-1).right,'no empty priority column').toBeLessThanOrEqual(2);
  }
}));
