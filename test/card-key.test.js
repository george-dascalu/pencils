import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cardKeyNumber, fitCardKey} from '../public/card-key.js';
// F0.21-80: a card ID that would be cut short shows only its number.
test('card keys keep the project key while they fit, else only the number', () => {
  const measure = s => Array.from(s).length * 10;
  assert.equal(fitCardKey('TEST-12', 70, measure), 'TEST-12');
  assert.equal(fitCardKey('TEST-12', 69, measure), '12');
  assert.equal(fitCardKey('TEST-12', 5, measure), '12', 'the number stays, cut by CSS if it must');
  assert.equal(cardKeyNumber('MY-TEAM-7'), '7');
  assert.equal(cardKeyNumber('t-3f9a2c'), 't-3f9a2c', 'an ID without a number keeps itself');
  assert.equal(cardKeyNumber(''), '');
});
