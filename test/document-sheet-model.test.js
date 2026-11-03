import test from 'node:test';
import assert from 'node:assert/strict';
import { marked } from 'marked';
import { blankTable, checkTable, parseCSV, tableFromRows, tableCSV, tablePreview } from '../public/document-sheet-model.js';

test('Tables start sparse, support multiple worksheets and validate dimensions and cell data', () => {
  const table=blankTable('d-test','Budget');
  assert.equal(table.workbook.sheets['sheet-1'].rowCount,100);
  assert.equal(Object.keys(table.workbook.sheets['sheet-1'].cellData).length,0);
  table.workbook.sheetOrder.push('sheet-2');
  table.workbook.sheets['sheet-2']={...structuredClone(table.workbook.sheets['sheet-1']),id:'sheet-2',name:'Assumptions'};
  assert.deepEqual(checkTable(table,'d-test'),table);
  for(const change of [t=>t.workbook.id='d-other',t=>t.workbook.sheets['sheet-1'].rowCount=10001,t=>t.workbook.sheets['sheet-1'].columnCount=201,t=>t.workbook.sheetOrder.push('missing'),t=>t.workbook.sheets['sheet-1'].cellData={1000:{0:{v:'outside'}}},t=>t.workbook.sheets['sheet-1'].cellData={0:{0:{v:Infinity}}}]){
    const invalid=structuredClone(table);change(invalid);assert.throws(()=>checkTable(invalid,'d-test'));
  }
  assert.throws(()=>checkTable(JSON.parse('{"format":1,"__proto__":{}}'),'d-test'));
});
test('CSV preserves quoted commas, line breaks, Unicode, empty fields and formula-like literal text', () => {
  const source='Item,Note,Qty\r\n"Smith, J","say ""hi""\nand café",0\r\n=SUM(A1:A2),,2\r\n';
  const rows=parseCSV(source);
  assert.deepEqual(rows,[['Item','Note','Qty'],['Smith, J','say "hi"\nand café','0'],['=SUM(A1:A2)','','2']]);
  const table=tableFromRows(rows,{id:'d-csv',name:'CSV'});
  assert.equal(table.workbook.sheets['sheet-1'].cellData[2][0].v,'=SUM(A1:A2)');
  assert.equal(table.workbook.sheets['sheet-1'].cellData[2][0].f,undefined);
  assert.deepEqual(parseCSV(tableCSV(table,'sheet-1')),rows);
  const formula=tableFromRows([['=SUM(B1:B2)','1'],['x','2']],{id:'d-formula',name:'Formula',formulas:true});
  assert.equal(formula.workbook.sheets['sheet-1'].cellData[0][0].f,'=SUM(B1:B2)');
  assert.match(tableCSV(formula,'sheet-1',{formulas:true}),/^=SUM\(B1:B2\),1/);
  assert.deepEqual(parseCSV('A;B\n"a;b";2',';'),[['A','B'],['a;b','2']]);
  assert.throws(()=>parseCSV('A,B\n"unclosed,2'),/quote/i);
});
test('Markdown previews remain readable without interpreting cell markup or escaped pipes', () => {
  const rows=[['Item','Value'],['a|b','a\\|b'],['a\\\\|b','<img src=x onerror=alert(1)>'],['**plain**','`code`']];
  const table=tableFromRows(rows,{id:'d-preview',name:'Preview'});
  const preview=tablePreview(table),html=marked.parse(preview);
  const tokens=marked.lexer(preview).filter(t=>t.type==='table');
  assert.equal(tokens[0].header.length,2);
  assert.equal(tokens[0].rows.length,3);
  assert.equal(tokens[0].rows[0].length,2);
  assert.doesNotMatch(html,/<img|<strong>|<code>/);
  assert.ok(html.includes('<td>a|b</td>'));
  assert.ok(html.includes('<td>a\\|b</td>'));
  assert.ok(html.includes('<td>a\\\\|b</td>'));
});

