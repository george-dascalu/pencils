// Opening a view should not summon the software keyboard on touch devices.
// Direct taps, keyboard navigation and restoration during an edit stay native.
export const allowsTextAutofocus = () => !matchMedia("(pointer: coarse)").matches;

export function focusOnOpen(preferred, fallback) {
  const text = preferred?.isContentEditable || preferred?.matches("textarea, input:not([type=button], [type=submit], [type=reset], [type=checkbox], [type=radio], [type=range], [type=color], [type=file], [type=hidden])");
  const target = text && !allowsTextAutofocus() && document.activeElement !== preferred ? fallback : preferred;
  target?.focus({ preventScroll: true });
  return !!target && target === preferred;
}

export function prepareDialogFocus(dialog) {
  if (allowsTextAutofocus()) return;
  // Run before show()/showModal(): native dialog autofocus happens immediately.
  for (const field of dialog.querySelectorAll("[autofocus]")) field.removeAttribute("autofocus");
  (dialog.querySelector('[data-action="dialog-close"]') || dialog.querySelector('button:not(:disabled)'))?.setAttribute("autofocus", "");
}
