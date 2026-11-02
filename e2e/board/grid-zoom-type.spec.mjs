import {test,expect,useApp,onDevices} from '../fixtures.mjs';
import {newGrid} from '../../public/grid-model.js';
const app=useApp(async store=>{const project=await store.createProject({title:'Smooth grid text'});let board=(await store.snapshot(project.id)).boards[0];const grid=newGrid();grid.title='Grid title';grid.cells[0][0].text='A note in a cell';board=await store.updateBoard(project.id,board.id,{revision:board.revision,nodes:[{id:'grid',type:'grid',text:'Grid title',x:100,y:100,w:540,h:312,grid}],edges:[]});return{project,board};});
onDevices(['desktop','ipad'],()=>test('grid type and handles stay screen-sized throughout fractional zoom, with no jump on settling @gate',async({page})=>{
 await page.emulateMedia({reducedMotion:'no-preference'});await page.addInitScript(id=>localStorage.setItem(`pencils:camera:${id}`,JSON.stringify({x:40,y:40,z:0.8})),app.board.id);
 await page.goto(`${app.base}/#project/${app.project.id}/board/${app.board.id}`);await expect(page.locator('.grid-title')).toBeVisible();
 const samples=await page.locator('#canvas').evaluate(async canvas=>{
  const box=canvas.getBoundingClientRect(),samples=[];
  for(const delta of [25,25,25,25,-18,-18,-18,-18]){
   canvas.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:delta,clientX:box.x+box.width/2,clientY:box.y+box.height/2}));
   await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
   const scale=new DOMMatrix(document.querySelector('#canvas-world').style.transform).a;
   samples.push({scale,font:parseFloat(getComputedStyle(document.querySelector('.grid-title')).fontSize)*scale,hit:parseFloat(getComputedStyle(document.querySelector('.board-node.grid')).getPropertyValue('--grid-hit-size'))*scale});
  }
  return samples;
 });
 expect(new Set(samples.map(s=>s.scale)).size).toBeGreaterThan(4);
 for(const sample of samples){expect(Math.abs(sample.font-14),JSON.stringify(sample)).toBeLessThan(0.15);expect(Math.abs(sample.hit-8)).toBeLessThan(0.1);}
 await page.waitForFunction(()=>!document.querySelector('#canvas').classList.contains('zooming'));
 const finalFont=await page.locator('.grid-title').evaluate(el=>parseFloat(getComputedStyle(el).fontSize)*new DOMMatrix(document.querySelector('#canvas-world').style.transform).a);
 expect(Math.abs(finalFont-samples.at(-1).font)).toBeLessThan(0.1);
}));