test('spreadsheet validation rejects malformed identities, cells, sizing, freezes and filters', () => {
  const reject = (change, message) => { const table = blankTable('d-bound', 'Budget');change(table, table.workbook.sheets['sheet-1']);assert.throws(() => checkTable(table, 'd-bound'), message); };
  const cases = [
    [t => t.format = 2, /format/], [t => t.workbook = [], /format/], [t => t.workbook.name = 3, /identity/], [t => t.workbook.name = ' ', /identity/], [t => t.workbook.name = 'x'.repeat(301), /identity/],
    [t => t.workbook.sheetOrder = {}, /worksheets/], [t => t.workbook.sheetOrder = [], /worksheets/], [t => t.workbook.sheets = [], /worksheets/], [t => t.workbook.sheetOrder.push('sheet-1'), /worksheets/],
    [(t,s) => s.id = 'other', /names/], [(t,s) => s.name = 4, /names/], [(t,s) => s.name = ' ', /names/], [(t,s) => s.name = 'x'.repeat(81), /names/], [(t,s) => s.name = 'x/y', /names/],
    [(t,s) => s.rowCount = .5, /rows/], [(t,s) => s.rowCount = 0, /rows/], [(t,s) => s.columnCount = .5, /rows/], [(t,s) => s.columnCount = 0, /rows/], [(t,s) => s.cellData = [], /cells/],
    [(t,s) => s.cellData = { x: {} }, /outside/], [(t,s) => s.cellData = { 0: [] }, /outside/], [(t,s) => s.cellData = { 0: { x: {} } }, /outside/], [(t,s) => s.cellData = { 0: { 26: {} } }, /outside/], [(t,s) => s.cellData = { 0: { 0: [] } }, /outside/],
    [(t,s) => s.cellData = { 0: { 0: { v: {} } } }, /cell value/], [(t,s) => s.cellData = { 0: { 0: { v: 'x'.repeat(32001) } } }, /32,000/], [(t,s) => s.cellData = { 0: { 0: { f: 2 } } }, /formula/], [(t,s) => s.cellData = { 0: { 0: { f: 'SUM(A1)' } } }, /formula/], [(t,s) => s.cellData = { 0: { 0: { f: '=' + '1'.repeat(8192) } } }, /formula/], [(t,s) => s.cellData = { 0: { 0: { p: {} } } }, /rich text/],
    [(t,s) => s.rowData = [], /settings/], [(t,s) => s.columnData = [], /settings/], [(t,s) => s.rowData = { x: {} }, /settings/], [(t,s) => s.columnData = { 26: {} }, /settings/], [(t,s) => s.rowData = { 1000: {} }, /settings/], [(t,s) => s.columnData = { 0: [] }, /settings/], [(t,s) => s.rowData = { 0: { h: 15 } }, /sizes/], [(t,s) => s.columnData = { 0: { w: 2001 } }, /sizes/], [(t,s) => s.rowData = { 0: { h: '20' } }, /sizes/],
    [(t,s) => s.freeze = [], /Freeze/], [(t,s) => s.freeze.xSplit = -1, /Freeze/], [(t,s) => s.freeze.ySplit = -1, /Freeze/], [(t,s) => s.freeze.xSplit = .5, /Freeze/], [(t,s) => s.freeze.ySplit = .5, /Freeze/], [(t,s) => s.freeze.xSplit = 6, /Freeze/], [(t,s) => s.freeze.ySplit = 6, /Freeze/],
    [t => t.workbook.sheets.extra = {}, /order/], [t => t.workbook.styles = [], /styles/], [t => t.workbook.styles = Object.fromEntries(Array.from({length:10001},(_,i)=>[i,{}])), /styles/],
    [t => t.filters = [], /filters/], [t => t.filters = { other: {} }, /filters/], [t => t.filters = { 'sheet-1': [] }, /filters/], [t => t.filters = { 'sheet-1': { x: 'a' } }, /filters/], [t => t.filters = { 'sheet-1': { 26: 'a' } }, /filters/], [t => t.filters = { 'sheet-1': { 0: 2 } }, /filters/], [t => t.filters = { 'sheet-1': { 0: 'a'.repeat(301) } }, /filters/],
    [t => t.extra = Symbol('invalid'), /value/], [t => t.extra = () => {}, /value/], [t => t.extra = JSON.parse('{"constructor":1}'), /property/], [t => t.extra = JSON.parse('{"prototype":1}'), /property/],
  ];
  for (const [change, message] of cases) reject(change, message);
  const nested = depth => depth ? { x: nested(depth - 1) } : 'value';
  reject(t => t.extra = nested(16), /complex/);
  const valid = blankTable('d-bound', 'x'.repeat(300));valid.extra = nested(15);const s = valid.workbook.sheets['sheet-1'];s.name = 'x'.repeat(80);s.rowCount=10000;s.columnCount=200;s.freeze={xSplit:5,ySplit:5,startRow:0,startColumn:0};s.cellData={9999:{199:{v:'x'.repeat(32000)},198:{f:'='+ '1'.repeat(8191)}}};s.rowData={0:{h:16},9999:{h:2000}};s.columnData={0:{w:16},199:{w:2000}};valid.filters={'sheet-1':{199:'a'.repeat(300)}};valid.workbook.styles=Object.fromEntries(Array.from({length:10000},(_,i)=>[i,{}]));
  assert.deepEqual(checkTable(valid,'d-bound'),valid);
  for (const [key,limit] of [['rowCount',1],['columnCount',1]]) { const t=blankTable('d-bound','Minimum');t.workbook.sheets['sheet-1'][key]=limit;assert.ok(checkTable(t,'d-bound')); }
  const arrays = [];Object.assign(arrays, blankTable('d-bound','Array'));assert.throws(()=>checkTable(arrays,'d-bound'),/format/);
});

