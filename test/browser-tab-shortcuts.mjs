import assert from 'node:assert/strict';

// Headless browsers do not switch browser tabs with keyboard.press. Check that
// the app leaves the native event uncancelled and does not move focus instead.
export async function browserTabShortcuts(target) {
  await target.focus();
  const results = await target.evaluate(el => {
    const focus = document.activeElement;
    return [false, true].flatMap(shiftKey => ['ctrlKey', 'metaKey', 'altKey'].map(modifier => {
      const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true, shiftKey, [modifier]: true });
      el.dispatchEvent(event);
      return { prevented: event.defaultPrevented, keptFocus: document.activeElement === focus };
    }));
  });
  assert.ok(results.every(result => !result.prevented && result.keptFocus), JSON.stringify(results));
}
