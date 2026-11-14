import test from 'node:test';
import assert from 'node:assert/strict';
import { checkboxLineChange, checkboxChanges, checklistMarkdown } from '../public/checklist.js';
import Turndown from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { installRichCheckboxRules } from '../public/rich-checklist.js';
import { Marked } from 'marked';
const apply = line => { const c = checkboxLineChange(line); return line.slice(0, c.from) + c.insert + line.slice(c.to); };
test('checkbox shortcut adds a task marker without disturbing indentation, bullets or quotes', () => {
  for (const [line, expected] of [['Pack', '- [ ] Pack'], ['', '- [ ] '], ['  - Pack', '  - [ ] Pack'], ['> 1. Pack', '> 1. [ ] Pack'], ['* Pack', '* [ ] Pack']]) assert.equal(apply(line), expected);
});
test('checkbox shortcut only changes the completion marker in existing tasks', () => {
  for (const [line, expected] of [['- [ ] Pack', '- [x] Pack'], ['  + [X] **Pack**', '  + [ ] **Pack**'], ['> - [x] ', '> - [ ] ']]) assert.equal(apply(line), expected);
});
test('a selection ending at the next line start leaves that next line untouched', () => {
  assert.deepEqual(checkboxChanges('Pack\nBring keys\nLeave this', 0, 16), [
    { from: 0, to: 0, insert: '- [ ] ' }, { from: 5, to: 5, insert: '- [ ] ' },
  ]);
});
test('rich task markers survive loose paragraphs and browser inline wrappers without duplicate spaces', () => {
  const converter = new Turndown({ bulletListMarker: '-' }); converter.use(gfm); installRichCheckboxRules(converter);
  for (const content of ['<input type="checkbox" checked> Make bags', '<p><input type="checkbox" checked> Make bags</p>', '<span><input type="checkbox" checked>\u00a0Make bags</span>']) {
    assert.match(converter.turndown(`<ul><li>${content}</li></ul>`), /^-\s+\[x\] Make bags$/);
  }
});

test('whitespace wrapped after a checkbox saves as a Markdown task, even across inline ancestors', () => {
  const converter = new Turndown({ bulletListMarker: '-' }); converter.use(gfm); installRichCheckboxRules(converter);
  for (const content of [
    '<input type="checkbox"><span>\u00a0Pack</span>',
    '<span><input type="checkbox"></span><span>\u00a0</span><strong>Pack</strong>',
    '<p><span><input type="checkbox"> </span><em>\u00a0Pack</em></p>',
  ]) {
    const saved = converter.turndown(`<ul><li>${content}</li></ul>`);
    assert.match(new Marked().parse(saved), /type="checkbox"/, saved);
    assert.doesNotMatch(saved, /\u00a0/);
  }
});

test('Markdown checklists accept browser spaces and empty items without interpreting escaped examples or code', () => {
  const parser = new Marked({ gfm: true }); parser.use(checklistMarkdown);
  for (const body of ['- [ ] \u00a0Pack', '- [\u00a0]\u00a0Pack', '- [x]\tPack', '- [ ]', '- [X] ', '- [ ] \u00a0**Pack**\n  - Child', '> - [ ]\u00a0Pack', '- [ ] \u00a0Pack\n\n- Ordinary']) {
    const html = parser.parse(body);
    assert.equal((html.match(/type="checkbox"/g) || []).length, 1, body);
    if (/\[[xX]\]/.test(body)) assert.match(html, /checked/);
  }
  for (const body of ['- \\[ \\] Example', '- `[ ]` Code', '    - [ ]\u00a0Code', '```\n- [ ]\u00a0Code\n```', 'Prose [ ]\u00a0text', '- [ ]word'])
    assert.doesNotMatch(parser.parse(body), /type="checkbox"/, body);
});
