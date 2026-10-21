import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium, firefox } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { Store } from '../server/store.js';
import { createServer } from '../server/index.js';
import { boardCapacityStats } from '../public/board-capacity.js';
for (const [count,label,progress] of [[0,'0%',0],[25,'<1%',0.03125],[40000,'50%',50],[80000,'100%',100],[100000,'125%',100]])
  assert.deepEqual(boardCapacityStats(count),{count,label,progress});
const root=await fs.mkdtemp(path.join(os.tmpdir(),'pencils-capacity-gauge-'));
const store=new Store(root); await store.init();
const project=await store.createProject({title:'Capacity gauge'});
let board=(await store.snapshot(project.id)).boards[0];
board=await store.updateBoard(project.id,board.id,{revision:board.revision,nodes:[{id:'frame',type:'frame',text:'Ideas',x:100,y:150,w:400,h:300,collapsed:true},{id:'note',type:'sticky',text:'Inside the frame',x:140,y:240,w:180,h:130,frame:'frame'},{id:'other',type:'sticky',text:'Another idea',x:600,y:150,w:180,h:130}],edges:[{id:'edge',from:'note',to:'other'}]});
const server=createServer(store,{productionAssets:process.env.PRODUCTION_ASSETS==='1'});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await (process.env.BROWSER==='firefox'?firefox:chromium).launch();
const errors=[];
try {
  await fs.mkdir('artifacts',{recursive:true});
  for(const mobile of [false,true]) {
    const context=await browser.newContext({viewport:{width:mobile?390:1500,height:mobile?844:1000},hasTouch:mobile});
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/#project/${project.id}/board/${board.id}`);
    const gauge=page.locator('#board-capacity-toggle'),info=page.locator('#board-capacity-info');
    await gauge.waitFor();
    assert.equal(await page.locator('.board-footer,.board-help,#canvas-performance').count(),0);
    assert.match(await gauge.getAttribute('aria-label'),/3 \/ 80,000 objects/);
    assert.equal(await gauge.textContent(),'<1%');
    assert.equal(await page.locator('[data-node=note]').count(),0,'Hidden frame children still count');
    const before=await page.locator('#canvas-world').getAttribute('style');
    await gauge.click();await page.waitForFunction(()=>document.querySelector('#board-capacity-toggle').getAttribute('aria-expanded')==='true');
    assert.ok(await info.isVisible());assert.equal(await info.textContent(),'3 / 80,000 objects');
    const anchor=await gauge.boundingBox(),popup=await info.boundingBox();
    assert.ok(popup.y+popup.height<=anchor.y,'Explanation appears above the gauge');
    assert.ok(popup.x>=0 && popup.x+popup.width <= (mobile?390:1500));
    await gauge.click();assert.equal(await info.isVisible(),false);
    await gauge.focus();await page.keyboard.press('Space');await info.waitFor();
    assert.equal(await page.locator('#canvas-world').getAttribute('style'),before,'Keyboard activation does not move the board');
    await page.keyboard.press('Escape');await info.waitFor({state:'hidden'});
    await gauge.press('Enter');await info.waitFor();
    await page.locator('.topbar').click({position:{x:5,y:5}});await info.waitFor({state:'hidden'});
    for(const theme of ['light','dark']) {
      await page.evaluate(theme=>window.PencilsAppearance.write({theme}),theme);
      await gauge.click();await info.waitFor();
      const checks=await new AxeBuilder({page}).include('.board-capacity').withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
      assert.deepEqual(checks.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[]);
      const controls=await page.locator('.board-controls').boundingBox();
      assert.ok(controls.x>=0 && controls.x+controls.width<=(mobile?390:1500));
      if(mobile) {
        const r=await gauge.boundingBox();assert.ok(r.width>=44 && r.height>=44);
        const map=await page.locator('#canvas-minimap').boundingBox();
        if(map) assert.ok(map.y+map.height<=controls.y,'The minimap stays above wrapped navigation controls');
      }
      await page.screenshot({path:`artifacts/board-capacity-${mobile?'mobile':'desktop'}-${theme}.png`});
      await gauge.click();
    }
    if(!mobile) {
      await page.locator('[data-node=other]').click();
      await page.keyboard.press('Delete');
      await page.waitForFunction(()=>document.querySelector('.board-capacity')?.dataset.count==='2');
      assert.match(await gauge.getAttribute('aria-label'),/2 \/ 80,000 objects/);
      await page.waitForFunction(()=>document.querySelector('#board-save').textContent==='Saved automatically');
      await page.keyboard.press('Control+z');
      await page.waitForFunction(()=>document.querySelector('.board-capacity')?.dataset.count==='3');
      await page.locator('#board-expand').click();
      await page.locator('.board-expanded').waitFor();await gauge.click();await info.waitFor();
      assert.ok((await info.boundingBox()).y<(await gauge.boundingBox()).y);
    }
    await context.close();
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: gauge percentages, hidden objects, live delete/undo count, click/keyboard dismissal, expanded board, mobile sizing and light/dark accessibility');
} finally {await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));await store.close();await fs.rm(root,{recursive:true,force:true});}