test('worksheet counts and sparse cell budgets preserve exact supported boundaries', () => {
  const table=blankTable('d-size','Sizes'),sample=table.workbook.sheets['sheet-1'];
  for(let i=2;i<=20;i++){const id=`sheet-${i}`;table.workbook.sheetOrder.push(id);table.workbook.sheets[id]={...structuredClone(sample),id,name:`Sheet ${i}`};}
  assert.ok(checkTable(table,'d-size'));table.workbook.sheetOrder.push('sheet-21');table.workbook.sheets['sheet-21']={...structuredClone(sample),id:'sheet-21',name:'Sheet 21'};assert.throws(()=>checkTable(table,'d-size'),/worksheets/);
  const duplicate=blankTable('d-duplicate','Duplicate');duplicate.workbook.sheetOrder.push('other');duplicate.workbook.sheets.other={...structuredClone(sample),id:'other',name:'sHeEt 1'};assert.throws(()=>checkTable(duplicate,'d-duplicate'),/unique/);
  const cells=blankTable('d-cells','Cells'),s=cells.workbook.sheets['sheet-1'];s.rowCount=10000;s.columnCount=200;
  for(let r=0;r<500;r++)s.cellData[r]=Object.fromEntries(Array.from({length:200},(_,c)=>[c,{}]));
  assert.ok(checkTable(cells,'d-cells'));s.cellData[500]={0:{}};assert.throws(()=>checkTable(cells,'d-cells'),/100,000/);
  const bytes=blankTable('d-bytes','Bytes');bytes.extra='a'.repeat(1500000);assert.throws(()=>checkTable(bytes,'d-bytes'),/1.5 MB/);
});

