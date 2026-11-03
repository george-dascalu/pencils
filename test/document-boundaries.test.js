import test from 'node:test';
import assert from 'node:assert/strict';
import { marked } from 'marked';
import { title,body,documentBody,tags } from '../server/values.js';
import { documentTextChange,documentCounts,documentStatsCache,documentRangeIndex,documentBlockCache } from '../public/document-performance.js';

test('inclusive content boundaries and invalid tags are validated independently',()=>{
  for(const [validate,size] of [[title,300],[body,200000],[documentBody,1000000]]){assert.equal(validate('a'.repeat(size)).length,size);assert.throws(()=>validate('a'.repeat(size+1)),error=>error.status===400);}
  assert.equal(tags(Array.from({length:30},(_,i)=>String(i))).length,30);assert.equal(tags(['a'.repeat(80)])[0].length,80);
  for(const invalid of [Array.from({length:31},(_,i)=>String(i)),['a'.repeat(81)],['ok',12],{},null,'a'])assert.throws(()=>tags(invalid),error=>error.status===400);
});
test('minimal replacements retain both Unicode boundaries, including surrogate-range endpoints',()=>{
  for(const high of [0xd800,0xdbff])for(const low of [0xdc00,0xdfff]){
    const pair=String.fromCharCode(high,low),other=String.fromCharCode(high===0xd800?0xdbff:0xd800,low===0xdc00?0xdfff:0xdc00);
    for(const [before,after] of [[pair,other],[pair,String.fromCharCode(high,low===0xdc00?0xdfff:0xdc00)],[pair,String.fromCharCode(high===0xd800?0xdbff:0xd800,low)],[pair,'a'],['a',pair],['x'+pair+'y','x'+other+'y'],['a'.repeat(1024)+'x'+'b'.repeat(2048),'a'.repeat(1024)+'new'+'b'.repeat(2048)],['ab'+'x'.repeat(2200)+'c','aB'+'y'.repeat(2200)+'C']]){
      const change=documentTextChange(before,after);assert.equal(before.slice(0,change.from)+change.insert+before.slice(change.to),after);
      const split=(text,at)=>at>0&&at<text.length&&/[\uD800-\uDBFF]/.test(text[at-1])&&/[\uDC00-\uDFFF]/.test(text[at]);
      assert.equal(split(before,change.from)||split(before,change.to)||split(after,change.from)||split(after,change.from+change.insert.length),false);
    }
  }
  assert.deepEqual(documentTextChange('abc','abcd'),{from:3,to:3,insert:'d'});assert.deepEqual(documentTextChange('abcd','abc'),{from:3,to:4,insert:''});
});
test('merged range indexes match interval unions at every boundary',()=>{
  const input=[[1,8],[5,12],[12,16],[22,25]],index=documentRangeIndex(input);
  for(let from=0;from<27;from++)for(let to=from+1;to<29;to++){
    assert.equal(index.overlaps(from,to),input.some(([a,b])=>a<to&&b>from));
    assert.equal(index.encloses(from,to),[[1,12],[12,16],[22,25]].some(([a,b])=>a<=from&&b>=to));
  }
});
test('multiple simultaneous edits keep word and Unicode counts correct',()=>{
  const before='one two three four five six 😀 end',stats=documentStatsCache();stats(before);
  assert.deepEqual(stats('two new words'),documentCounts('two new words'));
  for(const edits of [[[0,1,'Long'],[2,3,'er']],[[4,7,''],[8,13,'new words']],[[0,0,'😀 '],[before.length,before.length,' finish']]]){
    let delta=0,next='',at=0;const changes=[];for(const [from,to,insert] of edits){next+=before.slice(at,from)+insert;changes.push({fromA:from,toA:to,fromB:from+delta,toB:from+delta+insert.length});delta+=insert.length-(to-from);at=to;}next+=before.slice(at);
    const count=documentStatsCache();count(before);assert.deepEqual(count(next,changes),documentCounts(next));
  }
});
test('incremental block boundaries agree with a complete parser across structural edit sequences',()=>{
  let source='# Header\n\nA paragraph.\n\n- [ ] Word\n- Second\n\n| A | B |\n| --- | --- |\n| C | D |\n\nTail\n\nLast\n',seed=7;
  const cache=documentBlockCache(text=>marked.lexer(text));cache(source);
  const inserts=['a','\n','\n\n','```\n','|','- ','# ','','[x]'];
  const original=source+'\n'+Array.from({length:80},(_,i)=>`## Part ${i}\n\nParagraph **bold** with words.\n\n`).join('');
  for(let i=0;i<400;i++){
    if(i%10===0){source=original;cache(source);}
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;const at=seed%(source.length+1),remove=Math.min(i%3,source.length-at),insert=inserts[i%inserts.length];
    const next=source.slice(0,at)+insert+source.slice(at+remove),actual=cache(next,[{fromA:at,toA:at+remove,fromB:at,toB:at+insert.length}]);
    assert.deepEqual(actual.map(x=>[x.token.type,x.token.raw]),marked.lexer(next).map(x=>[x.type,x.raw]));source=next;
  }
});
