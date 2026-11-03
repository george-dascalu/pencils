import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {Store} from '../server/store.js';
import {createServer} from '../server/index.js';
import {Auth} from '../server/auth.js';
import {validTaskNotes} from '../public/task-note-model.js';
import {draftTaskFields, validDraftTask} from '../public/draft-task.js';
import {taskChanges, taskHistoryHTML} from '../public/task-history.js';

const note = (id = 'n-one', body = '**Remember**\n\n- [ ] Read this\n\n[Evidence](../attachments/a-1234.txt)') => ({id, body});
async function fixture(t) {
  const root = await fs.mkdtemp('/tmp/pencils-task-notes-'), store = new Store(root);
  await store.init(); const project = await store.createProject({title: 'Card notes'});
  t.after(async () => { await store.close(); await fs.rm(root, {recursive: true, force: true}); });
  return {root, store, project};
}
test('notes accept empty text and portable rich Markdown, with bounded unique IDs, count and total content', () => {
  assert.equal(validTaskNotes([Object.assign([], note())]), false);
  assert.equal(validTaskNotes([Object.assign(() => {}, note())]), false);
  for (const value of [undefined, null, [], [note()], [note('n-empty', '')], Array.from({length: 200}, (_, i) => note(`n-${i}`, '')),
    Array.from({length: 5}, (_, i) => note(`n-${i}`, 'x'.repeat(200000)))]) assert.equal(validTaskNotes(value), true);
  for (const value of [false, {}, 'text', [null], [[]], [note('wrong')], [note('n-../bad')], [note('n-' + 'x'.repeat(80))],
    [{id: 'n-one', body: 3}], [note(), note()], [note('n-long', 'x'.repeat(200001))],
    Array.from({length: 201}, (_, i) => note(`n-${i}`, '')), Array.from({length: 6}, (_, i) => note(`n-${i}`, 'x'.repeat(200000)))])
    assert.equal(validTaskNotes(value), false, JSON.stringify(value).slice(0, 100));
});
test('notes stay in card Markdown across updates, copying, restart and history restore', async t => {
  const {root, store, project} = await fixture(t), notes = [note(), note('n-two', '# Second note')];
  let card = await store.createTask(project.id, {title: 'Notes', body: 'Description stays separate', notes});
  assert.deepEqual(card.notes, notes);
  const first = card.revision;
  assert.match(await fs.readFile(path.join(root, card.file), 'utf8'), /notes:\n/);
  card = await store.updateTask(project.id, card.id, {revision: card.revision, title: 'Edited'});
  assert.deepEqual(card.notes, notes); assert.equal(card.body, 'Description stays separate');
  const copy = await store.createTask(project.id, {...card, title: 'Copy'}); assert.deepEqual(copy.notes, notes);
  const restarted = new Store(root); await restarted.init(); t.after(() => restarted.close());
  assert.deepEqual((await restarted.snapshot(project.id)).tasks.find(v => v.id === card.id).notes, notes);
  card = await store.updateTask(project.id, card.id, {revision: card.revision, notes: [note('n-two', 'Revised')]});
  assert.deepEqual(card.notes, [note('n-two', 'Revised')]);
  card = await store.updateTask(project.id, card.id, {revision: card.revision, notes: []});
  const restored = await store.restoreVersion(card.file, first, card.revision); assert.deepEqual(restored.notes, notes);
});
test('the card API validates notes atomically and protects concurrent edits by revision', async t => {
  const {store, project} = await fixture(t), server = createServer(store, {auth: new Auth(store, false)});
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(async () => { server.closeAllConnections(); await new Promise(r => server.close(r)); });
  const url = `http://127.0.0.1:${server.address().port}/api/projects/${project.id}/tasks`;
  const request = (url, method, body) => fetch(url, {method, headers: {'content-type': 'application/json'}, body: JSON.stringify(body)});
  let response = await request(url, 'POST', {title: 'API notes', notes: [note()]}); assert.equal(response.status, 201);
  const card = await response.json(); assert.deepEqual(card.notes, [note()]);
  for (const notes of ['wrong', [note(), note()], [{id: 'n-bad', body: null}]]) {
    response = await request(url + '/' + card.id, 'PATCH', {revision: card.revision, title: 'Must not change', notes});
    assert.equal(response.status, 400);
  }
  assert.equal((await store.read(store.file(project.id, 'tasks', card.id))).data.title, 'API notes');
  response = await request(url + '/' + card.id, 'PATCH', {revision: card.revision, notes: []}); assert.equal(response.status, 200);
  response = await request(url + '/' + card.id, 'PATCH', {revision: card.revision, notes: [note()]}); assert.equal(response.status, 409);
});
test('board drafts retain a deep copy of notes and validate them before finalising', () => {
  const data = {title: 'Draft', notes: [note()]}, draft = draftTaskFields(data);
  assert.deepEqual(draft.notes, data.notes); draft.notes[0].body = 'Changed'; assert.notEqual(data.notes[0].body, 'Changed');
  assert.equal(validDraftTask({draft}), true);
  assert.equal(validDraftTask({draft: {...draft, notes: [{id: 'bad', body: ''}]}}), false);
});
test('history identifies each added, edited or deleted note and shows its content before and after', () => {
  const before = {notes: [note('n-one', 'Before'), note('n-two', 'Removed')]}, after = {notes: [note('n-one', 'After'), note('n-three', 'Added')]};
  const changes = taskChanges(before, after).filter(c => c.key === 'note');
  assert.equal(changes.length, 3); assert.ok(changes.some(c => c.before === 'Before' && c.after === 'After'));
  assert.ok(changes.some(c => c.before === 'Removed' && c.after == null)); assert.ok(changes.some(c => c.after === 'Added' && c.before == null));
  const html = taskHistoryHTML([{revision: 'old', data: before}], {revision: 'new', ...after}, {esc: String, icon: () => '', state: {}, label: String, task: () => null});
  assert.match(html, /Note/); assert.match(html, /Before/); assert.match(html, /After/); assert.doesNotMatch(html, /\[object Object\]/);
});
