import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closePopup, finishPopupExits } from '../public/popup-motion.js';

function panel({ reduced = false, connected = true } = {}) {
  const attributes = new Map();
  let resolve;
  const finished = new Promise(r => { resolve = r; });
  return { isConnected: connected, inert: false, hidden: false,
    ownerDocument: { defaultView: { matchMedia: () => ({ matches: reduced }) } },
    getAttribute: key => attributes.get(key) ?? null,
    setAttribute: (key, value) => attributes.set(key, value),
    removeAttribute: key => attributes.delete(key),
    hasAttribute: key => attributes.has(key),
    getAnimations: () => [{ finished }], resolve,
  };
}
test('a popup stays mounted but inert until its exit ends, with cleanup exactly once', async () => {
  const element = panel(); let closed = 0;
  closePopup(element, () => { closed++; });
  closePopup(element, () => { closed += 10; });
  assert.equal(closed, 0); assert.equal(element.inert, true);
  assert.equal(element.getAttribute('aria-hidden'), 'true');
  element.resolve();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(closed, 1); assert.equal(element.inert, false);
  assert.equal(element.hasAttribute('data-popup-closing'), false);
  finishPopupExits(); assert.equal(closed, 1);
});
test('a replacement finishes pending exits synchronously and preserves existing accessibility state', () => {
  const element = panel(); element.inert = true; element.setAttribute('aria-hidden', 'false');
  let closed = 0;
  closePopup(element, () => closed++);
  finishPopupExits();
  assert.equal(closed, 1); assert.equal(element.inert, true);
  assert.equal(element.getAttribute('aria-hidden'), 'false');
});
test('reduced motion, hidden or detached popups close immediately', () => {
  for (const element of [panel({ reduced: true }), panel({ connected: false }), Object.assign(panel(), { hidden: true })]) {
    let closed = false; closePopup(element, () => { closed = true; }); assert.equal(closed, true);
  }
});
