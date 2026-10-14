import test from 'node:test';
import assert from 'node:assert/strict';
import {newGrid,validGrid,cellBounds,gridSVG,editGrid} from '../public/grid-model.js';
import {mergeGrid,unmergeGrid} from '../public/grid-merge.js';
import {routeEdge,port} from '../public/canvas-geometry.js';
import {lineJumps,validConnectorGeometry} from '../public/connector-path.js';
import {partialErase,recogniseStroke,pointInPolygon} from '../public/pen-advanced.js';
import {makeStroke} from '../public/pen-model.js';
import {validObjectGeometry} from '../public/object-geometry.js';
import {shiftDate} from '../public/task-timeline.js';
import {encodeCanvas,decodeCanvas} from '../public/canvas-format.js';
test('Merged cells preserve every original value and formatting through split and track changes',()=>{
 const n={id:'g',type:'grid',x:0,y:0,w:540,h:312,grid:newGrid()};n.grid.cells[0][0]={text:'One',color:'#123456'};n.grid.cells[0][1]={text:'Two',align:'right'};
 mergeGrid(n.grid,[[0,0],[0,1]]);assert.equal(n.grid.cells[0][0].text,'One\n\nTwo');assert.ok(validGrid(n.grid));assert.equal(cellBounds(n,0,0).w,360);
 const svg=gridSVG(n,s=>s);assert.equal((svg.match(/>Two<\/text>/g)||[]).length,1);
 unmergeGrid(n.grid);assert.equal(n.grid.cells[0][0].text,'One');assert.equal(n.grid.cells[0][1].text,'Two');assert.equal(n.grid.cells[0][1].align,'right');
 mergeGrid(n.grid,[[0,0],[0,1]]);n.grid.cells[0][0].text='Edited';unmergeGrid(n.grid);assert.equal(n.grid.cells[0][0].text,'Edited');assert.equal(n.grid.cells[0][1].text,'Two');
 mergeGrid(n.grid,[[0,0],[0,1]]);editGrid(n,'columns','add',0);assert.equal(n.grid.merges.length,0);assert.ok(n.grid.cells[0].some(c=>c.text==='Two'));
 assert.throws(()=>mergeGrid(n.grid,[[0,0],[1,1]]),/rectangle/);
});
test('Connector bends, labels, automatic ports and line jumps are preserved in native Canvas',()=>{
 const a={id:'a',type:'sticky',x:0,y:0,w:100,h:100},b={...a,id:'b',x:300,y:200},edge={id:'e',from:'a',to:'b',routing:'curve',bends:[{x:200,y:40}],labels:[{text:'Second label',x:10,y:20}],labelOffset:{x:10,y:-10},lineJumps:true};
 assert.match(routeEdge(edge,a,b).d,/200,40/);assert.ok(validConnectorGeometry(edge));assert.equal(validConnectorGeometry({...edge,bends:[{x:NaN,y:0}]}),false);
 const round=decodeCanvas(encodeCanvas({project:'p',nodes:[a,b],edges:[edge]}));assert.deepEqual(round.edges[0].bends,edge.bends);assert.deepEqual(round.edges[0].labels,edge.labels);
 assert.match(lineJumps([{x:0,y:50},{x:100,y:50}],[[{x:50,y:0},{x:50,y:100}]]),/ Q/);
 assert.deepEqual(port({...a,rotation:90},'top'),{x:100,y:50});
});
test('Partial eraser splits long sparsely sampled ink, preserving endpoints and pressure',()=>{
 const n=makeStroke([{x:0,y:0,pressure:.2},{x:100,y:0,pressure:.8}],{strokeWidth:2},'ink');let id=0;
 const parts=partialErase(n,{x:50,y:-20},{x:50,y:20},5,()=>`ink-${++id}`);assert.equal(parts.length,2);assert.equal(parts[0].id,'ink');assert.notEqual(parts[1].id,'ink');assert.ok(parts[0].x+parts[0].w<60);assert.ok(parts[1].x>40);assert.ok(parts.every(n=>n.points.length===n.pressures.length));
 assert.deepEqual(partialErase(n,{x:200,y:0},{x:200,y:100},5,()=>''),[n]);
});
test('Shape recognition is optional geometry and crop/date validation handles limits',()=>{
 const samples=[{x:0,y:0},{x:100,y:0},{x:100,y:100},{x:0,y:100},{x:0,y:0}];assert.equal(recogniseStroke(makeStroke(samples,{},'s')).type,'shape');
 assert.equal(validObjectGeometry({crop:[.5,0,.5,0]}),false);assert.ok(validObjectGeometry({crop:[.1,.1,.2,.2],rotation:90}));
 assert.equal(shiftDate('2024-02-28',1),'2024-02-29');assert.equal(shiftDate('2026-10-25',1),'2026-10-26');
 assert.ok(pointInPolygon({x:50,y:50},samples));assert.equal(pointInPolygon({x:150,y:50},samples),false);
});
