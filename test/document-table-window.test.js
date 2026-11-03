import test from 'node:test';
import assert from 'node:assert/strict';
import { documentTableWindow, windowedTableRows, documentTableSourceCell } from '../public/document-table-window.js';
test('Find maps Markdown source to table cells without treating escaped pipes as columns',()=>{
  for(const prefix of ['', '<!-- table: scroll -->\n'])for(const row of ['| a\\|b | target |','a\\|b | target','| a\\\\| target |']){
    const source=prefix+'| A | B |\n| --- | --- |\n'+row+'\n';
    assert.deepEqual(documentTableSourceCell(source,source.indexOf('target')),{row:1,column:1});
  }
  const source='<table data-pencils-table="1">\n<tbody><tr><th>A</th><th>B</th></tr><tr><td>X</td><td>target</td></tr></tbody></table>';
  assert.deepEqual(documentTableSourceCell(source,source.indexOf('target')),{row:1,column:1});
});
test('small tables stay complete; large and wide tables render a bounded page with their header',()=>{
  assert.deepEqual(documentTableWindow(4,3).rows,[0,1,2,3]);
  const large=documentTableWindow(11001,2,110);assert.equal(large.rowPages,110);assert.equal(large.rows[1],10901);assert.equal(large.rows.at(-1),11000);assert.equal(large.rows[0],0);
  const wide=documentTableWindow(2,100000,1,5000);assert.equal(wide.columnFrom,99980);assert.equal(wide.columnTo,100000);
  assert.ok(large.rows.length*(large.columnTo-large.columnFrom)<=820);
});
test('page bounds clamp after removing rows or columns',()=>{
  const window=documentTableWindow(2200,6,999,999);assert.equal(window.rowPage,window.rowPages);assert.equal(window.columnPage,window.columnPages);
  assert.equal(documentTableWindow(2200,6,0).rowPage,1);
});
test('paging has an inclusive 2,000-cell threshold and excludes cells touching only a page edge',()=>{
  assert.equal(documentTableWindow(1000,2).paged,false);assert.equal(documentTableWindow(1001,2).paged,true);
  const window=documentTableWindow(300,20,2,1),edge={id:'edge',row:window.rowFrom-1,column:0,rows:1,columns:1,value:''};
  assert.equal([...windowedTableRows({cells:[edge]},window).values()].flat().length,0);
  assert.equal([...windowedTableRows({cells:[{...edge,row:window.rowFrom,column:window.columnTo}]},window).values()].flat().length,0);
});
test('merged cells crossing a page are represented once with clipped spans and original identity',()=>{
  const model={rows:11001,columns:2,cells:[{id:'head',row:0,column:0,rows:1,columns:2,value:'Title'},{id:'merged',row:95,column:0,rows:20,columns:2,value:'Merged'}]};
  const rows=windowedTableRows(model,documentTableWindow(model.rows,model.columns,2));
  assert.equal(rows.get(0)[0].cell.id,'head');assert.equal(rows.get(101)[0].cell.id,'merged');assert.equal(rows.get(101)[0].rows,14);assert.equal(rows.get(101)[0].columns,2);
  assert.equal([...rows.values()].flat().filter(entry=>entry.cell.id==='merged').length,1);
});
