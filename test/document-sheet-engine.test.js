import test from 'node:test';
import assert from 'node:assert/strict';
import { blankTable } from '../public/document-sheet-model.js';
import { createSheetEngine } from '../public/document-sheet-deps.js';

test('the spreadsheet engine calculates cross-sheet formulas, formats results, updates references and undoes edits',async t=>{
  const table=blankTable('d-engine','Budget');
  table.workbook.sheetOrder.push('other');table.workbook.sheets.other={...structuredClone(table.workbook.sheets['sheet-1']),id:'other',name:'Rates'};
  table.workbook.sheets['sheet-1'].cellData={0:{0:{v:10},1:{v:5},2:{f:'=A1*B1'}}};
  table.workbook.sheets.other.cellData={0:{0:{f:'=SUM(Budget!A1:A2)'}}};
  table.workbook.sheets['sheet-1'].name='Budget';
  const engine=createSheetEngine(table);t.after(()=>engine.destroy());
  await engine.calculated();
  assert.equal(engine.sheet('sheet-1').getRange('C1').getValue(),50);
  assert.equal(engine.sheet('other').getRange('A1').getValue(),10);
  engine.setValue('sheet-1',0,0,'20');await engine.calculated();
  assert.equal(engine.sheet('sheet-1').getRange('C1').getValue(),100);
  await engine.undo();await engine.calculated();
  assert.equal(engine.sheet('sheet-1').getRange('C1').getValue(),50);
  engine.sheet('sheet-1').getRange('C1').setNumberFormat('£#,##0.00');
  assert.equal(engine.sheet('sheet-1').getRange('C1').getDisplayValues()[0][0],'£50.00');
  engine.sheet('sheet-1').insertRowsBefore(0,1);await engine.calculated();
  assert.equal(engine.sheet('sheet-1').getRange('C2').getRawValue(),50);
  assert.match(engine.sheet('sheet-1').getRange('C2').getFormula(),/A2\*B2/);
  assert.equal(engine.snapshot().format,1);
});
test('typed cells preserve literal text, dates, booleans and leading zeroes',async t=>{
  const engine=createSheetEngine(blankTable('d-values','Values'));t.after(()=>engine.destroy());
  for(const [row,value]of ['0012','true','2026-11-02',"'=SUM(A1:A2)",'café\nnext'].entries())engine.setValue('sheet-1',row,0,value);
  const range=engine.sheet('sheet-1').getRange('A1:A5');
  assert.equal(range.getValues()[0][0],'0012');assert.equal(range.getDisplayValues()[1][0],'TRUE');
  assert.equal(range.getDisplayValues()[2][0],'2026-11-02');assert.equal(range.getValues()[3][0],'=SUM(A1:A2)');assert.equal(range.getValues()[4][0],'café\nnext');
});

test('numeric import sorting keeps rows together, updates formulas and can be undone', async t => {
  const table = blankTable('d-sort', 'Sort');
  table.workbook.sheets['sheet-1'].cellData = {0:{0:{v:'Title'},1:{v:'Cost'},2:{v:'Total'}},1:{0:{v:'Design'},1:{v:80},2:{f:'=B2*2'}},2:{0:{v:'Build'},1:{v:120},2:{f:'=B3*2'}}};
  const engine = createSheetEngine(table);t.after(() => engine.destroy());await engine.calculated();
  engine.mutate(() => engine.sheet('sheet-1').getRange(1,0,2,3).sort({ column:1, ascending:false }));await engine.calculated();
  assert.equal(engine.sheet('sheet-1').getRange('A2').getValue(),'Build');assert.equal(engine.sheet('sheet-1').getRange('B2').getValue(),120);
  assert.equal(engine.sheet('sheet-1').getRange('C2').getValue(),240);
  await engine.undo();await engine.calculated();assert.equal(engine.sheet('sheet-1').getRange('A2').getValue(),'Design');
});

test('documented arithmetic, aggregates, conditions and invalid references calculate locally',async t=>{
 const table=blankTable('d-functions','Functions');table.workbook.sheets['sheet-1'].cellData={0:{0:{v:10},1:{v:20}},1:{0:{f:'=AVERAGE(A1:B1)'},1:{f:'=IF(A1>5,"Over","OK")'}},2:{0:{f:'=1/0'},1:{f:'=#REF!'}}};const engine=createSheetEngine(table);t.after(()=>engine.destroy());await engine.calculated();
 assert.equal(engine.sheet('sheet-1').getRange('A2').getRawValue(),15);assert.equal(engine.sheet('sheet-1').getRange('B2').getRawValue(),'Over');assert.equal(engine.sheet('sheet-1').getRange('A3').getDisplayValues()[0][0],'#DIV/0!');assert.equal(engine.sheet('sheet-1').getRange('B3').getDisplayValues()[0][0],'#REF!');
});

