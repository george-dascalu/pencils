import test from 'node:test';
import assert from 'node:assert/strict';
import { checkboxLineChange, checkboxChanges } from '../public/checklist.js';
import Turndown from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { richCheckboxRule } from '../public/rich-checklist.js';
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
  const converter = new Turndown({ bulletListMarker: '-' }); converter.use(gfm); converter.addRule('checklistItem', richCheckboxRule);
  for (const content of ['<input type="checkbox" checked> Make bags', '<p><input type="checkbox" checked> Make bags</p>', '<span><input type="checkbox" checked>\u00a0Make bags</span>']) {
    assert.match(converter.turndown(`<ul><li>${content}</li></ul>`), /^-\s+\[x\] Make bags$/);
  }
});
