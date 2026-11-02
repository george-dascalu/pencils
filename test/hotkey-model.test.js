import test from 'node:test';
import assert from 'node:assert/strict';
import { hotkeyChord, hotkeyIssue, hotkeyTarget } from '../public/hotkey-model.js';
test('hotkeys use Ctrl or Cmd, reject browser/editor keys and ignore composition', () => {
  assert.equal(hotkeyChord({ key: 'H', ctrlKey: true, altKey: true, shiftKey: true }), 'Mod+Alt+Shift+H');
  assert.equal(hotkeyChord({ key: 'h', metaKey: true, altKey: true }), 'Mod+Alt+H');
  assert.equal(hotkeyChord({ key: '∂', code: 'KeyD', metaKey: true, altKey: true }), 'Mod+Alt+D');
  for (const e of [{ key: 'n' }, { key: 'h', ctrlKey: true, isComposing: true }, { key: 'h', ctrlKey: true, altKey: true, getModifierState: () => true }]) assert.equal(hotkeyChord(e), '');
  for (const chord of ['Mod+Tab', 'Mod+K', 'Mod+Shift+K', 'Mod+W', 'Mod+Shift+T', 'Mod+C', 'Mod+Alt+ArrowLeft', 'N', 'Mod+Alt+Shift+', null]) assert.ok(hotkeyIssue(chord), String(chord));
  for (const chord of ['Mod+Alt+H', 'Mod+Alt+Shift+J', 'Mod+Alt+1']) assert.equal(hotkeyIssue(chord), '');
});

test('shortcut identities keep commands, projects and record kinds separate', () => {
  assert.equal(hotkeyTarget({ type: 'command', id: 'new-task' }), 'command:new-task');
  assert.equal(hotkeyTarget({ type: 'item', kind: 'doc', project: 'p-one', id: 'doc-one' }), 'doc:p-one:doc-one');
  assert.notEqual(hotkeyTarget({ type: 'item', kind: 'doc', project: 'p-one', id: 'same' }), hotkeyTarget({ type: 'item', kind: 'doc', project: 'p-two', id: 'same' }));
});
