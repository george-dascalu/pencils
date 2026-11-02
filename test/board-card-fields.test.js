import test from 'node:test';
import assert from 'node:assert/strict';
import { boardCardVisible, validBoardCardFields, boardCardCustomFields, DEFAULT_CARD_FIELDS_HIDDEN, BOARD_CARD_FIELDS, boardCardFieldsHTML, readBoardCardFields } from '../public/board-card-fields.js';
import { boardsMethods } from '../server/services/boards.js';

test('board card details default to existing fields and respect project fields turned off', () => {
  assert.equal(boardCardVisible({}, {}, 'title'), true);
  assert.equal(boardCardVisible({}, {}, 'estimate'), false);
  const board = { settings: { card_fields: { hidden: ['id', 'title', 'status'], custom: ['cost'] } } };
  assert.equal(boardCardVisible(board, {}, 'title'), false);
  assert.equal(boardCardVisible(board, {}, 'assignee'), true);
  assert.equal(boardCardVisible(board, { off: ['assignee'] }, 'assignee'), false);
  assert.deepEqual(boardCardCustomFields(board, { fields: [{ id: 'cost', name: 'Cost', type: 'number' }, { id: 'other' }] }), [{ id: 'cost', name: 'Cost', type: 'number' }]);
  assert.deepEqual(DEFAULT_CARD_FIELDS_HIDDEN, ['estimate', 'tags']);
});
test('invalid card display settings fail board validation rather than being stored', () => {
  assert.equal(validBoardCardFields({ hidden: ['id', 'start'], custom: ['cost'] }), true);
  assert.equal(validBoardCardFields({ hidden: BOARD_CARD_FIELDS.map(([key]) => key), custom: Array.from({ length: 200 }, (_, i) => `field_${i}`) }), true);
  for (const bad of [null, [], { hidden: ['unknown'], custom: [] }, { hidden: ['id', 'id'], custom: [] }, { hidden: [], custom: ['../private'] }, { hidden: [], custom: [2] }, { hidden: [], custom: Array(201).fill('a') }]) {
    assert.equal(validBoardCardFields(bad), false, JSON.stringify(bad));
    assert.throws(() => boardsMethods.validateBoard({ title: 'Invalid settings', settings: { card_fields: bad } }), /Invalid card display settings/);
  }
});

test('the appearance controls distinguish built-in and custom fields and reflect saved choices', () => {
  const config = { off: ['priority'], fields: [{ id: 'cost', name: 'Cost', type: 'number' }] };
  const defaultHTML = boardCardFieldsHTML({}, config, String);
  assert.match(defaultHTML, /data-board-card-field="title"[^>]*checked/);
  assert.doesNotMatch(defaultHTML, /data-board-card-field="estimate"[^>]*checked/);
  assert.doesNotMatch(defaultHTML, /data-board-card-field="priority"/);
  assert.match(defaultHTML, /data-board-card-custom="cost"/);
  assert.doesNotMatch(defaultHTML, /data-board-card-custom="cost"[^>]*checked/);
  const saved = boardCardFieldsHTML({ settings: { card_fields: { hidden: ['title'], custom: ['cost'] } } }, config, String);
  assert.doesNotMatch(saved, /data-board-card-field="title"[^>]*checked/);
  assert.match(saved, /data-board-card-custom="cost"[^>]*checked/);
});
test('saving appearance applies both checkbox changes and preserves choices missing from the panel', () => {
  const form = { querySelectorAll: selector => selector === '[data-board-card-field]' ? [
    { dataset: { boardCardField: 'title' }, checked: true },
    { dataset: { boardCardField: 'status' }, checked: false },
  ] : [{ dataset: { boardCardCustom: 'cost' } }] };
  assert.deepEqual(readBoardCardFields(form, { hidden: ['title', 'priority'], custom: [] }), { hidden: ['priority', 'status'], custom: ['cost'] });
  assert.deepEqual(readBoardCardFields(form), { hidden: ['estimate', 'tags', 'status'], custom: ['cost'] });
});
