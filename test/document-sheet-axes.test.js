import test from 'node:test';
import assert from 'node:assert/strict';
import { blankTable, checkTable } from '../public/document-sheet-model.js';
import { createSheetEngine } from '../public/document-sheet-deps.js';
const setup = (t,options) => { const table=blankTable('d-axes','Axes'); table.workbook.sheets['sheet-1'].cellData={0:{0:{v:10},1:{v:20},2:{f:'=A1+B1'}},1:{0:{v:30}}}; const e=createSheetEngine(table,options); t.after(()=>e.destroy());return e; };
test('new tables and sheets begin with 100 rows while stored larger worksheets remain valid',()=>{
 const t=blankTable('d-axes','Axes');assert.equal(t.workbook.sheets['sheet-1'].rowCount,100);t.workbook.sheets['sheet-1'].rowCount=1000;assert.equal(checkTable(t,'d-axes').workbook.sheets['sheet-1'].rowCount,1000);
});
test('row/column moves carry values, labels, formulas and widths, with undo and redo',async t=>{
 const e=setup(t);await e.calculated();e.setAxisLabel('sheet-1','column',0,'Budget');e.mutate(()=>e.sheet('sheet-1').setColumnWidth(0,180));
 e.moveAxis('sheet-1','column',0,1,3);await e.calculated();
 assert.equal(e.sheet('sheet-1').getRange('C1').getValue(),10);assert.equal(e.sheet('sheet-1').getRange('B1').getValue(),30);
 assert.equal(e.sheet('sheet-1').getRange('B1').getFormula(),'=C1+A1');assert.equal(e.snapshot().workbook.sheets['sheet-1'].columnData[2].custom.pencilsLabel,'Budget');assert.equal(e.snapshot().workbook.sheets['sheet-1'].columnData[2].w,180);
 await e.undo();await e.calculated();assert.equal(e.sheet('sheet-1').getRange('C1').getValue(),30);await e.redo();await e.calculated();assert.equal(e.sheet('sheet-1').getRange('C1').getValue(),10);
 e.setAxisLabel('sheet-1','row',0,'Totals');e.moveAxis('sheet-1','row',0,1,3);await e.calculated();assert.equal(e.snapshot().workbook.sheets['sheet-1'].rowData[2].custom.pencilsLabel,'Totals');assert.equal(e.sheet('sheet-1').getRange('C3').getValue(),10);assert.equal(e.sheet('sheet-1').getRange('B3').getValue(),30);
});
test('labels, hidden tracks and finite sheet sizes save and undo without dropping cells',async t=>{
 const e=setup(t);e.setAxisLabel('sheet-1','row',1,'Work');assert.equal(e.snapshot().workbook.sheets['sheet-1'].rowData[1].custom.pencilsLabel,'Work');await e.undo();assert.equal(e.snapshot().workbook.sheets['sheet-1'].rowData[1]?.custom?.pencilsLabel,undefined);
 e.setAxisHidden('sheet-1','row',0,2,true);assert.equal(e.snapshot().workbook.sheets['sheet-1'].rowData[0].hd,1);assert.equal(e.sheet('sheet-1').getRange('A1').getValue(),10);await e.undo();assert.notEqual(e.snapshot().workbook.sheets['sheet-1'].rowData[0]?.hd,1);
 e.setAxisHidden('sheet-1','column',0,1,true);assert.equal(e.snapshot().workbook.sheets['sheet-1'].columnData[0].hd,1);e.setAxisHidden('sheet-1','column',0,1,false);assert.notEqual(e.snapshot().workbook.sheets['sheet-1'].columnData[0].hd,1);
 e.setAxisCount('sheet-1','row',4);assert.equal(e.snapshot().workbook.sheets['sheet-1'].rowCount,4);await e.undo();assert.equal(e.snapshot().workbook.sheets['sheet-1'].rowCount,100);
 for(const [axis,count] of [['row',0],['column',201],['row',10001]]) assert.throws(()=>e.setAxisCount('sheet-1',axis,count));
 assert.throws(()=>e.setAxisHidden('sheet-1','row',0,100,true),/one visible/);assert.throws(()=>e.moveAxis('sheet-1','row',99,2,0));assert.throws(()=>e.setAxisLabel('sheet-1','column',26,'bad'));assert.throws(()=>e.setAxisLabel('sheet-1','column',1,'x'.repeat(81)));
 checkTable(e.snapshot(),'d-axes');
});

