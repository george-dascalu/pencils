import test from 'node:test';
import assert from 'node:assert/strict';
import { documentPaneChoices } from '../public/document-pane-picker.js';
test('pane choices include both document types, paths and tags, and exclude the other pane',()=>{
  const rows=documentPaneChoices({documents:[{id:'a',title:'Notes',folder:'child',tags:['planning']},{id:'b',title:'Budget',document_type:'table'},{id:'c',title:'Other'}],folders:[{id:'root',title:'Work'},{id:'child',title:'Plans',parent:'root'}],current:'a',exclude:'c',opened:['a'],bookmarked:['b']});
  assert.deepEqual(rows.map(row=>row.id),['a','b']);
  assert.equal(rows[0].path,'Work / Plans');assert.match(rows[0].keywords,/#planning/);assert.deepEqual(rows[0].categories,['markdown','open']);assert.equal(rows[1].icon,'table');assert.deepEqual(rows[1].categories,['table','bookmarked']);
});
test('the current file sorts first, followed by open files, bookmarks and remaining files; bad folders cannot loop',()=>{
  const rows=documentPaneChoices({documents:[{id:'a',title:'A'},{id:'b',title:'B'},{id:'c',title:'C'},{id:'d',title:'D',folder:'cycle'}],folders:[{id:'cycle',title:'Loop',parent:'cycle'}],current:'d',opened:['c'],bookmarked:['b']});
  assert.deepEqual(rows.map(row=>row.id),['d','c','b','a']);assert.equal(rows[0].path,'Loop');
});
test('search keywords include tags in the text as well as frontmatter tags',()=>{
  const [row]=documentPaneChoices({documents:[{id:'a',title:'Plans',tags:['roadmap'],body:'Read the #planning guide.'}]});
  assert.match(row.keywords,/#roadmap/);assert.match(row.keywords,/#planning/);
});