test('CSV edge cases keep trailing cells, quoted whitespace, alternate delimiters and safe numeric typing', () => {
  assert.deepEqual(parseCSV('\uFEFFA\tB\rC\tD','\t'),[['A','B'],['C','D']]);
  assert.deepEqual(parseCSV('"a"  ,b,\n'),[['a','b','']]);assert.deepEqual(parseCSV(''),[['']]);assert.deepEqual(parseCSV('a\n\n'),[['a'],['']]);
  assert.throws(()=>parseCSV('"a"x,b'),/Unexpected/);assert.throws(()=>parseCSV('a|b','|'),/delimiter|comma/);
  assert.equal(parseCSV('a\n'.repeat(10000)).length,10000);assert.throws(()=>parseCSV('a\n'.repeat(10001)),/size/);
  assert.equal(parseCSV(Array(200).fill('a').join(','))[0].length,200);assert.throws(()=>parseCSV(Array(201).fill('a').join(',')),/size/);
  const table=tableFromRows([['0012','-2','.5','1e3','1e999','',true]],{id:'d-values',name:'Values'}),row=table.workbook.sheets['sheet-1'].cellData[0];
  assert.equal(row[0].v,'0012');assert.equal(row[1].v,-2);assert.equal(row[2].v,.5);assert.equal(row[3].v,1000);assert.equal(row[4].v,'1e999');assert.equal(row[5],undefined);
  assert.equal(tableCSV(table,'sheet-1'),'0012,-2,0.5,1000,1e999,,true');
  assert.throws(()=>tableCSV(table,'missing'),/not found/);
});

test('the serialized byte budget accepts its exact boundary and rejects one byte more', () => {
  const table=blankTable('d-byte-bound','Boundary');table.extra='';const overhead=new TextEncoder().encode(JSON.stringify(table)).length;table.extra='a'.repeat(1500000-overhead);assert.ok(checkTable(table,'d-byte-bound'));table.extra+='a';assert.throws(()=>checkTable(table,'d-byte-bound'),/1.5 MB/);
});

test('worksheet identifiers, imported dimensions and previews retain meaningful sparse extents', () => {
  const table=blankTable('d-misc','Misc'),s=table.workbook.sheets['sheet-1'];
  const bad=structuredClone(table);bad.workbook.sheetOrder=['bad/id'];bad.workbook.sheets={'bad/id':{...s,id:'bad/id'}};assert.throws(()=>checkTable(bad,'d-misc'),/names/);
  const rows=Array.from({length:1001},(_,r)=>Array.from({length:27},(_,c)=>r===1000&&c===26?'Last':''));
  const imported=tableFromRows(rows,{id:'d-import-large',name:'Large'});assert.equal(imported.workbook.sheets['sheet-1'].rowCount,1001);assert.equal(imported.workbook.sheets['sheet-1'].columnCount,27);assert.equal(imported.workbook.sheets['sheet-1'].cellData[1000][26].v,'Last');
  s.cellData={5:{5:{v:null,s:{bl:1}}},7:{8:{v:''}},10:{20:{}}};assert.equal(tableCSV(table,'sheet-1'),'');assert.match(tablePreview(table),/Empty worksheet/);
  s.cellData={0:{0:{f:'=B1*2',v:10}}};assert.equal(tableCSV(table,'sheet-1'),'10');assert.equal(tableCSV(table,'sheet-1',{formulas:true}),'=B1*2');
  const preview=(h,w)=>tablePreview(tableFromRows(Array.from({length:h},(_,r)=>Array.from({length:w},(_,c)=>`${r}:${c}`)),{id:'d-preview-limit',name:'Preview'}));
  assert.doesNotMatch(preview(10,8),/Preview: first/);assert.match(preview(11,8),/Preview: first/);assert.match(preview(10,9),/Preview: first/);
  assert.deepEqual(parseCSV('a,'),[['a','']]);assert.deepEqual(parseCSV('""'),[['']]);assert.deepEqual(parseCSV('a'),[['a']]);assert.deepEqual(parseCSV('a\n'),[['a']]);
});
