import test from 'node:test';
import assert from 'node:assert/strict';
import { Marked } from 'marked';
import { richTableExtension, serializeDocumentTable, TABLE_TEMPLATE_MARKER, tableLayoutTemplates } from '../public/document-table-format.js';
import { makeDocumentTable, mergeTableCells } from '../public/document-table-model.js';
test('plain table serialization preserves escaped pipes and column alignment', () => {
  const table=makeDocumentTable([['Header','Link'],['a \\| b','[[File\\|label]]']],['left','right']);
  assert.equal(serializeDocumentTable(table), '| Header | Link |\n| :--- | ---: |\n| a \\| b | [[File\\|label]] |');
});
test('rich tables retain real row/column spans and parse as one editable block in either layout', () => {
  const table=mergeTableCells(makeDocumentTable([['A','B'],['one','two']]),{r:1,c:0,rows:1,columns:2});
  table.layout='scroll';const html=serializeDocumentTable(table,text=>`<p>${text}</p>`);
  assert.match(html,/^<!-- table: scroll -->/);assert.match(html,/<td colspan="2">/);
  const parser=new Marked({extensions:[richTableExtension]}),tokens=parser.lexer(html+'\n\nAfter.');
  assert.equal(tokens[0].type,'documentRichTable');assert.equal(tokens[0].layout,'scroll');
  assert.match(parser.parse(html),/class="document-table-scroll"/);assert.equal(tokens.at(-1).text,'After.');
  assert.equal(parser.lexer('<table><tr><td>Foreign HTML</td></tr></table>')[0].type,'html');
});
test('table templates are ordinary documents in the Templates folder with an explicit layout marker', () => {
  const docs=[{id:'layout',folder:'templates',body:TABLE_TEMPLATE_MARKER+'\n| A |\n| --- |'}, {id:'daily',folder:'templates',body:'# Daily'}, {id:'outside',body:TABLE_TEMPLATE_MARKER}];
  assert.deepEqual(tableLayoutTemplates(docs,[{id:'templates',title:'Templates'}]).map(d=>d.id),['layout']);
});
test('rich table token boundaries preserve following content and single-cell spans',()=>{
  const model=makeDocumentTable([['A'],['B']]);model.rich=true;
  assert.throws(()=>serializeDocumentTable(model),/renderer/);
  const html=serializeDocumentTable(model,value=>value);assert.doesNotMatch(html,/span=/);
  const parser=new Marked({extensions:[richTableExtension]});
  const nested=html.replace('>A</th>','><table><tr><td>Nested</td></tr></table></th>');
  assert.equal(parser.lexer(nested+'\n\nAfter')[0].raw.trim(),nested);
  const tokens=parser.lexer(html+'After');assert.equal(tokens[0].raw,html);assert.equal(tokens[1].text,'After');
  assert.equal(parser.lexer(html)[0].layout,'fit');
});
