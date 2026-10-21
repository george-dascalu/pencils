// Synthetic frame stress tests. Seed an isolated vault past the old validation
// cap so rendering, navigation and server rejection can be measured separately.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { Store } from '../server/store.js';
import { createServer } from '../server/index.js';
import { boardDifference } from '../public/board-delta.js';
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pencils-frame-capacity-'));
const store = new Store(root); await store.init();
const project = await store.createProject({title:'Frame capacity'});
let board = (await store.snapshot(project.id)).boards[0];
const server = createServer(store, {productionAssets:process.env.PRODUCTION_ASSETS === '1'});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch();
const results=[];
try {
  for (const name of (process.env.FRAME_CASES || 'flat-1000,flat-5000,nested-5000,dense-1000').split(',')) {
    const [kind,raw]=name.split('-'), count=Number(raw), nodes=[];
    for(let i=0;i<count;i++) {
      const depth=kind==='nested'?i%5:kind==='deep'?i:0;
      const group=kind==='nested'?Math.floor(i/5):i;
      const gap=kind==='dense'?20:1000;
      const x=kind==='deep'?depth*2:(group%100)*gap+depth*30;
      const y=kind==='deep'?depth*2:Math.floor(group/100)*gap+depth*30;
      const size=kind==='deep'?(count-depth)*4+300:800-depth*100;
      nodes.push({id:`f-${i}`,type:'frame',text:`Frame ${i}`,x,y,w:size,h:size,...(depth?{frame:`f-${i-1}`}:{})});
      nodes.push({id:`n-${i}`,type:'sticky',text:`Child ${i}`,x:x+40,y:y+80,w:200,h:120,frame:`f-${i}`});
    }
    board=await store.write(store.file(project.id,'boards',board.id),{...board,nodes,edges:[],operations:[]},'',await store.read(store.file(project.id,'boards',board.id)));
    const page=await browser.newPage({viewport:{width:1500,height:1000}});
    page.setDefaultTimeout(20000);
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const result={name,frames:count,objects:nodes.length};
    try {
      const start=performance.now();
      await page.goto(`${base}/#project/${project.id}/board/${board.id}`);
      await page.waitForFunction(n=>document.querySelector('#canvas')?.dataset.objectCount===String(n),nodes.length);
      result.loadMs=Math.round(performance.now()-start);
      await page.waitForTimeout(1600);
      const pan=await page.evaluate(async()=>{
        const samples=[],canvas=document.querySelector('#canvas');
        for(let i=0;i<20;i++) {
          const t=performance.now();
          canvas.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaX:80,deltaY:25,shiftKey:true}));
          await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
          samples.push(performance.now()-t);
        }
        return samples.sort((a,b)=>a-b);
      });
      result.panP95Ms=Math.round(pan[18]);
      const fit=performance.now();await page.locator('[data-action=board-fit]').click();await page.waitForTimeout(250);
      result.fitMs=Math.round(performance.now()-fit);
      const outline=performance.now();
      await page.evaluate(()=>document.querySelector('[data-pro=outline]').click());
      await page.locator('[data-frame-row]').first().waitFor();
      result.outlineMs=Math.round(performance.now()-outline);
      result.outlineRows=await page.locator('[data-frame-row]').count();
      result.elements=await page.locator('*').count();
      await page.locator('#canvas-outline [data-pro=outline]').click();
      const moved={...board,nodes:board.nodes.map((n,i)=>i<2?{...n,x:n.x+10}:n)};
      const body=JSON.stringify({changes:boardDifference(board,moved),revision:board.revision,client:'frame-capacity',operationId:`move-${name}`});
      const save=performance.now();
      const response=await fetch(`${base}/api/projects/${project.id}/boards/${board.id}`,{method:'PATCH',headers:{'content-type':'application/json'},body});
      const saved=await response.json();
      result.saveMs=Math.round(performance.now()-save);result.saveStatus=response.status;
      if(response.ok)board=saved;else result.saveError=saved;
      result.errors=errors;
    } catch(error) {result.error=error.message;result.errors=errors;result.screen=(await page.locator('body').innerText()).slice(-1500);result.count=await page.locator('#canvas').getAttribute('data-object-count').catch(()=>null);}
    results.push(result);console.log(JSON.stringify(result));
    await page.close();
    await fs.writeFile(process.env.FRAME_OUTPUT || '/tmp/pencils-frame-capacity.json',JSON.stringify({cpu:os.cpus()[0].model,browser:browser.version(),results},null,2));
  }
} finally {await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));await store.close();await fs.rm(root,{recursive:true,force:true});}
