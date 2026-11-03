import test from 'node:test';
import assert from 'node:assert/strict';
import { blankTable, checkTable, usedTableRange, tableCSV, tablePreview } from '../public/document-sheet-model.js';
import { richDocument, richPlainText, formatRichText, checkRichText } from '../public/document-sheet-richtext.js';

test('rich cells retain text, line breaks and partial formatting through vault validation and exports',()=>{
  const table=blankTable('rich-table','Rich table');
  const p=richDocument('Hello world\nNext line',[{st:0,ed:5,ts:{bl:1}},{st:6,ed:11,ts:{it:1}}],'rich-cell');
  table.workbook.sheets['sheet-1'].cellData={0:{0:{p}}};
  const saved=checkTable(JSON.parse(JSON.stringify(table)),table.workbook.id);
  assert.equal(richPlainText(saved.workbook.sheets['sheet-1'].cellData[0][0].p),'Hello world\nNext line');
  assert.deepEqual(usedTableRange(saved.workbook.sheets['sheet-1']),{rows:1,columns:1});
  assert.equal(tableCSV(saved,'sheet-1'),'"Hello world\nNext line"');
  assert.match(tablePreview(saved),/Hello world/);
  assert.deepEqual(saved.workbook.sheets['sheet-1'].cellData[0][0].p.body.textRuns,p.body.textRuns);
});
test('formatting a selected word preserves all other runs, Unicode text and its source snapshot',()=>{
  const source=richDocument('😀 Hello world',[{st:3,ed:8,ts:{it:1}}],'cell'), original=structuredClone(source);
  const result=formatRichText(source,9,14,{bl:1,cl:{rgb:'#bd443c'}});
  assert.equal(richPlainText(result),'😀 Hello world');
  assert.deepEqual(source,original);
  assert.deepEqual(result.body.textRuns,[{st:3,ed:8,ts:{it:1}},{st:9,ed:14,ts:{bl:1,cl:{rgb:'#bd443c'}}}]);
  const cleared=formatRichText(result,3,8,{it:0});
  assert.equal(cleared.body.textRuns.find(run=>run.st===3).ts.it,0);
  assert.throws(()=>formatRichText(source,-1,5,{bl:1}),/range/i);
});
test('rich text rejects malformed or excessive runs and embedded content',()=>{
  const p=richDocument('Hello',[],'cell');assert.doesNotThrow(()=>checkRichText(p));
  for(const bad of [null,{}, {...p,body:{dataStream:123}}, {...p,body:{...p.body,textRuns:[{st:-1,ed:2,ts:{bl:1}}]}}, {...p,body:{...p.body,textRuns:[{st:0,ed:20,ts:{bl:1}}]}}, {...p,body:{...p.body,textRuns:[{st:0,ed:4,ts:{bl:1}},{st:2,ed:5,ts:{it:1}}]}}, {...p,body:{...p.body,customBlocks:[{blockId:'image'}]}}, {...p,body:{...p.body,textRuns:[{st:0,ed:2,ts:{fs:10000}}]}}])assert.throws(()=>checkRichText(bad),/rich|text|run|format|embed/i);
  assert.throws(()=>richDocument('x'.repeat(32001)),/32,000/);
});
test('merged ranges validate bounds and overlap and keep their rich anchor content',()=>{
  const table=blankTable('merged','Merged'), sheet=table.workbook.sheets['sheet-1'];
  sheet.cellData={0:{0:{p:richDocument('Merged heading',[{st:0,ed:6,ts:{bl:1}}])}}};
  sheet.mergeData=[{startRow:0,endRow:1,startColumn:0,endColumn:1},{startRow:0,endRow:1,startColumn:2,endColumn:3}];
  assert.doesNotThrow(()=>checkTable(table,'merged'));
  for(const bad of [{startRow:-1,endRow:1,startColumn:0,endColumn:1},{startRow:0,endRow:100,startColumn:0,endColumn:1},{startRow:2,endRow:1,startColumn:0,endColumn:1},{startRow:0,endRow:0,startColumn:0,endColumn:0}]){
    sheet.mergeData=[bad];assert.throws(()=>checkTable(table,'merged'),/merge/i);
  }
  sheet.mergeData=[{startRow:0,endRow:2,startColumn:0,endColumn:2},{startRow:2,endRow:3,startColumn:2,endColumn:3}];
  assert.throws(()=>checkTable(table,'merged'),/overlap/i);
});

