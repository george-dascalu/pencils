import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeZoom, stepZoom, ZOOM_STEPS } from '../desktop/zoom.js';

test('desktop zoom restores valid sizes and keeps corrupted preferences usable', () => {
  for (const value of [undefined, null, 'large', '1.5', NaN, Infinity]) assert.equal(normalizeZoom(value), 1);
  assert.equal(normalizeZoom(1.25), 1.25);
  assert.equal(normalizeZoom(0), 0.5);
  assert.equal(normalizeZoom(10), 3);
});

test('desktop zoom moves one readable step, clamps at each end and resets to actual size', () => {
  for (let index = 0; index < ZOOM_STEPS.length; index++) {
    const value = ZOOM_STEPS[index];
    assert.equal(stepZoom(value, 'in'), ZOOM_STEPS[Math.min(index + 1, ZOOM_STEPS.length - 1)]);
    assert.equal(stepZoom(value, 'out'), ZOOM_STEPS[Math.max(0, index - 1)]);
    assert.equal(stepZoom(value, 'reset'), 1);
  }
  assert.equal(stepZoom(1.03, 'in'), 1.1);
  assert.equal(stepZoom(1.03, 'out'), 1);
  assert.equal(stepZoom(1.1 - 0.001, 'in'), 1.25);
  assert.equal(stepZoom(1.1 + 0.001, 'out'), 1);
  assert.equal(stepZoom(1.25, 'unknown'), 1.25);
});
