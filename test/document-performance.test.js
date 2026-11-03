import test from 'node:test';
import assert from 'node:assert/strict';
import { marked } from 'marked';
import { Marked } from 'marked';
import { richTableExtension } from '../public/document-table-format.js';
test('structural inline edits stabilize near their block instead of reparsing the complete document',()=>{
  const lengths=[],cache=documentBlockCache(source=>{lengths.push(source.length);return marked.lexer(source);}),source=Array.from({length:400},(_,i)=>`## Part ${i}\n\nParagraph **${i}** with words.\n\n`).join('');cache(source);
  const at=source.indexOf('Paragraph **200**')+2,next=source.slice(0,at)+'**'+source.slice(at);cache(next,[{fromA:at,toA:at,fromB:at,toB:at+2}]);
  assert.ok(Math.max(...lengths.slice(1))<source.length/10);
});
test('simultaneous edits can split a paragraph and trusted components can end at EOF',()=>{
  const source='Words in an ordinary paragraph with text.',cache=documentBlockCache(text=>marked.lexer(text));cache(source);
  const next=source.slice(0,3)+'new'+source.slice(3,20)+'\n\n# New heading\n\n'+source.slice(20),result=cache(next,[{fromA:3,toA:3,fromB:3,toB:6},{fromA:20,toA:20,fromB:23,toB:23+'\n\n# New heading\n\n'.length}]);
  assert.deepEqual(result.map(item=>[item.token.type,item.token.raw]),marked.lexer(next).map(item=>[item.type,item.raw]));
  for(const old of ['> Words','```js\nconst x = 1;\n```','| A | B |\n| --- | --- |\n| C | D |']){
    let calls=0;const cache=documentBlockCache(text=>{calls++;return marked.lexer(text);}),entry=cache(old)[0],at=old.indexOf(' ')+1,newText=old.slice(0,at)+'X'+old.slice(at);cache(newText,[{fromA:at,toA:at,fromB:at,toB:at+1}],{kind:entry.token.type,from:0,to:old.length});assert.equal(calls,1);
  }
});
test('turning a plain table into rich content updates its cached component kind',()=>{
  const parser=new Marked({extensions:[richTableExtension]}),cache=documentBlockCache(text=>parser.lexer(text)),old='| A | B |\n| --- | --- |\n| C | D |';cache(old);
  const next='<table data-pencils-table="1"><tr><th>A</th><th>B</th></tr><tr><td><blockquote>C</blockquote></td><td>D</td></tr></table>';
  assert.equal(cache(next,[{fromA:0,toA:old.length,fromB:0,toB:next.length}],{kind:'table',from:0,to:old.length})[0].token.type,'documentRichTable');
});
import { DOCUMENT_CHARACTERS, INLINE_TABLE_CELLS, documentRangeIndex, documentBlockCache, documentEditAllowed, documentCounts, documentStatsCache, documentTextChange, documentCodeFence } from '../public/document-performance.js';

