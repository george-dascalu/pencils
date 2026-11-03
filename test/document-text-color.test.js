import test from 'node:test';
import assert from 'node:assert/strict';
import { marked, Marked } from 'marked';
import { textColor, textColorSpans, colorSelection, textColorExtension, inlineWrapChange, installTextColorRule } from '../public/document-text-color.js';

const apply = (source, edit) => source.slice(0, edit.from) + edit.insert + source.slice(edit.to);
test('text colours normalise hex and browser RGB, rejecting arbitrary CSS', () => {
  assert.equal(textColor('#ABC'), '#aabbcc');
  assert.equal(textColor('rgb(24, 70, 255)'), '#1846ff');
  for (const bad of ['red', 'url(https://example.com)', '#112233; position:fixed', 'var(--x)', 'rgb(256,0,0)']) assert.equal(textColor(bad), null);
});
test('colour selection preserves the selected letters and repeated colour changes update its span', () => {
  const source = 'Before **café 😀** after';
  const from = source.indexOf('café'), to = source.indexOf('** after');
  const change = colorSelection(source, from, to, '#aabbcc'), result = apply(source, change);
  assert.equal(result, 'Before **<span style="color: #aabbcc">café 😀</span>** after');
  assert.equal(result.slice(change.anchor, change.head), 'café 😀');
  const again = colorSelection(result, change.anchor, change.head, '#112233');
  assert.equal(apply(result, again), result.replace('#aabbcc', '#112233'));
  assert.equal(textColorSpans(apply(result, again)).length, 1);
  assert.throws(() => colorSelection(source, from, to, 'red;display:none'));
  assert.equal(colorSelection(source, from, from, '#112233'), null);
});
test('multiline colours preserve headings, list markers, blank lines and existing colour boundaries', () => {
  const source = '# Heading\n\n- First\n- Second';
  const result = apply(source, colorSelection(source, 0, source.length, '#112233'));
  assert.match(result, /^# <span/); assert.match(result, /\n\n- <span/); assert.match(result, /\n- <span/);
  assert.equal((marked(result).match(/<li>/g) || []).length, 2);
  const old = '<span style="color: #112233">one</span> and <span style="color: #223344">two</span>';
  const edit = colorSelection(old, old.indexOf('one'), old.indexOf('two') + 3, '#ff0000');
  const ranges = textColorSpans(apply(old, edit));
  assert.equal(ranges.filter(r => r.color === '#ff0000').length, 3);
});
test('colouring across a document preserves protected code and component Markdown', () => {
  const source = 'Text\n\n```js\nlet x = 1;\n```\n\n| A | B |\n| - | - |\n| C | D |\n\nLast';
  const from = source.indexOf('```'), to = source.indexOf('\n\nLast');
  const result = apply(source, colorSelection(source, 0, source.length, '#123456', [[from, to]]));
  assert.ok(result.includes(source.slice(from, to)));
  assert.match(result, /^<span[^>]+>Text<\/span>/); assert.match(result, /<span[^>]+>Last<\/span>$/);
  assert.equal(colorSelection(source, from, to, '#123456', [[from, to]]), null);
});
test('nested colour spans have accurate ranges and unrelated CSS is never recognised', () => {
  const source = '<span style="color: #123456">outer <span style="color: #ABC">inner</span> end</span>';
  const spans = textColorSpans(source);
  assert.deepEqual(spans.map(s => s.color), ['#123456', '#aabbcc']);
  assert.equal(source.slice(spans[1].contentFrom, spans[1].contentTo), 'inner');
  assert.deepEqual(textColorSpans('<span style="color:#123456;position:fixed">bad</span>'), []);
});
test('the Markdown colour extension renders safe data attributes and parses nested Markdown', () => {
  const parser = new Marked({ extensions: [textColorExtension] });
  const html = parser.parse('<span style="color: #123456">**Bold** and <span style="color: #ff0000">red</span></span>');
  assert.match(html, /data-document-color="#123456"/); assert.match(html, /<strong>Bold<\/strong>/); assert.match(html, /data-document-color="#ff0000"/);
  assert.match(parser.parse('`<span style="color:#123456">code</span>`'), /&lt;span/);
});
test('inline formatting toggles an existing selected mark without nesting delimiters', () => {
  assert.equal(apply('word', inlineWrapChange('word', 0, 4, '**', '**')), '**word**');
  assert.equal(apply('**word**', inlineWrapChange('**word**', 2, 6, '**', '**')), 'word');
  assert.equal(apply('**word**', inlineWrapChange('**word**', 0, 8, '**', '**')), 'word');
  assert.equal(apply('**word**', inlineWrapChange('**word**', 2, 6, '*', '*')), '***word***');
  assert.equal(apply('***word***', inlineWrapChange('***word***', 3, 7, '*', '*')), '**word**');
  assert.equal(apply('***word***', inlineWrapChange('***word***', 3, 7, '**', '**')), '*word*');
  assert.equal(apply('**x', inlineWrapChange('**x', 0, 3, '**', '**')), '****x**');
  assert.equal(apply('x**', inlineWrapChange('x**', 0, 3, '**', '**')), '**x****');
  assert.equal(apply('**word', inlineWrapChange('**word', 2, 6, '**', '**')), '****word**');
  assert.equal(apply('word**', inlineWrapChange('word**', 0, 4, '**', '**')), '**word****');
  assert.equal(apply('****', inlineWrapChange('****', 0, 4, '**', '**')), '');
});
test('colour selection validates both endpoints and preserves colours at selection boundaries', () => {
  for (const [from, to] of [[0.1, 2], [0, 2.1], [-1, 2], [0, 5], [3, 1]]) assert.throws(() => colorSelection('word', from, to, '#123456'), /Select text/);
  const source = '<span style="color: #111111">one</span> and <span style="color: #222222">two</span>';
  assert.deepEqual(textColorSpans(source).map(s => source.slice(s.contentFrom, s.contentTo)), ['one', 'two']);
  const expected = '<span style="color: #111111"><span style="color: #123456">one</span></span><span style="color: #123456"> and </span><span style="color: #222222"><span style="color: #123456">two</span></span>';
  const change = colorSelection(source, 0, source.length, '#123456'), result = apply(source, change);
  assert.equal(result, expected); assert.ok(result.slice(change.anchor, change.head).endsWith('two'));
  const span = textColorSpans(source)[0];
  assert.equal(colorSelection(source, span.contentFrom, span.contentTo, '#123456', [[span.from, span.to]]), null);
  for (const boundary of [[0, span.contentFrom], [span.contentTo, source.length]]) {
    const edit = colorSelection(source, span.contentFrom, span.contentTo, '#123456', [boundary]);
    assert.equal(apply(source, edit), source.replace('#111111', '#123456'));
  }
  assert.equal(apply(source, colorSelection(source, 0, 4, '#123456', [[20, 30]])), '<span style="color: #123456"><spa</span>' + source.slice(4));
  const callout = '> [!note] Title\n> Text';
  assert.equal(apply(callout, colorSelection(callout, 0, callout.length, '#123456')), '> [!note] <span style="color: #123456">Title</span>\n> <span style="color: #123456">Text</span>');
});
test('colour parsing limits nesting and component conversion preserves only coloured inline nodes', () => {
  const nested = depth => '<span style="color:#123456">'.repeat(depth) + 'text' + '</span>'.repeat(depth);
  const lexer = { lexer: { inlineTokens: source => [{ type: 'text', raw: source, text: source }] } };
  assert.ok(textColorExtension.tokenizer.call(lexer, nested(32)));
  assert.equal(textColorExtension.tokenizer.call(lexer, nested(33)), undefined);
  let rule; installTextColorRule({ addRule: (name, value) => { assert.equal(name, 'documentTextColor'); rule = value; } });
  const span = { nodeName: 'SPAN', style: { color: 'rgb(1, 2, 3)' }, getAttribute: () => null };
  assert.ok(rule.filter(span)); assert.equal(rule.replacement('**word**', span), '<span style="color: #010203">**word**</span>');
  assert.ok(rule.filter({ nodeName: 'FONT', getAttribute: name => name === 'color' ? '#123456' : null }));
  assert.ok(rule.filter({ nodeName: 'SPAN', dataset: { documentColor: '#123456' } }));
  assert.equal(!!rule.filter({ nodeName: 'SPAN' }), false);
  assert.equal(!!rule.filter({ ...span, nodeName: 'DIV' }), false);
});
