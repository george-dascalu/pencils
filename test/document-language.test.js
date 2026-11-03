import test from 'node:test';
import assert from 'node:assert/strict';
import { parser, GFM } from '@lezer/markdown';
import { incrementalDocumentParagraphs } from '../public/document-language.js';

const shape=tree=>{const out=[];tree.iterate({enter:n=>out.push([n.name,n.from,n.to])});return out;};
test('long paragraphs reparse the changed inline span and keep the complete syntax tree',()=>{
  const parsed=[],extension=incrementalDocumentParagraphs(size=>parsed.push(size)),fast=parser.configure([GFM,extension]),full=parser.configure(GFM);
  let source='[BENCH](https://example.com) with **bold** and *italic* text. '.repeat(4000);
  assert.deepEqual(shape(fast.parse(source)),shape(full.parse(source)));
  assert.deepEqual(shape(fast.parse(source)),shape(full.parse(source)));
  for(const [needle,insert] of [['BENCH','new'],['bold','er'],['italic','ly'],['text','long']]){
    const at=source.indexOf(needle)+2;source=source.slice(0,at)+insert+source.slice(at);
    assert.deepEqual(shape(fast.parse(source)),shape(full.parse(source)));
    assert.ok(parsed.at(-1)<200,`only a complete nearby span is reparsed: ${parsed.at(-1)}`);
  }
  const at=source.indexOf('bold');source=source.slice(0,at)+'*'+source.slice(at);
  assert.deepEqual(shape(fast.parse(source)),shape(full.parse(source)));
  assert.equal(parsed.at(-1),source.length,'delimiter changes always use the full parser');
});
test('cached paragraphs preserve escapes, nested formatting, autolinks and composite marks',()=>{
  const extension=incrementalDocumentParagraphs(),fast=parser.configure([GFM,extension]),full=parser.configure(GFM);
  let source='> '+('A [**linked** *label*](https://example.com) and `code` \\*escaped text &amp; www.example.com. '.repeat(130))+'\n';
  assert.deepEqual(shape(fast.parse(source)),shape(full.parse(source)));
  for(const word of ['linked','label','code','escaped','example']){const at=source.indexOf(word)+2;source=source.slice(0,at)+'Ab'+source.slice(at);assert.deepEqual(shape(fast.parse(source)),shape(full.parse(source)));}
  source='## Heading\n\n'+source;assert.deepEqual(shape(fast.parse(source)),shape(full.parse(source)));
});