test('resizing deletes cropped cells and restores them with undo, and can grow either axis',async t=>{
 const e=setup(t);e.setValue('sheet-1',90,25,'Keep outside');e.setAxisCount('sheet-1','row',4);assert.equal(e.snapshot().workbook.sheets['sheet-1'].cellData[90],undefined);checkTable(e.snapshot(),'d-axes');await e.undo();assert.equal(e.sheet('sheet-1').getRange('Z91').getValue(),'Keep outside');
 e.setAxisCount('sheet-1','column',4);assert.equal(e.snapshot().workbook.sheets['sheet-1'].cellData[90]?.[25],undefined);await e.undo();assert.equal(e.sheet('sheet-1').getRange('Z91').getValue(),'Keep outside');
 e.setAxisCount('sheet-1','row',105);e.setAxisCount('sheet-1','column',30);assert.equal(e.snapshot().workbook.sheets['sheet-1'].rowCount,105);assert.equal(e.snapshot().workbook.sheets['sheet-1'].columnCount,30);
});
test('axis metadata validates names and hidden flags at their boundaries',()=>{
 for(const [field,value]of [['rowData',{0:{hd:true}}],['columnData',{0:{hd:2}}],['rowData',{0:{custom:{pencilsLabel:4}}}],['columnData',{0:{custom:{pencilsLabel:'x'.repeat(81)}}}],['rowData',{0:{custom:{pencilsLabel:'bad\nname'}}}]]){const t=blankTable('d-axes','Axes');t.workbook.sheets['sheet-1'][field]=value;assert.throws(()=>checkTable(t,'d-axes'));}
 const t=blankTable('d-axes','Axes');t.workbook.sheets['sheet-1'].rowData={0:{hd:0,custom:{pencilsLabel:'x'.repeat(80)}}};t.workbook.sheets['sheet-1'].columnData={0:{hd:1,custom:{pencilsLabel:''}}};assert.ok(checkTable(t,'d-axes'));
});