test('documents grow to one million characters and external oversized files can always be reduced', () => {
  assert.equal(DOCUMENT_CHARACTERS, 1000000); assert.equal(INLINE_TABLE_CELLS, 100000);
  assert.equal(documentEditAllowed(200000, 200001), true);
  assert.equal(documentEditAllowed(0,1000000),true);
  assert.equal(documentEditAllowed(1000000, 1000001), false);
  assert.equal(documentEditAllowed(1000010, 1000009), true);
  assert.equal(documentEditAllowed(1000010, 1000010), true);
  assert.equal(documentEditAllowed(1000010, 1000011), false);
});
test('large code with many backticks chooses a safe fence without spreading into the call stack',()=>{
  assert.equal(documentCodeFence('` '.repeat(150000)),'```');assert.equal(documentCodeFence('const value = ```;'),'````');
});
test('component history records only the changed text, without splitting Unicode pairs',()=>{
  for(const [before,after] of [['abc','abc'],['abc','abZc'],['👩code😀end','👩code😃end'],['prefix'+'x'.repeat(500000)+'suffix','prefix'+'x'.repeat(500000)+'suffiZ']]){
    const change=documentTextChange(before,after);if(before===after){assert.equal(change,null);continue;}
    assert.equal(before.slice(0,change.from)+change.insert+before.slice(change.to),after);
    assert.ok(change.to-change.from<=2);assert.ok(change.insert.length<=2);
    if(before.startsWith('👩'))assert.deepEqual(change,{from:6,to:8,insert:'😃'});
  }
});
test('indexed blocked ranges handle nested, adjacent, boundary and distant spans', () => {
  const index = documentRangeIndex([[30,40],[0,20],[3,8],[20,25]]);
  assert.equal(index.overlaps(25,30), false); assert.equal(index.overlaps(19,21), true);
  assert.equal(index.encloses(5,19), true); assert.equal(index.encloses(10,31), false);
  assert.equal(index.encloses(30,40), true); assert.equal(index.overlaps(40,42), false);
});
test('incremental statistics preserve Unicode characters and word boundaries while counting only edited text',()=>{
  const counted=[],stats=documentStatsCache(value=>{counted.push(value.length);return documentCounts(value);});
  let source='Alpha 😀 words.\n\n'.repeat(10000);assert.deepEqual(stats(source),{words:30000,characters:160000});
  const edits=[[4,0,' '],[7,2,'🦊'],[0,6,''],[source.length-20,2,'hello world']];
  for(const [at,remove,insert] of edits){const before=source;source=source.slice(0,at)+insert+source.slice(at+remove);assert.deepEqual(stats(source,[{fromA:at,toA:at+remove,fromB:at,toB:at+insert.length}]),documentCounts(source));assert.ok(counted.at(-1)<100);assert.notEqual(before,source);}
  assert.deepEqual(documentCounts('  café\u00a0naïve\t😀  '),{words:3,characters:16});
});
test('unchanged source reuses block parsing and a local edit reparses only its neighbourhood', () => {
  const calls = [], cache = documentBlockCache(source => { calls.push(source.length); return marked.lexer(source); });
  const source = Array.from({length:400},(_,i)=>`## Part ${i}\n\nParagraph **${i}** with words.\n\n`).join('');
  const original = cache(source); assert.equal(cache(source), original); assert.equal(calls.length,1);
  const at = source.indexOf('Paragraph **200**'), next = source.slice(0,at)+'New '+source.slice(at);
  const result = cache(next,[{fromA:at,toA:at,fromB:at,toB:at+4}]);
  assert.ok(calls.at(-1)<source.length/10, 'a paragraph edit must not lex the whole document');
  assert.deepEqual(result.map(x=>[x.token.type,x.token.raw]),marked.lexer(next).map(x=>[x.type,x.raw]));
  assert.equal(result.map(x=>x.token.raw).join(''),next);
});
test('typing in a heading does not parse an unchanged large table beside it',()=>{
  const calls=[],cache=documentBlockCache(source=>{calls.push(source.length);return marked.lexer(source);});
  const source='# Heading\n\n| A | B |\n| --- | --- |\n'+'| one | two |\n'.repeat(4000);cache(source);
  cache(source.slice(0,3)+'new '+source.slice(3),[{fromA:3,toA:3,fromB:3,toB:7}]);
  assert.ok(calls.slice(1).every(size=>size<100));
});
test('an editor-owned component transaction updates its block without lexing its cells again',()=>{
  const calls=[],cache=documentBlockCache(source=>{calls.push(source.length);return marked.lexer(source);});
  const source='| A | B |\n| --- | --- |\n'+'| one | two |\n'.repeat(4000),old=cache(source),next=source.replace('one','changed');
  const result=cache(next,[{fromA:0,toA:source.length-1,fromB:0,toB:next.length-1}],{from:0,to:source.length-1,kind:'table'});
  assert.equal(calls.length,1);assert.equal(result[0].token.raw,next);assert.notEqual(result,old);
});
test('editing a word in a dense paragraph and toggling a checkbox reuse block boundaries',()=>{
  for(const [source,from,to,insert] of [
    ['[BENCH](https://example.com) '.repeat(5000),3,3,'new'],
    ['- [ ] Item\n'.repeat(10000),2,5,'[x]'],
  ]){
    let calls=0;const cache=documentBlockCache(text=>{calls++;return marked.lexer(text);});cache(source);
    const next=source.slice(0,from)+insert+source.slice(to),result=cache(next,[{fromA:from,toA:to,fromB:from,toB:from+insert.length}]);
    assert.equal(calls,1);assert.deepEqual(result.map(x=>[x.token.type,x.token.raw]),marked.lexer(next).map(x=>[x.type,x.raw]));
  }
});
for(const [title,old,at,remove,insert] of [
  ['opening fence','# Start\n\nAlpha\n\nBeta\n\nGamma\n',9,0,'```js\n'],
  ['closing fence','```js\nconst x = 1;\n\nTail\n\nMore\n',18,0,'```\n'],
  ['joined paragraph','First paragraph\n\nSecond paragraph\n\nEnd\n',15,2,' '],
  ['table','Intro\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\nTail\n',35,1,'changed'],
  ['escaped pipe','Intro\n\n| A | B |\n| --- | --- |\n| a\\|b | c |\n\nTail\n',34,0,'\\'],
  ['list','Intro\n\n- one\n- two\n\nTail\n',14,0,'  - nested\n'],
]) test(`incremental blocks match a full parser after ${title}`,()=>{
  const cache=documentBlockCache(source=>marked.lexer(source));cache(old);
  const next=old.slice(0,at)+insert+old.slice(at+remove), result=cache(next,[{fromA:at,toA:at+remove,fromB:at,toB:at+insert.length}]);
  assert.deepEqual(result.map(x=>[x.token.type,x.token.raw]),marked.lexer(next).map(x=>[x.type,x.raw]));
});
