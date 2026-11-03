import test from 'node:test';
import assert from 'node:assert/strict';
import { embedReference, tableEmbedSpec } from '../public/document-embed-model.js';
import { blankTable } from '../public/document-sheet-model.js';
import { documentSection } from '../public/document-model.js';

test('embeds keep stable vault paths and encode fragment characters without changing the reference', () => {
  const record = { id: 'd-1', file: 'Projects/p/documents/d-1.md' };
  assert.equal(embedReference(record), '![[Projects/p/documents/d-1]]');
  assert.equal(embedReference(record, ['Heading', 'A # B']), '![[Projects/p/documents/d-1#Heading#A%20%23%20B]]');
  assert.equal(embedReference(record, 'Rates & fees!B2:D12'), '![[Projects/p/documents/d-1#Rates%20%26%20fees!B2:D12]]');
});
function table() {
  const value = blankTable('d-1');
  const sheet = value.workbook.sheets['sheet-1']; sheet.name = 'Rates & fees';
  sheet.cellData = { 0: { 0: { v: 'Name' } }, 12: { 4: { v: 50 } } };
  value.workbook.sheetOrder.push('sheet-2');
  value.workbook.sheets['sheet-2'] = { ...structuredClone(sheet), id: 'sheet-2', name: 'Other' };
  return value;
}
test('table embeds resolve worksheets, used data and bounded A1 ranges', () => {
  const value = table();
  assert.deepEqual(tableEmbedSpec(value, '').sheets, ['sheet-1', 'sheet-2']);
  assert.deepEqual(tableEmbedSpec(value, '#Rates%20%26%20fees!B2:D12'), { sheets: ['sheet-1'], range: { r: 1, c: 1, rows: 11, columns: 3 } });
  assert.deepEqual(tableEmbedSpec(value, '#Other').sheets, ['sheet-2']);
  assert.deepEqual(tableEmbedSpec(value, '#A1:C4').range, { r: 0, c: 0, rows: 4, columns: 3 });
  assert.deepEqual(tableEmbedSpec(value, '#Other!D8').range, { r: 7, c: 3, rows: 1, columns: 1 });
  for (const bad of ['#Missing', '#Other!A0:B3', '#Other!D3:A1', '#Other!A1:XFD999999', '#Other!javascript:alert(1)']) assert.throws(() => tableEmbedSpec(value, bad));
  assert.throws(() => tableEmbedSpec(value, '#%xx'), /Invalid worksheet reference/);
  assert.throws(() => tableEmbedSpec(value, '#Missing!A1'), /Worksheet not found/);
  assert.throws(() => tableEmbedSpec(value, '#!A1'), /Worksheet not found/);
  assert.throws(() => tableEmbedSpec(value, '#Other!Not a range'), /Choose a worksheet/);
  for (const bad of ['#Other!A3:A1', '#Other!D1:A1', '#Other!A101', '#Other!AA1']) assert.throws(() => tableEmbedSpec(value, bad), /Choose a range within/);
  assert.equal(tableEmbedSpec(value, '#other').sheets[0], 'sheet-2');
  assert.equal(tableEmbedSpec(value, '#sheet-2').sheets[0], 'sheet-2');
});
test('nested section paths resolve duplicate headings and section fragments are decoded', () => {
  const source = '# First\n## Details\nFirst detail\n# Second\n## Details\nSecond detail\n## A # B\nSpecial\n';
  assert.equal(documentSection(source, '#Second#Details'), '## Details\nSecond detail\n');
  assert.equal(documentSection(source, '#Second#A%20%23%20B'), '## A # B\nSpecial\n');
});
test('block embeds include only the identified paragraph or list, omitting its block ID', () => {
  const source = '# Notes\n\nEarlier paragraph.\n\nThe block\ncontinues here. ^summary\n\n- One\n- Two\n^list\n\nLater';
  assert.equal(documentSection(source, '#^summary'), 'The block\ncontinues here.');
  assert.equal(documentSection(source, '#%5Esummary'), 'The block\ncontinues here.');
  assert.equal(documentSection(source, '#^list'), '- One\n- Two');
  assert.equal(documentSection('Before\n\n> A quote\n> Continued\n\n^quote\n\nAfter', '#^quote'), '> A quote\n> Continued');
  assert.equal(documentSection('```\nnot a block ^fake\n```', '#^fake'), '');
  assert.equal(documentSection('First ^first', '#^first'), 'First');
  assert.equal(documentSection('^empty', '#^empty'), '');
  assert.equal(documentSection('First paragraph\n^first', '#^first'), 'First paragraph');
  const fenced = '````\n```\nnot a block ^fake\n~~~~\n````\n\nValid ^real';
  assert.equal(documentSection(fenced, '#^fake'), ''); assert.equal(documentSection(fenced, '#^real'), 'Valid');
});
