// Keep the real popup mounted through its short exit. Owners capture edits before calling this
// and dispose editors afterwards. A new popup finishes old exits first, avoiding stale cleanup.
const exits = new Map();
export function finishPopupExits() {
  for (const finish of [...exits.values()]) finish();
}
export function closePopup(element, dispose) {
  if (exits.has(element)) return;
  const view = element?.ownerDocument?.defaultView;
  if (!element?.isConnected || element.hidden || !view || view.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    dispose();
    return;
  }
  const inert = element.inert, hidden = element.getAttribute('aria-hidden');
  let timer, finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    exits.delete(element);
    element.removeAttribute('data-popup-closing');
    element.inert = inert;
    if (hidden === null) element.removeAttribute('aria-hidden');
    else element.setAttribute('aria-hidden', hidden);
    dispose();
  };
  exits.set(element, finish);
  element.inert = true;
  element.setAttribute('aria-hidden', 'true');
  element.setAttribute('data-popup-closing', '');
  // getAnimations flushes the style change, including a reversed entrance transition.
  const animations = element.getAnimations();
  if (!animations.length) return finish();
  timer = setTimeout(finish, 300);
  Promise.allSettled(animations.map(animation => animation.finished)).then(finish);
}