test('rich text validates every style and index boundary and preserves valid maximum text',()=>{
 const p=richDocument('Hello',[],'cell'),run=ts=>({...p,body:{...p.body,textRuns:[{st:0,ed:5,ts}]}});
 for(const ts of [{bl:0,it:1,ul:{s:1},st:{s:0},fs:8,ff:'Arial',cl:{rgb:'#ab12Cd'}},{fs:72,ff:'a'.repeat(100)}])assert.equal(checkRichText(run(ts)).body.textRuns[0].ts,ts);
 assert.equal(richPlainText(richDocument('x'.repeat(32000))).length,32000);
 assert.equal(richPlainText(richDocument('Line\n\nLine\n')),'Line\n\nLine\n');
 const noRuns=structuredClone(p);delete noRuns.body.textRuns;delete noRuns.body.paragraphs;assert.equal(checkRichText(noRuns),noRuns);
 for(const ts of [{bl:2},{it:true},{ul:1},{ul:{s:2}},{st:null},{st:{s:4}},{fs:NaN},{fs:7},{fs:73},{ff:123},{ff:'a'.repeat(101)},{ff:'Arial; color:red'},{cl:123},{cl:{rgb:'red'}},{unsupported:1}])assert.throws(()=>checkRichText(run(ts)),/rich|text|font|format|colour/i);
 for(const bad of ['bad',{},0])assert.throws(()=>checkRichText({...p,body:{...p.body,textRuns:bad}}),/runs/);
 for(const [st,ed]of [[0.5,2],[0,1.5],[2,2],[3,2]])assert.throws(()=>checkRichText({...p,body:{...p.body,textRuns:[{st,ed,ts:{bl:1}}]}}),/runs/);
 for(const paragraphs of [{},[null],[{startIndex:0.5}],[{startIndex:-1}],[{startIndex:6}]])assert.throws(()=>checkRichText({...p,body:{...p.body,paragraphs}}),/paragraphs/);
 assert.doesNotThrow(()=>checkRichText({...p,body:{...p.body,paragraphs:[{startIndex:0},{startIndex:5}]}}));
 assert.throws(()=>richDocument('bad\u0000text'),/characters/);
 for(const [start,end]of [[0.5,2],[0,1.5],[2,1],[0,6]])assert.throws(()=>formatRichText(p,start,end,{bl:1}),/range/);
 assert.throws(()=>formatRichText({...p,body:{...p.body,textRuns:[{st:0,ed:0,ts:{bl:1}}]}},0,1,{bl:1}),/runs/);
 assert.equal(richPlainText(formatRichText(p,0,0,{bl:1})),'Hello');
 assert.deepEqual(formatRichText(richDocument('abcd',[{st:0,ed:2,ts:{bl:1}}]),2,4,{bl:1}).body.textRuns,[{st:0,ed:4,ts:{bl:1}}]);
 assert.deepEqual(formatRichText(richDocument('abcd',[{st:0,ed:4,ts:{bl:1}}]),1,3,{it:1}).body.textRuns,[{st:0,ed:1,ts:{bl:1}},{st:1,ed:3,ts:{bl:1,it:1}},{st:3,ed:4,ts:{bl:1}}]);
});
test('merged cells accept horizontal, vertical and full-sheet ranges, reject malformed arrays and endpoints',()=>{
 const table=blankTable('merge-bounds','Bounds'),s=table.workbook.sheets['sheet-1'];
 for(const mergeData of [[{startRow:0,endRow:0,startColumn:0,endColumn:1}],[{startRow:0,endRow:1,startColumn:0,endColumn:0}],[{startRow:0,endRow:99,startColumn:0,endColumn:25}]]){s.mergeData=mergeData;assert.doesNotThrow(()=>checkTable(table,'merge-bounds'));}
 for(const mergeData of [{},'', 'bad',[null],[[]],[{startRow:0.5,endRow:1,startColumn:0,endColumn:1}],[{startRow:0,endRow:0,startColumn:0,endColumn:26}],[{startRow:0,endRow:1,startColumn:0,endColumn:26}],[{startRow:0,endRow:1,startColumn:2,endColumn:1}]]){s.mergeData=mergeData;assert.throws(()=>checkTable(table,'merge-bounds'),/merge/i);}
 s.mergeData=[{startRow:0,endRow:2,startColumn:3,endColumn:4},{startRow:0,endRow:2,startColumn:0,endColumn:1}];assert.doesNotThrow(()=>checkTable(table,'merge-bounds'));
 s.mergeData.push({startRow:1,endRow:1,startColumn:1,endColumn:3});assert.throws(()=>checkTable(table,'merge-bounds'),/overlap/);
});
test('blank rich text does not enlarge CSV exports and table metadata keeps the supported nesting limit',()=>{
 const table=blankTable('blank-rich','Blank');table.workbook.sheets['sheet-1'].cellData={9:{9:{p:richDocument('')}}};assert.deepEqual(usedTableRange(table.workbook.sheets['sheet-1']),{rows:0,columns:0});assert.equal(tableCSV(table,'sheet-1'),'');
 let cursor=table;for(let i=0;i<15;i++){cursor.extra={};cursor=cursor.extra;}cursor.value='at depth 16';assert.doesNotThrow(()=>checkTable(table,'blank-rich'));cursor.extra={value:'too deep'};assert.throws(()=>checkTable(table,'blank-rich'),/complex/);
});

test('rich formatting scales to many adjacent runs and rejects malformed embedded sections',()=>{
 const text='x'.repeat(10000),runs=Array.from({length:10000},(_,i)=>({st:i,ed:i+1,ts:{bl:i%2}})),p=richDocument(text,runs);
 const result=formatRichText(p,5000,10000,{it:1});assert.equal(result.body.textRuns.length,10000);assert.equal(result.body.textRuns[4999].ts.it,undefined);assert.equal(result.body.textRuns[5000].ts.it,1);assert.equal(result.body.textRuns[9999].ts.bl,1);
 for(const key of ['customBlocks','customRanges','tables','sectionBreaks'])assert.throws(()=>checkRichText({...p,body:{...p.body,[key]:{unexpected:true}}}),/embed/i);
});
