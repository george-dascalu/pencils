import test from 'node:test';
import assert from 'node:assert/strict';
import { saveIssue, saveState } from '../public/save-state.js';

test('save warnings distinguish storage, conflict, offline, validation and retryable failures', () => {
  assert.equal(saveIssue([]), null);
  assert.equal(saveIssue([{ running: true }]), null);
  assert.match(saveIssue([], { online: false }).action, /network/);
  assert.match(saveIssue([{ error: 'offline' }], { online: false }).cause, /kept in this browser/);
  const storage = saveIssue([{ conflict: {} }], { storageError: true, online: false });
  assert.match(storage.cause, /may only be in this tab/);
  assert.doesNotMatch(storage.cause, /kept in this browser/);
  assert.match(saveIssue([{ conflict: {} }]).action, /compare/);
  assert.match(saveIssue([{ error: 'Invalid data', blocked: true }]).action, /Correct the issue/);
  assert.match(saveIssue([{ error: 'Invalid data', blocked: true }]).action, /Retry save/);
  assert.match(saveIssue([{ error: 'Temporary error' }]).action, /automatically/);
  assert.match(saveIssue([{ error: 'A board supports up to 500 frames.', packedBoard: true }]).cause, /more than 500 frames/);
});

test('save labels explain where edits remain and what conflict action is needed', () => {
  assert.equal(saveState([], { storageError: true }), 'Browser draft storage unavailable — keep this tab open');
  assert.equal(saveState([{ conflict: {} }]), 'Edits need review — open Recovery & backups');
});