test('axis actions publish durable changes, preserve no-ops and validate all move boundaries',async t=>{
 const saved=[];const e=setup(t,{onChange:value=>saved.push(structuredClone(value))});await e.calculated();
 for(const action of [()=>e.setAxisLabel('sheet-1','column',1,' x '),()=>e.moveAxis('sheet-1','column',1,1,0),()=>e.setAxisHidden('sheet-1','column',1,1,true),()=>e.setAxisHidden('sheet-1','column',1,1,false),()=>e.setAxisHidden('sheet-1','row',1,1,true),()=>e.setAxisHidden('sheet-1','row',1,1,false),()=>e.setAxisCount('sheet-1','column',25)]){const count=saved.length;action();e.flush();assert.equal(saved.length,count+1);}
 assert.equal(e.snapshot().workbook.sheets['sheet-1'].columnData[0].custom.pencilsLabel,'x');
 for(const before of [0,1]){const count=saved.length;e.moveAxis('sheet-1','column',0,1,before);e.flush();assert.equal(saved.length,count);}
 e.moveAxis('sheet-1','row',0,1,100);e.flush();assert.equal(e.sheet('sheet-1').getRange('B100').getValue(),10);
 e.setAxisCount('sheet-1','column',1);e.setAxisCount('sheet-1','column',200);e.setAxisCount('sheet-1','row',1);e.setAxisCount('sheet-1','row',10000);checkTable(e.snapshot(),'d-axes');
 for(const args of [['bad',0,1,0],['row',.5,1,0],['row',-1,1,0],['row',0,0,0],['row',0,.5,0]])assert.throws(()=>e.moveAxis('sheet-1',...args),/Choose rows or columns/);
 for(const before of [-1,.5,10001])assert.throws(()=>e.moveAxis('sheet-1','row',0,1,before),/position within/);
 assert.throws(()=>e.setAxisLabel('missing','row',0,'X'),/Worksheet not found/);e.setAxisLabel('sheet-1','column',0,'x'.repeat(80));
});
test('block moves start at their actual row or column and retain order across other sheets',async t=>{
 const table=blankTable('d-blocks','Blocks');const s=table.workbook.sheets['sheet-1'];s.rowCount=6;s.columnCount=6;s.cellData=Object.fromEntries(Array.from({length:6},(_,r)=>[r,Object.fromEntries(Array.from({length:6},(_,c)=>[c,{v:r*10+c}]))]));
 table.workbook.sheetOrder.push('other');table.workbook.sheets.other={...structuredClone(s),id:'other',name:'Reference',cellData:{0:{0:{f:"='Sheet 1'!B2"}}}};
 const e=createSheetEngine(table);t.after(()=>e.destroy());await e.calculated();e.moveAxis('sheet-1','row',1,2,5);await e.calculated();assert.deepEqual(e.sheet('sheet-1').getRange('A1:A6').getValues().flat(),[0,30,40,10,20,50]);assert.equal(e.sheet('other').getRange('A1').getValue(),11);assert.match(e.sheet('other').getRange('A1').getFormula(),/B4/);
 e.moveAxis('sheet-1','column',1,2,5);await e.calculated();assert.deepEqual(e.sheet('sheet-1').getRange('A1:F1').getValues()[0],[0,3,4,1,2,5]);assert.match(e.sheet('other').getRange('A1').getFormula(),/D4/);assert.equal(e.sheet('other').getRange('A1').getValue(),11);
});
test('filtered columns cannot move or be truncated until their filters are cleared',t=>{
 const e=setup(t);e.filters['sheet-1']={1:'20'};assert.throws(()=>e.moveAxis('sheet-1','column',1,1,4),/Clear worksheet filters/);assert.throws(()=>e.setAxisCount('sheet-1','column',1),/Clear worksheet filters/);e.moveAxis('sheet-1','row',1,1,3);e.setAxisCount('sheet-1','row',4);delete e.filters['sheet-1'];e.moveAxis('sheet-1','column',1,1,4);
});
test('a cell exactly past the last row is outside the finite worksheet',()=>{const table=blankTable('d-axes','Axes');table.workbook.sheets['sheet-1'].cellData={100:{0:{v:'outside'}}};assert.throws(()=>checkTable(table,'d-axes'),/outside/);});

test('the last visible track may be kept at the exact hide boundary, and showing rows restores them',t=>{
 const e=setup(t);e.setAxisHidden('sheet-1','row',0,99,true);assert.equal(e.snapshot().workbook.sheets['sheet-1'].rowData[98].hd,1);assert.notEqual(e.snapshot().workbook.sheets['sheet-1'].rowData[99]?.hd,1);e.setAxisHidden('sheet-1','row',0,99,false);assert.notEqual(e.snapshot().workbook.sheets['sheet-1'].rowData[98].hd,1);
 e.setAxisHidden('sheet-1','column',0,25,true);assert.equal(e.snapshot().workbook.sheets['sheet-1'].columnData[24].hd,1);assert.notEqual(e.snapshot().workbook.sheets['sheet-1'].columnData[25]?.hd,1);
 assert.throws(()=>e.setAxisCount('sheet-1','row',10001),/10,000 rows/);assert.throws(()=>e.setAxisCount('sheet-1','column',201),/200 columns/);
});
