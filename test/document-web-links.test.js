import test from 'node:test';
import assert from 'node:assert/strict';
import { webURL, webURLAt } from '../public/document-web-links.js';
test('web URL opening accepts only complete HTTP(S) addresses',()=>{
  assert.equal(webURL('https://example.test/a?q=1#two'),'https://example.test/a?q=1#two');
  assert.equal(webURL('www.example.test/a'),'https://www.example.test/a');
  for(const value of ['javascript:alert(1)','data:text/html,test','file:///tmp/test','/relative','https:example.test','',null])assert.equal(webURL(value),null);
});
test('a clicked URL excludes prose punctuation and Markdown delimiters, preserving balanced URL punctuation',()=>{
  for(const [text,expected] of [
    ['Visit https://example.test/a?q=1#two, please.','https://example.test/a?q=1#two'],
    ['[Page](https://example.test/a_(b))','https://example.test/a_(b)'],
    ['<https://example.test/a>','https://example.test/a'],
    ['See (https://example.test/a).','https://example.test/a'],
    ['www.example.test/a','https://www.example.test/a'],
    ['`https://example.test/code`','https://example.test/code'],
  ]) {const start=text.indexOf(expected.startsWith('https://www.')?'www.':'https:');assert.equal(webURLAt(text,start+5),expected);assert.equal(webURLAt(text,text.length+1),null);}
  assert.equal(webURLAt('Before https://example.test after',2),null);
  assert.equal(webURLAt('https://one.test and https://two.test',27),'https://two.test/');
});
