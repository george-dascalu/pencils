import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDocumentTable, tableRectangle, tableCells, insertTableAxis, deleteTableAxis, moveTableAxis, mergeTableCells, unmergeTableCells, tableTemplateLayout } from '../public/document-table-model.js';
const base = () => makeDocumentTable([['A','B','C'],['one','two','three'],['four','five','six']], ['left',null,'right']);
const values = model => Array.from({length:model.rows},(_,r)=>Array.from({length:model.columns},(_,c)=>tableCells(model,{r,c,rows:1,columns:1})[0]?.value));
test('row and column selections contain every cell and expand to include complete merged cells', () => {
  const table = mergeTableCells(base(), {r:1,c:1,rows:2,columns:2});
  assert.deepEqual(tableRectangle(table,{r:1,c:0,rows:1,columns:3}),{r:1,c:0,rows:2,columns:3});
  assert.equal(tableCells(base(),{r:1,c:0,rows:1,columns:3}).length,3);
  assert.equal(tableCells(table,{r:2,c:2,rows:1,columns:1})[0].value,'two\n\nthree\n\nfive\n\nsix');
});
test('inserting, moving and deleting axes preserves values, alignment and rectangular merged cells', () => {
  const original=base(), inserted=insertTableAxis(original,'column',1);
  assert.deepEqual(values(inserted)[0],['A','','B','C']); assert.deepEqual(inserted.aligns,['left',null,null,'right']);
  assert.deepEqual(values(moveTableAxis(original,'row',2,1,1)),[['A','B','C'],['four','five','six'],['one','two','three']]);
  assert.deepEqual(values(moveTableAxis(original,'column',0,1,3))[1],['two','three','one']);
  assert.deepEqual(values(deleteTableAxis(original,'row',0,1)),[['one','two','three'],['four','five','six']]);
  const merged=mergeTableCells(original,{r:1,c:0,rows:2,columns:1});
  assert.equal(insertTableAxis(merged,'row',2).cells.find(c=>c.row===1&&c.column===0).rows,3);
  assert.equal(deleteTableAxis(merged,'row',1,1).cells.find(c=>c.row===1&&c.column===0).value,'one\n\nfour');
  assert.throws(()=>moveTableAxis(merged,'row',1,1,0),/merged/i);
  assert.throws(()=>deleteTableAxis(original,'column',0,3),/at least one/i);
  assert.deepEqual(values(original),[['A','B','C'],['one','two','three'],['four','five','six']]);
});
test('merge and unmerge retain all rich Markdown content and templates can keep headers without body values', () => {
  const table=makeDocumentTable([['Heading','Other'],['- [ ] Task','> Quote\n\n```js\nlet x=1;\n```']]);
  const merged=mergeTableCells(table,{r:1,c:0,rows:1,columns:2});
  assert.equal(merged.cells.find(c=>c.row===1).columns,2);
  const unmerged=unmergeTableCells(merged,{r:1,c:0,rows:1,columns:2});
  assert.equal(unmerged.cells.find(c=>c.row===1&&c.column===0).value,'- [ ] Task\n\n> Quote\n\n```js\nlet x=1;\n```');
  assert.equal(unmerged.cells.find(c=>c.row===1&&c.column===1).value,'');
  const layout=tableTemplateLayout(merged,false); assert.equal(layout.cells.find(c=>c.row===0).value,'Heading');
  assert.equal(layout.cells.find(c=>c.row===1).value,''); assert.equal(layout.cells.find(c=>c.row===1).columns,2);
  assert.equal(tableTemplateLayout(merged,true).cells.find(c=>c.row===1).value,merged.cells.find(c=>c.row===1).value);
});
test('invalid dimensions, coordinates, axes and overlapping cells are rejected',()=>{
  for(const rows of [[],[['a'],...Array.from({length:20000},()=>[''])]])assert.throws(()=>makeDocumentTable(rows));
  assert.equal(makeDocumentTable([['']]).cells.length,1);
  assert.equal(makeDocumentTable([Array(20000).fill('')]).cells.length,20000);
  for(const patch of [{row:-1},{column:-1},{rows:0},{columns:0},{rows:2},{columns:2},{row:0.5},{value:1}])assert.throws(()=>makeDocumentTable([['']],[],[{id:'a',row:0,column:0,rows:1,columns:1,value:'',...patch}]));
  assert.throws(()=>makeDocumentTable([['']],[],['a','b'].map(id=>({id,row:0,column:0,rows:1,columns:1,value:''}))),/overlap/);
  for(const patch of [{r:-1},{c:-1},{rows:0},{columns:0},{rows:4},{columns:4},{r:0.5}])assert.throws(()=>tableCells(base(),{r:0,c:0,rows:1,columns:1,...patch}));
  for(const axis of ['row','column']){
    for(const [from,count] of [[-1,1],[0,0],[0,4],[0.5,1],[0,1.5]])assert.throws(()=>deleteTableAxis(base(),axis,from,count));
    for(const before of [-1,4,0.5])assert.throws(()=>moveTableAxis(base(),axis,0,1,before));
    assert.equal(deleteTableAxis(base(),axis,0,2)[axis==='row'?'rows':'columns'],1);
    assert.deepEqual(moveTableAxis(base(),axis,1,1,1),base());assert.deepEqual(moveTableAxis(base(),axis,1,1,2),base());
  }
  assert.throws(()=>insertTableAxis(base(),'other',0));assert.throws(()=>insertTableAxis(base(),'row',0,20000));
  assert.throws(()=>mergeTableCells(base(),{r:0,c:0,rows:1,columns:1}),/at least two/);
});
test('axis deletion and moves retain alignment, merge anchors, order, and the final remaining cell',()=>{
  assert.deepEqual(deleteTableAxis(base(),'column',0).aligns,[null,'right']);
  assert.deepEqual(moveTableAxis(base(),'column',0,1,3).aligns,[null,'right','left']);
  assert.deepEqual(values(deleteTableAxis(base(),'column',1))[1],['one','three']);
  assert.equal(deleteTableAxis(base(),'column',1,2).cells.at(-1).value,'four');
  assert.deepEqual(values(moveTableAxis(base(),'column',2,1,0))[1],['three','one','two']);
  const merged=mergeTableCells(base(),{r:0,c:0,rows:2,columns:2});
  const moved=moveTableAxis(merged,'row',0,2,3);assert.equal(moved.cells.find(c=>c.columns===2).row,1);
  assert.throws(()=>moveTableAxis(merged,'column',1,1,3),/merged/);
  const layout=tableTemplateLayout(base());assert.equal(layout.cells.find(c=>c.row===1).value,'');
  const unsorted=makeDocumentTable([['','']],[],[{id:'b',row:0,column:1,rows:1,columns:1,value:'B'},{id:'a',row:0,column:0,rows:1,columns:1,value:'A'}]);assert.deepEqual(unsorted.cells.map(c=>c.value),['A','B']);
});
test('selection expansion repeats until every overlapping merge is included',()=>{
  let table=makeDocumentTable(Array.from({length:5},()=>Array(4).fill('')));
  table=mergeTableCells(table,{r:0,c:2,rows:4,columns:1});
  table=mergeTableCells(table,{r:1,c:0,rows:1,columns:2});
  table=mergeTableCells(table,{r:3,c:0,rows:2,columns:2});
  assert.deepEqual(tableRectangle(table,{r:0,c:0,rows:2,columns:3}),{r:0,c:0,rows:5,columns:3});
  assert.throws(()=>insertTableAxis(base(),'row',4));assert.throws(()=>insertTableAxis(base(),'row',0,0));
  let chained=makeDocumentTable(Array.from({length:3},()=>Array(4).fill('')));
  chained=mergeTableCells(chained,{r:0,c:2,rows:2,columns:2});
  chained=mergeTableCells(chained,{r:1,c:0,rows:2,columns:2});
  assert.deepEqual(tableRectangle(chained,{r:2,c:1,rows:1,columns:2}),{r:0,c:0,rows:3,columns:4});
  const top=mergeTableCells(base(),{r:0,c:0,rows:2,columns:2});
  assert.deepEqual(tableRectangle(top,{r:1,c:0,rows:1,columns:2}),{r:0,c:0,rows:2,columns:2});
  for(const axis of ['row','column']){
    for(const [from,count] of [[2,2],[0.5,1],[-1,1],[0,1.5]])assert.throws(()=>moveTableAxis(base(),axis,from,count,0));
    assert.throws(()=>insertTableAxis(base(),axis,-1));
    const appended=insertTableAxis(base(),axis,3);assert.equal(appended[axis==='row'?'rows':'columns'],4);
  }
});