test('opening a snapshot recalculates cached results after an edit was flushed before calculation finished',async t=>{
 const table=blankTable('d-cached','Cached results');table.workbook.sheets['sheet-1'].cellData={0:{0:{v:125},1:{f:'=A1*2',v:160}}};const engine=createSheetEngine(table);t.after(()=>engine.destroy());await engine.calculated();assert.equal(engine.sheet('sheet-1').getRange('B1').getRawValue(),250);
});

test('save notifications coalesce, flush once, persist filters, and dispose without later callbacks',async t=>{
 const table=blankTable('d-notify','Notifications');table.filters={'sheet-1':{'0':'Design'}};const notifications=[],refreshes=[];
 const engine=createSheetEngine(table,{onChange:value=>notifications.push(value),onRefresh:()=>refreshes.push(true)});let destroyed=false;t.after(()=>{if(!destroyed)return engine.destroy();});await engine.calculated();
 assert.deepEqual(engine.filters,table.filters);engine.filters['sheet-1']['0']='Build';assert.equal(table.filters['sheet-1']['0'],'Design');
 engine.flush();assert.equal(notifications.length,0);
 const realSet=globalThis.setTimeout,realClear=globalThis.clearTimeout,timers=[],cleared=[];
 t.mock.method(globalThis,'setTimeout',(fn,ms,...args)=>{const timer=realSet(fn,ms,...args);if(ms===400)timers.push({fn,timer});return timer;});t.mock.method(globalThis,'clearTimeout',timer=>{cleared.push(timer);return realClear(timer);});
 engine.setValues('sheet-1',0,0,[['2','=A1*3'],['5']]);assert.ok(timers.length);const first=timers.at(-1);engine.setValue('sheet-1',1,1,'7');assert.ok(cleared.includes(first.timer));
 engine.flush();assert.ok(cleared.includes(timers.at(-1).timer));assert.equal(notifications.length,1);assert.equal(notifications[0].workbook.sheets['sheet-1'].cellData[1][1].v,7);assert.equal(notifications[0].workbook.sheets['sheet-1'].cellData[0][0].v,2);
 engine.flush();assert.equal(notifications.length,1);assert.deepEqual(engine.sheet('sheet-1').getRange('A2:B2').getValues()[0],[5,7]);
 const before=refreshes.length;engine.mutate(()=>{engine.filters['sheet-1']['0']='Review';});assert.ok(refreshes.length>before);const timed=timers.at(-1);realClear(timed.timer);timed.fn();assert.equal(notifications.length,2);assert.equal(notifications[1].filters['sheet-1']['0'],'Review');
 engine.setValues('sheet-1',3,0,[['=SUM(A1:A2)','true'],['0012']],{literal:true});engine.flush();assert.deepEqual(engine.sheet('sheet-1').getRange('A4:B5').getValues(),[['=SUM(A1:A2)','true'],['0012','']]);
 engine.setValue('sheet-1',5,0,'12');await engine.destroy();destroyed=true;assert.equal(notifications.at(-1).workbook.sheets['sheet-1'].cellData[5][0].v,12);const count=notifications.length,paint=refreshes.length;
 assert.equal(engine.api.getActiveWorkbook(),null);engine.mutate(()=>{});engine.flush();assert.equal(notifications.length,count);assert.equal(refreshes.length,paint);
});
test('undo and redo publish workbook changes, while explicit imported cell types and date styles are preserved',async t=>{
 const table=blankTable('d-types','Types');table.workbook.sheets['sheet-1'].cellData={0:{0:{v:1,t:3},1:{v:'Date',s:{bl:1,bg:{rgb:'#ffeecc'}}}}};let last;
 const engine=createSheetEngine(table,{onChange:value=>{last=value;}});t.after(()=>engine.destroy());await engine.calculated();assert.equal(engine.sheet('sheet-1').getRange('A1').getDisplayValues()[0][0],'TRUE');
 engine.setValue('sheet-1',0,1,'2026-11-02');engine.flush();const data=last.workbook.sheets['sheet-1'].cellData[0][1],style=typeof data.s==='string'?last.workbook.styles[data.s]:data.s;assert.equal(style.bl,1);assert.equal(style.bg.rgb,'#ffeecc');
 engine.setValue('sheet-1',1,0,'42');engine.flush();await engine.undo();engine.flush();assert.equal(last.workbook.sheets['sheet-1'].cellData[1]?.[0]?.v??null,null);await engine.redo();engine.flush();assert.equal(last.workbook.sheets['sheet-1'].cellData[1][0].v,42);
});
