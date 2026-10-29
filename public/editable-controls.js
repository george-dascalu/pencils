// iOS Safari does not focus a tapped button: it moves focus to the nearest
// focusable ancestor. A button or toggle inside an editable area (a document
// block's Add row, Fit width or Scroll) therefore focused the editor and opened
// the keyboard. Cancelling mousedown on such controls keeps focus and the
// selection where they are; the click still runs. Desktop browsers behave the
// same way, so focus no longer jumps into the editor there either.
const CONTROL = 'button, summary, [role="button"], input[type="checkbox"], input[type="radio"], a[data-document-ref]';
const EDITABLE = '[contenteditable="true"], [contenteditable="plaintext-only"]';

export function installEditableControlGuard(target = document) {
  const guard = event => {
    const control = event.target.closest?.(CONTROL);
    if (!control || control.isContentEditable) return;
    if (control.parentElement?.closest(EDITABLE)) event.preventDefault();
  };
  target.addEventListener("mousedown", guard, true);
  return () => target.removeEventListener("mousedown", guard, true);
}
